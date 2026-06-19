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
      // Saat LIVE, kita KOSONGKAN bibInput agar backend melakukan murni Face Recognition tanpa filter BIB
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
          setFeedbackMsg("Momen luar biasa Anda ditemukan!");
        } else {
          setStep('SUCCESS_LIVE');
          setFeedbackMsg("Deteksi wajah berhasil! Ini momen Anda.");
          stopCamera();
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
      setFeedbackMsg("Foto Anda dengan BIB tersebut belum ditemukan. Namun jangan khawatir, mari cari menggunakan fitur Face Recognition murni (Live Selfie)!");
    } else {
      setStep('TOTAL_FAILED');
      setFeedbackMsg("Mohon maaf, dengan 2000++ pelari, tim fotografer kami mungkin terlewat mengabadikan momen Anda, atau sudut wajah tidak terdeteksi mesin. Anda dapat mencarinya secara manual di Galeri G-Drive kami.");
      stopCamera();
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bib || !imageFile) {
      alert("Harap masukkan Nomor BIB dan unggah foto wajah Anda.");
      return;
    }
    setStep('SCANNING_UPLOAD');
    setFeedbackMsg("Mengirim data pencarian ke Radar Pusat...");
    await hitServerAPI(bib, imageFile, 'UPLOAD');
  };

  const startCamera = async () => {
    setStep('CAMERA_READY');
    setFeedbackMsg("Mohon tatap kamera dan pastikan cahaya cukup...");
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
    setStep('SCANNING_LIVE');
    setFeedbackMsg("Menganalisis matriks wajah murni ke database...");
    
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      canvas.toBlob(async (blob) => {
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
                <div className="absolute top-4 right-4 bg-slate-900/80 backdrop-blur-sm border border-amber-500/50 text-amber-400 text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                  {((1 - item.distance) * 100).toFixed(1)}% Match
                </div>
              </div>
            ) : (
              <div className="h-72 w-full bg-slate-800 flex items-center justify-center p-6 text-center border-b border-slate-700">
                <div className="space-y-4">
                  <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-slate-300 font-medium">Menunggu Sinkronisasi ID</p>
                  <p className="text-xs text-slate-500 truncate px-4">{item.file_name}</p>
                </div>
              </div>
            )}
            
            <div className="p-6 flex flex-col flex-grow justify-between space-y-6">
              <div>
                <p className="font-bold text-lg text-slate-200 truncate" title={item.file_name}>{item.file_name}</p>
                {item.bib_numbers && (
                  <p className="text-sm text-slate-400 mt-1">
                    BIB Terdeteksi: <span className="font-semibold text-slate-300">{item.bib_numbers}</span>
                  </p>
                )}
              </div>
              <div className="mt-auto">
                <a 
                  href={isSynced ? `https://drive.google.com/uc?export=download&id=${item.gdrive_id}` : fallbackSearchUrl} 
                  target="_blank" 
                  rel="noreferrer" 
                  className={`block w-full text-center font-bold py-4 rounded-xl transition-all ${isSynced ? 'bg-slate-800 hover:bg-slate-700 text-red-400 border border-red-500/30 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}
                >
                  {isSynced ? '⬇️ Unduh Foto Resolusi Tinggi' : '🔍 Cari di Google Drive'}
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
        <div className="flex flex-col items-center justify-center space-y-8 mb-12 animate-in fade-in slide-in-from-top-8 duration-700">
          
          <div className="flex items-center justify-center gap-6 md:gap-12">
            <img 
              src="/logo-bi.webp" 
              alt="Bank Indonesia" 
              className="h-20 md:h-32 w-auto object-contain drop-shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:scale-105 transition-transform duration-500" 
            />
            <div className="h-16 md:h-24 w-px bg-slate-700/50 hidden sm:block"></div>
            <img 
              src="/logo-adipati.webp" 
              alt="Adipati QRIS Run 2026" 
              className="h-28 md:h-44 w-auto object-contain drop-shadow-[0_0_20px_rgba(251,191,36,0.3)] hover:scale-105 transition-transform duration-500" 
            />
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-4 md:gap-8 pt-2">
            <img src="/logo-1.webp" alt="Sponsor 1" className="h-8 md:h-12 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity duration-300" />
            <img src="/logo-2.webp" alt="Sponsor 2" className="h-8 md:h-12 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity duration-300" />
            <img src="/logo-3.webp" alt="Sponsor 3" className="h-8 md:h-12 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity duration-300" />
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
              <label className="block text-sm font-semibold text-slate-300 uppercase tracking-wider">Nomor BIB (Wajib)</label>
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
              <label className="block text-sm font-semibold text-slate-300 uppercase tracking-wider">Foto Diri di Venue (Wajib)</label>
              <input 
                type="file" 
                accept="image/*" 
                onChange={(e) => setImageFile(e.target.files?.[0] || null)} 
                className="w-full px-4 py-4 bg-slate-950/50 border border-slate-700 rounded-xl text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-red-500/20 file:text-red-400 hover:file:bg-red-500/30 transition-all cursor-pointer" 
                required 
              />
            </div>

            <button type="submit" className="w-full py-4 mt-4 bg-gradient-to-r from-red-600 to-amber-500 hover:from-red-500 hover:to-amber-400 text-white font-bold rounded-xl shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:shadow-[0_0_25px_rgba(239,68,68,0.5)] hover:-translate-y-1 transition-all duration-300">
              🔍 Cari Hasil
            </button>
          </form>
        )}

        {/* ================= FLOW 2: SUCCESS UPLOAD ================= */}
        {step === 'SUCCESS_UPLOAD' && (
          <div className="space-y-10 animate-in slide-in-from-bottom-10 duration-700">
            <div className="bg-gradient-to-r from-red-900/40 to-amber-900/40 p-8 rounded-3xl border border-red-500/30 text-center shadow-[0_0_40px_rgba(239,68,68,0.15)] backdrop-blur-xl">
              <div className="text-4xl mb-4">🎉</div>
              <h2 className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-red-400 mb-2">
                {feedbackMsg}
              </h2>
            </div>
            
            {renderPhotoGrid()}

            <div className="max-w-2xl mx-auto bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-8 rounded-3xl text-center shadow-xl mt-12">
              <h3 className="text-lg font-bold text-slate-200 mb-4">Ingin mencari fotomu yang lain yang mungkin belum masuk di list ini?</h3>
              <p className="text-sm text-slate-400 mb-6">Gunakan fitur Face Recognition dengan Face-Scanning (Live Selfie) agar sistem memindai murni melalui kontur wajah Anda.</p>
              <button onClick={startCamera} className="w-full md:w-auto px-8 py-4 bg-gradient-to-r from-red-600 to-amber-500 hover:from-red-500 hover:to-amber-400 text-white font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:scale-105">
                📸 Cari Menggunakan Live Selfie
              </button>
            </div>
          </div>
        )}

        {/* ================= FLOW 3: UPLOAD FAILED ================= */}
        {step === 'UPLOAD_FAILED' && (
          <div className="max-w-2xl mx-auto text-center p-8 bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-red-500/30 shadow-[0_0_30px_rgba(239,68,68,0.15)] animate-in zoom-in-95 duration-500">
            <div className="text-5xl mb-4">🕵️‍♂️</div>
            <p className="text-slate-200 font-medium mb-8 leading-relaxed text-lg">{feedbackMsg}</p>
            <button onClick={startCamera} className="w-full md:w-auto px-8 py-4 bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-400 hover:to-red-500 text-white font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(251,191,36,0.3)] hover:scale-105">
              📸 Buka Kamera untuk Face Recognition
            </button>
          </div>
        )}

        {/* ================= FLOW 4: CAMERA READY ================= */}
        {step === 'CAMERA_READY' && streamRef.current && (
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
            <div className="w-16 h-16 border-4 border-red-500 border-t-amber-400 rounded-full animate-spin mx-auto mb-6 shadow-[0_0_15px_rgba(239,68,68,0.5)]"></div>
            <p className="text-lg font-medium text-amber-400 animate-pulse">{feedbackMsg}</p>
          </div>
        )}

        {/* ================= FLOW 5: SUCCESS LIVE ================= */}
        {step === 'SUCCESS_LIVE' && (
          <div className="space-y-10 animate-in slide-in-from-bottom-10 duration-700">
            <div className="bg-gradient-to-r from-red-900/40 to-amber-900/40 p-8 rounded-3xl border border-red-500/30 text-center shadow-[0_0_40px_rgba(239,68,68,0.15)] backdrop-blur-xl">
              <div className="text-4xl mb-4">🎉</div>
              <h2 className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-red-400 mb-6">
                {feedbackMsg}
              </h2>
              <button onClick={() => { setStep('IDLE'); setResults([]); setBib(''); setImageFile(null); }} className="px-8 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-bold rounded-xl transition-all hover:shadow-lg">
                🔄 Kembali ke Awal
              </button>
            </div>
            {renderPhotoGrid()}
          </div>
        )}

        {/* ================= FLOW 6: TOTAL FAILED ================= */}
        {step === 'TOTAL_FAILED' && (
          <div className="max-w-2xl mx-auto text-center p-8 bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-800 shadow-2xl animate-in zoom-in-95 duration-500">
            <div className="text-5xl mb-4">😔</div>
            <p className="text-slate-300 font-medium mb-8 leading-relaxed text-lg">{feedbackMsg}</p>
            <a href="https://drive.google.com/drive/u/0/folders/1E2OgzNbAtkcuyoXByjRoMGY2AX1wdWi2" target="_blank" rel="noreferrer" className="inline-block w-full md:w-auto px-8 py-4 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/50 font-bold rounded-xl transition-all hover:-translate-y-1 shadow-md mb-4">
              🔍 Telusuri Galeri Manual (G-Drive)
            </a>
            <button onClick={() => setStep('IDLE')} className="block w-full text-center py-3 text-sm text-red-400 hover:text-red-300 underline underline-offset-4 transition-colors mt-2">
              Coba Ulang Pencarian AI
            </button>
          </div>
        )}

      </div>
    </main>
  );
}