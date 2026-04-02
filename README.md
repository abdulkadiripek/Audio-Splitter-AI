# 🎵 Sound Studio AI (AudioSplitter)

![Sound Studio AI](https://img.shields.io/badge/Status-Active-success) ![Python](https://img.shields.io/badge/Backend-Python_3.10+-blue) ![FastAPI](https://img.shields.io/badge/Framework-FastAPI-009688) ![Next.js](https://img.shields.io/badge/Frontend-Next.js_14+-black) ![AI](https://img.shields.io/badge/AI-Demucs_v4-ff69b4)

**Sound Studio AI**, modern bir web arayüzü ile güçlendirilmiş, yapay zeka destekli bir ses ayrıştırma (audio source separation) uygulamasıdır. Meta'nın son teknoloji **Demucs v4 (htdemucs_ft)** modelini kullanarak herhangi bir müzik dosyasını 6 farklı kök sese (stem) ayırabilir: **Vocals (Vokal), Drums (Bateri), Bass (Bas), Guitar (Gitar), Piano (Piyano) ve Other (Diğer)**.

---

## ✨ Özellikler

- 🧠 **Gelişmiş Yapay Zeka Modeli:** Meta'nın `htdemucs_ft` modeli sayesinde yüksek kaliteli (high-fidelity) 6-stem ses ayrıştırması.
- ⚡ **Asenkron İşlem & Long Polling:** Büyük boyutlu ses dosyalarının arka planda sorunsuz işlenmesi ve Frontend tarafında durumun (Queued, Processing, Completed, Failed) canlı güncellenmesi.
- 🎧 **Canlı Ses Akışı (Audio Streaming):** Ayrıştırılan sesleri indirmeden önce doğrudan tarayıcı üzerinden (HTTP Range Request desteği ile) kesintisiz dinleyebilme ve ileri/geri sarabilme.
- 📦 **Tek Tıkla İndirme:** İster ayrıştırılan sesleri tek tek indirin, ister tamamını otomatik olarak `.zip` halinde kolayca bilgisayarınıza kaydedin.
- 🎨 **Modern ve Dinamik Arayüz:** Next.js ve Tailwind CSS v4 kullanılarak geliştirilen, Glassmorphism detaylara sahip koyu tema (Dark Mode) modern kullanıcı arayüzü.
- 🚀 **CUDA Bağımsız Ses G/Ç:** Özelleştirilmiş mimari sayesinde, `torchaudio` kaynaklı CUDA uyumsuzluk problemlerini aşmak için `soundfile` kullanılmıştır.

---

## 🛠 Teknoloji Yığını

### 🎨 Frontend (İstemci)
- **Framework:** Next.js (React 19)
- **Stil:** Tailwind CSS v4, Lucide React (İkonlar)
- **Dil:** TypeScript

### ⚙️ Backend (Sunucu)
- **Framework:** FastAPI
- **Yapay Zeka Engine:** PyTorch, Demucs v4 (htdemucs_ft)
- **Ses Dosyası (I/O):** Soundfile, Numpy
- **Asenkron Yönetim:** FastAPI BackgroundTasks, asyncio

---

## 📂 Proje Yapısı

```bash
sound-studio-ai/
├── .gitignore              # Kapsamlı Git ignore kuralları (Python, Node, OS, IDE vb.)
├── backend/                # FastAPI Sunucusu ve AI Engine
│   ├── ai_engine.py        # Demucs AI model yöneticisi ve işlem sınıfı
│   ├── main.py             # FastAPI REST endpoint'leri (Upload, Stream, Download)
│   ├── requirements.txt    # Python bağımlılıkları listesi
│   ├── utils.py            # Dosya güvenliği ve ZIP oluşturma araçları
│   ├── temp_uploads/       # (Otomatik oluşturulur) Yüklenen dosyalar
│   └── temp_outputs/       # (Otomatik oluşturulur) İşlenen AI sonuçları
├── frontend/               # Next.js Web Uygulaması
│   ├── package.json        # Node.js bağımlılıkları ve script'leri
│   ├── postcss.config.mjs  # Tailwind/PostCSS konfigürasyonu
│   ├── tsconfig.json       # TypeScript ayarları
│   ├── app/                # Next.js 14+ App Router dizini
│   └── components/         # Tekrar kullanılabilir React bileşenleri (AudioPlayer vb.)
└── README.md               # Proje dökümü
```

---

## 🚀 Kurulum & Çalıştırma Rehberi

Uygulamayı kendi bilgisayarınızda çalıştırmak için Frontend ve Backend olmak üzere iki servisi de başlatmanız gerekmektedir.

### 1️⃣ Ön Gereksinimler
- Python 3.10 veya üzeri
- Node.js 20.x veya üzeri
- *(Gelişmiş hız için)* NVIDIA GPU ve yüklü CUDA sürücüleri (Zorunlu değil, CPU ile de çalışır)

### 2️⃣ Backend Kurulumu

```bash
# 1. Backend klasörüne geçin
cd backend

# 2. Sanal ortam (Virtual Environment) oluşturun ve aktif edin
python -m venv ../.venv
source ../.venv/bin/activate  # Windows için: ..\.venv\Scripts\activate

# 3. Bağımlılıkları yükleyin
pip install -r requirements.txt

# NOT: İşletim sisteminize ve CUDA sürümünüze uygun PyTorch'u kurmanız gerekebilir:
# Detaylı bilgi: https://pytorch.org/get-started/locally/
```

### 3️⃣ Frontend Kurulumu

```bash
# 1. Frontend klasörüne geçin (Backend ile farklı bir terminal sekmesi kullanabilirsiniz)
cd frontend

# 2. Node modüllerini yükleyin
npm install
```

### 4️⃣ Uygulamayı Başlatma

Aynı anda hem API'yi hem de web arayüzünü çalıştırmalısınız.

**Terminal 1 (Backend):**
```bash
cd backend
source ../.venv/bin/activate
python main.py
```
> *API Sunucusu `http://localhost:8000` adresinde çalışacaktır.*

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```
> *Web Uygulaması `http://localhost:3000` adresinde çalışacaktır. Tarayıcınızdan bu adrese giderek uygulamayı kullanmaya başlayabilirsiniz.*

---

## 📡 API Endpoint'leri

Uygulamanın Backend katmanı (FastAPI) aşağıdaki REST API endpoint'lerini sağlar:

| HTTP Metodu | Endpoint | Açıklama |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Sistemin ayakta olup olmadığını ve GPU durumunu kontrol eder. |
| `POST` | `/api/upload` | Müzik dosyasını yükler, asenkron `Demucs` görevini başlatır ve `task_id` döner. |
| `GET` | `/api/status/{task_id}` | Görevin güncel durumunu (sıra, işleniyor, bitti) sorgular (Long Polling modeli). |
| `GET` | `/api/stream/{task_id}/{stem}` | Belirli bir kök sesi (örneğin vokal) doğrudan tarayıcı üzerinden stream eder (Range). |
| `GET` | `/api/download/{task_id}` | İlgili görevin içerisindeki 6 sesi de sıkıştırarak tek bir `.zip` dosyası olarak idirir. |
| `GET` | `/api/download/{task_id}/{stem}`| İzole edilmiş tek bir `.mp3` dosyasını bilgisayara kaydeder. |

---

## ⚠️ Bilinen Sorunlar ve Çözümleri

**1. `torchaudio` ve CUDA Uyumu Sorunları (Özellikle Arch Linux vb.)**
- Projede ses yükleme sistemi olarak kasıtlı olarak `torchaudio` yerine `soundfile` kullanılmıştır.
- Eğer GPU ile işleme alırken kütüphane hataları (cuDNN, libcublas vb.) alırsanız, sorunun sisteminizdeki global CUDA sürümü (örn: v13.1) ile Python pip paketindeki (örn: cu121) sürüm çakışması olabileceğini unutmayın. Sistem paket yöneticisinden PyTorch yüklemek bu tür dağıtımlarda (Arch vb.) daha stabildir.

**2. Frontend Server Hatası Oluşması Durumu**
- Uygulama, dosya işlerken backend yeniden başlatılırsa otomatik olarak hata durumlarını yakalar ve UI'da gösterir. Lütfen işlemi temizleyip dosyayı yeniden yükleyin.

---

*Bu proje, geliştiriciye özgü AI ve Müzik Teknolojileri çalışmaları kapsamında inşa edilmiştir.*
