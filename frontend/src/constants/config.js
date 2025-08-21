export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export const LIMITS = {
  PANEL_NAME_MAX_LENGTH: 100,
  POST_CONTENT_MAX_LENGTH: 1000,
  USERNAME_MAX_LENGTH: 50,
  PANEL_CODE_LENGTH: 6
};

export const PANEL_TYPES = {
  FRIENDS: 'friends',
  COUPLE: 'couple'
};

export const FRIENDS_COLORS = {
  notes: ['#A8D8EA', '#AA96DA', '#FCBAD3', '#FFFFD2'],
  borders: ['#9EC6F3', '#BDDDE4', '#FFF1D5', '#FBFBFB'],
  backgrounds: ['#9EC6F3', '#BDDDE4', '#FFF1D5', '#FBFBFB']
};

export const COUPLE_COLORS = {
  notes: ['#F9F5F6', '#F8E8EE', '#FDCEDF', '#F2BED1'],
  borders: ['#FF9292', '#FFB4B4', '#FFDCDC', '#FFE8E8'],
  backgrounds: ['#FF9292', '#FFB4B4', '#FFDCDC', '#FFE8E8']
};

export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Erro de conexão. Verifique sua internet.',
  PANEL_NOT_FOUND: 'Painel não encontrado.',
  WRONG_PASSWORD: 'Senha incorreta.',
  PANEL_FULL: 'Painel lotado.',
  GENERIC_ERROR: 'Ocorreu um erro inesperado.',
  USERNAME_REQUIRED: 'Nome é obrigatório.',
  CONTENT_REQUIRED: 'Conteúdo é obrigatório.'
};