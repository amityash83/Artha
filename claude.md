# Personal Finance Dashboard (FinanceOS) - Context & Architecture

This document serves as the developer context and single source of truth for **FinanceOS**, a lightweight, cross-platform desktop application designed for high-level financial planning, decision simulations, and sandbox planning.

---

## 1. Core Vision & Design Philosophy

- **Strategic Sandbox:** Not an accounting tool. It does not replace Money Manager Ex (MMex). It focuses on Retirement, Insurance, Goals, and Decision Simulations.
- **Low Maintenance:** Design targets < 15 minutes of monthly updates (using direct snapshot logs or MMex CSV sync imports).
- **Single Source of Truth:** Aggregates and logs monthly snapshots to visualize net worth progression.

---

## 2. Technology Stack & Frameworks

- **Frontend:** React, TypeScript, Vite.
- **Desktop Wrapper:** Electron (orchestrates HTML pages and spawns the backend service).
- **Backend:** Python FastAPI, SQLite (provides database querying, financial calculations, and decision alert rules).
- **Styling:** CSS variables, premium Glassmorphism Dark Mode theme (`src/index.css`).

---

## 3. Application Architecture

```
                       +---------------------------------------+
                       |           Electron Wrapper            |
                       |       (electron/main.js Shell)        |
                       +---+-------------------------------+---+
                           | (Dev: loads localhost:5173)   | (Prod: loads dist/index.html)
                           v                               v
            +--------------+---------------+       +-------+---------------+
            |        Vite Server           |       |   React UI Static     |
            |     (Hot Reload Dev)         |       |   (HTML/CSS/JS)       |
            +--------------+---------------+       +-------+---------------+
                           |                               |
                           +---------------+---------------+
                                           | (HTTP REST calls on port 8000)
                                           v
                       +-------------------+-------------------+
                       |         Python FastAPI Server         |
                       | (Dev: venv python | Prod: main.exe)   |
                       +---+-------------------------------+---+
                           |                               |
                           v                               v
            +--------------+---------------+       +-------+---------------+
            |      Financial Calculations  |       |   SQLite Database     |
            |      (calculations.py)       |       |     (finance.db)      |
            +------------------------------+       +-----------------------+
```

### Packaging & Executable Structure
- **Production Build:** `npm run package:portable` builds the React frontend, packages the Python backend via PyInstaller into `backend/dist/main/`, and uses `electron-builder` to bundle them into a standalone portable NSIS executable: `dist-portable/FinanceOS 1.0.0.exe`.
- **Sidecar Launch:** Electron launches the compiled `main.exe` binary on startup as a background sidecar. On window close, Electron cleans up the process tree.

---

## 4. Portability & Database Path Resolution

To support a true "portable app" format (similar to MMex portable) while allowing runtime database definition:

1. **Preference Persistence (`settings.json`):**
   - Active database preferences are stored in the user's home directory: `~/.financeos/settings.json`.
   - This records `active_db_path` and `recent_databases` history to toggle between plan sandboxes dynamically.
2. **Standard Fallback Resolution:**
   - If no configuration exists, it defaults to:
     - Development Mode: `d:\AI\Antigravity\data\finance.db`.
     - Packaged Portable Mode: `[PORTABLE_DIR]/data/finance.db` (retrieved from `process.env.PORTABLE_EXECUTABLE_DIR` by Electron).
     - Unpacked Packaged Mode: `C:/Users/Username/AppData/Roaming/FinanceOS/data/finance.db`.

### How DB Path is Communicated & Switched
Electron resolves the fallback path on launch and creates it. It passes the path via the `FINANCE_DB_DIR` environment variable to Python. At runtime, the React frontend can trigger native file save/open dialogues via Electron IPC (`select-db-file`). Once selected, the React app registers the new path on the backend via `/api/settings/database`, which saves the preference, switches SQLite connections dynamically, and runs automated schema migrations.

---

## 5. Directory Structure & Key Files

- [package.json](file:///d:/AI/Antigravity/package.json): NPM scripts and dependencies. Declares `electron-builder` configuration for portable target outputs.
- [run.py](file:///d:/AI/Antigravity/run.py): Root-level entry point for PyInstaller. Solves module pathing issues by placing the `backend` package root in Python's namespace.
- [electron/main.js](file:///d:/AI/Antigravity/electron/main.js): Spawns the backend sidecar, resolves paths, sets environment variables, registers native dialog IPC channels, and launches the Electron window.
- [backend/main.py](file:///d:/AI/Antigravity/backend/main.py): FastAPI server, API routers, and database settings switch / calculations endpoints.
- [backend/db.py](file:///d:/AI/Antigravity/backend/db.py): SQLite table creations, automated migration scripts, preference loads/saves, and database switches.
- [backend/calculations.py](file:///d:/AI/Antigravity/backend/calculations.py): Core mathematical formulas (remaining tenure, prepayment interest saved, XIRR solver, multi-loan payoff simulation with monthly/annual cascading prepayments, and daily pro-rata mid-month prepayment amortizations).
- [backend/decision_engine.py](file:///d:/AI/Antigravity/backend/decision_engine.py): Financial sanity check rules and warning alerts.
- [src/index.css](file:///d:/AI/Antigravity/src/index.css): Theme styling tokens, premium Glassmorphism variables, custom scrollbars, and select-dropdown visibility fixes.
- [src/components/Accounts.tsx](file:///d:/AI/Antigravity/src/components/Accounts.tsx): Savings view. Displays accounts filtered/shortlisted by Bank Name.
- [src/components/EmiCalculator.tsx](file:///d:/AI/Antigravity/src/components/EmiCalculator.tsx): Standalone advanced EMI prepayments calculator view.
- [src/components/LoanOptimizer.tsx](file:///d:/AI/Antigravity/src/components/LoanOptimizer.tsx): Multi-loan payoff curves comparison workspace comparing Snowball, Avalanche, and Baseline strategies under monthly or annual prepayment configurations.
- [FOS.md](file:///d:/AI/Antigravity/FOS.md): Master specification document containing application vision, architecture, features roadmap, and structural principles.

---

## 6. Build & Run Command Cheatsheet

### Local Development
```bash
# Starts Vite, FastAPI reload server, and Electron Dev Shell concurrently
npm start
```

### Compile & Bundle Portable App
```bash
# Builds React static assets, runs PyInstaller on run.py, and runs electron-builder
npm run package:portable
```

### Manual Backend Debugging
```bash
# Run backend manual check to verify start-up tracebacks
venv\Scripts\python run.py
```

