#!/bin/bash

# Script para desenvolvimento local sem Docker

set -e

echo "🚀 Iniciando Stickly Notes (Desenvolvimento Local)..."

# Verificar se Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não está instalado."
    exit 1
fi

# Criar arquivo .env se não existir
if [ ! -f .env ]; then
    echo "📝 Criando arquivo .env..."
    cp .env.example .env
    echo "✅ Arquivo .env criado."
fi

# Função para verificar se serviço está rodando
check_service() {
    local service=$1
    local port=$2
    local max_attempts=30
    local attempt=1
    
    echo "🔍 Verificando $service..."
    while [ $attempt -le $max_attempts ]; do
        if nc -z localhost $port > /dev/null 2>&1; then
            echo "✅ $service está rodando!"
            return 0
        fi
        echo "   Tentativa $attempt/$max_attempts - aguardando $service..."
        sleep 2
        ((attempt++))
    done
    
    echo "❌ $service não está disponível"
    return 1
}

# Verificar PostgreSQL
if ! check_service "PostgreSQL" 5432; then
    echo "⚠️  PostgreSQL não encontrado. Iniciando com Docker..."
    docker run -d --name stickly_postgres \
        -e POSTGRES_USER=postgres \
        -e POSTGRES_PASSWORD=postgres \
        -e POSTGRES_DB=stickly_notes_db \
        -p 5432:5432 \
        postgres:15-alpine || true
    
    # Aguardar PostgreSQL ficar pronto
    sleep 10
    if ! check_service "PostgreSQL" 5432; then
        echo "❌ Falha ao iniciar PostgreSQL"
        exit 1
    fi
fi

# Verificar Redis (opcional)
if ! check_service "Redis" 6379; then
    echo "⚠️  Redis não encontrado. Iniciando com Docker..."
    docker run -d --name stickly_redis \
        -p 6379:6379 \
        redis:7-alpine || true
    
    sleep 5
    check_service "Redis" 6379 || echo "⚠️  Continuando sem Redis..."
fi

# Instalar dependências do backend
echo "📦 Instalando dependências do backend..."
cd backend
if [ ! -d "node_modules" ]; then
    npm install
fi

# Iniciar backend em background
echo "⚙️ Iniciando backend..."
npm start &
BACKEND_PID=$!

# Aguardar backend ficar pronto
cd ..
sleep 5
if ! check_service "Backend" 3001; then
    echo "❌ Falha ao iniciar backend"
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

# Instalar dependências do frontend
echo "📦 Instalando dependências do frontend..."
cd frontend
if [ ! -d "node_modules" ]; then
    npm install
fi

# Iniciar frontend
echo "🎨 Iniciando frontend..."
npm start &
FRONTEND_PID=$!

# Aguardar frontend ficar pronto
cd ..
sleep 10
if ! check_service "Frontend" 3000; then
    echo "❌ Falha ao iniciar frontend"
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    exit 1
fi

echo ""
echo "🎉 Stickly Notes iniciado com sucesso!"
echo ""
echo "📱 Aplicação disponível em:"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:3001"
echo "   Health:   http://localhost:3001/api/health"
echo ""
echo "📊 Para parar os serviços:"
echo "   Pressione Ctrl+C ou execute: pkill -f 'node.*stickly'"
echo ""

# Aguardar interrupção
wait