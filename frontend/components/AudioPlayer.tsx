"use client";

/**
 * AudioPlayer.tsx — Premium Müzik Çalar Bileşeni
 * ================================================
 * Her bir ses katmanı (stem) için özel tasarlanmış,
 * HTML5 <audio> tabanlı, dark-theme müzik çalar.
 *
 * Özellikler:
 * - Play/Pause kontrolü
 * - İlerleme çubuğu (seek desteği)
 * - Süre göstergesi (geçen / toplam)
 * - Stem'e özgü ikon ve renk
 * - Dalga formu animasyonu
 */

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Play, Pause, Mic, Drum, Guitar, Music } from "lucide-react";

interface AudioPlayerProps {
  /** Stem adı (vocals, drums, bass, other) */
  stemName: string;
  /** Ses dosyasının URL'i (backend stream endpoint) */
  audioUrl: string;
}

/**
 * Stem adına göre ikon, renk ve Türkçe etiket döner.
 * Her stem'in benzersiz görsel kimliği vardır.
 */
const STEM_CONFIG: Record<
  string,
  {
    icon: React.ElementType;
    label: string;
    gradient: string;
    color: string;
    bgColor: string;
  }
> = {
  vocals: {
    icon: Mic,
    label: "Vokaller",
    gradient: "from-purple-500 to-pink-500",
    color: "text-purple-400",
    bgColor: "bg-purple-500/20",
  },
  drums: {
    icon: Drum,
    label: "Bateri",
    gradient: "from-orange-500 to-red-500",
    color: "text-orange-400",
    bgColor: "bg-orange-500/20",
  },
  bass: {
    icon: Guitar,
    label: "Bas",
    gradient: "from-blue-500 to-cyan-500",
    color: "text-blue-400",
    bgColor: "bg-blue-500/20",
  },
  other: {
    icon: Music,
    label: "Diğer",
    gradient: "from-emerald-500 to-teal-500",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/20",
  },
};

export default function AudioPlayer({ stemName, audioUrl }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  // Bu stem'in yapılandırmasını al (bilinmeyen stem'ler için "other" kullan)
  const config = STEM_CONFIG[stemName] || STEM_CONFIG.other;
  const Icon = config.icon;

  /**
   * Saniye değerini "dakika:saniye" formatına çevirir.
   * Örn: 125 → "2:05"
   */
  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // ── Audio Event Listener'ları ──
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoaded(true);
    };
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  // Play/Pause kontrolü
  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      if (isPlaying) {
        audio.pause();
      } else {
        await audio.play();
      }
      setIsPlaying(!isPlaying);
    } catch (err) {
      console.error("Oynatma hatası:", err);
    }
  }, [isPlaying]);

  // İlerleme çubuğunda konuma atla (seek)
  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const audio = audioRef.current;
      if (!audio) return;

      const newTime = (parseFloat(e.target.value) / 100) * duration;
      audio.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [duration]
  );

  // İlerleme yüzdesi (0-100)
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="glass-card p-5 transition-all duration-300 hover:border-border-light/80 group"
      id={`player-${stemName}`}
    >
      {/* Gizli HTML5 audio elementi */}
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      <div className="flex items-center gap-4">
        {/* ── Stem İkonu ── */}
        <div className={`p-3 rounded-xl ${config.bgColor} shrink-0`}>
          <Icon className={`w-6 h-6 ${config.color}`} />
        </div>

        {/* ── Stem Bilgisi + Kontroller ── */}
        <div className="flex-1 min-w-0">
          {/* Üst satır: İsim + Play + Süre */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-semibold text-foreground">
                {config.label}
              </h3>

              {/* Çalınırken dalga animasyonu */}
              {isPlaying && (
                <div className="flex items-end gap-[3px] h-5">
                  {[0, 0.2, 0.4, 0.1, 0.3].map((delay, i) => (
                    <span
                      key={i}
                      className="wave-bar"
                      style={{
                        animationDelay: `${delay}s`,
                        height: "8px",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Süre göstergesi */}
              <span className="text-xs font-mono text-muted tabular-nums">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>

              {/* Play/Pause butonu */}
              <button
                onClick={togglePlay}
                className={`
                  p-2.5 rounded-full transition-all duration-200
                  bg-gradient-to-r ${config.gradient}
                  hover:opacity-90 hover:scale-105
                  active:scale-95
                  text-white shadow-lg
                `}
                title={isPlaying ? "Duraklat" : "Oynat"}
                id={`play-${stemName}`}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4 ml-0.5" />
                )}
              </button>
            </div>
          </div>

          {/* ── İlerleme Çubuğu ── */}
          <div className="relative">
            {/* Arka plan çubuk */}
            <div className="h-1.5 bg-card rounded-full overflow-hidden">
              {/* Renkli ilerleme */}
              <div
                className={`h-full bg-gradient-to-r ${config.gradient} rounded-full transition-all duration-100`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Seek slider (görünmez ama tıklanabilir) */}
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={progressPercent}
              onChange={handleSeek}
              className="audio-slider absolute inset-0 w-full opacity-0 cursor-pointer"
              title="İlerleme çubuğu"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
