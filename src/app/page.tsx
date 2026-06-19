"use client";

import { useState, useRef } from "react";

type SearchStep = 'IDLE' | 'SCANNING_UPLOAD' | 'UPLOAD_FAILED' | 'SCANNING_LIVE' | 'SUCCESS' | 'TOTAL_FAILED';

export default function Home() {
  const [step, setStep] = useState<SearchStep>('IDLE');
  const [bib, setBib] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [feedbackMsg, setFeedbackMsg] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Tembak Server Python FastAPI
  const hitServerAPI = async (bibInput: string, fileBlob: Blob, source: 'UPLOAD' | 'LIVE') => {
    try {
      const formData = new FormData();
      formData.append('bib', bibInput);
      formData.append('file', fileBlob, 'selfie.jpg');

      const res = await fetch("http://127.0.0.1:8000/search-double-tap", {
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
      triggerFallback(source);
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
            <a href="https://drive.google.com/drive/folders/GANTILINK" target="_blank" rel="noreferrer" className="inline-block bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-md">🔍 Telusuri Galeri Manual</a>
            <button onClick={() => setStep('IDLE')} className="block mx-auto mt-6 text-sm text-gray-500 underline">Coba Ulang Pencarian</button>
          </div>
        )}

        {step === 'SUCCESS' && (
          <div>
            <div className="bg-green-50 p-4 rounded-xl border border-green-200 text-center mb-6">
              <h2 className="text-green-800 font-bold text-xl">{feedbackMsg}</h2>
              <button onClick={() => { setStep('IDLE'); setResults([]); setBib(''); setImageFile(null); }} className="mt-2 text-sm text-green-700 underline">Cari Peserta Lain</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {results.map((item, idx) => (
                <div key={idx} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="h-64 bg-gray-200 flex items-center justify-center text-gray-400 italic text-center p-4">
                    [ GDrive ID: {item.gdrive_id} ]<br/>{item.file_name}
                  </div>
                  <div className="p-4">
                    <p className="font-bold text-gray-800">{item.file_name}</p>
                    <p className="text-xs text-gray-500">Jarak Matriks: {item.distance.toFixed(3)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </main>
  );
}