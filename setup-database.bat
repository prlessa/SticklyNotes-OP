@echo off
title Stickly Notes - Database Setup
color 0A

echo.
echo  ███████ ████████ ██  ██████ ██   ██ ██      ██    ██ 
echo  ██         ██    ██ ██      ██  ██  ██       ██  ██  
echo  ███████    ██    ██ ██      █████   ██        ████   
echo       ██    ██    ██ ██      ██  ██  ██         ██    
echo  ███████    ██    ██  ██████ ██   ██ ███████    ██    
echo.
echo  🏗️  Database Setup for Stickly Notes
echo ========================================
echo.

REM Verificar se está executando como Administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ❌ Este script precisa ser executado como Administrador
    echo.
    echo 💡 Clique com botão direito e "Executar como administrador"
    pause
    exit /b 1
)

echo ✅ Executando como Administrador
echo.

REM Verificar Docker
echo 🔍 Verificando Docker...
docker --version >nul 2>&1
if %errorlevel% eq 0 (
    echo ✅ Docker encontrado!
    goto :docker_setup
) else (
    echo ❌ Docker não encontrado
    echo.
)

REM Verificar PostgreSQL
echo 🔍 Verificando PostgreSQL...
psql --version >nul 2>&1
if %errorlevel% eq 0 (
    echo ✅ PostgreSQL encontrado!
    goto :postgres_setup
) else (
    echo ❌ PostgreSQL não encontrado
    echo.
)

REM Nenhuma opção disponível
echo 🤔 Nenhum banco de dados encontrado.
echo.
echo 📋 Escolha uma opção:
echo    [1] Instalar com Docker (Recomendado)
echo    [2] Baixar e instalar PostgreSQL
echo    [3] Sair
echo.
set /p choice="Digite sua escolha (1-3): "

if "%choice%"=="1" goto :install_docker
if "%choice%"=="2" goto :install_postgres
if "%choice%"=="3" exit /b 0
goto :invalid_choice

:install_docker
echo.
echo 🐳 Para instalar Docker:
echo 1. Baixe: https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe
echo 2. Execute como Administrador
echo 3. Reinicie o computador
echo 4. Execute este script novamente
echo.
pause
exit /b 0

:install_postgres
echo.
echo 🐘 Para instalar PostgreSQL:
echo 1. Baixe: https://www.postgresql.org/download/windows/
echo 2. Baixe a versão 15.x (postgresql-15.x-x-windows-x64.exe)
echo 3. Execute como Administrador
echo 4. Use senha: postgres
echo 5. Execute este script novamente
echo.
pause
exit /b 0

:docker_setup
echo.
echo 🚀 Configurando com Docker...
echo.

REM Parar containers existentes
echo 🛑 Limpando containers existentes...
docker stop stickly_postgres stickly_redis >nul 2>&1
docker rm stickly_postgres stickly_redis >nul 2>&1

REM Iniciar PostgreSQL
echo 📊 Iniciando PostgreSQL...
docker run -d --name stickly_postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=stickly_notes_db -p 5432:5432 postgres:15-alpine

if %errorlevel% neq 0 (
    echo ❌ Erro ao iniciar PostgreSQL
    pause
    exit /b 1
)

REM Iniciar Redis
echo 🔴 Iniciando Redis...
docker run -d --name stickly_redis -p 6379:6379 redis:7-alpine

if %errorlevel% neq 0 (
    echo ❌ Erro ao iniciar Redis
    pause
    exit /b 1
)

echo ⏳ Aguardando serviços (30 segundos)...
timeout /t 30 >nul

goto :test_connection

:postgres_setup
echo.
echo 🔧 Configurando PostgreSQL local...
echo.

REM Tentar encontrar o serviço PostgreSQL
for %%s in (postgresql-x64-15 postgresql-15 postgresql postgres) do (
    echo 🔍 Testando serviço: %%s
    sc query %%s >nul 2>&1
    if !errorlevel! eq 0 (
        echo ✅ Serviço encontrado: %%s
        net start %%s >nul 2>&1
        set postgres_service=%%s
        goto :create_database
    )
)

echo ❌ Nenhum serviço PostgreSQL encontrado
echo.
echo 💡 Verifique se PostgreSQL Server está instalado corretamente
pause
exit /b 1

:create_database
echo.
echo 📊 Criando banco de dados...

REM Criar banco usando psql
psql -U postgres -c "CREATE DATABASE stickly_notes_db;" >nul 2>&1
if %errorlevel% eq 0 (
    echo ✅ Banco de dados criado!
) else (
    echo ⚠️  Banco pode já existir ou houve erro de autenticação
)

goto :test_connection

:test_connection
echo.
echo 🧪 Testando conexão...
echo.

REM Navegar para pasta backend e testar
cd /d "%~dp0backend" 2>nul || (
    echo ❌ Pasta backend não encontrada
    echo 💡 Execute este script na raiz do projeto Stickly Notes
    pause
    exit /b 1
)

REM Instalar dependências se necessário
if not exist "node_modules" (
    echo 📦 Instalando dependências...
    npm install
)

REM Testar conexão
node test-db.js
if %errorlevel% eq 0 (
    echo.
    echo 🎉 Configuração concluída com sucesso!
    echo.
    echo 📋 Próximos passos:
    echo    1. npm start          (iniciar backend)
    echo    2. cd ../frontend
    echo    3. npm install        (instalar deps frontend)
    echo    4. npm start          (iniciar frontend)
    echo.
) else (
    echo.
    echo ❌ Erro na conexão do banco
    echo.
    echo 🔧 Possíveis soluções:
    echo    1. Verificar se PostgreSQL está rodando
    echo    2. Verificar senha do usuário postgres
    echo    3. Usar Docker: docker run -d --name stickly_postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:15-alpine
    echo.
)

pause
exit /b 0

:invalid_choice
echo ❌ Opção inválida
goto :postgres_setup