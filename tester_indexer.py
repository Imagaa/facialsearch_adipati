import os
import cv2
import re
import pytesseract
import easyocr
from insightface.app import FaceAnalysis
from ultralytics import YOLO
import warnings

warnings.filterwarnings("ignore", category=FutureWarning)

# ================= KONFIGURASI TESTER =================
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
TEST_IMAGE_PATH = r"G:\My Drive\AQR 2026\Adipati QRIS Run_J1025.jpg"
# ======================================================

def run_tester():
    print("\n[*] MEMULAI SIMULASI X-RAY: ADAPTIVE TRI-CORE VISION...")
    
    app = FaceAnalysis(name='buffalo_sc', providers=['CPUExecutionProvider'])
    app.prepare(ctx_id=0, det_size=(640, 640))
    yolo_model = YOLO('yolov8n.pt')
    reader = easyocr.Reader(['en'], gpu=True)

    print(f"\n[>] Membaca foto: {TEST_IMAGE_PATH}")
    img = cv2.imread(TEST_IMAGE_PATH)
    if img is None:
        print("[FATAL] Foto tidak ditemukan. Cek kembali TEST_IMAGE_PATH.")
        return

    max_dim = 1600
    h, w = img.shape[:2]
    img_area = h * w
    
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)))
        h, w = img.shape[:2]
        img_area = h * w

    faces = app.get(img)
    print(f"\n--- HASIL DETEKSI WAJAH ---")
    print(f"Total Wajah Ditemukan : {len(faces)} Wajah")

    bib_matches = []
    print("\n--- HASIL DETEKSI BIB (MODE X-RAY) ---")
    
    results = yolo_model(img, classes=[0], verbose=False) 
    
    person_count = 0
    for r in results:
        for box in r.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            if ((x2 - x1) * (y2 - y1)) < (img_area * 0.015):
                continue
                
            person_count += 1
            
            padding_x = int((x2 - x1) * 0.05)
            padding_y = int((y2 - y1) * 0.05)
            crop_y1, crop_y2 = max(0, y1 - padding_y), min(h, y2 + padding_y)
            crop_x1, crop_x2 = max(0, x1 - padding_x), min(w, x2 + padding_x)
            person_crop = img[crop_y1:crop_y2, crop_x1:crop_x2]
            
            cv2.imwrite(f"debug_manusia_{person_count}.jpg", person_crop)
            
            # ================= CORE 1: EASYOCR =================
            rgb_crop = cv2.cvtColor(person_crop, cv2.COLOR_BGR2RGB)
            upscaled_crop = cv2.resize(rgb_crop, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
            
            ocr_results = reader.readtext(
                upscaled_crop, detail=0, allowlist='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 
                decoder='beamsearch', text_threshold=0.5, mag_ratio=2.0
            )
            text_easyocr = " ".join(ocr_results)

            # ================= PRE-PROCESSING TESSERACT =================
            gray = cv2.cvtColor(person_crop, cv2.COLOR_BGR2GRAY)
            ocr_img = cv2.resize(gray, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
            ocr_img = cv2.medianBlur(ocr_img, 3)
            custom_config = r'--oem 3 --psm 11 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

            # ================= CORE 2: TESSERACT (CLAHE) =================
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
            enhanced_gray = clahe.apply(ocr_img)
            text_tesseract_clahe = pytesseract.image_to_string(enhanced_gray, config=custom_config)

            # ================= CORE 3: TESSERACT (MACRO-ADAPTIVE + MORPHOLOGY) =================
            blur_for_thresh = cv2.GaussianBlur(ocr_img, (5, 5), 0)
            
            # 1. Radar Raksasa: Block size 101, C 20 (Mencegah teks menjadi hollow/kerangka)
            adaptive_thresh = cv2.adaptiveThreshold(
                blur_for_thresh, 255, 
                cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                cv2.THRESH_BINARY, 101, 20
            )
            
            # 2. Pengelasan Matriks: Menambal pori-pori/keropos pada tinta hitam
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
            adaptive_thresh = cv2.morphologyEx(adaptive_thresh, cv2.MORPH_CLOSE, kernel)
            
            cv2.imwrite(f"debug_tesseract_adaptive_{person_count}.jpg", adaptive_thresh)
            text_tesseract_adaptive = pytesseract.image_to_string(adaptive_thresh, config=custom_config)

            # ================= FUSI & VALIDATOR =================
            combined_raw_text = f"{text_easyocr} {text_tesseract_clahe} {text_tesseract_adaptive}"
            
            print(f"\n[Manusia {person_count}]")
            print(f"  -> RAW EasyOCR         : {repr(text_easyocr)}")
            print(f"  -> RAW Tesseract CLAHE : {repr(text_tesseract_clahe)}")
            print(f"  -> RAW Tesseract ADAPTIVE: {repr(text_tesseract_adaptive)}")
            
            person_bibs = []
            words = combined_raw_text.replace('\n', ' ').split()
            
            for word in words:
                clean_word = re.sub(r'[^A-Z0-9]', '', word)
                if clean_word == "2026": continue
                if re.fullmatch(r'[A-Z]\d{3,4}', clean_word) or re.fullmatch(r'\d{4}', clean_word):
                    person_bibs.append(clean_word)

            person_bibs = list(set(person_bibs))
            if person_bibs:
                print(f"  -> Valid BIB           : {person_bibs}")
                bib_matches.extend(person_bibs)
            else:
                print(f"  -> Valid BIB           : KOSONG")

    print("\n================ KESIMPULAN ==================")
    print(f"Total Manusia Terfilter  : {person_count} Orang")
    print(f"BIB Final Database       : {list(set(bib_matches))}")
    print("==============================================")
    print(f"[*] Cek file 'debug_tesseract_adaptive_X.jpg' untuk melihat ketajaman pisau baru kita!")

if __name__ == "__main__":
    run_tester()