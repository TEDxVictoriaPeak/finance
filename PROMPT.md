# TEDxVictoriaPeak 2027 Finance Portal — Build Prompt (v4)

Build and deploy a production-ready, mobile-first finance portal for the TEDxVictoriaPeak 2027 organizing committee in Hong Kong. All UI text in English. Base currency: Hong Kong Dollar (display "HK$1,280.00"; income in green with "+", expenses in red with "-"). Time zone: Asia/Hong_Kong. The app must be live on a public URL, usable by the whole committee, and shareable by link when finished.

## 1. Roles, logins and permissions

Only two kinds of login exist. Everyone else uses the site without logging in.

- **Organizer Login** (event lead / licensee; my boss): sees everything. Approves expenses for any division (acts as the division approver when a division has no Project Lead), is the second approver for anything the Head of Finance submits, gives final sign-off on expenses above HK$[10,000] and on over-budget approvals, verifies income. Can edit divisions, categories, budgets and sponsors.
- **Project Lead Login**, used by three kinds of people, set per account with flags:
  - **Project Lead** (one per division): approves or returns expenses for their own division; can add/edit divisions, budget categories and budgets.
  - **Head of Finance (Treasurer)** (me): a Project Lead account with the Head of Finance flag. Final financial approval of all expenses, verifies income, voids posted entries, opening balances, month-end close, settings, money accounts, users and roles.
  - **Finance Officer** (sponsorship focus): a Project Lead account with the Finance Officer flag. Adds income and expenses, manages sponsors, records payments, transfers, cash advances and sponsor invoices, verifies income. Second approver for the Head of Finance's own entries.
- **Public (no login)**: view the dashboard, balances and approved transactions; submit expenses and add income with their name (these always start as Pending). Cannot see names, receipts, pending items or reports, and cannot edit anything.

Hard rules:
- Nobody can approve an entry they submitted (four-eyes rule). If a Project Lead submits for their own division, it skips straight to the Head of Finance. If the Head of Finance submits, the Organizer or the Finance Officer approves it.
- Logging in through the wrong button is refused (an Organizer account can't use Project Lead Login and vice versa). Inactive accounts can't log in.
- All permissions are enforced in the database, not only in the screens.
- Show a "Who can do what" permissions matrix in Settings.

## 2. Approval workflow (no manual hand-off)

Expenses: Draft → Submitted → Approved by division approver (Project Lead, or Organizer if the division has no lead) → Approved by Head of Finance → (if above HK$[10,000]) Signed off by Organizer → Paid.
- Each step automatically moves the entry to the next approver's queue and notifies them. Nobody forwards anything by hand.
- At either step the approver can "Return for changes" or "Reject"; a reason is required.
- Configurable threshold: expenses at or below HK$[500] need only Head of Finance approval.
- Each entry shows its approval trail: who submitted, who approved at each step, when, and any notes.

Income: Recorded → Verified (Head of Finance or Finance Officer confirms the money reached the account; cannot be the same person who recorded it) → Posted.

Only posted entries affect balances and reports. Pending, returned and rejected entries never do.

## 3. Dates and periods (always up to date)

Every entry stores:
- **Transaction date** (when the expense was incurred or income received), editable before posting.
- **Payment date** (when cash actually moved).
- **Submitted at, approved at, posted at, last edited at and by** — set automatically.

Lists, monthly groups and reports are always built from the transaction date, so changing a date moves the entry to the correct month and year automatically. The fiscal year start month is set in Settings (default [July]); the active period shown on the home page is calculated automatically from today's date, with a period switcher to view earlier periods.

## 4. Divisions, budget categories and budgets (editable)

- Head of Finance, Organizer, Finance Officer and Project Leads can add, rename, reorder and archive divisions and budget categories. Start with no hard-coded list; provide suggestions (Production/AV, Venue, Speakers, Catering, Marketing & Printing, Merchandise, Licensing, Volunteers, Contingency) the team can accept or ignore.
- A division or category that already has transactions can be archived, not deleted, so history stays intact.
- Budgets are set per division and category for the fiscal year. Every budget change is logged (old value, new value, who, when, reason).
- Budget tracking per line: Budget, Actual (posted), Committed (submitted and approved but not yet paid), Available = Budget − Actual − Committed. Warn at 80% and block-with-override at 100% (override requires Head of Finance and a reason).

## 5. Accounting engine (double-entry under the hood, simple on the surface)

Users only fill in simple forms. The app creates balanced double-entry journal lines automatically. An "Accounting view" (Head of Finance and Finance Officer only) shows the journals.

Default chart of accounts (editable by Head of Finance):
- Assets: Bank – [HSBC], Petty Cash, FPS/PayMe, Sponsorship Receivable, Deposits & Prepayments, Advances to Members
- Liabilities: Reimbursements Payable, Supplier Payables
- Fund: Opening Fund / Accumulated Surplus
- Income: Sponsorship – Cash, Sponsorship – In-kind, Donations, Merchandise, Other Income
- Expenses: one expense account per budget category (created automatically when a category is added)

Automatic postings:
- Expense paid from a club account → Dr Expense / Cr that account.
- Expense paid by a member out of pocket → Dr Expense / Cr Reimbursements Payable; when repaid → Dr Reimbursements Payable / Cr account.
- Supplier invoice approved but unpaid → Dr Expense / Cr Supplier Payables; when paid → Dr Supplier Payables / Cr account.
- Sponsor signed and invoiced → Dr Sponsorship Receivable / Cr Sponsorship Income; when money arrives → Dr account / Cr Sponsorship Receivable.
- Cash income received directly → Dr account / Cr Income.
- In-kind sponsorship (e.g. free venue, printing) → Dr relevant Expense / Cr Sponsorship – In-kind, at fair value. No effect on cash.
- Transfer between accounts → Dr receiving / Cr sending. Not income or expense.
- Deposit paid in advance (e.g. venue) → Dr Deposits & Prepayments / Cr account; reclassified to expense when the service is delivered.
- Cash advance to a member → Dr Advances / Cr account; settled with receipts and return of any leftover cash.

Opening balances: Head of Finance enters each account's opening balance and date once; this posts against Opening Fund.

## 6. Balance (automatic, visible to everyone)

Balances are never typed in by hand. They are calculated live from posted entries plus opening balances.

Show:
- Cash per account and total cash, with "as of" date and "last reconciled" date.
- Net funds = total cash + sponsorship receivable + deposits & advances − reimbursements payable − supplier payables.
- Income & Expenditure for the period: income by category, expenses by category, surplus/deficit, compared with budget.
- Ledger per account (date, reference, description, in, out, running balance) — on phones, show as stacked rows instead of a cramped table.

## 7. Controls and audit trail

- Sequential reference numbers: EXP-2027-0001, INC-2027-0001, TRF-2027-0001.
- Posted entries can't be deleted. "Void" creates a reversing entry with a required reason. Editing a posted entry creates a reversal plus a corrected entry, both linked.
- Receipt photo/PDF required for expenses above HK$[100]; warn on likely duplicates (same amount, date and payee).
- Month-end close: Head of Finance can lock a month; locked months can't be changed without unlocking (logged).
- Bank reconciliation per account: enter the statement balance and date, tick matched transactions, show the unreconciled difference.
- Immutable activity log: who did what, when, old and new values.

## 8. Screens and navigation

Mobile: bottom tab bar — Dashboard, Transactions, + Add, Approvals (badge with count), More (Budget, Sponsors, Reports, Settings). Desktop: left sidebar with the same items.

- **Dashboard** (public): total cash, net funds, income vs expenses this period, budget used per division (progress bars), monthly cash-flow chart, sponsorship raised vs target, days to event, last reconciled date, latest posted transactions.
- **Transactions**: tabs Posted / Pending / Returned & Rejected. Grouped by month (from transaction date) with monthly totals in and out. Search, filters (type, status, division, category, account, date range), card/table toggle. Each card: reference, title, amount, status badge, date · division · category · account · submitted by, and the approval trail on tap.
- **+ Add**: choose Expense, Reimbursement claim, Income, Transfer, Cash advance. Expense form fields: title, payee/vendor, transaction date, amount, division, category (only active ones), how it was paid (club account / paid myself / supplier invoice unpaid), receipt upload or camera, description, optional split across several categories.
- **Approvals**: queue for the signed-in approver, large receipt preview, budget impact bar, Approve / Return / Reject with notes.
- **Budget**: table per division and category with Budget, Actual, Committed, Available; editable by the permitted roles.
- **Sponsors**: sponsor, tier, cash or in-kind, committed value, invoiced, received, outstanding, status (Prospect → Agreed → Invoiced → Paid), PIC, benefits owed and delivered.
- **Reports**: Income & Expenditure statement, Statement of Financial Position, Cash flow summary, Budget vs Actual, General Ledger, Trial Balance, Sponsor statement, Outstanding reimbursements (with age), Final event financial report. Export each to PDF and Excel; full data export to CSV.
- **Settings**: users and roles, divisions, categories, chart of accounts, accounts and opening balances, fiscal year, thresholds, month-end lock, public link toggle, permissions matrix.

## 9. Public visibility

Head of Finance can switch the public link on or off. Viewers see Dashboard, Balance and posted transactions only. Hide from viewers: receipt images, payee bank details, notes marked private, reimbursement claimant names (show "Committee member"), sponsor contract documents. Viewers never see pending or rejected entries.

## 10. Design

Clean and professional: dark navy header (#0B2440), light gray background, white cards, red accent (#E62B1E) for primary actions only. Large readable type, 44px minimum touch targets, high contrast, status badges (Posted/Approved green, Pending amber, Returned blue, Rejected red). Empty states with a clear next action. Works on phones first, then desktop.

## 11. Technical and deployment

- Stack (free tiers): Supabase for the Postgres database, authentication and receipt file storage, with Row Level Security enforcing every role permission in the database itself (not only in the UI); code kept in a GitHub repository; front end built and published by GitHub Actions to GitHub Pages (free). Never browser storage. Store money as integer cents to avoid rounding errors.
- Keep-alive: a scheduled GitHub Action pings the Supabase project daily so the free project is never paused for inactivity.
- Backups: a scheduled GitHub Action exports all tables to CSV weekly and stores them privately, since the free Supabase tier has no automatic backups.
- Login menu with exactly two buttons: "Organizer Login" and "Project Lead Login". Each opens a username + password form; the username maps to a login email ending in a configurable domain (default username@finance.tedxvictoriapeak.com). Public sign-up is disabled; the Head of Finance creates accounts in Supabase, then activates them and sets the role, division and finance flags in Settings › Users. The first account created becomes Head of Finance automatically. Every account belongs to one person (no shared passwords). Include "Change password"; password resets are done by the Head of Finance.
- Public forms are protected with a hidden spam trap and server-side validation; receipts upload to a private bucket only the logged-in team can view.
- Receipt file storage (images and PDF, up to 10 MB each).
- Email notifications: item awaiting your approval, item returned/rejected, reimbursement paid, budget line over 80%.
- One-click full export (Excel/CSV) for the Head of Finance.
- Publish to a public URL with HTTPS. The public dashboard must open instantly on any phone browser with no login, no app install and no sign-up wall; only editing and approving require sign-in.
- Add a "Share" button for the Head of Finance that copies the public link and shows a QR code for it.
- Seed realistic demo data (accounts with opening balances, a few divisions, sponsors, three months of entries in every status) and a Head-of-Finance-only "Clear demo data" button to use before going live.

## 12. Financial Report Pack and Google Sheets

- A "Download report pack (.xlsx)" button on Reports produces one workbook that opens in Google Sheets or Excel, with 13 tabs: Cover (editable period start/end and budget year, key figures, automatic "books balance" check, sign-off lines for Head of Finance and Organizer, basis of preparation), Income & Expenditure (actual vs budget, variance, % used, surplus/deficit), Statement of Financial Position (assets, liabilities, funds, check row that must be 0), Cash Flow (opening/in/out/closing per account plus where the cash came from and went, with a check row), Budget vs Actual (budget, actual, pending, available per division and category), Trial Balance (with difference row), Payables Aging (0–30, 31–60, over 60 days), Sponsorship statement, Transactions register with approval trail, Journal (every double-entry line), Chart of Accounts, Budget, Bank Reconciliation.
- Every report figure is a formula over the Journal tab (SUMIFS by account code and date), so changing the period on the Cover recalculates every tab and an auditor can trace each number.
- Google Sheets auto-sync: the Head of Finance creates a read-only export key in the portal (shown once, stored only as a hash, can be replaced or turned off). An Apps Script in a Google Sheet uses that key to fetch the data and rebuild the same pack every morning (and on demand from a "TEDx Finance" menu), keeping the period the user chose. The website export and the Google Sheet use the same builder code so they always match.

## 13. Acceptance checks (verify before calling it done)

1. Every posted entry produces journal lines where debits equal credits; the Trial Balance balances.
2. Dashboard total cash equals the sum of account ledgers, and equals opening balances + posted cash in − posted cash out.
3. A pending or rejected expense never changes any balance; approving and paying it does, immediately.
4. Changing a transaction date moves the entry to the right month in lists and reports.
5. A user can't approve their own entry; the public can't edit anything after submitting; an expense above HK$[10,000] can't be paid without Organizer sign-off.
6. A viewer on the public link can't see receipts, names of claimants or pending items, and can't edit anything.
7. Voiding a posted entry creates a reversal and leaves both visible in the audit log.
8. Archiving a division with transactions keeps its history in reports.
9. In the downloaded report pack, the Trial Balance difference and the Financial Position check are 0, and Cover shows "OK"; the Google Sheet after refresh shows the same figures.
