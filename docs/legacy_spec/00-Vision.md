# 00-Vision - Financial Operating System (FOS)

## Purpose
This document outlines the core business vision, target audience, success criteria, and long-term goals of the Financial Operating System (FOS) / Artha.

## Scope
Includes only business value statements, problem definitions, audience criteria, and strategic goals. It remains completely free of implementation details, technologies, or database designs.

## Definitions
*   **Artha / FOS:** The business-focused name of the personal finance organizer system.
*   **Liquid Net Worth:** Cash or cash equivalents easily deployable for financial goals or emergencies.
*   **Locked Capital:** Wealth tied up in long-term illiquid assets (such as real estate, retirement funds, or locked insurance policies).

## Design Decisions (Business Vision)
*   **Local-First Design:** The business choice to prioritize privacy over global syncing, ensuring all financial records reside only on the user's hard drive.
*   **Zero-External API Dependency:** To maintain security and stability, the system runs autonomously without requiring active bank scrapers.

## Examples
*   *Emergency Fund Verification:* The system instantly displays exactly how much liquid cash is available across savings accounts and liquid assets vs. long-term locked deposits.
*   *Milestone Spend Goal:* Hitting a ₹1.5 Lakh monthly threshold on a premium credit card to earn 10,000 bonus points.

## Future Enhancements
*   Secure local LLM integration for processing bank statement CSV files and categorizing transactions offline.
*   Multi-profile support for family wealth management.

## Open Questions
*   Should the system support syncing encrypted backups to user-configured personal cloud storages (Google Drive/Dropbox), or remain strictly offline?
