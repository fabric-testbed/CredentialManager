#!/usr/bin/env bash

cd /app

if [[ "$1" == 'run_server' ]]; then
  echo "Launching Next.js server"
  node server.js
elif [[ "$1" == 'run_dev' ]]; then
  npm install --verbose
  npm run dev
else
  exec "$@"
fi
