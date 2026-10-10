# Manual Build & Run Guide - Artha 🛠️

This guide outlines step-by-step instructions to set up, run, and compile the **Artha** desktop application manually from source code on a Windows machine.

---

## 1. Prerequisites (What to Download & Install)

Before running or building the app, make sure you have the following three programs installed:

1. **Node.js (LTS Version 20+)**
   - Download the installer from: [nodejs.org](https://nodejs.org/)
   - Run the installer and accept defaults. Confirm installation by running `node -v` in PowerShell.
2. **Python (Version 3.12)**
   - Download the installer from: [python.org/downloads/release/python-3120/](https://www.python.org/downloads/release/python-3120/)
   - **IMPORTANT:** Check the box that says **"Add Python.exe to PATH"** before clicking Install.
   - Confirm by running `python --version` in PowerShell.
3. **Git** (optional, to clone repo)
   - Download from: [git-scm.com](https://git-scm.com/)

---

## 2. Setting Up the Workspace

Open PowerShell or Command Prompt, navigate to the folder where you cloned/extracted the code:

```powershell
cd D:\AI\Antigravity
```

---

## 3. Creating & Configuring Python Virtual Environment

We run the Python backend in a virtual environment (`venv`) to keep dependencies isolated:

1. **Create the virtual environment:**
   ```powershell
   python -m venv venv
   ```
2. **Activate the virtual environment:**
   ```powershell
   venv\Scripts\Activate.ps1
   ```
3. **Install Python backend packages:**
   ```powershell
   pip install -r backend/requirements.txt
   ```
4. **Install PyInstaller (required for compilation):**
   ```powershell
   pip install pyinstaller
   ```

---

## 4. Installing Node.js (Frontend & Electron) Dependencies

With the virtual environment configured, install the npm modules:

```powershell
npm install
```
*(This installs React, Vite, TypeScript, Lucide Icons, Chart.js, Electron, and Electron-Builder).*

---

## 5. How to Run the Application Locally (Development Mode)

If you want to run and test changes interactively:

1. Open PowerShell in `D:\AI\Antigravity`.
2. Run the start script:
   ```powershell
   npm start
   ```
   **What this does under the hood:**
   - Starts Vite to compile and hot-reload React assets on `http://localhost:5173`.
   - Boots the Python FastAPI server in reload mode on `http://127.0.0.1:8000`.
   - Spawns the Electron browser shell window.
3. The active database location is resolved dynamically. By default, the app initializes the database file at `D:\AI\Antigravity\data\finance.db`, but you can customize or open separate files at runtime inside the "Integrations & Backups" tab.

---

## 6. How to Compile the Portable App Manually (Production Build)

If you want to compile and package everything into a single standalone `.exe` installer:

### Step 6.1: Build the React Frontend
This compiles TypeScript files and bundles React assets into static files inside the `frontend/dist/` directory:
```powershell
npm run build:frontend
```

### Step 6.2: Compile the Python Backend
This uses PyInstaller to compile the FastAPI server (starting from the runner `backend/run.py`) and packages it into a folder containing `main.exe` and its library dependencies under `backend/dist/main/`:
```powershell
npm run build:backend
```
*To verify that the compilation succeeded, you can test-run the generated binary manually in your terminal:*
```powershell
backend\dist\main\main.exe
```
*(If it starts up and prints "INFO: Started server process", close it using `Ctrl+C`).*

### Step 6.3: Package with Electron-Builder
This bundles the Electron shell, the static React folder (`frontend/dist/`, copied to `electron/web/`), and copies the PyInstaller folder (`backend/dist/main`) into the Electron resources folder, compressing everything into a single Windows portable file:
```powershell
npm run package:win -w electron
```

---

## 7. The Direct Shortcut Command

Instead of executing Steps 6.1, 6.2, and 6.3 separately, you can trigger the automated pipeline sequence using the package script:

```powershell
npm run package:portable
```

**Where to find the final build:**
Your standalone, zero-installation portable binary will be written to:
📂 **`D:\AI\Antigravity\dist-portable\Artha 1.0.4.exe`**
