# 🎙️ Đặc Tả Tính Năng & Khảo Sát Open-Source Module Local TTS & Voice Cloning (Offline 100%)

Tài liệu này đặc tả thiết kế hệ thống, luồng nghiệp vụ và khảo sát các mã nguồn mở (Open-Source Repositories) phục vụ xây dựng **Module Text-To-Speech (TTS) & Zero-Shot Voice Cloning (Nhái giọng nói)** chạy **hoàn toàn Cục bộ (100% Local / Offline)**, không sử dụng API AI đám mây, **chi phí Token bằng 0đ**.

---

## 1. 📋 Tổng Quan Yêu Cầu & Luồng Nghiệp Vụ (Feature Spec & User Flow)

### 1.1 Mục Tiêu Module
* **Hỗ trợ Đa ngôn ngữ:** Tiếng Việt (VI) và Tiếng Anh (EN).
* **Đa dạng dạng nội dung:** Đoạn văn đơn (Single Speaker) hoặc Kịch bản hội thoại nhiều nhân vật (Multi-speaker Dialogue).
* **Nhái giọng nói tức thì (Zero-shot Voice Cloning):** Tải lên 1 file ghi âm mẫu (3s - 10s) $\rightarrow$ Trích xuất Voice Prompt / Speaker Embedding $\rightarrow$ Nhập văn bản nghe thử $\rightarrow$ Lưu thông tin giọng đọc mẫu để tái sử dụng.
* **Quản lý & Lịch sử:** Lưu trữ lịch sử audio đã gen, hỗ trợ nghe lại, tải về MP3/WAV, xóa history.
* **Cam kết Cục bộ (100% Local):** Chạy trên GPU/CPU nội bộ (PyTorch / ONNX Runtime), tuyệt đối không tốn tiền API Token từ OpenAI, ElevenLabs hay Google Gemini.

---

### 1.2 Luồng Hoạt Động Của Người Dùng (User Workflows)

```mermaid
graph TD
    A[Bắt đầu] --> B{Chọn Chức Năng}
    
    %% Luồng 1: Gen Audio từ Văn bản
    B -- 1. Tổng hợp Audio --> C[Nhập Văn bản / Kịch bản Hội thoại]
    C --> D[Chọn Ngôn ngữ: VI / EN]
    D --> E[Chọn Giọng đọc & Tinh chỉnh Style / Speed / Pitch]
    E --> F[Bấm "Tạo Audio Cục bộ"]
    F --> G[Local Inference Engine: F5-TTS / Kokoro / VITS]
    G --> H[Xuất file WAV/MP3 & Lưu CSDL Local]
    H --> I[Phát Audio & Lưu vào Lịch sử History]

    %% Luồng 2: Copy Giọng (Voice Cloning)
    B -- 2. Nhái Giọng (Voice Clone) --> J[Tải lên file âm thanh mẫu 3s-10s]
    J --> K[Nhập Tên Giọng Mẫu + Tùy chỉnh tham số]
    K --> L[Trích xuất Speaker Embedding / Latent Prompt]
    L --> M[Nhập văn bản Test giọng nhái]
    M --> N[Bấm "Nghe thử Giọng Nhái"]
    N --> O{Kết quả đạt?}
    O -- Đạt --> P[Lưu Giọng Mẫu vào Danh Sách Local Voices]
    O -- Chưa đạt --> J
```

---

## 2. 🧱 Kiến Trúc Hệ Thống Local TTS (Architecture & Tech Stack)

Hệ thống được thiết kế theo kiến trúc **Microservice Cục bộ (Local Microservice Architecture)** gồm 3 tầng chính:

```mermaid
graph LR
    subgraph Frontend [React / Vite Client]
        UI[Giao diện Chấm điểm & Studio]
        Player[Custom Audio Player]
        VoiceManager[Trình quản lý Giọng Mẫu]
    end

    subgraph NodeBackend [Node.js Express Backend]
        API[Express REST API /api/local-tts]
        DB[(PostgreSQL Cục bộ)]
        Storage[Local File Storage / public/audio_local]
    end

    subgraph PyEngine [Python Local TTS Microservice]
        FastAPI[FastAPI / PyTorch Server]
        F5Engine[F5-TTS / Vi-F5 Engine]
        VitsEngine[VITS-ONNX Engine]
        SpeakerEncoder[Whisper-Feature / ECAPA-TDNN]
    end

    UI <--> API
    API <--> DB
    API <--> Storage
    API <-->|HTTP / gRPC (Port 8000)| FastAPI
    FastAPI <--> F5Engine
    FastAPI <--> VitsEngine
```

### Thành phần chính:
1. **Frontend (React):** Tích hợp vào hệ thống **AI Scoring Admin**, cung cấp Tab/Modal Soạn thảo kịch bản, Player phát audio và Trình nạp giọng mẫu (Clone Voice Modal).
2. **Backend Gateway (Node.js Express):** Tiếp nhận request, quản lý CSDL PostgreSQL (lịch sử bài gen, danh sách giọng clone), điều phối gọi API tới Python Local Engine.
3. **Local Inference Engine (Python FastAPI):** Chạy ngầm trên máy local hoặc server VPS, tải trọng tâm các mô hình AI TTS (F5-TTS, Kokoro, VITS) để xử lý sinh âm thanh từ Text.

---

## 3. 🔍 Khảo Sát Chi Tiết Các Open-Source Repositories Tốt Nhất

Dưới đây là tổng hợp các Repository mã nguồn mở hàng đầu được cộng đồng AI đánh giá cao nhất hiện nay phục vụ TTS và Voice Cloning local cho Tiếng Việt và Tiếng Anh:

| Repository / Project | Ngôn ngữ hỗ trợ | Tính năng nổi bật | Zero-shot Voice Cloning | Tốc độ / Yêu cầu phần cứng | Thích hợp cho |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **[SWivid/F5-TTS](https://github.com/SWivid/F5-TTS)** | EN, ZH, VI | Dựa trên **Flow Matching & DiT**, giọng đọc siêu tự nhiên, nhát cắt giọng mượt | ⚡ Rất cao (Mẫu 3-10s) | Cần GPU (NVIDIA RTX / T4) | **Khuyên dùng số 1 cho Voice Cloning** |
| **[nguyenthienhy/F5-TTS-Vietnamese](https://github.com/nguyenthienhy/F5-TTS-Vietnamese)** | VI | Bản F5-TTS đã được Fine-tune trên 1.000 giờ dữ liệu tiếng Việt (ViVoice) | ⚡ Rất cao (Tiếng Việt) | GPU VRAM >= 4GB | **Khuyên dùng số 1 cho Tiếng Việt Nhái Giọng** |
| **[hexgrad/kokoro](https://github.com/hexgrad/kokoro)** | EN, ES, FR | Mô hình **82M parameters** siêu nhẹ, chất lượng âm thanh Hi-Fi 44.1kHz | Không (Prebuilt voices) | ⚡ Rất nhanh (Chạy tốt trên CPU) | **Khuyên dùng số 1 cho Tiếng Anh Chuẩn** |
| **[phatjkk/vits-tts-vietnamese](https://github.com/phatjkk/vits-tts-vietnamese)** | VI | Mô hình **VITS (ONNX Export)** dành cho Tiếng Việt, tốc độ phản hồi cực cao | Trung bình (Multi-speaker) | ⚡ Siêu nhẹ (CPU RTF ~0.2) | Cho máy không có GPU |
| **[tronghieuit/v-tts](https://github.com/tronghieuit/v-tts)** | VI | Giải pháp TTS Tiếng Việt đóng gói sẵn Docker / Windows EXE, tối ưu CPU | Không | ⚡ Chạy CPU nhẹ nhàng | Triển khai nhanh không cần GPU |
| **[2noise/ChatTTS](https://github.com/2noise/ChatTTS)** | EN, ZH | Mô hình hội thoại tự nhiên, hỗ trợ thẻ tiếng cười `[laughter]`, ngắt giọng | Tùy biến Speaker Seed | Cần GPU | Phục vụ kịch bản hội thoại kịch tính |

---

### Detailed Benchmark & Repo Analysis

#### 1. 🏆 F5-TTS-Vietnamese (`nguyenthienhy/F5-TTS-Vietnamese`)
* **GitHub Link:** [https://github.com/nguyenthienhy/F5-TTS-Vietnamese](https://github.com/nguyenthienhy/F5-TTS-Vietnamese)
* **Đặc điểm:** Đây là mô hình nhái giọng nói (Voice Cloning) thế hệ mới dựa trên thuật toán Non-autoregressive Flow Matching.
* **Ưu điểm:**
  - Nhái giọng chính xác từ file audio mẫu 3 - 10 giây (ngữ điệu, cảm xúc, tông giọng người thật).
  - Đã fine-tune sẵn trên tập dữ liệu lớn Tiếng Việt (1.000h).
  - Có tích hợp sẵn thư viện Python API và WebUI Gradio dễ nhúng vào FastAPI backend.
* **Nhược điểm:** Cần card đồ họa GPU (NVIDIA VRAM $\ge 4\text{GB}$) để gen trong thời gian thực (Real-time).

#### 2. ⚡ Kokoro 82M (`hexgrad/kokoro` / `kokoro-onnx`)
* **GitHub Link:** [https://github.com/hexgrad/kokoro](https://github.com/hexgrad/kokoro)
* **Đặc điểm:** Mô hình TTS Tiếng Anh chỉ 82 triệu tham số, sinh file WAV 44.1kHz chất lượng thu âm studio.
* **Ưu điểm:**
  - Siêu nhẹ, chạy mượt mà ngay trên CPU thường mà không cần GPU đắt tiền.
  - Hỗ trợ hơn 30+ giọng tiếng Anh chất lượng cao (Mỹ, Anh, Úc).
  - Tích hợp qua Python package `kokoro-onnx` cực kỳ đơn giản.

#### 3. 🚀 VietTTS / VITS-Vietnamese (`phatjkk/vits-tts-vietnamese`)
* **GitHub Link:** [https://github.com/phatjkk/vits-tts-vietnamese](https://github.com/phatjkk/vits-tts-vietnamese)
* **Đặc điểm:** Mô hình VITS truyền thống được xuất ra định dạng ONNX.
* **Ưu điểm:**
  - Tốc độ tổng hợp âm thanh cực nhanh (RTF < 0.2 trên CPU).
  - Thích hợp cho các server VPS cấu hình thấp.

---

## 4. 📐 Đề Xuất Giải Pháp & Thiết Kế API Interface

### 4.1 Cấu Trúc Bảng CSDL Local (PostgreSQL Schema)

Để lưu giữ giọng nhái mẫu và lịch sử các đoạn audio đã gen local:

```sql
-- 1. Bảng lưu trữ giọng mẫu đã copy (Voice Clones)
CREATE TABLE IF NOT EXISTS local_voice_clones (
    id SERIAL PRIMARY KEY,
    voice_name VARCHAR(255) NOT NULL,
    language VARCHAR(10) DEFAULT 'vi', -- 'vi' | 'en'
    ref_audio_path TEXT NOT NULL,       -- Đường dẫn file ghi âm mẫu 5s
    ref_text TEXT,                      -- Văn bản khớp với file ghi âm mẫu
    speaker_embedding JSONB,           -- Latent embedding trích xuất (nếu có)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Bảng lưu lịch sử audio đã gen local
CREATE TABLE IF NOT EXISTS local_tts_history (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content_type VARCHAR(50) DEFAULT 'dialogue', -- 'passage' | 'dialogue'
    raw_script JSONB NOT NULL,                   -- Nội dung các lượt thoại
    audio_path TEXT NOT NULL,                    -- Đường dẫn file mp3/wav local
    duration_seconds NUMERIC(6,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### 4.2 Đặc Tả RESTful API (Node.js Gateway $\leftrightarrow$ React Frontend)

#### 1. Đăng ký / Nhái giọng mới (Voice Clone Upload)
* **Endpoint:** `POST /api/local-tts/clone-voice`
* **Content-Type:** `multipart/form-data`
* **Payload:**
  - `voice_name`: "Giọng Thầy Nam"
  - `language`: "vi"
  - `ref_text`: "Chào mừng bạn đến với trung tâm tiếng Anh..."
  - `audio_file`: Binary file WAV/MP3 (5s)
* **Response:**
  ```json
  {
    "success": true,
    "voice": {
      "id": 12,
      "voice_name": "Giọng Thầy Nam",
      "language": "vi",
      "ref_audio_url": "/public/voice_prompts/custom_12.wav"
    }
  }
  ```

#### 2. Test giọng nhái (Preview Cloned Voice)
* **Endpoint:** `POST /api/local-tts/preview-cloned-voice`
* **Payload:**
  ```json
  {
    "voice_id": 12,
    "test_text": "Xin chào, đây là câu nói thử nghiệm từ giọng đã nhái thành công."
  }
  ```
* **Response:**
  ```json
  {
    "success": true,
    "audio_url": "/public/tmp_tts/preview_test_12.wav"
  }
  ```

#### 3. Sinh Audio Đoạn văn / Hội thoại Multi-speaker
* **Endpoint:** `POST /api/local-tts/generate`
* **Payload:**
  ```json
  {
    "title": "Luyện nghe TOEIC Part 3",
    "language": "vi",
    "script": [
      { "speaker": "Nam", "voice_id": "custom_12", "text": "Xin chào cô Mai, tài liệu hôm nay đã chuẩn bị xong chưa?" },
      { "speaker": "Mai", "voice_id": "kokoro_af_bella", "text": "Dạ đã xong rồi thưa thầy, em đã in thành 5 bản." }
    ]
  }
  ```
* **Response:**
  ```json
  {
    "success": true,
    "audio_url": "/public/audio_local/dialogue_1786095000.wav",
    "duration": 12.4
  }
  ```

---

## 5. 🚀 Lộ Trình Triển Khai Thực Hiện (Implementation Steps)

1. **Bước 1 (Python Microservice):** Dựng một dịch vụ Python nhẹ (`local_tts_server.py`) sử dụng FastAPI, nạp mô hình **F5-TTS-Vietnamese** (cho Tiếng Việt & Nhái giọng) và **Kokoro-82M** (cho Tiếng Anh siêu nhẹ).
2. **Bước 2 (Node.js Gateway):** Viết `localTtsController.js` và `localTtsRoutes.js` để kết nối Express với Python Server qua HTTP localhost (port 8000).
3. **Bước 3 (React Component):** Xây dựng Module UI `LocalTTSStudio.jsx` với các sub-tab:
   - **Tab 1: Studio Soạn Thảo & Sinh Audio** (Hỗ trợ nhập hội thoại & chọn giọng clone/gốc).
   - **Tab 2: Trình Nhái Giọng (Voice Cloner)** (Tải file mẫu 5s, nhập văn bản test, lưu profile).
   - **Tab 3: Lịch Sử Audio Đã Gen** (Xem bảng danh sách, nghe lại & tải xuống).

---
*Tài liệu phân tích và khảo sát này sẵn sàng cho việc triển khai Module Local TTS 100% Offline không tốn chi phí Token.*
