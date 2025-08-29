#!/bin/bash
# ======================================
# Auto Git Sync Script
# By: G4ni (asakudata@gmail.com)
# ======================================

REPO_DIR="/opt/vpn-suite/vpn-api"
BRANCH="my-dev"
BACKUP="/home/asakudata/vpn-api-backup-$(date +%F-%H%M).tar.gz"

echo "=== STEP 1: Backup directory ke $BACKUP ==="
sudo tar -czf "$BACKUP" -C /opt/vpn-suite vpn-api
echo "Backup selesai."

echo "=== STEP 2: Konfigurasi Git Identity & Safe Directory ==="
git config --global user.name "G4ni"
git config --global user.email "asakudata@gmail.com"
git config --global --add safe.directory "$REPO_DIR"

echo "=== STEP 3: Commit & Push ke branch $BRANCH ==="
cd "$REPO_DIR" || exit 1
git checkout $BRANCH || git checkout -b $BRANCH
git add .
git commit -m "sync: update from server on $(date)"
git push origin $BRANCH --force

echo "=== DONE ==="
