"""
AudioSplitter AI — Yardımcı Fonksiyonlar (utils.py)
=====================================================
ZIP arşivi oluşturma, dosya temizliği ve diğer yardımcı işlevler.
"""

import logging
import os
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Dict

logger = logging.getLogger("audiosplitter.utils")


def create_zip_archive(stem_paths: Dict[str, str], original_filename: str = "track") -> BytesIO:
    """
    Ayrıştırılmış 4 stem dosyasını (.wav) tek bir ZIP arşivine paketler.

    Bu fonksiyon dosyayı diske yazmak yerine bellekte (BytesIO) oluşturur.
    FastAPI'nin StreamingResponse'u ile doğrudan istemciye aktarılır.

    Args:
        stem_paths: Stem adı → dosya yolu eşlemesi.
                    Örnek: {"vocals": "/tmp/abc/vocals.wav", ...}
        original_filename: Orijinal dosya adı (ZIP içindeki klasör adı için).

    Returns:
        BytesIO: Bellekte oluşturulmuş ZIP arşivi.
    """
    # Dosya uzantısını kaldır → ZIP içi klasör adı olarak kullan
    base_name = Path(original_filename).stem

    zip_buffer = BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for stem_name, stem_path in stem_paths.items():
            if os.path.exists(stem_path):
                # ZIP içindeki dosya adı: "şarkı_adı/vocals.mp3" şeklinde
                # Uzantıyı dinamik olarak al
                ext = Path(stem_path).suffix
                arcname = f"{base_name}/{stem_name}{ext}"
                zf.write(stem_path, arcname)
                logger.info(f"  📦 ZIP'e eklendi: {arcname}")
            else:
                logger.warning(f"  ⚠️ Stem dosyası bulunamadı: {stem_path}")

    # BytesIO imlecini başa al (okuma/gönderme için)
    zip_buffer.seek(0)
    logger.info(f"✅ ZIP arşivi oluşturuldu ({zip_buffer.getbuffer().nbytes / 1024:.1f} KB)")

    return zip_buffer


def get_safe_filename(filename: str) -> str:
    """
    Dosya adından güvensiz karakterleri temizler.
    Güvenlik açığı oluşturabilecek path traversal vb. saldırıları engeller.
    """
    # Sadece dosya adını al (path kısmını çıkar)
    filename = Path(filename).name
    # Boşlukları alt çizgi ile değştir
    filename = filename.replace(" ", "_")
    return filename
