FROM python:3.12-slim

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ backend/
COPY run.py run.py

# FINANCE_DB_DIR determines where the SQLite file lives; mount a volume here
# to persist data across container restarts (see docker-compose.yml).
ENV FINANCE_DB_DIR=/data
RUN mkdir -p /data

EXPOSE 8000

# 0.0.0.0 (not 127.0.0.1) so the frontend container can reach this service by name.
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
