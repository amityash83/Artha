import sys
import os

# Add root directory to python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.main import app
from backend.db import init_db

if __name__ == "__main__":
    import uvicorn
    init_db()
    # Disable reload in production/packaged mode
    uvicorn.run(app, host="127.0.0.1", port=8000)
