# BlitzAI (hoodini/blitzai) — single-container image for Umbrel OS
# Backend: FastAPI + faster-whisper (port 8000)
# Frontend: Next.js (port 3000)
# Both processes run in one container via entrypoint.sh (matches upstream start.sh behavior)

# ---------- Stage 1: build the Next.js frontend ----------
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend

# Baked in at build time — Next.js inlines NEXT_PUBLIC_* vars during `next build`.
# Since the browser talks to whatever host/port Umbrel exposes, keep it relative
# to localhost:8000; both ports get published from the same container.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ---------- Stage 2: final runtime image ----------
FROM python:3.11-slim

LABEL org.opencontainers.image.title="BlitzAI" \
      org.opencontainers.image.description="Blitz AI — Hebrew-first transcription studio (Whisper/Groq/Gemini/ivrit-ai)" \
      org.opencontainers.image.source="https://github.com/hoodini/blitzai"

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    NODE_ENV=production \
    HOST=0.0.0.0 \
    BACKEND_PORT=8000 \
    FRONTEND_PORT=3000

# System deps: ffmpeg (audio processing), curl (healthcheck), and Node.js runtime
# (needed to run `next start` for the pre-built frontend).
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        curl \
        gnupg \
        ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- Backend (Python / FastAPI / faster-whisper) ----
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt \
    && pip install --no-cache-dir yt-dlp

COPY backend/ ./backend/

# ---- Frontend (pre-built Next.js output from stage 1) ----
COPY --from=frontend-builder /app/frontend/.next ./frontend/.next
COPY --from=frontend-builder /app/frontend/public ./frontend/public
COPY --from=frontend-builder /app/frontend/node_modules ./frontend/node_modules
COPY --from=frontend-builder /app/frontend/package*.json ./frontend/
COPY --from=frontend-builder /app/frontend/next.config.* ./frontend/

# Persistent data dirs (Umbrel mounts a host volume onto /data)
RUN mkdir -p /data/uploads /data/db \
    && ln -s /data/uploads /app/backend/uploads

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 8000 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
    CMD curl -fsS http://localhost:8000/ || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
