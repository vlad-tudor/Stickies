#!/bin/sh
set -e

git pull
podman build -t stickies:latest .
podman-compose up -d --force-recreate stickies
