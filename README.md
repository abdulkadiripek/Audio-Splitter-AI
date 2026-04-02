# 🎵 Sound Studio AI (AudioSplitter)

![Sound Studio AI](https://img.shields.io/badge/Status-Active-success) ![Python](https://img.shields.io/badge/Backend-Python_3.10+-blue) ![FastAPI](https://img.shields.io/badge/Framework-FastAPI-009688) ![Next.js](https://img.shields.io/badge/Frontend-Next.js_14+-black) ![AI](https://img.shields.io/badge/AI-Demucs_v4-ff69b4)

**Sound Studio AI** is an AI-powered audio source separation application empowered by a modern web interface. Using Meta's state-of-the-art **Demucs v4 (htdemucs_ft)** model, it can separate any music file into 6 different stems: **Vocals, Drums, Bass, Guitar, Piano, and Other**.

---

## ✨ Features

- 🧠 **Advanced AI Model:** High-fidelity 6-stem audio separation using Meta's `htdemucs_ft` model.
- ⚡ **Async Processing & Long Polling:** Seamless background processing of large audio files with live status updates (Queued, Processing, Completed, Failed) on the Frontend.
- 🎧 **Live Audio Streaming:** Listen seamlessly and seek forward/backward directly in the browser (with HTTP Range Request support) before downloading the separated stems.
- 📦 **One-Click Download:** Download separated stems individually or save all of them easily as a `.zip` file to your computer.
- 🎨 **Modern and Dynamic UI:** A modern user interface with a Dark Mode featuring Glassmorphism details, developed using Next.js and Tailwind CSS v4.
- 🚀 **CUDA-Independent Audio I/O:** Customized architecture utilizes `soundfile` instead of `torchaudio` to overcome CUDA incompatibility issues.

---

## 🛠 Technology Stack

### 🎨 Frontend (Client)
- **Framework:** Next.js (React 19)
- **Styling:** Tailwind CSS v4, Lucide React (Icons)
- **Language:** TypeScript

### ⚙️ Backend (Server)
- **Framework:** FastAPI
- **AI Engine:** PyTorch, Demucs v4 (htdemucs_ft)
- **Audio I/O:** Soundfile, Numpy
- **Async Management:** FastAPI BackgroundTasks, asyncio

---

## 📂 Project Structure

```bash
sound-studio-ai/
├── .gitignore              # Comprehensive Git ignore rules (Python, Node, OS, IDE, etc.)
├── backend/                # FastAPI Server and AI Engine
│   ├── ai_engine.py        # Demucs AI model manager and processing class
│   ├── main.py             # FastAPI REST endpoints (Upload, Stream, Download)
│   ├── requirements.txt    # List of Python dependencies
│   ├── utils.py            # File security and ZIP creation utilities
│   ├── temp_uploads/       # (Auto-created) Uploaded files
│   └── temp_outputs/       # (Auto-created) Processed AI results
├── frontend/               # Next.js Web Application
│   ├── package.json        # Node.js dependencies and scripts
│   ├── postcss.config.mjs  # Tailwind/PostCSS configuration
│   ├── tsconfig.json       # TypeScript configuration
│   ├── app/                # Next.js 14+ App Router directory
│   └── components/         # Reusable React components (AudioPlayer, etc.)
└── README.md               # Project documentation
```

---

## 🚀 Installation & Running Guide

To run the application on your local machine, you need to start both the Frontend and Backend services.

### 1️⃣ Prerequisites
- Python 3.10 or higher
- Node.js 20.x or higher
- *(For improved speed)* NVIDIA GPU and installed CUDA drivers (Optional, also works with CPU)

### 2️⃣ Backend Installation

```bash
# 1. Navigate to the backend folder
cd backend

# 2. Create and activate a Virtual Environment
python -m venv ../.venv
source ../.venv/bin/activate  # For Windows: ..\.venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# NOTE: You may need to install the PyTorch version that matches your OS and CUDA version:
# More info: https://pytorch.org/get-started/locally/
```

### 3️⃣ Frontend Installation

```bash
# 1. Navigate to the frontend folder (You can use a different terminal tab from the Backend)
cd frontend

# 2. Install Node modules
npm install
```

### 4️⃣ Starting the Application

You must run both the API and the web interface simultaneously.

**Terminal 1 (Backend):**
```bash
cd backend
source ../.venv/bin/activate
python main.py
```
> *The API Server will be running at `http://localhost:8000`.*

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```
> *The Web Application will be running at `http://localhost:3000`. You can start using the application by visiting this address in your browser.*

---

## 📡 API Endpoints

The Backend layer (FastAPI) of the application provides the following REST API endpoints:

| HTTP Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Checks if the system is up and the GPU status. |
| `POST` | `/api/upload` | Uploads a music file, starts the async `Demucs` task, and returns a `task_id`. |
| `GET` | `/api/status/{task_id}` | Queries the current status of the task (queued, processing, completed) using a Long Polling model. |
| `GET` | `/api/stream/{task_id}/{stem}` | Streams a specific stem (e.g., vocals) directly in the browser (Range Support). |
| `GET` | `/api/download/{task_id}` | Compresses all 6 stems from the respective task into a single `.zip` file for download. |
| `GET` | `/api/download/{task_id}/{stem}`| Saves a single isolated stem as an `.mp3` file to the computer. |

---

## ⚠️ Known Issues and Solutions

**1. `torchaudio` and CUDA Compatibility Issues (Especially Arch Linux, etc.)**
- The project intentionally uses `soundfile` instead of `torchaudio` as the audio loading system.
- If you receive library errors (cuDNN, libcublas, etc.) when processing with GPU, note that the issue may be a version conflict between your system's global CUDA version (e.g., v13.1) and the version in the Python pip package (e.g., cu121). Installing PyTorch via the system package manager is more stable on such distributions (like Arch).

**2. Frontend Server Error Occurrence**
- If the backend restarts while processing a file, the application automatically catches the error states and displays them in the UI. Please clear the process and re-upload the file.

---

*This project was built as part of developer-specific AI and Music Technologies research.*
