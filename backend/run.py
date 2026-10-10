import sys
import os

# The backend imports itself as the `backend` package, so the repo root (this file's
# parent directory) must be on the path. PyInstaller builds get the same via --paths .
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.main import app
from backend.db import init_db

if __name__ == "__main__":
    import uvicorn
    init_db()
    port = int(os.environ.get("ARTHA_BACKEND_PORT", "8000"))
    # Disable reload in production/packaged mode
    uvicorn.run(app, host="127.0.0.1", port=port)
