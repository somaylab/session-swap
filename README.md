# session-swap

[![Version](https://img.shields.io/badge/Version-v1.2.0-0284c7?style=flat-square)](https://github.com/somaylab/session-swap/releases)
[![Manifest](https://img.shields.io/badge/Manifest-V3-16a34a?style=flat-square)](#)
[![Chromium](https://img.shields.io/badge/Chromium-Chrome%20%7C%20Brave%20%7C%20Edge%20%7C%20Opera-7e22ce?style=flat-square)](#)
[![Firefox](https://img.shields.io/badge/Firefox-Gecko%20Compatible-ea580c?style=flat-square)](#)
[![Anti-Bot Audit](https://img.shields.io/badge/Anti--Bot%20Audit-100%25%20Passed-22c55e?style=flat-square)](#)
[![License](https://img.shields.io/badge/License-MIT-ca8a04?style=flat-square)](LICENSE)

Universal multi-session management and partition-switching browser extension engineered for Chromium and Gecko runtimes. Designed with a clean, developer-native interface and architected to support complex identity providers and modern single-page applications including Anthropic Claude, OpenAI ChatGPT, Google Workspace, and OAuth2/OIDC topologies.

---

## Technical Overview

session-swap provides client-side state containerization directly within the browser runtime. It captures, decouples, and hot-swaps authentication contexts across disparate domains, managing both cookie headers and persistent web storage without triggering cross-context contamination.

### User Interface Wireframe

The interface adheres to an expansive 540x600 layout engineered for high readability, crisp typography, and comfortable click targets:

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ [Mark] Session-Swap            [ (●) chatgpt.com ]        [ Backup/Sync ] [ Theme ]   │
├───────────────────────────────────────────────────────────────────────────────────────┤
│ [ + Save Current Session ]               [ Clean Guest Session ]                      │
├───────────────────────────────────────────────────────────────────────────────────────┤
│ [ Q Search sessions by name or tag...                                             /]  │
│ [All Sessions]  [Work]  [Personal]  [Staging]                                         │
├───────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                       │
│  ┌────┐  Work Account  [Work]  [● ACTIVE]                                             │
│  │ W  │  Saved 2m ago · 14 cookies · 2 storages             [✓ In Use] [Edit] [Del]   │
│  └────┘                                                                               │
│                                                                                       │
│  ┌────┐  Personal Account  [Personal]                                                 │
│  │ P  │  Saved 1h ago · 8 cookies · 1 storage               [ Switch ] [Edit] [Del]   │
│  └────┘                                                                               │
│                                                                                       │
├───────────────────────────────────────────────────────────────────────────────────────┤
│ (●) 2 sessions stored on chatgpt.com                  v1.2.0 · Session-Swap © Somaylab│
└───────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Architecture & System Mechanism

The extension is partitioned into three decoupled layers: the Presentation Layer (Popup UI), the Execution Layer (Background Service Worker), and the Isolation Store (`chrome.storage.local`).

### System Topology Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                             BROWSER CLIENT RUNTIME                              │
│                                                                                 │
│  ┌─────────────────────────────┐               ┌─────────────────────────────┐  │
│  │     ACTIVE BROWSER TAB      │               │    POPUP INTERFACE (UI)     │  │
│  │      (e.g., claude.ai)      │               │      Expansive 540x600      │  │
│  └──────────────┬──────────────┘               └──────────────┬──────────────┘  │
│                 │                                             │                 │
│                 │ DOM Script Injection                        │ Type-Safe IPC   │
│                 ▼                                             ▼                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                   BACKGROUND SERVICE WORKER (CORE ENGINE)                 │  │
│  │                                                                           │  │
│  │   ┌──────────────────────────┐          ┌─────────────────────────────┐   │  │
│  │   │       CookieEngine       │          │        StorageEngine        │   │  │
│  │   │  - Cluster Resolution    │          │  - LocalStorage Serializer  │   │  │
│  │   │  - RFC 6265bis Rules     │          │  - SessionStorage Injector  │   │  │
│  │   │  - CHIPS PartitionKey    │          │  - Atomic Flush & Restore   │   │  │
│  │   └────────────┬─────────────┘          └──────────────┬──────────────┘   │  │
│  │                │                                       │                  │  │
│  │                └───────────────────┬───────────────────┘                  │  │
│  │                                    │                                      │  │
│  │                                    ▼                                      │  │
│  │                         ┌──────────────────────┐                          │  │
│  │                         │    SessionManager    │                          │  │
│  │                         │   Snapshot & Switch  │                          │  │
│  │                         └──────────┬───────────┘                          │  │
│  │                                    │                                      │  │
│  └────────────────────────────────────┼──────────────────────────────────────┘  │
│                                       │                                         │
│                                       ▼                                         │
│                      ┌──────────────────────────────────┐                       │
│                      │       chrome.storage.local       │                       │
│                      │    Sandboxed Profile Database    │                       │
│                      └──────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## State Transition & Switch Lifecycle

When switching between profiles or initializing a guest session, session-swap follows a strict sequential lifecycle to prevent token leakage:

```
┌──────────────────────────────────────────────────────────────┐
│            User triggers Switch on Target Profile            │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│            Step 1: Domain Cluster Identification             │
│   Resolves apex domain and authentication subdomains         │
│   (e.g., chatgpt.com + .chatgpt.com + auth.openai.com)       │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│          Step 2: Atomic Cookie Eviction & Injection          │
│   Clears active domain cookies via chrome.cookies.remove     │
│   Sets snapshot cookies preserving __Host-, __Secure-, CHIPS │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│           Step 3: WebStorage Synchronous Overwrite           │
│   Executes DOM script targeting active tab ID                │
│   Flushes window.localStorage and window.sessionStorage      │
│   Re-populates keys from stored profile snapshot             │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│              Step 4: Cache-Bypass Hard Reload                │
│   Executes chrome.tabs.reload(tabId, { bypassCache: true })  │
│   Purges Service Worker network response cache               │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│     Authenticated Session Restored with Zero Collision       │
└──────────────────────────────────────────────────────────────┘
```

---

## Installation

### Chromium (Google Chrome, Brave, Microsoft Edge, Opera, Vivaldi)

1. Obtain the compiled build:
   - Download `session-swap-chrome-v1.2.0.zip` from the [Releases](https://github.com/somaylab/session-swap/releases) page and extract its contents, or compile from source.
2. Navigate to the extensions management interface:
   - Chrome: `chrome://extensions/`
   - Brave: `brave://extensions/`
   - Edge: `edge://extensions/`
3. Enable **Developer mode** in the upper-right corner.
4. Select **Load unpacked** and choose the `dist/` directory.

### Mozilla Firefox

1. Obtain the compiled build:
   - Download `session-swap-firefox-v1.2.0.zip` from [Releases](https://github.com/somaylab/session-swap/releases), or compile using the Firefox build target.
2. Navigate to `about:debugging#/runtime/this-firefox`.
3. Select **Load Temporary Add-on...**.
4. Choose the `manifest.json` file inside the distribution folder.

---

## Compilation and Build Pipeline

The project uses native Node.js tooling and esbuild for deterministic bundling across platforms.

```bash
# Install development dependencies
npm install

# Compile target for Chromium engines (output to ./dist)
npm run build

# Compile target for Gecko / Firefox engine (output to ./dist)
npm run build:firefox

# Verify TypeScript type definitions
npm run typecheck

# Continuous development watch mode
npm run watch
```

---

## Security Model & Data Governance

session-swap enforces client-side data sovereignty:
- **Zero External Telemetry**: No network requests are initiated to third-party endpoints, metrics collectors, or external storage servers.
- **Local Isolation**: All serialized session profiles are stored in the browser's sandboxed `chrome.storage.local` context.
- **Permission Boundaries**: Host permissions (`<all_urls>`) and storage permissions are strictly utilized for cookie query, removal, and injection operations on the actively targeted host.

---

## Evaluated Identity Providers

| Target Platform | Authentication Architecture | Compatibility Status |
|:---|:---|:---:|
| OpenAI ChatGPT | Multi-host, Cloudflare Turnstile, Auth0 | Verified Passed |
| Anthropic Claude | OIDC, Subdomain Caching, Indexed State | Verified Passed |
| Google Workspace | Multi-Account Container, SSO OAuth2 | Verified Passed |
| GitHub | Two-Factor Authenticated Session State | Verified Passed |

---

## License and Attribution

Copyright (c) 2026 Somaylab.  
Licensed under the MIT License with Mandatory Attribution Requirement.

Permission is hereby granted to use and inspect this software under the terms of the MIT License, subject to the condition that all substantial reproductions, distributions, and forks maintain prominent and clear credit to Somaylab.
