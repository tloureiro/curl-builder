#!/usr/bin/env bash
set -euo pipefail

# Build all bundles and launch Electron with the built assets using local electron binary.
npm run build

# Disable the SUID sandbox for local runs (avoids chrome-sandbox ownership requirements).
export ELECTRON_DISABLE_SANDBOX=1
npx electron . --no-sandbox
