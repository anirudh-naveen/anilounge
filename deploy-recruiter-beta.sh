#!/bin/bash

# Find Animation Recruiter Beta Deployment Script
echo "🎯 Deploying Find Animation Beta for Recruiters..."

# Check if required tools are installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm i -g vercel
fi

if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm i -g @railway/cli
fi

# Set production environment for secure deployment
export NODE_ENV=production

# Build frontend with production optimizations
echo "📦 Building frontend for production..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Frontend build failed!"
    exit 1
fi

# Deploy frontend to Vercel with custom domain
echo "🌐 Deploying frontend to Vercel..."
vercel --prod

if [ $? -ne 0 ]; then
    echo "❌ Frontend deployment failed!"
    exit 1
fi

# Get the Vercel URL
VERCEL_URL=$(vercel ls | grep find-animation | head -1 | awk '{print $2}')
echo "✅ Frontend deployed to: https://$VERCEL_URL"

# Deploy backend to Railway with secure configuration
echo "🔧 Deploying backend to Railway..."
railway up

if [ $? -ne 0 ]; then
    echo "❌ Backend deployment failed!"
    exit 1
fi

# Get Railway URL
RAILWAY_URL=$(railway domain)
echo "✅ Backend deployed to: $RAILWAY_URL"

# Update CORS configuration for production
echo "🔒 Configuring secure CORS settings..."
railway variables set FRONTEND_URL=https://$VERCEL_URL
railway variables set NODE_ENV=production

echo ""
echo "🎯 Recruiter Beta Deployment Complete!"
echo ""
echo "📱 Recruiter Access URLs:"
echo "   Frontend: https://$VERCEL_URL"
echo "   Backend:  $RAILWAY_URL"
echo ""
echo "🔐 Security Features:"
echo "   ✅ HTTPS enabled"
echo "   ✅ Production environment"
echo "   ✅ Secure CORS configuration"
echo "   ✅ Rate limiting enabled"
echo "   ✅ Anti-bot protection"
echo ""
echo "📋 Next Steps:"
echo "1. Share the frontend URL with recruiters"
echo "2. Add demo credentials to README"
echo "3. Monitor usage via Railway dashboard"
echo ""
echo "🔗 GitHub Integration:"
echo "   Update your README with: https://$VERCEL_URL"
