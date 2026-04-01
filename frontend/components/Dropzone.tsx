"use client";

/**
 * Dropzone.tsx — Sürükle-Bırak Dosya Yükleme Bileşeni
 * ======================================================
 * Premium tasarımlı, sürükle-bırak destekli dosya yükleme alanı.
 * Desteklenen formatlar: MP3, WAV, FLAC, OGG, M4A
 * Maksimum dosya boyutu: 100 MB
 */

import React, { useCallback, useState, useRef } from "react";
import { Upload, Music, FileAudio, X, AlertCircle } from "lucide-react";

interface DropzoneProps {
  onFileSelected: (file: File) => void;
  isUploading: boolean;
  disabled?: boolean;
}

// İzin verilen ses dosyası MIME tipleri ve uzantıları
const ACCEPTED_TYPES = [
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
];
const ACCEPTED_EXTENSIONS = [".mp3", ".wav", ".flac", ".ogg", ".m4a"];
const MAX_FILE_SIZE_MB = 100;

export default function Dropzone({
  onFileSelected,
  isUploading,
  disabled = false,
}: DropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Dosya doğrulaması yapar:
   * 1. Desteklenen format mı?
   * 2. Dosya boyutu limiti aşılmamış mı?
   */
  const validateFile = useCallback((file: File): string | null => {
    // Uzantı kontrolü
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    const isValidExt = ACCEPTED_EXTENSIONS.includes(ext);
    const isValidType = ACCEPTED_TYPES.includes(file.type);

    if (!isValidExt && !isValidType) {
      return `Desteklenmeyen format. İzin verilen: ${ACCEPTED_EXTENSIONS.join(", ")}`;
    }

    // Boyut kontrolü (MB cinsinden)
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_FILE_SIZE_MB) {
      return `Dosya çok büyük (${sizeMB.toFixed(1)} MB). Maksimum: ${MAX_FILE_SIZE_MB} MB`;
    }

    return null;
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      const validationError = validateFile(file);

      if (validationError) {
        setError(validationError);
        setSelectedFile(null);
        return;
      }

      setSelectedFile(file);
      onFileSelected(file);
    },
    [validateFile, onFileSelected]
  );

  // ── Sürükle-Bırak Event Handler'ları ──
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled && !isUploading) {
        setIsDragOver(true);
      }
    },
    [disabled, isUploading]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (disabled || isUploading) return;

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFile(files[0]);
      }
    },
    [disabled, isUploading, handleFile]
  );

  // ── Dosya Seçici (File Input) ──
  const handleClick = useCallback(() => {
    if (!disabled && !isUploading) {
      fileInputRef.current?.click();
    }
  }, [disabled, isUploading]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    },
    [handleFile]
  );

  // Seçili dosyayı temizle
  const clearFile = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isUploading) {
        setSelectedFile(null);
        setError(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [isUploading]
  );

  /**
   * Dosya boyutunu okunabilir formata çevirir
   * (örn: 4.2 MB, 320 KB)
   */
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Gizli file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(",")}
        onChange={handleFileChange}
        className="hidden"
        id="audio-file-input"
      />

      {/* Ana Dropzone Alanı */}
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative group cursor-pointer
          rounded-2xl border-2 border-dashed
          transition-all duration-300 ease-out
          ${
            isDragOver
              ? "border-accent bg-accent/10 scale-[1.02] glow-accent"
              : selectedFile
                ? "border-accent/50 bg-accent/5"
                : "border-border-light hover:border-accent/50 hover:bg-card/50"
          }
          ${disabled || isUploading ? "opacity-50 cursor-not-allowed" : ""}
          p-10
        `}
        id="audio-dropzone"
      >
        {/* İç İçerik */}
        {!selectedFile ? (
          // ── Dosya Seçilmemiş Durumu ──
          <div className="flex flex-col items-center gap-4 text-center">
            <div
              className={`
              p-5 rounded-2xl 
              bg-gradient-to-br from-accent/20 to-accent/5
              transition-transform duration-300
              ${isDragOver ? "scale-110" : "group-hover:scale-105"}
            `}
            >
              <Upload
                className={`w-10 h-10 ${isDragOver ? "text-accent-light" : "text-muted"} transition-colors`}
              />
            </div>

            <div>
              <p className="text-lg font-semibold text-foreground/90">
                {isDragOver ? "Dosyayı bırakın!" : "Müzik dosyanızı sürükleyin"}
              </p>
              <p className="text-sm text-muted mt-1">
                veya{" "}
                <span className="text-accent-light hover:underline">
                  dosya seçmek için tıklayın
                </span>
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {[".MP3", ".WAV", ".FLAC", ".OGG"].map((ext) => (
                <span
                  key={ext}
                  className="px-2.5 py-1 text-xs font-mono rounded-md bg-card border border-border text-muted"
                >
                  {ext}
                </span>
              ))}
            </div>

            <p className="text-xs text-muted/60">
              Maksimum dosya boyutu: {MAX_FILE_SIZE_MB} MB
            </p>
          </div>
        ) : (
          // ── Dosya Seçildi Durumu ──
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-accent/20 shrink-0">
              <FileAudio className="w-8 h-8 text-accent-light" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-foreground truncate">
                {selectedFile.name}
              </p>
              <p className="text-sm text-muted">
                {formatFileSize(selectedFile.size)} •{" "}
                {selectedFile.name.split(".").pop()?.toUpperCase()}
              </p>
            </div>

            {!isUploading && (
              <button
                onClick={clearFile}
                className="p-2 rounded-lg hover:bg-card transition-colors shrink-0"
                title="Dosyayı kaldır"
                id="clear-file-button"
              >
                <X className="w-5 h-5 text-muted hover:text-foreground" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Hata Mesajı */}
      {error && (
        <div className="flex items-center gap-2 mt-3 p-3 rounded-xl bg-error/10 border border-error/30 animate-fade-in-up">
          <AlertCircle className="w-4 h-4 text-error shrink-0" />
          <p className="text-sm text-error">{error}</p>
        </div>
      )}
    </div>
  );
}
