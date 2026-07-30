---
name: setup-dev
description: Diagnose and fix known local dev environment issues on this machine (Anaconda shadowing npm/npx/node, duplicate backend on :8000, stale Postgres postmaster.pid after reboot)
disable-model-invocation: true
---

Run these checks in order. Stop at the first one that finds a problem, fix it, then continue.

## 1. PATH shadowing (npm/npx/node)

Anaconda shadows `npm`/`npx`/`node` in the default shell PATH. Symptom: "command not found" or the wrong version running.

```bash
export PATH="/usr/local/bin:$PATH"
which npm node npx   # should all resolve under /usr/local/bin
```

Run frontend commands (`npm run dev`, `npm run lint`, etc.) from `frontend/` with this PATH set.

## 2. Duplicate backend on :8000

More than one uvicorn instance has been seen bound to port 8000 at once (stale one from an old terminal on `0.0.0.0`, fresh one on `127.0.0.1`) — localhost traffic silently hits the wrong one.

```bash
lsof -nP -iTCP:8000 -sTCP:LISTEN
```

If more than one row shows up, kill the stale PID(s), keep (or restart) one:

```bash
kill <stale_pid>
cd backend && .venv/bin/uvicorn app.main:app --port 8000
```

## 3. Stale Postgres postmaster.pid (after a reboot)

Symptom: backend gets connection-refused on `:5432`; `brew services list` shows `postgresql@18` as `error`. Cause: an unclean shutdown leaves a stale pidfile and launchd retries every 10s without recovering.

```bash
brew services list | grep postgresql
pgrep -fl postgres   # confirm no real postgres process owns the pidfile's PID
```

If confirmed stale:

```bash
rm /usr/local/var/postgresql@18/postmaster.pid
brew services restart postgresql@18
```

## 4. Verify

```bash
psql "postgresql://musarashid@localhost:5432/jadeed_kashtkar_db" -c '\q' && echo "postgres OK"
lsof -nP -iTCP:8000 -sTCP:LISTEN | wc -l   # expect 2 (header + 1 listener), 1 if backend not started, 3+ means a duplicate
```
