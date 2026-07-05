# Artha - Product Vision & Architecture Spec

**Version:** 1.0
**Last Updated:** July 2026

---

# Artha

**Artha** is a privacy-first, AI-powered Personal Financial Intelligence Platform.

It is **not** an accounting application and **not** a replacement for Money Manager Ex (MMEx).

Instead, Artha acts as the **Financial Intelligence Layer** on top of financial data.

---

# Philosophy

```
Money Manager Ex
        │
        ▼
 System of Record
        │
        ▼
      Artha
        │
        ▼
 System of Intelligence
```

MMEx stores transactions.

Artha understands them.

---

# Core Principles

* Offline First
* Privacy First
* Local SQLite Database
* Single Portable Binary
* No Installation Required
* No Mandatory Cloud
* AI Assisted
* Modular Architecture
* Open and Extensible

---

# Current Technology

Application Type

* Desktop Application

Packaging

* Single Portable Executable (.exe)

Database

* SQLite

Deployment

* Portable
* Copy and Run
* No Installer Required

Internet

* Not Required for Core Features

---

# Long-Term Vision

Future releases should remain true to the following philosophy.

```
Windows

↓

Portable EXE

↓

Linux

↓

Portable Binary

↓

macOS

↓

Native Binary

↓

(Optional)

Docker

↓

(Optional)

Web Version

↓

(Optional)

Mobile Companion
```

The desktop application remains the primary product.

Cloud synchronization, if ever implemented, should always be optional.

---

# Product Goal

Help users answer questions such as:

* Where is my money going?
* Can I afford this purchase?
* Which credit card should I use?
* Should I prepay my loan?
* Am I saving enough?
* What is my projected cash flow?
* Which financial decision creates the highest long-term benefit?

---

# High-Level Modules

```
Artha

├── Dashboard
├── Banking
├── Credit Cards
├── Loans
├── Investments
├── Insurance
├── Properties
├── Goals
├── Documents
├── Financial Calendar
├── Reports
├── Analytics
├── Financial Intelligence
└── Settings
```

Every module should be independent while sharing a common data model.

---

# Architecture

```
Artha

├── UI Layer
│
├── Application Layer
│
├── Financial Engine
│
├── Analytics Engine
│
├── AI Engine
│
├── SQLite Database
│
└── File Storage
```

Business logic should remain separate from the UI.

---

# Module Details

## Dashboard

Provides an overall financial health snapshot.

Examples

* Net Worth
* Monthly Cash Flow
* Assets
* Liabilities
* Upcoming Payments
* Recent Activity
* Alerts

---

## Banking

Track

* Accounts
* Balances
* Interest
* Fixed Deposits
* Savings
* Cash Flow

---

## Credit Cards

Purpose

Optimize rewards while minimizing fees.

Features

* Card Inventory
* Annual Fees
* Renewal Dates
* Reward Points
* Spend Tracking
* Spend Milestones
* Merchant Rules
* Reward Calculator
* Lounge Access
* Statement Archive
* Closure Planner
* Offer Tracker
* Devaluation History

Example Questions

* Which card should I use?
* Which card earns the highest reward?
* Is this annual fee justified?
* Should I close this card?

---

## Loans

Track

* Outstanding Principal
* Interest Rate
* EMI
* Prepayments
* Amortization
* Future Projection

Support

* Home Loan
* Personal Loan
* Vehicle Loan
* LAP
* Construction Loan

---

## Investments

Track

* Mutual Funds
* Stocks
* PPF
* EPF
* NPS
* Gold
* Bonds
* ETFs

Provide

* Asset Allocation
* CAGR
* XIRR
* Goal Mapping

---

## Insurance

Track

* Health Insurance
* Life Insurance
* Vehicle Insurance
* Premium Calendar
* Renewal Alerts

---

## Properties

Track

* Purchase Value
* Current Value
* Loan Mapping
* Documents
* Rental Income
* Appreciation

---

## Goals

Examples

* Retirement
* Children's Education
* Villa
* Emergency Fund
* Vehicle Purchase

Each goal should display

* Progress
* Funding Status
* Timeline
* Gap Analysis

---

# Financial Intelligence Engine

This is the core differentiator.

Instead of simply displaying data, Artha should provide insights.

Examples

* Recommend loan prepayment
* Suggest investment allocation
* Predict cash flow
* Identify unnecessary expenses
* Detect duplicate subscriptions
* Recommend the best credit card
* Estimate financial impact before major purchases

---

# AI Copilot

Future capability.

Users should be able to ask natural-language questions.

Examples

> Can I afford a new iPhone?

> Which card should I use for this transaction?

> How much reward will I earn?

> What happens if I prepay ₹5 lakh?

> Should I invest or reduce my loan?

The AI should answer using the user's own financial data.

---

# Design Principles

* Minimalist
* Fast
* Keyboard Friendly
* Responsive
* Dark Mode Support
* Export Friendly
* Zero Vendor Lock-in

---

# Data Storage

SQLite should remain the primary storage engine.

Suggested approach

```
SQLite

├── Banking
├── Credit Cards
├── Loans
├── Investments
├── Insurance
├── Properties
├── Goals
├── Reports
└── Settings
```

Documents can be stored externally with references inside SQLite.

---

# Extensibility

Future modules should plug into Artha without changing the core architecture.

Examples

* Tax Planning
* Estate Planning
* Business Finance
* GST
* Portfolio Rebalancer
* Expense Forecasting
* Financial Risk Analysis

---

# Development Philosophy

* Build modularly.
* Keep features independent.
* Avoid unnecessary complexity.
* Favor maintainability over cleverness.
* Preserve backward compatibility where practical.
* Every feature should solve a real financial problem.

---

# Product Mission

Artha is not just another finance application.

It is a **Personal Financial Intelligence Platform** that transforms financial records into actionable decisions.

Users should not merely see their financial data—they should understand it, optimize it, and confidently act on it.

---

# Guiding Statement

> **MMEx records what happened. Artha explains what happened, predicts what will happen, and recommends what should happen next.**
