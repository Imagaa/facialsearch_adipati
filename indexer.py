import os
import cv2
import psycopg2
import pytesseract
import easyocr
import re
import concurrent.futures
from psycopg2 import pool
from insightface.app import FaceAnalysis
from ultralytics import YOLO
import warnings

warnings.filterwarnings("ignore", category=FutureWarning)

# ================= KONFIGURASI MUTLAK =================
DB_URL = "postgresql://postgres:dEgJyweoBvYYmWLVoKOKiPZuHYHCsuax@thomas.proxy.rlwy.net:47314/railway"
TARGET_DIR = r"G:\My Drive\AQR 2026"
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

print("[*] ENGINE START: SUPER-MONOLITH HETEROGENEOUS (TRI-CORE VISION & MEMORY)")

# 1. Otak Wajah (CPU)
app = FaceAnalysis(name='buffalo_sc', providers=['CPUExecutionProvider'])
app.prepare(ctx_id=0, det_size=(640, 640))

# 2. Otak Pakaian (GPU)
yolo_model = YOLO('yolov8n.pt')

# 3. Otak Deep Learning OCR (GPU)
reader = easyocr.Reader(['en'], gpu=True)

# 4. Koneksi Database Relasional
db_pool = psycopg2.pool.ThreadedConnectionPool(1, 10, DB_URL)

# ================= CEK MEMORI DATABASE =================
print("[*] Membaca ingatan database untuk Incremental Indexing...")
try:
    conn = db_pool.getconn()
    cursor = conn.cursor()
    cursor.execute("SELECT file_name FROM runner_photos;")
    # Simpan semua nama file yang sudah terindeks ke dalam Set (Memori super cepat)
    indexed_files = {row[0] for row in cursor.fetchall()}
    print(f"[*] Ditemukan {len(indexed_files)} foto yang sudah terindeks di database.")
except Exception as e:
    print(f"[FATAL] Gagal membaca database: {e}")
    indexed_files = set()
finally:
    cursor.close()
    db_pool.putconn(conn)
# =======================================================

def process_image(file_path, file_name, count):
    try:
        img = cv2.imread(file_path)
        if img is None: return

        max_dim = 1600
        h, w = img.shape[:2]
        img_area = h * w
        if max(h, w) > max_dim:
            scale = max_dim / max(h, w)
            img = cv2.resize(img, (int(w * scale), int(h * scale)))
            h, w = img.shape[:2]
            img_area = h * w

        # --- WAJAH ---
        faces = app.get(img)
        face_vectors = []
        for face in faces:
            embedding = face.embedding
            vec_str = "[" + ",".join(map(str, embedding)) + "]"
            face_vectors.append(vec_str)

        # --- BIB (TRI-CORE VISION) ---
        bib_matches = []
        results = yolo_model(img, classes=[0], verbose=False)
        
        for r in results:
            for box in r.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                if ((x2 - x1) * (y2 - y1)) < (img_area * 0.015):
                    continue
                
                padding_x = int((x2 - x1) * 0.05)
                padding_y = int((y2 - y1) * 0.05)
                crop_y1, crop_y2 = max(0, y1 - padding_y), min(h, y2 + padding_y)
                crop_x1, crop_x2 = max(0, x1 - padding_x), min(w, x2 + padding_x)
                person_crop = img[crop_y1:crop_y2, crop_x1:crop_x2]
                
                # --- CORE 1: EASYOCR ---
                rgb_crop = cv2.cvtColor(person_crop, cv2.COLOR_BGR2RGB)
                upscaled_crop = cv2.resize(rgb_crop, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
                ocr_results = reader.readtext(
                    upscaled_crop, detail=0, allowlist='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 
                    decoder='beamsearch', text_threshold=0.5, mag_ratio=2.0
                )
                text_easyocr = " ".join(ocr_results)

                # --- CORE 2: TESSERACT (CLAHE) ---
                gray = cv2.cvtColor(person_crop, cv2.COLOR_BGR2GRAY)
                ocr_img = cv2.resize(gray, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
                ocr_img = cv2.medianBlur(ocr_img, 3)
                
                clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
                enhanced_gray = clahe.apply(ocr_img)
                custom_config = r'--oem 3 --psm 11 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
                text_tesseract_clahe = pytesseract.image_to_string(enhanced_gray, config=custom_config)

                # --- CORE 3: TESSERACT (OTSU BINARIZATION) ---
                # Penyelamat warna aqua & kontras rendah
                _, otsu_thresh = cv2.threshold(ocr_img, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
                text_tesseract_otsu = pytesseract.image_to_string(otsu_thresh, config=custom_config)

                # --- FUSI & VALIDATOR ---
                combined_raw_text = f"{text_easyocr} {text_tesseract_clahe} {text_tesseract_otsu}"
                words = combined_raw_text.replace('\n', ' ').split()
                
                person_bibs = []
                for word in words:
                    clean_word = re.sub(r'[^A-Z0-9]', '', word)
                    if clean_word == "2026": continue
                    if re.fullmatch(r'[A-Z]\d{3,4}', clean_word) or re.fullmatch(r'\d{4}', clean_word):
                        person_bibs.append(clean_word)

                bib_matches.extend(person_bibs)

        bib_matches = list(set(bib_matches))

        # --- DATABASE TRANSACTION ---
        conn = db_pool.getconn()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT INTO runner_photos (file_name, gdrive_id, bib_numbers)
                VALUES (%s, %s, %s)
                ON CONFLICT (file_name) 
                DO UPDATE SET bib_numbers = EXCLUDED.bib_numbers
                RETURNING id;
            """, (file_name, 'WAITING_SYNC', bib_matches))
            
            photo_id = cursor.fetchone()[0]

            cursor.execute("DELETE FROM photo_faces WHERE photo_id = %s;", (photo_id,))

            for face_vec in face_vectors:
                cursor.execute("""
                    INSERT INTO photo_faces (photo_id, face_vector)
                    VALUES (%s, %s);
                """, (photo_id, face_vec))

            conn.commit()
            print(f"[{count}] [DONE] {file_name} | BIB: {bib_matches} | Wajah: {len(face_vectors)}")
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            cursor.close()
            db_pool.putconn(conn)

    except Exception as e:
        print(f"[{count}] [ERROR] Gagal memproses {file_name}: {e}")

# ================= PENGUMPULAN FILE =================
files_to_process = []
if os.path.exists(TARGET_DIR):
    for file in os.listdir(TARGET_DIR):
        if file.lower().endswith(('.png', '.jpg', '.jpeg')):
            # [LOGIKA MEMORI] Lewati file jika sudah ada di database
            if file in indexed_files:
                continue
            files_to_process.append((os.path.join(TARGET_DIR, file), file))
else:
    print(f"[FATAL] Folder tidak ditemukan: {TARGET_DIR}")

print(f"\n[*] Total {len(files_to_process)} FOTO BARU siap dieksekusi.")

if len(files_to_process) == 0:
    print("[*] Tidak ada foto baru untuk diproses. Mesin beristirahat.")
else:
    print("[*] MEMULAI PEMROSESAN BRUTAL. MOHON PANTAU SUHU LAPTOP ANDA...\n")
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        for i, (file_path, file_name) in enumerate(files_to_process, 1):
            executor.submit(process_image, file_path, file_name, i)

db_pool.closeall()
print("\n[!] OPERASI SELESAI.")