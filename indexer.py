import os
import cv2
import psycopg2
import pytesseract
import re
import concurrent.futures
from psycopg2 import pool
from insightface.app import FaceAnalysis

# 1. Bypass Variabel Lingkungan (Hardcode URL Mutlak)
# GANTI STRING INI dengan Postgres Connection URL (External) utuh dari panel Railway Anda
DB_URL = "postgresql://postgres:dEgJyweoBvYYmWLVoKOKiPZuHYHCsuax@thomas.proxy.rlwy.net:47314/railway"

# 2. Inisiasi Otak AI (ONNX ArcFace 512-d)
print("[*] Memanaskan Mesin AI (Mengunduh model ONNX jika belum ada)...")
app = FaceAnalysis(name='buffalo_sc', providers=['CPUExecutionProvider'])
app.prepare(ctx_id=0, det_size=(640, 640))

# 3. Koneksi Database Pool (Untuk Multithreading)
print("[*] Menembus PostgreSQL Railway...")
db_pool = psycopg2.pool.ThreadedConnectionPool(1, 15, DB_URL)

# Inisiasi Skema (Satu kali jalan)
init_conn = db_pool.getconn()
init_cursor = init_conn.cursor()
init_cursor.execute("ALTER TABLE runner_photos DROP COLUMN IF EXISTS face_vector;")
init_cursor.execute("ALTER TABLE runner_photos ADD COLUMN IF NOT EXISTS face_vector vector(512);")
init_conn.commit()
init_cursor.close()
db_pool.putconn(init_conn)
print("[+] Skema Database berhasil ditingkatkan ke 512 Dimensi.")

# 4. Path Tesseract Windows (Ubah jika Anda menginstalnya di lokasi berbeda)
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

# 5. Multi-Radar Direktori
TARGET_DIRS = [
    r"C:\lari-watcher\Raw",
]

def process_image(file_path, agnostic_name, count):
    try:
        # Gunakan cv2 untuk membaca gambar
        img = cv2.imread(file_path)
        if img is None:
            return

        # [MUTLAK] Resize gambar DSLR raksasa agar tidak mencekik CPU
        max_dim = 1600
        h, w = img.shape[:2]
        if max(h, w) > max_dim:
            scale = max_dim / max(h, w)
            img = cv2.resize(img, (int(w * scale), int(h * scale)))

        # A. Ekstraksi Vektor Wajah (ONNX)
        faces = app.get(img)
        face_vector = None
        if len(faces) > 0:
            embedding = faces[0].embedding
            face_vector = "[" + ",".join(map(str, embedding)) + "]"

        # B. Ekstraksi Nomor BIB (Tesseract OCR Super-Resolution)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # 1. UPSCALING KHUSUS OCR: Besarkan gambar abu-abu 2x lipat agar teks jauh (di panggung) bisa dibaca Tesseract
        ocr_img = cv2.resize(gray, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
        
        # 2. CLAHE: Meratakan kontras cahaya (Sangat ampuh untuk foto lari)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
        enhanced_gray = clahe.apply(ocr_img)

        # 3. Whitelist & PSM 11: Paksa Tesseract HANYA baca Huruf Kapital & Angka
        custom_config = r'--oem 3 --psm 11 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        text = pytesseract.image_to_string(enhanced_gray, config=custom_config)
        
        # 4. Regex Fleksibel: 1 Huruf Kapital diikuti 3 sampai 5 Angka (Contoh: W299, X3260, A12345)
        bib_matches = re.findall(r'\b[A-Z]\d{3,5}\b', text)
        
        # 4. Hapus duplikat (jika Tesseract membaca nomor yang sama dua kali di satu foto)
        bib_matches = list(set(bib_matches))

        # C. Tembak ke Database (Ambil koneksi dari pool)
        conn = db_pool.getconn()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO runner_photos (file_name, gdrive_id, bib_numbers, face_vector)
            VALUES (%s, %s, %s, %s)
        """, (agnostic_name, 'WAITING_SYNC', bib_matches, face_vector))
        conn.commit()
        cursor.close()
        db_pool.putconn(conn)

        print(f"[{count}] [DONE] {agnostic_name} | BIB: {bib_matches} | Wajah: {'Ya' if face_vector else 'Tidak'}")

    except Exception as e:
        print(f"[{count}] [ERROR] Gagal memproses {agnostic_name}: {e}")
        if 'conn' in locals() and conn:
            db_pool.putconn(conn)


# ================= EKSEKUSI UTAMA (MULTITHREADING) =================
files_to_process = []
processed_count = 0

# 1. Kumpulkan seluruh antrean foto
for base_dir in TARGET_DIRS:
    if not os.path.exists(base_dir):
        print(f"[SKIP] Direktori tidak ditemukan: {base_dir}")
        continue
    
    print(f"\n[>] MENYAPU DIREKTORI: {base_dir}")
    for fg in os.listdir(base_dir):
        fg_path = os.path.join(base_dir, fg)
        if not os.path.isdir(fg_path): 
            continue

        for file in os.listdir(fg_path):
            if file.lower().endswith(('.png', '.jpg', '.jpeg')):
                file_path = os.path.join(fg_path, file)
                agnostic_name = f"{fg}/{file}"
                files_to_process.append((file_path, agnostic_name))

print(f"\n[*] Total {len(files_to_process)} foto masuk antrean. Memulai pemrosesan paralel...")

# 2. Eksekusi Paralel (12 core bekerja bersamaan secara brutal)
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as executor:
    futures = []
    for file_path, agnostic_name in files_to_process:
        processed_count += 1
        futures.append(executor.submit(process_image, file_path, agnostic_name, processed_count))
    
    # Tunggu semua thread selesai
    concurrent.futures.wait(futures)

db_pool.closeall()
print("\n[!] SELURUH DATA SELESAI DI-INDEX KEDALAM DATABASE.")