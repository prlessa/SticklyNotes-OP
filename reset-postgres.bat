@echo off
title PostgreSQL 17 - Complete Reset
color 0C

echo.
echo 🐘 RESET POSTGRESQL 17 - Stickly Notes
echo =======================================
echo.

REM Verificar se está como Administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ❌ Execute como Administrador
    echo.
    echo 💡 Clique com botão direito no script e "Executar como administrador"
    pause
    exit /b 1
)

echo ✅ Executando como Administrador
echo.

echo 🔍 Detectando PostgreSQL 17...
echo.

REM ==========================================
REM 1. PARAR SERVIÇOS POSTGRESQL 17
REM ==========================================
echo 🛑 1/7 - Parando serviços PostgreSQL 17...

REM Nomes possíveis para PostgreSQL 17
for %%s in (postgresql-x64-17 postgresql-17 postgresql postgres) do (
    sc query %%s >nul 2>&1
    if !errorlevel! eq 0 (
        echo    ✅ Serviço encontrado: %%s
        net stop %%s >nul 2>&1
        if !errorlevel! eq 0 (
            echo       Serviço %%s parado
        ) else (
            echo       ⚠️ Erro ao parar %%s ou já estava parado
        )
        REM Desabilitar inicialização automática temporariamente
        sc config %%s start= disabled >nul 2>&1
    )
)

echo ✅ Serviços PostgreSQL processados
echo.

REM ==========================================
REM 2. MATAR PROCESSOS POSTGRESQL
REM ==========================================
echo 💀 2/7 - Terminando processos PostgreSQL...

tasklist | findstr /i postgres >nul 2>&1
if %errorlevel% eq 0 (
    echo    Processos PostgreSQL encontrados:
    tasklist | findstr /i postgres
    
    taskkill /f /im postgres.exe >nul 2>&1
    taskkill /f /im pg_ctl.exe >nul 2>&1
    taskkill /f /im postmaster.exe >nul 2>&1
    
    echo    Processos terminados
) else (
    echo    Nenhum processo PostgreSQL encontrado
)

echo ✅ Processos PostgreSQL limpos
echo.

REM ==========================================
REM 3. LIBERAR PORTA 5432
REM ==========================================
echo 🔌 3/7 - Liberando porta 5432...

netstat -ano | findstr :5432 >nul 2>&1
if %errorlevel% eq 0 (
    echo    Porta 5432 está ocupada. Liberando...
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5432') do (
        echo       Terminando processo PID: %%a
        taskkill /f /pid %%a >nul 2>&1
    )
) else (
    echo    Porta 5432 já está livre
)

echo ✅ Porta 5432 processada
echo.

REM ==========================================
REM 4. LIMPAR CONTAINERS DOCKER
REM ==========================================
echo 🐳 4/7 - Limpando containers Docker PostgreSQL...

docker --version >nul 2>&1
if %errorlevel% eq 0 (
    echo    Docker encontrado, limpando containers PostgreSQL...
    
    REM Parar todos os containers PostgreSQL
    for /f %%i in ('docker ps -q --filter "ancestor=postgres" 2^>nul') do (
        echo       Parando container: %%i
        docker stop %%i >nul 2>&1
        docker rm %%i >nul 2>&1
    )
    
    REM Parar containers específicos conhecidos
    docker stop stickly_postgres stickly_redis postgres_container stickly_postgres_clean stickly_postgres_fresh >nul 2>&1
    docker rm stickly_postgres stickly_redis postgres_container stickly_postgres_clean stickly_postgres_fresh >nul 2>&1
    
    echo    Containers PostgreSQL limpos
) else (
    echo    Docker não encontrado - pulando limpeza Docker
)

echo ✅ Containers Docker processados
echo.

REM ==========================================
REM 5. LIMPAR DADOS E LOGS POSTGRESQL 17
REM ==========================================
echo 🗂️ 5/7 - Limpando dados PostgreSQL 17...

REM Diretórios comuns do PostgreSQL 17
set PG17_DIRS=^
"C:\Program Files\PostgreSQL\17\data" ^
"C:\Users\%USERNAME%\AppData\Roaming\postgresql" ^
"C:\Users\%USERNAME%\AppData\Local\PostgreSQL" ^
"%TEMP%\postgresql"

for %%d in (%PG17_DIRS%) do (
    if exist %%d (
        echo    Encontrado: %%d
        REM Não remover dados, apenas logs temporários
        if exist %%d\log (
            echo       Limpando logs em %%d\log
            del /q "%%d\log\*" >nul 2>&1
        )
    )
)

echo ✅ Limpeza de dados concluída
echo.

REM ==========================================
REM 6. REABILITAR SERVIÇOS (OPCIONAL)
REM ==========================================
echo ⚙️ 6/7 - Reabilitando serviços PostgreSQL...

for %%s in (postgresql-x64-17 postgresql-17 postgresql) do (
    sc query %%s >nul 2>&1
    if !errorlevel! eq 0 (
        echo    Reabilitando serviço: %%s
        sc config %%s start= auto >nul 2>&1
    )
)

echo ✅ Serviços reabilitados
echo.

REM ==========================================
REM 7. VERIFICAÇÃO FINAL
REM ==========================================
echo 🔍 7/7 - Verificação final...
echo.

echo 📊 Status da porta 5432:
netstat -an | findstr :5432
if %errorlevel% eq 0 (
    echo    ⚠️ Ainda há algo usando a porta 5432
) else (
    echo    ✅ Porta 5432 completamente livre
)

echo.
echo 📊 Processos PostgreSQL:
tasklist | findstr /i postgres
if %errorlevel% eq 0 (
    echo    ⚠️ Ainda há processos PostgreSQL
) else (
    echo    ✅ Nenhum processo PostgreSQL ativo
)

echo.
echo 📊 Serviços PostgreSQL:
for %%s in (postgresql-x64-17 postgresql-17 postgresql) do (
    sc query %%s >nul 2>&1
    if !errorlevel! eq 0 (
        echo    Serviço %%s: 
        sc query %%s | findstr STATE
    )
)

echo.
echo 🎉 RESET POSTGRESQL 17 CONCLUÍDO!
echo.
echo 📋 Agora você pode:
echo    [1] Usar Docker (recomendado para desenvolvimento)
echo    [2] Reconfigurar PostgreSQL 17 local
echo    [3] Verificar se tudo está limpo
echo.

set /p choice="Escolha uma opção (1-3): "

if "%choice%"=="1" goto :setup_docker
if "%choice%"=="2" goto :reconfigure_postgres17
if "%choice%"=="3" goto :final_check

:setup_docker
echo.
echo 🐳 Configurando com Docker (independente do PostgreSQL 17 local)...
echo.

timeout /t 3 >nul

docker run -d --name stickly_postgres_v17 ^
  -e POSTGRES_USER=postgres ^
  -e POSTGRES_PASSWORD=postgres ^
  -e POSTGRES_DB=stickly_notes_db ^
  -p 5432:5432 ^
  postgres:17-alpine

if %errorlevel% neq 0 (
    echo ❌ Erro ao iniciar PostgreSQL Docker
    echo.
    echo 🔍 Verificando se a porta ainda está ocupada:
    netstat -an | findstr :5432
    pause
    exit /b 1
)

docker run -d --name stickly_redis_v17 -p 6379:6379 redis:7-alpine

echo ⏳ Aguardando PostgreSQL Docker ficar pronto (30 segundos)...
timeout /t 30 >nul

docker exec stickly_postgres_v17 pg_isready -U postgres
if %errorlevel% eq 0 (
    echo ✅ PostgreSQL Docker funcionando!
    goto :test_connection
) else (
    echo ❌ PostgreSQL Docker com problemas
    docker logs stickly_postgres_v17
    pause
    exit /b 1
)

:reconfigure_postgres17
echo.
echo 🔧 Para reconfigurar PostgreSQL 17 local:
echo.
echo 1. Inicie o serviço PostgreSQL:
echo    net start postgresql-x64-17
echo    (ou postgresql-17)
echo.
echo 2. Conecte e configure:
echo    psql -U postgres
echo    ALTER USER postgres PASSWORD 'postgres';
echo    CREATE DATABASE stickly_notes_db;
echo    \q
echo.
echo 3. Teste sua aplicação:
echo    cd backend
echo    node test-db.js
echo.
pause
exit /b 0

:final_check
echo.
echo 🔍 Verificação Final Detalhada:
echo ================================
echo.

echo Porta 5432:
netstat -ano | findstr :5432
echo.

echo Serviços PostgreSQL:
sc query | findstr /i postgres
echo.

echo Processos:
tasklist | findstr /i postgres
echo.

pause
exit /b 0

:test_connection
echo.
echo 🧪 Testando conexão com Stickly Notes...

if exist "%~dp0backend" (
    cd /d "%~dp0backend"
) else if exist "backend" (
    cd backend
) else (
    echo ❌ Pasta backend não encontrada
    echo 💡 Execute este script na raiz do projeto Stickly Notes
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo 📦 Instalando dependências Node.js...
    npm install
)

echo 🧪 Executando teste de conexão...
node test-db.js

if %errorlevel% eq 0 (
    echo.
    echo 🎉 SUCESSO! Stickly Notes configurado!
    echo.
    echo 📋 Para executar:
    echo    Backend:  npm start
    echo    Frontend: cd ../frontend ^&^& npm install ^&^& npm start
    echo.
) else (
    echo.
    echo ❌ Erro na conexão
    echo.
    echo 🔧 Verifique:
    echo    - Se os containers Docker estão rodando: docker ps
    echo    - Se a porta 5432 está livre: netstat -an ^| findstr :5432
    echo.
)

pause
exit /b 0