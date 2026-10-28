# session-swap

[![Version](https://img.shields.io/badge/Version-v1.1.0-0284c7?style=flat-square)](https://github.com/somaylab/session-swap/releases)
[![Manifest](https://img.shields.io/badge/Manifest-V3-16a34a?style=flat-square)](#)
[![Chromium](https://img.shields.io/badge/Chromium-Chrome%20%7C%20Brave%20%7C%20Edge%20%7C%20Opera-7e22ce?style=flat-square)](#)
[![Firefox](https://img.shields.io/badge/Firefox-Gecko%20Compatible-ea580c?style=flat-square)](#)
[![Anti-Bot Audit](https://img.shields.io/badge/Anti--Bot%20Audit-100%25%20Passed-22c55e?style=flat-square)](#)
[![License](https://img.shields.io/badge/License-MIT-ca8a04?style=flat-square)](LICENSE)

Universal multi-session management and partition-switching browser extension engineered for Chromium and Gecko runtimes. Designed with a semi neo-brutalism design system and architected to support complex enterprise identity providers and modern single-page applications including Anthropic Claude, OpenAI ChatGPT, Google Workspace, and OAuth2/OIDC topologies.

---

## Technical Overview

session-swap provides isolated state containerization directly within the client browser runtime. It captures, decouples, and hot-swaps authentication contexts across disparate domains, handling both cookie storage and persistent client-side web storage without triggering session collision or cross-context contamination.

### Core Architecture

- **Universal Multi-Domain Cluster Matching**  
  Captures parent, apex, and authentication subdomains concurrently (e.g., `chatgpt.com`, `.chatgpt.com`, `auth.openai.com`, and `cdn.oaistatic.com`, or `claude.ai` and `anthropic.com`).
  
- **Modern Cookie Standard Specification Adherence**  
  Full compliance with modern cookie storage standards:
  - `partitionKey` (CHIPS / Cookies Having Independent Partitioned State) for isolated iframe and third-party context persistence.
  - Strict prefix handling for `__Host-` (host-only, path `/`, secure transport mandatory) and `__Secure-` specifications.
  - SameSite contextual enforcement (`Strict`, `Lax`, `None`) and secure transmission flags.

- **Atomic Web Storage State Synchronization**  
  Extracts and restores `window.localStorage` and `window.sessionStorage` in parallel with cookie headers, ensuring Single Page Application (SPA) client states and JWT bearer tokens remain coherent.

- **Cache-Bypass Hard Reload Mechanism**  
  Enforces cache-invalidated document reloads (`bypassCache: true`) during profile transitions to purge stale Service Worker responses and client-side memory caches.

- **Semi Neo-Brutalism Interface Design**  
  High-contrast, functional user interface featuring structured borders, hard-edge shadows, visual profile tag badges, and real-time substring filtering.

- **Encapsulated Profile Portability**  
  Export and import complete session states via structured JSON profiles for migration across test profiles and distinct browser instances.

---

## Installation

### Chromium (Google Chrome, Brave, Microsoft Edge, Opera, Vivaldi)

1. Obtain the compiled build:
   - Download `session-swap-chrome-v1.0.0.zip` from the [Releases](https://github.com/somaylab/session-swap/releases) section and extract its contents, or compile from source.
2. Navigate to the extensions management interface:
   - Chrome: `chrome://extensions/`
   - Brave: `brave://extensions/`
   - Edge: `edge://extensions/`
3. Toggle **Developer mode** in the upper-right corner.
4. Select **Load unpacked** and choose the `dist/` folder (or extracted release folder).

### Mozilla Firefox

1. Obtain the compiled build:
   - Download `session-swap-firefox-v1.0.0.zip` from [Releases](https://github.com/somaylab/session-swap/releases), or compile using the Firefox target.
2. Navigate to `about:debugging#/runtime/this-firefox`.
3. Select **Load Temporary Add-on...**.
4. Choose the `manifest.json` file inside the distribution folder.

---

## Compilation and Build Pipeline

The project uses native Node.js tooling and esbuild for deterministic, zero-dependency bundling across operating systems.

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

## Verification & Anti-Bot Compatibility Audit

| Evaluated Identity Provider | Authentication Topology | Session Switch Status |
|:---|:---|:---:|
| OpenAI ChatGPT | Multi-host, Cloudflare Turnstile, Auth0 | Verified Passed |
| Anthropic Claude | OIDC, Subdomain Caching, Indexed State | Verified Passed |
| Google Accounts | Multi-Account Container, SSO OAuth2 | Verified Passed |
| GitHub | Two-Factor Authenticated Session State | Verified Passed |

---

## License and Attribution

Copyright (c) 2026 Somaylab.  
Licensed under the MIT License with Mandatory Attribution Requirement.

Permission is hereby granted to use and inspect this software under the terms of the MIT License, subject to the condition that all substantial reproductions, distributions, and forks maintain prominent and clear credit to Somaylab.
