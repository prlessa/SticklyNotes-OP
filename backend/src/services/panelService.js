// backend/src/services/panelService.js
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/database');
const logger = require('../utils/logger');
const config = require('../config/config');

/**
 * Gera código único para painel
 */
function generatePanelCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Gera código único verificando duplicatas
 */
async function generateUniqueCode() {
  let attempts = 0;
  while (attempts < 10) {
    const code = generatePanelCode();
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
 * Cria um novo painel
 */
async function createPanel(panelData) {
  const { name, type, password, creator, userId, borderColor, backgroundColor } = panelData;
  
  // Validações básicas
  if (!name || !type || !creator || !userId) {
    throw new Error('Dados obrigatórios não fornecidos');
  }
  
  if (!['friends', 'couple'].includes(type)) {
    throw new Error('Tipo de painel inválido');
  }

  const code = await generateUniqueCode();
  const passwordHash = password ? await bcrypt.hash(password, 12) : null;
  const maxUsers = type === 'couple' ? 2 : 15;
  
  const defaultColors = config.getDefaultColors(type);
  const finalBorderColor = borderColor || defaultColors.border;
  const finalBackgroundColor = backgroundColor || defaultColors.background;

  const result = await db.query(`
    INSERT INTO panels (
      id, name, type, password_hash, creator, creator_id,
      border_color, background_color, max_users
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, name, type, creator, border_color, background_color, 
              max_users, created_at, last_activity
  `, [
    code, name, type, passwordHash, creator, userId,
    finalBorderColor, finalBackgroundColor, maxUsers
  ]);

  logger.info('Painel criado', { panelId: code, type, creator });
  return result.rows[0];
}

/**
 * Acessa um painel existente
 */
async function accessPanel(code, accessData) {
  const { password, userName, userId } = accessData;
  
  const result = await db.query(
    'SELECT * FROM panels WHERE id = $1',
    [code]
  );
  
  if (result.rows.length === 0) {
    throw new Error('Painel não encontrado');
  }
  
  const panel = result.rows[0];
  
  // Verificar senha se necessário
  if (panel.password_hash) {
    if (!password) {
      throw new Error('Senha é obrigatória para este painel');
    }
    
    const isValidPassword = await bcrypt.compare(password, panel.password_hash);
    if (!isValidPassword) {
      throw new Error('Senha incorreta');
    }
  }
  
  // Atualizar última atividade
  await db.query(
    'UPDATE panels SET last_activity = CURRENT_TIMESTAMP WHERE id = $1',
    [code]
  );
  
  // Remover senha do retorno
  const safePanel = { ...panel };
  delete safePanel.password_hash;
  
  logger.info('Acesso ao painel', { panelId: code, userId, userName });
  return safePanel;
}

/**
 * Busca posts de um painel
 */
async function getPanelPosts(panelId) {
  const result = await db.query(
    'SELECT * FROM posts WHERE panel_id = $1 ORDER BY created_at DESC',
    [panelId]
  );
  
  return result.rows;
}

/**
 * Cria um novo post
 */
async function createPost(panelId, postData) {
  const { content, author_id, author_name, color, position_x, position_y } = postData;
  
  if (!content || !author_id) {
    throw new Error('Conteúdo e autor são obrigatórios');
  }
  
  // Verificar se painel existe
  const panelCheck = await db.query(
    'SELECT type FROM panels WHERE id = $1',
    [panelId]
  );
  
  if (panelCheck.rows.length === 0) {
    throw new Error('Painel não encontrado');
  }
  
  const finalPositionX = position_x ?? Math.floor(Math.random() * 600) + 50;
  const finalPositionY = position_y ?? Math.floor(Math.random() * 300) + 50;
  const finalColor = color || '#A8D8EA';
  
  const result = await db.query(`
    INSERT INTO posts (
      panel_id, author_name, author_id, content, color, 
      position_x, position_y
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [
    panelId, 
    author_name || null,
    author_id,
    content,
    finalColor,
    finalPositionX,
    finalPositionY
  ]);
  
  // Atualizar última atividade do painel
  await db.query(
    'UPDATE panels SET last_activity = CURRENT_TIMESTAMP WHERE id = $1',
    [panelId]
  );
  
  logger.info('Post criado', { postId: result.rows[0].id, panelId, authorId: author_id });
  return result.rows[0];
}

/**
 * Atualiza posição do post
 */
async function updatePostPosition(postId, positionData) {
  const { position_x, position_y, panel_id } = positionData;
  
  const result = await db.query(
    'UPDATE posts SET position_x = $1, position_y = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
    [position_x, position_y, postId]
  );
  
  if (result.rows.length === 0) {
    throw new Error('Post não encontrado');
  }
  
  logger.info('Posição do post atualizada', { postId, newPosition: { x: position_x, y: position_y } });
  return result.rows[0];
}

/**
 * Deleta um post
 */
async function deletePost(postId, params) {
  const { panel_id } = params;
  
  const result = await db.query(
    'DELETE FROM posts WHERE id = $1 RETURNING *',
    [postId]
  );
  
  if (result.rows.length === 0) {
    throw new Error('Post não encontrado');
  }
  
  logger.info('Post deletado', { postId, panelId: panel_id });
  return result.rows[0];
}

/**
 * Inicializa o banco de dados
 */
async function initializeDatabase() {
  // Esta função é chamada pelo arquivo de database
  logger.info('Serviço de painéis inicializado');
}

module.exports = {
  createPanel,
  accessPanel,
  getPanelPosts,
  createPost,
  updatePostPosition,
  deletePost,
  initializeDatabase,
  db
};