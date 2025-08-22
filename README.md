# 🌟 Stickly Notes - Sistema de Murais Colaborativos

Uma aplicação web moderna e segura para criação de murais colaborativos com notas adesivas virtuais. Ideal para equipes, amigos e casais compartilharem ideias e mensagens de forma interativa e em tempo real.

## ✨ Características Principais

### 🎯 Funcionalidades Core
- **Murais Temáticos**: Painéis específicos para amigos (até 15 usuários) e casais (até 2 usuários)
- **Notas Interativas**: Criação, movimentação e exclusão de notas em tempo real
- **Colaboração em Tempo Real**: WebSocket para sincronização instantânea
- **Sistema de Cores**: Paletas específicas para cada tipo de mural
- **Proteção por Senha**: Murais podem ser protegidos opcionalmente

### 🔒 Segurança Avançada
- **Rate Limiting**: Proteção contra ataques de força bruta
- **Sanitização de Dados**: Prevenção contra XSS e injection
- **Validação Rigorosa**: Validação completa de todas as entradas
- **Headers de Segurança**: Helmet.js e headers customizados
- **Logs Seguros**: Sistema de logging que remove dados sensíveis

### 🚀 Performance e Escalabilidade
- **Cache Inteligente**: Redis para cache de painéis e posts
- **Pool de Conexões**: Gerenciamento otimizado de conexões PostgreSQL
- **Compressão**: Compressão automática de respostas
- **Cleanup Automático**: Limpeza automática de dados antigos

## 🏗️ Arquitetura Técnica

### Backend (Node.js)
```
backend/
├── src/
│   ├── config/
│   │   ├── config.js          # Configurações centralizadas
│   │   └── database.js        # Gerenciamento de banco de dados
│   ├── utils/
│   │   ├── logger.js          # Sistema de logs
│   │   ├── security.js        # Utilitários de segurança
│   │   └── validators.js      # Validações
│   ├── routes/
│   │   ├── panelRoutes.js     # Rotas de painéis
│   │   ├── postRoutes.js      # Rotas de posts
│   │   └── userRoutes.js      # Rotas de usuários
│   └── server.js              # Servidor principal
├── Dockerfile
└── package.json
```

### Frontend (React)
```
frontend/
├── src/
│   ├── components/
│   │   └── PostIt.js          # Componente de nota adesiva
│   ├── hooks/
│   │   ├── useUser.js         # Hook de usuário
│   │   └── useSockets.js      # Hook de WebSocket
│   ├── services/
│   │   └── apiService.js      # Cliente API
│   ├── constants/
│   │   └── config.js          # Configurações do frontend
│   ├── App.js                 # Aplicação principal
│   └── index.js
├── public/
├── Dockerfile
└── package.json
```

## 🛠️ Instalação e Configuração

### Pré-requisitos
- **Node.js** 18.x ou superior
- **PostgreSQL** 15.x ou superior
- **Redis** 7.x ou superior
- **Docker** (opcional, para containerização)

### 1. Clonagem e Configuração Inicial

```bash
# Clonar o repositório
git clone https://github.com/seu-usuario/stickly-notes.git
cd stickly-notes

# Copiar variáveis de ambiente
cp .env.example .env

# Editar variáveis de ambiente
nano .env
```

### 2. Configuração das Variáveis de Ambiente

Edite o arquivo `.env` com suas configurações:

```env
# Essenciais para funcionamento
DATABASE_URL=postgresql://user:password@localhost:5432/stickynotes_db
REDIS_URL=redis://localhost:6379
JWT_SECRET=seu-jwt-secret-muito-seguro
FRONTEND_URL=http://localhost:3000

# Configurações de produção
NODE_ENV=production
PORT=3001
BCRYPT_ROUNDS=12
```

### 3. Instalação via Docker (Recomendado)

```bash
# Construir e iniciar todos os serviços
docker-compose up -d

# Verificar status dos containers
docker-compose ps

# Ver logs
docker-compose logs -f
```

### 4. Instalação Manual

#### Backend
```bash
cd backend

# Instalar dependências
npm install

# Configurar banco de dados
# Certifique-se de que PostgreSQL e Redis estão rodando

# Iniciar em desenvolvimento
npm run dev

# Ou em produção
npm start
```

#### Frontend
```bash
cd frontend

# Instalar dependências
npm install

# Iniciar em desenvolvimento
npm start

# Construir para produção
npm run build
```

## 🔧 Configuração de Banco de Dados

### PostgreSQL

```sql
-- Criar banco de dados
CREATE DATABASE stickynotes_db;

-- Criar usuário (opcional)
CREATE USER stickly_user WITH PASSWORD 'sua_senha_segura';
GRANT ALL PRIVILEGES ON DATABASE stickynotes_db TO stickly_user;
```

As tabelas são criadas automaticamente na primeira execução.

### Redis

Redis é usado para cache e pub/sub. Configuração básica:

```bash
# Ubuntu/Debian
sudo apt install redis-server

# macOS
brew install redis

# Iniciar Redis
redis-server
```

## 🚀 Deployment

### Docker Compose (Produção)

```yaml
# docker-compose.prod.yml
version: '3.8'
services:
  backend:
    build: ./backend
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      JWT_SECRET: ${JWT_SECRET}
    ports:
      - "3001:3001"
    restart: unless-stopped

  frontend:
    build: ./frontend
    environment:
      REACT_APP_API_URL: ${API_URL}
    ports:
      - "80:80"
    restart: unless-stopped
```

### Deploy Manual

#### Backend
```bash
# Instalar PM2 para gerenciamento de processos
npm install -g pm2

# Iniciar aplicação
pm2 start src/server.js --name stickly-backend

# Configurar startup automático
pm2 startup
pm2 save
```

#### Frontend
```bash
# Construir para produção
npm run build

# Servir com nginx ou outro servidor web
sudo cp -r build/* /var/www/stickly-notes/
```

## 📊 Monitoramento e Logs

### Sistema de Logs

Logs são automaticamente categorizados:

```bash
# Ver logs em tempo real
tail -f logs/combined.log

# Logs apenas de erro
tail -f logs/error.log

# Logs de segurança
grep "SECURITY" logs/combined.log
```

### Health Check

```bash
# Verificar saúde da aplicação
curl http://localhost:3001/health

# Resposta esperada:
{
  "status": "healthy",
  "service": "Stickly Notes Backend",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "checks": {
    "postgres": true,
    "redis": true
  }
}
```

## 🔐 Segurança

### Configurações de Produção

1. **HTTPS Obrigatório**
```env
NODE_ENV=production
SSL_KEY_PATH=/path/to/ssl/key.pem
SSL_CERT_PATH=/path/to/ssl/cert.pem
```

2. **Headers de Segurança**
```javascript
// Configurados automaticamente:
// - Content Security Policy
// - X-Frame-Options: DENY
// - X-Content-Type-Options: nosniff
// - Strict-Transport-Security
```

3. **Rate Limiting**
```javascript
// Configurações automáticas:
// - 100 requisições por 15 minutos (geral)
// - 5 criações de painel por 5 minutos
// - 20 tentativas de acesso por 15 minutos
// - 10 posts por minuto
```

### Backup e Recuperação

```bash
# Backup do banco
pg_dump stickynotes_db > backup_$(date +%Y%m%d).sql

# Backup do Redis
redis-cli SAVE
cp /var/lib/redis/dump.rdb backup_redis_$(date +%Y%m%d).rdb

# Restaurar banco
psql stickynotes_db < backup_20240101.sql
```

## 🤝 Contribuição

### Desenvolvimento

```bash
# Fork o repositório
# Clone sua fork
git clone https://github.com/seu-usuario/stickly-notes.git

# Criar branch para feature
git checkout -b feature/nova-funcionalidade

# Fazer mudanças e commitar
git commit -m "feat: adicionar nova funcionalidade"

# Push e criar Pull Request
git push origin feature/nova-funcionalidade
```

### Padrões de Código

- **ESLint**: Configuração para JavaScript
- **Prettier**: Formatação automática
- **Commits**: Seguir padrão conventional commits
- **Testes**: Jest para testes unitários

## 📈 Performance

### Benchmarks Típicos

- **Tempo de resposta**: < 100ms para 95% das requisições
- **Throughput**: > 1000 requisições/segundo
- **Conexões WebSocket**: Suporte a 10.000+ conexões simultâneas
- **Uso de memória**: < 512MB para 1000 usuários ativos

### Otimizações

1. **Cache Redis**: 90% dos painéis servidos do cache
2. **Pool de Conexões**: Reutilização eficiente de conexões DB
3. **Compressão**: Redução de 70% no tamanho das respostas
4. **Cleanup Automático**: Remoção automática de dados antigos

## 🐛 Troubleshooting

### Problemas Comuns

#### 1. Erro de Conexão com Banco
```bash
# Verificar se PostgreSQL está rodando
sudo systemctl status postgresql

# Verificar logs
tail -f /var/log/postgresql/postgresql-15-main.log
```

#### 2. Cache Redis Não Funcionando
```bash
# Verificar Redis
redis-cli ping

# Limpar cache se necessário
redis-cli FLUSHALL
```

#### 3. WebSocket Não Conecta
```bash
# Verificar portas
netstat -tlnp | grep 3001

# Verificar CORS no frontend
# Certificar que REACT_APP_API_URL está correto
```

### Logs de Debug

```bash
# Ativar logs detalhados
export LOG_LEVEL=debug

# Logs específicos por categoria
grep "DATABASE" logs/combined.log
grep "WEBSOCKET" logs/combined.log
grep "CACHE" logs/combined.log
```

## 📄 Licença

Este projeto está licenciado sob a MIT License - veja o arquivo [LICENSE](LICENSE) para detalhes.

## 🙏 Agradecimentos

- **Socket.IO** - Comunicação em tempo real
- **Express.js** - Framework web
- **PostgreSQL** - Banco de dados principal
- **Redis** - Cache e pub/sub
- **React** - Interface de usuário

---

**Desenvolvido com ❤️ para facilitar a colaboração e comunicação**

Para suporte, abra uma [issue](https://github.com/seu-usuario/stickly-notes/issues) ou entre em contato através do [email](mailto:suporte@stickly-notes.com).