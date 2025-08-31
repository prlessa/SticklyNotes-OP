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

    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: { error: 'Muitas requisições' }
    });
    this.app.use(limiter);

    this.app.use(express.json({ limit: '1mb' }));
  }

  setupRoutes() {
    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        service: 'Stickly Notes Backend',
        timestamp: new Date().toISOString() 
      });
    });

    // Verificar se painel requer senha
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

    // Criar painel
    this.app.post('/api/panels', async (req, res) => {
      try {
        const panel = await this.createPanel(req.body);
        res.status(201).json(panel);
      } catch (error) {
        logger.error('Erro ao criar painel:', error);
        res.status(400).json({ error: error.message });
      }
    });

    // Acessar painel
    this.app.post('/api/panels/:code', async (req, res) => {
      try {
        const { code } = req.params;
        const panel = await this.accessPanel(code.toUpperCase(), req.body);
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
        const posts = await this.getPanelPosts(code.toUpperCase());
        res.json(posts);
      } catch (error) {
        logger.error('Erro ao buscar posts:', error);
        res.status(500).json({ error: 'Erro ao buscar posts' });
      }
    });

    // Criar post
    this.app.post('/api/panels/:code/posts', async (req, res) => {
      try {
        const { code } = req.params;
        const post = await this.createPost(code.toUpperCase(), req.body);
        
        // Notificar via WebSocket
        this.io.to(`panel:${code.toUpperCase()}`).emit('new-post', post);
        
        res.status(201).json(post);
      } catch (error) {
        logger.error('Erro ao criar post:', error);
        res.status(400).json({ error: error.message });
      }
    });

    // Atualizar posição do post
    this.app.patch('/api/posts/:postId/position', async (req, res) => {
      try {
        const { postId } = req.params;
        const post = await this.updatePostPosition(postId, req.body);
        
        // Notificar via WebSocket
        this.io.to(`panel:${req.body.panel_id.toUpperCase()}`).emit('post-moved', post);
        
        res.json(post);
      } catch (error) {
        logger.error('Erro ao atualizar posição:', error);
        res.status(400).json({ error: error.message });
      }
    });

    // Deletar post
    this.app.delete('/api/posts/:postId', async (req, res) => {
      try {
        const { postId } = req.params;
        const { panel_id } = req.query;
        
        await this.deletePost(postId, { panel_id });
        
        // Notificar via WebSocket
        this.io.to(`panel:${panel_id.toUpperCase()}`).emit('post-deleted', { postId });
        
        res.status(204).send();
      } catch (error) {
        logger.error('Erro ao deletar post:', error);
        res.status(400).json({ error: error.message });
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
      logger.info('✅ Bancos de dados conectados e inicializados');
    } catch (error) {
      logger.error('❌ Erro ao conectar bancos:', error);
      throw error;
    }
  }

  // Métodos de negócio (implementação simplificada)
  async createPanel(panelData) {
    const bcrypt = require('bcryptjs');
    const { name, type, password, creator, userId, borderColor, backgroundColor } = panelData;
    
    if (!name || !type || !creator || !userId) {
      throw new Error('Dados obrigatórios não fornecidos');
    }
    
    if (!['friends', 'couple'].includes(type)) {
      throw new Error('Tipo de painel inválido');
    }

    const code = this.generatePanelCode();
    const passwordHash = password ? await bcrypt.hash(password, 12) : null;
    const maxUsers = type === 'couple' ? 2 : 15;
    
    const finalBorderColor = borderColor || (type === 'couple' ? '#FF9292' : '#9EC6F3');
    const finalBackgroundColor = backgroundColor || (type === 'couple' ? '#FFE8E8' : '#FBFBFB');

    const result = await db.query(`
      INSERT INTO panels (
        id, name, type, password_hash, creator, creator_id,
        border_color, background_color, max_users
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, name, type, creator, border_color, background_color, 
                max_users, created_at, last_activity
    `, [
      code, name, type, passwordHash, creator, userId,
      finalBorderColor, finalBackgroundColor, maxUsers
    ]);

    logger.info('Painel criado', { panelId: code, type, creator });
    return result.rows[0];
  }

  async accessPanel(code, accessData) {
    const bcrypt = require('bcryptjs');
    const { password, userName, userId } = accessData;
    
    const result = await db.query(
      'SELECT * FROM panels WHERE id = $1',
      [code]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Painel não encontrado');
    }
    
    const panel = result.rows[0];
    
    if (panel.password_hash && password) {
      const isValid = await bcrypt.compare(password, panel.password_hash);
      if (!isValid) {
        throw new Error('Senha incorreta');
      }
    } else if (panel.password_hash && !password) {
      throw new Error('Senha é obrigatória');
    }
    
    await db.query(
      'UPDATE panels SET last_activity = CURRENT_TIMESTAMP WHERE id = $1',
      [code]
    );
    
    const safePanel = { ...panel };
    delete safePanel.password_hash;
    
    return safePanel;
  }

  async getPanelPosts(panelId) {
    const result = await db.query(
      'SELECT * FROM posts WHERE panel_id = $1 ORDER BY created_at DESC',
      [panelId]
    );
    return result.rows;
  }

  async createPost(panelId, postData) {
    const { content, author_id, author_name, color, position_x, position_y } = postData;
    
    if (!content || !author_id) {
      throw new Error('Conteúdo e autor são obrigatórios');
    }
    
    const finalPositionX = position_x ?? Math.floor(Math.random() * 600) + 50;
    const finalPositionY = position_y ?? Math.floor(Math.random() * 300) + 50;
    const finalColor = color || '#A8D8EA';
    
    const result = await db.query(`
      INSERT INTO posts (
        panel_id, author_name, author_id, content, color, 
        position_x, position_y
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      panelId, 
      author_name || null,
      author_id,
      content,
      finalColor,
      finalPositionX,
      finalPositionY
    ]);
    
    await db.query(
      'UPDATE panels SET last_activity = CURRENT_TIMESTAMP WHERE id = $1',
      [panelId]
    );
    
    return result.rows[0];
  }

  async updatePostPosition(postId, positionData) {
    const { position_x, position_y } = positionData;
    
    const result = await db.query(
      'UPDATE posts SET position_x = $1, position_y = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [position_x, position_y, postId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Post não encontrado');
    }
    
    return result.rows[0];
  }

  async deletePost(postId, params) {
    const result = await db.query(
      'DELETE FROM posts WHERE id = $1 RETURNING *',
      [postId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Post não encontrado');
    }
    
    return result.rows[0];
  }

  generatePanelCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  async start() {
    try {
      // Conectar bancos primeiro
      await this.connectDatabases();
      
      // Configurar aplicação
      this.setupMiddleware();
      this.setupRoutes();
      this.setupWebSocket();

      // Iniciar servidor
      const port = config.server.port || 3001;
      this.httpServer.listen(port, '0.0.0.0', () => {
        logger.info(`🚀 Servidor rodando na porta ${port}`);
        logger.info(`📡 WebSocket habilitado`);
        logger.info(`💾 Bancos conectados`);
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
    this.httpServer.close(() => {
      logger.info('Servidor HTTP fechado');
      process.exit(0);
    });
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