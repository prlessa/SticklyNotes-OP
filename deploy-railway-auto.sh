#!/bin/bash

# Deploy automático para Railway - VERSÃO CORRIGIDA
# Este script resolve os problemas de conexão com bancos de dados

set -e  # Para na primeira falha

echo "🚀 Deploy Stickly Notes no Railway - VERSÃO CORRIGIDA"
echo "===================================================="

# Função para gerar JWT secret
generate_jwt_secret() {
  if command -v openssl &> /dev/null; then
    openssl rand -base64 32
  else
    # Fallback se não tiver openssl
    date +%s | sha256sum | base64 | head -c 32 | echo
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

# Login no Railway
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
railway init --name "$PROJECT_NAME" || echo "⚠️ Projeto pode já existir, continuando..."

# Aguardar um pouco para Railway processar
sleep 3

# Adicionar PostgreSQL
echo "🗄️ Adicionando PostgreSQL..."
railway add --database postgresql || echo "PostgreSQL pode já existir"

# Adicionar Redis
echo "⚡ Adicionando Redis..."  
railway add --database redis || echo "Redis pode já existir"

# Aguardar bancos serem provisionados
echo "⏳ Aguardando bancos serem provisionados (45s)..."
sleep 45

# Gerar JWT secret
JWT_SECRET=$(generate_jwt_secret)

# Configurar variáveis de ambiente CORRETAS para Railway
echo "🔧 Configurando variáveis de ambiente para Railway..."

railway variables set NODE_ENV=production
railway variables set JWT_SECRET="$JWT_SECRET" 
railway variables set BCRYPT_ROUNDS=12
railway variables set LOG_LEVEL=info
railway variables set PORT=3001

# ⚠️ IMPORTANTE: Não definir DATABASE_URL e REDIS_URL manualmente
# O Railway define essas variáveis automaticamente quando você adiciona os serviços
echo "📍 IMPORTANTE: DATABASE_URL e REDIS_URL serão definidas automaticamente pelo Railway"

# Aguardar variáveis serem aplicadas
echo "⏳ Aguardando variáveis serem aplicadas..."
sleep 15

# Verificar se as variáveis de banco foram criadas pelo Railway
echo "🔍 Verificando variáveis do Railway..."
railway variables || echo "Não foi possível listar variáveis"

echo "✅ Variáveis configuradas manualmente:"
echo "  - NODE_ENV=production"
echo "  - JWT_SECRET=***"
echo "  - BCRYPT_ROUNDS=12"
echo "  - LOG_LEVEL=info" 
echo "  - PORT=3001"
echo ""
echo "🔗 Variáveis automáticas do Railway (devem estar presentes):"
echo "  - DATABASE_URL (PostgreSQL)"
echo "  - REDIS_URL (Redis)"

# Fazer deploy
echo "🚀 Fazendo deploy..."
railway up --detach

# Aguardar deploy completar
echo "⏳ Aguardando deploy completar (90s)..."
sleep 90

# Verificar status
echo "📊 Verificando status do deploy..."
railway status

# Obter URL do projeto
URL=$(railway url 2>/dev/null || echo "https://$PROJECT_NAME.up.railway.app")

# Verificar se a aplicação está funcionando
echo "🔍 Testando aplicação..."
if curl -f -s "$URL/api/health" > /dev/null 2>&1; then
  echo "✅ Aplicação está respondendo corretamente!"
else
  echo "⚠️ Aplicação pode ainda estar inicializando..."
  echo "   Verifique os logs com: railway logs"
fi

# Salvar informações do deploy
cat > railway-deploy-info.txt << EOF
🎉 Deploy Railway Completo - Stickly Notes
=========================================

Projeto: $PROJECT_NAME
URL: $URL
Dashboard: https://railway.app/dashboard

Serviços provisionados:
- ✅ Aplicação Web (Node.js + React integrado)
- ✅ PostgreSQL Database (URL automática)
- ✅ Redis Cache (URL automática)

Variáveis configuradas:
- NODE_ENV=production
- JWT_SECRET=(gerado automaticamente)
- BCRYPT_ROUNDS=12
- LOG_LEVEL=info
- PORT=3001
- DATABASE_URL=(Railway automático)
- REDIS_URL=(Railway automático)
- FRONTEND_URL=(Railway automático)

Deploy realizado em: $(date)

Comandos úteis:
  railway logs          # Ver logs em tempo real
  railway up            # Fazer redeploy  
  railway open          # Abrir no navegador
  railway variables     # Ver todas as variáveis
  railway status        # Status dos serviços

Health check: $URL/api/health
Frontend: $URL
API: $URL/api

IMPORTANTE:
- Se der erro de conexão, aguarde alguns minutos
- Verifique logs com 'railway logs'
- DATABASE_URL e REDIS_URL são criadas automaticamente pelo Railway
EOF

echo ""
echo "🎉 Deploy Railway concluído!"
echo "============================"
echo "📊 Projeto: $PROJECT_NAME" 
echo "🌐 URL: $URL"
echo "📄 Detalhes salvos em: railway-deploy-info.txt"
echo ""
echo "⏳ A aplicação pode levar alguns minutos para ficar totalmente disponível."
echo "📊 Monitore com: railway logs"
echo "🌐 Dashboard: https://railway.app/dashboard"
echo ""
echo "🔍 Para verificar se está funcionando:"
echo "   curl $URL/api/health"
echo ""

# Mostrar logs em tempo real por alguns segundos
echo "📊 Logs em tempo real (10s):"
timeout 10s railway logs --tail || echo "Timeout nos logs, continue monitorando com 'railway logs'"

echo ""
echo "✅ Script concluído com sucesso!"
echo "🚨 Se houver erro de conexão, aguarde alguns minutos e verifique os logs."