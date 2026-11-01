-- Update: Income (promised / received)
-- Run this once in Supabase > SQL Editor if you already ran simple-setup.sql.
-- Safe to run more than once.

-- Income can be promised (not paid yet) or received. Only received money counts in the balance.
alter table public.funding add column if not exists status text not null default 'received';
alter table public.funding drop constraint if exists funding_status_check;
alter table public.funding add constraint funding_status_check check (status in ('promised','received'));

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

select 'Income update installed' as status;
