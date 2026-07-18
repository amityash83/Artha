---
description: Build both Artha Docker images, run the full stack on scratch ports, verify both services respond, then tear down cleanly
---

## Context

- Docker available: !`docker --version`
- Current containers/images already using artha- names: !`docker ps -a --filter "name=artha" --format "{{.Names}}: {{.Status}}"`

## Your task

Verify Artha's Docker deployment path builds and runs correctly end-to-end, without touching anything the user has running:

1. Pick two scratch host ports unlikely to collide with anything already running (e.g. 8210/8211) — check with `lsof -i :<port>` first and pick different ones if either is taken.
2. Run `ARTHA_BACKEND_HOST_PORT=<port> ARTHA_FRONTEND_HOST_PORT=<port> docker compose up --build -d` from the repo root.
3. Wait for both containers to report healthy/running (`docker compose ps`), then curl-check:
   - `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:<backend_port>/api/init` — expect `200`
   - `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:<frontend_port>/` — expect `200`
4. If either fails, check `docker compose logs backend` / `docker compose logs frontend` before reporting failure.
5. Tear down with `docker compose down -v` (the `-v` removes the named volume too, since this is a scratch verification run, not a real deployment — do NOT use `-v` if the user says this is their real data).
6. Report pass/fail plainly. Do not leave containers, images, or volumes behind on success.

Do not modify `docker-compose.yml`, `backend/Dockerfile`, or `frontend.Dockerfile` as part of this check — if something is broken, report it and stop; fixing it is a separate, explicit task.
