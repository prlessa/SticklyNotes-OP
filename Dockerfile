# Dockerfile principal para Railway - Build completo (backend + frontend)
FROM node:18-alpine as frontend-builder

# Instalar dependências do sistema para Alpine
RUN apk add --no-cache curl git

WORKDIR /app/frontend

# Copiar arquivos do frontend
COPY frontend/package*.json ./
RUN npm ci --omit=dev --silent

COPY frontend/ ./

# Build do frontend para produção
ENV NODE_ENV=production
# CORREÇÃO: Deixar vazio para Railway configurar automaticamente
ENV REACT_APP_API_URL=""
RUN npm run build

# Stage final - Backend com frontend integrado
FROM node:18-alpine

# Instalar dependências do sistema
RUN apk add --no-cache curl dumb-init

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

# Copiar package.json e package-lock.json do backend
COPY backend/package*.json ./
RUN npm ci --omit=dev --silent && npm cache clean --force

# Copiar código do backend
COPY backend/src ./src

# Copiar build do frontend para pasta public
COPY --from=frontend-builder /app/frontend/build ./public

# Criar diretórios necessários
RUN mkdir -p logs && chown -R nodejs:nodejs /app

# Alterar para usuário não-root
USER nodejs

# Expor porta
EXPOSE 3001

# Health check melhorado
HEALTHCHECK --interval=30s --timeout=15s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# CORREÇÃO: Usar dumb-init para melhor gerenciamento de processos
ENTRYPOINT ["dumb-init", "--"]

# Comando de inicialização
CMD ["node", "src/server.js"]