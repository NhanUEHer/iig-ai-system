#!/bin/bash

# Exit on any error
set -e

VPS_IP="178.105.45.146"
VPS_PASSWORD="beAgVRP9NNAa"
VPS_DIR="/opt/ai-scoring"

echo "--------------------------------------------------------"
echo "🚀 STARTING DEPLOYMENT TO VPS (PRODUCTION)"
echo "--------------------------------------------------------"

# 1. Build frontend locally
echo "🔨 Building frontend locally..."
npm run build --prefix frontend

# 2. Sync code to VPS excluding node_modules, .git, and .env
echo "📤 Syncing files to VPS using rsync..."
sshpass -p "$VPS_PASSWORD" rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='public/cleaned-audio' \
  --exclude='tmp' \
  ./ root@$VPS_IP:$VPS_DIR/

# 3. Install VPS dependencies and restart server
echo "📦 Installing backend packages & restarting PM2 on VPS..."
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no root@$VPS_IP "
  cd $VPS_DIR && \
  npm install --production && \
  pm2 restart ai-scoring
"

echo "--------------------------------------------------------"
echo "✅ DEPLOYMENT COMPLETED SUCCESSFULLY!"
echo "👉 Live at: http://$VPS_IP:3100/submissions"
echo "--------------------------------------------------------"
