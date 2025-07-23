#!/bin/bash

# Google Cloud Run Environment Variables and Secrets Management
set -e

# Configuration
PROJECT_ID="${PROJECT_ID:-your-gcp-project-id}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-mcp-server-browserbase}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Set environment variables for Cloud Run service
set_env_vars() {
    echo -e "${YELLOW}🔐 Setting environment variables for Cloud Run service...${NC}"
    
    if [ -z "$BROWSERBASE_API_KEY" ]; then
        echo -e "${RED}❌ BROWSERBASE_API_KEY not set${NC}"
        exit 1
    fi
    
    if [ -z "$BROWSERBASE_PROJECT_ID" ]; then
        echo -e "${RED}❌ BROWSERBASE_PROJECT_ID not set${NC}"
        exit 1
    fi
    
    if [ -z "$GEMINI_API_KEY" ]; then
        echo -e "${RED}❌ GEMINI_API_KEY not set${NC}"
        exit 1
    fi
    
    gcloud run services update ${SERVICE_NAME} \
        --region ${REGION} \
        --set-env-vars BROWSERBASE_API_KEY="${BROWSERBASE_API_KEY}",BROWSERBASE_PROJECT_ID="${BROWSERBASE_PROJECT_ID}",GEMINI_API_KEY="${GEMINI_API_KEY}",NODE_ENV=production
    
    echo -e "${GREEN}✅ Environment variables set successfully${NC}"
}

# Create secrets in Google Secret Manager (more secure alternative)
create_secrets() {
    echo -e "${YELLOW}🔒 Creating secrets in Google Secret Manager...${NC}"
    
    # Enable Secret Manager API
    gcloud services enable secretmanager.googleapis.com
    
    # Create secrets
    if [ ! -z "$BROWSERBASE_API_KEY" ]; then
        echo -n "$BROWSERBASE_API_KEY" | gcloud secrets create browserbase-api-key --data-file=-
        echo -e "${GREEN}✅ Created browserbase-api-key secret${NC}"
    fi
    
    if [ ! -z "$BROWSERBASE_PROJECT_ID" ]; then
        echo -n "$BROWSERBASE_PROJECT_ID" | gcloud secrets create browserbase-project-id --data-file=-
        echo -e "${GREEN}✅ Created browserbase-project-id secret${NC}"
    fi
    
    if [ ! -z "$GEMINI_API_KEY" ]; then
        echo -n "$GEMINI_API_KEY" | gcloud secrets create gemini-api-key --data-file=-
        echo -e "${GREEN}✅ Created gemini-api-key secret${NC}"
    fi
}

# Update Cloud Run service to use secrets
use_secrets() {
    echo -e "${YELLOW}🔗 Configuring Cloud Run service to use secrets...${NC}"
    
    gcloud run services update ${SERVICE_NAME} \
        --region ${REGION} \
        --set-secrets BROWSERBASE_API_KEY=browserbase-api-key:latest,BROWSERBASE_PROJECT_ID=browserbase-project-id:latest,GEMINI_API_KEY=gemini-api-key:latest
    
    echo -e "${GREEN}✅ Service configured to use secrets${NC}"
}

# Show current environment variables
show_env_vars() {
    echo -e "${YELLOW}📋 Current environment variables:${NC}"
    gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format="value(spec.template.spec.template.spec.containers[0].env[].name,spec.template.spec.template.spec.containers[0].env[].value)"
}

# Main execution
main() {
    case "$1" in
        "env")
            set_env_vars
            ;;
        "secrets")
            create_secrets
            use_secrets
            ;;
        "show")
            show_env_vars
            ;;
        "--help"|"-h"|"")
            echo "Usage: ./secrets.sh [COMMAND]"
            echo ""
            echo "Commands:"
            echo "  env       Set environment variables directly"
            echo "  secrets   Create secrets in Secret Manager and configure service"
            echo "  show      Show current environment variables"
            echo ""
            echo "Before running, export your API keys:"
            echo "  export BROWSERBASE_API_KEY='your-api-key'"
            echo "  export BROWSERBASE_PROJECT_ID='your-project-id'"
            echo "  export GEMINI_API_KEY='your-gemini-key'"
            echo ""
            echo "Environment variables:"
            echo "  PROJECT_ID     - GCP Project ID"
            echo "  REGION         - GCP Region"
            echo "  SERVICE_NAME   - Cloud Run service name"
            echo ""
            echo "Examples:"
            echo "  ./secrets.sh env      # Set as environment variables"
            echo "  ./secrets.sh secrets  # Use Google Secret Manager (recommended)"
            echo "  ./secrets.sh show     # Show current configuration"
            ;;
        *)
            echo -e "${RED}❌ Unknown command: $1${NC}"
            echo "Run './secrets.sh --help' for usage information"
            exit 1
            ;;
    esac
}

main "$@"