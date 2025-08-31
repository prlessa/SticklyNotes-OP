// Correção para o arquivo backend/src/config/database.js
// Exportação simplificada que funciona com o server.js

const Redis = require('ioredis');
const { Pool } = require('pg');
const config = require('./config');
const logger = require('../utils/logger');

// Pool de conexões PostgreSQL
const pool = new Pool({
  connectionString: config.database.url,
  max: config.database.maxConnections,
  idleTimeoutMillis: config.database.idleTimeout,
  connectionTimeoutMillis: config.database.connectionTimeout
});

// Cliente Redis
let redisClient = null;

/**
 * Conecta ao Redis
 */
async function connectRedis() {
  try {
    redisClient = new Redis(config.redis.url, {
      retryDelayOnFailover: config.redis.retryDelay,
      maxRetriesPerRequest: config.redis.maxRetries,
      lazyConnect: true
    });

    await redisClient.connect();
    logger.info('✅ Redis conectado com sucesso');
  } catch (error) {
    logger.error('❌ Erro ao conectar Redis:', error);
    throw error;
  }
}

/**
 * Conecta ao PostgreSQL e inicializa tabelas
 */
async function connectDatabase() {
  try {
    // Testar conexão
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();

    // Inicializar tabelas
    await initializeTables();
    
    logger.info('✅ PostgreSQL conectado com sucesso');
  } catch (error) {
    logger.error('❌ Erro ao conectar PostgreSQL:', error);
    throw error;
  }
}

/**
 * Inicializa as tabelas do banco
 */
async function initializeTables() {
  try {
    // Tabela de painéis
    await pool.query(`
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
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela de posts
    await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        panel_id VARCHAR(6) REFERENCES panels(id) ON DELETE CASCADE,
        author_name VARCHAR(50),
        author_id VARCHAR(50) NOT NULL,
        content TEXT NOT NULL CHECK (length(content) <= 1000),
        color VARCHAR(7) DEFAULT '#A8D8EA',
        position_x INTEGER DEFAULT 50,
        position_y INTEGER DEFAULT 50,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela de usuários ativos
    await pool.query(`
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

    logger.info('📊 Tabelas inicializadas com sucesso');
  } catch (error) {
    logger.error('Erro ao inicializar tabelas:', error);
    throw error;
  }
}

// Exportar objetos de banco
const db = {
  query: (text, params) => pool.query(text, params),
  transaction: async (callback) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
};

const cache = {
  get: (key) => redisClient ? redisClient.get(key) : null,
  set: (key, value, ttl) => redisClient ? redisClient.setex(key, ttl, value) : null,
  del: (key) => redisClient ? redisClient.del(key) : null
};

module.exports = {
  db,
  cache,
  connectRedis,
  connectDatabase,
  pool,
  redisClient: () => redisClient
};