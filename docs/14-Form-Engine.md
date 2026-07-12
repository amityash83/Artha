# 14-Form-Engine - Form Engine Specifications

## Purpose
This document specifies the metadata-driven Form Engine within the Financial Operating System (FOS) / Artha. It details dynamic field parsing, form validations, layout grids, and conditional field displays.

## Scope
Covers all automated input components, form rendering logic, and validation validations.

## Definitions
*   **Metadata Field Schema:** A structured description of a data field's type, validation constraints, and labels.
*   **Conditional Field:** An input field that renders only when a prerequisite input matches a specific value.

## Responsibilities
*   Generate forms dynamically from JSON category rules.
*   Enforce client-side input validations before API transfers.

## Relationships
*   Directly consumes schemas stored in the Category database table.
*   Generates inputs on the Accounts Hub and Assets/Liabilities registration views.

---

## 1. Metadata Schema Definition
Forms read field lists in JSON format. Each field matches this conceptual template:
```json
{
  "name": "interest_rate",
  "label": "Interest Rate (%)",
  "type": "number",
  "required": true,
  "default": 0.0,
  "validation": {
    "min": 0.0,
    "max": 100.0
  }
}
```

---

## 2. Field Type Mappings

| Field Type | Form Input Component | Client-Side Validation |
| :--- | :--- | :--- |
| **text** | Standard text input field | Trim whitespace, non-empty if required. |
| **number** | Numeric entry field | Parse to Float; enforce minimum/maximum boundaries. |
| **date** | Calendar select picker | Format to ISO date string (`YYYY-MM-DD`). |
| **select** | Dropdown option picker | Value must match configured option list. |

---

## 3. Conditional Layout Logic
*   **Trigger Rule:** If field schema has `depends_on`, evaluate parent value.
*   **Action:** If value matches `prerequisite_value`, render conditional field; else hide and clear state.
*   *Example:* Credit Card fee fields are hidden unless card category input is set to a paid tier.

---

## Examples
*   *Form Generation:* When registering a Mutual Fund holding, the system parses the category field definition, rendering "NAV" (numeric) and "Quantity" (numeric) input controls dynamically.

## Future Enhancements
*   Adding localized error message translations to the dynamic engine.

## Open Questions
*   Should form states auto-save progress in case the user closes the modal accidentally?

## References
*   *JSON Schema Standards (Draft-07)*
*   *React Form Controller Patterns*
