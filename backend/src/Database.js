/**
 * Camada de banco de dados otimizada para Stickly Notes
 * Gerencia conexões com PostgreSQL e Redis com pool de conexões e cache inteligente
 */

const Redis = require('ioredis');
const { Pool } = require('pg');
const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * Classe para gerenciamento do banco PostgreSQL
 */
class DatabaseManager {
  constructor() {
    this.pool = null;
    this.isConnected = false;
  }

  /**
   * Conecta ao banco PostgreSQL com configurações otimizadas
   * @returns {Promise<Pool>} Pool de conexões
   */
  async connect() {
    try {
      this.pool = new Pool({
        connectionString: config.database.url,
        max: config.database.maxConnections,
        idleTimeoutMillis: config.database.idleTimeout,
        connectionTimeoutMillis: config.database.connectionTimeout,
        
        // Configurações de performance
        application_name: 'stickly_notes',
        query_timeout: 10000,
        statement_timeout: 10000,
        
        // SSL em produção
        ssl: config.server.nodeEnv === 'production' ? {
          rejectUnauthorized: false
        } : false
      });

      // Eventos do pool
      this.pool.on('connect', (client) => {
        logger.database('Nova conexão estabelecida', { 
          totalCount: this.pool.totalCount,
          idleCount: this.pool.idleCount 
        });
      });

      this.pool.on('error', (err) => {
        logger.error('Erro no pool PostgreSQL:', err);
      });

      // Testar conexão
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.isConnected = true;
      logger.info('✅ PostgreSQL conectado com sucesso');
      
      return this.pool;
    } catch (error) {
      logger.error('❌ Erro ao conectar PostgreSQL:', error);
      throw error;
    }
  }

  /**
   * Executa query com tratamento de erro e logging
   * @param {string} text - Query SQL
   * @param {Array} params - Parâmetros da query
   * @returns {Promise<object>} Resultado da query
   */
  async query(text, params = []) {
    const start = Date.now();
    
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      logger.database('Query executada', {
        duration: `${duration}ms`,
        rows: result.rowCount,
        command: text.split(' ')[0].toUpperCase()
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      
      logger.error('Erro na query:', {
        error: error.message,
        duration: `${duration}ms`,
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        params: params.length
      });
      
      throw error;
    }
  }

  /**
   * Executa transação com rollback automático em caso de erro
   * @param {function} callback - Função que executa as queries da transação
   * @returns {Promise<any>} Resultado da transação
   */
  async transaction(callback) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      
      logger.database('Transação completada com sucesso');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transação revertida:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Inicializa as tabelas do banco com índices otimizados
   * @returns {Promise<void>}
   */
  async initializeTables() {
    try {
      // Tabela de painéis
      await this.query(`
        CREATE TABLE IF NOT EXISTS panels (
          id VARCHAR(6) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          type VARCHAR(10) NOT NULL CHECK (type IN ('friends', 'couple')),
          password_hash VARCHAR(255),
          creator VARCHAR(50) NOT NULL,
          creator_id VARCHAR(50) NOT NULL,
          border_color VARCHAR(7) DEFAULT '#9EC6F3',
          background_color VARCHAR(7) DEFAULT '#FBFBFB',
          max_users INTEGER DEFAULT 15,
          post_count INTEGER DEFAULT 0,
          active_users INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          -- Índices
          CONSTRAINT valid_colors CHECK (
            border_color ~ '^#[0-9A-Fa-f]{6}$' AND 
            background_color ~ '^#[0-9A-Fa-f]{6}$'
          )
        )
      `);

      // Tabela de posts
      await this.query(`
        CREATE TABLE IF NOT EXISTS posts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          panel_id VARCHAR(6) REFERENCES panels(id) ON DELETE CASCADE,
          author_name VARCHAR(50),
          author_id VARCHAR(50) NOT NULL,
          content TEXT NOT NULL CHECK (length(content) <= 1000),
          color VARCHAR(7) DEFAULT '#A8D8EA',
          position_x INTEGER DEFAULT 50 CHECK (position_x >= 0 AND position_x <= 2000),
          position_y INTEGER DEFAULT 50 CHECK (position_y >= 0 AND position_y <= 2000),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          -- Índices
          CONSTRAINT valid_post_color CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
        )
      `);

      // Tabela de usuários ativos
      await this.query(`
        CREATE TABLE IF NOT EXISTS active_users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          panel_id VARCHAR(6) REFERENCES panels(id) ON DELETE CASCADE,
          user_id VARCHAR(50) NOT NULL,
          username VARCHAR(50) NOT NULL,
          joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          UNIQUE(panel_id, user_id)
        )
      `);

      // Tabela de participantes permanentes
      await this.query(`
        CREATE TABLE IF NOT EXISTS panel_participants (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          panel_id VARCHAR(6) REFERENCES panels(id) ON DELETE CASCADE,
          user_id VARCHAR(50) NOT NULL,
          username VARCHAR(50) NOT NULL,
          joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_access TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          UNIQUE(panel_id, user_id)
        )
      `);

      // Criar índices para performance
      await this.createIndexes();

      // Criar triggers para manter contadores atualizados
      await this.createTriggers();

      logger.info('📊 Tabelas inicializadas com sucesso');
    } catch (error) {
      logger.error('Erro ao inicializar tabelas:', error);
      throw error;
    }
  }

  /**
   * Cria índices para otimização de performance
   * @returns {Promise<void>}
   */
  async createIndexes() {
    const indexes = [
      // Índices para panels
      'CREATE INDEX IF NOT EXISTS idx_panels_type ON panels(type)',
      'CREATE INDEX IF NOT EXISTS idx_panels_creator_id ON panels(creator_id)',
      'CREATE INDEX IF NOT EXISTS idx_panels_last_activity ON panels(last_activity)',
      
      // Índices para posts
      'CREATE INDEX IF NOT EXISTS idx_posts_panel_id ON posts(panel_id)',
      'CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id)',
      'CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at)',
      
      // Índices para active_users
      'CREATE INDEX IF NOT EXISTS idx_active_users_panel_id ON active_users(panel_id)',
      'CREATE INDEX IF NOT EXISTS idx_active_users_last_seen ON active_users(last_seen)',
      
      // Índices para panel_participants
      'CREATE INDEX IF NOT EXISTS idx_participants_user_id ON panel_participants(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_participants_last_access ON panel_participants(last_access)'
    ];

    for (const indexQuery of indexes) {
      try {
        await this.query(indexQuery);
      } catch (error) {
        if (!error.message.includes('already exists')) {
          logger.error(`Erro ao criar índice: ${indexQuery}`, error);
        }
      }
    }

    logger.database('Índices criados/verificados');
  }

  /**
   * Cria triggers para manter contadores automaticamente
   * @returns {Promise<void>}
   */
  async createTriggers() {
    try {
      // Trigger para atualizar contador de posts
      await this.query(`
        CREATE OR REPLACE FUNCTION update_panel_post_count()
        RETURNS TRIGGER AS $$
        BEGIN
          IF TG_OP = 'INSERT' THEN
            UPDATE panels SET post_count = post_count + 1 WHERE id = NEW.panel_id;
            RETURN NEW;
          ELSIF TG_OP = 'DELETE' THEN
            UPDATE panels SET post_count = post_count - 1 WHERE id = OLD.panel_id;
            RETURN OLD;
          END IF;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await this.query(`
        DROP TRIGGER IF EXISTS trigger_update_post_count ON posts;
        CREATE TRIGGER trigger_update_post_count
          AFTER INSERT OR DELETE ON posts
          FOR EACH ROW EXECUTE FUNCTION update_panel_post_count();
      `);

      // Trigger para atualizar timestamp de updated_at
      await this.query(`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await this.query(`
        DROP TRIGGER IF EXISTS trigger_update_posts_updated_at ON posts;
        CREATE TRIGGER trigger_update_posts_updated_at
          BEFORE UPDATE ON posts
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      `);

      logger.database('Triggers criados');
    } catch (error) {
      logger.error('Erro ao criar triggers:', error);
    }
  }

  /**
   * Limpa dados antigos e otimiza performance
   * @returns {Promise<void>}
   */
  async cleanup() {
    try {
      // Remover usuários inativos há mais de 30 minutos
      await this.query(`
        DELETE FROM active_users 
        WHERE last_seen < NOW() - INTERVAL '30 minutes'
      `);

      // Atualizar contador de usuários ativos
      await this.query(`
        UPDATE panels SET active_users = (
          SELECT COUNT(*) FROM active_users 
          WHERE active_users.panel_id = panels.id
        )
      `);

      // Remover painéis abandonados (sem atividade há mais de 30 dias)
      const result = await this.query(`
        DELETE FROM panels 
        WHERE last_activity < NOW() - INTERVAL '30 days'
        RETURNING id
      `);

      if (result.rowCount > 0) {
        logger.info(`Removidos ${result.rowCount} painéis abandonados`);
      }

      logger.database('Cleanup executado');
    } catch (error) {
      logger.error('Erro no cleanup:', error);
    }
  }

  /**
   * Obtém estatísticas do banco
   * @returns {Promise<object>} Estatísticas
   */
  async getStats() {
    try {
      const stats = await this.query(`
        SELECT 
          (SELECT COUNT(*) FROM panels) as total_panels,
          (SELECT COUNT(*) FROM posts) as total_posts,
          (SELECT COUNT(*) FROM active_users) as active_users,
          (SELECT COUNT(DISTINCT user_id) FROM panel_participants) as total_users
      `);

      return stats.rows[0];
    } catch (error) {
      logger.error('Erro ao obter estatísticas:', error);
      return {};
    }
  }

  /**
   * Fecha conexões gracefully
   * @returns {Promise<void>}
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      logger.info('PostgreSQL desconectado');
    }
  }
}

/**
 * Classe para gerenciamento do Redis (Cache)
 */
class CacheManager {
  constructor() {
    this.client = null;
    this.subscriber = null;
    this.isConnected = false;
  }

  /**
   * Conecta ao Redis
   * @returns {Promise<void>}
   */
  async connect() {
    try {
      // Cliente principal para operações
      this.client = new Redis(config.redis.url, {
        retryDelayOnFailover: config.redis.retryDelay,
        maxRetriesPerRequest: config.redis.maxRetries,
        lazyConnect: true,
        reconnectOnError: (err) => {
          const targetError = 'READONLY';
          return err.message.includes(targetError);
        }
      });

      // Cliente para pub/sub
      this.subscriber = new Redis(config.redis.url, {
        retryDelayOnFailover: config.redis.retryDelay,
        maxRetriesPerRequest: config.redis.maxRetries,
        lazyConnect: true
      });

      // Eventos
      this.client.on('connect', () => {
        logger.cache('Redis conectado');
      });

      this.client.on('error', (err) => {
        logger.error('Erro no Redis:', err);
      });

      await this.client.connect();
      await this.subscriber.connect();

      this.isConnected = true;
      logger.info('✅ Redis conectado com sucesso');
    } catch (error) {
      logger.error('❌ Erro ao conectar Redis:', error);
      throw error;
    }
  }

  /**
   * Cache de painel com TTL
   * @param {string} panelId - ID do painel
   * @param {object} data - Dados do painel
   * @returns {Promise<void>}
   */
  async cachePanel(panelId, data) {
    try {
      await this.client.setex(
        `panel:${panelId}`, 
        config.cache.panelTtl, 
        JSON.stringify(data)
      );
      logger.cache(`Painel ${panelId} cacheado`);
    } catch (error) {
      logger.error('Erro ao cachear painel:', error);
    }
  }

  /**
   * Recupera painel do cache
   * @param {string} panelId - ID do painel
   * @returns {Promise<object|null>} Dados do painel ou null
   */
  async getCachedPanel(panelId) {
    try {
      const cached = await this.client.get(`panel:${panelId}`);
      if (cached) {
        logger.cache(`Cache hit: painel ${panelId}`);
        return JSON.parse(cached);
      }
      logger.cache(`Cache miss: painel ${panelId}`);
      return null;
    } catch (error) {
      logger.error('Erro ao recuperar painel do cache:', error);
      return null;
    }
  }

  /**
   * Cache de posts com TTL menor (dados mais dinâmicos)
   * @param {string} panelId - ID do painel
   * @param {Array} posts - Array de posts
   * @returns {Promise<void>}
   */
  async cachePosts(panelId, posts) {
    try {
      await this.client.setex(
        `posts:${panelId}`, 
        config.cache.postsTtl, 
        JSON.stringify(posts)
      );
      logger.cache(`Posts do painel ${panelId} cacheados (${posts.length} posts)`);
    } catch (error) {
      logger.error('Erro ao cachear posts:', error);
    }
  }

  /**
   * Recupera posts do cache
   * @param {string} panelId - ID do painel
   * @returns {Promise<Array|null>} Array de posts ou null
   */
  async getCachedPosts(panelId) {
    try {
      const cached = await this.client.get(`posts:${panelId}`);
      if (cached) {
        const posts = JSON.parse(cached);
        logger.cache(`Cache hit: posts do painel ${panelId} (${posts.length} posts)`);
        return posts;
      }
      logger.cache(`Cache miss: posts do painel ${panelId}`);
      return null;
    } catch (error) {
      logger.error('Erro ao recuperar posts do cache:', error);
      return null;
    }
  }

  /**
   * Invalida cache específico
   * @param {string} key - Chave do cache
   * @returns {Promise<void>}
   */
  async invalidate(key) {
    try {
      await this.client.del(key);
      logger.cache(`Cache invalidado: ${key}`);
    } catch (error) {
      logger.error('Erro ao invalidar cache:', error);
    }
  }

  /**
   * Invalida todos os caches relacionados a um painel
   * @param {string} panelId - ID do painel
   * @returns {Promise<void>}
   */
  async invalidatePanelCache(panelId) {
    await Promise.all([
      this.invalidate(`panel:${panelId}`),
      this.invalidate(`posts:${panelId}`)
    ]);
  }

  /**
   * Publish de eventos para sincronização
   * @param {string} channel - Canal
   * @param {object} data - Dados do evento
   * @returns {Promise<void>}
   */
  async publish(channel, data) {
    try {
      await this.client.publish(channel, JSON.stringify(data));
      logger.cache(`Evento publicado no canal ${channel}`);
    } catch (error) {
      logger.error('Erro ao publicar evento:', error);
    }
  }

  /**
   * Subscribe para eventos
   * @param {string} pattern - Padrão do canal
   * @param {function} callback - Callback para processar eventos
   * @returns {Promise<void>}
   */
  async subscribe(pattern, callback) {
    try {
      await this.subscriber.psubscribe(pattern);
      this.subscriber.on('pmessage', callback);
      logger.cache(`Subscrito ao padrão: ${pattern}`);
    } catch (error) {
      logger.error('Erro ao fazer subscribe:', error);
    }
  }

  /**
   * Fecha conexões Redis
   * @returns {Promise<void>}
   */
  async close() {
    if (this.client) {
      await this.client.quit();
    }
    if (this.subscriber) {
      await this.subscriber.quit();
    }
    this.isConnected = false;
    logger.info('Redis desconectado');
  }

  /**
   * Obtém estatísticas do Redis
   * @returns {Promise<object>} Estatísticas
   */
  async getStats() {
    try {
      const info = await this.client.info('memory');
      const keyspace = await this.client.info('keyspace');
      
      return {
        memory: info,
        keyspace: keyspace
      };
    } catch (error) {
      logger.error('Erro ao obter estatísticas do Redis:', error);
      return {};
    }
  }
}

// Instâncias globais
const db = new DatabaseManager();
const cache = new CacheManager();

/**
 * Inicializa todas as conexões de banco
 * @returns {Promise<void>}
 */
async function initializeDatabase() {
  try {
    await db.connect();
    await cache.connect();
    await db.initializeTables();
    
    // Configurar cleanup automático a cada hora
    setInterval(() => {
      db.cleanup().catch(err => 
        logger.error('Erro no cleanup automático:', err)
      );
    }, 60 * 60 * 1000); // 1 hora
    
    logger.info('💾 Sistema de banco inicializado completamente');
  } catch (error) {
    logger.error('Falha na inicialização do banco:', error);
    throw error;
  }
}

/**
 * Graceful shutdown de todas as conexões
 * @returns {Promise<void>}
 */
async function closeConnections() {
  try {
    await Promise.all([
      db.close(),
      cache.close()
    ]);
    logger.info('Todas as conexões de banco fechadas');
  } catch (error) {
    logger.error('Erro ao fechar conexões:', error);
  }
}

/**
 * Health check do sistema de banco
 * @returns {Promise<object>} Status de saúde
 */
async function healthCheck() {
  const health = {
    postgres: false,
    redis: false,
    timestamp: new Date().toISOString()
  };

  try {
    // Testar PostgreSQL
    await db.query('SELECT 1');
    health.postgres = true;
  } catch (error) {
    logger.error('PostgreSQL health check falhou:', error);
  }

  try {
    // Testar Redis
    await cache.client.ping();
    health.redis = true;
  } catch (error) {
    logger.error('Redis health check falhou:', error);
  }

  return health;
}

module.exports = {
  db,
  cache,
  initializeDatabase,
  closeConnections,
  healthCheck
};