#!/usr/bin/env bash

cd /code

if [[ "$1" == 'run_server' ]]; then
  # defaults to running on port 5000
  echo "Running npm install"
  npm install --slient
  echo "Running npm build"
  npm run build
  echo "Installing the server"
  npm install -g serve
  echo "Starting the server"
  serve -s build -l 5000
  echo "Server started"
elif [[ "$1" == 'run_dev' ]]; then
  # defaults to running on port 3000
  # requires stdin_open = true (or "-i" in "docker run ..." command)
  npm install --verbose
  npm start
else
  exec "$@"
fi
