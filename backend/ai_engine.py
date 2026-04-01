"""
AudioSplitter AI — Yapay Zeka Motoru (ai_engine.py)
====================================================
Bu modül, Facebook/Meta'nın Demucs (Hybrid Transformer Demucs) modelini
kullanarak müzik dosyalarını 6 kök sese (stem) ayırır:
  - vocals (vokal)
  - drums (bateri)
  - bass (bas gitar)
  - guitar (gitar)
  - piano (piyano)
  - other (diğer enstrümanlar)

VRAM Güvenlik Önlemleri (4 GB GPU için):
  - Model segment boyutu küçük tutulur (segment=2)
  - Her işlem sonrası torch.cuda.empty_cache() + gc.collect()
  - asyncio.Lock() ile eşzamanlı GPU erişimi engellenir
"""

import asyncio
import gc
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Dict, Optional

import numpy as np
import soundfile as sf
import torch

logger = logging.getLogger("audiosplitter.ai_engine")


# ──────────────────────────────────────────────
# Görev Durumu (Task Status) Tanımları
# ──────────────────────────────────────────────
class TaskStatus(str, Enum):
    """Ses ayırma görevinin olası durumları."""
    QUEUED = "queued"            # Kuyrukta bekliyor
    PROCESSING = "processing"   # İşleniyor
    COMPLETED = "completed"     # Tamamlandı
    FAILED = "failed"           # Hata oluştu


@dataclass
class TaskInfo:
    """Bir ses ayırma görevinin tüm bilgilerini tutar."""
    task_id: str
    status: TaskStatus = TaskStatus.QUEUED
    progress_message: str = "Kuyrukta bekleniyor..."
    input_path: str = ""
    output_dir: str = ""
    original_filename: str = ""
    error_message: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    # Ayrıştırılmış stem dosyalarının yolları
    stem_paths: Dict[str, str] = field(default_factory=dict)


class AudioSeparator:
    """
    Demucs tabanlı ses ayırma motoru.

    Bu sınıf şu kritik sorumlulukları üstlenir:
    1. Demucs modelini bellek-güvenli parametrelerle yükler
    2. asyncio.Lock() ile aynı anda yalnızca BİR işlem yapılmasını garanti eder
    3. Her işlem sonrası VRAM'i temizler (OOM koruması)
    4. GPU yoksa otomatik olarak CPU'ya düşer (graceful fallback)
    """

    def __init__(self, output_base_dir: str = "temp_outputs"):
        """
        Args:
            output_base_dir: Ayrıştırılmış ses dosyalarının kaydedileceği
                             ana dizin yolu.
        """
        # ── GPU / CPU Cihaz Seçimi ──
        # CUDA uyumlu GPU varsa kullan, yoksa CPU'ya düş
        if torch.cuda.is_available():
            self.device = torch.device("cuda")
            gpu_name = torch.cuda.get_device_name(0)
            vram_mb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 2)
            logger.info(f"🟢 GPU algılandı: {gpu_name} ({vram_mb:.0f} MB VRAM)")
        else:
            self.device = torch.device("cpu")
            logger.warning("🟡 GPU bulunamadı — CPU modunda çalışılacak (yavaş olabilir)")

        # ── Eşzamanlılık Kilidi ──
        # Aynı anda birden fazla kullanıcının GPU'yu kullanmasını engeller.
        # 4 GB VRAM ile aynı anda 2 model çalışmak → OOM hatası demektir.
        self._processing_lock = asyncio.Lock()

        # ── Görev Deposu ──
        # Tüm aktif/tamamlanmış görevlerin bilgileri burada tutulur.
        # Üretim ortamında Redis/DB kullanılabilir, PoC için in-memory dict yeterli.
        self.tasks: Dict[str, TaskInfo] = {}

        # ── Dosya Sistemi ──
        self.output_base_dir = Path(output_base_dir)
        self.output_base_dir.mkdir(parents=True, exist_ok=True)

        # ── Model (Lazy Loading) ──
        # Modeli hemen yüklemiyoruz; ilk istek geldiğinde yüklenecek.
        # Bu sayede uygulama başlangıcı hızlanır.
        self._model = None

        logger.info("AudioSeparator başlatıldı ✅")

    def _load_model(self):
        """
        Demucs htdemucs modelini tembel (lazy) olarak yükler.

        VRAM Koruması:
          - segment=2: Modelin ses dosyasını 2 saniyelik parçalara bölerek
            işlemesini sağlar. Büyük segment değerleri daha fazla VRAM tüketir.
            4 GB VRAM için segment=2 güvenli bir değerdir.

        Not: Bu metot thread-safe değildir; ancak _processing_lock sayesinde
        aynı anda yalnızca bir coroutine tarafından çağrılır.
        """
        if self._model is not None:
            return

        logger.info("🔄 Demucs htdemucs_6s modeli yükleniyor (segment=2)...")
        try:
            from demucs.pretrained import get_model
            from demucs.apply import BagOfModels

            # segment=2: VRAM tasarrufu için kısa segment uzunluğu.
            # Varsayılan genellikle ~7.8 saniyedir ki bu 4 GB VRAM'de risk oluşturur.
            # htdemucs_6s: 6 stem ayırma (vocals, drums, bass, guitar, piano, other)
            model = get_model("htdemucs_6s")

            # Segment boyutunu ayarla — model tipine göre farklı yaklaşım
            if isinstance(model, BagOfModels):
                for m in model.models:
                    m.segment = 2
            else:
                model.segment = 2

            # Modeli seçilen cihaza (GPU/CPU) taşı
            model.to(self.device)
            self._model = model

            logger.info(f"✅ Model başarıyla yüklendi (cihaz: {self.device})")

        except Exception as e:
            logger.error(f"❌ Model yükleme hatası: {e}")
            raise RuntimeError(f"Demucs modeli yüklenemedi: {e}")

    def create_task(self, input_path: str, original_filename: str) -> str:
        """
        Yeni bir ses ayırma görevi oluşturur ve task_id döner.

        Args:
            input_path: Yüklenen ses dosyasının sunucu üzerindeki geçici yolu.
            original_filename: Kullanıcının yüklediği orijinal dosya adı.

        Returns:
            task_id: Görevin benzersiz UUID tanımlayıcısı.
        """
        task_id = str(uuid.uuid4())

        # Bu görev için özel bir çıktı dizini oluştur
        task_output_dir = self.output_base_dir / task_id
        task_output_dir.mkdir(parents=True, exist_ok=True)

        # Görev bilgilerini kaydet
        self.tasks[task_id] = TaskInfo(
            task_id=task_id,
            input_path=input_path,
            output_dir=str(task_output_dir),
            original_filename=original_filename,
        )

        logger.info(f"📋 Yeni görev oluşturuldu: {task_id} ({original_filename})")
        return task_id

    async def process_task(self, task_id: str) -> None:
        """
        Verilen task_id'ye ait ses dosyasını Demucs ile ayrıştırır.

        Bu metot BackgroundTasks tarafından çağrılır ve şu adımları izler:
        1. asyncio.Lock() ile GPU'yu kilitler (tek seferde 1 işlem)
        2. Modeli yükler (lazy loading)
        3. Ses dosyasını okur ve modelden geçirir
        4. 6 stem'i ayrı .wav dosyaları olarak kaydeder
        5. VRAM'i temizler

        Args:
            task_id: İşlenecek görevin UUID'si.
        """
        task = self.tasks.get(task_id)
        if not task:
            logger.error(f"Görev bulunamadı: {task_id}")
            return

        # ── Adım 1: GPU Kilidini Al ──
        # asyncio.Lock() sayesinde aynı anda yalnızca BİR ses dosyası işlenir.
        # Diğer istekler bu noktada sıraya girer (kuyruk davranışı).
        task.status = TaskStatus.QUEUED
        task.progress_message = "GPU kuyruğunda bekleniyor..."
        logger.info(f"⏳ Görev GPU kuyruğuna alındı: {task_id}")

        async with self._processing_lock:
            try:
                # ── Adım 2: Durumu Güncelle ──
                task.status = TaskStatus.PROCESSING
                task.progress_message = "Yapay zeka modeli yükleniyor..."
                logger.info(f"🚀 İşlem başladı: {task_id}")

                # ── Adım 3: Modeli Yükle (İlk istekte) ──
                # Blocking bir işlem olduğu için event loop'u bloke etmemek adına
                # executor içinde çalıştırıyoruz.
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, self._load_model)

                # ── Adım 4: Ses Dosyasını Oku ──
                # soundfile kullanıyoruz (torchaudio yerine).
                # Neden: Sistemdeki torch CUDA 13.1 ile derlenmiş,
                # ama PyPI'daki torchaudio CUDA 12'ye bağımlı.
                # soundfile'ın hiçbir CUDA bağımlılığı yoktur.
                task.progress_message = "Ses dosyası okunuyor..."
                input_abs_path = str(Path(task.input_path).resolve())
                logger.info(f"📂 Ses dosyası okunuyor: {input_abs_path}")

                # Ses dosyasını oku — MP3 desteği için ffmpeg kullanılır.
                # soundfile/libsndfile MP3'ü sınırlı destekler,
                # bu yüzden önce ffmpeg ile WAV'a çeviriyoruz.
                def _read_audio(path):
                    import subprocess
                    import tempfile

                    path = str(Path(path).resolve())
                    file_ext = Path(path).suffix.lower()

                    # MP3 ve diğer sıkıştırılmış formatlar için
                    # ffmpeg ile WAV'a dönüştür
                    if file_ext in (".mp3", ".m4a", ".ogg", ".wma", ".flac"):
                        tmp_wav = tempfile.NamedTemporaryFile(
                            suffix=".wav", delete=False
                        )
                        tmp_wav_path = tmp_wav.name
                        tmp_wav.close()

                        try:
                            subprocess.run(
                                [
                                    "ffmpeg", "-y", "-i", path,
                                    "-ar", "44100",  # Demucs sample rate
                                    "-ac", "2",      # Stereo
                                    "-f", "wav",
                                    tmp_wav_path,
                                ],
                                capture_output=True,
                                check=True,
                            )
                            logger.info(f"🔄 ffmpeg dönüşümü tamamlandı: {file_ext} → WAV")
                            read_path = tmp_wav_path
                        except subprocess.CalledProcessError as e:
                            logger.error(f"ffmpeg hatası: {e.stderr.decode()[:200]}")
                            raise RuntimeError(
                                f"Ses dosyası okunamadı. ffmpeg hatası: {e.stderr.decode()[:100]}"
                            )
                    else:
                        read_path = path
                        tmp_wav_path = None

                    # soundfile ile WAV oku
                    data, sr = sf.read(read_path, dtype="float32")

                    # Geçici WAV dosyasını temizle
                    if tmp_wav_path and os.path.exists(tmp_wav_path):
                        os.remove(tmp_wav_path)

                    # Mono ise (1D array) → (samples, 1) yap
                    if data.ndim == 1:
                        data = data[:, np.newaxis]
                    # (samples, channels) → (channels, samples) ve torch tensor'a çevir
                    waveform = torch.from_numpy(data.T)
                    return waveform, sr

                waveform, sample_rate = await loop.run_in_executor(
                    None, lambda: _read_audio(input_abs_path)
                )

                # Demucs modeli belirli bir sample rate bekler (genellikle 44100 Hz)
                model_samplerate = self._model.samplerate
                if sample_rate != model_samplerate:
                    task.progress_message = "Örnekleme hızı dönüştürülüyor..."
                    logger.info(
                        f"🔄 Resample: {sample_rate} Hz → {model_samplerate} Hz"
                    )
                    # julius kütüphanesi (demucs ile birlikte gelir) ile resample
                    import julius
                    waveform = julius.resample_frac(waveform, sample_rate, model_samplerate)
                    sample_rate = model_samplerate

                # Mono ise stereo'ya çevir (Demucs stereo bekler)
                if waveform.shape[0] == 1:
                    waveform = waveform.repeat(2, 1)

                # Batch boyutu ekle: (channels, samples) → (1, channels, samples)
                waveform = waveform.unsqueeze(0).to(self.device)

                # ── Adım 5: Model ile Ayrıştırma ──
                task.progress_message = "Frekanslar analiz ediliyor..."
                logger.info(f"🎵 Model çalıştırılıyor: {task_id}")

                # Gradyan hesabını devre dışı bırak (inference modunda VRAM tasarrufu)
                with torch.no_grad():
                    # demucs.apply modülündeki apply_model fonksiyonunu kullan
                    from demucs.apply import apply_model

                    # apply_model, modeli parça parça (segment) uygular
                    # overlap=0.1: Segmentler arası %10 örtüşme (daha düzgün geçişler)
                    sources = await loop.run_in_executor(
                        None,
                        lambda: apply_model(
                            self._model,
                            waveform,
                            device=self.device,
                            overlap=0.1,
                        ),
                    )

                # ── Adım 6: Stem'leri Kaydet ──
                task.progress_message = "Ses katmanları kaydediliyor..."
                logger.info(f"💾 Stem'ler kaydediliyor: {task_id}")

                # Demucs çıktısı: (batch, num_sources, channels, samples)
                # sources[0] = ilk (ve tek) batch elemanı
                stem_names = self._model.sources  # ['drums', 'bass', 'other', 'vocals']
                output_dir = Path(task.output_dir)

                for i, stem_name in enumerate(stem_names):
                    stem_audio = sources[0, i].cpu()  # GPU'dan CPU'ya taşı
                    stem_path = output_dir / f"{stem_name}.wav"

                    # soundfile ile WAV olarak kaydet
                    # soundfile (channels, samples) → (samples, channels) bekler
                    def _save_wav(sp=stem_path, sa=stem_audio, sr=sample_rate):
                        audio_np = sa.numpy().T  # (channels, samples) → (samples, channels)
                        sf.write(str(sp), audio_np, sr, subtype="PCM_16")

                    await loop.run_in_executor(None, _save_wav)

                    task.stem_paths[stem_name] = str(stem_path)
                    logger.info(f"  ✅ {stem_name}.wav kaydedildi")

                # ── Adım 7: Başarılı Tamamlanma ──
                task.status = TaskStatus.COMPLETED
                task.progress_message = "İşlem başarıyla tamamlandı!"
                logger.info(f"🎉 Görev tamamlandı: {task_id}")

            except Exception as e:
                # ── Hata Durumu ──
                task.status = TaskStatus.FAILED
                task.error_message = str(e)
                task.progress_message = f"Hata oluştu: {str(e)[:100]}"
                logger.error(f"❌ Görev başarısız: {task_id} — {e}", exc_info=True)

            finally:
                # ── Adım 8: VRAM Temizliği (KRİTİK!) ──
                # Her işlem sonrası GPU belleğini serbest bırak.
                # Bu adım atlanırsa, ardışık işlemlerde VRAM birikerek
                # "CUDA Out of Memory" hatasına neden olur.
                self._cleanup_vram()

                # Geçici giriş dosyasını sil (disk tasarrufu)
                try:
                    if os.path.exists(task.input_path):
                        os.remove(task.input_path)
                        logger.info(f"🗑️ Geçici dosya silindi: {task.input_path}")
                except OSError as e:
                    logger.warning(f"Geçici dosya silinemedi: {e}")

    def _cleanup_vram(self) -> None:
        """
        GPU VRAM belleğini temizler.

        Bu metot her ses ayırma işleminden sonra ZORUNLU olarak çağrılır.
        4 GB VRAM'li bir GPU'da bu adım kritiktir:

        1. torch.cuda.empty_cache():
           PyTorch'un önbelleğe aldığı ama artık kullanılmayan GPU bellek
           bloklarını serbest bırakır. Bu, allocator'ın parçalanmış
           (fragmented) belleği geri kazanmasını sağlar.

        2. gc.collect():
           Python'un çöp toplayıcısını (garbage collector) tetikler.
           Bu, referans sayacı sıfıra düşmüş ama henüz temizlenmemiş
           PyTorch tensor'larının GPU belleğini serbest bırakmasını sağlar.
        """
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            logger.info("🧹 torch.cuda.empty_cache() çağrıldı")

        gc.collect()
        logger.info("🧹 gc.collect() çağrıldı — Bellek temizlendi")

    def get_task_info(self, task_id: str) -> Optional[TaskInfo]:
        """Belirli bir görevin bilgilerini döner."""
        return self.tasks.get(task_id)

    def cleanup_task(self, task_id: str) -> None:
        """
        Tamamlanmış bir görevin dosyalarını ve kaydını siler.
        Üretim ortamında bu iş bir cron/scheduler tarafından yapılabilir.
        """
        task = self.tasks.get(task_id)
        if task:
            import shutil
            output_dir = Path(task.output_dir)
            if output_dir.exists():
                shutil.rmtree(output_dir)
                logger.info(f"🗑️ Görev dosyaları silindi: {task_id}")
            del self.tasks[task_id]
