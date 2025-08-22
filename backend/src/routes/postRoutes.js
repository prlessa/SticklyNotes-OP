/**
 * Rotas para gerenciamento de posts
 * Contém todos os endpoints relacionados aos posts
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { db, cache } = require('../config/database');
const { validatePostCreation } = require('../utils/validators');
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
 * POST /api/posts/:panelId
 * Cria um novo post em um painel
 */
router.post('/:panelId',
  [
    param('panelId')
      .isLength({ min: 6, max: 6 })
      .isAlphanumeric()
      .withMessage('ID do painel inválido'),
    body('content')
      .isLength({ min: 1, max: 1000 })
      .withMessage('Conteúdo deve ter entre 1 e 1000 caracteres'),
    body('author_id')
      .notEmpty()
      .withMessage('ID do autor é obrigatório'),
    body('author_name')
      .optional()
      .isLength({ max: 50 })
      .withMessage('Nome do autor muito longo'),
    body('color')
      .optional()
      .matches(/^#[0-9A-Fa-f]{6}$/)
      .withMessage('Cor inválida'),
    body('position_x')
      .optional()
      .isInt({ min: 0, max: 2000 })
      .withMessage('Posição X inválida'),
    body('position_y')
      .optional()
      .isInt({ min: 0, max: 2000 })
      .withMessage('Posição Y inválida')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { panelId } = req.params;
      const upperPanelId = panelId.toUpperCase();
      
      // Verificar se painel existe e obter tipo
      const panelResult = await db.query(
        'SELECT type, post_count, max_users FROM panels WHERE id = $1',
        [upperPanelId]
      );
      
      if (panelResult.rows.length === 0) {
        return res.status(404).json({ 
          error: 'Painel não encontrado' 
        });
      }
      
      const panel = panelResult.rows[0];
      
      // Verificar limite de posts por painel
      if (panel.post_count >= config.limits.maxPostsPerPanel) {
        return res.status(403).json({
          error: `Limite de ${config.limits.maxPostsPerPanel} posts atingido`
        });
      }
      
      // Validar dados do post
      const validation = validatePostCreation(req.body, panel.type);
      if (!validation.isValid) {
        return res.status(400).json({
          error: 'Dados inválidos',
          details: validation.errors
        });
      }
      
      const validData = validation.data;
      
      // Verificar se mensagens anônimas são permitidas
      if (!validData.author_name && panel.type === 'couple') {
        return res.status(400).json({
          error: 'Mensagens anônimas não são permitidas em painéis de casal'
        });
      }
      
      // Definir cor padrão se não fornecida
      const defaultColors = config.getDefaultColors(panel.type);
      const color = validData.color || defaultColors.note;
      
      // Validar se a cor é permitida para o tipo do painel
      if (!config.isValidColor(color, panel.type, 'notes')) {
        return res.status(400).json({
          error: 'Cor não permitida para este tipo de painel'
        });
      }
      
      // Posições aleatórias se não fornecidas
      const positionX = validData.position_x ?? Math.floor(Math.random() * 600) + 50;
      const positionY = validData.position_y ?? Math.floor(Math.random() * 300) + 50;
      
      // Criar post no banco
      const result = await db.query(`
        INSERT INTO posts (
          panel_id, author_name, author_id, content, color, 
          position_x, position_y
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        upperPanelId, 
        validData.author_name || null,
        req.body.author_id,
        validData.content,
        color,
        positionX,
        positionY
      ]);
      
      const post = result.rows[0];
      
      // Invalidar cache de posts
      await cache.invalidate(`posts:${upperPanelId}`);
      
      // Atualizar última atividade do painel
      await db.query(
        'UPDATE panels SET last_activity = CURRENT_TIMESTAMP WHERE id = $1',
        [upperPanelId]
      );
      
      // Notificar via WebSocket (será feito no servidor principal)
      // Para isso, vamos armazenar o post no contexto da requisição
      req.newPost = post;
      req.panelId = upperPanelId;
      
      logger.info('Post criado com sucesso', {
        postId: post.id,
        panelId: upperPanelId,
        authorId: req.body.author_id,
        hasAuthorName: !!validData.author_name
      });
      
      res.status(201).json(post);
      
    } catch (error) {
      logger.error('Erro ao criar post:', error);
      res.status(500).json({ 
        error: 'Erro ao criar post' 
      });
    }
  }
);

/**
 * PATCH /api/posts/:postId/position
 * Atualiza a posição de um post
 */
router.patch('/:postId/position',
  [
    param('postId')
      .isUUID()
      .withMessage('ID do post inválido'),
    body('position_x')
      .isInt({ min: 0, max: 2000 })
      .withMessage('Posição X inválida'),
    body('position_y')
      .isInt({ min: 0, max: 2000 })
      .withMessage('Posição Y inválida'),
    body('panel_id')
      .isLength({ min: 6, max: 6 })
      .withMessage('ID do painel inválido')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { postId } = req.params;
      const { position_x, position_y, panel_id } = req.body;
      
      // Verificar se post existe
      const existingPost = await db.query(
        'SELECT panel_id FROM posts WHERE id = $1',
        [postId]
      );
      
      if (existingPost.rows.length === 0) {
        return res.status(404).json({ 
          error: 'Post não encontrado' 
        });
      }
      
      // Verificar se o panel_id corresponde
      if (existingPost.rows[0].panel_id !== panel_id.toUpperCase()) {
        return res.status(400).json({
          error: 'ID do painel não corresponde ao post'
        });
      }
      
      // Atualizar posição
      const result = await db.query(
        'UPDATE posts SET position_x = $1, position_y = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
        [position_x, position_y, postId]
      );
      
      const post = result.rows[0];
      
      // Invalidar cache de posts
      await cache.invalidate(`posts:${panel_id.toUpperCase()}`);
      
      // Armazenar para notificação WebSocket
      req.movedPost = post;
      req.panelId = panel_id.toUpperCase();
      
      logger.info('Posição do post atualizada', {
        postId,
        panelId: panel_id.toUpperCase(),
        newPosition: { x: position_x, y: position_y }
      });
      
      res.json(post);
      
    } catch (error) {
      logger.error('Erro ao atualizar posição do post:', error);
      res.status(500).json({ 
        error: 'Erro ao atualizar posição' 
      });
    }
  }
);

/**
 * DELETE /api/posts/:postId
 * Deleta um post
 */
router.delete('/:postId',
  [
    param('postId')
      .isUUID()
      .withMessage('ID do post inválido'),
    query('panel_id')
      .isLength({ min: 6, max: 6 })
      .withMessage('ID do painel é obrigatório'),
    query('author_id')
      .optional()
      .notEmpty()
      .withMessage('ID do autor inválido')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { postId } = req.params;
      const { panel_id, author_id } = req.query;
      
      // Buscar post com informações de autorização
      const postResult = await db.query(
        'SELECT author_id, panel_id FROM posts WHERE id = $1',
        [postId]
      );
      
      if (postResult.rows.length === 0) {
        return res.status(404).json({ 
          error: 'Post não encontrado' 
        });
      }
      
      const post = postResult.rows[0];
      
      // Verificar se o panel_id corresponde
      if (post.panel_id !== panel_id.toUpperCase()) {
        return res.status(400).json({
          error: 'ID do painel não corresponde ao post'
        });
      }
      
      // Verificar permissões de deleção
      const canDelete = 
        post.author_id === author_id || // Autor do post
        post.author_id === null; // Post anônimo
      
      if (!canDelete) {
        return res.status(403).json({
          error: 'Sem permissão para deletar este post'
        });
      }
      
      // Deletar post
      await db.query('DELETE FROM posts WHERE id = $1', [postId]);
      
      // Invalidar cache de posts
      await cache.invalidate(`posts:${panel_id.toUpperCase()}`);
      
      // Armazenar para notificação WebSocket
      req.deletedPostId = postId;
      req.panelId = panel_id.toUpperCase();
      
      logger.info('Post deletado com sucesso', {
        postId,
        panelId: panel_id.toUpperCase(),
        authorId: post.author_id
      });
      
      res.status(204).send();
      
    } catch (error) {
      logger.error('Erro ao deletar post:', error);
      res.status(500).json({ 
        error: 'Erro ao deletar post' 
      });
    }
  }
);

/**
 * GET /api/posts/:postId
 * Busca um post específico
 */
router.get('/:postId',
  [
    param('postId')
      .isUUID()
      .withMessage('ID do post inválido')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { postId } = req.params;
      
      const result = await db.query(
        'SELECT * FROM posts WHERE id = $1',
        [postId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ 
          error: 'Post não encontrado' 
        });
      }
      
      res.json(result.rows[0]);
      
    } catch (error) {
      logger.error('Erro ao buscar post:', error);
      res.status(500).json({ 
        error: 'Erro ao buscar post' 
      });
    }
  }
);

/**
 * Middleware para notificações WebSocket
 * Este middleware deve ser usado depois das rotas para capturar os dados
 */
router.use((req, res, next) => {
  // Este middleware será chamado após o processamento das rotas
  // Pode ser usado para enviar notificações WebSocket
  
  if (req.newPost && req.panelId) {
    // Notificar criação de post via WebSocket
    const io = req.app.get('io');
    if (io) {
      io.to(`panel:${req.panelId}`).emit('new-post', req.newPost);
    }
  }
  
  if (req.movedPost && req.panelId) {
    // Notificar movimento de post via WebSocket
    const io = req.app.get('io');
    if (io) {
      io.to(`panel:${req.panelId}`).emit('post-moved', req.movedPost);
    }
  }
  
  if (req.deletedPostId && req.panelId) {
    // Notificar deleção de post via WebSocket
    const io = req.app.get('io');
    if (io) {
      io.to(`panel:${req.panelId}`).emit('post-deleted', { postId: req.deletedPostId });
    }
  }
  
  next();
});

module.exports = router;