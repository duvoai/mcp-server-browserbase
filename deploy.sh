#!/bin/bash

# Google Cloud Run Deployment Script for MCP Server Browserbase
set -e

# Configuration
PROJECT_ID="${PROJECT_ID:-your-gcp-project-id}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-mcp-server-browserbase}"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Deploying MCP Server Browserbase to Google Cloud Run${NC}"

# Check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}📋 Checking prerequisites...${NC}"
    
    if ! command -v gcloud &> /dev/null; then
        echo -e "${RED}❌ gcloud CLI not found. Please install Google Cloud SDK.${NC}"
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker not found. Please install Docker.${NC}"
        exit 1
    fi
    
    # Check if logged in
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -n 1 > /dev/null; then
        echo -e "${RED}❌ Not authenticated with gcloud. Run 'gcloud auth login'${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Prerequisites check passed${NC}"
}

# Set project
set_project() {
    echo -e "${YELLOW}🔧 Setting up Google Cloud project...${NC}"
    gcloud config set project ${PROJECT_ID}
    
    # Enable required APIs
    echo -e "${YELLOW}🔌 Enabling required APIs...${NC}"
    gcloud services enable cloudbuild.googleapis.com
    gcloud services enable run.googleapis.com
    gcloud services enable containerregistry.googleapis.com
    
    echo -e "${GREEN}✅ Project setup complete${NC}"
}

# Build and push image
build_and_push() {
    echo -e "${YELLOW}🔨 Building and pushing Docker image...${NC}"
    
    # Build image using Cloud Run optimized Dockerfile
    docker build -f Dockerfile.cloudrun -t ${IMAGE_NAME}:latest .
    
    # Configure Docker to use gcloud as credential helper
    gcloud auth configure-docker
    
    # Push image
    docker push ${IMAGE_NAME}:latest
    
    echo -e "${GREEN}✅ Image built and pushed successfully${NC}"
}

# Deploy to Cloud Run
deploy_to_cloud_run() {
    echo -e "${YELLOW}🚀 Deploying to Cloud Run...${NC}"
    
    gcloud run deploy ${SERVICE_NAME} \
        --image ${IMAGE_NAME}:latest \
        --platform managed \
        --region ${REGION} \
        --allow-unauthenticated \
        --port 3000 \
        --memory 1Gi \
        --cpu 1 \
        --min-instances 0 \
        --max-instances 10 \
        --timeout 300 \
        --set-env-vars NODE_ENV=production \
        --execution-environment gen2
    
    echo -e "${GREEN}✅ Deployment complete!${NC}"
}

# Get service URL
get_service_url() {
    SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --platform managed --region ${REGION} --format 'value(status.url)')
    echo -e "${GREEN}🌐 Service URL: ${SERVICE_URL}${NC}"
    echo -e "${YELLOW}📝 Don't forget to set your environment variables:${NC}"
    echo -e "   - BROWSERBASE_API_KEY"
    echo -e "   - BROWSERBASE_PROJECT_ID" 
    echo -e "   - GEMINI_API_KEY"
    echo ""
    echo -e "${YELLOW}🔧 To set environment variables:${NC}"
    echo -e "gcloud run services update ${SERVICE_NAME} \\"
    echo -e "  --region ${REGION} \\"
    echo -e "  --set-env-vars BROWSERBASE_API_KEY=your-key,BROWSERBASE_PROJECT_ID=your-project,GEMINI_API_KEY=your-gemini-key"
}

# Main execution
main() {
    if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
        echo "Usage: ./deploy.sh [OPTIONS]"
        echo ""
        echo "Environment variables:"
        echo "  PROJECT_ID     - GCP Project ID (default: your-gcp-project-id)"
        echo "  REGION         - GCP Region (default: us-central1)"
        echo "  SERVICE_NAME   - Cloud Run service name (default: mcp-server-browserbase)"
        echo ""
        echo "Examples:"
        echo "  PROJECT_ID=my-project ./deploy.sh"
        echo "  REGION=europe-west1 ./deploy.sh"
        exit 0
    fi
    
    if [ "${PROJECT_ID}" = "your-gcp-project-id" ]; then
        echo -e "${RED}❌ Please set PROJECT_ID environment variable or update the script${NC}"
        echo -e "${YELLOW}Example: PROJECT_ID=my-project-123 ./deploy.sh${NC}"
        exit 1
    fi
    
    check_prerequisites
    set_project
    build_and_push
    deploy_to_cloud_run
    get_service_url
    
    echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
}

main "$@"