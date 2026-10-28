---
name: DevPop Brutal
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#534434'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#867461'
  outline-variant: '#d8c3ad'
  surface-tint: '#855300'
  primary: '#855300'
  on-primary: '#ffffff'
  primary-container: '#f59e0b'
  on-primary-container: '#613b00'
  inverse-primary: '#ffb95f'
  secondary: '#006c4e'
  on-secondary: '#ffffff'
  secondary-container: '#80f9c8'
  on-secondary-container: '#007353'
  tertiary: '#525d83'
  on-tertiary: '#ffffff'
  tertiary-container: '#a5b0da'
  on-tertiary-container: '#374367'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffddb8'
  primary-fixed-dim: '#ffb95f'
  on-primary-fixed: '#2a1700'
  on-primary-fixed-variant: '#653e00'
  secondary-fixed: '#80f9c8'
  secondary-fixed-dim: '#62dcad'
  on-secondary-fixed: '#002115'
  on-secondary-fixed-variant: '#00513a'
  tertiary-fixed: '#dbe1ff'
  tertiary-fixed-dim: '#bac5f0'
  on-tertiary-fixed: '#0d1a3c'
  on-tertiary-fixed-variant: '#3a456a'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 26px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 16px
    fontWeight: '700'
    lineHeight: 22px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0em
  body-md:
    fontFamily: Space Grotesk
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0em
  body-sm:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0em
  label-lg:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: -0.01em
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 12px
    letterSpacing: 0.02em
  code-snippet:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0.5rem
  margin: 0.75rem
  space-xs: 0.25rem
  space-sm: 0.375rem
  space-md: 0.5rem
  space-lg: 0.75rem
  space-xl: 1rem
---

## Brand & Style

This design system expresses a high-density, tactile Neo-Brutalist design language built strictly for developer tool browser extension popups. It merges the physical authority of mechanical hardware and printed technical manuals with the rapid speed of modern developer workflows.

The visual direction rejects amorphous drop shadows, glassmorphism, fluid glowing gradients, and murky dark mode aesthetics. Instead, it prioritizes:
- **Structural Integrity:** Heavy structural ink borders defining every interactive boundary.
- **Physical Feedback:** 0px blur, hard-offset drop shadows mimicking physical push-buttons and keyed interfaces.
- **Tactile Paper Surfaces:** Warm cream and architectural paper base surfaces punctuated by vivid, un-blended flat pastel badges and actionable highlights.
- **Utilitarian Speed:** Compact ergonomics engineered to sit within strict 380px–420px browser action overlays, catering directly to keyboard-first muscle memory.

## Colors

The palette operates on high-contrast physical ink layered over a warm, tactile base tone. Every hue is opaque, saturated, and flat; no smooth gradients or semi-transparent color washes are permitted.

- **Canvas & Base Surfaces:** Canvas tone sits at `#FBF9F5` (warm parchment), while nested cards and active modules utilize pure `#FFFFFF` for crisp interior contrast.
- **Ink & Strokes:** `#0F172A` (Rich Carbon Slate) is applied across all component strokes, typography, and hard shadows.
- **Primary Accent (`#F59E0B`):** Neo Amber, reserved for primary execution buttons, active states, key hotkey triggers, and focused highlights.
- **Secondary Accent (`#6EE7B7`):** Neo Mint, applied to success states, active environment pills, network pass indicators, and copy confirmations.
- **Tertiary Accent (`#C7D2FE`):** Neo Lavender, utilized for payload inspector chips, HTTP methods, and secondary utilities.
- **Warning & Destruction (`#FCA5A5`):** Sharp Coral, designated for error logs, breaking actions, and destructive diff lines.
- **Muted Inks:** `#64748B` for secondary labels and `#E2E8F0` for structural interior division lines when not elevated.

## Typography

The type system blends the high-energy geometric display characteristics of `Space Grotesk` with the surgical legibility of `JetBrains Mono`.

- **Space Grotesk** anchors all structural titles, modals, actionable triggers, and high-level card headings. Tight tracking (`-0.02em`) creates a dense, industrial graphic weight.
- **JetBrains Mono** handles all developer metadata: API endpoints, status codes, micro tags, keyboard shortcut badges, key-value tables, and log traces.
- Sizes remain compact (10px to 20px) to maximize data density inside restricted viewport dimensions without sacrificing legibility or contrast.

## Layout & Spacing

The layout is built for fixed-width browser action extensions, targeting an exact viewport dimension of `400px` (min `380px`, max `420px`) and a max vertical viewport limit of `580px`.

- **Layout Grid:** A tight 4-column micro-grid with `0.5rem` (`8px`) gutters and `0.75rem` (`12px`) external margins.
- **Density Philosophy:** Compact vertical rhythm. Component inner padding scales tightly from `space-xs` (4px) to `space-md` (8px), allowing multiple inspector panels, query runners, and switchboards to remain visible without requiring nested scrolling containers.
- **Scroll Handling:** When panels exceed `580px` height, the header and footer remain pinned to the top and bottom with crisp 2px solid `#0F172A` dividing rules. The body region scrolls vertically using a 4px custom, solid-color scrollbar thumb (`#0F172A`) against a `#FBF9F5` track with zero border radius.

## Elevation & Depth

Depth is purely mechanical and physical. The design system explicitly bans Gaussian blurs, ambient lighting, frosted backdrops, and semi-transparent gradients.

- **The Ink Border Rule:** All elevated elements (cards, toolbars, buttons, alerts) must feature a continuous `2px solid #0F172A` outline. Nested items within primary cards may use `1.5px solid #0F172A` to maintain internal balance.
- **Hard-Offset Shadows:** Depth is produced exclusively via zero-blur hard offsets using `#0F172A`:
  - **Flat / Ground Level (Tier 0):** `box-shadow: 0px 0px 0px #0F172A;`
  - **Raised Card / Container (Tier 1):** `box-shadow: 2px 2px 0px #0F172A;`
  - **Interactive Button / Floating Dropdown (Tier 2):** `box-shadow: 3px 3px 0px #0F172A;`
  - **Active / Pressed State:** `transform: translate(2px, 2px); box-shadow: 0px 0px 0px #0F172A;`
- **Click Feedback:** Interactive elements physically shift downward and to the right upon user click or keyboard hotkey execution, directly canceling the offset shadow to simulate mechanical switch travel.

## Shapes

The design system employs a soft-brutalist geometry (`roundedness: 1`). Corners are neither razor-sharp nor bubble-like.

- **Base Radius:** `4px` (`0.25rem`) applied to inputs, standard buttons, tabs, and small badges.
- **Container Radius:** `6px` to `8px` (`0.5rem`) applied to primary cards, modal overlays, and popup perimeter viewports.
- **Tag & Chip Radius:** Strictly capped at `4px`—pill-shaped circles (`rounded-full`) are prohibited except for 6px status indicator dots. The corners maintain a tight geometric posture that respects the hard-offset drop shadows without clipping artifacts.

## Components

### Buttons
- **Primary Button:** Background `#F59E0B`, text `#0F172A`, border `2px solid #0F172A`, shadow `2.5px 2.5px 0px #0F172A`, font `Space Grotesk` 13px weight 700. On `:hover`, shift shadow to `3px 3px 0px #0F172A`. On `:active`, `transform: translate(2px, 2px); box-shadow: 0px 0px 0px #0F172A;`.
- **Secondary Button:** Background `#FFFFFF`, text `#0F172A`, border `2px solid #0F172A`, shadow `2px 2px 0px #0F172A`.
- **Icon / Utility Action:** Height and width `28px` by `28px`, square boundary, border `1.5px solid #0F172A`, background `#FFFFFF` or `#C7D2FE`, hard shadow `1.5px 1.5px 0px #0F172A`.

### Chips, Pills & Status Tags
- Monospace font (`JetBrains Mono` 10px / 11px), uppercase tracking.
- Border `1.5px solid #0F172A`, shadow `1.5px 1.5px 0px #0F172A`.
- **Variant - GET / 200 OK:** `#6EE7B7`.
- **Variant - POST / Payload:** `#C7D2FE`.
- **Variant - WARN / 4xx:** `#FDE047`.
- **Variant - ERR / 5xx:** `#FCA5A5`.

### Input Fields & Search Bars
- Background `#FFFFFF`, border `2px solid #0F172A`, corner radius `4px`, padding `6px 10px`.
- Typography: `JetBrains Mono` 12px.
- Placeholder text in `#64748B`.
- **Focus State:** `outline: none; box-shadow: 2.5px 2.5px 0px #0F172A; border-color: #0F172A; background-color: #FFFDF8;`.

### Checkboxes & Radios
- **Checkbox:** `16px x 16px` square, border `2px solid #0F172A`, radius `3px`, background `#FFFFFF`. Checked state fills with `#F59E0B` and displays an ink-black tick icon with an immediate `1px 1px 0px #0F172A` box shadow.
- **Radio Button:** `16px x 16px`, border `2px solid #0F172A`, radius `50%`. Checked state features a solid `#0F172A` inner dot with `4px` padding.

### Cards & Container Panels
- Surface `#FFFFFF`, border `2px solid #0F172A`, shadow `2.5px 2.5px 0px #0F172A`, corner radius `6px`.
- Card Header: Separated by a `1.5px solid #0F172A` bottom horizontal rule, background `#F4F4F0`, padding `8px 12px`.
- Body: `12px` padding, default background `#FFFFFF`.

### Code & Log Viewer
- Embedded blocks sit on `#0F172A` (Rich Carbon Slate) or `#F4F4F0` (raw paper mode) with `1.5px solid #0F172A` borders.
- Monospace syntax text formatted in `JetBrains Mono` 11px with zero line antialiasing fuzziness.
- Inline hotkey badge (`<kbd>`): Background `#FFFFFF`, border `1px solid #0F172A`, shadow `1px 1px 0px #0F172A`, radius `2px`, padding `1px 4px`, font size `10px`.