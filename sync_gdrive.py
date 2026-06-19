import psycopg2
from psycopg2.extras import execute_batch
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
import time

# ================= KONFIGURASI MUTLAK =================
DB_URL = "postgresql://postgres:dEgJyweoBvYYmWLVoKOKiPZuHYHCsuax@thomas.proxy.rlwy.net:47314/railway"
FOLDER_ID = "1E2OgzNbAtkcuyoXByjRoMGY2AX1wdWi2"
SCOPES = ['https://www.googleapis.com/auth/drive.readonly']
SERVICE_ACCOUNT_FILE = 'credentials.json'

def run_sync():
    print("[*] ENGINE START: GDRIVE-POSTGRESQL BATCH SYNCHRONIZER")
    
    # 1. Otentikasi Google Drive
    try:
        creds = Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE, scopes=SCOPES)
        drive_service = build('drive', 'v3', credentials=creds)
        print("[+] Berhasil terhubung ke Google Drive API.")
    except Exception as e:
        print(f"[FATAL] Gagal membaca credentials.json: {e}")
        return

    # 2. Menyedot 8.000+ Data dari Drive (Pagination)
    print(f"[*] Sedang menyedot metadata file dari folder ID: {FOLDER_ID}...")
    file_mapping = [] # Format: [(gdrive_id, file_name)]
    page_token = None
    
    while True:
        results = drive_service.files().list(
            q=f"'{FOLDER_ID}' in parents and trashed=false",
            pageSize=1000,
            fields="nextPageToken, files(id, name)",
            pageToken=page_token
        ).execute()
        
        items = results.get('files', [])
        for item in items:
            file_mapping.append((item['id'], item['name']))
            
        page_token = results.get('nextPageToken', None)
        if page_token is None:
            break

    total_files = len(file_mapping)
    print(f"[+] Selesai! Berhasil memetakan {total_files} file dari Google Drive.")
    
    if total_files == 0:
        return

    # 3. Batch Update ke PostgreSQL Railway
    print("[*] Membuka koneksi ke PostgreSQL Railway...")
    try:
        conn = psycopg2.connect(DB_URL)
        cursor = conn.cursor()
        
        # Query Update yang dioptimasi
        update_query = """
            UPDATE runner_photos 
            SET gdrive_id = %s 
            WHERE file_name = %s;
        """
        
        print("[*] Mengeksekusi Injeksi Matriks (Batch Update)...")
        start_time = time.time()
        
        # Eksekusi Brutal N+1 Prevention: Mengirim ribuan update dalam 1 paket query
        execute_batch(cursor, update_query, file_mapping, page_size=1000)
        conn.commit()
        
        end_time = time.time()
        print(f"[SUCCESS] {total_files} baris database berhasil diperbarui dalam {round(end_time - start_time, 2)} detik!")

    except Exception as e:
        print(f"[ERROR] Transaksi Database Gagal: {e}")
        if conn:
            conn.rollback()
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

if __name__ == "__main__":
    run_sync()