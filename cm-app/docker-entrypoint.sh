#!/usr/bin/env bash

cd /code

if [[ "$1" == 'run_server' ]]; then
  # defaults to running on port 3000
  echo "Starting install"
  npm install --silent
  npm i color-convert
  echo "Starting build"
  npm run build
  echo "Staring install server"
  npm install -g serve
  echo "Launching server"
  serve -s build
elif [[ "$1" == 'run_dev' ]]; then
  # defaults to running on port 3000
  # requires stdin_open = true (or "-i" in "docker run ..." command)
  npm install --verbose
  npm start
else
  exec "$@"
fi
