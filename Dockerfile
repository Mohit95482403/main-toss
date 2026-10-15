# ==============================================================================
# IRONMAN TOSS BOOK - Production Multi-Stage Dockerfile (Day 19)
# Lightweight, secure Alpine-based container running as non-root user
# ==============================================================================

FROM node:22-alpine AS runtime

# Set environment
ENV NODE_ENV=production
ENV PORT=5000
ENV SERVE_STATIC_FRONTEND=true

# Create application directory
WORKDIR /app

# Install dependencies with lockfile compliance
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm install --omit=dev --ignore-scripts

# Copy application source code
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY package.json ./

# Ensure non-root ownership
RUN chown -R node:node /app

# Switch to unprivileged user
USER node

# Expose HTTP port
EXPOSE 5000

# Container healthcheck using liveness probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health/live || exit 1

# Start production API server
CMD ["node", "backend/app.js"]
