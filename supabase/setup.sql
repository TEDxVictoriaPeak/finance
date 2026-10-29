-- =====================================================================
-- TEDxVictoriaPeak Finance Portal — database setup
-- Paste this whole file into Supabase > SQL Editor > New query > Run.
-- Safe to run once on a fresh project.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Core tables
-- ---------------------------------------------------------------------

create table public.settings (
  id int primary key default 1 check (id = 1),
  org_name text not null default 'TEDxVictoriaPeak 2027',
  currency text not null default 'HKD',
  fy_start_month int not null default 7 check (fy_start_month between 1 and 12),
  single_approval_max bigint not null default 50000,        -- HK$500.00: at or below, only finance approval
  organizer_signoff_above bigint not null default 1000000,  -- HK$10,000.00: above, Organizer must sign off
  receipt_required_above bigint not null default 10000,     -- HK$100.00
  public_dashboard boolean not null default true,
  event_date date,
  sponsorship_target bigint not null default 0,
  login_domain text not null default 'finance.tedxvictoriapeak.com',
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1);

create table public.divisions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  type text not null check (type in ('asset','liability','fund','income','expense')),
  is_cash boolean not null default false,
  system_key text unique,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('expense','income')),
  account_id uuid references public.accounts(id),
  sort int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (name, kind)
);

create table public.profiles (
  id uuid primary key,                       -- = auth.users.id
  username text not null unique,
  full_name text not null default '',
  role text not null default 'project_lead' check (role in ('organizer','project_lead')),
  is_finance_admin boolean not null default false,   -- Head of Finance (Treasurer)
  is_finance_officer boolean not null default false,
  division_id uuid references public.divisions(id),
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  fy int not null,
  division_id uuid not null references public.divisions(id),
  category_id uuid not null references public.categories(id),
  amount bigint not null default 0 check (amount >= 0),
  updated_at timestamptz not null default now(),
  unique (fy, division_id, category_id)
);

create table public.budget_changes (
  id bigserial primary key,
  budget_id uuid,
  fy int, division_id uuid, category_id uuid,
  old_amount bigint, new_amount bigint,
  reason text,
  actor uuid, actor_name text,
  at timestamptz not null default now()
);

create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tier text not null default 'Silver',
  in_kind boolean not null default false,
  committed bigint not null default 0 check (committed >= 0),
  status text not null default 'prospect' check (status in ('prospect','agreed','invoiced','paid','lost')),
  pic text,
  benefits_owed text,
  benefits_delivered text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  type text not null check (type in ('expense','income','transfer','advance','advance_return','sponsor_invoice','opening')),
  status text not null check (status in ('awaiting_division','awaiting_finance','awaiting_organizer','awaiting_verification',
                                          'approved','paid','posted','returned','rejected','void')),
  title text not null,
  payee text,
  description text,
  private_note text,
  amount bigint not null check (amount > 0),
  txn_date date not null,
  payment_date date,
  division_id uuid references public.divisions(id),
  category_id uuid references public.categories(id),
  method text check (method in ('club','member','invoice','deposit','advance')),
  account_id uuid references public.accounts(id),
  to_account_id uuid references public.accounts(id),
  sponsor_id uuid references public.sponsors(id),
  settles_receivable boolean not null default false,
  in_kind boolean not null default false,
  submitter_name text,
  submitted_by uuid,
  receipt_path text,
  recognized_at date,
  over_budget_override text,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  posted_at timestamptz
);
create index on public.entries (txn_date);
create index on public.entries (status);

create table public.approvals (
  id bigserial primary key,
  entry_id uuid not null references public.entries(id) on delete cascade,
  step text not null,
  action text not null,
  actor uuid,
  actor_name text,
  note text,
  at timestamptz not null default now()
);
create index on public.approvals (entry_id);

create table public.journal_lines (
  id bigserial primary key,
  entry_id uuid not null references public.entries(id) on delete cascade,
  line_date date not null,
  account_id uuid not null references public.accounts(id),
  debit bigint not null default 0 check (debit >= 0),
  credit bigint not null default 0 check (credit >= 0),
  division_id uuid,
  category_id uuid,
  memo text,
  created_at timestamptz not null default now(),
  check (not (debit > 0 and credit > 0)),
  check (debit > 0 or credit > 0)
);
create index on public.journal_lines (account_id, line_date);
create index on public.journal_lines (entry_id);

create table public.ref_counters (
  prefix text not null,
  fy int not null,
  last int not null default 0,
  primary key (prefix, fy)
);

create table public.period_locks (
  month date primary key,
  locked_by uuid,
  locked_at timestamptz not null default now()
);

create table public.reconciliations (
  id bigserial primary key,
  account_id uuid not null references public.accounts(id),
  statement_date date not null,
  statement_balance bigint not null,
  system_balance bigint not null,
  difference bigint not null,
  actor uuid, actor_name text,
  at timestamptz not null default now()
);

create table public.activity_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid,
  actor_name text,
  action text not null,
  entity text,
  entity_id text,
  details jsonb
);
create index on public.activity_log (at desc);

-- ---------------------------------------------------------------------
-- 2. Default chart of accounts and income categories
-- ---------------------------------------------------------------------

insert into public.accounts (code, name, type, is_cash, system_key) values
  ('1000','Bank – HSBC','asset',true,null),
  ('1010','Petty Cash','asset',true,null),
  ('1020','FPS / PayMe','asset',true,null),
  ('1100','Sponsorship Receivable','asset',false,'receivable'),
  ('1200','Deposits & Prepayments','asset',false,'prepayments'),
  ('1300','Advances to Members','asset',false,'advances'),
  ('2000','Reimbursements Payable','liability',false,'reimb_payable'),
  ('2100','Supplier Payables','liability',false,'supplier_payable'),
  ('3000','Opening Fund','fund',false,'opening_fund'),
  ('4000','Sponsorship – Cash','income',false,'sponsor_income'),
  ('4010','Sponsorship – In-kind','income',false,'inkind_income');

insert into public.categories (name, kind, account_id, sort)
  select 'Sponsorship – Cash','income',id,1 from public.accounts where system_key='sponsor_income';
insert into public.categories (name, kind, account_id, sort)
  select 'Sponsorship – In-kind','income',id,2 from public.accounts where system_key='inkind_income';
-- Donations, Merchandise, Other Income get their accounts from the trigger below
-- (inserted after the trigger is created, see section 5).

-- ---------------------------------------------------------------------
-- 3. Helper functions
-- ---------------------------------------------------------------------

create or replace function public.cfg() returns public.settings
language sql stable security definer set search_path = public as
$$ select * from public.settings where id = 1 $$;

create or replace function public.fy_of(d date) returns int
language plpgsql stable security definer set search_path = public as $$
declare m int := (select fy_start_month from public.settings where id = 1);
begin
  if m = 1 then return extract(year from d)::int; end if;
  if extract(month from d)::int >= m then return extract(year from d)::int + 1; end if;
  return extract(year from d)::int;
end $$;

create or replace function public.fy_start(fy int) returns date
language plpgsql stable security definer set search_path = public as $$
declare m int := (select fy_start_month from public.settings where id = 1);
begin
  if m = 1 then return make_date(fy, 1, 1); end if;
  return make_date(fy - 1, m, 1);
end $$;

create or replace function public.fy_end(fy int) returns date
language sql stable as $$ select (public.fy_start(fy) + interval '1 year' - interval '1 day')::date $$;

create or replace function public.my_profile() returns public.profiles
language sql stable security definer set search_path = public as
$$ select * from public.profiles where id = auth.uid() and active $$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles where id = auth.uid() and active) $$;

create or replace function public.is_organizer() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'organizer') $$;

create or replace function public.is_fin_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles where id = auth.uid() and active and is_finance_admin) $$;

create or replace function public.is_fin_officer() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles where id = auth.uid() and active and is_finance_officer) $$;

create or replace function public.is_finance() returns boolean
language sql stable security definer set search_path = public as
$$ select public.is_fin_admin() or public.is_fin_officer() $$;

create or replace function public.is_division_lead(div uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select div is not null and exists (select 1 from public.profiles
     where id = auth.uid() and active and role = 'project_lead' and division_id = div) $$;

create or replace function public.actor_name() returns text
language sql stable security definer set search_path = public as
$$ select coalesce((select nullif(full_name,'') from public.profiles where id = auth.uid()),
                   (select username from public.profiles where id = auth.uid()), 'Public form') $$;

create or replace function public.log_act(p_action text, p_entity text, p_entity_id text, p_details jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.activity_log (actor, actor_name, action, entity, entity_id, details)
  values (auth.uid(), public.actor_name(), p_action, p_entity, p_entity_id, p_details);
$$;

create or replace function public.sys_account(k text) returns uuid
language sql stable security definer set search_path = public as
$$ select id from public.accounts where system_key = k $$;

create or replace function public.next_ref(p_type text, p_date date) returns text
language plpgsql security definer set search_path = public as $$
declare pfx text; y int; n int;
begin
  pfx := case p_type when 'expense' then 'EXP' when 'income' then 'INC' when 'transfer' then 'TRF'
           when 'advance' then 'ADV' when 'advance_return' then 'ADR' when 'sponsor_invoice' then 'SIV'
           else 'OPN' end;
  y := public.fy_of(p_date);
  insert into public.ref_counters (prefix, fy, last) values (pfx, y, 1)
    on conflict (prefix, fy) do update set last = public.ref_counters.last + 1
    returning last into n;
  return pfx || '-' || y || '-' || lpad(n::text, 4, '0');
end $$;

create or replace function public.check_open(d date) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from public.period_locks where month = date_trunc('month', d)::date) then
    raise exception 'The month % is closed. Ask the Head of Finance to unlock it first.', to_char(d, 'Mon YYYY');
  end if;
end $$;

create or replace function public.post_pair(p_entry uuid, p_date date, p_dr uuid, p_cr uuid, p_amount bigint,
                                            p_div uuid, p_cat uuid, p_memo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_dr is null or p_cr is null then raise exception 'Missing account for posting'; end if;
  perform public.check_open(p_date);
  insert into public.journal_lines (entry_id, line_date, account_id, debit, credit, division_id, category_id, memo)
  values (p_entry, p_date, p_dr, p_amount, 0, p_div, p_cat, p_memo),
         (p_entry, p_date, p_cr, 0, p_amount, p_div, p_cat, p_memo);
end $$;

create or replace function public.account_balance(p_account uuid, p_upto date default null) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when a.type in ('asset','expense') then l.debit - l.credit else l.credit - l.debit end), 0)::bigint
  from public.journal_lines l join public.accounts a on a.id = l.account_id
  where l.account_id = p_account and (p_upto is null or l.line_date <= p_upto)
$$;

-- ---------------------------------------------------------------------
-- 4. Approval rules
-- ---------------------------------------------------------------------

create or replace function public.submitter_is_fin_admin(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select p_uid is not null and exists (select 1 from public.profiles where id = p_uid and is_finance_admin) $$;

create or replace function public.can_approve(e public.entries) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then return false; end if;
  if e.submitted_by is not null and e.submitted_by = auth.uid() then return false; end if;
  return case e.status
    when 'awaiting_division' then public.is_organizer() or public.is_division_lead(e.division_id)
    when 'awaiting_finance' then public.is_fin_admin()
         or (public.submitter_is_fin_admin(e.submitted_by) and (public.is_organizer() or public.is_fin_officer()))
    when 'awaiting_organizer' then public.is_organizer()
    when 'awaiting_verification' then public.is_finance() or public.is_organizer()
    else false end;
end $$;

create or replace function public.first_status(p_type text, p_amount bigint, p_div uuid) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if p_type = 'income' then return 'awaiting_verification'; end if;
  if p_amount <= (select single_approval_max from public.settings where id = 1) then return 'awaiting_finance'; end if;
  if public.is_organizer() or public.is_division_lead(p_div) then return 'awaiting_finance'; end if;
  return 'awaiting_division';
end $$;

-- ---------------------------------------------------------------------
-- 5. Triggers: category accounts, profiles, audit
-- ---------------------------------------------------------------------

create or replace function public.trg_category_account() returns trigger
language plpgsql security definer set search_path = public as $$
declare base int; c text;
begin
  if new.account_id is null then
    base := case when new.kind = 'expense' then 5000 else 4100 end;
    select coalesce(max(n), base - 10) + 10 into c from (
      select case when code ~ '^[0-9]+$' then code::int end as n from public.accounts) t
      where n >= base and n < (case when new.kind='expense' then 6000 else 5000 end);
    insert into public.accounts (code, name, type) values (c, new.name, new.kind) returning id into new.account_id;
  end if;
  return new;
end $$;
create trigger category_account before insert on public.categories
  for each row execute function public.trg_category_account();

create or replace function public.trg_category_rename() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.name <> old.name and new.account_id is not null then
    update public.accounts set name = new.name where id = new.account_id and system_key is null;
  end if;
  if new.archived <> old.archived and new.account_id is not null then
    update public.accounts set archived = new.archived where id = new.account_id and system_key is null;
  end if;
  return new;
end $$;
create trigger category_rename after update on public.categories
  for each row execute function public.trg_category_rename();

insert into public.categories (name, kind, sort) values
  ('Donations','income',3), ('Merchandise','income',4), ('Other Income','income',5);

create or replace function public.trg_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_user boolean; uname text;
begin
  first_user := not exists (select 1 from public.profiles);
  uname := lower(split_part(coalesce(new.email, new.id::text), '@', 1));
  if exists (select 1 from public.profiles where username = uname) then
    uname := uname || '-' || substr(new.id::text, 1, 4);
  end if;
  insert into public.profiles (id, username, full_name, role, is_finance_admin, active)
  values (new.id, uname, '', 'project_lead', first_user, first_user);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.trg_new_user();

create or replace function public.trg_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_log (actor, actor_name, action, entity, entity_id, details)
  values (auth.uid(), public.actor_name(), lower(tg_op), tg_table_name,
          coalesce((case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id', ''),
          case when tg_op='UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
               when tg_op='INSERT' then to_jsonb(new) else to_jsonb(old) end);
  return coalesce(new, old);
end $$;
create trigger audit after insert or update or delete on public.settings for each row execute function public.trg_audit();
create trigger audit after insert or update or delete on public.divisions for each row execute function public.trg_audit();
create trigger audit after insert or update or delete on public.categories for each row execute function public.trg_audit();
create trigger audit after insert or update or delete on public.accounts for each row execute function public.trg_audit();
create trigger audit after insert or update or delete on public.profiles for each row execute function public.trg_audit();
create trigger audit after insert or update or delete on public.sponsors for each row execute function public.trg_audit();
create trigger audit after insert or update or delete on public.period_locks for each row execute function public.trg_audit();

create or replace function public.trg_budget_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.amount = old.amount then return new; end if;
  new.updated_at := now();
  insert into public.budget_changes (budget_id, fy, division_id, category_id, old_amount, new_amount, reason, actor, actor_name)
  values (new.id, new.fy, new.division_id, new.category_id,
          case when tg_op='UPDATE' then old.amount else null end, new.amount,
          current_setting('app.budget_reason', true), auth.uid(), public.actor_name());
  return new;
end $$;
create trigger budget_change before insert or update on public.budgets
  for each row execute function public.trg_budget_change();

-- Keep at least one active Head of Finance.
create or replace function public.trg_keep_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where active and is_finance_admin) then
    raise exception 'At least one active Head of Finance is required.';
  end if;
  return null;
end $$;
create constraint trigger keep_admin after update or delete on public.profiles
  deferrable initially deferred for each row execute function public.trg_keep_admin();

-- ---------------------------------------------------------------------
-- 6. Budget helpers
-- ---------------------------------------------------------------------

create or replace function public.budget_actual(p_fy int, p_div uuid, p_cat uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(l.debit - l.credit), 0)::bigint
  from public.journal_lines l join public.accounts a on a.id = l.account_id
  where a.type = 'expense' and l.division_id = p_div and l.category_id = p_cat
    and l.line_date between public.fy_start(p_fy) and public.fy_end(p_fy)
$$;

create or replace function public.budget_committed(p_fy int, p_div uuid, p_cat uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::bigint from public.entries
  where type = 'expense' and division_id = p_div and category_id = p_cat
    and public.fy_of(txn_date) = p_fy
    and (status in ('awaiting_division','awaiting_finance','awaiting_organizer')
         or (method = 'deposit' and status = 'paid' and recognized_at is null))
$$;

-- ---------------------------------------------------------------------
-- 7. Submitting entries (public form, no login needed)
-- ---------------------------------------------------------------------

create or replace function public.form_options() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'settings', (select jsonb_build_object('org_name', org_name, 'currency', currency,
                   'receipt_required_above', receipt_required_above, 'single_approval_max', single_approval_max,
                   'organizer_signoff_above', organizer_signoff_above, 'public_dashboard', public_dashboard,
                   'login_domain', login_domain, 'fy_start_month', fy_start_month, 'event_date', event_date)
                 from public.settings where id = 1),
    'divisions', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by sort, name)
                   from public.divisions where not archived), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'kind', kind) order by kind, sort, name)
                   from public.categories where not archived), '[]'::jsonb),
    'cash_accounts', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by code)
                   from public.accounts where is_cash and not archived), '[]'::jsonb),
    'sponsors', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name)
                   from public.sponsors where status <> 'lost'), '[]'::jsonb)
  )
$$;

create or replace function public.possible_duplicate(p_amount bigint, p_date date, p_payee text) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.entries
  where amount = p_amount and txn_date = p_date and status not in ('void','rejected')
    and (p_payee is null or p_payee = '' or coalesce(payee,'') ilike p_payee)
$$;

create or replace function public.submit_entry(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  s public.settings := public.cfg();
  e public.entries;
  v_type text := p->>'type';
  v_amount bigint := (p->>'amount')::bigint;
  v_date date := coalesce((p->>'txn_date')::date, current_date);
  v_method text := nullif(p->>'method','');
  v_cat public.categories;
  v_div uuid := nullif(p->>'division_id','')::uuid;
  v_acc uuid := nullif(p->>'account_id','')::uuid;
  v_inkind boolean := coalesce((p->>'in_kind')::boolean, false);
begin
  if v_type not in ('expense','income') then raise exception 'Unknown entry type'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'Amount must be more than zero'; end if;
  if v_amount > 100000000000 then raise exception 'Amount is too large'; end if;
  if coalesce(trim(p->>'title'),'') = '' then raise exception 'Title is required'; end if;
  if length(p->>'title') > 200 or length(coalesce(p->>'description','')) > 2000 then raise exception 'Text is too long'; end if;
  if not public.is_staff() and coalesce(trim(p->>'submitter_name'),'') = '' then raise exception 'Please enter your name'; end if;
  if v_date > current_date + 31 then raise exception 'Date is too far in the future'; end if;

  select * into v_cat from public.categories where id = nullif(p->>'category_id','')::uuid and not archived;
  if v_cat.id is null then raise exception 'Please choose a category'; end if;

  if v_type = 'expense' then
    if v_cat.kind <> 'expense' then raise exception 'Choose an expense category'; end if;
    if v_div is null then raise exception 'Please choose a division'; end if;
    if v_method is null then raise exception 'Please choose how it was paid'; end if;
    if v_method in ('club','deposit') and v_acc is null then raise exception 'Choose which account paid'; end if;
    if v_method = 'advance' and not public.is_staff() then
      raise exception 'Settling a cash advance needs a Project Lead login';
    end if;
    if v_amount > s.receipt_required_above and coalesce(p->>'receipt_path','') = '' then
      raise exception 'A receipt is required for expenses above HK$%', to_char(round(s.receipt_required_above / 100.0, 2), 'FM999,999,990.00');
    end if;
  else
    if v_inkind then
      if v_cat.kind <> 'expense' then raise exception 'For in-kind sponsorship, choose the expense category it covers'; end if;
      v_acc := null;
    else
      if v_cat.kind <> 'income' then raise exception 'Choose an income category'; end if;
    end if;
  end if;

  if v_acc is not null and not exists (select 1 from public.accounts where id = v_acc and is_cash) then
    raise exception 'Invalid account';
  end if;

  insert into public.entries (ref, type, status, title, payee, description, private_note, amount, txn_date,
      division_id, category_id, method, account_id, sponsor_id, settles_receivable, in_kind,
      submitter_name, submitted_by, receipt_path, updated_by)
  values (public.next_ref(v_type, v_date), v_type, public.first_status(v_type, v_amount, v_div),
      trim(p->>'title'), nullif(trim(p->>'payee'),''), nullif(p->>'description',''), nullif(p->>'private_note',''),
      v_amount, v_date, v_div, v_cat.id, case when v_type='expense' then v_method end, v_acc,
      nullif(p->>'sponsor_id','')::uuid, coalesce((p->>'settles_receivable')::boolean, false), v_inkind,
      coalesce(nullif(trim(p->>'submitter_name'),''), public.actor_name()), auth.uid(), nullif(p->>'receipt_path',''), auth.uid())
  returning * into e;

  insert into public.approvals (entry_id, step, action, actor, actor_name, note)
  values (e.id, 'submit', 'submitted', auth.uid(), e.submitter_name, null);
  perform public.log_act('submit', 'entry', e.ref, to_jsonb(e));
  return e.ref;
end $$;

-- Edit a pending or returned entry. Any edit restarts the approval steps.
create or replace function public.update_entry(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare e public.entries; v_cat public.categories;
begin
  select * into e from public.entries where id = p_id for update;
  if e.id is null then raise exception 'Entry not found'; end if;
  if e.status not in ('awaiting_division','awaiting_finance','awaiting_organizer','awaiting_verification','returned') then
    raise exception 'Only pending or returned entries can be edited. Void and re-enter a posted entry instead.';
  end if;
  if not (public.is_finance() or public.is_organizer() or public.is_division_lead(e.division_id)
          or (e.submitted_by is not null and e.submitted_by = auth.uid())) then
    raise exception 'You are not allowed to edit this entry';
  end if;
  if p ? 'category_id' then
    select * into v_cat from public.categories where id = (p->>'category_id')::uuid;
    if v_cat.id is null then raise exception 'Invalid category'; end if;
  end if;
  update public.entries set
    title = coalesce(nullif(trim(p->>'title'),''), title),
    payee = case when p ? 'payee' then nullif(trim(p->>'payee'),'') else payee end,
    description = case when p ? 'description' then nullif(p->>'description','') else description end,
    private_note = case when p ? 'private_note' then nullif(p->>'private_note','') else private_note end,
    amount = coalesce((p->>'amount')::bigint, amount),
    txn_date = coalesce((p->>'txn_date')::date, txn_date),
    division_id = case when p ? 'division_id' then nullif(p->>'division_id','')::uuid else division_id end,
    category_id = coalesce(v_cat.id, category_id),
    method = case when p ? 'method' then nullif(p->>'method','') else method end,
    account_id = case when p ? 'account_id' then nullif(p->>'account_id','')::uuid else account_id end,
    sponsor_id = case when p ? 'sponsor_id' then nullif(p->>'sponsor_id','')::uuid else sponsor_id end,
    settles_receivable = coalesce((p->>'settles_receivable')::boolean, settles_receivable),
    receipt_path = case when p ? 'receipt_path' then nullif(p->>'receipt_path','') else receipt_path end,
    updated_at = now(), updated_by = auth.uid()
  where id = p_id returning * into e;
  if e.amount <= 0 then raise exception 'Amount must be more than zero'; end if;
  update public.entries set status = public.first_status(e.type, e.amount, e.division_id) where id = p_id;
  insert into public.approvals (entry_id, step, action, actor, actor_name, note)
  values (p_id, 'edit', 'edited and resubmitted', auth.uid(), public.actor_name(), p->>'edit_note');
  perform public.log_act('edit', 'entry', e.ref, p);
end $$;

-- ---------------------------------------------------------------------
-- 8. Approving, paying, verifying, voiding
-- ---------------------------------------------------------------------

create or replace function public.finalize_expense(e public.entries, p_override text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_exp uuid := (select account_id from public.categories where id = e.category_id);
  v_fy int := public.fy_of(e.txn_date);
  v_budget bigint; v_actual bigint; v_status text;
begin
  select amount into v_budget from public.budgets where fy = v_fy and division_id = e.division_id and category_id = e.category_id;
  if v_budget is not null and e.method <> 'deposit' then
    v_actual := public.budget_actual(v_fy, e.division_id, e.category_id);
    if v_actual + e.amount > v_budget then
      if coalesce(trim(p_override),'') = '' then
        raise exception 'OVER_BUDGET: this would take the budget line to HK$% of HK$%. Approve with an override reason.',
          to_char((v_actual + e.amount)/100.0, 'FM999,999,990.00'), to_char(v_budget/100.0, 'FM999,999,990.00');
      end if;
      if not (public.is_fin_admin() or public.is_organizer()) then
        raise exception 'Only the Head of Finance or the Organizer can approve over budget';
      end if;
      update public.entries set over_budget_override = p_override where id = e.id;
    end if;
  end if;

  if e.method = 'club' then
    perform public.post_pair(e.id, e.txn_date, v_exp, e.account_id, e.amount, e.division_id, e.category_id, e.title);
    v_status := 'paid';
    update public.entries set payment_date = coalesce(payment_date, txn_date) where id = e.id;
  elsif e.method = 'member' then
    perform public.post_pair(e.id, e.txn_date, v_exp, public.sys_account('reimb_payable'), e.amount, e.division_id, e.category_id, e.title);
    v_status := 'approved';
  elsif e.method = 'invoice' then
    perform public.post_pair(e.id, e.txn_date, v_exp, public.sys_account('supplier_payable'), e.amount, e.division_id, e.category_id, e.title);
    v_status := 'approved';
  elsif e.method = 'deposit' then
    perform public.post_pair(e.id, e.txn_date, public.sys_account('prepayments'), e.account_id, e.amount, e.division_id, e.category_id, 'Deposit: ' || e.title);
    v_status := 'paid';
    update public.entries set payment_date = coalesce(payment_date, txn_date) where id = e.id;
  elsif e.method = 'advance' then
    perform public.post_pair(e.id, e.txn_date, v_exp, public.sys_account('advances'), e.amount, e.division_id, e.category_id, 'Advance settled: ' || e.title);
    v_status := 'paid';
  else
    raise exception 'Unknown payment method';
  end if;
  update public.entries set status = v_status, posted_at = now() where id = e.id;
  return v_status;
end $$;

create or replace function public.act_on_entry(p_id uuid, p_action text, p_note text default null,
    p_account uuid default null, p_date date default null, p_override text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  e public.entries; s public.settings := public.cfg(); v_new text; v_step text; v_cr uuid; v_dr uuid;
  r record;
begin
  select * into e from public.entries where id = p_id for update;
  if e.id is null then raise exception 'Entry not found'; end if;
  v_step := e.status;

  if p_action in ('approve','return','reject','verify') then
    if not public.can_approve(e) then
      raise exception 'You cannot approve this entry (it may be your own, or not your division)';
    end if;
    if p_action in ('return','reject') then
      if coalesce(trim(p_note),'') = '' then raise exception 'Please give a reason'; end if;
      v_new := case when p_action='return' then 'returned' else 'rejected' end;
      update public.entries set status = v_new, updated_at = now(), updated_by = auth.uid() where id = e.id;

    elsif p_action = 'verify' then
      if e.status <> 'awaiting_verification' then raise exception 'Not awaiting verification'; end if;
      if e.in_kind then
        perform public.post_pair(e.id, e.txn_date, (select account_id from public.categories where id = e.category_id),
                                 public.sys_account('inkind_income'), e.amount, e.division_id, e.category_id, 'In-kind: ' || e.title);
      else
        v_dr := coalesce(p_account, e.account_id);
        if v_dr is null or not exists (select 1 from public.accounts where id = v_dr and is_cash) then
          raise exception 'Choose the account the money was received into';
        end if;
        if e.settles_receivable then v_cr := public.sys_account('receivable');
        else v_cr := (select account_id from public.categories where id = e.category_id); end if;
        perform public.post_pair(e.id, coalesce(p_date, e.txn_date), v_dr, v_cr, e.amount, e.division_id, e.category_id, e.title);
        update public.entries set account_id = v_dr, payment_date = coalesce(p_date, e.txn_date) where id = e.id;
      end if;
      update public.entries set status = 'posted', posted_at = now() where id = e.id;
      if e.sponsor_id is not null then
        update public.sponsors sp set status = 'paid'
        where sp.id = e.sponsor_id and sp.status in ('agreed','invoiced')
          and (select coalesce(sum(amount),0) from public.entries x where x.sponsor_id = sp.id and x.type='income' and x.status='posted') >= sp.committed
          and sp.committed > 0;
      end if;
      v_new := 'posted';

    else -- approve
      if e.status = 'awaiting_division' then
        v_new := 'awaiting_finance';
        update public.entries set status = v_new where id = e.id;
      elsif e.status = 'awaiting_finance' then
        if e.amount > s.organizer_signoff_above then
          v_new := 'awaiting_organizer';
          update public.entries set status = v_new where id = e.id;
        else
          v_new := public.finalize_expense(e, p_override);
        end if;
      elsif e.status = 'awaiting_organizer' then
        v_new := public.finalize_expense(e, p_override);
      else
        raise exception 'Nothing to approve';
      end if;
    end if;

  elsif p_action = 'mark_paid' then
    if not public.is_finance() then raise exception 'Only the finance team can record payments'; end if;
    if e.status <> 'approved' then raise exception 'Only approved, unpaid expenses can be marked paid'; end if;
    if p_account is null or not exists (select 1 from public.accounts where id = p_account and is_cash) then
      raise exception 'Choose the account that paid';
    end if;
    v_dr := case when e.method = 'member' then public.sys_account('reimb_payable') else public.sys_account('supplier_payable') end;
    perform public.post_pair(e.id, coalesce(p_date, current_date), v_dr, p_account, e.amount, e.division_id, e.category_id, 'Payment: ' || e.title);
    update public.entries set status = 'paid', payment_date = coalesce(p_date, current_date), account_id = p_account where id = e.id;
    v_new := 'paid';

  elsif p_action = 'recognize_deposit' then
    if not public.is_finance() then raise exception 'Only the finance team can do this'; end if;
    if e.method <> 'deposit' or e.status <> 'paid' or e.recognized_at is not null then raise exception 'Not an open deposit'; end if;
    perform public.post_pair(e.id, coalesce(p_date, current_date), (select account_id from public.categories where id = e.category_id),
                             public.sys_account('prepayments'), e.amount, e.division_id, e.category_id, 'Deposit used: ' || e.title);
    update public.entries set recognized_at = coalesce(p_date, current_date) where id = e.id;
    v_new := 'paid';

  elsif p_action = 'void' then
    if not public.is_fin_admin() then raise exception 'Only the Head of Finance can void entries'; end if;
    if e.status not in ('approved','paid','posted') then raise exception 'Only posted entries can be voided'; end if;
    if e.type = 'opening' then raise exception 'Change opening balances in Finance > Opening balances'; end if;
    if coalesce(trim(p_note),'') = '' then raise exception 'Please give a reason'; end if;
    for r in select * from public.journal_lines where entry_id = e.id loop
      perform public.check_open(current_date);
      insert into public.journal_lines (entry_id, line_date, account_id, debit, credit, division_id, category_id, memo)
      values (e.id, current_date, r.account_id, r.credit, r.debit, r.division_id, r.category_id, 'VOID: ' || coalesce(r.memo,''));
    end loop;
    update public.entries set status = 'void', void_reason = p_note where id = e.id;
    v_new := 'void';
  else
    raise exception 'Unknown action';
  end if;

  update public.entries set updated_at = now(), updated_by = auth.uid() where id = e.id;
  insert into public.approvals (entry_id, step, action, actor, actor_name, note)
  values (e.id, v_step, p_action, auth.uid(), public.actor_name(), coalesce(p_note, p_override));
  perform public.log_act(p_action, 'entry', e.ref, jsonb_build_object('from', v_step, 'to', v_new, 'note', p_note));
  return v_new;
end $$;

-- Finance-only entries posted straight away: transfers, cash advances, sponsor invoices.
create or replace function public.finance_post(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_type text := p->>'type'; v_amount bigint := (p->>'amount')::bigint;
  v_date date := coalesce((p->>'txn_date')::date, current_date);
  v_acc uuid := nullif(p->>'account_id','')::uuid; v_to uuid := nullif(p->>'to_account_id','')::uuid;
  v_sp uuid := nullif(p->>'sponsor_id','')::uuid; v_cat uuid; e public.entries;
begin
  if not public.is_finance() then raise exception 'Only the finance team can do this'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'Amount must be more than zero'; end if;
  if v_type not in ('transfer','advance','advance_return','sponsor_invoice') then raise exception 'Unknown type'; end if;
  if v_type <> 'sponsor_invoice' and (v_acc is null or not exists (select 1 from public.accounts where id = v_acc and is_cash)) then
    raise exception 'Choose an account';
  end if;
  if v_type = 'transfer' and (v_to is null or v_to = v_acc or not exists (select 1 from public.accounts where id = v_to and is_cash)) then
    raise exception 'Choose two different accounts';
  end if;
  if v_type = 'sponsor_invoice' then
    if v_sp is null then raise exception 'Choose a sponsor'; end if;
    v_cat := (select id from public.categories where account_id = public.sys_account('sponsor_income'));
  end if;

  insert into public.entries (ref, type, status, title, payee, description, amount, txn_date, payment_date,
      account_id, to_account_id, sponsor_id, category_id, submitter_name, submitted_by, posted_at, updated_by)
  values (public.next_ref(v_type, v_date), v_type, 'posted',
      coalesce(nullif(trim(p->>'title'),''), initcap(replace(v_type,'_',' '))), nullif(trim(p->>'payee'),''),
      nullif(p->>'description',''), v_amount, v_date, v_date, v_acc, v_to, v_sp, v_cat,
      public.actor_name(), auth.uid(), now(), auth.uid())
  returning * into e;

  if v_type = 'transfer' then
    perform public.post_pair(e.id, v_date, v_to, v_acc, v_amount, null, null, e.title);
  elsif v_type = 'advance' then
    perform public.post_pair(e.id, v_date, public.sys_account('advances'), v_acc, v_amount, null, null, 'Advance to ' || coalesce(e.payee,''));
  elsif v_type = 'advance_return' then
    perform public.post_pair(e.id, v_date, v_acc, public.sys_account('advances'), v_amount, null, null, 'Advance returned by ' || coalesce(e.payee,''));
  else
    perform public.post_pair(e.id, v_date, public.sys_account('receivable'), public.sys_account('sponsor_income'), v_amount, null, v_cat, e.title);
    update public.sponsors set status = 'invoiced' where id = v_sp and status in ('prospect','agreed');
  end if;

  insert into public.approvals (entry_id, step, action, actor, actor_name) values (e.id, 'finance', 'posted', auth.uid(), public.actor_name());
  perform public.log_act('post', 'entry', e.ref, to_jsonb(e));
  return e.ref;
end $$;

create or replace function public.set_opening_balance(p_account uuid, p_amount bigint, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare a public.accounts; e public.entries;
begin
  if not public.is_fin_admin() then raise exception 'Only the Head of Finance can set opening balances'; end if;
  select * into a from public.accounts where id = p_account;
  if a.type not in ('asset','liability') then raise exception 'Opening balances are for asset and liability accounts'; end if;
  perform public.check_open(p_date);
  for e in select * from public.entries where type = 'opening' and account_id = p_account and status = 'posted' loop
    perform public.check_open(e.txn_date);
    delete from public.journal_lines where entry_id = e.id;
    update public.entries set status = 'void', void_reason = 'Replaced by new opening balance' where id = e.id;
  end loop;
  if coalesce(p_amount,0) <> 0 then
    insert into public.entries (ref, type, status, title, amount, txn_date, account_id, submitter_name, submitted_by, posted_at)
    values (public.next_ref('opening', p_date), 'opening', 'posted', 'Opening balance – ' || a.name, abs(p_amount), p_date,
            p_account, public.actor_name(), auth.uid(), now())
    returning * into e;
    if (a.type = 'asset') = (p_amount > 0) then
      perform public.post_pair(e.id, p_date, p_account, public.sys_account('opening_fund'), abs(p_amount), null, null, e.title);
    else
      perform public.post_pair(e.id, p_date, public.sys_account('opening_fund'), p_account, abs(p_amount), null, null, e.title);
    end if;
  end if;
  perform public.log_act('opening_balance', 'account', a.name, jsonb_build_object('amount', p_amount, 'date', p_date));
end $$;

create or replace function public.set_month_lock(p_month date, p_locked boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_fin_admin() then raise exception 'Only the Head of Finance can close months'; end if;
  if p_locked then
    insert into public.period_locks (month, locked_by) values (date_trunc('month', p_month)::date, auth.uid()) on conflict do nothing;
  else
    delete from public.period_locks where month = date_trunc('month', p_month)::date;
  end if;
end $$;

create or replace function public.add_reconciliation(p_account uuid, p_date date, p_statement bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_sys bigint;
begin
  if not public.is_finance() then raise exception 'Only the finance team can reconcile'; end if;
  v_sys := public.account_balance(p_account, p_date);
  insert into public.reconciliations (account_id, statement_date, statement_balance, system_balance, difference, actor, actor_name)
  values (p_account, p_date, p_statement, v_sys, p_statement - v_sys, auth.uid(), public.actor_name());
  perform public.log_act('reconcile', 'account', p_account::text, jsonb_build_object('statement', p_statement, 'system', v_sys));
  return p_statement - v_sys;
end $$;

create or replace function public.set_budget(p_fy int, p_div uuid, p_cat uuid, p_amount bigint, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Please log in'; end if;
  if p_amount < 0 then raise exception 'Budget cannot be negative'; end if;
  perform set_config('app.budget_reason', coalesce(p_reason,''), true);
  insert into public.budgets (fy, division_id, category_id, amount) values (p_fy, p_div, p_cat, p_amount)
  on conflict (fy, division_id, category_id) do update set amount = excluded.amount;
end $$;

-- ---------------------------------------------------------------------
-- 9. Public dashboard data (no names, receipts or pending details)
-- ---------------------------------------------------------------------

create or replace function public.public_summary(p_fy int default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.settings := public.cfg(); v_fy int; d0 date; d1 date; res jsonb;
begin
  if not s.public_dashboard and not public.is_staff() then
    raise exception 'PRIVATE: the dashboard is not public right now';
  end if;
  v_fy := coalesce(p_fy, public.fy_of(current_date)); d0 := public.fy_start(v_fy); d1 := public.fy_end(v_fy);

  with bal as (
    select a.id, a.name, a.type, a.is_cash, a.system_key, public.account_balance(a.id) as balance
    from public.accounts a
  ),
  pl as (
    select a.type, a.name, c.name as cat, sum(case when a.type='income' then l.credit-l.debit else l.debit-l.credit end) amt
    from public.journal_lines l join public.accounts a on a.id = l.account_id
    left join public.categories c on c.account_id = a.id
    where a.type in ('income','expense') and l.line_date between d0 and d1
    group by a.type, a.name, c.name
  ),
  months as (
    select generate_series(d0, d1, interval '1 month')::date as m
  ),
  monthly as (
    select m.m,
      coalesce((select sum(l.credit-l.debit) from public.journal_lines l join public.accounts a on a.id=l.account_id
                where a.type='income' and date_trunc('month', l.line_date) = m.m), 0) as income,
      coalesce((select sum(l.debit-l.credit) from public.journal_lines l join public.accounts a on a.id=l.account_id
                where a.type='expense' and date_trunc('month', l.line_date) = m.m), 0) as expense
    from months m
  ),
  divs as (
    select d.id, d.name, d.sort,
      coalesce((select sum(amount) from public.budgets b where b.fy = v_fy and b.division_id = d.id), 0) as budget,
      coalesce((select sum(l.debit-l.credit) from public.journal_lines l join public.accounts a on a.id=l.account_id
                where a.type='expense' and l.division_id = d.id and l.line_date between d0 and d1), 0) as actual,
      coalesce((select sum(e.amount) from public.entries e where e.type='expense' and e.division_id = d.id
                and public.fy_of(e.txn_date) = v_fy
                and (e.status in ('awaiting_division','awaiting_finance','awaiting_organizer')
                     or (e.method='deposit' and e.status='paid' and e.recognized_at is null))), 0) as committed
    from public.divisions d where not d.archived
  )
  select jsonb_build_object(
    'fy', v_fy, 'fy_start', d0, 'fy_end', d1, 'today', current_date,
    'org_name', s.org_name, 'event_date', s.event_date, 'public', s.public_dashboard,
    'cash_accounts', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'balance', balance) order by name)
                      from bal where is_cash and (balance <> 0 or id in (select id from public.accounts where not archived))), '[]'),
    'total_cash', (select coalesce(sum(balance),0) from bal where is_cash),
    'receivable', (select coalesce(sum(balance),0) from bal where system_key = 'receivable'),
    'prepayments', (select coalesce(sum(balance),0) from bal where system_key = 'prepayments'),
    'advances', (select coalesce(sum(balance),0) from bal where system_key = 'advances'),
    'reimb_payable', (select coalesce(sum(balance),0) from bal where system_key = 'reimb_payable'),
    'supplier_payable', (select coalesce(sum(balance),0) from bal where system_key = 'supplier_payable'),
    'net_funds', (select coalesce(sum(case when type='asset' then balance when type='liability' then -balance else 0 end),0) from bal),
    'opening_fund', (select coalesce(sum(balance),0) from bal where system_key = 'opening_fund'),
    'income_total', (select coalesce(sum(amt),0) from pl where type='income'),
    'expense_total', (select coalesce(sum(amt),0) from pl where type='expense'),
    'income_by_category', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(cat,name), 'amount', amt) order by amt desc) from pl where type='income' and amt <> 0), '[]'),
    'expense_by_category', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(cat,name), 'amount', amt) order by amt desc) from pl where type='expense' and amt <> 0), '[]'),
    'monthly', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'income', income, 'expense', expense) order by m) from monthly), '[]'),
    'divisions', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'budget', budget, 'actual', actual, 'committed', committed) order by sort, name) from divs), '[]'),
    'total_budget', (select coalesce(sum(amount),0) from public.budgets b where b.fy = v_fy),
    'sponsorship', jsonb_build_object(
        'target', s.sponsorship_target,
        'committed', (select coalesce(sum(committed),0) from public.sponsors where status in ('agreed','invoiced','paid')),
        'received', (select coalesce(sum(amount),0) from public.entries where type='income' and status='posted' and sponsor_id is not null)),
    'pending_count', (select count(*) from public.entries where status like 'awaiting%'),
    'last_reconciled', (select max(statement_date) from public.reconciliations where difference = 0),
    'recent', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('ref', e.ref, 'date', e.txn_date, 'title', e.title, 'type', e.type, 'amount', e.amount,
               'in_kind', e.in_kind, 'division', d.name, 'category', c.name) x
        from public.entries e left join public.divisions d on d.id = e.division_id left join public.categories c on c.id = e.category_id
        where e.status in ('approved','paid','posted') and e.type in ('expense','income')
        order by e.txn_date desc, e.created_at desc limit 8) t), '[]')
  ) into res;
  return res;
end $$;

create or replace function public.public_entries(p_fy int default null)
returns table (ref text, txn_date date, title text, type text, status text, amount bigint, in_kind boolean,
               division text, category text, account text, method text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_fy int;
begin
  if not (select public_dashboard from public.settings where id = 1) and not public.is_staff() then
    raise exception 'PRIVATE: the dashboard is not public right now';
  end if;
  v_fy := coalesce(p_fy, public.fy_of(current_date));
  return query
    select e.ref, e.txn_date, e.title, e.type, e.status, e.amount, e.in_kind, d.name, c.name, a.name, e.method
    from public.entries e
    left join public.divisions d on d.id = e.division_id
    left join public.categories c on c.id = e.category_id
    left join public.accounts a on a.id = e.account_id
    where e.status in ('approved','paid','posted') and e.type <> 'opening'
      and e.txn_date between public.fy_start(v_fy) and public.fy_end(v_fy)
    order by e.txn_date desc, e.created_at desc;
end $$;

-- Which entries the signed-in person can act on now.
create or replace function public.my_queue() returns setof public.entries
language sql stable security definer set search_path = public as $$
  select * from public.entries e where public.can_approve(e) order by e.txn_date, e.created_at
$$;

create or replace function public.ledger_lines(p_from date, p_to date)
returns table (id bigint, entry_id uuid, ref text, entry_type text, title text, line_date date, account_id uuid,
               account_code text, account_name text, account_type text, is_cash boolean,
               debit bigint, credit bigint, division_id uuid, category_id uuid, memo text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_staff() then raise exception 'Please log in'; end if;
  return query
    select l.id, l.entry_id, e.ref, e.type, e.title, l.line_date, a.id, a.code, a.name, a.type, a.is_cash,
           l.debit, l.credit, l.division_id, l.category_id, l.memo
    from public.journal_lines l join public.accounts a on a.id = l.account_id join public.entries e on e.id = l.entry_id
    where l.line_date between coalesce(p_from, '1900-01-01') and coalesce(p_to, '2999-12-31')
    order by l.line_date, l.id;
end $$;

-- ---------------------------------------------------------------------
-- 10. Security: Row Level Security and grants
-- ---------------------------------------------------------------------

alter table public.settings enable row level security;
alter table public.divisions enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.profiles enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_changes enable row level security;
alter table public.sponsors enable row level security;
alter table public.entries enable row level security;
alter table public.approvals enable row level security;
alter table public.journal_lines enable row level security;
alter table public.ref_counters enable row level security;
alter table public.period_locks enable row level security;
alter table public.reconciliations enable row level security;
alter table public.activity_log enable row level security;

-- Readable by everyone (needed for the public form and dashboard)
create policy "read settings" on public.settings for select using (true);
create policy "read divisions" on public.divisions for select using (true);
create policy "read accounts" on public.accounts for select using (true);
create policy "read categories" on public.categories for select using (true);
create policy "read budgets" on public.budgets for select using (true);

-- Readable by logged-in team only
create policy "staff read profiles" on public.profiles for select using (public.is_staff() or id = auth.uid());
create policy "staff read budget changes" on public.budget_changes for select using (public.is_staff());
create policy "staff read sponsors" on public.sponsors for select using (public.is_staff());
create policy "staff read entries" on public.entries for select using (public.is_staff());
create policy "staff read approvals" on public.approvals for select using (public.is_staff());
create policy "staff read journal" on public.journal_lines for select using (public.is_staff());
create policy "staff read locks" on public.period_locks for select using (public.is_staff());
create policy "staff read recon" on public.reconciliations for select using (public.is_staff());
create policy "staff read log" on public.activity_log for select using (public.is_staff());

-- Editing set-up data: logged-in Organizer and Project Leads
create policy "staff add divisions" on public.divisions for insert with check (public.is_staff());
create policy "staff edit divisions" on public.divisions for update using (public.is_staff());
create policy "staff add categories" on public.categories for insert with check (public.is_staff());
create policy "staff edit categories" on public.categories for update using (public.is_staff());
create policy "finance edit sponsors" on public.sponsors for insert with check (public.is_finance() or public.is_organizer());
create policy "finance update sponsors" on public.sponsors for update using (public.is_finance() or public.is_organizer());

-- Head of Finance only
create policy "admin edit settings" on public.settings for update using (public.is_fin_admin());
create policy "admin edit profiles" on public.profiles for update using (public.is_fin_admin());
create policy "admin add accounts" on public.accounts for insert with check (public.is_fin_admin() and type in ('asset','liability'));
create policy "admin edit accounts" on public.accounts for update using (public.is_fin_admin());

revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update on public.divisions, public.categories, public.sponsors to authenticated;
grant update on public.settings, public.profiles to authenticated;
grant insert, update on public.accounts to authenticated;
grant usage on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- Internal helpers: not callable directly from the browser
revoke execute on function public.post_pair(uuid, date, uuid, uuid, bigint, uuid, uuid, text) from anon, authenticated, public;
revoke execute on function public.finalize_expense(public.entries, text) from anon, authenticated, public;
revoke execute on function public.next_ref(text, date) from anon, authenticated, public;
revoke execute on function public.log_act(text, text, text, jsonb) from anon, authenticated, public;

-- ---------------------------------------------------------------------
-- 11. Receipt storage (private bucket; public form can upload, only the team can view)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
on conflict (id) do nothing;

create policy "anyone uploads receipts" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = 'incoming');
create policy "team views receipts" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.is_staff());

-- ---------------------------------------------------------------------
-- 12. Financial report pack and Google Sheets sync
-- ---------------------------------------------------------------------

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


-- Done.
select 'Setup complete' as status;
