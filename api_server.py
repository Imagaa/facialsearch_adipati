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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("[*] MEMUAT MESIN ARCFACE 512D (MATCHED WITH INDEXER)...")
face_app = FaceAnalysis(name='buffalo_sc', providers=['CPUExecutionProvider'])
face_app.prepare(ctx_id=0, det_size=(640, 640))

DB_URL = "postgresql://postgres:dEgJyweoBvYYmWLVoKOKiPZuHYHCsuax@thomas.proxy.rlwy.net:47314/railway"

@app_api.post("/search-double-tap")
async def search_double_tap(bib: str = Form(...), file: UploadFile = File(...)):
    # 1. Baca Gambar dari Frontend
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    # 2. Ekstrak Wajah
    faces = face_app.get(img)
    if len(faces) == 0:
        return {"status": "failed", "message": "no_face_detected"}
    
    # Ambil wajah terbesar (biasanya yang selfie)
    faces = sorted(faces, key=lambda x: (x.bbox[2]-x.bbox[0]) * (x.bbox[3]-x.bbox[1]), reverse=True)
    embedding = faces[0].embedding
    vector_str = "[" + ",".join(map(str, embedding)) + "]"

    # 3. Double-Tap Query ke PostgreSQL Railway
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    
    # Batas toleransi jarak Cosine ArcFace adalah 0.6 (Semakin mendekati 0 = wajah yang sama)
    query = """
        SELECT 
            r.file_name, 
            r.gdrive_id, 
            r.bib_numbers, 
            (f.face_vector <=> %s) AS distance 
        FROM runner_photos r
        JOIN photo_faces f ON r.id = f.photo_id
        WHERE r.bib_numbers::text ILIKE %s
        AND (f.face_vector <=> %s) < 0.6
        ORDER BY distance ASC
        LIMIT 10;
    """
    
    cur.execute(query, (vector_str, f"%{bib}%", vector_str))
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
            "distance": float(row[3])
        })

    return {"status": "success", "matches_found": len(results), "data": results}

if __name__ == "__main__":
    print("[*] API SNIPER STANDBY ON PORT 8000...")
    uvicorn.run(app_api, host="127.0.0.1", port=8000)