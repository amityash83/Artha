# 06-UI-Design - User Interface & Experience

## Purpose
This document details screen layouts, dynamic forms, typography, color palettes, and navigation flows inside Artha.

## Scope
Covers all user-facing interfaces and styling tokens.

## Definitions
*   **Glassmorphic Design:** Visual style utilizing semi-transparent background blurs, thin borders, and subtle glows to create depth.
*   **DynamicForm:** A reusable React component that automatically renders input fields based on the selected category's JSON schema definitions.

## Design Decisions
1.  **Strict Color Palette (Dark Theme):**
    *   *Background:* `#07090e` (Deep Slate Black)
    *   *Panels:* `rgba(255, 255, 255, 0.015)` with `backdrop-filter: blur(12px)`
    *   *Accent:* `#8b5cf6` (Purple Glow) and `#10b981` (Emerald Green)
2.  **Modular Tabs Navigation:** Sidebar navigation linking Dashboard, Accounts, Assets, Liabilities, Credit Cards, Simulations, Budget Planner, Transactions, and Settings.
3.  **Realistic Vector Credit Cards:** Render physical card mockups containing sim chips, logo positioning, and dynamic light reflection shimmer.

## Grid and Components Layout

### Dashboard Layout Grid
```
+-------------------------------------------------------------+
| Net Worth Indicator | Liquid Capital | Debt Level | Fees    |
+-------------------------------------------------------------+
| Assets Allocation Chart     | Cash Flow Trajectory Graph    |
+-------------------------------------------------------------+
| Liability Amortization List | Budget Progress Bars          |
+-------------------------------------------------------------+
```

## Examples
*   *Adding a custom field:* If a user edits the 'Savings Account' category to include a 'Nominee' field, the `DynamicForm` component instantly renders a 'Nominee' text input when adding/modifying savings accounts.

## Future Enhancements
*   Adding a custom dashboard builder to let users drag, drop, and resize chart widgets.
*   Dynamic dark/light mode toggle based on OS preferences.

## Open Questions
*   Should we use Chart.js or migrate to Recharts for more interactive tooltip animations?
