#!/bin/sh
set -eu

# This directory is a named volume. Keep previous hashes for already-open tabs.
mkdir -p /var/cache/enziu-frontend/assets
cp -R /usr/share/nginx/html/assets/. /var/cache/enziu-frontend/assets/
