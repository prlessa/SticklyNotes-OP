require('dotenv').config();

const config = {
  // Servidor
  server: {
    port: parseInt(process.env.PORT) || 3001,
    nodeEnv: process.env.NODE_ENV || 'development',
    corsOrigins: [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3000', // fallback para desenvolvimento
      'http://localhost:3001'  // para testes
    ]
  },

  // URLs
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  
  // Banco de dados PostgreSQL
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/stickly_notes_db',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS) || 20,
    idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 10000
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    retryDelay: parseInt(process.env.REDIS_RETRY_DELAY) || 1000,
    maxRetries: parseInt(process.env.REDIS_MAX_RETRIES) || 3
  },

  // Cache
  cache: {
    panelTtl: 300, // 5 minutos
    postsTtl: 60   // 1 minuto
  },

  // Segurança
  security: {
    jwtSecret: process.env.JWT_SECRET || 'meu-jwt-secret-super-seguro-para-desenvolvimento',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 10 // Reduzido para performance em dev
  },

  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutos
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX) || 100
  },

  // Limites
  limits: {
    panelNameMaxLength: 100,
    postContentMaxLength: 1000,
    usernameMaxLength: 50,
    passwordMaxLength: 100,
    panelCodeLength: 6,
    maxPostsPerPanel: 500,
    maxUsersPerFriendsPanel: 15,
    maxUsersPerCouplePanel: 2
  },

  // Tipos de painel
  panelTypes: {
    friends: 'friends',
    couple: 'couple'
  },

  // Cores padrão
  getDefaultColors: (type) => {
    if (type === 'couple') {
      return {
        border: '#FF9292',
        background: '#FFE8E8',
        note: '#F9F5F6'
      };
    }
    return {
      border: '#9EC6F3',
      background: '#FBFBFB', 
      note: '#A8D8EA'
    };
  },

  // Verificar se cor é válida
  isValidColor: (color, panelType, category) => {
    const friendsColors = {
      notes: ['#A8D8EA', '#AA96DA', '#FCBAD3', '#FFFFD2'],
      borders: ['#9EC6F3', '#BDDDE4', '#FFF1D5', '#FBFBFB'],
      backgrounds: ['#9EC6F3', '#BDDDE4', '#FFF1D5', '#FBFBFB']
    };

    const coupleColors = {
      notes: ['#F9F5F6', '#F8E8EE', '#FDCEDF', '#F2BED1'],
      borders: ['#FF9292', '#FFB4B4', '#FFDCDC', '#FFE8E8'],
      backgrounds: ['#FF9292', '#FFB4B4', '#FFDCDC', '#FFE8E8']
    };

    const colors = panelType === 'couple' ? coupleColors : friendsColors;
    return colors[category]?.includes(color) || false;
  },

  // Função para debug
  debug: () => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔧 Configuração atual:');
      console.log('  - PORT:', config.server.port);
      console.log('  - NODE_ENV:', config.server.nodeEnv);
      console.log('  - DATABASE_URL:', config.database.url?.replace(/:[^:]*@/, ':***@'));
      console.log('  - REDIS_URL:', config.redis.url);
      console.log('  - FRONTEND_URL:', config.frontendUrl);
    }
  }
};

// Debug em desenvolvimento
config.debug();

module.exports = config;