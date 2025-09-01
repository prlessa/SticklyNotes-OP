/**
 * Rotas para gerenciamento de posts
 * Contém todos os endpoints relacionados aos posts
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { db, cache } = require('../config/database');
const { authenticateToken } = require('./authRoutes');
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
 * PATCH /api/posts/:postId/position
 * Atualiza a posição de um post
 */
router.patch('/:postId/position', authenticateToken,
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
      
      // Verificar se post existe e se pertence ao usuário ou está no painel correto
      const existingPost = await db.query(
        'SELECT panel_id, author_user_id FROM posts WHERE id = $1',
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
      
      console.log('✅ Posição do post atualizada:', {
        postId,
        panelId: panel_id.toUpperCase(),
        newPosition: { x: position_x, y: position_y }
      });
      
      res.json(post);
      
    } catch (error) {
      console.error('❌ Erro ao atualizar posição do post:', error);
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
router.delete('/:postId', authenticateToken,
  [
    param('postId')
      .isUUID()
      .withMessage('ID do post inválido'),
    query('panel_id')
      .isLength({ min: 6, max: 6 })
      .withMessage('ID do painel é obrigatório')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { postId } = req.params;
      const { panel_id } = req.query;
      const userId = req.user.userId;
      
      // Buscar post com informações de autorização
      const postResult = await db.query(
        'SELECT author_user_id, panel_id FROM posts WHERE id = $1',
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
        post.author_user_id === userId || // Autor do post
        post.author_user_id === null; // Post anônimo (qualquer um pode deletar)
      
      if (!canDelete) {
        return res.status(403).json({
          error: 'Sem permissão para deletar este post'
        });
      }
      
      // Deletar post
      await db.query('DELETE FROM posts WHERE id = $1', [postId]);
      
      // Invalidar cache de posts
      await cache.invalidate(`posts:${panel_id.toUpperCase()}`);
      
      console.log('✅ Post deletado com sucesso:', {
        postId,
        panelId: panel_id.toUpperCase(),
        authorId: post.author_user_id
      });
      
      res.status(204).send();
      
    } catch (error) {
      console.error('❌ Erro ao deletar post:', error);
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
router.get('/:postId', authenticateToken,
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
      console.error('❌ Erro ao buscar post:', error);
      res.status(500).json({ 
        error: 'Erro ao buscar post' 
      });
    }
  }
);

module.exports = router;