# GTab — standalone demo image.
#
# Bundles:
#   - the Brain View Bun server (serves SPA + read-only corpus API)
#   - the GTab sync daemon (translates JSON inputs → gbrain put calls)
#   - GBrain CLI + serve (optional; image works without it via corpus-grep fallback)
#
# Built in three stages to keep the runtime image small.

# --- Stage 1: build the Svelte SPA -----------------------------------------
FROM oven/bun:1.1 AS brain-view-build
WORKDIR /build/brain-view
COPY brain-view/package.json brain-view/bun.lock* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install
COPY brain-view/ ./
RUN bun run build

# --- Stage 2: install GBrain ------------------------------------------------
FROM oven/bun:1.1 AS gbrain-install
WORKDIR /opt
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN git clone --depth=1 https://github.com/garrytan/gbrain.git
WORKDIR /opt/gbrain
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# --- Stage 3: runtime -------------------------------------------------------
FROM oven/bun:1.1
ENV NODE_ENV=production

# OS deps (curl for healthchecks; ca-certificates for HTTPS; git for postinstall hooks)
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates git && \
    rm -rf /var/lib/apt/lists/*

# Carry GBrain source + node_modules.
COPY --from=gbrain-install /opt/gbrain /opt/gbrain

# Wrapper script puts gbrain on PATH. More predictable than `bun link` across
# stages (the global bin location moves between bun versions).
RUN printf '#!/usr/bin/env bash\nexec bun run /opt/gbrain/src/cli.ts "$@"\n' > /usr/local/bin/gbrain && \
    chmod +x /usr/local/bin/gbrain

# Sync daemon (uncompiled — Bun runs .ts directly)
WORKDIR /opt/gtab/sync
COPY sync/package.json sync/bun.lock* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install
COPY sync/ ./

# Brain View server + built SPA
WORKDIR /opt/gtab/brain-view
COPY brain-view/package.json brain-view/bun.lock* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install
COPY brain-view/server ./server
COPY --from=brain-view-build /build/brain-view/dist ./dist

# Sample corpus
WORKDIR /opt/gtab/examples
COPY examples ./

# Entrypoint script
COPY docker/entrypoint.sh /opt/gtab/entrypoint.sh
RUN chmod +x /opt/gtab/entrypoint.sh

# State directory for the sync daemon
RUN mkdir -p /var/lib/gtab && chmod 755 /var/lib/gtab

# Ports:
#   8080 — Brain View HTTP (SPA + API)
#   3131 — gbrain serve --http (optional)
#   7777 — gtab-sync /health (drive-internal)
EXPOSE 8080 3131 7777

WORKDIR /opt/gtab
ENV CORPUS_DIR=/opt/gtab/examples/sample-corpus \
    GBRAIN_BIN=gbrain \
    GBRAIN_HOME=/var/lib/gbrain \
    STATIC_DIR=/opt/gtab/brain-view/dist \
    SYNC_DAEMON_URL=http://localhost:7777 \
    PORT=8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -fsS http://localhost:8080/api/health || exit 1

ENTRYPOINT ["/opt/gtab/entrypoint.sh"]
