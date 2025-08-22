const winston = require('winston');
const path = require('path');

/**
 * Configuração de níveis de log personalizados
 */
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

/**
 * Cores para cada nível de log (apenas para console)
 */
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue'
};

/**
 * Formato personalizado para logs em desenvolvimento
 * Remove informações sensíveis e formata de forma legível
 */
const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    // Sanitizar metadados removendo informações sensíveis
    const sanitizedMeta = sanitizeLogData(meta);
    const metaStr = Object.keys(sanitizedMeta).length ? 
      `\n${JSON.stringify(sanitizedMeta, null, 2)}` : '';
    
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

/**
 * Formato para logs em produção
 * JSON estruturado para parsing automático
 */
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    // Sanitizar dados antes de logar
    return JSON.stringify(sanitizeLogData(info));
  })
);

/**
 * Remove informações sensíveis dos logs
 * @param {object} data - Dados a serem sanitizados
 * @returns {object} Dados sanitizados
 */
function sanitizeLogData(data) {
  const sensitiveKeys = [
    'password', 'token', 'authorization', 'cookie', 'session',
    'secret', 'key', 'hash', 'credential', 'auth'
  ];
  
  const sanitized = { ...data };
  
  // Função recursiva para sanitizar objetos aninhados
  function recursiveSanitize(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;
    
    const result = Array.isArray(obj) ? [] : {};
    
    for (const [key, value] of Object.entries(obj)) {
      const keyLower = key.toLowerCase();
      const shouldRedact = sensitiveKeys.some(sensitive => 
        keyLower.includes(sensitive)
      );
      
      if (shouldRedact) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        result[key] = recursiveSanitize(value);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }
  
  return recursiveSanitize(sanitized);
}

/**
 * Configuração de transports baseada no ambiente
 */
const createTransports = () => {
  const transports = [];
  const isProduction = process.env.NODE_ENV === 'production';
  const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');
  
  // Console transport - sempre presente
  transports.push(
    new winston.transports.Console({
      level: logLevel,
      format: isProduction ? prodFormat : devFormat
    })
  );
  
  // File transports apenas em produção
  if (isProduction) {
    const logDir = process.env.LOG_DIR || 'logs';
    
    // Log de erros
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        format: prodFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5
      })
    );
    
    // Log combinado
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, 'combined.log'),
        format: prodFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 10
      })
    );
  }
  
  return transports;
};

/**
 * Criação do logger principal
 */
const logger = winston.createLogger({
  levels: logLevels,
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true })
  ),
  transports: createTransports(),
  exitOnError: false
});

// Adicionar cores para o console em desenvolvimento
if (process.env.NODE_ENV !== 'production') {
  winston.addColors(logColors);
}

/**
 * Middleware para logging de requisições HTTP
 * @param {object} req - Request object
 * @param {object} res - Response object
 * @param {function} next - Next middleware
 */
logger.httpMiddleware = (req, res, next) => {
  const start = Date.now();
  
  // Log da requisição (sem dados sensíveis)
  logger.http('Incoming request', {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    timestamp: new Date().toISOString()
  });
  
  // Override do end para logar a resposta
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    
    logger.http('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress
    });
    
    originalEnd.call(res, chunk, encoding);
  };
  
  next();
};

/**
 * Handler para erros não capturados
 */
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
});

/**
 * Métodos de conveniência para logging contextual
 */
logger.security = (message, meta = {}) => {
  logger.warn(`[SECURITY] ${message}`, { ...meta, category: 'security' });
};

logger.performance = (message, meta = {}) => {
  logger.info(`[PERFORMANCE] ${message}`, { ...meta, category: 'performance' });
};

logger.database = (message, meta = {}) => {
  logger.debug(`[DATABASE] ${message}`, { ...meta, category: 'database' });
};

logger.cache = (message, meta = {}) => {
  logger.debug(`[CACHE] ${message}`, { ...meta, category: 'cache' });
};

logger.websocket = (message, meta = {}) => {
  logger.debug(`[WEBSOCKET] ${message}`, { ...meta, category: 'websocket' });
};

module.exports = logger;