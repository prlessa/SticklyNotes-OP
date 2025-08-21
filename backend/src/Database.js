const Redis = require('ioredis');
const { Pool } = require('pg');
const config = require('./config');
const logger = require('../utils/logger');

let redisClient = null;
let redisSubscriber = null;
let pgPool = null;

async function connectRedis() {
  try {
    redisClient = new Redis(config.REDIS_URL, {
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    redisSubscriber = new Redis(config.REDIS_URL, {
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    redisClient.on('connect', () => logger.info('Redis conectado'));
    redisClient.on('error', (err) => logger.error('Erro no Redis:', err));

    await redisClient.connect();
    await redisSubscriber.connect();

    return { redisClient, redisSubscriber };
  } catch (error) {
    logger.error('Erro ao conectar Redis:', error);
    throw error;
  }
}

async function connectDatabase() {
  try {
    pgPool = new Pool({
      connectionString: config.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    });

    const client = await pgPool.connect();
    await client.query('SELECT 1');
    client.release();

    logger.info('PostgreSQL conectado com sucesso');
    return pgPool;
  } catch (error) {
    logger.error('Erro ao conectar PostgreSQL:', error);
    throw error;
  }
}

function getRedisClient() {
  if (!redisClient) {
    throw new Error('Redis não conectado');
  }
  return redisClient;
}

function getDatabasePool() {
  if (!pgPool) {
    throw new Error('PostgreSQL não conectado');
  }
  return pgPool;
}

module.exports = {
  connectRedis,
  connectDatabase,
  getRedisClient,
  getDatabasePool
};