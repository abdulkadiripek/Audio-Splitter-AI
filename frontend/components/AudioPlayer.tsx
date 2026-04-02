"use client";

/**
 * AudioPlayer.tsx — Premium Müzik Çalar Bileşeni
 * ================================================
 * Her bir ses katmanı (stem) için özel tasarlanmış,
 * HTML5 <audio> tabanlı, dark-theme müzik çalar.
 *
 * Özellikler:
 * - Play/Pause kontrolü
 * - Mute/Unmute kontrolü (ses devam eder, sadece sessizleşir)
 * - İlerleme çubuğu (seek desteği — tıklanabilir)
 * - Süre göstergesi (geçen / toplam)
 * - Stem'e özgü ikon ve renk
 * - Dalga formu animasyonu
 * - Tek stem indirme butonu
 *
 * 6 Stem desteği: vocals, drums, bass, guitar, piano, other
 */

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  Play,
  Pause,
  Mic,
  Drum,
  Guitar,
  Music,
  Piano,
  Volume2,
  VolumeX,
  Download,
} from "lucide-react";

interface AudioPlayerProps {
  /** Stem adı (vocals, drums, bass, guitar, piano, other) */
  stemName: string;
  /** Ses dosyasının URL'i (backend stream endpoint) */
  audioUrl: string;
  /** Tek stem indirme URL'i */
  downloadUrl?: string;
}

/**
 * Dışarıdan erişilebilir metotlar.
 * Toplu oynat (play all) için kullanılır.
 */
export interface AudioPlayerHandle {
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  seekTo: (time: number) => void;
  getAudioElement: () => HTMLAudioElement | null;
  isCurrentlyPlaying: () => boolean;
  setMuted: (isMuted: boolean) => void;
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
  guitar: {
    icon: Guitar,
    label: "Gitar",
    gradient: "from-amber-500 to-yellow-500",
    color: "text-amber-400",
    bgColor: "bg-amber-500/20",
  },
  piano: {
    icon: Piano,
    label: "Piyano",
    gradient: "from-rose-500 to-fuchsia-500",
    color: "text-rose-400",
    bgColor: "bg-rose-500/20",
  },
  other: {
    icon: Music,
    label: "Diğer",
    gradient: "from-emerald-500 to-teal-500",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/20",
  },
  instrumental: {
    icon: Music,
    label: "Sadece Altyapı (Vokalsiz)",
    gradient: "from-indigo-500 to-blue-500",
    color: "text-indigo-400",
    bgColor: "bg-indigo-500/20",
  },
};

const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(
  ({ stemName, audioUrl, downloadUrl }, ref) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const progressBarRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isSeeking, setIsSeeking] = useState(false);
    const [volume, setVolume] = useState(1);

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

    // ── Dışarıdan erişilebilir metotları tanımla ──
    useImperativeHandle(ref, () => ({
      play: async () => {
        const audio = audioRef.current;
        if (!audio) return;
        try {
          await audio.play();
          setIsPlaying(true);
        } catch (err) {
          console.error("Oynatma hatası:", err);
        }
      },
      pause: () => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.pause();
        setIsPlaying(false);
      },
      stop: () => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.pause();
        audio.currentTime = 0;
        setIsPlaying(false);
        setCurrentTime(0);
      },
      seekTo: (time: number) => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.currentTime = time;
        setCurrentTime(time);
      },
      getAudioElement: () => audioRef.current,
      isCurrentlyPlaying: () => isPlaying,
      setMuted: (mute: boolean) => {
        setIsMuted(mute);
        if (audioRef.current) {
          audioRef.current.muted = mute;
        }
      },
    }));

    // ── Audio Event Listener'ları ──
    useEffect(() => {
      const audio = audioRef.current;
      if (!audio) return;

      const handleTimeUpdate = () => {
        if (!isSeeking) {
          setCurrentTime(audio.currentTime);
        }
      };

      const handleLoadedMetadata = () => {
        setDuration(audio.duration);
        setIsLoaded(true);
      };

      // durationchange olayı da dinlenir — bazı tarayıcılarda
      // loadedmetadata'dan sonra duration güncellenmesi gerekebilir
      const handleDurationChange = () => {
        if (audio.duration && isFinite(audio.duration)) {
          setDuration(audio.duration);
          setIsLoaded(true);
        }
      };

      // canplay → duration artık kesinlikle bilinir
      const handleCanPlay = () => {
        if (audio.duration && isFinite(audio.duration)) {
          setDuration(audio.duration);
          setIsLoaded(true);
        }
      };

      const handleEnded = () => setIsPlaying(false);

      audio.addEventListener("timeupdate", handleTimeUpdate);
      audio.addEventListener("loadedmetadata", handleLoadedMetadata);
      audio.addEventListener("durationchange", handleDurationChange);
      audio.addEventListener("canplay", handleCanPlay);
      audio.addEventListener("ended", handleEnded);

      return () => {
        audio.removeEventListener("timeupdate", handleTimeUpdate);
        audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
        audio.removeEventListener("durationchange", handleDurationChange);
        audio.removeEventListener("canplay", handleCanPlay);
        audio.removeEventListener("ended", handleEnded);
      };
    }, [isSeeking]);

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

    // Mute/Unmute kontrolü
    const toggleMute = useCallback(() => {
      const audio = audioRef.current;
      if (!audio) return;

      audio.muted = !isMuted;
      setIsMuted(!isMuted);
    }, [isMuted]);

    // Ses Seviyesi (Volume) kontrolü
    const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const audio = audioRef.current;
      if (!audio) return;
      const val = parseFloat(e.target.value);
      audio.volume = val;
      setVolume(val);
      if (val === 0) {
        audio.muted = true;
        setIsMuted(true);
      } else if (isMuted) {
        audio.muted = false;
        setIsMuted(false);
      }
    }, [isMuted]);

    // Tek stem indirme
    const handleDownload = useCallback(async () => {
      if (!downloadUrl) return;
      try {
        const response = await fetch(downloadUrl);
        if (!response.ok) throw new Error("İndirme başarısız");

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${stemName}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error("Stem indirme hatası:", err);
      }
    }, [downloadUrl, stemName]);

    /**
     * İlerleme çubuğuna tıklayarak konuma atlama (seek).
     * Çubuk üzerindeki fare pozisyonuna göre hesaplama yapar.
     */
    const handleProgressBarClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        const audio = audioRef.current;
        const bar = progressBarRef.current;
        if (!audio || !bar || !duration) return;

        const rect = bar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(1, clickX / rect.width));
        const newTime = percent * duration;

        audio.currentTime = newTime;
        setCurrentTime(newTime);
      },
      [duration]
    );

    /**
     * Sürükleme (drag) ile seek desteği.
     * mousedown → mousemove → mouseup zinciri ile çalışır.
     */
    const handleMouseDown = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        const audio = audioRef.current;
        const bar = progressBarRef.current;
        if (!audio || !bar || !duration) return;

        setIsSeeking(true);

        const rect = bar.getBoundingClientRect();

        const handleMouseMove = (moveEvent: MouseEvent) => {
          const clickX = moveEvent.clientX - rect.left;
          const percent = Math.max(0, Math.min(1, clickX / rect.width));
          const newTime = percent * duration;
          setCurrentTime(newTime);
        };

        const handleMouseUp = (upEvent: MouseEvent) => {
          const clickX = upEvent.clientX - rect.left;
          const percent = Math.max(0, Math.min(1, clickX / rect.width));
          const newTime = percent * duration;
          audio.currentTime = newTime;
          setCurrentTime(newTime);
          setIsSeeking(false);

          document.removeEventListener("mousemove", handleMouseMove);
          document.removeEventListener("mouseup", handleMouseUp);
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);

        // İlk tıklama konumunu da uygula
        const clickX = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(1, clickX / rect.width));
        const newTime = percent * duration;
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
        {/* Gizli HTML5 audio elementi — preload="auto" ile tam dosya yüklenmesini sağla */}
        <audio ref={audioRef} src={audioUrl} preload="auto" />

        <div className="flex items-center gap-4">
          {/* ── Stem İkonu ── */}
          <div className={`p-3 rounded-xl ${config.bgColor} shrink-0`}>
            <Icon className={`w-6 h-6 ${config.color}`} />
          </div>

          {/* ── Stem Bilgisi + Kontroller ── */}
          <div className="flex-1 min-w-0">
            {/* Üst satır: İsim + Kontroller + Süre */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-semibold text-foreground">
                  {config.label}
                </h3>

                {/* Çalınırken dalga animasyonu */}
                {isPlaying && !isMuted && (
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

                {/* Muted göstergesi */}
                {isMuted && isPlaying && (
                  <span className="text-xs text-muted/60 font-mono animate-fade-in-up">
                    sessiz
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Süre göstergesi */}
                <span className="text-xs font-mono text-muted tabular-nums">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>

                {/* Ses Ayarı (Volume Slider ve Mute) */}
                <div className="flex items-center gap-1.5 group/vol bg-card/50 px-1.5 py-1 rounded-full border border-transparent hover:border-border-light/50 transition-all">
                  <button
                    onClick={toggleMute}
                    className={`
                      p-1.5 rounded-full transition-all duration-200
                      ${
                        isMuted || volume === 0
                          ? "bg-red-500/20 text-red-400"
                          : "text-muted hover:text-foreground"
                      }
                    `}
                    title={isMuted ? "Sesi Aç" : "Sesi Kapat"}
                    id={`mute-${stemName}`}
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="w-4 h-4" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-16 h-1.5 rounded-full appearance-none bg-black/20 cursor-pointer focus:outline-none accent-accent hover:accent-accent-light transition-all"
                    title="Ses Seviyesi"
                  />
                </div>

                {/* İndirme butonu */}
                {downloadUrl && (
                  <button
                    onClick={handleDownload}
                    className="
                      p-2 rounded-full transition-all duration-200
                      bg-card hover:bg-card-hover text-muted hover:text-foreground
                    "
                    title={`${config.label} İndir`}
                    id={`download-${stemName}`}
                  >
                    <Download className="w-4 h-4" />
                  </button>
                )}

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

            {/* ── İlerleme Çubuğu (Tıklanabilir + Sürüklenebilir) ── */}
            <div
              ref={progressBarRef}
              className="relative h-2 cursor-pointer group/progress"
              onClick={handleProgressBarClick}
              onMouseDown={handleMouseDown}
            >
              {/* Arka plan çubuk */}
              <div className="h-1.5 bg-card rounded-full overflow-hidden group-hover/progress:h-2 transition-all duration-150">
                {/* Renkli ilerleme */}
                <div
                  className={`h-full bg-gradient-to-r ${config.gradient} rounded-full transition-[width] duration-100 ${isMuted ? "opacity-40" : ""}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Seek handle (ilerleme noktası) — hover'da görünür */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md border-2 opacity-0 group-hover/progress:opacity-100 transition-opacity duration-150 pointer-events-none"
                style={{
                  left: `calc(${progressPercent}% - 7px)`,
                  borderColor: "var(--color-accent)",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }
);

AudioPlayer.displayName = "AudioPlayer";

export default AudioPlayer;
