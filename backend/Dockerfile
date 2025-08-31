
FROM node:18-alpine

WORKDIR /app

# Copiar package.json e instalar dependências
COPY package*.json ./
RUN npm install --only=production

# Copiar código fonte
COPY . .

# Expor porta
EXPOSE 3001

# Comando de inicialização
CMD ["npm", "start"]