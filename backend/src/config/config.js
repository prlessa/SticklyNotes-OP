require('dotenv').config();

const config = {
  // Servidor
  server: {
    port: parseInt(process.env.PORT) || 3001,
    nodeEnv: process.env.NODE_ENV || 'development',
    // CORREÇÃO: URLs corretas para Railway
    corsOrigins: process.env.NODE_ENV === 'production' 
      ? [
          // Railway fornece a URL automaticamente via RAILWAY_PUBLIC_DOMAIN
          `https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'app.up.railway.app'}`,
          process.env.FRONTEND_URL || `https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'app.up.railway.app'}`
        ]
      : [
          'http://localhost:3000',
          'http://localhost:3001'
        ]
  },

  // URLs - CORREÇÃO para Railway
  frontendUrl: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL || `https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'app.up.railway.app'}`
    : 'http://localhost:3000',
  
  // Banco de dados PostgreSQL - CORREÇÃO: Railway fornece DATABASE_URL automaticamente
  database: {
    // Railway sempre fornece DATABASE_URL quando você adiciona PostgreSQL
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/stickly_notes_db',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS) || 20,
    idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 10000
  },

  // Redis - CORREÇÃO: Railway fornece REDIS_URL automaticamente
  redis: {
    // Railway sempre fornece REDIS_URL quando você adiciona Redis
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
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12
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
    maxUsersPerCouplePanel: 2,
    maxUsersPerFamilyPanel: 10
  },

  // Tipos de painel
  panelTypes: {
    friends: 'friends',
    couple: 'couple',
    family: 'family'
  },

  // Cores padrão
  getDefaultColors: (type) => {
    switch (type) {
      case 'couple':
        return {
          border: '#FF9292',
          background: '#FFE8E8',
          note: '#F9F5F6'
        };
      case 'family':
        return {
          border: '#90EE90',
          background: '#F0F9E8', 
          note: '#E8F5E8'
        };
      default: // friends
        return {
          border: '#9EC6F3',
          background: '#FBFBFB', 
          note: '#A8D8EA'
        };
    }
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

    const familyColors = {
      notes: ['#E8F5E8', '#F0F8E8', '#E8F8F0', '#F8F8E8'],
      borders: ['#90EE90', '#98FB98', '#F0FFF0', '#F8FFF8'],
      backgrounds: ['#90EE90', '#98FB98', '#F0FFF0', '#F8FFF8']
    };

    const colors = panelType === 'couple' ? coupleColors : 
                   panelType === 'family' ? familyColors : friendsColors;
    return colors[category]?.includes(color) || false;
  },

  // Função para debug
  debug: () => {
    console.log('🔧 Configuração atual:');
    console.log('  - PORT:', config.server.port);
    console.log('  - NODE_ENV:', config.server.nodeEnv);
    
    // CORREÇÃO: Não mostrar URLs completas em produção por segurança
    if (config.server.nodeEnv === 'production') {
      console.log('  - DATABASE_URL:', config.database.url ? 'CONFIGURADO' : 'NÃO CONFIGURADO');
      console.log('  - REDIS_URL:', config.redis.url ? 'CONFIGURADO' : 'NÃO CONFIGURADO');
      console.log('  - FRONTEND_URL:', config.frontendUrl ? 'CONFIGURADO' : 'NÃO CONFIGURADO');
      console.log('  - RAILWAY_PUBLIC_DOMAIN:', process.env.RAILWAY_PUBLIC_DOMAIN || 'NÃO DEFINIDO');
    } else {
      console.log('  - DATABASE_URL:', config.database.url?.replace(/:[^:]*@/, ':***@'));
      console.log('  - REDIS_URL:', config.redis.url);
      console.log('  - FRONTEND_URL:', config.frontendUrl);
    }
  },

  // NOVA FUNÇÃO: Validar configuração para Railway
  validateRailwayConfig: () => {
    const errors = [];
    
    if (config.server.nodeEnv === 'production') {
      if (!process.env.DATABASE_URL) {
        errors.push('❌ DATABASE_URL não definida - adicione PostgreSQL no Railway');
      }
      
      if (!process.env.REDIS_URL) {
        errors.push('❌ REDIS_URL não definida - adicione Redis no Railway');
      }
      
      if (!process.env.JWT_SECRET) {
        errors.push('❌ JWT_SECRET não definida - configure manualmente');
      }
      
      if (!process.env.RAILWAY_PUBLIC_DOMAIN && !process.env.FRONTEND_URL) {
        errors.push('⚠️ RAILWAY_PUBLIC_DOMAIN não detectado - CORS pode não funcionar');
      }
    }
    
    if (errors.length > 0) {
      console.error('🚨 Problemas de configuração para Railway:');
      errors.forEach(error => console.error(error));
      console.error('');
      console.error('Para corrigir:');
      console.error('1. railway add --database postgresql');
      console.error('2. railway add --database redis'); 
      console.error('3. railway variables set JWT_SECRET="sua-chave-secreta"');
      console.error('');
      return false;
    }
    
    console.log('✅ Configuração Railway válida!');
    return true;
  }
};

// Debug em desenvolvimento, validação em produção
if (config.server.nodeEnv === 'development') {
  config.debug();
} else {
  config.validateRailwayConfig();
}

module.exports = config;