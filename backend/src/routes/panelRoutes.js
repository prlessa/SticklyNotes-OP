/**
 * Rotas para gerenciamento de painéis - Versão corrigida
 * ADICIONADA: Rota específica para acesso via link
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { db, cache } = require('../config/database');
const { authenticateToken } = require('./authRoutes');
const { validatePanelCreation } = require('../utils/validators');
const { generatePanelCode, hashPassword, verifyPassword } = require('../utils/security');
const config = require('../config/config');
const logger = require('../utils/logger');
const { 
  linkAccessRateLimiter, 
  panelCreationLimiter, 
  panelAccessLimiter, 
  postCreationLimiter 
} = require('../utils/rateLimiters');
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
 * NOVA ROTA: GET /api/panels/link/:code
 * Acessa um painel via link direto (para usuários autenticados)
 * Esta rota NÃO requer senha - é usada para links de convite
 */
router.get('/link/:code', authenticateToken,
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
      const userId = req.user.userId;
      const upperCode = code.toUpperCase();
      
      console.log(`🔗 Acesso via link - Código: ${upperCode}, Usuário: ${userId}`);
      
      // Buscar dados do usuário
      const userResult = await db.query(
        'SELECT first_name, last_name FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      const user = userResult.rows[0];
      const userName = `${user.first_name} ${user.last_name}`;
      
      // Tentar obter do cache primeiro
      let panel = await cache.getCachedPanel(upperCode);
      
      if (!panel) {
        // Buscar no banco se não estiver em cache
        const result = await db.query(
          'SELECT * FROM panels WHERE id = $1',
          [upperCode]
        );
        
        if (result.rows.length === 0) {
          console.log(`⚠️ Painel não encontrado: ${upperCode}`);
          return res.status(404).json({ 
            error: 'Painel não encontrado ou link expirado' 
          });
        }
        
        panel = result.rows[0];
      }
      
      // Verificar limite de usuários
      const activeCount = await getActiveUserCount(upperCode);
      const isUserAlreadyActive = await isUserActive(upperCode, userId);
      
      if (!isUserAlreadyActive && activeCount >= panel.max_users) {
        console.log(`⚠️ Painel lotado: ${upperCode} (${activeCount}/${panel.max_users})`);
        return res.status(403).json({ 
          error: `Painel lotado (máximo ${panel.max_users} usuários)` 
        });
      }
      
 // Adicionar/atualizar como participante e MARCAR COMO LIDO
      await db.query(`
        INSERT INTO panel_participants (panel_id, user_id, username, user_uuid, last_access)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (panel_id, user_uuid) 
        DO UPDATE SET 
          username = $3,
          last_access = CURRENT_TIMESTAMP
      `, [upperCode, `user_${userId}`, userName, userId]);
      
      // Atualizar última atividade do painel
      await db.query(
        'UPDATE panels SET last_activity = CURRENT_TIMESTAMP WHERE id = $1',
        [upperCode]
      );
      
      // Cachear painel (sem senha)
      const safePanel = { ...panel };
      delete safePanel.password_hash;
      await cache.cachePanel(upperCode, safePanel);
      
      console.log(`✅ Acesso via link bem-sucedido: ${upperCode} por ${userName}`);
      
      res.json(safePanel);
      
    } catch (error) {
      console.error('❌ Erro no acesso via link:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }
);

/**
 * GET /api/panels/:code/posts
 * Obtém posts de um painel
 */
router.get('/:code/posts', authenticateToken,
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
      const panelResult = await db.query(
        'SELECT id FROM panels WHERE id = $1',
        [upperCode]
      );
      
      if (panelResult.rows.length === 0) {
        return res.status(404).json({ 
          error: 'Painel não encontrado' 
        });
      }
      
      // Buscar posts
      const result = await db.query(
        'SELECT * FROM posts WHERE panel_id = $1 ORDER BY created_at DESC',
        [upperCode]
      );
      
      res.json(result.rows);
      
    } catch (error) {
      console.error('❌ Erro ao buscar posts:', error);
      res.status(500).json({ 
        error: 'Erro ao buscar posts' 
      });
    }
  }
);

/**
 * POST /api/panels/:code/posts
 * Cria um novo post em um painel
 */
router.post('/:code/posts', authenticateToken,
  [
    param('code')
      .isLength({ min: 6, max: 6 })
      .isAlphanumeric()
      .withMessage('Código inválido'),
    body('content')
      .isLength({ min: 1, max: 1000 })
      .withMessage('Conteúdo deve ter entre 1 e 1000 caracteres'),
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
      .withMessage('Posição Y inválida'),
    body('anonymous')
      .optional()
      .isBoolean()
      .withMessage('Anonymous deve ser boolean')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { code } = req.params;
      const upperCode = code.toUpperCase();
      const userId = req.user.userId;
      
      // Buscar dados do usuário
      const userResult = await db.query(
        'SELECT first_name, last_name FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      const user = userResult.rows[0];
      const authorName = req.body.anonymous ? null : `${user.first_name} ${user.last_name}`;
      
      // Verificar se painel existe e obter tipo
      const panelResult = await db.query(
        'SELECT type, post_count, max_users FROM panels WHERE id = $1',
        [upperCode]
      );
      
      if (panelResult.rows.length === 0) {
        return res.status(404).json({ 
          error: 'Painel não encontrado' 
        });
      }
      
      const panel = panelResult.rows[0];
      
      // Verificar limite de posts por painel
      if (panel.post_count >= (config.limits?.maxPostsPerPanel || 500)) {
        return res.status(403).json({
          error: `Limite de posts atingido`
        });
      }
      
      // Definir cor padrão se não fornecida
      const defaultColors = config.getDefaultColors ? config.getDefaultColors(panel.type) : { note: '#A8D8EA' };
      const color = req.body.color || defaultColors.note || '#A8D8EA';
      
      // Posições aleatórias se não fornecidas
      const positionX = req.body.position_x ?? Math.floor(Math.random() * 600) + 50;
      const positionY = req.body.position_y ?? Math.floor(Math.random() * 300) + 50;
      
      // Criar post no banco
      const result = await db.query(`
        INSERT INTO posts (
          panel_id, author_name, author_id, author_user_id, content, color, 
          position_x, position_y
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        upperCode, 
        authorName,
        `user_${userId}`,
        userId,
        req.body.content,
        color,
        positionX,
        positionY
      ]);
      
      const post = result.rows[0];
      
      // Invalidar cache de posts
      await cache.invalidate(`posts:${upperCode}`);
      
      // Atualizar última atividade do painel
      await db.query(
        'UPDATE panels SET last_activity = CURRENT_TIMESTAMP WHERE id = $1',
        [upperCode]
      );
      
      // Emitir via WebSocket para todos no painel
      const io = req.app.get('io');
      if (io) {
        io.to(`panel:${upperCode}`).emit('new-post', post);
      }
      
      console.log('✅ Post criado com sucesso:', {
        postId: post.id,
        panelId: upperCode,
        authorId: userId,
        hasAuthorName: !!authorName
      });
      
      res.status(201).json(post);
      
    } catch (error) {
      console.error('❌ Erro ao criar post:', error);
      res.status(500).json({ 
        error: 'Erro ao criar post' 
      });
    }
  }
);

/**
 * POST /api/panels
 * Cria um novo painel (requer autenticação)
 */
router.post('/', authenticateToken,
  [
    body('name')
      .isLength({ min: 3, max: 100 })
      .withMessage('Nome deve ter entre 3 e 100 caracteres'),
    body('type')
      .isIn(['friends', 'couple', 'family'])
      .withMessage('Tipo deve ser friends, couple ou family'),
    body('password')
      .optional()
      .isLength({ max: 100 })
      .withMessage('Senha muito longa'),
    body('backgroundColor')
      .optional()
      .matches(/^#[0-9A-Fa-f]{6}$/)
      .withMessage('Cor de fundo inválida')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { name, type, password, backgroundColor } = req.body;
      const userId = req.user.userId;

      console.log('🔄 Criando painel:', {
        name,
        type,
        userId,
        hasPassword: !!password
      });

      // Buscar dados do usuário
      const userResult = await db.query(
        'SELECT first_name, last_name FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      const user = userResult.rows[0];
      const creatorName = `${user.first_name} ${user.last_name}`;

      // Gerar código único
      const code = await generateUniqueCode();
      
      // Hash da senha se fornecida
      const passwordHash = await hashPassword(password);
      
      // Configurações baseadas no tipo
      let maxUsers;
      switch (type) {
        case 'couple': maxUsers = 2; break;
        case 'family': maxUsers = 10; break;
        default: maxUsers = 15; break;
      }
      
      // Cor padrão se não fornecida
      const defaultColors = getDefaultColors(type);
      const finalBackgroundColor = backgroundColor || defaultColors.background;
      
      console.log('📋 Dados do painel:', {
        code,
        creatorName,
        maxUsers,
        finalBackgroundColor
      });
      
      // ✅ CORREÇÃO: Inserir no banco usando transação E adicionar participante
      const panel = await db.transaction(async (client) => {
        // Criar painel
        const panelResult = await client.query(`
          INSERT INTO panels (
            id, name, type, password_hash, creator, creator_id, creator_user_id,
            background_color, max_users
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id, name, type, creator, background_color, 
                    max_users, created_at, last_activity
        `, [
          code, name, type, passwordHash,
          creatorName, `user_${userId}`, userId,
          finalBackgroundColor, maxUsers
        ]);
        
        console.log('✅ Painel criado no banco:', panelResult.rows[0].id);
        
        // ✅ CRÍTICO: Adicionar criador como participante PERMANENTE
        const participantResult = await client.query(`
          INSERT INTO panel_participants (panel_id, user_id, username, user_uuid, joined_at, last_access)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING id
        `, [code, `user_${userId}`, creatorName, userId]);
        
        console.log('✅ Criador adicionado como participante:', {
          panelId: code,
          participantId: participantResult.rows[0].id,
          userId,
          userName: creatorName
        });
        
        return panelResult.rows[0];
      });
      
      // ✅ IMPORTANTE: Retornar dados completos para o frontend
      const responsePanel = {
        ...panel,
        post_count: 0,
        active_users: 0
      };
      
      console.log('🎉 Painel criado com sucesso - Response:', responsePanel);
      
      res.status(201).json(responsePanel);
      
    } catch (error) {
      console.error('❌ Erro detalhado ao criar painel:', {
        message: error.message,
        stack: error.stack,
        code: error.code,
        constraint: error.constraint
      });
      
      if (error.code === '23505') {
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
 * Acessa um painel existente (requer autenticação e possivelmente senha)
 */
router.post('/:code', authenticateToken,
  [
    param('code')
      .isLength({ min: 6, max: 6 })
      .isAlphanumeric()
      .withMessage('Código inválido'),
    body('password')
      .optional()
      .isLength({ max: 100 })
      .withMessage('Senha muito longa')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { code } = req.params;
      const { password } = req.body;
      const userId = req.user.userId;
      const upperCode = code.toUpperCase();
      
      // Buscar dados do usuário
      const userResult = await db.query(
        'SELECT first_name, last_name FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      const user = userResult.rows[0];
      const userName = `${user.first_name} ${user.last_name}`;
      
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
          console.log('⚠️ Tentativa de acesso com senha incorreta:', {
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
      
// Adicionar/atualizar como participante e MARCAR COMO LIDO
      await db.query(`
        INSERT INTO panel_participants (panel_id, user_id, username, user_uuid, last_access)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (panel_id, user_uuid) 
        DO UPDATE SET 
          username = $3,
          last_access = CURRENT_TIMESTAMP
      `, [upperCode, `user_${userId}`, userName, userId]);
      
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
      
      console.log('✅ Acesso ao painel realizado:', {
        panelId: upperCode,
        userId,
        userName,
        hasPassword: !!panel.password_hash
      });
      
      res.json(safePanel);
      
    } catch (error) {
      console.error('❌ Erro ao acessar painel:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }
);
/**
 * DELETE /api/panels/:code/leave
 * REGRA 1: Usuário sai do mural (desvincula)
 * REGRA 2: Se mural ficar órfão, deleta IMEDIATAMENTE
 */
router.delete('/:code/leave', authenticateToken,
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
      const userId = req.user.userId;
      const upperCode = code.toUpperCase();
      
      console.log(`🚪 REGRA 1: Usuário ${userId} saindo do mural ${upperCode}`);
      
      let panelDeleted = false;
      
      await db.transaction(async (client) => {
        // 1. Remover usuário dos participantes permanentes
        const participantResult = await client.query(
          'DELETE FROM panel_participants WHERE panel_id = $1 AND user_uuid = $2 RETURNING username',
          [upperCode, userId]
        );
        
        if (participantResult.rows.length === 0) {
          throw new Error('Usuário não estava vinculado a este mural');
        }
        
        console.log(`   ✅ Removido participante: ${participantResult.rows[0].username}`);
        
        // 2. Remover da sessão ativa
        await client.query(
          'DELETE FROM active_users WHERE panel_id = $1 AND user_uuid = $2',
          [upperCode, userId]
        );
        
        // 3. REGRA 2: Verificar se mural ficou órfão
        const remainingParticipants = await client.query(
          'SELECT COUNT(*) as count FROM panel_participants WHERE panel_id = $1',
          [upperCode]
        );
        
        const participantCount = parseInt(remainingParticipants.rows[0].count);
        
        if (participantCount === 0) {
          console.log(`🗑️ REGRA 2: Mural ${upperCode} ficou órfão - DELETANDO IMEDIATAMENTE`);
          
          // Obter informações do painel antes de deletar
          const panelInfo = await client.query(
            'SELECT name, (SELECT COUNT(*) FROM posts WHERE panel_id = $1) as post_count FROM panels WHERE id = $1',
            [upperCode]
          );
          
          if (panelInfo.rows.length > 0) {
            const { name, post_count } = panelInfo.rows[0];
            
            // Deletar tudo imediatamente
            const deletedPosts = await client.query('DELETE FROM posts WHERE panel_id = $1 RETURNING id', [upperCode]);
            await client.query('DELETE FROM active_users WHERE panel_id = $1', [upperCode]);
            await client.query('DELETE FROM panels WHERE id = $1', [upperCode]);
            
            console.log(`✅ Mural órfão deletado imediatamente: ${upperCode} (${name}) - ${deletedPosts.rows.length} posts removidos`);
            panelDeleted = true;
          }
        } else {
          console.log(`   📊 Participantes restantes no mural ${upperCode}: ${participantCount}`);
        }
      });
      
      // Invalidar cache se painel foi deletado
      if (panelDeleted && cache && cache.invalidate) {
        await cache.invalidate(`panel:${upperCode}`);
        await cache.invalidate(`posts:${upperCode}`);
      }
      
      console.log(`✅ Usuário ${userId} saiu do mural ${upperCode}${panelDeleted ? ' (mural deletado)' : ''}`);
      
      res.status(204).send();
      
    } catch (error) {
      console.error('❌ Erro ao sair do mural:', error);
      res.status(500).json({
        error: error.message || 'Erro ao sair do mural'
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
 * Obtém cores padrão baseadas no tipo
 */
function getDefaultColors(type) {
  switch (type) {
    case 'couple':
      return { background: '#FFE8E8' };
    case 'family':
      return { background: '#F0F9E8' };
    default:
      return { background: '#FBFBFB' };
  }
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
    console.error('❌ Erro ao contar usuários ativos:', error);
    return 0;
  }
}

/**
 * Verifica se usuário está ativo no painel
 */
async function isUserActive(panelId, userId) {
  try {
    const result = await db.query(
      'SELECT id FROM active_users WHERE panel_id = $1 AND user_uuid = $2',
      [panelId, userId]
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error('❌ Erro ao verificar usuário ativo:', error);
    return false;
  }
}
/**
 * Função auxiliar para atualizar last_activity sempre que há atividade
 */
async function updatePanelActivity(panelId) {
  try {
    await db.query(
      'UPDATE panels SET last_activity = CURRENT_TIMESTAMP WHERE id = $1',
      [panelId]
    );
    console.log(`📅 Atividade atualizada para painel ${panelId}`);
  } catch (error) {
    console.error('Erro ao atualizar atividade do painel:', error);
  }
}

module.exports = router;