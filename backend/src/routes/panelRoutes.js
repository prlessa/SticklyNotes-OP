/**
 * Rotas para gerenciamento de painéis
 * Contém todos os endpoints relacionados aos painéis
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { db, cache } = require('../config/database');
const { validatePanelCreation } = require('../utils/validators');
const { 
  generatePanelCode, 
  hashPassword, 
  verifyPassword 
} = require('../utils/security');
const config = require('../config/config');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Middleware para validação de erros
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Dados inválidos',
      details: errors.array()
    });
  }
  next();
};

/**
 * GET /api/panels/:code/check
 * Verifica se um painel requer senha
 */
router.get('/:code/check',
  [
    param('code')
      .isLength({ min: 6, max: 6 })
      .isAlphanumeric()
      .withMessage('Código deve ter 6 caracteres alfanuméricos')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { code } = req.params;
      const upperCode = code.toUpperCase();
      
      // Tentar buscar no cache primeiro
      let panel = await cache.getCachedPanel(upperCode);
      let requiresPassword = false;
      
      if (panel) {
        // Se está no cache, não tem senha (cache não armazena senha)
        requiresPassword = false;
      } else {
        // Buscar no banco apenas o campo de senha
        const result = await db.query(
          'SELECT password_hash IS NOT NULL as requires_password FROM panels WHERE id = $1',
          [upperCode]
        );
        
        if (result.rows.length === 0) {
          return res.status(404).json({ 
            error: 'Painel não encontrado' 
          });
        }
        
        requiresPassword = result.rows[0].requires_password;
      }
      
      logger.info('Verificação de senha do painel', { 
        panelId: upperCode, 
        requiresPassword 
      });
      
      res.json({ requiresPassword });
      
    } catch (error) {
      logger.error('Erro ao verificar painel:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }
);

/**
 * POST /api/panels
 * Cria um novo painel
 */
router.post('/',
  [
    body('name')
      .isLength({ min: 3, max: 100 })
      .withMessage('Nome deve ter entre 3 e 100 caracteres'),
    body('type')
      .isIn(['friends', 'couple'])
      .withMessage('Tipo deve ser friends ou couple'),
    body('creator')
      .isLength({ min: 2, max: 50 })
      .withMessage('Nome do criador deve ter entre 2 e 50 caracteres'),
    body('userId')
      .notEmpty()
      .withMessage('ID do usuário é obrigatório'),
    body('password')
      .optional()
      .isLength({ max: 100 })
      .withMessage('Senha muito longa'),
    body('borderColor')
      .optional()
      .matches(/^#[0-9A-Fa-f]{6}$/)
      .withMessage('Cor da borda inválida'),
    body('backgroundColor')
      .optional()
      .matches(/^#[0-9A-Fa-f]{6}$/)
      .withMessage('Cor de fundo inválida')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const panelData = req.body;
      
      // Validação adicional
      const validation = validatePanelCreation(panelData);
      if (!validation.isValid) {
        return res.status(400).json({
          error: 'Dados inválidos',
          details: validation.errors
        });
      }
      
      const validData = validation.data;
      
      // Gerar código único
      const code = await generateUniqueCode();
      
      // Hash da senha se fornecida
      const passwordHash = await hashPassword(validData.password);
      
      // Configurações baseadas no tipo
      const maxUsers = validData.type === 'couple' ? 
        config.limits.maxUsersPerCouplePanel : 
        config.limits.maxUsersPerFriendsPanel;
      
      // Cores padrão se não fornecidas
      const defaultColors = config.getDefaultColors(validData.type);
      const borderColor = validData.borderColor || defaultColors.border;
      const backgroundColor = validData.backgroundColor || defaultColors.background;
      
      // Inserir no banco usando transação
      const panel = await db.transaction(async (client) => {
        // Criar painel
        const panelResult = await client.query(`
          INSERT INTO panels (
            id, name, type, password_hash, creator, creator_id,
            border_color, background_color, max_users
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id, name, type, creator, border_color, background_color, 
                    max_users, created_at, last_activity
        `, [
          code, validData.name, validData.type, passwordHash,
          validData.creator, panelData.userId,
          borderColor, backgroundColor, maxUsers
        ]);
        
        // Adicionar criador como participante
        await client.query(`
          INSERT INTO panel_participants (panel_id, user_id, username)
          VALUES ($1, $2, $3)
        `, [code, panelData.userId, validData.creator]);
        
        return panelResult.rows[0];
      });
      
      // Cachear painel (sem senha)
      await cache.cachePanel(code, panel);
      
      logger.info('Painel criado com sucesso', {
        panelId: code,
        type: validData.type,
        creator: validData.creator,
        hasPassword: !!passwordHash
      });
      
      res.status(201).json(panel);
      
    } catch (error) {
      logger.error('Erro ao criar painel:', error);
      
      if (error.code === '23505') { // Violação de chave única
        return res.status(500).json({
          error: 'Erro interno. Tente novamente.'
        });
      }
      
      res.status(500).json({
        error: 'Erro ao criar painel'
      });
    }
  }
);

/**
 * POST /api/panels/:code
 * Acessa um painel existente
 */
router.post('/:code',
  [
    param('code')
      .isLength({ min: 6, max: 6 })
      .isAlphanumeric()
      .withMessage('Código inválido'),
    body('userName')
      .isLength({ min: 2, max: 50 })
      .withMessage('Nome deve ter entre 2 e 50 caracteres'),
    body('userId')
      .notEmpty()
      .withMessage('ID do usuário é obrigatório'),
    body('password')
      .optional()
      .isLength({ max: 100 })
      .withMessage('Senha muito longa')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { code } = req.params;
      const { password, userName, userId } = req.body;
      const upperCode = code.toUpperCase();
      
      // Tentar obter do cache primeiro
      let panel = await cache.getCachedPanel(upperCode);
      
      if (!panel) {
        // Buscar no banco se não estiver em cache
        const result = await db.query(
          'SELECT * FROM panels WHERE id = $1',
          [upperCode]
        );
        
        if (result.rows.length === 0) {
          return res.status(404).json({ 
            error: 'Painel não encontrado' 
          });
        }
        
        panel = result.rows[0];
      }
      
      // Verificar senha se necessário
      if (panel.password_hash) {
        if (!password) {
          return res.status(401).json({ 
            error: 'Senha é obrigatória para este painel' 
          });
        }
        
        const isValidPassword = await verifyPassword(password, panel.password_hash);
        if (!isValidPassword) {
          logger.security('Tentativa de acesso com senha incorreta', {
            panelId: upperCode,
            userId,
            ip: req.ip
          });
          return res.status(401).json({ 
            error: 'Senha incorreta' 
          });
        }
      }
      
      // Verificar limite de usuários
      const activeCount = await getActiveUserCount(upperCode);
      const isUserAlreadyActive = await isUserActive(upperCode, userId);
      
      if (!isUserAlreadyActive && activeCount >= panel.max_users) {
        return res.status(403).json({ 
          error: `Painel lotado (máximo ${panel.max_users} usuários)` 
        });
      }
      
      // Adicionar/atualizar como participante
      await db.query(`
        INSERT INTO panel_participants (panel_id, user_id, username)
        VALUES ($1, $2, $3)
        ON CONFLICT (panel_id, user_id) 
        DO UPDATE SET 
          username = $3,
          last_access = CURRENT_TIMESTAMP
      `, [upperCode, userId, userName]);
      
      // Atualizar última atividade do painel
      await db.query(
        'UPDATE panels SET last_activity = CURRENT_TIMESTAMP WHERE id = $1',
        [upperCode]
      );
      
      // Invalidar cache do painel para forçar atualização
      await cache.invalidate(`panel:${upperCode}`);
      
      // Remover senha do retorno
      const safePanel = { ...panel };
      delete safePanel.password_hash;
      
      logger.info('Acesso ao painel realizado', {
        panelId: upperCode,
        userId,
        userName,
        hasPassword: !!panel.password_hash
      });
      
      res.json(safePanel);
      
    } catch (error) {
      logger.error('Erro ao acessar painel:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }
);

/**
 * GET /api/panels/:code/posts
 * Busca todos os posts de um painel
 */
router.get('/:code/posts',
  [
    param('code')
      .isLength({ min: 6, max: 6 })
      .isAlphanumeric()
      .withMessage('Código inválido')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { code } = req.params;
      const upperCode = code.toUpperCase();
      
      // Verificar se painel existe
      const panelExists = await db.query(
        'SELECT id FROM panels WHERE id = $1',
        [upperCode]
      );
      
      if (panelExists.rows.length === 0) {
        return res.status(404).json({ 
          error: 'Painel não encontrado' 
        });
      }
      
      // Tentar buscar posts do cache
      let posts = await cache.getCachedPosts(upperCode);
      
      if (!posts) {
        // Buscar do banco se não estiver em cache
        const result = await db.query(
          'SELECT * FROM posts WHERE panel_id = $1 ORDER BY created_at DESC',
          [upperCode]
        );
        
        posts = result.rows;
        
        // Cachear para próximas consultas
        await cache.cachePosts(upperCode, posts);
      }
      
      res.json(posts);
      
    } catch (error) {
      logger.error('Erro ao buscar posts:', error);
      res.status(500).json({ 
        error: 'Erro ao buscar posts' 
      });
    }
  }
);

/**
 * GET /api/users/:userId/panels
 * Busca painéis que o usuário participa
 */
router.get('/users/:userId/panels',
  [
    param('userId')
      .notEmpty()
      .withMessage('ID do usuário é obrigatório')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { userId } = req.params;
      
      const result = await db.query(`
        SELECT DISTINCT 
          p.id, p.name, p.type, p.border_color, p.background_color, 
          p.created_at, pp.last_access, pp.username
        FROM panels p
        INNER JOIN panel_participants pp ON p.id = pp.panel_id
        WHERE pp.user_id = $1
        ORDER BY pp.last_access DESC
      `, [userId]);
      
      res.json(result.rows);
      
    } catch (error) {
      logger.error('Erro ao buscar painéis do usuário:', error);
      res.status(500).json({ 
        error: 'Erro ao buscar painéis' 
      });
    }
  }
);

/**
 * Funções auxiliares
 */

/**
 * Gera código único para painel
 */
async function generateUniqueCode() {
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    const code = generatePanelCode();
    
    // Verificar se código já existe
    const existing = await db.query(
      'SELECT id FROM panels WHERE id = $1',
      [code]
    );
    
    if (existing.rows.length === 0) {
      return code;
    }
    
    attempts++;
  }
  
  throw new Error('Não foi possível gerar código único');
}

/**
 * Obtém contagem de usuários ativos
 */
async function getActiveUserCount(panelId) {
  try {
    const result = await db.query(
      'SELECT COUNT(*) FROM active_users WHERE panel_id = $1',
      [panelId]
    );
    return parseInt(result.rows[0].count);
  } catch (error) {
    logger.error('Erro ao contar usuários ativos:', error);
    return 0;
  }
}

/**
 * Verifica se usuário está ativo no painel
 */
async function isUserActive(panelId, userId) {
  try {
    const result = await db.query(
      'SELECT id FROM active_users WHERE panel_id = $1 AND user_id = $2',
      [panelId, userId]
    );
    return result.rows.length > 0;
  } catch (error) {
    logger.error('Erro ao verificar usuário ativo:', error);
    return false;
  }
}

module.exports = router;