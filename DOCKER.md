# Docker Setup

This repository includes Docker containerization for easy deployment and development.

## Quick Start

### Using Docker Compose (Recommended)

1. **Set environment variables** (create `.env` file or export them):

   ```bash
   export BROWSERBASE_API_KEY="your-api-key"
   export BROWSERBASE_PROJECT_ID="your-project-id"
   export GEMINI_API_KEY="your-gemini-key"
   ```

2. **Run the service**:

   ```bash
   docker compose up -d
   ```

3. **Access the server**:
   - SHTTP endpoint: `http://localhost:3000`
   - Server will be available on all interfaces (`0.0.0.0:3000`)

### Using Docker directly

```bash
# Build the image
docker build -t mcp-server-browserbase .

# Run with environment variables
docker run -d \
  -p 3000:3000 \
  -e BROWSERBASE_API_KEY="your-key" \
  -e BROWSERBASE_PROJECT_ID="your-project" \
  -e GEMINI_API_KEY="your-gemini-key" \
  mcp-server-browserbase
```

## Screenshot Storage

### Current Implementation

- **Screenshots are stored in memory only** as base64 strings
- Available via `screenshot://<name>` URI scheme through MCP resources
- **Screenshots are lost when container restarts**

### Volume Mounts

The docker-compose setup includes volume mounts ready for future enhancements:

```yaml
volumes:
  - ./screenshots:/app/screenshots # For screenshot persistence
  - ./data:/app/data # For other data
```

### Making Screenshots Persistent

If you want to modify the code to save screenshots to disk, you can:

1. **Create the directories**:

   ```bash
   mkdir -p screenshots data
   ```

2. **Modify the screenshot code** in `src/mcp/resources.ts` to save files to `/app/screenshots/`

3. **Access screenshots directly** from the `./screenshots/` directory on your host

## Configuration

All CLI flags from the main README work with Docker:

```bash
docker run mcp-server-browserbase \
  --browserWidth 1920 \
  --browserHeight 1080 \
  --proxies \
  --modelName "anthropic/claude-3-5-sonnet-latest" \
  --modelApiKey "your-anthropic-key"
```

## Container Details

- **Base**: Node.js 22-slim
- **Package Manager**: pnpm 10.12.4
- **Production Build**: Only production dependencies installed
- **Health**: Container includes built-in restart policies
- **Port**: 3000 (SHTTP transport)

## Development

For development with hot reload:

```bash
# Run locally with volume mounts
docker run -it --rm \
  -v $(pwd):/app \
  -p 3000:3000 \
  mcp-server-browserbase \
  --port 3000 --host 0.0.0.0
```

## Cloud Deployment

### Google Cloud Run with Cloud Build

For automated deployment to Google Cloud Run, this repository includes a `cloudbuild.yaml` configuration that securely handles environment variables:

```bash
# Deploy with Cloud Build (requires gcloud CLI)
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_BROWSERBASE_PROJECT_ID="your-project-id",_GEMINI_API_KEY="your-gemini-key",_BROWSERBASE_API_KEY="your-browserbase-key"
```

**Benefits of Cloud Build deployment:**

- ✅ **Serverless**: Automatically scales to zero when not in use
- ✅ **Secure**: API keys are passed as build parameters, not stored in code
- ✅ **Automated**: Integrates with Git triggers for CI/CD
- ✅ **Production-ready**: Includes optimized container configuration

See `CLOUDRUN.md` for detailed Cloud Run deployment instructions.
