#!/bin/sh
# Dev-server launcher for sessions where Node lives in the scratchpad toolchain.
export PATH="/private/tmp/claude-501/-Users-ahmedhassan-Desktop-MD-AI-CRM/0b3a78b3-e8e7-4686-9222-c50c6cd1bfc1/scratchpad/node-v22.14.0-darwin-arm64/bin:$PATH"
cd "$(dirname "$0")/.." && exec npm run dev -- --port 5173 --strictPort
