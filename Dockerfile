# Use Node.js LTS version
FROM node:22-slim

# Install pnpm globally
RUN npm install -g pnpm@10.12.4

# Set working directory
WORKDIR /app

# Copy source code
COPY . .

# Install all dependencies (including dev dependencies for build)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Build the TypeScript code
RUN pnpm run build

# Remove dev dependencies to reduce image size
RUN pnpm prune --prod --ignore-scripts

# Expose port for SHTTP transport (optional)
EXPOSE 3000

# Set default entrypoint to run the MCP server
CMD ["./cli.js", "--port", "3000", "--host", "0.0.0.0"]