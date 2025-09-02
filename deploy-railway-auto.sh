#!/bin/bash

# Deploy automático para Railway
# Este script configura tudo automaticamente

set -e  # Para na primeira falha

echo "🚀 Deploy Automático Stickly Notes no Railway"
echo "=============================================="

# Função para gerar JWT secret
generate_jwt_secret() {
  if command -v openssl &> /dev/null; then
    openssl rand -base64 32
  else
    # Fallback se não tiver openssl
    date +%s | sha256sum | base64 | head -c 32
  fi
}

# Função para verificar se comando existe
check_command() {
  if ! command -v $1 &> /dev/null; then
    echo "❌ $1 não encontrado. Instalando..."
    case $1 in
      "railway")
        npm install -g @railway/cli
        ;;
      "git")
        echo "❌ Git é necessário. Instale git e tente novamente."
        exit 1
        ;;
    esac
  fi
}

# Verificar pré-requisitos
echo "🔍 Verificando pré-requisitos..."
check_command "git"
check_command "node"
check_command "npm"

# Instalar Railway CLI se necessário
if ! command -v railway &> /dev/null; then
  echo "📦 Instalando Railway CLI..."
  npm install -g @railway/cli
fi

# Login no Railway (vai abrir o browser)
echo "🔐 Fazendo login no Railway..."
railway login || {
  echo "❌ Falha no login. Tentando método alternativo..."
  echo "Vá para https://railway.app/account/tokens e crie um token"
  read -p "Cole seu token aqui: " RAILWAY_TOKEN
  export RAILWAY_TOKEN=$RAILWAY_TOKEN
}

# Verificar se estamos em um repositório git
if [ ! -d ".git" ]; then
  echo "📁 Inicializando repositório Git..."
  git init
  git add .
  git commit -m "Initial commit - Stickly Notes"
fi

# Criar projeto no Railway
echo "🏗️ Criando projeto no Railway..."
PROJECT_NAME="stickly-notes-$(date +%s)"
railway init --name "$PROJECT_NAME" || {
  echo "⚠️ Projeto pode já existir, continuando..."
}

# Aguardar um pouco para Railway processar
sleep 2

# Adicionar PostgreSQL
echo "🗄️ Adicionando PostgreSQL..."
railway add --database postgresql || echo "PostgreSQL pode já existir"

# Adicionar Redis  
echo "⚡ Adicionando Redis..."
railway add --database redis || echo "Redis pode já existir"

# Aguardar bancos serem provisionados
echo "⏳ Aguardando bancos serem provisionados (30s)..."
sleep 30

# Gerar e configurar variáveis de ambiente
echo "🔧 Configurando variáveis de ambiente..."

JWT_SECRET=$(generate_jwt_secret)

# Configurar todas as variáveis necessárias
railway variables set NODE_ENV=production
railway variables set JWT_SECRET="$JWT_SECRET"
railway variables set BCRYPT_ROUNDS=12
railway variables set LOG_LEVEL=info
railway variables set PORT=3001

# Variáveis específicas para o Railway
railway variables set FRONTEND_URL="https://$PROJECT_NAME.up.railway.app"

echo "✅ Variáveis configuradas:"
echo "  - NODE_ENV=production"
echo "  - JWT_SECRET=***"
echo "  - BCRYPT_ROUNDS=12" 
echo "  - LOG_LEVEL=info"
echo "  - PORT=3001"

# Aguardar mais um pouco para as variáveis serem aplicadas
echo "⏳ Aguardando variáveis serem aplicadas..."
sleep 10

# Fazer deploy
echo "🚀 Fazendo deploy..."
railway up --detach

# Aguardar deploy completar
echo "⏳ Aguardando deploy completar..."
sleep 60

# Verificar status
echo "📊 Verificando status do deploy..."
railway status

# Obter URL do projeto
URL=$(railway url 2>/dev/null || echo "Disponível no dashboard do Railway")

# Salvar informações do deploy
cat > railway-deploy-info.txt << EOF
🎉 Deploy Completo - Stickly Notes
================================

Projeto: $PROJECT_NAME
URL: $URL
Dashboard: https://railway.app/dashboard

Serviços provisionados:
- ✅ Aplicação Web (Node.js/React)
- ✅ PostgreSQL Database  
- ✅ Redis Cache

Variáveis configuradas:
- NODE_ENV=production
- JWT_SECRET=(gerado automaticamente)
- BCRYPT_ROUNDS=12
- LOG_LEVEL=info
- PORT=3001
- DATABASE_URL=(configurado automaticamente pelo Railway)
- REDIS_URL=(configurado automaticamente pelo Railway)

Deploy realizado em: $(date)

Para verificar logs:
  railway logs

Para fazer redeploy:
  railway up

Para abrir no navegador:
  railway open
EOF

echo ""
echo "🎉 Deploy automático concluído!"
echo "================================"
echo "📊 Projeto: $PROJECT_NAME"
echo "🌐 URL: $URL"
echo "📄 Detalhes salvos em: railway-deploy-info.txt"
echo ""
echo "⏳ O aplicativo pode levar alguns minutos para ficar disponível."
echo "📊 Monitore o status com: railway logs"
echo "🌐 Acesse o dashboard: https://railway.app/dashboard"
echo ""
echo "🔍 Para verificar se está funcionando:"
echo "   curl $URL/api/health"
echo ""

# Abrir no navegador (opcional)
read -p "Abrir projeto no navegador? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  railway open 2>/dev/null || echo "Abra manualmente: https://railway.app/dashboard"
fi

echo "✅ Script concluído com sucesso!"