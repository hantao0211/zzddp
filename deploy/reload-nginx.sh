#!/bin/sh
set -eu

# This hook belongs only to the Xiaobu certificate, not other server certificates.
if [ "${RENEWED_LINEAGE:-}" != /etc/letsencrypt/live/14.103.24.55 ]; then
    exit 0
fi
/usr/sbin/nginx -t -q
/usr/bin/systemctl reload nginx.service
