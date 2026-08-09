# Bộ Tiêu Chuẩn Lập Trình & Cấu Trúc Mã Nguồn (Frontend & Backend Standards)
## Dự án: AI Scoring Admin

Tài liệu này quy định các tiêu chuẩn kiến trúc, quy tắc phân tách Component, chuẩn hóa Backend API và Kế hoạch Refactor toàn bộ mã nguồn của dự án **AI Scoring Admin**. 

---

## 1. Vấn Đề Hiện Tại Cần Khắc Phục (Current Code Smells)

### 🔴 Frontend (`frontend/src/App.jsx` ~300KB)
* **Code Freestyle Monolith:** Tất cả các trang (`SubmissionListView`, `SubmissionDetailView`, `AIConfigView`, `UserManagementView`, `MappingKeycodeView`, `LogsConsoleView`), toàn bộ Modal, Audio Player, State toàn cục và Routing đều dồn chung vào **duy nhất 1 file `App.jsx`**.
* **Khó bảo trì & Dễ phát sinh lỗi:** Khi thay đổi 1 dòng code, toàn bộ file bị re-render hoặc tăng nguy cơ xung đột (git conflict) khi nhiều người cùng làm việc.
* **Tái sử dụng kém:** Các UI Component (như Button, Badge, Modal, Input, Audio Player) bị trùng lặp logic Inline CSS và JSX.

### 🔴 Backend (`src/controllers/submissionController.js` & `src/services/syncService.js`)
* **Controller quá tải (Fat Controller):** `submissionController.js` ôm đồm cả logic truy vấn DB, gọi API Elearning, tính toán điểm số và xử lý file S3/R2.
* **Thiếu Middleware tập trung:** Cần chuẩn hóa Input Validation, Auth Guard và Centralized Error Handling.

---

## 2. Tiêu Chuẩn Kiến Trúc Frontend (React Component-Based Standards)

### 2.1 Cấu Trúc Thư Mục Chuẩn (Standard Folder Structure)

```text
frontend/src/
├── assets/                  # Hình ảnh, icon, SVG, logo
├── components/              # Các UI Component dùng chung (Atom / Molecule)
│   ├── common/              # Button, Input, Modal, Badge, Spinner, Card
│   ├── layout/              # Sidebar, Header, MainLayout
│   └── audio/               # UnifiedAudioPlayer, AudioWaveform
├── features/                # Các Module tính năng chính (Feature-based)
│   ├── submissions/         # Quản lý bài thi
│   │   ├── components/      # SubmissionRow, SubmissionFilter, QuestionItem
│   │   ├── pages/           # SubmissionListPage, SubmissionDetailPage
│   │   └── hooks/           # useSubmissions.js, useSubmissionDetail.js
│   ├── mappings/            # Quản lý Keycode Mapping
│   │   ├── components/      # MappingTable, SyncMappingModal
│   │   └── pages/           # MappingKeycodePage
│   ├── ai-config/           # Cấu hình Dify / AI Agents
│   │   ├── components/      # AgentCard, PromptEditorModal
│   │   └── pages/           # AIConfigPage
│   ├── users/               # Quản lý Người dùng / Phân quyền
│   │   ├── components/      # UserTable, UserFormModal
│   │   └── pages/           # UserManagementPage
│   └── logs/                # Nhật ký hệ thống
│       ├── components/      # LogTerminal, LogFilter
│       └── pages/           # LogsConsolePage
├── services/                # Kết nối HTTP API (Axios instance)
│   ├── api.js               # Axios instance với Interceptor
│   ├── submissionService.js # API call cho bài thi
│   ├── authService.js       # API call cho Auth / Login
│   └── agentService.js      # API call cho AI Config
├── context/                 # React Context (AuthContext, ThemeContext)
├── hooks/                   # Custom Hooks dùng chung (useToast, useModal)
├── utils/                   # Helper functions (formatDate, cleanHtml, statusHelper)
├── constants/               # Hằng số (Status codes, Options, Route paths)
├── App.jsx                  # Điểm khởi chạy App + React Router
└── main.jsx                 # Entry point
```

### 2.2 Quy Tắc Phân Tách & Viết Component
1. **Single Responsibility Principle (SRP):**
   * Mỗi Component chỉ làm 1 việc duy nhất. File component **không vượt quá 200 - 300 dòng code**.
2. **Tách biệt Logic và UI (Custom Hooks Pattern):**
   * Logic gọi API, xử lý state, debounce search phải được tách ra **Custom Hook** (ví dụ: `useSubmissions()`), UI chỉ nhận props và render layout.
3. **Tuyệt đối không dùng Inline CSS dạng Freestyle:**
   * Sử dụng **CSS Modules**, **TailwindCSS** hoặc các class CSS Variables đã định nghĩa trong `index.css`.
4. **Xử lý Loading & Error State chuẩn chỉnh:**
   * Mọi màn hình/component gọi API phải có trạng thái **Skeleton Loading** hoặc **Spinner** và thông báo lỗi UI trực quan.

---

## 3. Tiêu Chuẩn Kiến Trúc Backend (Express & PostgreSQL Standards)

### 3.1 Cấu Trúc Thư Mục Backend

```text
src/
├── config/                  # Kết nối DB, biến môi trường (db.js, env.js)
├── controllers/             # Tiếp nhận Request, Validate, gọi Service & Trả lời Response
│   ├── authController.js
│   ├── submissionController.js
│   ├── mappingController.js
│   └── agentController.js
├── services/                # Nghiệp vụ core (Business Logic & Database Queries)
│   ├── tokenManager.js      # Refresh Admin Token IIG
│   ├── syncService.js       # Đồng bộ bài thi từ Elearning
│   ├── difyService.js       # Gọi Workflow chấm bài Dify
│   └── storageService.js    # Presigned S3/R2 URLs
├── clients/                 # Gọi API bên ngoài (Third-party HTTP Clients)
│   ├── iigClient.js         # REST Client gọi Elearning IIG
│   └── difyClient.js        # REST Client gọi Dify API
├── middlewares/             # Control flow middlewares
│   ├── authMiddleware.js    # Kiểm tra JWT Token & Role (admin/user)
│   ├── validateMiddleware.js# Input schema validation (Joi/Zod)
│   └── errorMiddleware.js   # Error handler tập trung
├── routes/                  # Định tuyến Express Route
│   ├── index.js             # Route aggregator
│   ├── authRoutes.js
│   ├── submissionRoutes.js
│   └── agentRoutes.js
├── utils/                   # Helper functions (logger, crypto, formatters)
├── app.js                   # Thiết lập Express Application
└── server.js                # Khởi chạy HTTP Server
```

### 3.2 Quy Tắc Lập Trình Backend
1. **Phân tách Layer triệt để:**
   * `Controller` **KHÔNG** viết SQL trực tiếp. Toàn bộ câu lệnh SQL (`pg pool.query`) và logic kết nối Elearning/Dify phải nằm ở `services/` hoặc `clients/`.
2. **Xử lý Bất đồng bộ (`async/await`):**
   * Sử dụng `try/catch` hoặc wrapper `asyncHandler` cho mọi route handler.
3. **An Toàn Database (Anti-SQL Injection):**
   * Luôn sử dụng Parameterized Queries (`$1`, `$2`, `$3`).
4. **Quản lý Lỗi Tập Trung (Centralized Error Handling):**
   * Trả về chuẩn JSON format cho Client:
     ```json
     {
       "success": false,
       "error": "Thông báo lỗi thân thiện",
       "code": "SUBMISSION_NOT_FOUND"
     }
     ```

---

## 4. Kế Hoạch Triển Khai Refactor Codebase (Refactoring Plan)

### 📌 Giai Đoạn 1: Chuẩn Hóa Cấu Trúc Thư Mục Frontend & Cấu Hình API
- [ ] Tạo các thư mục theo chuẩn: `src/components/`, `src/features/`, `src/services/`, `src/hooks/`, `src/utils/`.
- [ ] Xây dựng `src/services/api.js` sử dụng Axios Instance hỗ trợ Interceptor tự động gắn JWT Token và bắt lỗi HTTP 401/403.
- [ ] Tách các hàm Helper (formatDate, statusBadge, cleanHtml) từ `App.jsx` sang `src/utils/`.

### 📌 Giai Đoạn 2: Bóc Tách Các UI Components Dùng Chung (Shared Components)
- [ ] **`UnifiedAudioPlayer`** $\rightarrow$ `src/components/audio/UnifiedAudioPlayer.jsx`.
- [ ] **Modals** (SyncKeycode, BatchScoring, CreateUser, AgentEdit) $\rightarrow$ `src/components/common/Modals/`.
- [ ] **StatusBadges / Cards / Header / Sidebar** $\rightarrow$ `src/components/layout/`.

### 📌 Giai Đoạn 3: Tách Các Trang Tính Năng (Feature Pages)
- [ ] Tách `SubmissionListView` $\rightarrow$ `src/features/submissions/pages/SubmissionListPage.jsx`.
- [ ] Tách `SubmissionDetailView` $\rightarrow$ `src/features/submissions/pages/SubmissionDetailPage.jsx`.
- [ ] Tách `MappingKeycodeView` $\rightarrow$ `src/features/mappings/pages/MappingKeycodePage.jsx`.
- [ ] Tách `AIConfigView` $\rightarrow$ `src/features/ai-config/pages/AIConfigPage.jsx`.
- [ ] Tách `UserManagementView` $\rightarrow$ `src/features/users/pages/UserManagementPage.jsx`.
- [ ] Tách `LogsConsoleView` $\rightarrow$ `src/features/logs/pages/LogsConsolePage.jsx`.
- [ ] Thu gọn file `App.jsx` xuống **dưới 100 dòng code** (chỉ chứa Routing & Layout wrapper).

### 📌 Giai Đoạn 4: Chuẩn Hóa Backend Modules
- [ ] Chuyển các SQL query trực tiếp trong `submissionController.js` sang `submissionService.js`.
- [ ] Tách `authMiddleware.js` để kiểm tra phân quyền JWT Token rõ ràng cho tất cả các API Endpoint.

---
*Tài liệu này là tiêu chuẩn bắt buộc cho dự án **AI Scoring Admin**.*
