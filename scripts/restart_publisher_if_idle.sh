#!/bin/bash

DB="/opt/wonderwave/wonderwave.db"

PENDING=$(sqlite3 "$DB" \
"SELECT COUNT(*) FROM publish_jobs WHERE status IN ('queued','publishing');")

if [ "$PENDING" -eq 0 ]; then
    echo "$(date): No queued or publishing jobs. Restarting publisher."
    pm2 restart wonderwave-publisher
else
    echo "$(date): $PENDING job(s) pending. Skipping restart."
fi
