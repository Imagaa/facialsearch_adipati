"use client";

import { useState, useRef } from "react";

type SearchStep = 'IDLE' | 'SCANNING_UPLOAD' | 'UPLOAD_FAILED' | 'SCANNING_LIVE' | 'SUCCESS' | 'TOTAL_FAILED';

export default function Home() {
  const [step, setStep] = useState<SearchStep>('IDLE');
  const [bib, setBib] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  
  type SearchResult = {
    file_name: string;
    gdrive_id: string;
    distance: number;
  };
  const [results, setResults] = useState<SearchResult[]>([]);
  
  const [feedbackMsg, setFeedbackMsg] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Tembak Server Python FastAPI
  const hitServerAPI = async (bibInput: string, fileBlob: Blob, source: 'UPLOAD' | 'LIVE') => {
    try {
      const formData = new FormData();
      formData.append('bib', bibInput);
      formData.append('file', fileBlob, 'selfie.jpg');

      // Taktik Dinamis: Gunakan ENV Vercel, jika kosong fallback ke localhost
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

      const res = await fetch(`${API_BASE_URL}/search-double-tap`, {
        method: "POST",
        body: formData
      });
      
      const data = await res.json();

      if (data.status === 'success' && data.matches_found > 0) {
        setResults(data.data);
        setStep('SUCCESS');
        setFeedbackMsg("Ini dia momen luar biasa Anda!");
        stopCamera();
      } else {
        triggerFallback(source);
      }
    } catch (err) {
      console.error(err);
      triggerFallback('UPLOAD');
    }
  };

  const triggerFallback = (source: 'UPLOAD' | 'LIVE') => {
    if (source === 'UPLOAD') {
      setStep('UPLOAD_FAILED');
      setFeedbackMsg("Hmm.. Wajah tidak terdeteksi atau sudutnya kurang pas. 🕵️‍♂️ Mari kita coba Live Selfie untuk akurasi maksimal!");
    } else {
      setStep('TOTAL_FAILED');
      setFeedbackMsg("Mohon maaf yang sebesar-besarnya. Galeri sudah disisir dengan radar AI, namun foto Anda belum ditemukan. 😔 Lensa fotografer mungkin terlewat. Anda bisa mencarinya manual!");
      stopCamera();
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bib || !imageFile) {
      alert("Harap masukkan BIB dan unggah foto.");
      return;
    }
    setStep('SCANNING_UPLOAD');
    setFeedbackMsg("Mengirim data ke Radar Pusat...");
    await hitServerAPI(bib, imageFile, 'UPLOAD');
  };

  const startCamera = async () => {
    setStep('SCANNING_LIVE');
    setFeedbackMsg("Mohon tatap kamera...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      if (videoRef.current) videoRef.current.srcObject = stream;
      streamRef.current = stream;
    } catch (err) {
      console.error(err);
      alert("Akses kamera ditolak.");
      setStep('UPLOAD_FAILED');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const captureLiveSelfie = async () => {
    if (!videoRef.current) return;
    setFeedbackMsg("Membidik target...");
    
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      canvas.toBlob(async (blob) => {
        if (blob) {
          setFeedbackMsg("Menganalisis matriks wajah di server...");
          await hitServerAPI(bib, blob, 'LIVE');
        }
      }, 'image/jpeg', 0.9);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 text-gray-800 font-sans pb-20">
      <div className="bg-gradient-to-r from-teal-500 to-blue-600 p-8 text-center shadow-lg">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Adipati QRIS Run</h1>
        <p className="text-teal-100 mt-2 text-sm">Portal Pencarian Galeri (ArcFace 512D Core)</p>
      </div>

      <div className="max-w-2xl mx-auto px-4 mt-8">
        
        {step === 'IDLE' && (
          <form onSubmit={handleUploadSubmit} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold mb-4">Temukan Foto Anda</h2>
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Nomor BIB</label>
              <input type="text" value={bib} onChange={(e) => setBib(e.target.value.toUpperCase())} placeholder="Contoh: A1203" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none uppercase" required />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-semibold mb-2">Foto Diri (Selfie Venue)</label>
              <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg" required />
            </div>
            <button type="submit" className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md">Cari Foto Saya</button>
          </form>
        )}

        {(step === 'SCANNING_UPLOAD' || (step === 'SCANNING_LIVE' && !streamRef.current)) && (
          <div className="text-center p-12 bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="w-16 h-16 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-lg font-medium text-teal-700">{feedbackMsg}</p>
          </div>
        )}

        {step === 'UPLOAD_FAILED' && (
          <div className="text-center p-8 bg-amber-50 rounded-2xl border border-amber-200">
            <p className="text-amber-800 font-medium mb-6">{feedbackMsg}</p>
            <button onClick={startCamera} className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-md">📷 Ambil Live Selfie Sekarang</button>
          </div>
        )}

        {step === 'SCANNING_LIVE' && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center">
            <p className="font-medium text-gray-700 mb-4">{feedbackMsg}</p>
            <div className="relative w-full max-w-sm mx-auto rounded-xl overflow-hidden bg-black mb-4 aspect-[3/4]">
              <video ref={videoRef} autoPlay playsInline muted className="object-cover w-full h-full transform scale-x-[-1]"></video>
            </div>
            <button onClick={captureLiveSelfie} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md">Kunci Target Wajah</button>
            <button onClick={() => { stopCamera(); setStep('IDLE'); }} className="mt-3 text-sm text-gray-500 underline">Batal</button>
          </div>
        )}

        {step === 'TOTAL_FAILED' && (
          <div className="text-center p-8 bg-red-50 rounded-2xl border border-red-200">
            <p className="text-red-800 font-medium mb-6">{feedbackMsg}</p>
            <a href="https://drive.google.com/drive/u/0/folders/1E2OgzNbAtkcuyoXByjRoMGY2AX1wdWi2" target="_blank" rel="noreferrer" className="inline-block bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-md">🔍 Telusuri Galeri Manual</a>
            <button onClick={() => setStep('IDLE')} className="block mx-auto mt-6 text-sm text-gray-500 underline">Coba Ulang Pencarian AI</button>
          </div>
        )}

        {step === 'SUCCESS' && (
          <div>
            <div className="bg-green-50 p-4 rounded-xl border border-green-200 text-center mb-6">
              <h2 className="text-green-800 font-bold text-xl">{feedbackMsg}</h2>
              <button onClick={() => { setStep('IDLE'); setResults([]); setBib(''); setImageFile(null); }} className="mt-2 text-sm text-green-700 underline">Cari Peserta Lain</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {results.map((item, idx) => {
                const isSynced = item.gdrive_id !== 'WAITING_SYNC';
                
                // TAKTIK HYBRID: Thumbnail Google + Lazy Loading + Safe Fallback
                const previewUrl = isSynced ? `https://drive.google.com/thumbnail?id=${item.gdrive_id}&sz=w800` : null;
                
                // Query mutlak mencari nama file di folder GDrive Anda
                const fallbackSearchUrl = `https://drive.google.com/drive/u/0/search?q=type:image%20title:"${item.file_name}"`;

                return (
                  <div key={idx} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                    {isSynced ? (
                      <div className="h-64 w-full bg-gray-100 relative overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={previewUrl!} 
                          alt={item.file_name} 
                          className="object-cover w-full h-full text-transparent transition-opacity duration-300" 
                          loading="lazy"
                          onError={(e) => {
                            const target = e.currentTarget;
                            const id = item.gdrive_id;
                            
                            // AMUNISI 4 LAPIS (Bypass Rate-Limit Google)
                            const lh3Url = `https://lh3.googleusercontent.com/d/${id}`;
                            const ucUrl = `https://drive.google.com/uc?export=view&id=${id}`;
                            const fallbackUrl = `https://placehold.co/600x400/f0fdfa/0f766e?text=Pratinjau+Dibatasi+Google%5CnSilakan+Unduh+Langsung`;

                            if (target.src.includes('thumbnail')) {
                              target.src = lh3Url; // Lapis 2: Endpoint CDN rahasia Google
                            } else if (target.src === lh3Url) {
                              target.src = ucUrl;  // Lapis 3: Endpoint Original
                            } else if (target.src === ucUrl) {
                              target.src = fallbackUrl; // Lapis 4: Placeholder elegan (UI Aman)
                              target.className = "object-contain w-full h-full p-4 opacity-80";
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <div className="h-64 bg-teal-50 flex flex-col items-center justify-center text-teal-700 text-center p-6 border-b border-teal-100">
                        <svg className="w-12 h-12 mb-3 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        <p className="text-sm font-semibold mb-1">Resolusi Tinggi Tersedia</p>
                        <p className="text-xs opacity-80">Menunggu Sinkronisasi ID</p>
                      </div>
                    )}
                    <div className="p-4 flex flex-col flex-grow">
                      <p className="font-bold text-gray-800 break-words">{item.file_name}</p>
                      {/* Mengubah format jarak matriks menjadi persentase akurasi yang lebih mudah dipahami pelari */}
                      <p className="text-xs text-gray-500 mb-4">Akurasi Kemiripan: {((1 - item.distance) * 100).toFixed(1)}%</p>
                      
                      <div className="mt-auto">
                        <a href={isSynced ? `https://drive.google.com/uc?export=download&id=${item.gdrive_id}` : fallbackSearchUrl} target="_blank" rel="noreferrer" className="block w-full text-center bg-teal-50 hover:bg-teal-100 text-teal-700 font-semibold py-2 px-4 rounded-lg border border-teal-200 transition-colors">
                          {isSynced ? '⬇️ Unduh Foto Langsung' : '🔗 Lihat di Google Drive'}
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </main>
  );
}