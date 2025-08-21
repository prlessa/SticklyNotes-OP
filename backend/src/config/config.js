require('dotenv').config();

const config = {
  PORT: process.env.PORT || 3001,
  NODE_ENV: process.env.NODE_ENV || 'development',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/stickynotes_db',
  JWT_SECRET: process.env.JWT_SECRET || 'meu-jwt-secret-super-seguro',
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS) || 12,
  
  LIMITS: {
    PANEL_NAME_MAX_LENGTH: 100,
    POST_CONTENT_MAX_LENGTH: 1000,
    USERNAME_MAX_LENGTH: 50,
    PASSWORD_MAX_LENGTH: 100
  },
  
  PANEL_TYPES: {
    FRIENDS: 'friends',
    COUPLE: 'couple'
  }
};

module.exports = config;