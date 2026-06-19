import cv2
import numpy as np
import psycopg2
from fastapi import FastAPI, UploadFile, Form, File
from fastapi.middleware.cors import CORSMiddleware
from insightface.app import FaceAnalysis
import uvicorn
import warnings

warnings.filterwarnings("ignore", category=FutureWarning)

app_api = FastAPI()

# Konfigurasi CORS Mutlak agar Next.js diizinkan menembak API ini
app_api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False, # HARAM bernilai True jika origins menggunakan wildcard "*" di server produksi
    allow_methods=["*"],
    allow_headers=["*"],
)

print("[*] MEMUAT MESIN ARCFACE 512D (MATCHED WITH INDEXER)...")
face_app = FaceAnalysis(name='buffalo_sc', providers=['CPUExecutionProvider'])
face_app.prepare(ctx_id=0, det_size=(640, 640))

import os
# Akan mengambil URL dari Environment Variable Railway, jika tidak ada, gunakan hardcode (untuk lokal)
DB_URL = os.getenv("DATABASE_URL", "postgresql://postgres:dEgJyweoBvYYmWLVoKOKiPZuHYHCsuax@thomas.proxy.rlwy.net:47314/railway")

@app_api.post("/search-double-tap")
# Taktik Baru: bib bersifat opsional (default string kosong)
async def search_double_tap(bib: str = Form(""), file: UploadFile = File(...)):
    # 1. Baca Gambar
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    # 2. Ekstrak Wajah
    faces = face_app.get(img)
    if len(faces) == 0:
        return {"status": "failed", "message": "no_face_detected"}
    
    # Ambil wajah terbesar (selfie)
    faces = sorted(faces, key=lambda x: (x.bbox[2]-x.bbox[0]) * (x.bbox[3]-x.bbox[1]), reverse=True)
    embedding = faces[0].embedding
    vector_str = "[" + ",".join(map(str, embedding)) + "]"

    # 3. KONEKSI & SMART QUERY
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    
    if bib and bib.strip() != "":
        # =====================================================================
        # SKENARIO 1: UPLOAD (BIB + WAJAH) -> SMART HYBRID SEARCH
        # Logika: Cari yang Wajahnya Mirip ATAU BIB-nya Mirip.
        # Mitigasi: Ambang batas wajah dilonggarkan sedikit (0.65). 
        # Jika hanya BIB yang cocok tapi wajah beda, nilai distance diset 2.0 (taruh di bawah).
        # =====================================================================
        query = """
            WITH matched_photos AS (
                SELECT r.id, r.file_name, r.gdrive_id, r.bib_numbers,
                       MIN(f.face_vector <=> %s) as face_distance
                FROM runner_photos r
                LEFT JOIN photo_faces f ON r.id = f.photo_id
                GROUP BY r.id, r.file_name, r.gdrive_id, r.bib_numbers
            )
            SELECT file_name, gdrive_id, bib_numbers, COALESCE(face_distance, 2.0) as final_distance
            FROM matched_photos
            WHERE face_distance < 0.65 OR bib_numbers::text ILIKE %s
            ORDER BY final_distance ASC
            LIMIT 20;
        """
        cur.execute(query, (vector_str, f"%{bib}%"))
    else:
        # =====================================================================
        # SKENARIO 2: LIVE SELFIE (MURNI WAJAH)
        # Logika: Abaikan BIB sama sekali. Fokus 100% pada ekstraksi matriks HP.
        # =====================================================================
        query = """
            WITH matched_photos AS (
                SELECT r.id, r.file_name, r.gdrive_id, r.bib_numbers,
                       MIN(f.face_vector <=> %s) as face_distance
                FROM runner_photos r
                JOIN photo_faces f ON r.id = f.photo_id
                GROUP BY r.id, r.file_name, r.gdrive_id, r.bib_numbers
            )
            SELECT file_name, gdrive_id, bib_numbers, face_distance as final_distance
            FROM matched_photos
            WHERE face_distance < 0.60
            ORDER BY final_distance ASC
            LIMIT 15;
        """
        cur.execute(query, (vector_str,))
        
    rows = cur.fetchall()
    cur.close()
    conn.close()

    if not rows:
        return {"status": "failed", "message": "no_match_found"}

    results = []
    for row in rows:
        results.append({
            "file_name": row[0],
            "gdrive_id": row[1],
            "bib_numbers": row[2] if row[2] else "",
            # Normalisasi: Jika distance 2.0 (Hasil dari BIB murni tanpa kecocokan wajah), 
            # setel visual distance agar terlihat masuk akal (misal jadi 0.99)
            "distance": float(row[3]) if float(row[3]) <= 1.0 else 0.99
        })

    return {"status": "success", "matches_found": len(results), "data": results}

if __name__ == "__main__":
    print("[*] API SNIPER STANDBY ON PORT 8000...")
    uvicorn.run(app_api, host="127.0.0.1", port=8000)