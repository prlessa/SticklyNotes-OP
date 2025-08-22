const config = require('../config/config');

/**
 * Expressões regulares para validação
 */
const patterns = {
  panelCode: /^[A-Z0-9]{6}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  hexColor: /^#[0-9A-Fa-f]{6}$/,
  username: /^[a-zA-ZÀ-ÿ0-9\s\-_]{1,50}$/,
  // Permite caracteres alfanuméricos, acentos, espaços, hífens e underscores
  safeText: /^[a-zA-ZÀ-ÿ0-9\s\-_.,!?()]+$/
};

/**
 * Lista de palavras proibidas (exemplo básico)
 */
const forbiddenWords = [
  'admin', 'root', 'system', 'null', 'undefined',
  // Adicionar mais palavras conforme necessário
];

/**
 * Sanitiza string removendo caracteres perigosos
 * @param {string} str - String a ser sanitizada
 * @returns {string} String sanitizada
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  
  return str
    .trim()
    .replace(/[<>]/g, '') // Remove < e >
    .replace(/javascript:/gi, '') // Remove javascript:
    .replace(/on\w+=/gi, '') // Remove eventos onclick, onload, etc
    .substring(0, 1000); // Limita tamanho
}

/**
 * Validações específicas para diferentes tipos de dados
 */
const validators = {
  /**
   * Valida nome de usuário
   * @param {string} username - Nome do usuário
   * @returns {object} Resultado da validação
   */
  username: (username) => {
    const sanitized = sanitizeString(username);
    
    if (!sanitized) {
      return { isValid: false, error: 'Nome é obrigatório' };
    }
    
    if (sanitized.length < 2) {
      return { isValid: false, error: 'Nome muito curto (mínimo 2 caracteres)' };
    }
    
    if (sanitized.length > config.limits.usernameMaxLength) {
      return { isValid: false, error: `Nome muito longo (máximo ${config.limits.usernameMaxLength} caracteres)` };
    }
    
    if (!patterns.username.test(sanitized)) {
      return { isValid: false, error: 'Nome contém caracteres inválidos' };
    }
    
    // Verificar palavras proibidas
    const lowerName = sanitized.toLowerCase();
    const hasForbiddenWord = forbiddenWords.some(word => 
      lowerName.includes(word.toLowerCase())
    );
    
    if (hasForbiddenWord) {
      return { isValid: false, error: 'Nome contém palavras não permitidas' };
    }
    
    return { isValid: true, value: sanitized };
  },

  /**
   * Valida nome do painel
   * @param {string} name - Nome do painel
   * @returns {object} Resultado da validação
   */
  panelName: (name) => {
    const sanitized = sanitizeString(name);
    
    if (!sanitized) {
      return { isValid: false, error: 'Nome do painel é obrigatório' };
    }
    
    if (sanitized.length < 3) {
      return { isValid: false, error: 'Nome do painel muito curto (mínimo 3 caracteres)' };
    }
    
    if (sanitized.length > config.limits.panelNameMaxLength) {
      return { isValid: false, error: `Nome muito longo (máximo ${config.limits.panelNameMaxLength} caracteres)` };
    }
    
    if (!patterns.safeText.test(sanitized)) {
      return { isValid: false, error: 'Nome contém caracteres inválidos' };
    }
    
    return { isValid: true, value: sanitized };
  },

  /**
   * Valida conteúdo de post
   * @param {string} content - Conteúdo do post
   * @returns {object} Resultado da validação
   */
  postContent: (content) => {
    const sanitized = sanitizeString(content);
    
    if (!sanitized) {
      return { isValid: false, error: 'Conteúdo é obrigatório' };
    }
    
    if (sanitized.length > config.limits.postContentMaxLength) {
      return { isValid: false, error: `Conteúdo muito longo (máximo ${config.limits.postContentMaxLength} caracteres)` };
    }
    
    return { isValid: true, value: sanitized };
  },

  /**
   * Valida código do painel
   * @param {string} code - Código do painel
   * @returns {object} Resultado da validação
   */
  panelCode: (code) => {
    if (typeof code !== 'string') {
      return { isValid: false, error: 'Código inválido' };
    }
    
    const upperCode = code.toUpperCase().trim();
    
    if (!patterns.panelCode.test(upperCode)) {
      return { isValid: false, error: 'Código deve ter 6 caracteres alfanuméricos' };
    }
    
    return { isValid: true, value: upperCode };
  },

  /**
   * Valida tipo do painel
   * @param {string} type - Tipo do painel
   * @returns {object} Resultado da validação
   */
  panelType: (type) => {
    const validTypes = Object.values(config.panelTypes);
    
    if (!validTypes.includes(type)) {
      return { isValid: false, error: 'Tipo de painel inválido' };
    }
    
    return { isValid: true, value: type };
  },

  /**
   * Valida senha
   * @param {string} password - Senha
   * @returns {object} Resultado da validação
   */
  password: (password) => {
    if (!password) {
      return { isValid: true, value: null }; // Senha é opcional
    }
    
    if (typeof password !== 'string') {
      return { isValid: false, error: 'Senha inválida' };
    }
    
    if (password.length < 4) {
      return { isValid: false, error: 'Senha muito curta (mínimo 4 caracteres)' };
    }
    
    if (password.length > config.limits.passwordMaxLength) {
      return { isValid: false, error: `Senha muito longa (máximo ${config.limits.passwordMaxLength} caracteres)` };
    }
    
    return { isValid: true, value: password };
  },

  /**
   * Valida cor hex
   * @param {string} color - Cor em formato hex
   * @param {string} panelType - Tipo do painel
   * @param {string} category - Categoria da cor (notes/borders/backgrounds)
   * @returns {object} Resultado da validação
   */
  color: (color, panelType, category) => {
    if (!color || typeof color !== 'string') {
      return { isValid: false, error: 'Cor é obrigatória' };
    }
    
    if (!patterns.hexColor.test(color)) {
      return { isValid: false, error: 'Formato de cor inválido' };
    }
    
    // Verificar se a cor está na paleta permitida
    if (!config.isValidColor(color, panelType, category)) {
      return { isValid: false, error: 'Cor não permitida para este tipo de painel' };
    }
    
    return { isValid: true, value: color };
  },

  /**
   * Valida posição do post
   * @param {number} x - Posição X
   * @param {number} y - Posição Y
   * @returns {object} Resultado da validação
   */
  position: (x, y) => {
    const numX = Number(x);
    const numY = Number(y);
    
    if (isNaN(numX) || isNaN(numY)) {
      return { isValid: false, error: 'Posições devem ser números' };
    }
    
    if (numX < 0 || numX > 2000 || numY < 0 || numY > 2000) {
      return { isValid: false, error: 'Posições fora dos limites permitidos' };
    }
    
    return { 
      isValid: true, 
      value: { x: Math.round(numX), y: Math.round(numY) }
    };
  }
};

/**
 * Valida dados completos de criação de painel
 * @param {object} data - Dados do painel
 * @returns {object} Resultado da validação
 */
function validatePanelCreation(data) {
  const errors = [];
  const validatedData = {};
  
  // Validar nome
  const nameValidation = validators.panelName(data.name);
  if (!nameValidation.isValid) {
    errors.push(nameValidation.error);
  } else {
    validatedData.name = nameValidation.value;
  }
  
  // Validar tipo
  const typeValidation = validators.panelType(data.type);
  if (!typeValidation.isValid) {
    errors.push(typeValidation.error);
  } else {
    validatedData.type = typeValidation.value;
  }
  
  // Validar criador
  const creatorValidation = validators.username(data.creator);
  if (!creatorValidation.isValid) {
    errors.push(`Criador: ${creatorValidation.error}`);
  } else {
    validatedData.creator = creatorValidation.value;
  }
  
  // Validar senha (opcional)
  const passwordValidation = validators.password(data.password);
  if (!passwordValidation.isValid) {
    errors.push(passwordValidation.error);
  } else {
    validatedData.password = passwordValidation.value;
  }
  
  // Validar cores
  if (data.borderColor) {
    const borderValidation = validators.color(data.borderColor, data.type, 'borders');
    if (!borderValidation.isValid) {
      errors.push(`Cor da borda: ${borderValidation.error}`);
    } else {
      validatedData.borderColor = borderValidation.value;
    }
  }
  
  if (data.backgroundColor) {
    const bgValidation = validators.color(data.backgroundColor, data.type, 'backgrounds');
    if (!bgValidation.isValid) {
      errors.push(`Cor de fundo: ${bgValidation.error}`);
    } else {
      validatedData.backgroundColor = bgValidation.value;
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    data: validatedData
  };
}

/**
 * Valida dados de criação de post
 * @param {object} data - Dados do post
 * @param {string} panelType - Tipo do painel
 * @returns {object} Resultado da validação
 */
function validatePostCreation(data, panelType) {
  const errors = [];
  const validatedData = {};
  
  // Validar conteúdo
  const contentValidation = validators.postContent(data.content);
  if (!contentValidation.isValid) {
    errors.push(contentValidation.error);
  } else {
    validatedData.content = contentValidation.value;
  }
  
  // Validar autor (pode ser nulo para posts anônimos)
  if (data.author_name) {
    const authorValidation = validators.username(data.author_name);
    if (!authorValidation.isValid) {
      errors.push(`Autor: ${authorValidation.error}`);
    } else {
      validatedData.author_name = authorValidation.value;
    }
  }
  
  // Validar cor
  if (data.color) {
    const colorValidation = validators.color(data.color, panelType, 'notes');
    if (!colorValidation.isValid) {
      errors.push(colorValidation.error);
    } else {
      validatedData.color = colorValidation.value;
    }
  }
  
  // Validar posição
  if (data.position_x !== undefined && data.position_y !== undefined) {
    const positionValidation = validators.position(data.position_x, data.position_y);
    if (!positionValidation.isValid) {
      errors.push(positionValidation.error);
    } else {
      validatedData.position_x = positionValidation.value.x;
      validatedData.position_y = positionValidation.value.y;
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    data: validatedData
  };
}

module.exports = {
  validators,
  validatePanelCreation,
  validatePostCreation,
  sanitizeString,
  patterns
};