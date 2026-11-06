-- =====================================================================
-- TEDxVictoriaPeak Finance – SIMPLE version
-- Run once in Supabase > SQL Editor > New query > Run.
-- Needs setup.sql to have been run before (it uses the same logins).
-- Safe to run again: it only creates what is missing.
-- =====================================================================

-- Project details shown on the report
create table if not exists public.project (
  id int primary key default 1 check (id = 1),
  project_name text not null default 'TEDxVictoriaPeak 2027',
  club_name text not null default '',
  currency text not null default 'HKD',
  public_view boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.project (id) values (1) on conflict do nothing;

-- Expense categories: A, B, C ...
create table if not exists public.exp_categories (
  id uuid primary key default gen_random_uuid(),
  letter text not null unique check (letter ~ '^[A-Z]{1,2}$'),
  name text not null,
  created_at timestamptz not null default now()
);
insert into public.exp_categories (letter, name)
select * from (values
  ('A', 'Recognitions & Awards, Exhibition Display'),
  ('B', 'Venue Materials, Setup & Stationery'),
  ('C', 'Promotion'),
  ('D', 'Miscellaneous'),
  ('E', 'Transportation & Delivery')) v(letter, name)
where not exists (select 1 from public.exp_categories);

-- One row per item (A1, A2 ...), like one invoice sheet
create table if not exists public.exp_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.exp_categories(id) on delete restrict,
  seq int not null,
  description text not null,
  submitted_by text,
  submitted_on date,
  purpose text,
  purchased_item text,
  supplier text,
  purchase_dates date[] not null default '{}',
  amount numeric(12,2) not null default 0 check (amount >= 0),
  remarks text,
  proof_paths text[] not null default '{}',
  created_at timestamptz not null default now(),
  created_by_name text,
  updated_at timestamptz not null default now(),
  updated_by_name text,
  unique (category_id, seq)
);

-- Money coming in (club underwriting, sponsors, tickets ...)
create table if not exists public.funding (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  kind text not null default 'club' check (kind in ('club','sponsor','ticket','other')),
  amount numeric(12,2) not null check (amount >= 0),
  received_on date,
  note text,
  created_at timestamptz not null default now(),
  created_by_name text
);
-- Income can be promised (not paid yet) or received. Only received money counts in the balance.
alter table public.funding add column if not exists status text not null default 'received';
alter table public.funding drop constraint if exists funding_status_check;
alter table public.funding add constraint funding_status_check check (status in ('promised','received'));

-- Item numbers are never reused: this remembers the highest number ever given per category
create table if not exists public.exp_seq (
  category_id uuid primary key references public.exp_categories(id) on delete cascade,
  last_seq int not null default 0
);
alter table public.exp_seq enable row level security;   -- no policies: only the trigger below uses it
revoke all on public.exp_seq from anon, authenticated;
insert into public.exp_seq (category_id, last_seq)
select category_id, max(seq) from public.exp_items group by category_id
on conflict (category_id) do update set last_seq = greatest(public.exp_seq.last_seq, excluded.last_seq);

-- Give each new item the next number in its category, and stamp who changed it
create or replace function public.trg_exp_item() returns trigger
language plpgsql security definer set search_path = public as $$
declare m int;
begin
  if tg_op = 'INSERT' or new.category_id <> old.category_id then
    select coalesce(max(seq), 0) into m from public.exp_items where category_id = new.category_id;
    insert into public.exp_seq as q (category_id, last_seq) values (new.category_id, m + 1)
    on conflict (category_id) do update set last_seq = greatest(q.last_seq, m) + 1
    returning last_seq into new.seq;
  end if;
  if tg_op = 'INSERT' then new.created_by_name := public.actor_name(); end if;
  new.updated_at := now();
  new.updated_by_name := public.actor_name();
  return new;
end $$;
drop trigger if exists exp_item_seq on public.exp_items;
create trigger exp_item_seq before insert or update on public.exp_items
  for each row execute function public.trg_exp_item();

create or replace function public.trg_funding() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.created_by_name := public.actor_name(); end if;
  return new;
end $$;
drop trigger if exists funding_stamp on public.funding;
create trigger funding_stamp before insert on public.funding for each row execute function public.trg_funding();

-- Every change goes to the Activity log
drop trigger if exists audit on public.project;
create trigger audit after insert or update or delete on public.project for each row execute function public.trg_audit();
drop trigger if exists audit on public.exp_categories;
create trigger audit after insert or update or delete on public.exp_categories for each row execute function public.trg_audit();
drop trigger if exists audit on public.exp_items;
create trigger audit after insert or update or delete on public.exp_items for each row execute function public.trg_audit();
drop trigger if exists audit on public.funding;
create trigger audit after insert or update or delete on public.funding for each row execute function public.trg_audit();

-- Security: logged-in team edits everything; the public only sees totals
alter table public.project enable row level security;
alter table public.exp_categories enable row level security;
alter table public.exp_items enable row level security;
alter table public.funding enable row level security;

drop policy if exists "read project" on public.project;
create policy "read project" on public.project for select using (true);
drop policy if exists "team edits project" on public.project;
create policy "team edits project" on public.project for update using (public.is_staff());

drop policy if exists "read categories" on public.exp_categories;
create policy "read categories" on public.exp_categories for select using (true);
drop policy if exists "team edits categories" on public.exp_categories;
create policy "team edits categories" on public.exp_categories for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "team reads items" on public.exp_items;
create policy "team reads items" on public.exp_items for select using (public.is_staff());
drop policy if exists "team edits items" on public.exp_items;
create policy "team edits items" on public.exp_items for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "team reads funding" on public.funding;
create policy "team reads funding" on public.funding for select using (public.is_staff());
drop policy if exists "team edits funding" on public.funding;
create policy "team edits funding" on public.funding for all using (public.is_staff()) with check (public.is_staff());

grant select on public.project, public.exp_categories to anon, authenticated;
grant select, insert, update, delete on public.exp_categories, public.exp_items, public.funding to authenticated;
grant update on public.project to authenticated;

-- What the public can see (no names, no screenshots), only when switched on
create or replace function public.simple_public() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p public.project;
begin
  select * into p from public.project where id = 1;
  if not p.public_view and not public.is_staff() then
    return jsonb_build_object('private', true, 'project_name', p.project_name, 'club_name', p.club_name);
  end if;
  return jsonb_build_object(
    'private', false, 'project_name', p.project_name, 'club_name', p.club_name,
    'items', coalesce((select jsonb_agg(jsonb_build_object('code', c.letter || i.seq, 'category_id', i.category_id, 'seq', i.seq,
                'description', i.description, 'amount', i.amount, 'has_proof', cardinality(i.proof_paths) > 0) order by c.letter, i.seq)
              from public.exp_items i join public.exp_categories c on c.id = i.category_id), '[]'),
    'funding_total', (select coalesce(sum(amount), 0) from public.funding where status = 'received'),
    'funding_by_kind', coalesce((select jsonb_object_agg(kind, total) from (select kind, sum(amount) total from public.funding where status = 'received' group by kind) f), '{}'),
    'promised_total', (select coalesce(sum(amount), 0) from public.funding where status = 'promised'));
end $$;
grant execute on function public.simple_public() to anon, authenticated;

-- Screenshots: stored privately under items/, only the logged-in team can see them
drop policy if exists "team uploads item proofs" on storage.objects;
create policy "team uploads item proofs" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = 'items' and public.is_staff());
drop policy if exists "team deletes receipts" on storage.objects;
create policy "team deletes receipts" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.is_staff());

select 'Simple version installed' as status;
