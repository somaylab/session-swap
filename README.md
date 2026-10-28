# ⚡ session-swap

> **Universal Multi-Session Switcher Browser Extension for Chromium & Firefox**  
> Designed with a crisp **Semi Neo-Brutalism** interface. Built from scratch to support modern complex web apps (Claude, ChatGPT, Google SSO, Auth0, etc.).

---

## 🎯 Key Features

- **Universal Multi-Domain & Subdomain Support**
  Captures parent, subdomains, and related auth domains (e.g., `chatgpt.com` + `.chatgpt.com` + `auth.openai.com`, or `claude.ai` + `.claude.ai` + `.anthropic.com`).
- **Modern Security & Cookie Standards**
  Native support for `partitionKey` (CHIPS / Cookies Having Independent Partitioned State), `__Host-`, `__Secure-`, SameSite, and Secure flags.
- **Deep Web Storage Sync**
  Synchronizes `localStorage` and `sessionStorage` alongside cookies so Single Page Apps (SPA) and PWA auth tokens remain 100% consistent.
- **Zero Race Condition & Hard Cache-Bypass**
  Reloads tabs bypassing service worker stale caches (`bypassCache: true`), preventing session leaks or kick-outs.
- **Semi Neo-Brutalism UI**
  High-contrast visual design with bold borders, hard-edge offset shadows, punchy status badges, and quick session search.
- **Profile Tagging & Categorization**
  Organize sessions with custom tags: `Work`, `Personal`, `Admin`, `QA`, `Bot`.
- **Encapsulated JSON Export & Import**
  Easily backup or transfer sessions between browser profiles or devices.
- **Cross-Browser Manifest V3**
  Supports Google Chrome, Brave, Edge, Opera, Vivaldi (Chromium) as well as Mozilla Firefox (Gecko).

---

## 📦 Installation Guide

### Chromium (Google Chrome, Brave, Edge, Opera)
1. Download or clone this repository:
   ```bash
   git clone https://github.com/somaylab/session-swap.git
   cd session-swap
   ```
2. Build the extension:
   ```bash
   npm install
   npm run build
   ```
3. Open `chrome://extensions/` (or `edge://extensions/`, `brave://extensions/`).
4. Enable **Developer mode** (toggle in the top-right corner).
5. Click **Load unpacked** and select the `dist/` directory.

### Mozilla Firefox
1. Run build:
   ```bash
   npm run build:firefox
   ```
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**.
4. Select `dist/manifest.json`.

---

## 🛠️ Development & Build

This project runs natively on **Node.js** (v18+) without requiring external runtimes like Bun:

```bash
# Install dependencies
npm install

# Build for Chromium
npm run build

# Build for Firefox
npm run build:firefox

# Development Watch Mode
npm run dev
```

---

## 🔒 Security Architecture

`session-swap` is architected with defensive isolation in mind:
- **Host Permissions**: Requested for `<all_urls>` to enable cookie and storage capture across any authorized site.
- **Local Storage Isolation**: All session snapshots are stored strictly in `chrome.storage.local` within your browser profile. No third-party servers, no analytics, no external telemetry.
- **Attribution & Safety**: Prevents URL malformation bugs during cookie restoration via strict URI canonicalization.

---

## 📜 License & Credit

Copyright (c) 2026 **Somaylab**.  
Licensed under the **MIT License with Mandatory Attribution Requirement**.  
Open-source for public use, provided prominent attribution and credits to **Somaylab** are maintained. Prior consent is required for commercial redistribution.
