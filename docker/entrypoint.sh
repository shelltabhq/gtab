#!/usr/bin/env bash
# GTab demo entrypoint.
#
# Starts three things, conditionally:
#   1. gbrain serve --http (only if GBrain init succeeded and ENABLE_GBRAIN != 0)
#   2. gtab-sync daemon (only if ENABLE_SYNC != 0)
#   3. brain-view server (always; this is the foreground process)
#
# All output goes to stderr. brain-view stdout is the container's primary log.

set -u  # NOT -e: we want to recover from gbrain init failure gracefully

ENABLE_GBRAIN="${ENABLE_GBRAIN:-1}"          # init + import the brain (CLI access)
ENABLE_GBRAIN_SERVE="${ENABLE_GBRAIN_SERVE:-0}" # also run gbrain serve --http; off by default
ENABLE_SYNC="${ENABLE_SYNC:-0}"
GBRAIN_HOME="${GBRAIN_HOME:-/var/lib/gbrain}"

# Why ENABLE_GBRAIN_SERVE=0 by default: PGLite is single-writer. If `gbrain serve`
# holds the lock, concurrent CLI shell-outs (from brain-view's /api/ask and the
# sync daemon) block. For the demo, we keep gbrain CLI accessible and rely on
# per-invocation lock acquire/release. Hosts that prefer HTTP MCP (multi-client
# safe, no lock dance) can flip this and route brain-view through MCP instead.

log() {
  echo "[entrypoint] $*" >&2
}

# ---- 1. GBrain ---------------------------------------------------------------
if [ "$ENABLE_GBRAIN" = "1" ]; then
  log "initializing gbrain at $GBRAIN_HOME"
  export GBRAIN_HOME
  mkdir -p "$GBRAIN_HOME"

  # `gbrain init --pglite --yes` creates a local PGLite DB. No network calls.
  # On failure (e.g., already initialized), we proceed.
  if gbrain init --pglite --yes >/tmp/gbrain-init.log 2>&1; then
    log "gbrain init OK"
  else
    log "gbrain init returned non-zero (may be already initialized — see /tmp/gbrain-init.log)"
  fi

  # Import the sample corpus so the demo has content out of the box.
  if [ -d "${CORPUS_DIR:-/opt/gtab/examples/sample-corpus}" ]; then
    log "importing sample corpus from $CORPUS_DIR"
    if gbrain import "$CORPUS_DIR" --no-embed >/tmp/gbrain-import.log 2>&1; then
      log "sample corpus imported"
    else
      log "sample corpus import failed (see /tmp/gbrain-import.log) — brain-view will fall back to filesystem reads"
    fi
  fi

  if [ "$ENABLE_GBRAIN_SERVE" = "1" ]; then
    log "starting gbrain serve --http on port 3131 (CLI shell-outs will block on PGLite lock)"
    gbrain serve --http --port 3131 >/tmp/gbrain-serve.log 2>&1 &
    GBRAIN_PID=$!
    log "gbrain serve PID=$GBRAIN_PID"
  else
    log "gbrain serve --http disabled (set ENABLE_GBRAIN_SERVE=1 to enable). CLI shell-outs remain available."
  fi
else
  log "gbrain disabled (ENABLE_GBRAIN=0)"
fi

# ---- 2. Sync daemon ----------------------------------------------------------
if [ "$ENABLE_SYNC" = "1" ]; then
  log "starting gtab-sync daemon (watch mode)"
  cd /opt/gtab/sync
  bun run src/index.ts \
    --watch \
    --input /var/lib/gtab/inputs \
    --state-dir /var/lib/gtab/state \
    --health-port 7777 \
    >/tmp/gtab-sync.log 2>&1 &
  SYNC_PID=$!
  log "gtab-sync PID=$SYNC_PID"
else
  log "gtab-sync disabled (ENABLE_SYNC=0) — brain-view reads corpus filesystem directly"
fi

# ---- 3. Brain view (foreground) ----------------------------------------------
log "starting brain-view server on port ${PORT:-8080}"
cd /opt/gtab/brain-view
exec bun run server/server.ts
