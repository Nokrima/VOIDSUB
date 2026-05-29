# VoidSub v2.0.0 Dependency License Report

This document outlines the primary dependencies used across the VoidSub v2.0.0 stack (Frontend, Backend Core, and Python OCR/Translation engines) and their corresponding open-source licenses.

## 1. Frontend (Node.js / React / Tauri)

| Package | Purpose | License | Copyleft / Restrictive |
|---|---|---|---|
| `react` / `react-dom` | Core UI Framework | MIT | No |
| `@tauri-apps/api` | Bridge to Rust Core | MIT / Apache-2.0 | No |
| `vite` | Build Tooling | MIT | No |
| `lucide-react` | Icons | ISC | No |
| `framer-motion` | Animations | MIT | No |

## 2. Backend Core (Rust / Tauri)

| Crate | Purpose | License | Copyleft / Restrictive |
|---|---|---|---|
| `tauri` | App Framework | MIT / Apache-2.0 | No |
| `serde` / `serde_json` | Serialization | MIT / Apache-2.0 | No |
| `window-vibrancy` | Acrylic/Mica Effects | MIT | No |
| `windows-sys` | Windows API bindings | MIT / Apache-2.0 | No |
| `log` | Logging | MIT / Apache-2.0 | No |

## 3. Python Engine (OCR & Translation)

| Package | Purpose | License | Copyleft / Restrictive |
|---|---|---|---|
| `easyocr` | Offline Optical Character Recognition | Apache-2.0 | No |
| `torch` / `torchvision` | AI Tensor Computations | BSD-3-Clause | No |
| `opencv-python` | Image Processing | Apache-2.0 | No |
| `Pillow` | Image manipulation | HPND (MIT-like) | No |
| `deep-translator` | Cloud Translation API wrappers | MIT | No |
| `websockets` | Bridge Communication | BSD-3-Clause | No |
| `numpy` | Array Processing | BSD-3-Clause | No |

## Summary of Copyleft Exposure

**Zero Copyleft Exposure.** 
No GPL, AGPL, or structurally restrictive copyleft licenses are present in the distributed application bundle. All dependencies are permissively licensed under MIT, Apache-2.0, BSD, or ISC.
