#!/usr/bin/env bash
# Bilagsmatch - double-click to start (macOS; also works on Linux with: bash start-mac.command).
cd "$(dirname "$0")" || exit 1

fail() { echo; echo "Noget gik galt. Se fejlen ovenfor."; read -r -p "Tryk Enter for at lukke..."; exit 1; }

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js mangler. Installer \"LTS\" fra https://nodejs.org og dobbeltklik på denne fil igen."
  open https://nodejs.org 2>/dev/null || xdg-open https://nodejs.org 2>/dev/null
  read -r -p "Tryk Enter for at lukke..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[1/4] Installerer (første gang, kræver internet)..."
  npm install || fail
fi
[ -f .env ] || cp .env.example .env
if [ ! -f prisma/dev.db ]; then
  echo "[2/4] Opretter database med demo-data..."
  npx prisma migrate deploy || fail
  npm run db:seed || fail
fi
if [ ! -f .next/BUILD_ID ]; then
  echo "[3/4] Bygger appen..."
  npm run build || fail
fi

echo "[4/4] Starter Bilagsmatch på http://localhost:3000"
echo "Log ind: demo@bilagsmatch.dk / demo1234"
echo "Luk dette vindue (eller tryk Ctrl+C) for at stoppe appen."
(
  for _ in $(seq 1 60); do
    if curl -s -o /dev/null http://localhost:3000/login; then
      open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000 2>/dev/null
      break
    fi
    sleep 1
  done
) &
npm run start
