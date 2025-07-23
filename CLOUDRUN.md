# Google Cloud Run Deployment Guide

Deploy the MCP Server Browserbase to Google Cloud Run for scalable, serverless hosting.

## Prerequisites

1. **Google Cloud Account** with billing enabled
2. **Google Cloud CLI** installed and authenticated
3. **Docker** installed locally
4. **Required API Keys**:
   - Browserbase API Key
   - Browserbase Project ID
   - Gemini API Key (or other model API key)

## Quick Deployment

### 1. Set up Google Cloud CLI

```bash
# Install gcloud CLI (if not already installed)
# Visit: https://cloud.google.com/sdk/docs/install

# Authenticate
gcloud auth login

# Set your project
gcloud config set project YOUR_PROJECT_ID
```

### 2. Deploy with Script

```bash
# Make sure you're in the project directory
cd mcp-server-browserbase

# Set your project ID and deploy
PROJECT_ID=your-gcp-project-id ./deploy.sh
```

### 3. Configure Environment Variables

```bash
# Export your API keys
export BROWSERBASE_API_KEY="your-browserbase-api-key"
export BROWSERBASE_PROJECT_ID="your-browserbase-project-id"
export GEMINI_API_KEY="your-gemini-api-key"

# Set environment variables (option 1: direct)
./secrets.sh env

# OR use Google Secret Manager (option 2: more secure)
./secrets.sh secrets
```

## Manual Deployment

### 1. Build and Push Image

```bash
# Set variables
PROJECT_ID="your-gcp-project-id"
IMAGE_NAME="gcr.io/${PROJECT_ID}/mcp-server-browserbase"

# Enable required APIs
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com

# Build image
docker build -f Dockerfile.cloudrun -t ${IMAGE_NAME}:latest .

# Configure Docker auth
gcloud auth configure-docker

# Push image
docker push ${IMAGE_NAME}:latest
```

### 2. Deploy to Cloud Run

```bash
gcloud run deploy mcp-server-browserbase \
  --image ${IMAGE_NAME}:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 3000 \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --timeout 300 \
  --set-env-vars NODE_ENV=production \
  --execution-environment gen2
```

### 3. Set Environment Variables

```bash
gcloud run services update mcp-server-browserbase \
  --region us-central1 \
  --set-env-vars BROWSERBASE_API_KEY="your-key",BROWSERBASE_PROJECT_ID="your-project",GEMINI_API_KEY="your-gemini-key"
```

## Configuration Options

### Environment Variables

| Variable                 | Description                 | Required |
| ------------------------ | --------------------------- | -------- |
| `BROWSERBASE_API_KEY`    | Your Browserbase API key    | Yes      |
| `BROWSERBASE_PROJECT_ID` | Your Browserbase project ID | Yes      |
| `GEMINI_API_KEY`         | API key for Gemini model    | Yes\*    |
| `NODE_ENV`               | Set to `production`         | Auto-set |

\*Required unless using a different model with `--modelApiKey`

### Cloud Run Configuration

The deployment includes these optimizations for Cloud Run:

- **Memory**: 1GB (adjustable)
- **CPU**: 1 vCPU (adjustable)
- **Scaling**: 0-10 instances
- **Timeout**: 300 seconds
- **Port**: 3000
- **Execution Environment**: gen2 (faster cold starts)

### Custom Model Configuration

To use a different model:

```bash
gcloud run services update mcp-server-browserbase \
  --region us-central1 \
  --update-env-vars MODEL_NAME="anthropic/claude-3-5-sonnet-latest",MODEL_API_KEY="your-anthropic-key"
```

## Security Best Practices

### Use Google Secret Manager

Instead of environment variables, use Secret Manager for sensitive data:

```bash
# Create secrets
./secrets.sh secrets

# Verify secrets are being used
./secrets.sh show
```

### Service Account (Optional)

For enhanced security, create a dedicated service account:

```bash
# Create service account
gcloud iam service-accounts create mcp-server-sa \
  --display-name "MCP Server Service Account"

# Grant minimal permissions
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member "serviceAccount:mcp-server-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role "roles/secretmanager.secretAccessor"

# Update service to use service account
gcloud run services update mcp-server-browserbase \
  --region us-central1 \
  --service-account mcp-server-sa@${PROJECT_ID}.iam.gserviceaccount.com
```

## Monitoring and Logs

### View Logs

```bash
# Stream logs
gcloud run services logs tail mcp-server-browserbase --region us-central1

# View recent logs
gcloud run services logs read mcp-server-browserbase --region us-central1 --limit 50
```

### Health Check

The service includes a health check endpoint. Test it:

```bash
SERVICE_URL=$(gcloud run services describe mcp-server-browserbase --platform managed --region us-central1 --format 'value(status.url)')
curl -f ${SERVICE_URL} || echo "Health check failed"
```

## Cost Optimization

### Auto-scaling

- **Min instances**: 0 (scales to zero when not in use)
- **Max instances**: 10 (adjust based on expected load)

### Resource Allocation

- Start with 1GB memory, 1 CPU
- Monitor usage and adjust as needed
- Consider Cloud Run's pricing model (pay per request)

### Regional Deployment

- Deploy in region closest to your users
- Consider multi-region for high availability

## Troubleshooting

### Common Issues

1. **Build Failures**:

   ```bash
   # Check build logs
   gcloud builds log --region us-central1
   ```

2. **Deployment Errors**:

   ```bash
   # Check service status
   gcloud run services describe mcp-server-browserbase --region us-central1
   ```

3. **Runtime Issues**:
   ```bash
   # Check application logs
   gcloud run services logs read mcp-server-browserbase --region us-central1
   ```

### Service URL

After deployment, get your service URL:

```bash
gcloud run services describe mcp-server-browserbase \
  --platform managed \
  --region us-central1 \
  --format 'value(status.url)'
```

## CI/CD with Cloud Build

The included `cloudbuild.yaml` enables automatic deployments with secure environment variable handling.

### Using Cloud Build Substitutions

The `cloudbuild.yaml` file uses substitution variables to securely pass environment variables without committing them to your repository:

```bash
# Deploy with environment variables via command line
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_BROWSERBASE_PROJECT_ID="your-project-id",_GEMINI_API_KEY="your-gemini-key",_BROWSERBASE_API_KEY="your-browserbase-key"
```

### Setting up Build Triggers

For automated deployments on code changes:

```bash
# Create a GitHub trigger with substitution variables
gcloud builds triggers create github \
  --repo-name mcp-server-browserbase \
  --repo-owner your-github-username \
  --branch-pattern "^main$" \
  --build-config cloudbuild.yaml \
  --substitutions _BROWSERBASE_PROJECT_ID="your-project-id",_GEMINI_API_KEY="your-gemini-key",_BROWSERBASE_API_KEY="your-browserbase-key"
```

### Via Google Cloud Console

1. Go to **Cloud Build > Triggers**
2. Create a new trigger or edit an existing one
3. In the **Advanced** section, add substitution variables:
   - `_BROWSERBASE_PROJECT_ID` = `your-project-id`
   - `_GEMINI_API_KEY` = `your-gemini-key`
   - `_BROWSERBASE_API_KEY` = `your-browserbase-key`

### Benefits of Cloud Build Substitutions

- ✅ **Security**: API keys are not stored in your repository
- ✅ **Flexibility**: Different environments can use different values
- ✅ **Automation**: Integrate with CI/CD pipelines
- ✅ **Audit**: Track deployments through Cloud Build history

## Next Steps

1. **Custom Domain**: Configure a custom domain for your service
2. **Load Testing**: Test your service under expected load
3. **Monitoring**: Set up Cloud Monitoring alerts
4. **Backup**: Consider backing up configuration and secrets

Your MCP Server Browserbase is now running on Google Cloud Run! 🚀
