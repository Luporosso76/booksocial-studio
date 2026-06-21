# BookSocial Studio — single-container image (backend Hono + built frontend).
# NB: la generazione IMMAGINI locale (sd-cli / Z-Image su GPU) NON è inclusa: in container
# l'app funziona in modalità "solo upload immagini". Il resto (testi/canone/pubblicazione) funziona.

# --- 1) build del frontend (Vite) ---
FROM node:24-slim AS webbuild
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# --- 2) runtime: backend + frontend buildato ---
FROM node:24-slim AS runtime
# Toolchain per i moduli nativi (better-sqlite3) + ffmpeg per i reel.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --no-audit --no-fund
COPY server/ ./
# Il server serve ../web/dist come statico in produzione.
COPY --from=webbuild /app/web/dist /app/web/dist

ENV NODE_ENV=production
ENV PORT=8770
ENV HOST=0.0.0.0
# Cartella dati persistente (DB SQLite + media/music/books). Montala come volume.
ENV BOOKSOCIAL_DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8770

CMD ["npm", "start"]
