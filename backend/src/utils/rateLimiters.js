/**
 * Middleware de Rate Limiting específico para proteção contra spam
 * backend/src/utils/rateLimiters.js
 */

const rateLimit = require('express-rate-limit');
const { db } = require('../config/database');
const config = require('../config/config');
const logger = require('./logger');

// Store personalizado para rate limiting baseado em código de painel
class PanelAccessLimiter {
  constructor() {
    this.hits = new Map(); // Map<key, { count, resetTime }>
    this.windowMs = 30000; // 30 segundos
    this.maxAttempts = 3; // Máximo 3 tentativas por código por IP
  }

  generateKey(ip, panelCode) {
    return `${ip}:${panelCode}`;
  }

  async increment(key) {
    const now = Date.now();
    const hit = this.hits.get(key);

    if (!hit || now > hit.resetTime) {
      // Primeira tentativa ou janela expirou
      this.hits.set(key, {
        count: 1,
        resetTime: now + this.windowMs
      });
      return { count: 1, resetTime: now + this.windowMs };
    }

    // Incrementar contador
    hit.count += 1;
    this.hits.set(key, hit);
    return hit;
  }

  async resetKey(key) {
    this.hits.delete(key);
  }

  // Cleanup automático de entradas antigas
  cleanup() {
    const now = Date.now();
    for (const [key, hit] of this.hits.entries()) {
      if (now > hit.resetTime) {
        this.hits.delete(key);
      }
    }
  }
}

const panelCodeLimiter = new PanelAccessLimiter();

// Cleanup a cada 5 minutos
setInterval(() => {
  panelCodeLimiter.cleanup();
}, 5 * 60 * 1000);

/**
 * Rate limiter específico para acesso via link
 * Mais restritivo para evitar spam de links
 */
const linkAccessRateLimiter = (req, res, next) => {
  const { code } = req.params;
  const ip = req.ip || req.connection.remoteAddress;
  
  if (!code) {
    return next();
  }

  const key = panelCodeLimiter.generateKey(ip, code.toUpperCase());
  
  panelCodeLimiter.increment(key).then(hit => {
    if (hit.count > panelCodeLimiter.maxAttempts) {
      const resetInSeconds = Math.ceil((hit.resetTime - Date.now()) / 1000);
      
      logger.security('Rate limit excedido para acesso via link', {
        ip,
        code: code.toUpperCase(),
        attempts: hit.count,
        resetIn: resetInSeconds
      });

      return res.status(429).json({
        error: 'Muitas tentativas de acesso',
        retryAfter: resetInSeconds,
        message: `Aguarde ${resetInSeconds} segundos antes de tentar novamente.`
      });
    }

    // Log da tentativa
    if (hit.count > 1) {
      logger.info('Tentativa de acesso via link', {
        ip,
        code: code.toUpperCase(),
        attempt: hit.count,
        maxAttempts: panelCodeLimiter.maxAttempts
      });
    }

    next();
  }).catch(err => {
    logger.error('Erro no rate limiter de link:', err);
    next(); // Continuar mesmo com erro para não quebrar o fluxo
  });
};

/**
 * Rate limiter geral para APIs
 * Menos restritivo para uso normal
 */
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200, // Aumentado de 100 para 200
  message: {
    error: 'Muitas requisições',
    retryAfter: Math.ceil(15 * 60), // 15 minutos em segundos
    message: 'Você fez muitas requisições. Tente novamente em alguns minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Pular rate limiting para health checks e static files
    return req.path === '/health' || 
           req.path === '/api/health' || 
           req.path.startsWith('/static/');
  },
  onLimitReached: (req, res, options) => {
    logger.security('Rate limit geral atingido', {
      ip: req.ip,
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent')
    });
  }
});

/**
 * Rate limiter para criação de painéis
 * Mais restritivo para evitar spam
 */
const panelCreationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 5, // Máximo 5 painéis por IP a cada 10 minutos
  message: {
    error: 'Limite de criação de painéis atingido',
    retryAfter: 600, // 10 minutos
    message: 'Você criou muitos painéis recentemente. Aguarde 10 minutos.'
  },
  onLimitReached: (req, res, options) => {
    logger.security('Rate limit de criação de painéis atingido', {
      ip: req.ip,
      userId: req.user?.userId,
      userAgent: req.get('User-Agent')
    });
  }
});

/**
 * Rate limiter para acesso a painéis (código manual)
 * Moderadamente restritivo
 */
const panelAccessLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 20, // Máximo 20 tentativas por IP
  message: {
    error: 'Muitas tentativas de acesso a painéis',
    retryAfter: 300, // 5 minutos
    message: 'Muitas tentativas de acesso. Aguarde 5 minutos.'
  },
  onLimitReached: (req, res, options) => {
    logger.security('Rate limit de acesso a painéis atingido', {
      ip: req.ip,
      code: req.params.code,
      userId: req.user?.userId,
      userAgent: req.get('User-Agent')
    });
  }
});

/**
 * Rate limiter para criação de posts
 * Moderado para permitir conversação natural
 */
const postCreationLimiter = rateLimit({
  windowMs: 2 * 60 * 1000, // 2 minutos
  max: 15, // Máximo 15 posts por IP a cada 2 minutos
  message: {
    error: 'Muitos posts criados rapidamente',
    retryAfter: 120,
    message: 'Você está postando muito rapidamente. Aguarde um pouco.'
  },
  onLimitReached: (req, res, options) => {
    logger.security('Rate limit de posts atingido', {
      ip: req.ip,
      userId: req.user?.userId,
      panelId: req.params.code
    });
  }
});

/**
 * Rate limiter para autenticação
 * Muito restritivo para prevenir ataques de força bruta
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // Máximo 10 tentativas por IP
  message: {
    error: 'Muitas tentativas de login',
    retryAfter: 900, // 15 minutos
    message: 'Muitas tentativas de login. Aguarde 15 minutos.'
  },
  skipSuccessfulRequests: true, // Não contar requests bem-sucedidos
  onLimitReached: (req, res, options) => {
    logger.security('Rate limit de autenticação atingido', {
      ip: req.ip,
      email: req.body?.email,
      userAgent: req.get('User-Agent')
    });
  }
});

/**
 * Middleware para monitorar tentativas suspeitas
 */
const suspiciousActivityMonitor = async (req, res, next) => {
  const ip = req.ip;
  const userAgent = req.get('User-Agent') || '';
  const method = req.method;
  const url = req.url;

  // Detectar padrões suspeitos
  const suspiciousPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /scanner/i,
    // Adicionar mais padrões conforme necessário
  ];

  const isSuspiciousUA = suspiciousPatterns.some(pattern => pattern.test(userAgent));

  // Detectar muitas requests em sequência rápida
  if (req.rateLimit && req.rateLimit.current > req.rateLimit.limit * 0.8) {
    logger.security('Atividade suspeita detectada - alta frequência', {
      ip,
      method,
      url,
      userAgent,
      rateLimit: req.rateLimit
    });
  }

  // Log de user agents suspeitos
  if (isSuspiciousUA) {
    logger.security('User Agent suspeito detectado', {
      ip,
      method,
      url,
      userAgent
    });
  }

  next();
};

module.exports = {
  generalApiLimiter,
  linkAccessRateLimiter,
  panelCreationLimiter,
  panelAccessLimiter,
  postCreationLimiter,
  authLimiter,
  suspiciousActivityMonitor,
  // Exportar instância para limpeza manual se necessário
  panelCodeLimiterInstance: panelCodeLimiter
};