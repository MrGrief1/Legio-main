#!/bin/bash
set -e

echo "🚀 Building Legio for Railway deployment..."

# Build frontend
echo "📦 Building frontend..."
cd designe
npm install
# For monorepo: use relative URLs (no VITE_API_BASE_URL)
npm run build

# Copy to server public directory
echo "📁 Copying frontend to server/public..."
cd ..
mkdir -p server/public
cp -r designe/dist/* server/public/

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd server
npm install

echo "✅ Build complete! Ready for deployment."
echo "📝 Remember to set environment variables in Railway:"
echo "   - SECRET_KEY=<your-secret-key>"
echo "   - ALLOWED_ORIGINS= (empty for permissive mode)"
