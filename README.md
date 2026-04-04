# ⚡ NeurDL: AI-Native High-Performance Downloader

[中文](#中文) | [English](#english)

---

<a name="中文"></a>
## 中文介绍

> **NeurDL** 是一款基于 Gemini AI 驱动的下一代高性能下载管理器。它不仅支持多协议并行下载，还能利用人工智能自动识别链接类型并实时优化下载参数（线程数、缓冲区、延迟等）。

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![AI-Powered](https://img.shields.io/badge/AI-Gemini%203%20Flash-orange)](https://deepmind.google/technologies/gemini/)
[![Firebase](https://img.shields.io/badge/Backend-Firebase-yellow)](https://firebase.google.com/)

### ✨ 核心特性

#### 🧠 AI 智能优化引擎
*   **协议自动识别**：无需手动选择，AI 自动识别 Magnet、Torrent、IPFS、HLS、SFTP 等多种协议。
*   **动态参数调优**：利用 **Gemini 3 Flash** 模型分析链接，实时分配最佳线程数（最高 64 线程）和缓冲区大小。
*   **智能配额管理**：内置 AI 使用配额系统，可视化监控 AI 引擎的调用状态。

#### 🌐 全协议支持
*   **传统协议**：HTTP/HTTPS, FTP, SFTP。
*   **现代 P2P**：Magnet (磁力链接), BitTorrent, IPFS。
*   **流媒体 & 视频**：支持 HLS (.m3u8) 抓取及基于 yt-dlp 的视频解析。

#### ☁️ 云端同步与安全
*   **Google 一键登录**：集成 Firebase Auth，保护您的下载列表。
*   **多端实时同步**：基于 Firestore，您的下载任务和进度在所有设备间实时同步，永不丢失。
*   **健壮的错误处理**：内置 Error Boundary 错误边界，针对网络波动和权限问题提供详细的诊断反馈。

#### 🎨 极致的 UI/UX 设计
*   **Raycast 风格界面**：极简、深邃、高效的侧边栏导航。
*   **实时数据可视化**：使用 Recharts 绘制全域下载速度曲线，实时监控 P2P 节点健康度。
*   **极致动画**：基于 Framer Motion 的丝滑交互体验。

---

<a name="english"></a>
## English Description

> **NeurDL** is a next-generation high-performance download manager driven by Gemini AI. It supports multi-protocol parallel downloads and leverages AI to automatically identify link types and optimize download parameters (threads, buffers, latency, etc.) in real-time.

### ✨ Key Features

#### 🧠 AI Intelligent Optimization Engine
*   **Automatic Protocol Identification**: No manual selection needed. AI automatically recognizes Magnet, Torrent, IPFS, HLS, SFTP, and more.
*   **Dynamic Parameter Tuning**: Uses the **Gemini 3 Flash** model to analyze links and allocate the best thread count (up to 64 threads) and buffer sizes in real-time.
*   **Intelligent Quota Management**: Built-in AI usage quota system with visual monitoring of the AI engine's status.

#### 🌐 Full Protocol Support
*   **Traditional Protocols**: HTTP/HTTPS, FTP, SFTP.
*   **Modern P2P**: Magnet links, BitTorrent, IPFS.
*   **Streaming & Video**: Supports HLS (.m3u8) scraping and yt-dlp based video parsing.

#### ☁️ Cloud Sync & Security
*   **One-Click Google Login**: Integrated Firebase Auth to protect your download lists.
*   **Multi-Device Real-time Sync**: Powered by Firestore, your download tasks and progress are synced across all devices instantly.
*   **Robust Error Handling**: Built-in Error Boundary for detailed diagnostic feedback on network fluctuations and permission issues.

#### 🎨 Ultimate UI/UX Design
*   **Raycast-style Interface**: Minimalist, deep, and efficient sidebar navigation.
*   **Real-time Data Visualization**: Uses Recharts to plot global download speed curves and monitor P2P node health.
*   **Fluid Animations**: Silky smooth interaction experience powered by Framer Motion.

---

## 🛠️ 技术栈 / Tech Stack

*   **Frontend**: React 18, Vite, Tailwind CSS
*   **Animation**: Framer Motion (motion/react)
*   **Backend**: Firebase (Authentication, Firestore)
*   **AI**: Google Gemini 3 Flash SDK (`@google/genai`)
*   **Charts**: Recharts
*   **Icons**: Lucide React

---

## 🚀 快速开始 / Quick Start

### 1. 克隆项目 / Clone Project
```bash
git clone https://github.com/your-username/NeurDL.git
cd NeurDL
```

### 2. 安装依赖 / Install Dependencies
```bash
npm install
```

### 3. 配置环境变量 / Configure Environment Variables
在根目录创建 `.env` 文件并填入您的 API 密钥 / Create a `.env` file in the root and fill in your API key:
```env
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
```
同时，请确保 `firebase-applet-config.json` 中包含有效的 Firebase 配置 / Also ensure `firebase-applet-config.json` contains valid Firebase configuration.

### 4. 启动开发服务器 / Start Dev Server
```bash
npm run dev
```

---

## 🛡️ 安全性说明 / Security

NeurDL 采用 **Firebase Security Rules** 保护用户隐私 / NeurDL uses **Firebase Security Rules** to protect user privacy:
*   **Data Isolation**: Each user can only access and modify their own download tasks.
*   **Permission Validation**: All sensitive operations are strictly verified on the backend.
*   **Authentication**: Google account login is mandatory to enable cloud sync.

---

## 📄 开源协议 / License

本项目采用 [Apache-2.0](LICENSE) 协议开源 / This project is open-sourced under the [Apache-2.0](LICENSE) license.

---

**NeurDL** - *让下载更智能，让速度更纯粹。 / Make downloading smarter, make speed purer.*
