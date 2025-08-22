/**
 * Utilitários de segurança para Stickly Notes
 * Contém funções para criptografia, rate limiting e prevenção de ataques
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const config = require('../config/config');
const logger = require('./logger');

/**
 * Gera um código único para painel
 * Usa caracteres seguros e evita códigos ambíguos
 * @returns {string} Código de 6 caracteres
 */
function generatePanelCode() {
  // Excluir caracteres ambíguos: 0, O, I, 1
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  
  for (let i = 0; i < config.limits.panelCodeLength; i++) {
    const randomIndex = crypto.randomInt(0, chars.length);
    code += chars[randomIndex];
  }
  
  return code;
}

/**
 * Gera ID único para usuário
 * @returns {string} ID único do usuário
 */
function generateUserId() {
  const timestamp = Date.now().toString(36);
  const randomBytes = crypto.randomBytes(4).toString('hex');
  return `user_${timestamp}_${randomBytes}`;
}

/**
 * Hash seguro de senha
 * @param {string} password - Senha em texto plano
 * @returns {Promise<string>} Hash da senha
 */
async function hashPassword(password) {
  if (!password) return null;
  
  try {
    return await bcrypt.hash(password, config.security.bcryptRounds);
  } catch (error) {
    logger.error('Erro ao fazer hash da senha:', error);
    throw new Error('Erro interno de segurança');
  }
}

/**
 * Verifica senha contra hash
 * @param {string} password - Senha em texto plano
 * @param {string} hash - Hash da senha
 * @returns {Promise<boolean>} True se a senha for válida
 */
async function verifyPassword(password, hash) {
  if (!password || !hash) return false;
  
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    logger.error('Erro ao verificar senha:', error);
    return false;
  }
}

/**
 * Gera token seguro para sessões
 * @returns {string} Token hexadecimal
 */
function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Cria hash de dados para verificação de integridade
 * @param {string} data - Dados a serem hasheados
 * @returns {string} Hash SHA-256
 */
function createDataHash(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Rate limiter para endpoints gerais
 */
const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    error: 'Muitas requisições. Tente novamente em alguns minutos.',
    retryAfter: Math.ceil(config.rateLimit.windowMs / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Pular rate limiting para health checks
    return req.path === '/health' || req.path === '/api/health';
  }
});

/**
 * Rate limiter mais restritivo para criação de painéis
 */
const panelCreationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 5, // Máximo 5 painéis por IP a cada 5 minutos
  message: {
    error: 'Limite de criação de painéis atingido. Aguarde alguns minutos.',
    retryAfter: 300
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Rate limiter para tentativas de acesso a painéis
 */
const panelAccessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20, // Máximo 20 tentativas por IP
  message: {
    error: 'Muitas tentativas de acesso. Aguarde alguns minutos.',
    retryAfter: 900
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Rate limiter para criação de posts
 */
const postCreationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 10, // Máximo 10 posts por minuto por IP
  message: {
    error: 'Muitos posts criados rapidamente. Aguarde um pouco.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Middleware de segurança para headers HTTP
 * @param {object} req - Request object
 * @param {object} res - Response object
 * @param {function} next - Next middleware
 */
function securityHeaders(req, res, next) {
  // Prevenir XSS
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // HSTS apenas em HTTPS
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  // CSP básico
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' ws: wss:;"
  );
  
  next();
}

/**
 * Middleware para detectar e bloquear IPs suspeitos
 * @param {object} req - Request object
 * @param {object} res - Response object
 * @param {function} next - Next middleware
 */
function suspiciousActivityDetector(req, res, next) {
  const suspiciousPatterns = [
    /admin/i,
    /\.php$/i,
    /wp-admin/i,
    /phpmyadmin/i,
    /<script/i,
    /javascript:/i,
    /eval\(/i,
    /union.*select/i
  ];
  
  const userAgent = req.get('User-Agent') || '';
  const url = req.url;
  const body = req.body ? JSON.stringify(req.body) : '';
  
  // Verificar padrões suspeitos
  const isSuspicious = suspiciousPatterns.some(pattern => 
    pattern.test(url) || pattern.test(userAgent) || pattern.test(body)
  );
  
  if (isSuspicious) {
    logger.security('Atividade suspeita detectada', {
      ip: req.ip,
      userAgent,
      url,
      method: req.method
    });
    
    return res.status(403).json({
      error: 'Acesso negado'
    });
  }
  
  next();
}

/**
 * Sanitiza dados de entrada removendo scripts maliciosos
 * @param {any} data - Dados a serem sanitizados
 * @returns {any} Dados sanitizados
 */
function sanitizeInput(data) {
  if (typeof data === 'string') {
    return data
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  }
  
  if (Array.isArray(data)) {
    return data.map(sanitizeInput);
  }
  
  if (typeof data === 'object' && data !== null) {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      sanitized[sanitizeInput(key)] = sanitizeInput(value);
    }
    return sanitized;
  }
  
  return data;
}

/**
 * Middleware para sanitização automática de entrada
 * @param {object} req - Request object
 * @param {object} res - Response object
 * @param {function} next - Next middleware
 */
function autoSanitize(req, res, next) {
  if (req.body) {
    req.body = sanitizeInput(req.body);
  }
  
  if (req.query) {
    req.query = sanitizeInput(req.query);
  }
  
  if (req.params) {
    req.params = sanitizeInput(req.params);
  }
  
  next();
}

/**
 * Verifica se uma requisição é de origem confiável
 * @param {object} req - Request object
 * @returns {boolean} True se for confiável
 */
function isRequestTrusted(req) {
  const origin = req.get('origin');
  const referer = req.get('referer');
  const allowedOrigins = config.server.corsOrigins;
  
  // Verificar origin
  if (origin && !allowedOrigins.includes(origin)) {
    return false;
  }
  
  // Verificar referer se presente
  if (referer) {
    const isValidReferer = allowedOrigins.some(allowed => 
      referer.startsWith(allowed)
    );
    if (!isValidReferer) {
      return false;
    }
  }
  
  return true;
}

/**
 * Middleware para validação de origem
 * @param {object} req - Request object
 * @param {object} res - Response object
 * @param {function} next - Next middleware
 */
function validateOrigin(req, res, next) {
  // Pular validação para requisições locais em desenvolvimento
  if (config.server.nodeEnv === 'development' && 
      (req.ip === '127.0.0.1' || req.ip === '::1')) {
    return next();
  }
  
  if (!isRequestTrusted(req)) {
    logger.security('Requisição de origem não confiável', {
      ip: req.ip,
      origin: req.get('origin'),
      referer: req.get('referer'),
      userAgent: req.get('User-Agent')
    });
    
    return res.status(403).json({
      error: 'Origem não autorizada'
    });
  }
  
  next();
}

/**
 * Middleware para logging de eventos de segurança
 * @param {string} event - Tipo de evento
 * @returns {function} Middleware function
 */
function logSecurityEvent(event) {
  return (req, res, next) => {
    logger.security(`Evento de segurança: ${event}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      method: req.method,
      url: req.url
    });
    next();
  };
}

module.exports = {
  generatePanelCode,
  generateUserId,
  generateSecureToken,
  hashPassword,
  verifyPassword,
  createDataHash,
  
  // Rate limiters
  generalLimiter,
  panelCreationLimiter,
  panelAccessLimiter,
  postCreationLimiter,
  
  // Middleware de segurança
  securityHeaders,
  suspiciousActivityDetector,
  autoSanitize,
  validateOrigin,
  logSecurityEvent,
  
  // Utilitários
  sanitizeInput,
  isRequestTrusted
};