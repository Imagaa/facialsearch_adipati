const fs = require('fs');
const path = require('path');

// URL Sumber dari repository resmi
const BASE_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/';

// Daftar file otak yang dibutuhkan (Deteksi Wajah, Titik Wajah, Ekstraksi Vektor)
const FILES = [
    'ssd_mobilenetv1_model-weights_manifest.json',
    'ssd_mobilenetv1_model-shard1',
    'ssd_mobilenetv1_model-shard2',
    'face_landmark_68_model-weights_manifest.json',
    'face_landmark_68_model-shard1',
    'face_recognition_model-weights_manifest.json',
    'face_recognition_model-shard1',
    'face_recognition_model-shard2'
];

const TARGET_DIR = path.join(__dirname, 'public', 'models');

async function fetchModels() {
    console.log("[*] Memulai pengunduhan jaringan saraf tiruan (Neural Network)...");
    
    // Pastikan folder public/models ada
    if (!fs.existsSync(TARGET_DIR)){
        fs.mkdirSync(TARGET_DIR, { recursive: true });
    }

    for (const file of FILES) {
        console.log(`[-] Menarik file: ${file}`);
        try {
            const response = await fetch(BASE_URL + file);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            fs.writeFileSync(path.join(TARGET_DIR, file), buffer);
        } catch (error) {
            console.error(`[ERROR] Gagal mengunduh ${file}:`, error.message);
        }
    }
    console.log("\n[+] MUTLAK: Seluruh Otak AI Berhasil Ditanam di public/models!");
}

fetchModels();