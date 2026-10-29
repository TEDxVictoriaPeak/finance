# Panduan Setup — TEDxVictoriaPeak Finance Portal

Total waktu: sekitar 45–60 menit, cukup sekali. Semua gratis.
Kerjakan dari **laptop/komputer** (upload file ke GitHub susah dari HP).

Yang kamu pakai:
- **Supabase** = database, login, dan tempat simpan foto nota.
- **GitHub** = tempat simpan kode + yang bikin website-nya live (GitHub Pages).

Hasil akhirnya: website di alamat seperti `https://namakamu.github.io/tedx-finance/` yang bisa dibuka siapa saja.

---

## Bagian 1 — Supabase (database)

### 1.1 Buat akun dan project
1. Buka **supabase.com** → **Start your project** → daftar (paling gampang pakai akun GitHub, jadi buat akun GitHub dulu di Bagian 2.1 kalau belum punya).
2. Klik **New project**.
   - **Name:** `tedx-finance`
   - **Database Password:** klik *Generate*, lalu **simpan** password ini di tempat aman (jarang dipakai, tapi jangan hilang).
   - **Region:** pilih **Southeast Asia (Singapore)** (paling dekat dengan Hong Kong).
   - **Plan:** Free.
3. Klik **Create new project**, tunggu 1–2 menit sampai selesai.

### 1.2 Pasang database
1. Di menu kiri, klik **SQL Editor** → **New query**.
2. Buka file `supabase/setup.sql` dari folder yang aku kasih, **copy semua isinya**, paste ke editor.
3. Klik **Run** (atau Ctrl/Cmd + Enter).
4. Di bawah harus muncul **"Setup complete"**. Kalau muncul error merah, screenshot dan kirim ke aku.

> Jalankan `setup.sql` **sekali saja**. Kalau dijalankan dua kali akan error karena tabelnya sudah ada (itu tidak merusak apa-apa).

### 1.3 Atur login
1. Menu kiri → **Authentication** → **Sign In / Providers** (di beberapa versi namanya **Providers** atau **Settings**).
2. Buka **Email**:
   - Matikan **Confirm email** (karena kita pakai username, bukan email asli).
   - Pastikan **Enable Email provider** tetap ON.
   - Klik **Save**.
3. Masih di Authentication, cari **Allow new users to sign up** → **matikan** → Save.
   Ini supaya tidak ada orang asing yang bisa bikin akun sendiri. Akun hanya dibuat oleh kamu.

### 1.4 Buat akun kamu (Head of Finance)
1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. **Email:** `usernamekamu@finance.tedxvictoriapeak.com`
   (bagian sebelum `@` adalah username untuk login, misal `priskila@finance.tedxvictoriapeak.com` → username `priskila`). Email ini tidak perlu benar-benar ada.
3. **Password:** buat password yang kuat (min. 8 karakter).
4. Centang **Auto Confirm User** → **Create user**.

Akun **pertama** yang dibuat otomatis jadi **Head of Finance** dan langsung aktif.

### 1.5 Buat akun tim
Ulangi langkah 1.4 untuk:
- **Boss kamu** (nanti dijadikan Organizer), misal `boss@finance.tedxvictoriapeak.com`
- **Finance Officer** (anggota sponsorship kamu)
- **Setiap Project Lead** divisi

Akun-akun ini awalnya **tidak aktif**. Kamu aktifkan dan kasih role-nya dari dalam website (Bagian 4.3).

### 1.6 Ambil kunci untuk website
1. Klik **Project Settings** (ikon gerigi di kiri bawah) → **Data API** (atau **API**). Copy **Project URL**, contoh: `https://abcdefgh.supabase.co`
2. Masih di Project Settings → **API Keys**. Copy key yang bertanda **anon / public** atau **publishable** (yang boleh dipakai di browser).
   **Jangan** pakai `service_role` / `secret` key.
3. Simpan dua nilai ini sementara di Notes, dipakai di Bagian 2.4.

---

## Bagian 2 — GitHub (kode + website)

### 2.1 Buat akun
Buka **github.com** → **Sign up**. Ikuti langkahnya (verifikasi email).

### 2.2 Buat repository
1. Klik **+** (kanan atas) → **New repository**.
2. **Repository name:** `tedx-finance`
3. Pilih **Public** (wajib untuk GitHub Pages gratis. Aman: tidak ada password atau data keuangan di kode. Datanya ada di Supabase dan dilindungi aturan akses).
4. **Jangan** centang "Add a README". Klik **Create repository**.

### 2.3 Upload file
1. Unzip `tedx-finance.zip` di laptop.
2. Di halaman repo yang baru, klik link **uploading an existing file**.
3. Buka folder hasil unzip, **pilih semua isinya** (bukan foldernya, tapi isinya: `src`, `supabase`, `setup`, `index.html`, `package.json`, dst.) lalu **drag** ke halaman GitHub.
4. Tunggu semua file ter-upload → klik **Commit changes**.

**Penting — file workflow (folder `.github`):**
Folder `.github` sering tersembunyi di Mac/Windows dan tidak ikut ter-upload. Cek di halaman repo: kalau **tidak ada** folder `.github`, buat manual:
1. Klik **Add file** → **Create new file**.
2. Di kolom nama, ketik persis: `.github/workflows/deploy.yml`
3. Buka file `setup/deploy.yml` dari folder kamu, copy semua isinya, paste. Klik **Commit changes**.
4. Ulangi untuk `.github/workflows/keep-alive.yml` dengan isi dari `setup/keep-alive.yml`.

### 2.4 Masukkan kunci Supabase (secrets)
1. Di repo: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Buat dua secret (nama harus persis):
   - Name: `VITE_SUPABASE_URL` → Secret: Project URL dari 1.6
   - Name: `VITE_SUPABASE_ANON_KEY` → Secret: anon/publishable key dari 1.6

### 2.5 Nyalakan GitHub Pages
1. **Settings** → **Pages**.
2. Di **Build and deployment** → **Source**, pilih **GitHub Actions**.

### 2.6 Deploy
1. Buka tab **Actions**. Kalau diminta, klik **I understand my workflows, go ahead and enable them**.
2. Klik **Deploy website** (kiri) → **Run workflow** → **Run workflow**.
3. Tunggu 1–3 menit sampai tanda centang hijau ✓.
4. Klik run tersebut → di kotak **deploy** ada link website kamu, contoh `https://namakamu.github.io/tedx-finance/`.

Kalau tanda silang merah ✗: klik run-nya, screenshot bagian merah, kirim ke aku.

Setiap kali ada perubahan kode di GitHub, website otomatis ter-update.

---

## Bagian 3 — Login pertama

1. Buka link website.
2. Klik **Log in** → **Project Lead Login**.
3. Username: bagian sebelum `@` dari email kamu (misal `priskila`), password dari 1.4.
4. Kamu masuk sebagai **Project Lead · Head of Finance**.

> Kamu dan Finance Officer login lewat **Project Lead Login**. Boss kamu lewat **Organizer Login**. Orang lain tidak perlu login: mereka bisa lihat dashboard dan submit expense/income.

---

## Bagian 4 — Isi data awal (di website)

### 4.1 Settings › General
- **Financial year starts in:** bulan awal tahun buku panitia (default July).
- **Event date**, **Sponsorship target**.
- **Only finance approval up to:** default HK$500 (di bawah ini cukup kamu yang approve).
- **Organizer sign-off above:** default HK$10,000.
- **Receipt required above:** default HK$100.
- **Public dashboard:** ON = siapa saja yang punya link bisa lihat saldo dan transaksi yang sudah approved (tanpa nama dan nota).
- Klik **Save settings**.

### 4.2 Settings › Divisions dan Categories
- Tambah semua divisi (misal Production, Speakers, Sponsorship, Marketing…).
- Di **Categories**, klik **Add suggested** untuk kategori pengeluaran umum, lalu tambah/ubah sesuai kebutuhan.
- Divisi/kategori yang sudah punya transaksi hanya bisa di-**Archive**, tidak bisa dihapus (supaya laporan tetap utuh).

### 4.3 Settings › Users (aktifkan tim)
Untuk tiap orang, klik **Edit**:
- **Boss:** Logs in with = **Organizer Login**, centang **Active**.
- **Finance Officer:** Logs in with = **Project Lead Login**, centang **Finance Officer** + **Active**. Division bisa dikosongkan.
- **Project Lead divisi:** Project Lead Login, pilih **Division** yang dia approve, centang **Active**.

### 4.4 Settings › Accounts
Ganti nama rekening sesuai yang asli (misal "Bank – HSBC" → nama bank kalian), tambah kalau ada rekening lain, archive yang tidak dipakai.

### 4.5 Finance tools › Opening balances
Isi saldo awal tiap rekening pada tanggal mulai pakai sistem (lihat mutasi bank). Kalau mulai dari nol, lewati.

### 4.6 Budget
Buka **Budget**, klik angka budget di tiap baris untuk mengisi. Setiap perubahan wajib diberi alasan dan tercatat.

---

## Bagian 5 — Tes sebelum dipakai

Lakukan ini (pakai HP lain atau browser incognito untuk bagian "tanpa login"):
1. **Tanpa login:** Submit expense HK$1,200 dengan foto nota, metode "I paid myself". → statusnya Pending.
2. **Login sebagai Project Lead divisinya** → Approvals → Approve.
3. **Login sebagai kamu** → Approve. Statusnya jadi *Approved · unpaid* dan muncul di "Reimbursements owed".
4. **Login sebagai Finance Officer** → buka entri itu → **Mark as paid** dari rekening.
5. Cek **Dashboard**: kas berkurang HK$1,200, expense bertambah.
6. **Reports › Trial balance** harus tertulis **Balanced**.
7. Coba approve entri buatan sendiri → tidak bisa (memang begitu aturannya).

Kalau semua beres, **hapus data tes**: Supabase → SQL Editor → paste isi `supabase/reset-data.sql` → Run. Lalu Storage → receipts → incoming → hapus file tes.

---

## Bagian 6 — Share ke semua orang

1. Login sebagai kamu → Dashboard → **Share dashboard link** (di HP langsung muncul menu share ke WhatsApp).
2. Kirim ke grup panitia. Mereka cukup buka link, tanpa daftar atau install apa pun.
3. Tips: di HP, buka link → menu browser → **Add to Home Screen** supaya muncul seperti app.

---

---

## Bagian 7 — Laporan keuangan ke Google Sheets

Ada dua cara. Dua-duanya menghasilkan **Financial Report Pack** yang sama, berisi 13 tab:

| Tab | Isi |
|---|---|
| Cover | Periode laporan (sel kuning bisa diganti), angka kunci, cek otomatis "books balance", kolom tanda tangan (Head of Finance & Organizer), dasar penyusunan |
| Income & Expenditure | Laporan laba-rugi panitia: pemasukan & pengeluaran per akun, dibandingkan budget, surplus/defisit |
| Financial Position | Neraca: aset, kewajiban, dana. Ada baris cek yang harus 0 |
| Cash Flow | Saldo awal, uang masuk, uang keluar, saldo akhir tiap rekening + dari mana uangnya datang/pergi |
| Budget vs Actual | Per divisi & kategori: budget, realisasi, pending, sisa, % terpakai |
| Trial Balance | Total debit = total kredit (cek kebenaran pembukuan) |
| Payables Aging | Reimburse & tagihan supplier yang belum dibayar, umur 0–30 / 31–60 / >60 hari |
| Sponsors | Komitmen, invoice, uang & in-kind yang diterima, sisa tagihan, benefit |
| Transactions | Semua transaksi lengkap dengan siapa yang approve dan kapan |
| Journal | Semua baris jurnal debit/kredit (sumber semua rumus) |
| Chart of Accounts, Budget, Bank Reconciliation | Data pendukung |

Semua angka laporan adalah **rumus** dari tab Journal, jadi auditor bisa menelusuri setiap angka. Ganti tanggal kuning di Cover dan semua tab ikut berubah.

### Cara A — Download sekali (paling gampang)
1. Login → **Reports** → **Download report pack (.xlsx)**.
2. Upload file itu ke Google Drive → klik kanan → **Open with › Google Sheets**.
3. Cocok untuk laporan bulanan atau LPJ akhir event (snapshot tanggal tertentu).

### Cara B — Google Sheet yang update otomatis tiap pagi
Sekali setup (±10 menit), setelah itu sheet selalu ikut data terbaru.

1. **Buat key:** login sebagai Head of Finance → **Reports** → kotak *Google Sheets auto-sync* → **Create key**. Copy tiga hal: **key** (`gsk_…`, hanya muncul sekali), **Supabase URL**, **anon key** (ada tombol copy untuk masing-masing). Simpan sementara di Notes.
2. **Buat Google Sheet baru** di Google Drive panitia (misal "TEDxVP Finance Report").
3. Menu **Extensions › Apps Script**. Hapus isi `Code.gs` yang ada.
4. Buka file `google-sheets/Code.gs` dari folder kode, **copy semua isinya**, paste ke Apps Script. Klik ikon **Save** (disket).
5. Kembali ke Google Sheet, **reload halaman**. Muncul menu baru **TEDx Finance**.
6. **TEDx Finance › Set up connection** → isi 3 kotak: Supabase URL, anon key, key `gsk_…`.
   Pertama kali Google akan minta izin ("Authorization required") → pilih akun kamu → *Advanced* → *Go to project (unsafe)* → *Allow*. Ini normal untuk script buatan sendiri.
7. **TEDx Finance › Refresh now** → tunggu ±10–30 detik, semua tab terisi.
8. **TEDx Finance › Turn on daily auto-refresh** → sheet update otomatis tiap jam 6 pagi (waktu HK).
9. Share sheet ini ke boss/Organizer sebagai **Viewer** atau **Commenter**, bukan Editor.

Catatan:
- Tab yang dibuat otomatis akan **ditulis ulang** setiap refresh. Kalau mau tambah catatan atau analisis sendiri, buat **tab baru** (tab tambahan tidak akan disentuh).
- Periode yang kamu pilih di Cover (sel kuning) **tetap dipertahankan** saat refresh.
- Kalau key bocor atau ada orang keluar: Reports → **Create new key** (key lama langsung mati) lalu masukkan key baru via *Set up connection*. Atau **Turn off sync**.
- Key ini hanya bisa **membaca** laporan, tidak bisa mengubah data apa pun.
- Kalau kamu sudah menjalankan `setup.sql` versi lama sebelum fitur ini ada, jalankan `supabase/update-1-google-sheets.sql` sekali di SQL Editor.

### Rutinitas akuntansi yang aku sarankan
- **Mingguan:** cek Payables Aging (reimburse jangan lewat 14 hari) dan Budget vs Actual (divisi yang hampir habis).
- **Bulanan:** rekonsiliasi bank di portal → Close month → Download report pack → simpan di Drive dengan nama `YYYY-MM Report Pack` → Head of Finance & Organizer tanda tangan di Cover.
- **Akhir event:** report pack lengkap periode penuh = dasar LPJ. Pastikan Trial Balance dan Financial Position check = 0, payables = 0, semua sponsor invoice lunas.

---

## Perawatan (penting dibaca)

- **Supabase gratis tidur kalau 7 hari tidak dipakai.** Workflow **Keep Supabase awake** otomatis "membangunkan" tiap hari. Cek sekali di tab **Actions** bahwa workflow ini hijau.
- **GitHub mematikan jadwal otomatis kalau repo tidak ada perubahan 60 hari.** GitHub akan kirim email peringatan. Kalau dapat, buka Actions → Keep Supabase awake → **Enable workflow**. (Selama panitia aktif pakai website, Supabase tetap bangun.)
- **Backup:** versi gratis Supabase tidak ada backup otomatis. Google Sheet auto-sync (Bagian 7, Cara B) sekaligus jadi backup harian. Tanpa itu, download report pack tiap akhir bulan ke Google Drive panitia.
- **Tutup buku bulanan:** Finance tools → Bank reconciliation (isi saldo dari mutasi bank) → kalau "Matched", **Close month**.
- **Reset password anggota:** Supabase → Authentication → Users → klik user → **Reset password** / ubah password, lalu kasih tahu orangnya. Mereka bisa ganti sendiri di **My account**.
- **Orang keluar panitia:** Settings › Users → Edit → hapus centang **Active**.
- **Batas gratis:** database 500 MB dan file 1 GB, lebih dari cukup untuk satu event (ribuan transaksi dan nota).

## Opsional: alamat sendiri
Kalau panitia punya domain (misal `tedxvictoriapeak.com`), di GitHub: Settings → Pages → **Custom domain** → isi `finance.tedxvictoriapeak.com`, lalu ikuti instruksi DNS dari GitHub di tempat beli domain.

## Kalau mentok
Screenshot pesan error-nya dan kirim ke aku. Atau kalau mau, buat repo kosong lalu hubungkan GitHub ke Claude, dan aku bisa upload kodenya langsung.
