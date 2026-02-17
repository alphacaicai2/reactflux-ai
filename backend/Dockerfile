# Build stage - install dependencies and compile native modules
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3
# python3, make, g++, and sqlite-dev are required for compiling native modules
RUN apk add --no-cache python3 make g++ sqlite-dev

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for building native modules)
RUN npm ci

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies for sqlite and wget for health check
RUN apk add --no-cache sqlite-libs wget

# Copy node_modules from builder (with compiled native modules)
COPY --from=builder /app/node_modules ./node_modules

# Copy source code
COPY . .

# Create data directory for SQLite
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/app/data/reactflux.db

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Start the server
CMD ["node", "src/index.js"]
