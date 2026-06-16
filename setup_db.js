require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const db = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Menembus keamanan eksternal
});

async function runSetup() {
    try {
        console.log("[*] Mencoba menembus database Railway...");
        await db.connect();
        console.log("[+] Terhubung! Mengeksekusi injeksi skema...");

        const query = `
            CREATE EXTENSION IF NOT EXISTS vector;
            CREATE EXTENSION IF NOT EXISTS pg_trgm;

            CREATE TABLE IF NOT EXISTS runner_photos (
                id SERIAL PRIMARY KEY,
                file_name VARCHAR(255) NOT NULL,
                gdrive_id VARCHAR(255) NOT NULL,
                bib_numbers TEXT[],
                face_vector vector(128),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_bib_numbers ON runner_photos USING GIN (bib_numbers);
        `;

        await db.query(query);
        console.log("[+] MUTLAK: Ekstensi AI dan Tabel 'runner_photos' berhasil ditanam!");

    } catch (error) {
        console.error("[FATAL ERROR]:", error.message);
    } finally {
        await db.end();
        console.log("[*] Koneksi diputus. Mesin database siap digunakan.");
    }
}

runSetup();