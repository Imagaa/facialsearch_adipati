// --- GLOBAL PATCH UNTUK MENAMBAL BUG TEXTENCODER TENSORFLOW ---
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
// ---------------------------------------------------------------

require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// --- PENGAKTIFAN WASM ---
const tf = require('@tensorflow/tfjs');
require('@tensorflow/tfjs-backend-wasm');
tf.setBackend('wasm');
// ------------------------

// Panggil Face-API setelah WASM hidup dan Global tertambal
const faceapi = require('@vladmandic/face-api/dist/face-api.js'); 

const { Canvas, Image, ImageData } = require('canvas');
const Tesseract = require('tesseract.js');

// Menambal environment Face-API agar bertindak seperti Browser
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

// PATH TARGET MULTI-RADAR (Array direktori)
const TARGET_DIRS = [
    "G:/Drive Saya/Raw",
    "D:/4" 
];
const MODEL_URL = path.join(__dirname, 'public', 'models');

const db = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Wajib untuk koneksi eksternal ke Railway
});

async function loadModels() {
    console.log("[*] Memuat otak AI...");
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_URL);
    console.log("[+] Otak AI siap.");
}

async function processImage(filePath, agnosticName) {
    try {
        const img = await canvas.loadImage(filePath);
        
        // 1. Ekstraksi Wajah (Vector 128-d)
        const detections = await faceapi.detectSingleFace(img)
            .withFaceLandmarks()
            .withFaceDescriptor();
            
        let faceVector = null;
        if (detections) {
            faceVector = `[${detections.descriptor.join(',')}]`; // Format vector PostgreSQL
        }

        // 2. Ekstraksi BIB (OCR)
        const { data: { text } } = await Tesseract.recognize(filePath, 'eng');
        // Membersihkan hasil OCR: ambil hanya angka panjang
        const bibMatches = text.match(/\b\d{3,5}\b/g) || []; 
        
        // 3. Simpan ke Database
        const query = `
            INSERT INTO runner_photos (file_name, gdrive_id, bib_numbers, face_vector)
            VALUES ($1, $2, $3, $4)
        `;
        // Gdrive ID diset dummy 'WAITING_SYNC' sementara, bisa di-update nanti via API GDrive
        await db.query(query, [agnosticName, 'WAITING_SYNC', bibMatches, faceVector]);
        
        console.log(`[DONE] ${agnosticName} | BIB: ${bibMatches.join(', ')} | Wajah: ${faceVector ? 'Ya' : 'Tidak'}`);

    } catch (error) {
        console.error(`[ERROR] Gagal memproses ${agnosticName}:`, error.message);
    }
}

async function run() {
    await db.connect();
    await loadModels();

    console.log(`[*] Memulai pemindaian Multi-Radar...\n`);

    for (const baseDir of TARGET_DIRS) {
        if (!fs.existsSync(baseDir)) {
            console.log(`[SKIP] Partisi/Direktori tidak ditemukan: ${baseDir}`);
            continue;
        }

        console.log(`\n[>] MENYAPU DIREKTORI: ${baseDir}`);
        const fgFolders = fs.readdirSync(baseDir);
        
        for (const fg of fgFolders) {
            const fgPath = path.join(baseDir, fg);
            if (!fs.statSync(fgPath).isDirectory()) continue;

            const files = fs.readdirSync(fgPath).filter(f => f.match(/\.(jpg|jpeg|png)$/i));
            for (const file of files) {
                const filePath = path.join(fgPath, file);
                const agnosticName = `${fg}/${file}`;
                await processImage(filePath, agnosticName);
            }
        }
    }

    console.log("\n[!] SELURUH FOTO SELESAI DI-INDEX.");
    await db.end();
}

// Eksekusi
run();