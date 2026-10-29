-- =====================================================================
-- Delete buttons
-- Already included in setup.sql. Only run this file if you ran an OLDER
-- setup.sql before (Supabase > SQL Editor > New query > paste > Run).
-- Safe to run more than once.
--
-- Rule: anything NOT yet in the books can be deleted. Anything already
-- posted can only be voided (reversed), so the audit trail stays complete.
-- Every delete is written to the Activity log.
-- =====================================================================

-- Pending, returned or rejected entries (never posted, no journal lines)
create or replace function public.delete_entry(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare e public.entries;
begin
  select * into e from public.entries where id = p_id for update;
  if e.id is null then raise exception 'Entry not found'; end if;
  if e.status not in ('awaiting_division','awaiting_finance','awaiting_organizer','awaiting_verification','returned','rejected') then
    raise exception 'Only pending, returned or rejected entries can be deleted. Posted entries must be voided instead.';
  end if;
  if exists (select 1 from public.journal_lines where entry_id = e.id) then
    raise exception 'This entry is already in the books. Void it instead.';
  end if;
  if not (public.is_finance() or public.is_organizer() or public.is_division_lead(e.division_id)
          or (e.submitted_by is not null and e.submitted_by = auth.uid())) then
    raise exception 'You are not allowed to delete this entry';
  end if;
  perform public.log_act('delete', 'entry', e.ref, to_jsonb(e));
  delete from public.entries where id = e.id;
  return e.receipt_path;
end $$;

-- Remove a wrongly uploaded receipt from an entry that is not posted yet
create or replace function public.remove_receipt(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare e public.entries;
begin
  select * into e from public.entries where id = p_id for update;
  if e.id is null then raise exception 'Entry not found'; end if;
  if e.status not in ('awaiting_division','awaiting_finance','awaiting_organizer','awaiting_verification','returned','rejected') then
    raise exception 'The receipt of a posted entry is part of the records and cannot be removed';
  end if;
  if not (public.is_finance() or public.is_organizer() or public.is_division_lead(e.division_id)
          or (e.submitted_by is not null and e.submitted_by = auth.uid())) then
    raise exception 'You are not allowed to change this entry';
  end if;
  if e.receipt_path is null then return null; end if;
  update public.entries set receipt_path = null, updated_at = now(), updated_by = auth.uid() where id = e.id;
  insert into public.approvals (entry_id, step, action, actor, actor_name, note)
  values (e.id, 'edit', 'receipt removed', auth.uid(), public.actor_name(), null);
  perform public.log_act('remove_receipt', 'entry', e.ref, jsonb_build_object('receipt_path', e.receipt_path));
  return e.receipt_path;
end $$;

-- Divisions that were never used
create or replace function public.delete_division(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d public.divisions;
begin
  if not public.is_staff() then raise exception 'Please log in'; end if;
  select * into d from public.divisions where id = p_id;
  if d.id is null then raise exception 'Division not found'; end if;
  if exists (select 1 from public.entries where division_id = p_id)
     or exists (select 1 from public.journal_lines where division_id = p_id) then
    raise exception 'This division already has transactions. Archive it instead.';
  end if;
  update public.profiles set division_id = null where division_id = p_id;
  delete from public.budgets where division_id = p_id;
  perform public.log_act('delete', 'division', d.name, to_jsonb(d));
  delete from public.divisions where id = p_id;
end $$;

-- Categories that were never used (and their empty account)
create or replace function public.delete_category(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c public.categories; a public.accounts;
begin
  if not public.is_staff() then raise exception 'Please log in'; end if;
  select * into c from public.categories where id = p_id;
  if c.id is null then raise exception 'Category not found'; end if;
  select * into a from public.accounts where id = c.account_id;
  if a.system_key is not null then raise exception 'This is a built-in category and cannot be deleted. Archive it instead.'; end if;
  if exists (select 1 from public.entries where category_id = p_id)
     or exists (select 1 from public.journal_lines where category_id = p_id or account_id = c.account_id) then
    raise exception 'This category already has transactions. Archive it instead.';
  end if;
  delete from public.budgets where category_id = p_id;
  perform public.log_act('delete', 'category', c.name, to_jsonb(c));
  delete from public.categories where id = p_id;
  if a.id is not null and not exists (select 1 from public.categories where account_id = a.id) then
    delete from public.accounts where id = a.id;
  end if;
end $$;

-- Sponsors with no transactions yet
create or replace function public.delete_sponsor(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.sponsors;
begin
  if not (public.is_finance() or public.is_organizer()) then raise exception 'Only the finance team or the Organizer can delete sponsors'; end if;
  select * into s from public.sponsors where id = p_id;
  if s.id is null then raise exception 'Sponsor not found'; end if;
  if exists (select 1 from public.entries where sponsor_id = p_id) then
    raise exception 'This sponsor already has invoices or payments. Set the status to Lost instead.';
  end if;
  perform public.log_act('delete', 'sponsor', s.name, to_jsonb(s));
  delete from public.sponsors where id = p_id;
end $$;

-- Money accounts that were never used
create or replace function public.delete_account(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.accounts;
begin
  if not public.is_fin_admin() then raise exception 'Only the Head of Finance can delete accounts'; end if;
  select * into a from public.accounts where id = p_id;
  if a.id is null then raise exception 'Account not found'; end if;
  if a.system_key is not null or not a.is_cash then raise exception 'Only money accounts you added can be deleted'; end if;
  if exists (select 1 from public.journal_lines where account_id = p_id)
     or exists (select 1 from public.entries where account_id = p_id or to_account_id = p_id)
     or exists (select 1 from public.reconciliations where account_id = p_id) then
    raise exception 'This account already has transactions. Archive it instead.';
  end if;
  perform public.log_act('delete', 'account', a.name, to_jsonb(a));
  delete from public.accounts where id = p_id;
end $$;

-- A reconciliation check entered by mistake (it is only a check, not bookkeeping)
create or replace function public.delete_reconciliation(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r public.reconciliations;
begin
  if not public.is_fin_admin() then raise exception 'Only the Head of Finance can delete reconciliations'; end if;
  select * into r from public.reconciliations where id = p_id;
  if r.id is null then raise exception 'Reconciliation not found'; end if;
  perform public.log_act('delete', 'reconciliation', r.id::text, to_jsonb(r));
  delete from public.reconciliations where id = p_id;
end $$;

revoke execute on function public.delete_entry(uuid), public.remove_receipt(uuid), public.delete_division(uuid),
  public.delete_category(uuid), public.delete_sponsor(uuid), public.delete_account(uuid), public.delete_reconciliation(bigint) from anon, public;
grant execute on function public.delete_entry(uuid), public.remove_receipt(uuid), public.delete_division(uuid),
  public.delete_category(uuid), public.delete_sponsor(uuid), public.delete_account(uuid), public.delete_reconciliation(bigint) to authenticated;

-- The team can delete receipt files (only used after the checks above)
drop policy if exists "team deletes receipts" on storage.objects;
create policy "team deletes receipts" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.is_staff());

select 'Delete update installed' as status;
