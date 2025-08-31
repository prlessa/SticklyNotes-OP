FROM node:18-alpine

# Instalar dependências do sistema
RUN apk add --no-cache curl

# Criar diretório de trabalho
WORKDIR /app

# Copiar package.json e package-lock.json
COPY package.json package-lock.json ./

# Instalar dependências usando npm ci (mais rápido e determinístico)
RUN npm ci --omit=dev && npm cache clean --force

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Criar diretório de logs
RUN mkdir -p logs && chown -R nodejs:nodejs logs

# Copiar código fonte
COPY . .

# Alterar proprietário para usuário nodejs
RUN chown -R nodejs:nodejs /app

# Usar usuário não-root
USER nodejs

# Expor porta
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# Comando de inicialização
CMD ["node", "src/server.js"]