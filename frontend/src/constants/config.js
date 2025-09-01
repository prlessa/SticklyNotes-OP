export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export const LIMITS = {
  PANEL_NAME_MAX_LENGTH: 100,
  POST_CONTENT_MAX_LENGTH: 1000,
  USERNAME_MAX_LENGTH: 50,
  PANEL_CODE_LENGTH: 6,
  PASSWORD_MAX_LENGTH: 100
};

export const PANEL_TYPES = {
  FRIENDS: 'friends',
  COUPLE: 'couple',
  FAMILY: 'family'
};

export const FRIENDS_COLORS = {
  notes: ['#A8D8EA', '#AA96DA', '#FCBAD3', '#FFFFD2'],
  backgrounds: ['#FBFBFB', '#F0F8FF', '#FFF8F0', '#F8F8FF']
};

export const COUPLE_COLORS = {
  notes: ['#F9F5F6', '#F8E8EE', '#FDCEDF', '#F2BED1'],
  backgrounds: ['#FFE8E8', '#FFF0F5', '#FFEEF0', '#FFE4E8']
};

export const FAMILY_COLORS = {
  notes: ['#E8F5E8', '#F0F8E8', '#E8F8F0', '#F8F8E8'],
  backgrounds: ['#F0F9E8', '#E8F5E8', '#F8FFF8', '#F0FFF0']
};

export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Erro de conexão. Verifique sua internet.',
  PANEL_NOT_FOUND: 'Painel não encontrado.',
  WRONG_PASSWORD: 'Senha incorreta.',
  PANEL_FULL: 'Painel lotado.',
  GENERIC_ERROR: 'Ocorreu um erro inesperado.',
  USERNAME_REQUIRED: 'Nome é obrigatório.',
  CONTENT_REQUIRED: 'Conteúdo é obrigatório.',
  INVALID_CREDENTIALS: 'Email ou senha incorretos.',
  EMAIL_IN_USE: 'Este email já está em uso.',
  WEAK_PASSWORD: 'Senha deve ter pelo menos 6 caracteres.'
};