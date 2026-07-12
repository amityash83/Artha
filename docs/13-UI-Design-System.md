# 13-UI-Design-System - UI Design System

## Purpose
This document specifies the visual design language of the Financial Operating System (FOS) / Artha. It defines color tokens, typography scales, spacing rules, and reusable UI components.

## Scope
Covers all style tokens, component states, fonts, and theme definitions.

## Definitions
*   **Design Token:** An abstract value representing a visual style property (such as colors, fonts, or shadows) decoupled from implementation syntax.
*   **Contrast Ratio:** The measurement of luminance contrast between text and background to evaluate legibility.

## Responsibilities
*   Maintain visual consistency across the entire console interface.
*   Enforce accessibility standards.

## Relationships
*   Directs the component styles rendered on individual Screen Specifications.
*   Provides visual variables referenced by custom stylesheet files.

---

## 1. Color Palette (Dark Theme Tokens)

### Neutral Colors
*   **Background Base:** `#05070a` (Deep Slate Black)
*   **Card Container Background:** `rgba(255, 255, 255, 0.015)`
*   **Border Base:** `rgba(255, 255, 255, 0.06)`
*   **Text Primary:** `#f3f4f6` (Off-White)
*   **Text Secondary:** `#9ca3af` (Slate Gray)

### Accent Colors
*   **Accent Purple:** `#8b5cf6` (FOS Brand Glow)
*   **Emerald Green (Growth/Positive):** `#10b981`
*   **Destructive Red (Debt/Due Alerts):** `#ef4444`
*   **Alert Amber:** `#f59e0b`

---

## 2. Typography

*   **Primary Font Family:** `Inter`, Sans-Serif (loaded from Google Fonts).
*   **Scale:**
    *   *Display Title:* `32px` / Semibold (used for Net Worth indicators)
    *   *Section Header:* `20px` / Medium
    *   *Body Large:* `16px` / Regular
    *   *Body Standard:* `14px` / Regular
    *   *Caption / Helper:* `12px` / Light

---

## 3. Reusable Component Library

### Glassmorphic Card Containers
*   **Styling:**
    *   `backdrop-filter: blur(16px)`
    *   `border: 1px solid rgba(255, 255, 255, 0.06)`
    *   `box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3)`

### Interactive Buttons
*   **Primary Button:** Accent purple background, bold white text, hover glow transition.
*   **Secondary Button:** Transparent background, thin white border, light hover scale transition.
*   **Disabled State:** Opacity `0.4`, cursor blocked, zero hover reactions.

### Tables
*   **Styling:** Borderless vertical cells, horizontal divider line (`rgba(255, 255, 255, 0.04)`), zebra row highlighting on hover.

---

## Examples
*   *Component Implementation:* A card outstanding badge is rendered with background `#ef4444` at opacity `0.1`, displaying bold Destructive Red text for visibility.

## Future Enhancements
*   Adding responsive fluid spacing tokens for tablet adjustments.

## Open Questions
*   Should FOS support light theme tokens, or remain strictly dark theme optimized?

## References
*   *Material Design Accent Guidelines*
*   *W3C Accessibility Guidelines (WCAG 2.1)*
