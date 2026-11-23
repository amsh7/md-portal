#!/bin/sh
# Dev-server launcher for sessions where Node lives in the scratchpad toolchain.
export PATH="/private/tmp/claude-501/-Users-ahmedhassan-Desktop-MD-AI-CRM/fe7d8ad5-231b-4f04-9511-653b8d697859/scratchpad/node-v22.14.0-darwin-arm64/bin:$PATH"
cd "$(dirname "$0")/.." && exec npm run dev -- --port 5173 --strictPort
