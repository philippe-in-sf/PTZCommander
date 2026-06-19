#!/bin/bash
set -e
node script/check-node-version.mjs
npm install --prefer-offline --no-audit --no-fund 2>&1
npx drizzle-kit push 2>&1 || true
