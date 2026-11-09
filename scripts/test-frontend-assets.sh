#!/bin/sh
set -eu

cache=/var/cache/enziu-frontend/assets
printf 'previous release\n' > "$cache/previous-release-test.js"
for attempt in 1 2; do
    /docker-entrypoint.d/25-retain-assets.sh
    for source in /usr/share/nginx/html/assets/*.js /usr/share/nginx/html/assets/*.css; do
        test -s "$cache/$(basename "$source")"
    done
    test "$(cat "$cache/previous-release-test.js")" = 'previous release'
done
nginx -t
printf 'PASS: every current bundle is retained; previous release survives repeated startup\n'
