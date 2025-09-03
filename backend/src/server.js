const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');

const config = require('./config/config');
const logger = require('./utils/logger');
const { db, cache, connectDatabase, connectRedis } = require('./config/database');

// Importar rotas
const { router: authRoutes, authenticateToken } = require('./routes/authRoutes');
const panelRoutes = require('./routes/panelRoutes');
const postRoutes = require('./routes/postRoutes');
const userRoutes = require('./routes/userRoutes');

class SticklyNotesServer {
  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new Server(this.httpServer, {
      cors: {
        origin: config.frontendUrl,
        methods: ["GET", "POST"],
        credentials: true
      }
    });
  }

  setupMiddleware() {
    // Helmet com configuração mais permissiva para desenvolvimento
    this.app.use(helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    }));
    
    this.app.use(cors({
      origin: config.server.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
    }));
    
    this.app.use(compression());

    // Rate limiting geral
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: { error: 'Muitas requisições' }
    });
    this.app.use(limiter);

    this.app.use(express.json({ limit: '1mb' }));
    
    // Logging de requisições
    this.app.use(logger.httpMiddleware);
  }

  setupRoutes() {
    // Health check DEVE vir primeiro
    this.app.get('/api/health', async (req, res) => {
      try {
        await db.query('SELECT 1');
        const redisStatus = cache ? await cache.get('test') !== undefined : false;
        
        res.json({ 
          status: 'healthy', 
          service: 'Stickly Notes Backend',
          timestamp: new Date().toISOString(),
          port: process.env.PORT || 'not-set',
          railway_domain: process.env.RAILWAY_PUBLIC_DOMAIN || 'not-set',
          checks: {
            postgres: true,
            redis: redisStatus
          }
        });
      } catch (error) {
        logger.error('Health check failed:', error);
        res.status(500).json({
          status: 'unhealthy',
          service: 'Stickly Notes Backend',
          error: error.message
        });
      }
    });

    // Servir arquivos estáticos do frontend (em produção)
    if (config.server.nodeEnv === 'production') {
  const path = require('path');
  
  // Servir arquivos estáticos
  this.app.use(express.static(path.join(__dirname, '../public')));
  logger.info('📁 Servindo frontend estático');
  
  // IMPORTANTE: Configurar SPA routing APÓS as rotas da API
  // mas ANTES do middleware de erro 404
  this.app.get('*', (req, res, next) => {
    // Se for rota da API, continuar para próximo middleware
    if (req.path.startsWith('/api/')) {
      return next();
    }
    
    // Para qualquer outra rota, servir o index.html (SPA routing)
    console.log('🌐 SPA Route:', req.path);
    res.sendFile(path.join(__dirname, '../public/index.html'), (err) => {
      if (err) {
        console.error('❌ Erro ao servir index.html:', err);
        res.status(500).send('Erro interno do servidor');
      }
    });
  });

  // Rotas protegidas (requerem autenticação)
this.app.use('/api/panels', panelRoutes);
this.app.use('/api/posts', postRoutes);
this.app.use('/api/users', userRoutes);

// ADICIONAR ESTE DEBUG:
console.log('🛣️ Verificando rotas registradas:');
this.app._router.stack.forEach((middleware, index) => {
  if (middleware.route) {
    // Rota direta
    const methods = Object.keys(middleware.route.methods).join(', ').toUpperCase();
    console.log(`  ${index}. ${methods} ${middleware.route.path}`);
  } else if (middleware.name === 'router') {
    // Router middleware
    console.log(`  ${index}. ROUTER ${middleware.regexp}`);
    if (middleware.handle && middleware.handle.stack) {
      middleware.handle.stack.forEach((layer, subIndex) => {
        if (layer.route) {
          const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
          console.log(`    ${index}.${subIndex} ${methods} ${layer.route.path}`);
        }
      });
    }
  }
});
}

    // Rota pública para verificar se painel requer senha (ANTES das rotas protegidas)
    this.app.get('/api/panels/:code/check', async (req, res) => {
      try {
        const { code } = req.params;
        const result = await db.query(
          'SELECT password_hash IS NOT NULL as requires_password FROM panels WHERE id = $1',
          [code.toUpperCase()]
        );
        
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Painel não encontrado' });
        }
        
        res.json({ requiresPassword: result.rows[0].requires_password });
      } catch (error) {
        logger.error('Erro ao verificar painel:', error);
        res.status(500).json({ error: 'Erro interno' });
      }
    });

    // Rotas de autenticação (públicas)
    this.app.use('/api/auth', authRoutes);
    
    // Rotas protegidas (requerem autenticação)
    this.app.use('/api/panels', panelRoutes);
    this.app.use('/api/posts', postRoutes);
    this.app.use('/api/users', userRoutes);

    // Middleware para capturar rotas não encontradas
    this.app.use('/api/*', (req, res) => {
      res.status(404).json({
        error: 'Rota não encontrada',
        path: req.originalUrl
      });
    });

    // Middleware global de tratamento de erros
    this.app.use((error, req, res, next) => {
      logger.error('Erro não tratado:', {
        error: error.message,
        stack: error.stack,
        method: req.method,
        url: req.url
      });

      res.status(500).json({
        error: 'Erro interno do servidor'
      });
    });
  }

  setupWebSocket() {
    this.io.on('connection', (socket) => {
      logger.websocket('Socket conectado', { socketId: socket.id });
      
      socket.on('new-post-created', (postData) => {
        // Retransmitir novo post para todos no painel
        socket.to(`panel:${postData.panel_id}`).emit('new-post', postData);
      });

      socket.on('post-position-updated', (postData) => {
        // Retransmitir movimento para todos no painel
        socket.to(`panel:${postData.panel_id}`).emit('post-moved', postData);
      });

      socket.on('post-deleted', (data) => {
        // Retransmitir deleção para todos no painel
        socket.to(`panel:${data.panel_id}`).emit('post-deleted', data);
      });

      // Join em um painel específico
      socket.on('join-panel', async (panelId, userName, userId) => {
        try {
          socket.join(`panel:${panelId}`);
          socket.panelId = panelId;
          socket.userName = userName;
          socket.userId = userId;

          // Notificar outros usuários
          socket.to(`panel:${panelId}`).emit('user-joined', { userName, userId });
          
          // Registrar usuário como ativo no banco
          await db.query(`
            INSERT INTO active_users (panel_id, user_id, username, user_uuid)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (panel_id, user_uuid)
            DO UPDATE SET 
              username = $3,
              last_seen = CURRENT_TIMESTAMP
          `, [panelId, `user_${userId}`, userName, userId]);

          logger.websocket('Usuário entrou no painel', { 
            panelId, 
            userName, 
            userId,
            socketId: socket.id 
          });
        } catch (error) {
          logger.error('Erro ao entrar no painel via WebSocket:', error);
          socket.emit('error', { message: 'Erro ao entrar no painel' });
        }
      });

      // Leave de um painel
      socket.on('leave-panel', async (panelId, userName, userId) => {
        try {
          socket.leave(`panel:${panelId}`);
          socket.to(`panel:${panelId}`).emit('user-left', { userName, userId });
          
          // Remover usuário da lista de ativos
          await db.query(
            'DELETE FROM active_users WHERE panel_id = $1 AND user_uuid = $2',
            [panelId, userId]
          );

          logger.websocket('Usuário saiu do painel', { 
            panelId, 
            userName, 
            userId,
            socketId: socket.id 
          });
        } catch (error) {
          logger.error('Erro ao sair do painel via WebSocket:', error);
        }
      });

      // Disconnect
      socket.on('disconnect', async () => {
        try {
          if (socket.panelId && socket.userId) {
            // Notificar outros usuários
            socket.to(`panel:${socket.panelId}`).emit('user-left', { 
              userName: socket.userName, 
              userId: socket.userId 
            });

            // Remover da lista de ativos
            await db.query(
              'DELETE FROM active_users WHERE panel_id = $1 AND user_uuid = $2',
              [socket.panelId, socket.userId]
            );
          }

          logger.websocket('Socket desconectado', { 
            socketId: socket.id,
            panelId: socket.panelId,
            userId: socket.userId
          });
        } catch (error) {
          logger.error('Erro no disconnect do WebSocket:', error);
        }
      });

      // Heartbeat para manter conexão ativa
      socket.on('heartbeat', async () => {
        if (socket.panelId && socket.userId) {
          try {
            await db.query(
              'UPDATE active_users SET last_seen = CURRENT_TIMESTAMP WHERE panel_id = $1 AND user_uuid = $2',
              [socket.panelId, socket.userId]
            );
          } catch (error) {
            logger.error('Erro no heartbeat:', error);
          }
        }
      });
    });

    // Salvar referência do io para uso nas rotas
    this.app.set('io', this.io);
  }

  async connectDatabases() {
    try {
      await connectRedis();
      await connectDatabase();
      logger.info('✅ Bancos de dados conectados e inicializados');
    } catch (error) {
      logger.error('❌ Erro ao conectar bancos:', error);
      throw error;
    }
  }

  async start() {
    try {
      // Conectar bancos primeiro
      await this.connectDatabases();
      
      // Configurar aplicação
      this.setupMiddleware();
      this.setupRoutes();
      this.setupWebSocket();

      // Cleanup automático de usuários inativos a cada 5 minutos
      setInterval(async () => {
        try {
          const result = await db.query(`
            DELETE FROM active_users 
            WHERE last_seen < NOW() - INTERVAL '10 minutes'
            RETURNING panel_id, user_id
          `);

          if (result.rows.length > 0) {
            logger.info(`Removidos ${result.rows.length} usuários inativos automaticamente`);
            
            // Notificar via WebSocket sobre usuários que saíram
            result.rows.forEach(row => {
              this.io.to(`panel:${row.panel_id}`).emit('user-left', { 
                userId: row.user_id 
              });
            });
          }
        } catch (error) {
          logger.error('Erro no cleanup automático:', error);
        }
      }, 5 * 60 * 1000); // 5 minutos

      // *** CORREÇÃO CRÍTICA PARA RAILWAY ***
      // Railway sempre define process.env.PORT
      const port = process.env.PORT || config.server.port || 3001;
      
      // DEVE escutar em 0.0.0.0 para Railway funcionar
      this.httpServer.listen(port, '0.0.0.0', () => {
        logger.info(`🚀 Servidor rodando na porta ${port}`);
        logger.info(`📡 WebSocket habilitado`);
        logger.info(`💾 Bancos conectados`);
        logger.info(`🔐 Autenticação JWT ativada`);
        
        // LOGS ESPECÍFICOS PARA RAILWAY
        if (process.env.RAILWAY_PUBLIC_DOMAIN) {
          logger.info(`🌐 Railway Domain: https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
        }
        if (process.env.PORT) {
          logger.info(`🚢 Railway Port: ${process.env.PORT}`);
        }
        if (process.env.DATABASE_URL) {
          logger.info(`🗄️  Database: CONECTADO`);
        }
        if (process.env.REDIS_URL) {
          logger.info(`🔴 Redis: CONECTADO`);
        }
        
        if (config.server.nodeEnv === 'development') {
          logger.info(`🌐 Frontend URL: ${config.frontendUrl}`);
          logger.info(`🔍 Health check: http://localhost:${port}/api/health`);
        } else {
          // Em produção Railway
          logger.info(`🔍 Health check: http://0.0.0.0:${port}/api/health`);
          logger.info(`🌍 CORS Origins: ${JSON.stringify(config.server.corsOrigins)}`);
          logger.info(`📁 Servindo frontend estático: ${config.server.nodeEnv === 'production'}`);
        }
      });

      // Graceful shutdown
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());
      
    } catch (error) {
      logger.error('Erro ao iniciar servidor:', error);
      process.exit(1);
    }
  }

  async shutdown() {
    logger.info('Iniciando shutdown graceful...');
    
    // Fechar conexões WebSocket
    this.io.close();
    
    // Fechar servidor HTTP
    this.httpServer.close(async () => {
      try {
        // Fechar conexões de banco
        if (db && db.close) {
          await db.close();
        }
        if (cache && cache.close) {
          await cache.close();
        }
        
        logger.info('Servidor fechado graciosamente');
        process.exit(0);
      } catch (error) {
        logger.error('Erro durante shutdown:', error);
        process.exit(1);
      }
    });

    // Forçar fechamento após 10 segundos
    setTimeout(() => {
      logger.error('Forçando fechamento do servidor...');
      process.exit(1);
    }, 10000);
  }
}

// Iniciar servidor se este arquivo for executado diretamente
if (require.main === module) {
  const server = new SticklyNotesServer();
  server.start().catch(error => {
    logger.error('Erro fatal ao iniciar:', error);
    process.exit(1);
  });
}

module.exports = SticklyNotesServer;