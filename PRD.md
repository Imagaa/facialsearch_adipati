PRD: SISTEM PENCARIAN FOTO "DOUBLE-TAP" ADIPATI QRIS RUN
1. Deskripsi Proyek
Membangun modul pencarian galeri foto pelari yang sangat ringan (Zero-Budget Server Compute), tahan terhadap kesalahan OCR (Fuzzy Search), dan memiliki alur UX yang humanis untuk mencegah kepanikan peserta.

2. Tumpukan Teknologi (Tech Stack)
Backend: Laravel 12 (API Provider)

Frontend: Next.js 14 (UI & Client-Side Processing)

Database: PostgreSQL (Ekstensi: pg_trgm untuk Teks, pgvector untuk Wajah)

Client AI: face-api.js (Ekskusi Neural Network murni di Browser Client)

3. Arsitektur Alur Logika (Flow Logic)
Fase 1: Pintu Masuk (The Initial Strike)

Menampilkan form ganda yang wajib/disarankan untuk diisi bersamaan.

Input 1: Teks Nomor BIB.

Input 2: Upload Foto Venue/Selfie peserta.

Tombol eksekusi: "Cari Foto Saya".

Fase 2: Ekstraksi Client-Side (Zero Server Compute)

Sebelum menembak API Laravel, browser (Next.js) menggunakan face-api.js untuk membaca foto yang diunggah.

Browser mengubah foto tersebut menjadi deretan angka (Vektor Wajah 512-Dimensi).

Browser mengirimkan Nomor BIB dan Vektor Wajah ke endpoint API Laravel.

Fase 3: Penyempitan & Pencocokan Kilat (Server-Side)

Laravel menerima Payload (BIB + Vektor).

Mitigasi OCR: PostgreSQL menggunakan pg_trgm untuk mencari foto dengan BIB yang mirip (Toleransi bacaan Tesseract yang salah seperti A1203 menjadi 41203).

Vector Search: Pada kumpulan foto hasil mitigasi tersebut, PostgreSQL menggunakan pgvector (<=> Cosine Distance) untuk mencari jarak terdekat dengan Vektor Wajah yang dikirim client.

API mengembalikan URL GDrive foto yang valid (skor kemiripan wajah > 0.6).

Jika ditemukan: Tampilkan Galeri. Flow selesai.

Jika tidak ditemukan: Lanjut ke Fase 4.

Fase 4: Live Fallback (Pencarian Senyap 2.0)

Sistem mendeteksi pencarian pertama gagal.

Menampilkan UI Humanis: "AI kami kesulitan mengenali wajah dari foto yang diunggah. Mari coba dengan Live Selfie untuk akurasi maksimal."

Membuka modul WebRTC (Kamera Depan HP).

Proses mengulang Fase 2 dan 3 menggunakan tangkapan kamera langsung.

Fase 5: The Honest Conclusion (Manual Drive)

Jika Live Selfie tetap gagal: Menampilkan layar konklusi jujur.

Menyatakan permohonan maaf bahwa lensa fotografer mungkin terlewat di tengah keramaian.

Memberikan tombol CTA (Call to Action) menuju tautan Google Drive Publik untuk pencarian manual mandiri.

4. Struktur Database yang Dibutuhkan
Penting: Ekstensi harus diaktifkan di Railway (CREATE EXTENSION IF NOT EXISTS pg_trgm; dan CREATE EXTENSION IF NOT EXISTS vector;).

Tabel runner_photos: Menyimpan id, file_name, gdrive_id, dan bib_numbers (Tipe Data: Array/JSONB). Dilengkapi GIN Index untuk pencarian trigram.

Tabel photo_faces: Menyimpan id, photo_id, dan face_vector (Tipe Data: Vector 512).