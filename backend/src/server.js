const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');

const config = require('./config/config');
const logger = require('./utils/logger');
const panelService = require('./services/panelService');

class SticklyNotesServer {
  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new Server(this.httpServer, {
      cors: {
        origin: config.FRONTEND_URL,
        methods: ["GET", "POST"],
        credentials: true
      }
    });
  }

  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(cors({
      origin: config.FRONTEND_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
    }));
    this.app.use(compression());

    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100
    });
    this.app.use(limiter);

    this.app.use(express.json({ limit: '1mb' }));
  }

  setupRoutes() {
    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        service: 'Sticky Notes Backend',
        timestamp: new Date().toISOString() 
      });
    });

    // Verificar se painel requer senha
    this.app.get('/api/panels/:code/check', async (req, res) => {
      try {
        const { code } = req.params;
        const result = await panelService.db.query(
          'SELECT password_hash IS NOT NULL as requires_password FROM panels WHERE id = $1',
          [code.toUpperCase()]
        );
        
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Painel não encontrado' });
        }
        
        res.json({ requiresPassword: result.rows[0].requires_password });
      } catch (error) {
        res.status(500).json({ error: 'Erro interno' });
      }
    });

    // Criar painel
    this.app.post('/api/panels', async (req, res) => {
      try {
        const panel = await panelService.createPanel(req.body);
        res.status(201).json(panel);
      } catch (error) {
        logger.error('Erro ao criar painel:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Acessar painel
    this.app.post('/api/panels/:code', async (req, res) => {
      try {
        const { code } = req.params;
        const panel = await panelService.accessPanel(code.toUpperCase(), req.body);
        res.json(panel);
      } catch (error) {
        logger.error('Erro ao acessar painel:', error);
        res.status(400).json({ error: error.message });
      }
    });

    // Buscar posts do painel
    this.app.get('/api/panels/:code/posts', async (req, res) => {
      try {
        const { code } = req.params;
        const posts = await panelService.getPanelPosts(code.toUpperCase());
        res.json(posts);
      } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar posts' });
      }
    });

    // Criar post
    this.app.post('/api/panels/:code/posts', async (req, res) => {
      try {
        const { code } = req.params;
        const post = await panelService.createPost(code.toUpperCase(), req.body);
        
        // Notificar via WebSocket
        this.io.to(`panel:${code.toUpperCase()}`).emit('new-post', post);
        
        res.status(201).json(post);
      } catch (error) {
        logger.error('Erro ao criar post:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Atualizar posição do post
    this.app.patch('/api/posts/:postId/position', async (req, res) => {
      try {
        const { postId } = req.params;
        const post = await panelService.updatePostPosition(postId, req.body);
        
        // Notificar via WebSocket
        this.io.to(`panel:${req.body.panel_id}`).emit('post-moved', post);
        
        res.json(post);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Deletar post
    this.app.delete('/api/posts/:postId', async (req, res) => {
      try {
        const { postId } = req.params;
        const { panel_id } = req.query;
        
        await panelService.deletePost(postId, { panel_id });
        
        // Notificar via WebSocket
        this.io.to(`panel:${panel_id}`).emit('post-deleted', { postId });
        
        res.status(204).send();
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  setupWebSocket() {
    this.io.on('connection', (socket) => {
      logger.info('Socket conectado:', socket.id);

      socket.on('join-panel', (panelId, userName, userId) => {
        socket.join(`panel:${panelId}`);
        socket.to(`panel:${panelId}`).emit('user-joined', { userName, userId });
        logger.info(`Usuário ${userName} entrou no painel ${panelId}`);
      });

      socket.on('leave-panel', (panelId, userName, userId) => {
        socket.leave(`panel:${panelId}`);
        socket.to(`panel:${panelId}`).emit('user-left', { userName, userId });
        logger.info(`Usuário ${userName} saiu do painel ${panelId}`);
      });

      socket.on('disconnect', () => {
        logger.info('Socket desconectado:', socket.id);
      });
    });
  }

  async connectDatabases() {
    try {
      await connectRedis();
      await connectDatabase();
      await panelService.initializeDatabase();
      logger.info('Bancos de dados conectados e inicializados');
    } catch (error) {
      logger.error('Erro ao conectar bancos:', error);
      throw error;
    }
  }

  async start() {
    try {
      await this.connectDatabases();
      this.setupMiddleware();
      this.setupRoutes();
      this.setupWebSocket();

      this.httpServer.listen(config.PORT, () => {
        logger.info(`🚀 Servidor rodando na porta ${config.PORT}`);
        logger.info(`📡 WebSocket habilitado`);
        logger.info(`💾 Redis e PostgreSQL conectados`);
      });
    } catch (error) {
      logger.error('Erro ao iniciar servidor:', error);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  const server = new SticklyNotesServer();
  server.start();
}

module.exports = SticklyNotesServer;