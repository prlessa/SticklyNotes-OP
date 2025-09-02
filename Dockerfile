# Build frontend
FROM node:18-alpine as frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --only=production

COPY frontend/ ./
ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL
RUN npm run build

# Build final
FROM node:18-alpine

RUN apk add --no-cache curl

WORKDIR /app

# Backend dependencies
COPY backend/package*.json ./
RUN npm ci --only=production

# Copy backend source
COPY backend/src ./src

# Copy frontend build
COPY --from=frontend-builder /app/frontend/build ./public

# Create logs directory and set permissions
RUN mkdir -p logs
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3001

# Healthcheck mais tolerante
HEALTHCHECK --interval=30s --timeout=15s --start-period=60s --retries=5 \
  CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["node", "src/server.js"]