/**
 * Rotas para autenticação de usuários
 * Contém endpoints para registro, login e gerenciamento de conta
 */

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

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso requerido' });
  }

  jwt.verify(token, config.security.jwtSecret, (err, user) => {
    if (err) {
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
      .isLength({ min: 2, max: 50 })
      .withMessage('Nome deve ter entre 2 e 50 caracteres'),
    body('lastName')
      .isLength({ min: 2, max: 50 })
      .withMessage('Sobrenome deve ter entre 2 e 50 caracteres'),
    body('email')
      .isEmail()
      .withMessage('Email inválido')
      .normalizeEmail(),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Senha deve ter pelo menos 6 caracteres'),
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
        return true;
      })
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { firstName, lastName, email, password, birthDate } = req.body;

      // Verificar se email já existe
      const existingUser = await db.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        return res.status(400).json({
          error: 'Email já está em uso'
        });
      }

      // Hash da senha
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Criar usuário
      const result = await db.query(`
        INSERT INTO users (first_name, last_name, email, password_hash, birth_date)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, first_name, last_name, email, birth_date, created_at
      `, [firstName, lastName, email, passwordHash, birthDate]);

      const user = result.rows[0];

      // Gerar JWT
      const token = jwt.sign(
        { 
          userId: user.id,
          email: user.email 
        },
        config.security.jwtSecret,
        { expiresIn: '7d' }
      );

      logger.info('Novo usuário registrado', {
        userId: user.id,
        email: user.email,
        name: `${user.first_name} ${user.last_name}`
      });

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
      logger.error('Erro ao registrar usuário:', error);
      res.status(500).json({
        error: 'Erro interno do servidor'
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
    try {
      const { email, password } = req.body;

      // Buscar usuário
      const result = await db.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          error: 'Email ou senha incorretos'
        });
      }

      const user = result.rows[0];

      // Verificar senha
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        logger.security('Tentativa de login com senha incorreta', {
          email,
          ip: req.ip
        });

        return res.status(401).json({
          error: 'Email ou senha incorretos'
        });
      }

      // Gerar JWT
      const token = jwt.sign(
        { 
          userId: user.id,
          email: user.email 
        },
        config.security.jwtSecret,
        { expiresIn: '7d' }
      );

      logger.info('Login realizado', {
        userId: user.id,
        email: user.email,
        ip: req.ip
      });

      res.json({
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
      logger.error('Erro ao fazer login:', error);
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
    logger.error('Erro ao buscar dados do usuário:', error);
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
    const result = await db.query(`
      SELECT DISTINCT 
        p.id, p.name, p.type, p.background_color, 
        p.created_at, p.last_activity,
        pp.last_access,
        (SELECT COUNT(*) FROM posts WHERE panel_id = p.id) as post_count,
        (SELECT COUNT(*) FROM active_users WHERE panel_id = p.id) as active_users
      FROM panels p
      LEFT JOIN panel_participants pp ON p.id = pp.panel_id
      WHERE p.creator_user_id = $1 OR pp.user_uuid = $1
      ORDER BY pp.last_access DESC, p.last_activity DESC
    `, [req.user.userId]);

    res.json(result.rows);

  } catch (error) {
    logger.error('Erro ao buscar painéis do usuário:', error);
    res.status(500).json({
      error: 'Erro ao buscar painéis'
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout (invalidar token - client-side principalmente)
 */
router.post('/logout', authenticateToken, (req, res) => {
  logger.info('Logout realizado', {
    userId: req.user.userId,
    email: req.user.email
  });

  res.json({ message: 'Logout realizado com sucesso' });
});

module.exports = { router, authenticateToken };