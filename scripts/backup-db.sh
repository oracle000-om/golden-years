#!/bin/bash
# Golden Years Club — Database Backup
#
# Creates a timestamped pg_dump of the production database.
# Run before risky migrations or as a periodic manual backup.
#
# Usage:
#   ./scripts/backup-db.sh                    # Uses DATABASE_URL from .env
#   ./scripts/backup-db.sh <connection_url>   # Uses provided URL
#
# Output: backups/golden-years-YYYY-MM-DD-HHMMSS.sql.gz

set -euo pipefail

# Load .env if no URL provided
DB_URL="${1:-}"
if [ -z "$DB_URL" ]; then
    if [ -f .env ]; then
        DB_URL=$(grep '^DATABASE_URL=' .env | cut -d'"' -f2)
    fi
fi

if [ -z "$DB_URL" ]; then
    echo "❌ No DATABASE_URL found. Pass it as an argument or set it in .env"
    exit 1
fi

# Create backups directory
BACKUP_DIR="backups"
mkdir -p "$BACKUP_DIR"

# Timestamped filename
TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/golden-years-$TIMESTAMP.sql.gz"

echo "📦 Backing up database..."
echo "   → $BACKUP_FILE"

# pg_dump with compression
pg_dump "$DB_URL" \
    --no-owner \
    --no-privileges \
    --format=plain \
    --verbose \
    2>&1 | gzip > "$BACKUP_FILE"

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "✅ Backup complete: $BACKUP_FILE ($SIZE)"
echo ""
echo "To restore:"
echo "  gunzip -c $BACKUP_FILE | psql \$DATABASE_URL"
