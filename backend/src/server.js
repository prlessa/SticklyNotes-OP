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
// Rota para verificar status dos murais (desenvolvimento)
    this.app.get('/api/admin/panels-status', async (req, res) => {
      try {
        if (config.server.nodeEnv !== 'development') {
          return res.status(403).json({ error: 'Apenas disponível em desenvolvimento' });
        }

        // Estatísticas gerais
        const stats = await db.query(`
          SELECT 
            (SELECT COUNT(*) FROM panels) as total_panels,
            (SELECT COUNT(*) FROM panel_participants) as total_participants,
            (SELECT COUNT(*) FROM active_users) as total_active_users,
            (SELECT COUNT(*) FROM posts) as total_posts
        `);

        // Murais órfãos (candidatos à REGRA 2)
        const orphanPanels = await db.query(`
          SELECT p.id, p.name, p.created_at, p.last_activity,
                 (SELECT COUNT(*) FROM posts WHERE panel_id = p.id) as post_count
          FROM panels p
          WHERE NOT EXISTS (
            SELECT 1 FROM panel_participants pp WHERE pp.panel_id = p.id
          )
          ORDER BY p.created_at DESC
        `);

        // Murais inativos há mais de 25 dias (próximos da REGRA 3)
        const stalePanels = await db.query(`
          SELECT p.id, p.name, p.last_activity,
                 (SELECT COUNT(*) FROM panel_participants WHERE panel_id = p.id) as participant_count,
                 (SELECT COUNT(*) FROM posts WHERE panel_id = p.id) as post_count,
                 EXTRACT(DAYS FROM (NOW() - p.last_activity)) as days_inactive
          FROM panels p
          WHERE p.last_activity < NOW() - INTERVAL '25 days'
          ORDER BY p.last_activity ASC
        `);

        res.json({
          generalStats: stats.rows[0],
          orphanPanels: {
            count: orphanPanels.rows.length,
            panels: orphanPanels.rows
          },
          stalePanels: {
            count: stalePanels.rows.length,
            panels: stalePanels.rows.map(p => ({
              ...p,
              days_inactive: Math.floor(p.days_inactive)
            }))
          },
          rules: {
            rule1: "Usuários inativos removidos de sessões após 15min",
            rule2: "Murais órfãos deletados IMEDIATAMENTE",
            rule3: "Murais inativos há 30+ dias deletados TOTALMENTE"
          }
        });

      } catch (error) {
        console.error('Erro ao obter status:', error);
        res.status(500).json({ error: 'Erro ao obter status' });
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

// Cleanup automático com as 3 regras específicas a cada 10 minutos
      setInterval(async () => {
        try {
          // REGRA 1: Remover usuários inativos de sessões (não afeta vínculos permanentes)
          const inactiveUsersResult = await db.query(`
            DELETE FROM active_users 
            WHERE last_seen < NOW() - INTERVAL '15 minutes'
            RETURNING panel_id, user_id
          `);

          if (inactiveUsersResult.rows.length > 0) {
            logger.info(`Removidos ${inactiveUsersResult.rows.length} usuários de sessões ativas`);
            
            // Notificar via WebSocket
            inactiveUsersResult.rows.forEach(row => {
              this.io.to(`panel:${row.panel_id}`).emit('user-left', { 
                userId: row.user_id 
              });
            });
          }

          // REGRA 2: Deletar murais órfãos IMEDIATAMENTE (sem usuários vinculados)
          const orphanPanelsResult = await db.query(`
            SELECT p.id, p.name, p.created_at,
                   (SELECT COUNT(*) FROM posts WHERE panel_id = p.id) as post_count
            FROM panels p
            WHERE NOT EXISTS (
              SELECT 1 FROM panel_participants pp WHERE pp.panel_id = p.id
            )
          `);

          if (orphanPanelsResult.rows.length > 0) {
            logger.info(`🗑️ REGRA 2: Encontrados ${orphanPanelsResult.rows.length} murais órfãos para deleção IMEDIATA`);

            for (const panel of orphanPanelsResult.rows) {
              try {
                await db.transaction(async (client) => {
                  // Deletar posts
                  const deletedPosts = await client.query('DELETE FROM posts WHERE panel_id = $1 RETURNING id', [panel.id]);
                  
                  // Deletar usuários ativos restantes
                  await client.query('DELETE FROM active_users WHERE panel_id = $1', [panel.id]);
                  
                  // Deletar o painel
                  await client.query('DELETE FROM panels WHERE id = $1', [panel.id]);
                  
                  logger.info(`✅ Mural órfão deletado imediatamente: ${panel.id} (${panel.name}) - ${deletedPosts.rows.length} posts removidos`);
                });

                // Invalidar cache
                if (cache && cache.invalidate) {
                  await cache.invalidate(`panel:${panel.id}`);
                  await cache.invalidate(`posts:${panel.id}`);
                }

              } catch (error) {
                logger.error(`Erro ao deletar mural órfão ${panel.id}:`, error);
              }
            }
          }

          // REGRA 3: Murais com 30+ dias de inatividade - DELETAR TUDO
          const stalePanelsResult = await db.query(`
            SELECT p.id, p.name, p.last_activity,
                   (SELECT COUNT(*) FROM panel_participants WHERE panel_id = p.id) as participant_count,
                   (SELECT COUNT(*) FROM posts WHERE panel_id = p.id) as post_count
            FROM panels p
            WHERE p.last_activity < NOW() - INTERVAL '30 days'
          `);

          if (stalePanelsResult.rows.length > 0) {
            logger.info(`🗑️ REGRA 3: Encontrados ${stalePanelsResult.rows.length} murais inativos há 30+ dias para deleção TOTAL`);

            for (const panel of stalePanelsResult.rows) {
              try {
                await db.transaction(async (client) => {
                  // Remover TODOS os participantes (desvincular usuários)
                  const removedParticipants = await client.query('DELETE FROM panel_participants WHERE panel_id = $1 RETURNING username', [panel.id]);
                  
                  // Deletar posts
                  const deletedPosts = await client.query('DELETE FROM posts WHERE panel_id = $1 RETURNING id', [panel.id]);
                  
                  // Deletar usuários ativos
                  await client.query('DELETE FROM active_users WHERE panel_id = $1', [panel.id]);
                  
                  // Deletar o painel
                  await client.query('DELETE FROM panels WHERE id = $1', [panel.id]);
                  
                  logger.info(`✅ Mural inativo (30+ dias) deletado: ${panel.id} (${panel.name}) - ${removedParticipants.rows.length} usuários desvinculados, ${deletedPosts.rows.length} posts removidos`);
                });

                // Invalidar cache
                if (cache && cache.invalidate) {
                  await cache.invalidate(`panel:${panel.id}`);
                  await cache.invalidate(`posts:${panel.id}`);
                }

              } catch (error) {
                logger.error(`Erro ao deletar mural inativo ${panel.id}:`, error);
              }
            }
          }

          // Log de estatísticas se houve alguma limpeza
          if (inactiveUsersResult.rows.length > 0 || orphanPanelsResult.rows.length > 0 || stalePanelsResult.rows.length > 0) {
            const stats = await db.query(`
              SELECT 
                (SELECT COUNT(*) FROM panels) as total_panels,
                (SELECT COUNT(*) FROM active_users) as total_active_users,
                (SELECT COUNT(*) FROM panel_participants) as total_participants,
                (SELECT COUNT(*) FROM posts) as total_posts
            `);
            
            logger.info('📊 Estatísticas após aplicação das 3 regras:', {
              ...stats.rows[0],
              sessionsRemoved: inactiveUsersResult.rows.length,
              orphanPanelsDeleted: orphanPanelsResult.rows.length,
              stalePanelsDeleted: stalePanelsResult.rows.length
            });
          }

        } catch (error) {
          logger.error('❌ Erro no sistema de limpeza das 3 regras:', error);
        }
      }, 10 * 60 * 1000); // 10 minutos


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