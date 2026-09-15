#!/bin/sh
set -e
mkdir -p "$(dirname "$DATABASE_PATH")" "$RECEIPTS_DIR"

# Litestream is optional: enable it by setting LITESTREAM_REPLICA_URL (e.g. s3://bucket/ppsplitmedaddy)
# plus LITESTREAM_ACCESS_KEY_ID / LITESTREAM_SECRET_ACCESS_KEY (and LITESTREAM_ENDPOINT for R2/B2).
if [ -n "$LITESTREAM_REPLICA_URL" ]; then
	if [ ! -f "$DATABASE_PATH" ]; then
		echo "No local database; restoring from replica if one exists"
		litestream restore -if-replica-exists -config /etc/litestream.yml "$DATABASE_PATH"
	fi
	exec litestream replicate -config /etc/litestream.yml -exec "node build"
fi

exec node build
