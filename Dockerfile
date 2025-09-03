# Multi-stage build para Railway - Frontend + Backend

# Stage 1: Build do Frontend
FROM node:18-alpine as frontend-builder

WORKDIR /app/frontend

# Copiar package.json do frontend
COPY frontend/package*.json ./
RUN npm ci --silent

# Copiar código do frontend  
COPY frontend/ ./

# Build do frontend - Railway define a URL automaticamente
ENV NODE_ENV=production
ENV REACT_APP_API_URL=""
RUN npm run build

# Stage 2: Backend final com frontend integrado
FROM node:18-alpine

# Instalar dependências do sistema
RUN apk add --no-cache curl dumb-init

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

# Copiar package.json do backend
COPY backend/package*.json ./
RUN npm ci --omit=dev --silent && npm cache clean --force

# Copiar código do backend
COPY backend/src ./src

# Copiar build do frontend para servir como estático
COPY --from=frontend-builder /app/frontend/build ./public

# Criar diretório de logs
RUN mkdir -p logs && chown -R nodejs:nodejs /app

# Alterar para usuário não-root
USER nodejs

# IMPORTANTE: Railway espera que a aplicação escute em $PORT
EXPOSE $PORT

# Health check
HEALTHCHECK --interval=30s --timeout=15s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:$PORT/api/health || exit 1

# Usar dumb-init para melhor gerenciamento de processos
ENTRYPOINT ["dumb-init", "--"]

# Comando para iniciar a aplicação
CMD ["node", "src/server.js"]