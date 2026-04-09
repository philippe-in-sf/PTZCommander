#!/bin/bash
set -e
npm install --prefer-offline --no-audit --no-fund 2>&1
npx drizzle-kit push 2>&1 || true
