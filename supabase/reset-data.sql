-- =====================================================================
-- Clear ALL test transactions before going live.
-- Keeps: users, settings, divisions, categories, accounts, sponsors, budgets.
-- Removes: every entry, approval, journal line, reconciliation, month lock,
--          activity log and budget history. This cannot be undone.
-- Run in Supabase > SQL Editor.
-- =====================================================================
truncate public.approvals, public.journal_lines, public.reconciliations,
         public.period_locks, public.ref_counters, public.budget_changes restart identity;
delete from public.entries;
truncate public.activity_log restart identity;
update public.sponsors set status = 'prospect' where status in ('invoiced', 'paid');
select 'Test data cleared' as status;
-- Receipt files: delete them in Storage > receipts > incoming (select all > Delete).
