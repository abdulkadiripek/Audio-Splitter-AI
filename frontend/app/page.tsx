"use client";

/**
 * AudioSplitter AI — Ana Sayfa (page.tsx)
 * ========================================
 * Uygulamanın ana sayfası. 3 durumlu tasarım:
 *   1. IDLE      → Dropzone (dosya yükleme)
 *   2. PROCESSING → Animasyonlu durum göstergesi
 *   3. COMPLETED  → Stem audio player'ları + ZIP indirme
 *
 * Backend ile iletişim:
 *   - POST /api/upload → task_id al
 *   - GET /api/status/{task_id} → 3 saniyede bir polling
 *   - GET /api/download/{task_id} → ZIP indir
 *   - GET /api/download/{task_id}/{stem} → Tek stem indir
 *   - GET /api/stream/{task_id}/{stem} → Tek stem stream
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  AudioWaveform,
  Download,
  RotateCcw,
  Sparkles,
  Zap,
  BrainCircuit,
  CheckCircle2,
  AlertTriangle,
  Waves,
  PlayCircle,
  StopCircle,
} from "lucide-react";
import Dropzone from "../components/Dropzone";
import AudioPlayer, { AudioPlayerHandle } from "../components/AudioPlayer";

// Backend API base URL
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Uygulama durumları
type AppState = "idle" | "uploading" | "processing" | "completed" | "failed";

// İşleniyor durumundaki animasyonlu mesajlar (sırayla gösterilir)
const PROCESSING_MESSAGES = [
  { text: "Yapay zeka modeli hazırlanıyor...", icon: BrainCircuit },
  { text: "Ses dosyası analiz ediliyor...", icon: Waves },
  { text: "Frekanslar ayrıştırılıyor...", icon: AudioWaveform },
  { text: "Vokaller tespit ediliyor...", icon: Sparkles },
  { text: "Bateri ve perküsyon izole ediliyor...", icon: Zap },
  { text: "Bas gitar ayrıştırılıyor...", icon: AudioWaveform },
  { text: "Son dokunuşlar yapılıyor...", icon: Sparkles },
];

export default function Home() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [stems, setStems] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [progressMessage, setProgressMessage] = useState<string>("");
  const [processingMsgIndex, setProcessingMsgIndex] = useState(0);
  const [isAllPlaying, setIsAllPlaying] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stem player ref'leri — toplu oynat için
  const playerRefs = useRef<Record<string, AudioPlayerHandle | null>>({});

  /**
   * Dosya yükleme işlemi:
   * 1. Dosyayı FormData olarak backend'e gönder
   * 2. task_id'yi al
   * 3. Polling'i başlat
   */
  const handleFileSelected = useCallback(async (file: File) => {
    setAppState("uploading");
    setFileName(file.name);
    setErrorMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Yükleme başarısız oldu");
      }

      const data = await response.json();
      setTaskId(data.task_id);
      setAppState("processing");
      setProcessingMsgIndex(0);

      // Polling başlat
      startPolling(data.task_id);
    } catch (err) {
      setAppState("failed");
      setErrorMessage(
        err instanceof Error ? err.message : "Bilinmeyen bir hata oluştu"
      );
    }
  }, []);

  /**
   * Backend'i her 3 saniyede bir yoklayarak (polling)
   * işlem durumunu kontrol eder.
   */
  const startPolling = useCallback((tid: string) => {
    // Önceki polling'i temizle
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    const poll = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/status/${tid}`);
        if (!response.ok) throw new Error("Durum sorgulanamadı");

        const data = await response.json();
        setProgressMessage(data.progress_message || "");

        if (data.status === "completed") {
          // İşlem başarıyla tamamlandı
          setStems(data.stems || []);
          setAppState("completed");
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        } else if (data.status === "failed") {
          // İşlem başarısız oldu
          setAppState("failed");
          setErrorMessage(data.error_message || "Ses ayrıştırma başarısız oldu");
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        }
        // "processing" veya "queued" ise polling devam eder
      } catch (err) {
        console.error("Polling hatası:", err);
        setAppState("failed");
        setErrorMessage(
          "Sunucu bağlantısı koptu veya işlem zaman aşımına uğradı. (Sunucu güncellenmiş olabilir). Lütfen dosyayı tekrar yükleyin."
        );
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    };

    // İlk sorguyu hemen yap, sonra her 3 saniyede tekrarla
    poll();
    pollingRef.current = setInterval(poll, 3000);
  }, []);

  // Bileşen unmount olurken polling'i temizle (memory leak önleme)
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  /**
   * İşleniyor durumunda mesajları sırayla döndüren animasyon.
   * Her 4 saniyede bir sonraki mesaja geçer.
   */
  useEffect(() => {
    if (appState !== "processing") return;

    const interval = setInterval(() => {
      setProcessingMsgIndex((prev) =>
        prev < PROCESSING_MESSAGES.length - 1 ? prev + 1 : prev
      );
    }, 4000);

    return () => clearInterval(interval);
  }, [appState]);

  /**
   * ZIP indirme: Backend'den tüm stem'leri tek arşiv olarak indir.
   */
  const handleDownloadZip = useCallback(async () => {
    if (!taskId) return;

    try {
      const response = await fetch(`${API_BASE}/api/download/${taskId}`);
      if (!response.ok) throw new Error("İndirme başarısız");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const baseName = fileName.replace(/\.[^/.]+$/, "");
      a.download = `${baseName}_stems.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("İndirme hatası:", err);
    }
  }, [taskId, fileName]);

  /**
   * Toplu Oynat/Durdur: Tüm stem'leri aynı anda başlatır veya durdurur.
   */
  const handlePlayAll = useCallback(async () => {
    if (isAllPlaying) {
      // Tümünü durdur
      for (const stem of stems) {
        playerRefs.current[stem]?.pause();
      }
      setIsAllPlaying(false);
    } else {
      // Önce hepsini başa sar, sonra senkronize başlat
      for (const stem of stems) {
        playerRefs.current[stem]?.seekTo(0);
      }
      // Küçük bir gecikme ile hepsini başlat (senkronizasyon için)
      const playPromises = stems.map((stem) =>
        playerRefs.current[stem]?.play()
      );
      await Promise.all(playPromises);
      setIsAllPlaying(true);
    }
  }, [isAllPlaying, stems]);

  /**
   * Tüm stem'lerin bitip bitmediğini kontrol eder.
   * Eğer hepsi bittiyse isAllPlaying'i sıfırla.
   */
  useEffect(() => {
    if (!isAllPlaying || stems.length === 0) return;

    const checkInterval = setInterval(() => {
      const anyPlaying = stems.some(
        (stem) => playerRefs.current[stem]?.isCurrentlyPlaying()
      );
      if (!anyPlaying) {
        setIsAllPlaying(false);
      }
    }, 1000);

    return () => clearInterval(checkInterval);
  }, [isAllPlaying, stems]);

  /** Uygulamayı başlangıç durumuna sıfırla */
  const handleReset = useCallback(() => {
    // Tüm player'ları durdur
    for (const stem of stems) {
      playerRefs.current[stem]?.stop();
    }
    setAppState("idle");
    setTaskId(null);
    setStems([]);
    setFileName("");
    setErrorMessage("");
    setProgressMessage("");
    setProcessingMsgIndex(0);
    setIsAllPlaying(false);
    playerRefs.current = {};
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, [stems]);

  return (
    <main className="min-h-screen bg-background bg-gradient-radial">
      {/* ── Header ── */}
      <header className="relative pt-12 pb-8 text-center">
        {/* Üst dekoratif gradient çizgi */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-accent to-transparent opacity-60" />

        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-accent to-accent-dark shadow-lg glow-accent">
            <AudioWaveform className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-foreground via-foreground to-accent-light bg-clip-text text-transparent">
            AudioSplitter AI
          </h1>
        </div>

        <p className="text-muted text-base max-w-lg mx-auto leading-relaxed">
          Müzik dosyalarınızı yapay zeka ile{" "}
          <span className="text-accent-light font-medium">vokal</span>,{" "}
          <span className="text-orange-400 font-medium">bateri</span>,{" "}
          <span className="text-blue-400 font-medium">bas</span> ve{" "}
          <span className="text-emerald-400 font-medium">diğer</span>{" "}
          enstrümanlara ayırın
        </p>
      </header>

      {/* ── Ana İçerik ── */}
      <div className="max-w-3xl mx-auto px-4 pb-16">
        {/* ═══════════════════════════════════════
            DURUM 1: Dosya Yükleme (IDLE)
            ═══════════════════════════════════════ */}
        {appState === "idle" && (
          <section className="animate-fade-in-up">
            <Dropzone
              onFileSelected={handleFileSelected}
              isUploading={false}
            />

            {/* Özellik kartları */}
            <div className="grid grid-cols-3 gap-4 mt-10">
              {[
                {
                  icon: BrainCircuit,
                  title: "Demucs AI",
                  desc: "Meta'nın son teknoloji modeli",
                },
                {
                  icon: Zap,
                  title: "GPU Hızlandırma",
                  desc: "CUDA destekli işleme",
                },
                {
                  icon: AudioWaveform,
                  title: "4 Stem Ayrışım",
                  desc: "Vokal, Bateri, Bas, Diğer",
                },
              ].map((feat) => (
                <div
                  key={feat.title}
                  className="glass-card p-4 text-center group hover:border-accent/30 transition-all"
                >
                  <feat.icon className="w-6 h-6 text-accent-light mx-auto mb-2 group-hover:scale-110 transition-transform" />
                  <h3 className="text-sm font-semibold text-foreground/90">
                    {feat.title}
                  </h3>
                  <p className="text-xs text-muted mt-1">{feat.desc}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ═══════════════════════════════════════
            DURUM 2: Yükleniyor / İşleniyor
            ═══════════════════════════════════════ */}
        {(appState === "uploading" || appState === "processing") && (
          <section className="animate-fade-in-up">
            <div className="glass-card p-10 text-center animate-pulse-glow">
              {/* Dalga animasyonu — sabit yükseklikler (hydration uyumlu) */}
              <div className="flex items-end justify-center gap-1.5 h-12 mb-6">
                {[14, 22, 10, 26, 18, 28, 12, 24, 16, 20, 13, 25].map((h, i) => (
                  <span
                    key={i}
                    className="wave-bar"
                    style={{
                      animationDelay: `${i * 0.1}s`,
                      height: `${h}px`,
                    }}
                  />
                ))}
              </div>

              {/* Dosya adı */}
              <p className="text-sm text-muted mb-3 font-mono">{fileName}</p>

              {/* Animasyonlu durum mesajları */}
              {appState === "uploading" ? (
                <p className="text-lg font-semibold text-foreground animate-fade-in-up">
                  Dosya yükleniyor...
                </p>
              ) : (
                <div key={processingMsgIndex} className="animate-fade-in-up">
                  {(() => {
                    const msg = PROCESSING_MESSAGES[processingMsgIndex];
                    const MsgIcon = msg.icon;
                    return (
                      <div className="flex items-center justify-center gap-3">
                        <MsgIcon className="w-5 h-5 text-accent-light" />
                        <p className="text-lg font-semibold text-foreground">
                          {msg.text}
                        </p>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Backend'den gelen gerçek durum mesajı */}
              {progressMessage && appState === "processing" && (
                <p className="text-xs text-muted mt-3 font-mono">
                  {progressMessage}
                </p>
              )}

              <p className="text-xs text-muted/60 mt-6">
                Bu işlem dosya boyutuna göre 1-5 dakika sürebilir
              </p>
            </div>
          </section>
        )}

        {/* ═══════════════════════════════════════
            DURUM 3: Tamamlandı (COMPLETED)
            ═══════════════════════════════════════ */}
        {appState === "completed" && taskId && (
          <section className="animate-fade-in-up space-y-4">
            {/* Başarı başlığı */}
            <div className="glass-card p-6 text-center glow-success">
              <div className="flex items-center justify-center gap-3 mb-2">
                <CheckCircle2 className="w-7 h-7 text-success" />
                <h2 className="text-xl font-bold text-foreground">
                  Ayrıştırma Tamamlandı!
                </h2>
              </div>
              <p className="text-sm text-muted">
                <span className="font-mono">{fileName}</span> başarıyla{" "}
                {stems.length} ses katmanına ayrıldı
              </p>
            </div>

            {/* ── Toplu Oynat Butonu ── */}
            <button
              onClick={handlePlayAll}
              className={`
                w-full flex items-center justify-center gap-3
                py-3.5 px-6 rounded-2xl
                font-semibold text-base
                transition-all duration-300
                ${
                  isAllPlaying
                    ? "bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-500/30 text-red-400 hover:from-red-500/30 hover:to-orange-500/30"
                    : "bg-gradient-to-r from-accent/20 to-purple-500/20 border border-accent/30 text-accent-light hover:from-accent/30 hover:to-purple-500/30"
                }
                hover:scale-[1.01] active:scale-[0.99]
              `}
              id="play-all-button"
            >
              {isAllPlaying ? (
                <>
                  <StopCircle className="w-5 h-5" />
                  Tümünü Durdur
                </>
              ) : (
                <>
                  <PlayCircle className="w-5 h-5" />
                  Tümünü Oynat
                </>
              )}
            </button>

            {/* Stem Player'ları */}
            <div className="space-y-3">
              {stems.map((stem) => (
                <AudioPlayer
                  key={stem}
                  ref={(handle) => {
                    playerRefs.current[stem] = handle;
                  }}
                  stemName={stem}
                  audioUrl={`${API_BASE}/api/stream/${taskId}/${stem}`}
                  downloadUrl={`${API_BASE}/api/download/${taskId}/${stem}`}
                />
              ))}
            </div>

            {/* Aksiyon Butonları */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              {/* ZIP İndir Butonu */}
              <button
                onClick={handleDownloadZip}
                className="
                  flex-1 flex items-center justify-center gap-3
                  py-4 px-6 rounded-2xl
                  bg-gradient-to-r from-accent to-accent-dark
                  text-white font-semibold text-lg
                  hover:opacity-90 hover:scale-[1.02]
                  active:scale-[0.98]
                  transition-all duration-200
                  shadow-lg glow-accent
                "
                id="download-zip-button"
              >
                <Download className="w-6 h-6" />
                Tüm Parçaları İndir (.ZIP)
              </button>

              {/* Yeni İşlem Butonu */}
              <button
                onClick={handleReset}
                className="
                  flex items-center justify-center gap-2
                  py-4 px-6 rounded-2xl
                  bg-card border border-border
                  text-foreground/80 font-medium
                  hover:bg-card-hover hover:border-border-light
                  active:scale-[0.98]
                  transition-all duration-200
                "
                id="reset-button"
              >
                <RotateCcw className="w-5 h-5" />
                Yeni Dosya
              </button>
            </div>
          </section>
        )}

        {/* ═══════════════════════════════════════
            DURUM 4: Hata (FAILED)
            ═══════════════════════════════════════ */}
        {appState === "failed" && (
          <section className="animate-fade-in-up">
            <div className="glass-card p-8 text-center border-error/30">
              <AlertTriangle className="w-12 h-12 text-error mx-auto mb-4" />
              <h2 className="text-xl font-bold text-foreground mb-2">
                İşlem Başarısız Oldu
              </h2>
              <p className="text-sm text-muted mb-6 max-w-md mx-auto">
                {errorMessage || "Bilinmeyen bir hata oluştu. Lütfen tekrar deneyin."}
              </p>

              <button
                onClick={handleReset}
                className="
                  inline-flex items-center gap-2
                  py-3 px-6 rounded-xl
                  bg-card border border-border
                  text-foreground/80 font-medium
                  hover:bg-card-hover hover:border-border-light
                  transition-all duration-200
                "
                id="retry-button"
              >
                <RotateCcw className="w-5 h-5" />
                Tekrar Dene
              </button>
            </div>
          </section>
        )}
      </div>

      {/* ── Footer ── */}
      <footer className="pb-6 text-center">
        <p className="text-xs text-muted/40">
          Powered by{" "}
          <span className="font-semibold text-muted/60">
            Meta Demucs (htdemucs)
          </span>{" "}
          • AudioSplitter AI v1.0
        </p>
      </footer>
    </main>
  );
}
