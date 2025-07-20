#!/bin/bash

# Standup Tracker v2 Deployment Script
# This script deploys the serverless application to AWS

set -e  # Exit on any error

echo "🚀 Starting Standup Tracker v2 Deployment"
echo "=========================================="

# Check if required tools are installed
check_dependencies() {
    echo "📋 Checking dependencies..."
    
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js is not installed. Please install Node.js 18+ and try again."
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        echo "❌ npm is not installed. Please install npm and try again."
        exit 1
    fi
    
    if ! command -v serverless &> /dev/null; then
        echo "⚠️  Serverless Framework not found. Installing globally..."
        npm install -g serverless
    fi
    
    if ! command -v aws &> /dev/null; then
        echo "⚠️  AWS CLI not found. Please install and configure AWS CLI."
        echo "   Visit: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
        exit 1
    fi
    
    echo "✅ All dependencies are available"
}

# Check environment variables
check_environment() {
    echo "🔧 Checking environment configuration..."
    
    if [ ! -f ".env" ]; then
        echo "❌ .env file not found. Please create and configure your .env file."
        echo "   Copy from .env.example and update with your credentials."
        exit 1
    fi
    
    # Source the .env file
    source .env
    
    # Check required variables
    required_vars=(
        "AWS_REGION"
        "BEDROCK_MODEL_ID"
        "S3_BUCKET_NAME"
    )
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            echo "❌ Required environment variable $var is not set in .env file"
            exit 1
        fi
    done
    
    echo "✅ Environment configuration looks good"
}

# Install dependencies
install_dependencies() {
    echo "📦 Installing dependencies..."
    npm install
    echo "✅ Dependencies installed"
}

# Run tests (if available)
run_tests() {
    echo "🧪 Running tests..."
    if [ -f "package.json" ] && grep -q '"test"' package.json; then
        npm test || echo "⚠️  Some tests failed, but continuing deployment..."
    else
        echo "ℹ️  No tests configured, skipping..."
    fi
}

# Deploy to AWS
deploy_to_aws() {
    echo "☁️  Deploying to AWS..."
    
    # Get the stage from command line argument or default to 'dev'
    STAGE=${1:-dev}
    echo "   Deploying to stage: $STAGE"
    
    # Deploy using Serverless Framework
    serverless deploy --stage $STAGE
    
    if [ $? -eq 0 ]; then
        echo "✅ Deployment successful!"
        echo ""
        echo "📋 Deployment Summary:"
        echo "   Stage: $STAGE"
        echo "   Region: $AWS_REGION"
        echo ""
        echo "🔗 API Endpoints:"
        serverless info --stage $STAGE | grep -A 20 "endpoints:"
        echo ""
        echo "💡 Next Steps:"
        echo "   1. Note the API Gateway URL above"
        echo "   2. Configure the CLI: node cli/standup-cli.js config"
        echo "   3. Submit your first standup: node cli/standup-cli.js submit"
    else
        echo "❌ Deployment failed!"
        exit 1
    fi
}

# Setup CLI
setup_cli() {
    echo "🛠️  Setting up CLI..."
    
    # Make CLI executable
    chmod +x cli/standup-cli.js
    
    # Create a global symlink (optional)
    if command -v npm &> /dev/null; then
        echo "   Creating global CLI link..."
        npm link 2>/dev/null || echo "   (Global link creation failed, but CLI is still usable)"
    fi
    
    echo "✅ CLI setup complete"
    echo "   Usage: node cli/standup-cli.js [command]"
    echo "   Or if globally linked: standup-cli [command]"
}

# Main deployment function
main() {
    echo "Starting deployment process..."
    echo ""
    
    check_dependencies
    check_environment
    install_dependencies
    run_tests
    deploy_to_aws $1
    setup_cli
    
    echo ""
    echo "🎉 Standup Tracker v2 deployment completed successfully!"
    echo ""
    echo "📚 Quick Start:"
    echo "   1. Configure CLI: node cli/standup-cli.js config"
    echo "   2. Submit standup: node cli/standup-cli.js submit"
    echo "   3. View status: node cli/standup-cli.js status"
    echo "   4. View metrics: node cli/standup-cli.js metrics"
    echo ""
    echo "📖 For more information, see README.md"
}

# Handle command line arguments
case "${1:-deploy}" in
    "deploy")
        main ${2:-dev}
        ;;
    "dev")
        main dev
        ;;
    "staging")
        main staging
        ;;
    "production")
        main production
        ;;
    "help"|"--help"|"-h")
        echo "Standup Tracker v2 Deployment Script"
        echo ""
        echo "Usage: ./deploy.sh [command] [stage]"
        echo ""
        echo "Commands:"
        echo "  deploy [stage]    Deploy to specified stage (default: dev)"
        echo "  dev              Deploy to development stage"
        echo "  staging          Deploy to staging stage"
        echo "  production       Deploy to production stage"
        echo "  help             Show this help message"
        echo ""
        echo "Examples:"
        echo "  ./deploy.sh                 # Deploy to dev stage"
        echo "  ./deploy.sh deploy prod     # Deploy to prod stage"
        echo "  ./deploy.sh production      # Deploy to production stage"
        ;;
    *)
        echo "❌ Unknown command: $1"
        echo "Use './deploy.sh help' for usage information"
        exit 1
        ;;
esac
