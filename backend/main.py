"""
AudioSplitter AI — FastAPI Backend (main.py)
=============================================
REST API endpoint'leri, CORS yapılandırması ve asenkron görev yönetimi.

Endpoint'ler:
  POST /api/upload          → Dosya yükle, arka plan görevi başlat, task_id dön
  GET  /api/status/{task_id} → Görev durumunu sorgula (polling için)
  GET  /api/download/{task_id} → Sonuç ZIP'ini indir
  GET  /api/stream/{task_id}/{stem} → Tek bir stem dosyasını stream et
"""

import logging
import os
import uuid
import urllib.parse
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response

from ai_engine import AudioSeparator, TaskStatus
from utils import create_zip_archive, get_safe_filename


def safe_content_disposition(disposition: str, filename: str) -> str:
    """
    RFC 5987 uyumlu Content-Disposition header oluşturur.
    Türkçe karakterler (ğ, ş, ü, ö, ç, ı) gibi non-ASCII karakterleri
    URL-encode ederek HTTP header'da güvenle kullanılmasını sağlar.

    Args:
        disposition: 'attachment' veya 'inline'
        filename: Dosya adı (Türkçe karakterler içerebilir)

    Returns:
        Content-Disposition header değeri
    """
    # ASCII-safe dosya adı (non-ASCII karakterleri kaldır)
    ascii_name = filename.encode('ascii', 'ignore').decode('ascii')
    if not ascii_name or ascii_name == '.wav' or ascii_name == '.zip':
        ascii_name = 'download' + os.path.splitext(filename)[1]

    # UTF-8 URL-encoded dosya adı
    utf8_name = urllib.parse.quote(filename)

    return f"{disposition}; filename=\"{ascii_name}\"; filename*=UTF-8''{utf8_name}"

# ──────────────────────────────────────────────
# Logging Yapılandırması
# ──────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("audiosplitter.api")

# ──────────────────────────────────────────────
# FastAPI Uygulama Başlatma
# ──────────────────────────────────────────────
app = FastAPI(
    title="AudioSplitter AI",
    description="Yapay zeka ile müzik dosyalarını 6 kök sese ayıran API",
    version="1.0.0",
)

# ──────────────────────────────────────────────
# CORS Yapılandırması
# ──────────────────────────────────────────────
# Frontend (Next.js) genellikle localhost:3000'de çalışır.
# Üretim ortamında bu listeyi kısıtlayın.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Content-Length", "Accept-Ranges"],
)

# ──────────────────────────────────────────────
# AI Motoru (Global Singleton)
# ──────────────────────────────────────────────
# Uygulama başlatıldığında tek bir AudioSeparator instance'ı oluşturulur.
# Bu instance, modeli tembel (lazy) yükler ve tüm istekleri yönetir.
UPLOAD_DIR = Path("temp_uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

separator = AudioSeparator(output_base_dir="temp_outputs")

# İzin verilen ses dosyası formatları
ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".wma"}
# Maksimum dosya boyutu: 100 MB
MAX_FILE_SIZE_MB = 100


# ──────────────────────────────────────────────
# POST /api/upload — Dosya Yükleme & Görev Başlatma
# ──────────────────────────────────────────────
@app.post("/api/upload")
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """
    Kullanıcının yüklediği ses dosyasını alır ve arka planda
    Demucs ile ayrıştırma işlemini başlatır.

    Akış:
    1. Dosya uzantısı ve boyut kontrolü
    2. Dosyayı geçici dizine kaydet
    3. AudioSeparator'da görev oluştur (task_id üret)
    4. BackgroundTasks ile asenkron işlemi başlat
    5. Frontend'e anında task_id döndür (bloklamadan)

    Returns:
        {"task_id": "uuid", "message": "İşlem başlatıldı"}
    """
    # ── Dosya Uzantısı Kontrolü ──
    original_filename = file.filename or "unknown.mp3"
    file_ext = Path(original_filename).suffix.lower()

    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Desteklenmeyen dosya formatı: {file_ext}. "
                   f"İzin verilen formatlar: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # ── Dosya Boyutu Kontrolü ──
    # UploadFile.read() ile tüm dosyayı oku, boyutu kontrol et
    file_content = await file.read()
    file_size_mb = len(file_content) / (1024 * 1024)

    if file_size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=413,
            detail=f"Dosya çok büyük ({file_size_mb:.1f} MB). "
                   f"Maksimum: {MAX_FILE_SIZE_MB} MB",
        )

    # ── Dosyayı Geçici Dizine Kaydet ──
    safe_filename = get_safe_filename(original_filename)
    temp_filename = f"{uuid.uuid4().hex}_{safe_filename}"
    temp_path = UPLOAD_DIR / temp_filename

    with open(temp_path, "wb") as f:
        f.write(file_content)

    logger.info(
        f"📤 Dosya yüklendi: {original_filename} "
        f"({file_size_mb:.1f} MB) → {temp_path}"
    )

    # ── Görev Oluştur ──
    task_id = separator.create_task(
        input_path=str(temp_path),
        original_filename=original_filename,
    )

    # ── Arka Plan Görevi Başlat ──
    # FastAPI'nin BackgroundTasks mekanizması, HTTP yanıtı döndükten SONRA
    # bu fonksiyonu çalıştırır. Böylece kullanıcı beklemez.
    background_tasks.add_task(separator.process_task, task_id)

    return {
        "task_id": task_id,
        "message": "İşlem başlatıldı. Durumu sorgulamak için /api/status/{task_id} kullanın.",
        "filename": original_filename,
    }


# ──────────────────────────────────────────────
# GET /api/status/{task_id} — Görev Durumu Sorgulama
# ──────────────────────────────────────────────
@app.get("/api/status/{task_id}")
async def get_task_status(task_id: str):
    """
    Frontend bu endpoint'i her ~3 saniyede bir çağırarak (long polling)
    işlemin durumunu öğrenir.

    Dönen Durumlar:
      - "queued"     → GPU kuyruğunda bekleniyor
      - "processing" → Aktif olarak işleniyor
      - "completed"  → Tamamlandı, indirme hazır
      - "failed"     → Hata oluştu

    Returns:
        {
          "task_id": "uuid",
          "status": "processing",
          "progress_message": "Frekanslar analiz ediliyor...",
          "stems": {...}  // sadece completed durumunda
        }
    """
    task = separator.get_task_info(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Görev bulunamadı")

    response = {
        "task_id": task.task_id,
        "status": task.status.value,
        "progress_message": task.progress_message,
        "original_filename": task.original_filename,
    }

    # İşlem tamamlandıysa, stem bilgilerini de döndür
    if task.status == TaskStatus.COMPLETED:
        response["stems"] = list(task.stem_paths.keys())

    # Hata durumunda hata mesajını ekle
    if task.status == TaskStatus.FAILED:
        response["error_message"] = task.error_message

    return response


# ──────────────────────────────────────────────
# GET /api/download/{task_id} — ZIP İndirme
# ──────────────────────────────────────────────
@app.get("/api/download/{task_id}")
async def download_results(task_id: str):
    """
    Tamamlanmış bir görevin tüm stem dosyalarını tek bir .zip arşivi olarak döner.

    ZIP dosyası bellekte oluşturulur (diske yazılmaz) ve StreamingResponse
    ile doğrudan istemciye aktarılır.

    Returns:
        ZIP dosyası (application/zip stream)
    """
    task = separator.get_task_info(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Görev bulunamadı")

    if task.status != TaskStatus.COMPLETED:
        raise HTTPException(
            status_code=400,
            detail=f"Görev henüz tamamlanmadı. Mevcut durum: {task.status.value}",
        )

    if not task.stem_paths:
        raise HTTPException(status_code=500, detail="Stem dosyaları bulunamadı")

    # ZIP arşivini bellekte oluştur
    zip_buffer = create_zip_archive(
        stem_paths=task.stem_paths,
        original_filename=task.original_filename,
    )

    # İndirme dosya adı
    safe_name = Path(task.original_filename).stem
    zip_filename = f"{safe_name}_stems.zip"

    logger.info(f"📥 ZIP indirme başlatıldı: {zip_filename} (görev: {task_id})")

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": safe_content_disposition("attachment", zip_filename),
        },
    )


# ──────────────────────────────────────────────
# GET /api/stream/{task_id}/{stem} — Tek Stem Stream
# ──────────────────────────────────────────────
@app.get("/api/stream/{task_id}/{stem}")
async def stream_stem(task_id: str, stem: str, request: Request):
    """
    Belirli bir stem'in WAV dosyasını doğrudan stream eder.
    Frontend'deki HTML5 <audio> elementleri bu endpoint'i kullanır.

    HTTP Range isteklerini destekler — bu sayede tarayıcı ses dosyasının
    toplam süresini (duration) belirleyebilir ve kullanıcı istediği
    konuma atlayabilir (seek).

    Args:
        task_id: Görevin UUID'si
        stem: Stem adı (vocals, drums, bass, guitar, piano, other)
        request: HTTP isteği (Range header okumak için)

    Returns:
        WAV dosyası stream (audio/wav), Range destekli
    """
    task = separator.get_task_info(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Görev bulunamadı")

    if task.status != TaskStatus.COMPLETED:
        raise HTTPException(
            status_code=400,
            detail="Görev henüz tamamlanmadı",
        )

    if stem not in task.stem_paths:
        raise HTTPException(
            status_code=404,
            detail=f"Stem bulunamadı: {stem}. Mevcut stem'ler: {list(task.stem_paths.keys())}",
        )

    stem_path = task.stem_paths[stem]

    if not os.path.exists(stem_path):
        raise HTTPException(status_code=404, detail="Stem dosyası diskten silinmiş")

    file_size = os.path.getsize(stem_path)
    range_header = request.headers.get("range")

    if range_header:
        # ── HTTP Range İsteği (Partial Content) ──
        # Tarayıcı "Range: bytes=0-" veya "Range: bytes=12345-" gibi
        # istekler göndererek dosyanın belirli bir bölümünü ister.
        # Bu sayede seek (atlama) ve duration (süre) çalışır.
        range_str = range_header.replace("bytes=", "")
        range_parts = range_str.split("-")
        start = int(range_parts[0]) if range_parts[0] else 0
        end = int(range_parts[1]) if range_parts[1] else file_size - 1

        # Güvenlik kontrolü
        if start >= file_size:
            raise HTTPException(status_code=416, detail="Range Not Satisfiable")
        end = min(end, file_size - 1)
        content_length = end - start + 1

        def iter_range():
            """Dosyanın belirli byte aralığını stream eder."""
            with open(stem_path, "rb") as f:
                f.seek(start)
                remaining = content_length
                while remaining > 0:
                    chunk_size = min(65536, remaining)
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        return StreamingResponse(
            iter_range(),
            status_code=206,
            media_type="audio/wav",
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Content-Length": str(content_length),
                "Accept-Ranges": "bytes",
                "Content-Disposition": safe_content_disposition("inline", f"{stem}.wav"),
            },
        )
    else:
        # ── Tam Dosya İsteği ──
        # Range header yoksa dosyanın tamamını gönder.
        # Content-Length ekleyerek tarayıcının duration hesaplamasını sağla.
        def iterfile():
            """Dosyayı parça parça okuyarak stream eder (bellek dostu)."""
            with open(stem_path, "rb") as f:
                while chunk := f.read(65536):  # 64 KB parçalar
                    yield chunk

        return StreamingResponse(
            iterfile(),
            media_type="audio/wav",
            headers={
                "Content-Disposition": safe_content_disposition("inline", f"{stem}.wav"),
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
            },
        )


# ──────────────────────────────────────────────
# GET /api/download/{task_id}/{stem} — Tek Stem İndirme
# ──────────────────────────────────────────────
@app.get("/api/download/{task_id}/{stem}")
async def download_single_stem(task_id: str, stem: str):
    """
    Belirli bir stem dosyasını indirilebilir WAV olarak döner.

    Args:
        task_id: Görevin UUID'si
        stem: Stem adı (vocals, drums, bass, guitar, piano, other)

    Returns:
        WAV dosyası (audio/wav, attachment olarak)
    """
    task = separator.get_task_info(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Görev bulunamadı")

    if task.status != TaskStatus.COMPLETED:
        raise HTTPException(
            status_code=400,
            detail="Görev henüz tamamlanmadı",
        )

    if stem not in task.stem_paths:
        raise HTTPException(
            status_code=404,
            detail=f"Stem bulunamadı: {stem}. Mevcut stem'ler: {list(task.stem_paths.keys())}",
        )

    stem_path = task.stem_paths[stem]

    if not os.path.exists(stem_path):
        raise HTTPException(status_code=404, detail="Stem dosyası diskten silinmiş")

    file_size = os.path.getsize(stem_path)
    safe_name = Path(task.original_filename).stem

    def iterfile():
        with open(stem_path, "rb") as f:
            while chunk := f.read(65536):
                yield chunk

    logger.info(f"📥 Tek stem indirme: {safe_name}_{stem}.wav (görev: {task_id})")

    return StreamingResponse(
        iterfile(),
        media_type="audio/wav",
        headers={
            "Content-Disposition": safe_content_disposition("attachment", f"{safe_name}_{stem}.wav"),
            "Content-Length": str(file_size),
        },
    )


# ──────────────────────────────────────────────
# Sağlık Kontrolü (Health Check)
# ──────────────────────────────────────────────
@app.get("/api/health")
async def health_check():
    """API'nin çalışır durumda olduğunu doğrular."""
    import torch
    return {
        "status": "healthy",
        "gpu_available": torch.cuda.is_available(),
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
    }


# ──────────────────────────────────────────────
# Geliştirme Ortamında Doğrudan Çalıştırma
# ──────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Geliştirme sırasında otomatik yeniden yükleme
        log_level="info",
    )
