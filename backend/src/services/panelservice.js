const bcrypt = require('bcryptjs');
const config = require('../config/config');
const logger = require('../utils/logger');
const { getDatabasePool, getRedisClient } = require('../config/database');

class PanelService {
  constructor() {
    this.db = getDatabasePool();
    this.redis = getRedisClient();
  }

  async initializeDatabase() {
    try {
      // Criar tabelas
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS panels (
          id VARCHAR(10) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          type VARCHAR(20) NOT NULL CHECK (type IN ('friends', 'couple')),
          password_hash VARCHAR(255),
          creator VARCHAR(100) NOT NULL,
          border_color VARCHAR(7) DEFAULT '#9EC6F3',
          background_color VARCHAR(7) DEFAULT '#FBFBFB',
          max_users INTEGER DEFAULT 15,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS posts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          panel_id VARCHAR(10) REFERENCES panels(id) ON DELETE CASCADE,
          author_name VARCHAR(100),
          author_id VARCHAR(50),
          content TEXT NOT NULL,
          color VARCHAR(7) DEFAULT '#A8D8EA',
          position_x INTEGER DEFAULT 50,
          position_y INTEGER DEFAULT 50,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS active_users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          panel_id VARCHAR(10) REFERENCES panels(id) ON DELETE CASCADE,
          user_id VARCHAR(50) NOT NULL,
          name VARCHAR(100) NOT NULL,
          joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(panel_id, user_id)
        )
      `);

      logger.info('Database inicializado com sucesso');
    } catch (error) {
      logger.error('Erro ao inicializar database:', error);
      throw error;
    }
  }

  generatePanelCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async createPanel(panelData) {
    const { name, type, password, creator, userId, borderColor, backgroundColor } = panelData;
    
    try {
      // Gerar código único
      let code;
      let exists = true;
      let attempts = 0;
      
      while (exists && attempts < 10) {
        code = this.generatePanelCode();
        const check = await this.db.query('SELECT id FROM panels WHERE id = $1', [code]);
        exists = check.rows.length > 0;
        attempts++;
      }

      const passwordHash = password ? await bcrypt.hash(password, config.BCRYPT_ROUNDS) : null;
      const maxUsers = type === 'couple' ? 2 : 15;

      const result = await this.db.query(
        `INSERT INTO panels (id, name, type, password_hash, creator, border_color, background_color, max_users) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [code, name, type, passwordHash, creator, borderColor || '#9EC6F3', backgroundColor || '#FBFBFB', maxUsers]
      );

      const panel = result.rows[0];
      delete panel.password_hash;

      // Cache do painel
      await this.redis.setex(`panel:${code}`, 3600, JSON.stringify(panel));

      logger.info('Painel criado:', { panelId: code, type, creator });
      return panel;
    } catch (error) {
      logger.error('Erro ao criar painel:', error);
      throw error;
    }
  }

  async accessPanel(panelId, { password, userName, userId }) {
    try {
      const result = await this.db.query('SELECT * FROM panels WHERE id = $1', [panelId]);
      
      if (result.rows.length === 0) {
        throw new Error('Painel não encontrado');
      }

      const panel = result.rows[0];

      if (panel.password_hash && password) {
        const passwordMatch = await bcrypt.compare(password, panel.password_hash);
        if (!passwordMatch) {
          throw new Error('Senha incorreta');
        }
      }

      delete panel.password_hash;
      return panel;
    } catch (error) {
      logger.error('Erro ao acessar painel:', error);
      throw error;
    }
  }

  async getPanelPosts(panelId) {
    try {
      const cached = await this.redis.get(`posts:${panelId}`);
      if (cached) {
        return JSON.parse(cached);
      }
      
      const result = await this.db.query(
        'SELECT * FROM posts WHERE panel_id = $1 ORDER BY created_at DESC',
        [panelId]
      );
      
      await this.redis.setex(`posts:${panelId}`, 300, JSON.stringify(result.rows));
      return result.rows;
    } catch (error) {
      logger.error('Erro ao buscar posts:', error);
      return [];
    }
  }

  async createPost(panelId, postData) {
    const { author_name, author_id, content, color, position_x = 50, position_y = 50 } = postData;
    
    try {
      const result = await this.db.query(
        `INSERT INTO posts (panel_id, author_name, author_id, content, color, position_x, position_y) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [panelId, author_name, author_id, content, color || '#A8D8EA', position_x, position_y]
      );

      const post = result.rows[0];
      
      // Invalidar cache
      await this.redis.del(`posts:${panelId}`);

      logger.info('Post criado:', { panelId, postId: post.id, authorId: author_id });
      return post;
    } catch (error) {
      logger.error('Erro ao criar post:', error);
      throw error;
    }
  }

  async updatePostPosition(postId, { position_x, position_y, panel_id }) {
    try {
      const result = await this.db.query(
        'UPDATE posts SET position_x = $1, position_y = $2 WHERE id = $3 RETURNING *',
        [position_x, position_y, postId]
      );

      if (result.rows.length === 0) {
        throw new Error('Post não encontrado');
      }

      // Invalidar cache
      await this.redis.del(`posts:${panel_id}`);

      return result.rows[0];
    } catch (error) {
      logger.error('Erro ao atualizar posição:', error);
      throw error;
    }
  }

  async deletePost(postId, { panel_id }) {
    try {
      await this.db.query('DELETE FROM posts WHERE id = $1', [postId]);
      
      // Invalidar cache
      await this.redis.del(`posts:${panel_id}`);

      logger.info('Post deletado:', { postId, panelId: panel_id });
    } catch (error) {
      logger.error('Erro ao deletar post:', error);
      throw error;
    }
  }
}

module.exports = new PanelService();