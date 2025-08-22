/**
 * Rotas para gerenciamento de usuários ativos
 * Contém endpoints para controle de presença de usuários nos painéis
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { validators } = require('../utils/validators');
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
 * POST /api/users/:panelId/active
 * Marca usuário como ativo em um painel
 */
router.post('/:panelId/active',
  [
    param('panelId')
      .isLength({ min: 6, max: 6 })
      .isAlphanumeric()
      .withMessage('ID do painel inválido'),
    body('userId')
      .notEmpty()
      .withMessage('ID do usuário é obrigatório'),
    body('username')
      .isLength({ min: 2, max: 50 })
      .withMessage('Nome deve ter entre 2 e 50 caracteres')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { panelId } = req.params;
      const { userId, username } = req.body;
      const upperPanelId = panelId.toUpperCase();
      
      // Validar nome de usuário
      const usernameValidation = validators.username(username);
      if (!usernameValidation.isValid) {
        return res.status(400).json({
          error: usernameValidation.error
        });
      }
      
      // Verificar se painel existe
      const panelExists = await db.query(
        'SELECT id, max_users FROM panels WHERE id = $1',
        [upperPanelId]
      );
      
      if (panelExists.rows.length === 0) {
        return res.status(404).json({
          error: 'Painel não encontrado'
        });
      }
      
      const panel = panelExists.rows[0];
      
      // Verificar limite de usuários
      const activeCount = await db.query(
        'SELECT COUNT(*) FROM active_users WHERE panel_id = $1',
        [upperPanelId]
      );
      
      const currentCount = parseInt(activeCount.rows[0].count);
      
      // Verificar se usuário já está ativo
      const userExists = await db.query(
        'SELECT id FROM active_users WHERE panel_id = $1 AND user_id = $2',
        [upperPanelId, userId]
      );
      
      if (userExists.rows.length === 0 && currentCount >= panel.max_users) {
        return res.status(403).json({
          error: `Painel lotado (máximo ${panel.max_users} usuários)`
        });
      }
      
      // Inserir ou atualizar usuário ativo
      await db.query(`
        INSERT INTO active_users (panel_id, user_id, username)
        VALUES ($1, $2, $3)
        ON CONFLICT (panel_id, user_id)
        DO UPDATE SET 
          username = $3,
          last_seen = CURRENT_TIMESTAMP
      `, [upperPanelId, userId, usernameValidation.value]);
      
      logger.info('Usuário marcado como ativo', {
        panelId: upperPanelId,
        userId,
        username: usernameValidation.value
      });
      
      res.status(201).json({ 
        success: true,
        message: 'Usuário ativo registrado'
      });
      
    } catch (error) {
      logger.error('Erro ao marcar usuário como ativo:', error);
      res.status(500).json({
        error: 'Erro interno do servidor'
      });
    }
  }
);

/**
 * GET /api/users/:panelId/active
 * Lista usuários ativos em um painel
 */
router.get('/:panelId/active',
  [
    param('panelId')
      .isLength({ min: 6, max: 6 })
      .isAlphanumeric()
      .withMessage('ID do painel inválido')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { panelId } = req.params;
      const upperPanelId = panelId.toUpperCase();
      
      // Verificar se painel existe
      const panelExists = await db.query(
        'SELECT id FROM panels WHERE id = $1',
        [upperPanelId]
      );
      
      if (panelExists.rows.length === 0) {
        return res.status(404).json({
          error: 'Painel não encontrado'
        });
      }
      
      // Buscar usuários ativos (últimos 10 minutos)
      const result = await db.query(`
        SELECT user_id, username, joined_at, last_seen
        FROM active_users 
        WHERE panel_id = $1 
          AND last_seen > NOW() - INTERVAL '10 minutes'
        ORDER BY joined_at ASC
      `, [upperPanelId]);
      
      res.json(result.rows);
      
    } catch (error) {
      logger.error('Erro ao buscar usuários ativos:', error);
      res.status(500).json({
        error: 'Erro ao buscar usuários ativos'
      });
    }
  }
);

/**
 * DELETE /api/users/:panelId/active/:userId
 * Remove usuário da lista de ativos
 */
router.delete('/:panelId/active/:userId',
  [
    param('panelId')
      .isLength({ min: 6, max: 6 })
      .isAlphanumeric()
      .withMessage('ID do painel inválido'),
    param('userId')
      .notEmpty()
      .withMessage('ID do usuário é obrigatório')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { panelId, userId } = req.params;
      const upperPanelId = panelId.toUpperCase();
      
      // Remover usuário da lista de ativos
      const result = await db.query(
        'DELETE FROM active_users WHERE panel_id = $1 AND user_id = $2 RETURNING *',
        [upperPanelId, userId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Usuário não encontrado na lista de ativos'
        });
      }
      
      logger.info('Usuário removido da lista de ativos', {
        panelId: upperPanelId,
        userId
      });
      
      res.status(204).send();
      
    } catch (error) {
      logger.error('Erro ao remover usuário ativo:', error);
      res.status(500).json({
        error: 'Erro ao remover usuário'
      });
    }
  }
);

/**
 * PUT /api/users/:panelId/heartbeat/:userId
 * Atualiza heartbeat do usuário (manter ativo)
 */
router.put('/:panelId/heartbeat/:userId',
  [
    param('panelId')
      .isLength({ min: 6, max: 6 })
      .isAlphanumeric()
      .withMessage('ID do painel inválido'),
    param('userId')
      .notEmpty()
      .withMessage('ID do usuário é obrigatório')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { panelId, userId } = req.params;
      const upperPanelId = panelId.toUpperCase();
      
      // Atualizar último visto
      const result = await db.query(
        'UPDATE active_users SET last_seen = CURRENT_TIMESTAMP WHERE panel_id = $1 AND user_id = $2 RETURNING *',
        [upperPanelId, userId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Usuário não está ativo neste painel'
        });
      }
      
      res.json({ 
        success: true,
        last_seen: result.rows[0].last_seen
      });
      
    } catch (error) {
      logger.error('Erro ao atualizar heartbeat:', error);
      res.status(500).json({
        error: 'Erro ao atualizar heartbeat'
      });
    }
  }
);

/**
 * DELETE /api/users/:panelId/participants/:userId
 * Remove usuário permanentemente do painel (sair definitivamente)
 */
router.delete('/:panelId/participants/:userId',
  [
    param('panelId')
      .isLength({ min: 6, max: 6 })
      .isAlphanumeric()
      .withMessage('ID do painel inválido'),
    param('userId')
      .notEmpty()
      .withMessage('ID do usuário é obrigatório')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { panelId, userId } = req.params;
      const upperPanelId = panelId.toUpperCase();
      
      // Usar transação para remover de ambas as tabelas
      await db.transaction(async (client) => {
        // Remover da tabela de participantes
        await client.query(
          'DELETE FROM panel_participants WHERE panel_id = $1 AND user_id = $2',
          [upperPanelId, userId]
        );
        
        // Remover da tabela de usuários ativos
        await client.query(
          'DELETE FROM active_users WHERE panel_id = $1 AND user_id = $2',
          [upperPanelId, userId]
        );
      });
      
      logger.info('Usuário removido permanentemente do painel', {
        panelId: upperPanelId,
        userId
      });
      
      res.status(204).send();
      
    } catch (error) {
      logger.error('Erro ao remover participante:', error);
      res.status(500).json({
        error: 'Erro ao remover participante'
      });
    }
  }
);

/**
 * GET /api/users/:userId/panels
 * Busca painéis que o usuário participa
 */
router.get('/:userId/panels',
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
 * GET /api/users/:panelId/count/:userId
 * Conta painéis ativos do usuário por tipo
 */
router.get('/:panelId/count/:userId',
  [
    param('panelId')
      .isLength({ min: 6, max: 6 })
      .isAlphanumeric()
      .withMessage('ID do painel inválido'),
    param('userId')
      .notEmpty()
      .withMessage('ID do usuário é obrigatório')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { panelId, userId } = req.params;
      const upperPanelId = panelId.toUpperCase();
      
      // Buscar tipo do painel atual
      const panelResult = await db.query(
        'SELECT type FROM panels WHERE id = $1',
        [upperPanelId]
      );
      
      if (panelResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Painel não encontrado'
        });
      }
      
      const panelType = panelResult.rows[0].type;
      
      // Contar painéis do mesmo tipo que o usuário está ativo
      const countResult = await db.query(`
        SELECT COUNT(DISTINCT p.id) as count
        FROM panels p
        INNER JOIN active_users au ON p.id = au.panel_id
        WHERE au.user_id = $1 
          AND p.type = $2
          AND au.last_seen > NOW() - INTERVAL '10 minutes'
      `, [userId, panelType]);
      
      res.json({
        count: parseInt(countResult.rows[0].count),
        type: panelType
      });
      
    } catch (error) {
      logger.error('Erro ao contar painéis do usuário:', error);
      res.status(500).json({
        error: 'Erro ao contar painéis'
      });
    }
  }
);

/**
 * Middleware de limpeza automática de usuários inativos
 * Remove usuários que não enviaram heartbeat há mais de 10 minutos
 */
router.use('/cleanup', async (req, res, next) => {
  try {
    const result = await db.query(`
      DELETE FROM active_users 
      WHERE last_seen < NOW() - INTERVAL '10 minutes'
      RETURNING panel_id, user_id
    `);
    
    if (result.rows.length > 0) {
      logger.info(`Removidos ${result.rows.length} usuários inativos`);
    }
    
    res.json({
      success: true,
      removedUsers: result.rows.length
    });
    
  } catch (error) {
    logger.error('Erro na limpeza de usuários inativos:', error);
    res.status(500).json({
      error: 'Erro na limpeza'
    });
  }
});

module.exports = router;