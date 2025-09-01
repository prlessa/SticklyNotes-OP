const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const config = require('../config/config');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Middleware para validação de erros
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('❌ Validation errors:', errors.array());
    return res.status(400).json({
      error: 'Dados inválidos',
      details: errors.array()
    });
  }
  next();
};

/**
 * Middleware para verificar JWT
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  console.log('🔍 Token recebido:', token ? 'Presente' : 'Ausente');

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso requerido' });
  }

  jwt.verify(token, config.security.jwtSecret, (err, user) => {
    if (err) {
      console.log('❌ JWT verification failed:', err.message);
      return res.status(403).json({ error: 'Token inválido' });
    }
    req.user = user;
    next();
  });
};

/**
 * POST /api/auth/register
 * Registra um novo usuário
 */
router.post('/register',
  [
    body('firstName')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Nome deve ter entre 2 e 50 caracteres')
      .matches(/^[a-zA-ZÀ-ÿ\u00f1\u00d1\s]+$/)
      .withMessage('Nome deve conter apenas letras e espaços'),
    body('lastName')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Sobrenome deve ter entre 2 e 50 caracteres')
      .matches(/^[a-zA-ZÀ-ÿ\u00f1\u00d1\s]+$/)
      .withMessage('Sobrenome deve conter apenas letras e espaços'),
    body('email')
      .isEmail()
      .withMessage('Email inválido')
      .normalizeEmail()
      .isLength({ max: 255 })
      .withMessage('Email muito longo'),
    body('password')
      .isLength({ min: 6, max: 100 })
      .withMessage('Senha deve ter entre 6 e 100 caracteres'),
    body('birthDate')
      .isISO8601()
      .toDate()
      .withMessage('Data de nascimento inválida')
      .custom(value => {
        const today = new Date();
        const birthDate = new Date(value);
        const age = today.getFullYear() - birthDate.getFullYear();
        
        if (age < 13) {
          throw new Error('Deve ter pelo menos 13 anos');
        }
        if (age > 120) {
          throw new Error('Data de nascimento inválida');
        }
        
        return true;
      })
  ],
  handleValidationErrors,
  async (req, res) => {
    console.log('🔄 Tentativa de registro:', {
      email: req.body.email,
      firstName: req.body.firstName,
      lastName: req.body.lastName
    });

    try {
      const { firstName, lastName, email, password, birthDate } = req.body;

      // Verificar se email já existe
      console.log('🔍 Verificando se email já existe...');
      const existingUser = await db.query(
        'SELECT id, email FROM users WHERE email = $1',
        [email.toLowerCase()]
      );

      if (existingUser.rows.length > 0) {
        console.log('⚠️ Email já existe:', email);
        return res.status(400).json({
          error: 'Este email já está em uso'
        });
      }

      // Hash da senha
      console.log('🔐 Criando hash da senha...');
      const saltRounds = config.security.bcryptRounds || 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Criar usuário
      console.log('👤 Criando usuário no banco...');
      const result = await db.query(`
        INSERT INTO users (first_name, last_name, email, password_hash, birth_date)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, first_name, last_name, email, birth_date, created_at
      `, [
        firstName.trim(),
        lastName.trim(), 
        email.toLowerCase(), 
        passwordHash, 
        birthDate
      ]);

      const user = result.rows[0];
      console.log('✅ Usuário criado:', { id: user.id, email: user.email });

      // Gerar JWT
      console.log('🎫 Gerando token JWT...');
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        name: `${user.first_name} ${user.last_name}`
      };

      const token = jwt.sign(
        tokenPayload,
        config.security.jwtSecret,
        { 
          expiresIn: '7d',
          issuer: 'stickly-notes',
          audience: 'stickly-users'
        }
      );

      // Log de sucesso
      console.log('🎉 Registro concluído com sucesso:', {
        userId: user.id,
        email: user.email,
        name: `${user.first_name} ${user.last_name}`
      });

      // Resposta
      res.status(201).json({
        token,
        user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          birthDate: user.birth_date,
          createdAt: user.created_at
        }
      });

    } catch (error) {
      console.error('❌ Erro detalhado no registro:', {
        message: error.message,
        code: error.code,
        detail: error.detail,
        constraint: error.constraint,
        stack: error.stack
      });

      // Erro específico para violação de constraint
      if (error.code === '23505') { // unique_violation
        if (error.constraint && error.constraint.includes('email')) {
          return res.status(400).json({
            error: 'Este email já está em uso'
          });
        }
      }

      // Erro de validação do banco
      if (error.code === '23514') { // check_constraint_violation
        return res.status(400).json({
          error: 'Dados inválidos fornecidos'
        });
      }

      // Erro genérico
      res.status(500).json({
        error: 'Erro interno do servidor',
        ...(config.server.nodeEnv === 'development' && { 
          details: error.message 
        })
      });
    }
  }
);

/**
 * POST /api/auth/login
 * Faz login do usuário
 */
router.post('/login',
  [
    body('email')
      .isEmail()
      .withMessage('Email inválido')
      .normalizeEmail(),
    body('password')
      .notEmpty()
      .withMessage('Senha é obrigatória')
  ],
  handleValidationErrors,
  async (req, res) => {
    console.log('🔄 Tentativa de login:', { email: req.body.email });

    try {
      const { email, password } = req.body;

      // Buscar usuário
      console.log('🔍 Buscando usuário no banco...');
      const result = await db.query(
        'SELECT id, first_name, last_name, email, password_hash, created_at FROM users WHERE email = $1',
        [email.toLowerCase()]
      );

      if (result.rows.length === 0) {
        console.log('⚠️ Usuário não encontrado:', email);
        return res.status(401).json({
          error: 'Email ou senha incorretos'
        });
      }

      const user = result.rows[0];
      console.log('✅ Usuário encontrado:', user.email);

      // Verificar senha
      console.log('🔐 Verificando senha...');
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        console.log('⚠️ Senha incorreta para:', email);
        return res.status(401).json({
          error: 'Email ou senha incorretos'
        });
      }

      console.log('✅ Senha válida');

      // Gerar JWT
      console.log('🎫 Gerando token JWT...');
      const tokenPayload = { 
        userId: user.id,
        email: user.email,
        name: `${user.first_name} ${user.last_name}`
      };

      const token = jwt.sign(
        tokenPayload,
        config.security.jwtSecret,
        { 
          expiresIn: '7d',
          issuer: 'stickly-notes',
          audience: 'stickly-users'
        }
      );

      console.log('✅ Token gerado com sucesso');
      console.log('✅ Login realizado:', { 
        userId: user.id, 
        email: user.email 
      });

      res.json({
        token,
        user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          createdAt: user.created_at
        }
      });

    } catch (error) {
      console.error('❌ Erro no login:', {
        message: error.message,
        stack: error.stack
      });
      res.status(500).json({
        error: 'Erro interno do servidor'
      });
    }
  }
);

/**
 * GET /api/auth/me
 * Obtém dados do usuário atual
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, first_name, last_name, email, birth_date, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Usuário não encontrado'
      });
    }

    const user = result.rows[0];

    res.json({
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      birthDate: user.birth_date,
      createdAt: user.created_at
    });

  } catch (error) {
    console.error('❌ Erro ao buscar usuário:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

/**
 * GET /api/auth/my-panels
 * Busca painéis que o usuário participa
 */
router.get('/my-panels', authenticateToken, async (req, res) => {
  try {
    console.log('🔍 Buscando painéis para usuário:', req.user.userId);

    // Primeiro, buscar painéis onde o usuário é criador
    const createdPanels = await db.query(`
      SELECT 
        p.id, p.name, p.type, p.background_color, 
        p.created_at, p.last_activity,
        p.created_at as last_access,
        (SELECT COUNT(*)::INTEGER FROM posts WHERE panel_id = p.id) as post_count,
        (SELECT COUNT(*)::INTEGER FROM active_users WHERE panel_id = p.id AND last_seen > NOW() - INTERVAL '10 minutes') as active_users
      FROM panels p
      WHERE p.creator_user_id = $1
    `, [req.user.userId]);

    console.log('📋 Painéis criados encontrados:', createdPanels.rows.length);

    // Depois, buscar painéis onde o usuário participa
    const participantPanels = await db.query(`
      SELECT DISTINCT
        p.id, p.name, p.type, p.background_color, 
        p.created_at, p.last_activity,
        pp.last_access,
        (SELECT COUNT(*)::INTEGER FROM posts WHERE panel_id = p.id) as post_count,
        (SELECT COUNT(*)::INTEGER FROM active_users WHERE panel_id = p.id AND last_seen > NOW() - INTERVAL '10 minutes') as active_users
      FROM panels p
      INNER JOIN panel_participants pp ON p.id = pp.panel_id
      WHERE pp.user_uuid = $1 AND p.creator_user_id != $1
    `, [req.user.userId]);

    console.log('👥 Painéis participante encontrados:', participantPanels.rows.length);

    // Combinar e remover duplicatas
    const allPanels = [...createdPanels.rows, ...participantPanels.rows];
    const uniquePanels = allPanels.filter((panel, index, self) => 
      index === self.findIndex(p => p.id === panel.id)
    );

    // Ordenar por última atividade
    uniquePanels.sort((a, b) => {
      const dateA = new Date(a.last_access || a.created_at);
      const dateB = new Date(b.last_access || b.created_at);
      return dateB - dateA;
    });

    console.log('✅ Total de painéis únicos:', uniquePanels.length);

    res.json(uniquePanels);

  } catch (error) {
    console.error('❌ Erro detalhado ao buscar painéis:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'Erro ao buscar painéis',
      ...(process.env.NODE_ENV === 'development' && { 
        details: error.message 
      })
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout (invalidar token - client-side principalmente)
 */
router.post('/logout', authenticateToken, (req, res) => {
  console.log('👋 Logout realizado:', {
    userId: req.user.userId,
    email: req.user.email
  });

  res.json({ message: 'Logout realizado com sucesso' });
});

module.exports = { router, authenticateToken };