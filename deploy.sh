#!/bin/sh
set -e

git pull
podman build \
  --build-arg VITE_UMAMI_SCRIPT_URL=$(grep '^UMAMI_SCRIPT_URL=' .env | cut -d= -f2) \
  --build-arg VITE_UMAMI_WEBSITE_ID=$(grep '^UMAMI_WEBSITE_ID=' .env | cut -d= -f2) \
  -t stickies:latest .
podman-compose up -d --force-recreate stickies
