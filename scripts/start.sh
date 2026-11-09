#!/bin/sh
# Production start: migrate, rewrite any unkeyed contact hashes (idempotent), then serve.
npm run migrate || exit 1
./node_modules/.bin/tsx scripts/rehash-contacts.ts || true
exec ./node_modules/.bin/next start
