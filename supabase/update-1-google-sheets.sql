-- =====================================================================
-- Financial report pack + Google Sheets sync
-- Already included in setup.sql. Only run this file if you ran an OLDER
-- setup.sql before (Supabase > SQL Editor > New query > paste > Run).
-- =====================================================================

create table if not exists public.export_keys (
  id bigserial primary key,
  key_hash bytea not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.export_keys enable row level security;   -- no policies: never readable from the browser
revoke all on public.export_keys from anon, authenticated;

-- Head of Finance creates a secret key for the Google Sheet. Shown once; only its hash is stored.
create or replace function public.create_export_key() returns text
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if not public.is_fin_admin() then raise exception 'Only the Head of Finance can create a Google Sheets key'; end if;
  k := 'gsk_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  delete from public.export_keys;
  insert into public.export_keys (key_hash, created_by) values (sha256(convert_to(k, 'UTF8')), auth.uid());
  perform public.log_act('create_export_key', 'export', null, null);
  return k;
end $$;

create or replace function public.revoke_export_keys() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_fin_admin() then raise exception 'Only the Head of Finance can do this'; end if;
  delete from public.export_keys;
  perform public.log_act('revoke_export_keys', 'export', null, null);
end $$;

create or replace function public.export_key_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_staff() then
    jsonb_build_object('exists', exists (select 1 from public.export_keys),
                       'created_at', (select max(created_at) from public.export_keys))
  else null end
$$;

-- Everything the report pack needs, already shaped as rows.
-- Allowed for logged-in team members, or with a valid Google Sheets key.
create or replace function public.report_data(p_key text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.settings := public.cfg(); v_fy int := public.fy_of(current_date); res jsonb;
begin
  if not public.is_staff() then
    if p_key is null or not exists (select 1 from public.export_keys where key_hash = sha256(convert_to(p_key, 'UTF8'))) then
      raise exception 'Not allowed: log in, or use a valid Google Sheets key';
    end if;
  end if;

  with
  lbl as (
    select e.*,
      case e.status
        when 'awaiting_division' then 'Pending · division' when 'awaiting_finance' then 'Pending · finance'
        when 'awaiting_organizer' then 'Pending · organizer' when 'awaiting_verification' then 'Pending · verification'
        when 'approved' then 'Approved · unpaid' when 'paid' then 'Paid' when 'posted' then 'Posted'
        when 'returned' then 'Returned' when 'rejected' then 'Rejected' else 'Void' end as status_label,
      case e.type when 'expense' then 'Expense' when 'income' then 'Income' when 'transfer' then 'Transfer'
        when 'advance' then 'Cash advance' when 'advance_return' then 'Advance returned'
        when 'sponsor_invoice' then 'Sponsor invoice' else 'Opening balance' end as type_label
    from public.entries e
  ),
  appr as (
    select a.entry_id, a.step,
           (array_agg(coalesce(a.actor_name,'') || ' · ' || to_char(a.at at time zone 'Asia/Hong_Kong', 'YYYY-MM-DD') order by a.id desc))[1] as who
    from public.approvals a where a.action in ('approve','verify')
    group by a.entry_id, a.step
  ),
  sp as (
    select sp.*,
      coalesce((select sum(amount) from public.entries x where x.sponsor_id = sp.id and x.type='sponsor_invoice' and x.status='posted'),0) as invoiced,
      coalesce((select sum(amount) from public.entries x where x.sponsor_id = sp.id and x.type='income' and x.status='posted' and not x.in_kind),0) as cash,
      coalesce((select sum(amount) from public.entries x where x.sponsor_id = sp.id and x.type='income' and x.status='posted' and x.in_kind),0) as inkind,
      coalesce((select sum(amount) from public.entries x where x.sponsor_id = sp.id and x.type='income' and x.status='posted' and x.settles_receivable),0) as settled
    from public.sponsors sp
  )
  select jsonb_build_object(
    'org_name', s.org_name,
    'fy_start_month', s.fy_start_month,
    'current_fy', v_fy,
    'fy_start', public.fy_start(v_fy),
    'fy_end', public.fy_end(v_fy),
    'today', (now() at time zone 'Asia/Hong_Kong')::date,
    'generated_at', to_char(now() at time zone 'Asia/Hong_Kong', 'YYYY-MM-DD HH24:MI') || ' HKT',
    'receipt_required_above', round(s.receipt_required_above / 100.0, 2),

    'accounts', coalesce((select jsonb_agg(jsonb_build_array(a.code, a.name, a.type, a.is_cash,
                 case when a.type in ('asset','expense') then 'Debit' else 'Credit' end, a.archived, coalesce(a.system_key,'')) order by a.code)
               from public.accounts a), '[]'),

    'journal', coalesce((select jsonb_agg(jsonb_build_array(
                 l.line_date, e.ref, e.type_label, coalesce(nullif(l.memo,''), e.title), a.code, a.name, a.type,
                 round(l.debit / 100.0, 2), round(l.credit / 100.0, 2), coalesce(d.name,''), coalesce(c.name,''), coalesce(spn.name,'')) order by l.line_date, l.id)
               from public.journal_lines l join public.accounts a on a.id = l.account_id join lbl e on e.id = l.entry_id
               left join public.divisions d on d.id = l.division_id left join public.categories c on c.id = l.category_id
               left join public.sponsors spn on spn.id = e.sponsor_id), '[]'),

    'transactions', coalesce((select jsonb_agg(jsonb_build_array(
                 e.ref, e.txn_date, e.payment_date, e.type_label, e.status_label, e.title, coalesce(e.payee,''),
                 round(e.amount / 100.0, 2),
                 case when e.type = 'income' and not e.in_kind then 'In' when e.type = 'expense' then 'Out' else '—' end,
                 case when e.in_kind then 'Yes' else '' end,
                 coalesce(d.name,''), coalesce(c.name,''),
                 case e.method when 'club' then 'Club account' when 'member' then 'Member – reimburse' when 'invoice' then 'Supplier invoice'
                   when 'deposit' then 'Deposit' when 'advance' then 'Cash advance' else '' end,
                 coalesce(acc.name,''), coalesce(acc2.name,''), coalesce(spn.name,''),
                 coalesce(e.submitter_name,''), to_char(e.created_at at time zone 'Asia/Hong_Kong', 'YYYY-MM-DD HH24:MI'),
                 coalesce((select who from appr where entry_id = e.id and step = 'awaiting_division'),''),
                 coalesce((select who from appr where entry_id = e.id and step = 'awaiting_finance'),''),
                 coalesce((select who from appr where entry_id = e.id and step = 'awaiting_organizer'),''),
                 coalesce((select who from appr where entry_id = e.id and step = 'awaiting_verification'),''),
                 case when e.receipt_path is not null then 'Yes' else 'No' end,
                 coalesce(e.over_budget_override,''), coalesce(e.void_reason,'')) order by e.txn_date, e.ref)
               from lbl e left join public.divisions d on d.id = e.division_id left join public.categories c on c.id = e.category_id
               left join public.accounts acc on acc.id = e.account_id left join public.accounts acc2 on acc2.id = e.to_account_id
               left join public.sponsors spn on spn.id = e.sponsor_id
               where e.type <> 'opening'), '[]'),

    'budgets', coalesce((select jsonb_agg(jsonb_build_array(b.fy, d.name, c.name, a.code, round(b.amount / 100.0, 2)) order by b.fy, d.name, c.name)
               from public.budgets b join public.divisions d on d.id = b.division_id join public.categories c on c.id = b.category_id
               join public.accounts a on a.id = c.account_id), '[]'),

    'budget_lines', coalesce((select jsonb_agg(jsonb_build_array(x.division, x.category, x.code) order by x.division, x.category) from (
                 select d.name division, c.name category, a.code from public.budgets b join public.divisions d on d.id = b.division_id
                   join public.categories c on c.id = b.category_id join public.accounts a on a.id = c.account_id where b.fy = v_fy
                 union
                 select d.name, c.name, a.code from public.journal_lines l join public.accounts a on a.id = l.account_id
                   join public.divisions d on d.id = l.division_id join public.categories c on c.id = l.category_id where a.type = 'expense'
                 union
                 select d.name, c.name, a.code from public.entries e join public.divisions d on d.id = e.division_id
                   join public.categories c on c.id = e.category_id join public.accounts a on a.id = c.account_id
                   where e.type = 'expense' and e.status like 'awaiting%') x), '[]'),

    'payables', coalesce((select jsonb_agg(jsonb_build_array(
                 e.ref, case when e.method = 'member' then 'Reimbursement' else 'Supplier invoice' end,
                 coalesce(nullif(e.payee,''), e.submitter_name, ''), e.title, coalesce(d.name,''),
                 (e.posted_at at time zone 'Asia/Hong_Kong')::date, round(e.amount / 100.0, 2)) order by e.posted_at)
               from lbl e left join public.divisions d on d.id = e.division_id where e.status = 'approved'), '[]'),

    'sponsors', coalesce((select jsonb_agg(jsonb_build_array(
                 sp.name, sp.tier, initcap(sp.status), coalesce(sp.pic,''), case when sp.in_kind then 'Yes' else '' end,
                 round(sp.committed / 100.0, 2), round(sp.invoiced / 100.0, 2), round(sp.cash / 100.0, 2), round(sp.inkind / 100.0, 2), round(sp.settled / 100.0, 2),
                 coalesce(sp.benefits_owed,''), coalesce(sp.benefits_delivered,'')) order by sp.name)
               from sp), '[]'),

    'reconciliations', coalesce((select jsonb_agg(jsonb_build_array(
                 a.name, r.statement_date, round(r.statement_balance / 100.0, 2), round(r.system_balance / 100.0, 2), round(r.difference / 100.0, 2),
                 coalesce(r.actor_name,''), to_char(r.at at time zone 'Asia/Hong_Kong', 'YYYY-MM-DD HH24:MI')) order by r.statement_date, r.id)
               from public.reconciliations r join public.accounts a on a.id = r.account_id), '[]'),

    'locked_months', coalesce((select jsonb_agg(to_char(month, 'YYYY-MM') order by month) from public.period_locks), '[]')
  ) into res;
  return res;
end $$;

grant execute on function public.create_export_key() to authenticated;
grant execute on function public.revoke_export_keys() to authenticated;
grant execute on function public.export_key_info() to anon, authenticated;
grant execute on function public.report_data(text) to anon, authenticated;

select 'Google Sheets update installed' as status;
