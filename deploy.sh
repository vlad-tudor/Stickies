#!/bin/sh
set -e

git pull

# the collab relay endpoint derives from DOMAIN — baked in at build time (Vite)
DOMAIN_VALUE=$(grep '^DOMAIN=' .env | cut -d= -f2)

podman build \
  --build-arg VITE_UMAMI_SCRIPT_URL=$(grep '^UMAMI_SCRIPT_URL=' .env | cut -d= -f2) \
  --build-arg VITE_UMAMI_WEBSITE_ID=$(grep '^UMAMI_WEBSITE_ID=' .env | cut -d= -f2) \
  --build-arg VITE_COLLAB_WS_URL="wss://collab.${DOMAIN_VALUE}" \
  -t stickies:latest .
podman build -t stickies-relay:latest relay/
podman-compose up -d --force-recreate stickies stickies-relay
