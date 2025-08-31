#!/bin/bash

# Script para inicializar o projeto Stickly Notes com Docker

set -e

echo "🚀 Iniciando Stickly Notes..."

# Verificar se Docker está instalado
if ! command -v docker &> /dev/null; then
    echo "❌ Docker não está instalado. Instale Docker primeiro."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose não está instalado. Instale Docker Compose primeiro."
    exit 1
fi

# Criar arquivo .env se não existir
if [ ! -f .env ]; then
    echo "📝 Criando arquivo .env..."
    cp .env.example .env
    echo "✅ Arquivo .env criado. Edite-o se necessário antes de continuar."
fi

# Parar containers existentes
echo "🛑 Parando containers existentes..."
docker-compose down -v

# Limpar imagens antigas (opcional)
read -p "Deseja limpar imagens antigas? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🧹 Limpando imagens antigas..."
    docker-compose down --rmi all
    docker system prune -f
fi

# Construir e iniciar containers
echo "🔨 Construindo e iniciando containers..."
docker-compose up --build -d

# Aguardar serviços ficarem prontos
echo "⏳ Aguardando serviços ficarem prontos..."

# Aguardar PostgreSQL
echo "📊 Verificando PostgreSQL..."
timeout=60
while ! docker exec stickly_postgres pg_isready -U postgres -d stickly_notes_db > /dev/null 2>&1; do
    if [ $timeout -le 0 ]; then
        echo "❌ Timeout aguardando PostgreSQL"
        docker-compose logs postgres
        exit 1
    fi
    echo "   PostgreSQL ainda não está pronto... ($timeout segundos restantes)"
    sleep 2
    timeout=$((timeout-2))
done
echo "✅ PostgreSQL pronto!"

# Aguardar Redis
echo "🔴 Verificando Redis..."
timeout=30
while ! docker exec stickly_redis redis-cli ping > /dev/null 2>&1; do
    if [ $timeout -le 0 ]; then
        echo "❌ Timeout aguardando Redis"
        docker-compose logs redis
        exit 1
    fi
    echo "   Redis ainda não está pronto... ($timeout segundos restantes)"
    sleep 2
    timeout=$((timeout-2))
done
echo "✅ Redis pronto!"

# Aguardar Backend
echo "⚙️ Verificando Backend..."
timeout=60
while ! curl -f http://localhost:3001/api/health > /dev/null 2>&1; do
    if [ $timeout -le 0 ]; then
        echo "❌ Timeout aguardando Backend"
        docker-compose logs backend
        exit 1
    fi
    echo "   Backend ainda não está pronto... ($timeout segundos restantes)"
    sleep 3
    timeout=$((timeout-3))
done
echo "✅ Backend pronto!"

# Aguardar Frontend
echo "🎨 Verificando Frontend..."
timeout=60
while ! curl -f http://localhost:3000 > /dev/null 2>&1; do
    if [ $timeout -le 0 ]; then
        echo "❌ Timeout aguardando Frontend"
        docker-compose logs frontend
        exit 1
    fi
    echo "   Frontend ainda não está pronto... ($timeout segundos restantes)"
    sleep 3
    timeout=$((timeout-3))
done
echo "✅ Frontend pronto!"

echo ""
echo "🎉 Stickly Notes iniciado com sucesso!"
echo ""
echo "📱 Aplicação disponível em:"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:3001"
echo "   API Docs: http://localhost:3001/api/health"
echo ""
echo "📊 Banco de dados:"
echo "   PostgreSQL: localhost:5432"
echo "   Redis:      localhost:6379"
echo ""
echo "📋 Comandos úteis:"
echo "   Ver logs:     docker-compose logs -f"
echo "   Parar tudo:   docker-compose down"
echo "   Reiniciar:    docker-compose restart"
echo ""
echo "🔍 Para debugar problemas, use:"
echo "   docker-compose logs backend"
echo "   docker-compose logs frontend"
echo ""

# Mostrar status dos containers
echo "📦 Status dos containers:"
docker-compose ps

# Abrir aplicação no navegador (opcional)
if command -v xdg-open &> /dev/null; then
    read -p "Deseja abrir a aplicação no navegador? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        xdg-open http://localhost:3000
    fi
elif command -v open &> /dev/null; then
    read -p "Deseja abrir a aplicação no navegador? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        open http://localhost:3000
    fi
fi