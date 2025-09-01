const Redis = require('ioredis');
const { Pool } = require('pg');
const config = require('./config');
const logger = require('../utils/logger');

// Pool de conexões PostgreSQL com configuração mais robusta
const pool = new Pool({
  connectionString: config.database.url,
  max: config.database.maxConnections || 20,
  idleTimeoutMillis: config.database.idleTimeout || 30000,
  connectionTimeoutMillis: config.database.connectionTimeout || 10000,
  ssl: config.server.nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
  // Configurações adicionais para estabilidade
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Cliente Redis
let redisClient = null;

// Event handlers para o pool
pool.on('connect', (client) => {
  console.log('Nova conexão PostgreSQL estabelecida');
});

pool.on('error', (err, client) => {
  console.error('Erro no pool PostgreSQL:', err);
});

/**
 * Conecta ao Redis (opcional)
 */
async function connectRedis() {
  try {
    redisClient = new Redis(config.redis.url, {
      retryDelayOnFailover: 1000,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      reconnectOnError: (err) => {
        console.log('Redis reconnecting:', err.message);
        return true;
      },
      retryDelayOnClusterDown: 300,
      enableOfflineQueue: false
    });

    await redisClient.connect();
    console.log('✅ Redis conectado');
    return true;
  } catch (error) {
    console.warn('⚠️ Redis não disponível:', error.message);
    redisClient = null;
    return false;
  }
}

/**
 * Conecta ao PostgreSQL e inicializa tabelas
 */
async function connectDatabase() {
  try {
    // Testar conexão básica
    console.log('🔄 Testando conexão PostgreSQL...');
    const client = await pool.connect();
    console.log('✅ Conexão PostgreSQL estabelecida');
    
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('📊 PostgreSQL Info:', {
      time: result.rows[0].current_time,
      version: result.rows[0].pg_version.split(' ')[0]
    });
    
    client.release();

    // Inicializar tabelas
    console.log('🔄 Inicializando tabelas...');
    await initializeTables();
    
    console.log('✅ PostgreSQL configurado completamente');
    return true;
  } catch (error) {
    console.error('❌ Erro ao conectar PostgreSQL:', error);
    throw error;
  }
}

/**
 * Inicializa as tabelas do banco
 */
async function initializeTables() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('📋 Criando função de trigger...');
    // Função para trigger de updated_at
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('👥 Criando tabela users...');
    // Tabela de usuários
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        first_name VARCHAR(50) NOT NULL,
        last_name VARCHAR(50) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        birth_date DATE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        
        CONSTRAINT valid_email CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'),
        CONSTRAINT valid_birth_date CHECK (birth_date <= CURRENT_DATE),
        CONSTRAINT valid_name_length CHECK (
          length(trim(first_name)) >= 2 AND 
          length(trim(last_name)) >= 2
        )
      );
    `);

    console.log('📋 Criando tabela panels...');
    // Tabela de painéis
    await client.query(`
      CREATE TABLE IF NOT EXISTS panels (
        id VARCHAR(6) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        type VARCHAR(10) NOT NULL CHECK (type IN ('friends', 'couple', 'family')),
        password_hash VARCHAR(255),
        creator VARCHAR(50) NOT NULL,
        creator_id VARCHAR(50) NOT NULL,
        creator_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        border_color VARCHAR(7) DEFAULT '#9EC6F3',
        background_color VARCHAR(7) DEFAULT '#FBFBFB',
        max_users INTEGER DEFAULT 15 CHECK (max_users > 0 AND max_users <= 50),
        post_count INTEGER DEFAULT 0 CHECK (post_count >= 0),
        active_users INTEGER DEFAULT 0 CHECK (active_users >= 0),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('📝 Criando tabela posts...');
    // Tabela de posts
    await client.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        panel_id VARCHAR(6) REFERENCES panels(id) ON DELETE CASCADE,
        author_name VARCHAR(50),
        author_id VARCHAR(50) NOT NULL,
        author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        content TEXT NOT NULL CHECK (length(trim(content)) > 0 AND length(content) <= 1000),
        color VARCHAR(7) DEFAULT '#A8D8EA' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
        position_x INTEGER DEFAULT 50 CHECK (position_x >= 0 AND position_x <= 2000),
        position_y INTEGER DEFAULT 50 CHECK (position_y >= 0 AND position_y <= 2000),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('👤 Criando tabela active_users...');
    // Tabela de usuários ativos
    await client.query(`
      CREATE TABLE IF NOT EXISTS active_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        panel_id VARCHAR(6) REFERENCES panels(id) ON DELETE CASCADE,
        user_id VARCHAR(50) NOT NULL,
        username VARCHAR(50) NOT NULL,
        user_uuid UUID REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        
        CONSTRAINT unique_user_per_panel UNIQUE(panel_id, user_uuid)
      );
    `);

    console.log('👥 Criando tabela panel_participants...');
    // Tabela de participantes permanentes
    await client.query(`
      CREATE TABLE IF NOT EXISTS panel_participants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        panel_id VARCHAR(6) REFERENCES panels(id) ON DELETE CASCADE,
        user_id VARCHAR(50) NOT NULL,
        username VARCHAR(50) NOT NULL,
        user_uuid UUID REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_access TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        
        CONSTRAINT unique_participant_per_panel UNIQUE(panel_id, user_uuid)
      );
    `);

    console.log('⚙️ Criando triggers...');
    // Triggers para updated_at
    await client.query(`
      DROP TRIGGER IF EXISTS trigger_update_users_updated_at ON users;
      CREATE TRIGGER trigger_update_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS trigger_update_posts_updated_at ON posts;
      CREATE TRIGGER trigger_update_posts_updated_at
        BEFORE UPDATE ON posts
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    console.log('📊 Criando índices...');
    // Índices para performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_panels_creator_user_id ON panels(creator_user_id);
      CREATE INDEX IF NOT EXISTS idx_posts_panel_id ON posts(panel_id);
      CREATE INDEX IF NOT EXISTS idx_posts_author_user_id ON posts(author_user_id);
      CREATE INDEX IF NOT EXISTS idx_active_users_panel_id ON active_users(panel_id);
      CREATE INDEX IF NOT EXISTS idx_active_users_user_uuid ON active_users(user_uuid);
      CREATE INDEX IF NOT EXISTS idx_panel_participants_user_uuid ON panel_participants(user_uuid);
    `);

    await client.query('COMMIT');
    console.log('✅ Todas as tabelas criadas com sucesso');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erro ao criar tabelas:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Objetos de banco exportados
const db = {
  query: async (text, params) => {
    const start = Date.now();
    try {
      const result = await pool.query(text, params);
      const duration = Date.now() - start;
      
      if (duration > 100) {
        console.log(`🐌 Query lenta (${duration}ms):`, text.substring(0, 100));
      }
      
      return result;
    } catch (error) {
      console.error('❌ Erro na query:', {
        error: error.message,
        query: text.substring(0, 100),
        params: params?.length || 0
      });
      throw error;
    }
  },
  
  transaction: async (callback) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Erro na transação:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }
};

const cache = {
  get: async (key) => {
    if (!redisClient) return null;
    try {
      return await redisClient.get(key);
    } catch (error) {
      console.warn('Cache get error:', error.message);
      return null;
    }
  },
  
  set: async (key, value, ttl = 300) => {
    if (!redisClient) return null;
    try {
      if (typeof value === 'object') {
        value = JSON.stringify(value);
      }
      return await redisClient.setex(key, ttl, value);
    } catch (error) {
      console.warn('Cache set error:', error.message);
      return null;
    }
  },
  
  del: async (key) => {
    if (!redisClient) return null;
    try {
      return await redisClient.del(key);
    } catch (error) {
      console.warn('Cache del error:', error.message);
      return null;
    }
  }
};

module.exports = {
  db,
  cache,
  connectRedis,
  connectDatabase,
  pool,
  redisClient: () => redisClient
};