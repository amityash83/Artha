# FinanceOS 🚀

FinanceOS is a lightweight, cross-platform **Financial Operating System** designed for high-level financial planning, retirement simulations, loan prepayments calculations, and strategic decision-making. 

Rather than standard accounting software, FinanceOS acts as a **decision sandbox** to help you plan your net worth progression and optimize debt reduction.

---

## ✨ Features

- **Net Worth Progress Tracker:** Automatically aggregates your cash deposits, properties, and investments against active loans to calculate and visualize your true net worth.
- **Smart Decision Engine:** Real-time color-coded recommendations that advise on debt prepayment, check for emergency reserves, and notify you of upcoming insurance premiums.
- **Goal Completion Sandbox:** Visualizes target achievements and computes precise completion dates based on monthly contribution power.
- **Advanced EMI Prepayment Simulator:** Interactive workspace resembling `emicalculator.net` but supporting mid-month lump-sum scheduling with pro-rata daily interest adjustment to show exact tenure/interest saved.
- **15-Minute Maintenance:** Updates your financial snapshots in less than 15 minutes a month, keeping data logging simple and pain-free.
- **Dynamic Database Switcher:** Open existing SQLite portfolios, create new ones anywhere on your system via native OS dialogues, and hot-switch between active profiles at runtime.
- **MMex Data Sync:** Import and synchronize account balances directly from **Money Manager Ex (MMex)** accounts exports.

---

## 📦 Standalone Portable Format (Recommended)

FinanceOS is packaged as a **single standalone portable executable**.
- Requires no installation.
- Creates and resolves the database folder (`data/`) **right next to the `.exe` file**.
- Perfect for running entirely off a USB thumb drive—your financial data travels with the app.

### How to Get the Portable App:
1. Go to the **Releases** section of this repository.
2. Download `FinanceOS 1.0.0.exe`.
3. Double-click to launch!

---

## 🛠️ Local Development (Run from Source)

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+)
- [Python](https://www.python.org/) (v3.12+)

### Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone <your-repository-url>
   cd Antigravity
   ```

2. **Set up Python Virtual Environment:**
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # Install dependencies:
   pip install -r backend/requirements.txt
   pip install pyinstaller
   ```

3. **Install Node Dependencies:**
   ```bash
   npm install
   ```

4. **Launch the Developer Environment:**
   ```bash
   # Spawns Vite, FastAPI reload server, and Electron dev frame concurrently
   npm start
   ```

---

## 🏗️ Compiling & Packaging

To compile the source code into a single-file portable Windows executable yourself:

```bash
# Compiles React frontend, runs PyInstaller, and bundles NSIS portable target
npm run package:portable
```

The resulting standalone executable will be written to `dist-portable/FinanceOS 1.0.0.exe`.

---

## ✈️ CI/CD Pipeline

This repository is configured with a GitHub Actions workflow (`.github/workflows/build-and-publish.yml`) that:
1. Runs compilation tests on pushes to the `main` branch.
2. Automatically generates, signs, and uploads the portable `FinanceOS 1.0.0.exe` binary as a draft asset whenever you push a version tag (e.g. `v1.0.0`).

---

## 📜 Specification Document

For the master design specification outlining FOS core principles, monthly snapshot layers, calculations matrices, decision warning engine, and long-term vision roadmap, please refer to the **[FOS Specification Document](file:///d:/AI/Antigravity/FOS.md)**.

