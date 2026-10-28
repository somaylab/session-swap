# session-swap

[![Version](https://img.shields.io/badge/Version-v2.0.0-0284c7?style=flat-square)](https://github.com/somaylab/session-swap/releases/latest)
[![Manifest](https://img.shields.io/badge/Manifest-V3-16a34a?style=flat-square)](#)
[![Chromium](https://img.shields.io/badge/Chromium-Chrome%20%7C%20Brave%20%7C%20Edge%20%7C%20Opera-7e22ce?style=flat-square)](#)
[![Firefox](https://img.shields.io/badge/Firefox-Gecko%20Compatible-ea580c?style=flat-square)](#)
[![Anti-Bot Audit](https://img.shields.io/badge/Anti--Bot%20Audit-100%25%20Passed-22c55e?style=flat-square)](#)
[![License](https://img.shields.io/badge/License-MIT-ca8a04?style=flat-square)](LICENSE)

Universal multi-account session switcher and cookie manager for Chromium and Gecko runtimes. Designed with an ultra-wide Soft Neo-Brutalist developer dashboard (DevPop Brutal architecture) and engineered to support complex modern authentication architectures including Anthropic Claude, OpenAI ChatGPT, Google Workspace, and OAuth2/OIDC topologies. Features 1:1 bit-for-bit disaster recovery backup, CHIPS partitionKey preservation, and atomic context switching.

---

## Technical Overview

session-swap provides client-side authentication containerization directly within the browser runtime. It captures, decouples, and hot-swaps active user sessions across disparate domains, managing cookie headers, HTTP request credentials, and persistent web storage without triggering cross-context contamination or session invalidation.

### Key Capabilities

- **1:1 Bit-for-Bit Disaster Recovery**: Complete atomic snapshot and restore of all session profiles, exact session IDs, custom categories/tags, active domain mappings, and theme configurations.
- **Universal Multi-Account Switching**: Hot-swap between staging, production, admin, and personal accounts in single-click or keyboard shortcut.
- **CHIPS & RFC 6265bis Compliance**: Full partitionKey preservation, `__Host-` and `__Secure-` cookie prefix protection, and SameSite normalization.
- **Dual WebStorage Injection**: Synchronously flushes and restores `window.localStorage` and `window.sessionStorage` alongside cookie headers.
- **Cache-Bypass Reload**: Purges Service Worker cache and forces clean HTTP handshake on session switch to prevent stale access tokens.
- **DevPop Brutal UI**: Ultra-wide 780x600 high-density interface with 0-blur mechanical hard shadows, dual theme support (Dark / Light), and instant search.

---

## User Interface Wireframe

### Main Dashboard (780x600 Widescreen)

The primary interface features high-density tabular rows, keyboard navigation shortcuts, real-time status pills, and instant action clusters:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [#] SESSION-SWAP              [(o) WWW.YOUTUBE.COM]         [ 4 PROFILES ]   [<>]   [*]│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [ > SEARCH_KEYWORD...                [/] ]   [R]   [+ SAVE]  [EXPORT] [IMPORT] [BACKUP]│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [All 4]  [Staging 1]  [QA 1]  [Dev 1]  [Work 1]                                        │
├──────┬────────────────────┬──────────┬──────────────┬──────────┬─────────┬─────────────┤
│STATE │ PROFILE NAME       │ TAG      │ DOMAIN       │ PAYLOAD  │ SYNCED  │ ACTIONS     │
├──────┼────────────────────┼──────────┼──────────────┼──────────┼─────────┼─────────────┤
│ (*)  │ Staging Admin[ACT] │ #staging │ .youtube.com │ 14C  8S  │ 4m ago  │ [R][C][E][X]│
│ ( )  │ QA Customer Test   │ #testing │ .youtube.com │ 12C  4S  │ 2h ago  │ [SWITCH] [C]│
│ ( )  │ Dev Superuser      │ #dev     │ .youtube.com │ 19C  14S │ 1d ago  │ [SWITCH] [C]│
│ ( )  │ Prod Guest Check   │ #guest   │ .youtube.com │  3C  0S  │ 3d ago  │ [SWITCH] [C]│
├──────┴────────────────────┴──────────┴──────────────┴──────────┴─────────┴─────────────┤
│ (*) 4 PROFILES ACTIVE     Ctrl+S: Snapshot | /: Filter | Esc: Close               2.0.0│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Data Hub & Portability Modal (3 Dedicated Tabs)

Data portability is partitioned into three distinct operational domains: profile export, profile import, and complete 1:1 database backup/restore:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [<>] DATA HUB & PORTABILITY                                                         [X]│
│ Export profiles, import data, or create full 1:1 system backups.                       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [ EXPORT PROFILES ]       | [ IMPORT PROFILES ]       | [* BACKUP & RESTORE *]         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ [SNAPSHOT] 1:1 Full System Backup                         v2.0 Snapshot Archive    │ │
│ │ Creates an atomic snapshot: all profiles, exact IDs, tags, active map & theme.     │ │
│ │ ┌───────────────┬───────────────┬───────────────────┬────────────────────────────┐ │ │
│ │ │ SESSIONS: 4   │ DOMAINS: 2    │ ACTIVE TABS: 2    │ THEME: DARK                │ │ │
│ │ └───────────────┴───────────────┴───────────────────┴────────────────────────────┘ │ │
│ │ [ Copy Backup JSON ]                             [ Download Backup File (.json) ]  │ │
│ └────────────────────────────────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ [RECOVERY] 1:1 Database Restore                                  Disaster Recovery │ │
│ │ [ Upload Backup File ]  backup-snapshot-2026-10-28.json                            │ │
│ │ [v] Valid v2.0 Snapshot: 4 profile(s), 2 domain(s), Theme: DARK            [VALID] │ │
│ │ [!] Notice: Restore will atomically overwrite current database 1:1 with snapshot.  │ │
│ │ [ Cancel ]                                             [ RESTORE DATABASE 1:1 --]  │ │
│ └────────────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1:1 System Backup vs Profile Import/Export

session-swap enforces a clear distinction between sharing session profiles and performing system disaster recovery:

| Capability | Export / Import Profiles | 1:1 System Backup & Restore |
|:---|:---|:---|
| **Primary Scope** | Account sharing, individual domain migration | Disaster recovery, cross-browser cloning |
| **Data Envelope** | `SessionProfile[]` or raw Cookie-Editor arrays | `SystemBackupSnapshotV2` full database archive |
| **Session ID** | Auto-generates unique IDs to prevent collisions | 100% exact ID preservation bit-for-bit |
| **Active Session Map** | Retains existing active assignments | 100% exact restoration of active profile per domain |
| **System Settings** | Excluded | 100% restored (visual theme, UI preferences) |
| **Write Strategy** | Safe Merge or Overwrite matching names | Atomic replace (flushes and restores entire database) |
| **Category / Tag** | Falls back to "Imported" if empty | 100% preserved (empty remains empty, tags preserved) |

### Backup Envelope Specification (`v2.0`)

```json
{
  "format": "session-swap-system-backup",
  "app": "session-swap",
  "version": "2.0.0",
  "exportedAt": 1730134400000,
  "system": {
    "theme": "dark"
  },
  "activeSessions": {
    "github.com": "sess_1730134401234_abc",
    "claude.ai": "sess_1730134405678_xyz"
  },
  "sessions": [
    {
      "id": "sess_1730134401234_abc",
      "name": "Production Deployer",
      "domain": "github.com",
      "tag": "Work",
      "color": "var(--pastel-lavender)",
      "cookies": [],
      "storage": { "localStorage": {}, "sessionStorage": {} },
      "createdAt": 1730100000000,
      "lastUsed": 1730134400000,
      "order": 0
    }
  ]
}
```

---

## System Architecture

The extension is partitioned into three decoupled layers: Presentation Layer (Popup Dashboard), Core Engine (Background Service Worker), and Sandboxed Isolation Store (`chrome.storage.local`).

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                             BROWSER CLIENT RUNTIME                              │
│                                                                                 │
│  ┌─────────────────────────────┐               ┌─────────────────────────────┐  │
│  │     ACTIVE BROWSER TAB      │               │    POPUP INTERFACE (UI)     │  │
│  │      (e.g., claude.ai)      │               │     Ultra-Wide 780x600      │  │
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
│  │  └─────────────────────────────────┼──────────────────────────────────────┘  │
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

## Keyboard Shortcuts

| Shortcut | Context | Function |
|:---|:---|:---|
| `Ctrl+S` / `Cmd+S` | Global | Open Snapshot Modal to save current active session |
| `/` | Global (unfocused) | Focus instant search & filter bar |
| `Esc` | Modal Open | Dismiss active dialog / close popup |
| `Enter` | Search Field | Trigger direct filter execution |

---

## Installation

### Chromium (Google Chrome, Brave, Microsoft Edge, Opera, Vivaldi)

1. Download `session-swap-chrome-v2.0.0.zip` from the [Releases](https://github.com/somaylab/session-swap/releases/latest) page.
2. Extract the archive into a local folder.
3. Open `chrome://extensions/` (or `brave://extensions/`, `edge://extensions/`).
4. Toggle **Developer mode** in the upper-right corner.
5. Click **Load unpacked** and select the extracted folder (containing `manifest.json`).

### Mozilla Firefox

1. Download `session-swap-firefox-v2.0.0.zip` from [Releases](https://github.com/somaylab/session-swap/releases/latest).
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**.
4. Select the `manifest.json` file inside the unzipped Firefox directory.

---

## Compilation and Build Pipeline

The build system utilizes deterministic bundling powered by esbuild and Node.js.

```bash
# Install dependencies
npm install

# Build Chrome distribution (outputs to ./dist)
npm run build

# Build Firefox distribution (outputs to ./dist-firefox)
npm run build:firefox

# Run TypeScript strict type verification
npm run typecheck

# Watch mode for rapid UI development
npm run watch
```

---

## Security Model & Data Governance

session-swap enforces client-side data sovereignty:

- **Zero External Telemetry**: Zero network requests to third-party servers, analytics platforms, or external databases.
- **Local Isolation**: All serialized session profiles and settings reside exclusively within sandboxed `chrome.storage.local`.
- **Least-Privilege API Use**: Host permissions (`<all_urls>`) and storage permissions are strictly executed on the target host selected by the user.

---

## Evaluated Identity Providers

| Platform | Authentication Architecture | Compatibility Status |
|:---|:---|:---:|
| OpenAI ChatGPT | Multi-host, Cloudflare Turnstile, Auth0 | Verified Passed |
| Anthropic Claude | OIDC, Subdomain Caching, Indexed State | Verified Passed |
| Google Workspace | Multi-Account Container, SSO OAuth2 | Verified Passed |
| GitHub | Two-Factor Authenticated Session State | Verified Passed |

---

## License and Attribution

Copyright (c) 2026 Somay Security Research Lab.  
Licensed under the MIT License with Mandatory Attribution Requirement.
