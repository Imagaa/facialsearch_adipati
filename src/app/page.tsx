"use client";

import { useState, useRef } from "react";

type SearchStep = 'IDLE' | 'SCANNING_UPLOAD' | 'SUCCESS_UPLOAD' | 'UPLOAD_FAILED' | 'CAMERA_READY' | 'SCANNING_LIVE' | 'SUCCESS_LIVE' | 'TOTAL_FAILED';

export default function Home() {
  const [step, setStep] = useState<SearchStep>('IDLE');
  const [bib, setBib] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  
  type SearchResult = {
    file_name: string;
    gdrive_id: string;
    distance: number;
    bib_numbers?: string;
  };
  const [results, setResults] = useState<SearchResult[]>([]);
  
  const [feedbackMsg, setFeedbackMsg] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const hitServerAPI = async (bibInput: string, fileBlob: Blob, source: 'UPLOAD' | 'LIVE') => {
    try {
      const formData = new FormData();
      formData.append('bib', source === 'LIVE' ? '' : bibInput);
      formData.append('file', fileBlob, 'selfie.jpg');

      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

      const res = await fetch(`${API_BASE_URL}/search-double-tap`, {
        method: "POST",
        body: formData
      });
      
      const data = await res.json();

      if (data.status === 'success' && data.matches_found > 0) {
        setResults(data.data);
        if (source === 'UPLOAD') {
          setStep('SUCCESS_UPLOAD');
          setFeedbackMsg("Momen luar biasa Anda berhasil ditemukan.");
        } else {
          setStep('SUCCESS_LIVE');
          setFeedbackMsg("Deteksi wajah berhasil memetakan momen Anda.");
        }
      } else {
        triggerFallback(source);
      }
    } catch (err) {
      console.error(err);
      triggerFallback(source);
    }
  };

  const triggerFallback = (source: 'UPLOAD' | 'LIVE') => {
    if (source === 'UPLOAD') {
      setStep('UPLOAD_FAILED');
      setFeedbackMsg("Wajah tidak terdeteksi presisi dari foto unggahan. Mari gunakan Live Face Recognition untuk akurasi maksimal.");
    } else {
      setStep('TOTAL_FAILED');
      setFeedbackMsg("Sistem tidak dapat memetakan kecocokan matriks wajah Anda dengan galeri. Silakan telusuri arsip secara manual.");
      stopCamera();
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageFile) {
      alert("Harap unggah foto wajah Anda terlebih dahulu.");
      return;
    }
    setStep('SCANNING_UPLOAD');
    setFeedbackMsg("Menyinkronkan data dengan pusat radar...");
    await hitServerAPI(bib, imageFile, 'UPLOAD');
  };

  const startCamera = async () => {
    setStep('CAMERA_READY');
    setFeedbackMsg("Menginisialisasi modul kamera. Mohon pastikan pencahayaan cukup.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      // Gunakan setTimeout untuk memastikan React telah me-render elemen <video> ke DOM
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 150);
    } catch (err) {
      console.error(err);
      alert("Akses kamera tidak diizinkan oleh sistem Anda.");
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
    setStep('SCANNING_LIVE');
    setFeedbackMsg("Mengekstrak matriks wajah untuk pencarian basis data...");
    
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      canvas.toBlob(async (blob) => {
        stopCamera(); // Segera matikan kamera untuk menghemat resource HP pelari
        if (blob) {
          await hitServerAPI(bib, blob, 'LIVE');
        }
      }, 'image/jpeg', 0.9);
    }
  };

  const renderPhotoGrid = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
      {results.map((item, idx) => {
        const isSynced = item.gdrive_id !== 'WAITING_SYNC';
        const previewUrl = isSynced ? `https://drive.google.com/thumbnail?id=${item.gdrive_id}&sz=w800` : null;
        const fallbackSearchUrl = `https://drive.google.com/drive/u/0/search?q=type:image%20title:"${item.file_name}"`;

        return (
          <div key={idx} className="bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 overflow-hidden flex flex-col shadow-xl hover:shadow-[0_0_30px_rgba(251,191,36,0.15)] transition-all duration-300 group">
            {isSynced ? (
              <div className="h-72 w-full bg-slate-950 relative overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={previewUrl!} 
                  alt={item.file_name} 
                  className="object-cover w-full h-full text-transparent group-hover:scale-105 transition-transform duration-700" 
                  loading="lazy"
                  onError={(e) => {
                    const target = e.currentTarget;
                    const id = item.gdrive_id;
                    const lh3Url = `https://lh3.googleusercontent.com/d/${id}`;
                    const ucUrl = `https://drive.google.com/uc?export=view&id=${id}`;
                    const fallbackUrl = `https://placehold.co/600x400/0f172a/fecdd3?text=Pratinjau+Dibatasi+Google%5CnSilakan+Unduh+Langsung`;

                    if (target.src.includes('thumbnail')) {
                      target.src = lh3Url;
                    } else if (target.src === lh3Url) {
                      target.src = ucUrl;
                    } else if (target.src === ucUrl) {
                      target.src = fallbackUrl;
                      target.className = "object-contain w-full h-full p-4 opacity-70";
                    }
                  }}
                />
                <div className="absolute top-4 right-4 bg-slate-900/90 backdrop-blur-sm border border-amber-500/50 text-amber-400 text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                  {((1 - item.distance) * 100).toFixed(1)}% Match
                </div>
              </div>
            ) : (
              <div className="h-72 w-full bg-slate-800 flex items-center justify-center p-6 text-center border-b border-slate-700">
                <div className="space-y-4">
                  <svg className="animate-spin w-10 h-10 text-red-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p className="text-slate-300 font-medium">Menunggu Sinkronisasi ID</p>
                  <p className="text-xs text-slate-500 truncate px-4">{item.file_name}</p>
                </div>
              </div>
            )}
            
            <div className="p-6 flex flex-col flex-grow justify-between space-y-6">
              <div>
                <p className="font-bold text-lg text-slate-200 truncate" title={item.file_name}>{item.file_name}</p>
                {item.bib_numbers && (
                  <p className="text-sm text-slate-400 mt-1 flex items-center gap-2">
                    <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                    BIB Terdeteksi: <span className="font-semibold text-slate-300">{item.bib_numbers}</span>
                  </p>
                )}
              </div>
              <div className="mt-auto">
                <a 
                  href={isSynced ? `https://drive.google.com/uc?export=download&id=${item.gdrive_id}` : fallbackSearchUrl} 
                  target="_blank" 
                  rel="noreferrer" 
                  className={`flex items-center justify-center gap-2 w-full text-center font-bold py-4 rounded-xl transition-all ${isSynced ? 'bg-slate-800 hover:bg-slate-700 text-red-400 border border-red-500/30 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  {isSynced ? 'Unduh Resolusi Tinggi' : 'Cari di Google Drive'}
                </a>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black text-slate-100 font-sans pb-20 selection:bg-red-500 selection:text-white">
      <div className="max-w-4xl mx-auto px-4 pt-12">
        
        {/* ================= HEADER & LOGOS ================= */}
        <div className="flex flex-col items-center justify-center space-y-6 mb-12 animate-in fade-in slide-in-from-top-8 duration-700">
          
          <div className="flex items-center justify-center gap-6 md:gap-10">
            <img 
              src="/logo-bi.webp" 
              alt="Bank Indonesia" 
              className="h-10 md:h-14 w-auto object-contain drop-shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:scale-105 transition-transform duration-500" 
            />
            <div className="h-10 md:h-12 w-px bg-slate-700/50 hidden sm:block"></div>
            <img 
              src="/logo-adipati.webp" 
              alt="Adipati QRIS Run 2026" 
              className="h-12 md:h-16 w-auto object-contain drop-shadow-[0_0_20px_rgba(251,191,36,0.3)] hover:scale-105 transition-transform duration-500" 
            />
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 pt-1">
            <img src="/logo-1.webp" alt="Sponsor 1" className="h-5 md:h-6 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity duration-300" />
            <img src="/logo-2.webp" alt="Sponsor 2" className="h-5 md:h-6 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity duration-300" />
            <img src="/logo-3.webp" alt="Sponsor 3" className="h-5 md:h-6 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity duration-300" />
          </div>

          <div className="text-center space-y-2 mt-6">
            <h1 className="text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-300 to-red-500 tracking-tight">
              Adipati QRIS Run 2026
            </h1>
            <h2 className="text-sm md:text-base font-bold text-red-400 tracking-[0.2em] uppercase">
              Facial Search AI Portal
            </h2>
          </div>
        </div>

        {/* ================= FLOW 1: IDLE (UPLOAD) ================= */}
        {step === 'IDLE' && (
          <form onSubmit={handleUploadSubmit} className="max-w-2xl mx-auto bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-6 md:p-8 rounded-3xl shadow-2xl space-y-6 transition-all animate-in fade-in duration-500">
            <h2 className="text-2xl font-bold text-amber-400 mb-2 text-center">Temukan Foto Anda</h2>
            
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                Nomor BIB (Wajib)
              </label>
              <input 
                type="text" 
                value={bib} 
                onChange={(e) => setBib(e.target.value.toUpperCase())} 
                placeholder="Contoh: A1203" 
                className="w-full px-4 py-4 bg-slate-950/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-red-500 outline-none uppercase text-white placeholder-slate-600 transition-all" 
                required
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                Foto Diri di Venue (Wajib)
              </label>
              <input 
                type="file" 
                accept="image/*" 
                onChange={(e) => setImageFile(e.target.files?.[0] || null)} 
                className="w-full px-4 py-4 bg-slate-950/50 border border-slate-700 rounded-xl text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-red-500/20 file:text-red-400 hover:file:bg-red-500/30 transition-all cursor-pointer" 
                required 
              />
            </div>

            <button type="submit" className="flex items-center justify-center gap-2 w-full py-4 mt-4 bg-gradient-to-r from-red-600 to-amber-500 hover:from-red-500 hover:to-amber-400 text-white font-bold rounded-xl shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:shadow-[0_0_25px_rgba(239,68,68,0.5)] hover:-translate-y-1 transition-all duration-300">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              Cari Hasil
            </button>

            <div className="relative flex items-center py-2 mt-2">
              <div className="flex-grow border-t border-slate-700"></div>
              <span className="flex-shrink-0 mx-4 text-slate-500 text-xs font-semibold uppercase tracking-widest">Atau</span>
              <div className="flex-grow border-t border-slate-700"></div>
            </div>

            <div className="space-y-3">
              <button 
                type="button" 
                onClick={startCamera} 
                className="flex flex-row items-center justify-center gap-3 w-full px-4 py-4 bg-slate-800/50 hover:bg-slate-700 text-amber-400 border border-slate-700 hover:border-amber-500/50 font-bold rounded-xl transition-all duration-300 leading-snug"
              >
                <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <span className="text-center">Langsung Cari dengan Facial Recognition Live</span>
              </button>
              <p className="text-xs text-center text-slate-500 font-medium px-4">
                (Hasil tidak seakurat BIB Checker + Image Validator)
              </p>
            </div>
          </form>
        )}

        {/* ================= FLOW 2: SUCCESS UPLOAD ================= */}
        {step === 'SUCCESS_UPLOAD' && (
          <div className="space-y-10 animate-in slide-in-from-bottom-10 duration-700">
            <div className="bg-gradient-to-r from-red-900/40 to-amber-900/40 p-8 rounded-3xl border border-red-500/30 text-center shadow-[0_0_40px_rgba(239,68,68,0.15)] backdrop-blur-xl">
              <svg className="w-16 h-16 text-amber-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <h2 className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-red-400 mb-2">
                {feedbackMsg}
              </h2>
            </div>
            
            {renderPhotoGrid()}

            <div className="max-w-2xl mx-auto bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-8 rounded-3xl text-center shadow-xl mt-12">
              <h3 className="text-lg font-bold text-slate-200 mb-4">Mencari foto lain yang belum tampil?</h3>
              <p className="text-sm text-slate-400 mb-6">Gunakan Face Recognition (Live Selfie) agar sistem memindai murni melalui kontur wajah Anda.</p>
              <button onClick={startCamera} className="flex items-center justify-center gap-2 w-full md:w-auto mx-auto px-8 py-4 bg-gradient-to-r from-red-600 to-amber-500 hover:from-red-500 hover:to-amber-400 text-white font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:scale-105">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Face Recognition (Live Selfie)
              </button>
            </div>
          </div>
        )}

        {/* ================= FLOW 3: UPLOAD FAILED ================= */}
        {step === 'UPLOAD_FAILED' && (
          <div className="max-w-2xl mx-auto text-center p-8 bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-red-500/30 shadow-[0_0_30px_rgba(239,68,68,0.15)] animate-in zoom-in-95 duration-500">
            <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <p className="text-slate-200 font-medium mb-8 leading-relaxed text-lg">{feedbackMsg}</p>
            <button onClick={startCamera} className="flex items-center justify-center gap-2 w-full md:w-auto mx-auto px-8 py-4 bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-400 hover:to-red-500 text-white font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(251,191,36,0.3)] hover:scale-105">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Face Recognition Sekarang
            </button>
          </div>
        )}

        {/* ================= FLOW 4: CAMERA READY ================= */}
        {step === 'CAMERA_READY' && (
          <div className="max-w-2xl mx-auto bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl shadow-2xl p-6 overflow-hidden flex flex-col items-center animate-in zoom-in-95 duration-500">
            <p className="font-medium text-amber-400 mb-6 text-center">{feedbackMsg}</p>
            <div className="relative w-full max-w-sm rounded-2xl overflow-hidden border-2 border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.3)] bg-slate-950 aspect-[3/4]">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} autoPlay playsInline muted className="object-cover w-full h-full transform scale-x-[-1]" />
              <div className="absolute inset-0 border-[6px] border-amber-400/30 rounded-2xl pointer-events-none"></div>
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-red-500/20 to-transparent w-full h-[20%] animate-[scan_2s_ease-in-out_infinite] pointer-events-none"></div>
            </div>
            
            <div className="mt-8 flex gap-4 w-full max-w-sm">
              <button onClick={() => { stopCamera(); setStep('IDLE'); }} className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-colors">
                Batal
              </button>
              <button onClick={captureLiveSelfie} className="flex-1 py-4 bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-400 hover:to-red-500 text-white font-bold rounded-xl shadow-lg transition-transform hover:scale-105">
                Kunci Wajah
              </button>
            </div>
          </div>
        )}

        {/* ================= LOADING SCANNING ================= */}
        {(step === 'SCANNING_UPLOAD' || step === 'SCANNING_LIVE') && (
          <div className="max-w-2xl mx-auto text-center p-12 bg-slate-900/60 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-800">
            <svg className="animate-spin w-16 h-16 text-amber-400 mx-auto mb-6 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-lg font-medium text-amber-400 animate-pulse">{feedbackMsg}</p>
          </div>
        )}

        {/* ================= FLOW 5: SUCCESS LIVE ================= */}
        {step === 'SUCCESS_LIVE' && (
          <div className="space-y-10 animate-in slide-in-from-bottom-10 duration-700">
            <div className="bg-gradient-to-r from-red-900/40 to-amber-900/40 p-8 rounded-3xl border border-red-500/30 text-center shadow-[0_0_40px_rgba(239,68,68,0.15)] backdrop-blur-xl">
              <svg className="w-16 h-16 text-amber-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <h2 className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-red-400 mb-6">
                {feedbackMsg}
              </h2>
              <button onClick={() => { setStep('IDLE'); setResults([]); setBib(''); setImageFile(null); }} className="flex items-center justify-center gap-2 mx-auto px-8 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-bold rounded-xl transition-all hover:shadow-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Kembali ke Awal
              </button>
            </div>
            {renderPhotoGrid()}
          </div>
        )}

        {/* ================= FLOW 6: TOTAL FAILED ================= */}
        {step === 'TOTAL_FAILED' && (
          <div className="max-w-2xl mx-auto text-center p-8 bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-800 shadow-2xl animate-in zoom-in-95 duration-500">
            <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <p className="text-slate-300 font-medium mb-8 leading-relaxed text-lg">{feedbackMsg}</p>
            <a href="https://drive.google.com/drive/u/0/folders/1E2OgzNbAtkcuyoXByjRoMGY2AX1wdWi2" target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 w-full md:w-auto mx-auto px-8 py-4 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/50 font-bold rounded-xl transition-all hover:-translate-y-1 shadow-md mb-4">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg>
              Telusuri Galeri Manual
            </a>
            <button onClick={() => setStep('IDLE')} className="block w-full text-center py-3 text-sm text-red-400 hover:text-red-300 underline underline-offset-4 transition-colors mt-2">
              Coba Ulang Pencarian
            </button>
          </div>
        )}

        {/* ================= FOOTER ================= */}
        <div className="mt-16 pb-4 text-center">
          <p className="text-xs text-slate-600 font-medium tracking-wide">
            V0.1 @Imaga Dev - Web ini adalah produk prototipe, semua bug dan error logic yang terjadi memang dalam masa pengembangan
          </p>
        </div>

      </div>
    </main>
  );
}