@echo off
echo 🐳 Configurando Stickly Notes com Docker...
echo.

REM Verificar se Docker está instalado
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker não está instalado ou não está no PATH
    echo.
    echo 💡 Instale Docker Desktop:
    echo    https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe
    echo.
    pause
    exit /b 1
)

echo ✅ Docker encontrado!
echo.

REM Parar containers existentes (ignorar erros)
echo 🛑 Parando containers existentes...
docker stop stickly_postgres stickly_redis >nul 2>&1
docker rm stickly_postgres stickly_redis >nul 2>&1

REM Iniciar PostgreSQL
echo 📊 Iniciando PostgreSQL...
docker run -d --name stickly_postgres ^
    -e POSTGRES_USER=postgres ^
    -e POSTGRES_PASSWORD=postgres ^
    -e POSTGRES_DB=stickly_notes_db ^
    -p 5432:5432 ^
    postgres:15-alpine

if %errorlevel% neq 0 (
    echo ❌ Erro ao iniciar PostgreSQL
    pause
    exit /b 1
)

REM Iniciar Redis
echo 🔴 Iniciando Redis...
docker run -d --name stickly_redis ^
    -p 6379:6379 ^
    redis:7-alpine

if %errorlevel% neq 0 (
    echo ❌ Erro ao iniciar Redis
    pause
    exit /b 1
)

echo.
echo ⏳ Aguardando serviços ficarem prontos (20 segundos)...
timeout /t 20 >nul

REM Testar conexões
echo.
echo 🧪 Testando PostgreSQL...
docker exec stickly_postgres pg_isready -U postgres -d stickly_notes_db

if %errorlevel% eq 0 (
    echo ✅ PostgreSQL pronto!
) else (
    echo ⚠️  PostgreSQL ainda não está pronto, aguarde mais um pouco
)

echo.
echo 🧪 Testando Redis...
docker exec stickly_redis redis-cli ping

if %errorlevel% eq 0 (
    echo ✅ Redis pronto!
) else (
    echo ⚠️  Redis ainda não está pronto, aguarde mais um pouco
)

echo.
echo 🎉 Configuração concluída!
echo.
echo 📋 Próximos passos:
echo    1. cd backend
echo    2. npm install
echo    3. node test-db.js
echo    4. npm start
echo.
echo 🔧 Para parar os serviços:
echo    docker stop stickly_postgres stickly_redis
echo.

pause