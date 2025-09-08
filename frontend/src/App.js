import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UserProvider, useUser } from './hooks/useUser';
import { useSocket } from './hooks/useSockets';
import { PostIt } from './components/PostIt';
import { apiService } from './services/apiService';
import { 
  StickyNote, Users, Heart, Home, Plus, Share2, 
  Copy, Check, X, AlertCircle, User, LogOut,
  Calendar, Mail, Lock, Eye, EyeOff, ArrowLeft, HomeIcon
} from 'lucide-react';
import { 
  FRIENDS_COLORS, COUPLE_COLORS, FAMILY_COLORS, PANEL_TYPES, 
  LIMITS, ERROR_MESSAGES 
} from './constants/config';


// Sistema de roteamento simples
const useSimpleRouter = () => {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  
  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };
  
  return { currentPath, navigate };
};

// Função para detectar se estamos em uma rota de link
const isLinkAccess = (path = window.location.pathname) => {
  return path.startsWith('/mural/');
};

// Função para extrair código da URL
const getLinkCode = (path = window.location.pathname) => {
  const match = path.match(/\/mural\/([A-Z0-9]{6})/i);
  return match ? match[1].toUpperCase() : null;
};

// Função para obter cores baseadas no tipo do painel
const getColors = (type) => {
  switch (type) {
    case 'couple': return COUPLE_COLORS;
    case 'family': return FAMILY_COLORS;
    default: return FRIENDS_COLORS;
  }
};

// Componente de Loading
const LoadingSpinner = ({ message = 'Carregando...' }) => {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  );
};

// Componente Modal
const Modal = ({ isOpen, onClose, title, children, size = 'medium' }) => {
  if (!isOpen) return null;

  const sizeClasses = {
    small: 'max-w-md',
    medium: 'max-w-lg',
    large: 'max-w-2xl'
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-2xl shadow-2xl ${sizeClasses[size]} w-full border border-gray-100`}>
        {title && (
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        )}
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
};
// Componente de Formulário de Post Atualizado
const NewPostForm = ({ onSubmit, onCancel, colors, userName }) => {
  const [content, setContent] = useState('');
  const [color, setColor] = useState(colors.notes[0]);
  const [anonymous, setAnonymous] = useState(false);

const handleSubmit = useCallback((e) => {
    e.preventDefault();
    
    const trimmedContent = content.trim();
    
    if (!trimmedContent) {
      console.warn('⚠️ Conteúdo vazio, não enviando');
      return;
    }

    console.log('📝 NewPostForm - Enviando dados:', {
      content: trimmedContent,
      color,
      anonymous
    });

    onSubmit({
      content: trimmedContent,
      color,
      anonymous
    });

    // Reset form
    setContent('');
    setAnonymous(false);
  }, [content, color, anonymous, onSubmit]);

  return (
    <Modal isOpen={true} onClose={onCancel} title="Nova Mensagem">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Sua mensagem
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Escreva sua mensagem..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={4}
            maxLength={LIMITS.POST_CONTENT_MAX_LENGTH}
            required
          />
          <div className="text-right text-xs text-gray-500 mt-1">
            {content.length}/{LIMITS.POST_CONTENT_MAX_LENGTH}
          </div>
        </div>

        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
          <div className="flex items-center">
            <User className="w-5 h-5 text-gray-600 mr-2" />
            <span className="text-sm font-medium text-gray-700">
              {anonymous ? 'Anônimo' : userName}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setAnonymous(!anonymous)}
            className={`w-12 h-6 rounded-full transition-colors ${
              anonymous ? 'bg-gray-400' : 'bg-blue-600'
            }`}
          >
            <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
              anonymous ? 'translate-x-0.5' : 'translate-x-6'
            }`} />
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Cor da nota
          </label>
          <div className="flex gap-2">
            {colors.notes.map(noteColor => (
              <button
                key={noteColor}
                type="button"
                onClick={() => setColor(noteColor)}
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  color === noteColor ? 'border-gray-800 scale-110' : 'border-gray-300'
                }`}
                style={{ backgroundColor: noteColor }}
              />
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!content.trim()}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Postar
          </button>
        </div>
      </form>
    </Modal>
  );
};

// Tela de Login/Registro
const AuthScreen = () => {
  const { login, register, error, setError } = useUser();
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    birthDate: ''
  });

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (isLogin) {
        await login(formData.email, formData.password);
      } else {
        await register(formData);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [formData, isLogin, login, register, setError]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 via-purple-50 to-pink-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full border border-gray-100">
        <div className="flex items-center justify-center mb-8">
          <StickyNote className="w-12 h-12 text-slate-600 mr-3" />
          <h1 className="text-4xl font-bold text-gray-800">Stickly Notes</h1>
        </div>
        
        <div className="text-center mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-2">
            {isLogin ? 'Entre na sua conta' : 'Crie sua conta'}
          </h2>
          <p className="text-gray-600">
            {isLogin ? 'Acesse seus murais colaborativos' : 'Junte-se à comunidade Stickly'}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {!isLogin && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nome
                  </label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => handleInputChange('firstName', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition-all"
                    required={!isLogin}
                    maxLength={50}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sobrenome
                  </label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => handleInputChange('lastName', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition-all"
                    required={!isLogin}
                    maxLength={50}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Data de Nascimento
                </label>
                <input
                  type="date"
                  value={formData.birthDate}
                  onChange={(e) => handleInputChange('birthDate', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition-all"
                  required={!isLogin}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Mail className="w-4 h-4 inline mr-1" />
              E-mail
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Lock className="w-4 h-4 inline mr-1" />
              Senha
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition-all pr-12"
                required
                minLength={isLogin ? 1 : 6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {!isLogin && (
              <p className="text-xs text-gray-500 mt-1">Mínimo de 6 caracteres</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-xl font-semibold transition-all duration-200 transform hover:scale-[1.02] bg-gradient-to-r from-slate-600 to-gray-700 text-white hover:from-slate-700 hover:to-gray-800 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isLoading ? 'Carregando...' : (isLogin ? 'Entrar' : 'Criar Conta')}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-200 text-center">
          <p className="text-gray-600 text-sm">
            {isLogin ? 'Não tem uma conta?' : 'Já tem uma conta?'}
          </p>
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
              setFormData({ email: '', password: '', firstName: '', lastName: '', birthDate: '' });
            }}
            className="text-slate-600 hover:text-slate-800 font-medium transition-colors"
          >
            {isLogin ? 'Criar conta' : 'Fazer login'}
          </button>
        </div>
      </div>
    </div>
  );
};

/// Card de Painel para "Meus Murais" - Com Notificações
const PanelCard = ({ panel, onSelectPanel }) => {
  const getTypeIcon = (type) => {
    switch (type) {
      case 'couple': return <Heart className="w-4 h-4 sm:w-5 sm:h-5 text-rose-500" />;
      case 'family': return <HomeIcon className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />;
      default: return <Users className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />;
    }
  };

  const getTypeColor = (type) => {
    const hasNotifications = panel.unread_count > 0;
    
    switch (type) {
      case 'couple': 
        return hasNotifications 
          ? 'border-rose-300 bg-rose-100 hover:bg-rose-150 ring-2 ring-rose-200' 
          : 'border-rose-200 bg-rose-50 hover:bg-rose-100';
      case 'family': 
        return hasNotifications 
          ? 'border-green-300 bg-green-100 hover:bg-green-150 ring-2 ring-green-200' 
          : 'border-green-200 bg-green-50 hover:bg-green-100';
      default: 
        return hasNotifications 
          ? 'border-blue-300 bg-blue-100 hover:bg-blue-150 ring-2 ring-blue-200' 
          : 'border-blue-200 bg-blue-50 hover:bg-blue-100';
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'couple': return '💕 Casal';
      case 'family': return '🏠 Família';
      default: return '👥 Amigos';
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const formatLastMessage = (message) => {
    if (!message) return null;
    return message.length > 40 ? `${message.substring(0, 40)}...` : message;
  };

  const getTimeAgo = (date) => {
    if (!date) return '';
    
    const now = new Date();
    const messageDate = new Date(date);
    const diffMs = now - messageDate;
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMinutes < 1) return 'agora';
    if (diffMinutes < 60) return `${diffMinutes}min`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return formatDate(date);
  };

  return (
    <button
      onClick={() => onSelectPanel(panel)}
      className={`relative p-3 sm:p-4 rounded-xl border-2 ${getTypeColor(panel.type)} hover:shadow-lg transition-all duration-200 transform hover:-translate-y-1 text-left w-full`}
    >
      {/* Badge de notificação */}
      {panel.unread_count > 0 && (
        <div className="absolute -top-2 -right-2 z-10">
          <div className="bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 shadow-lg animate-pulse">
            {panel.unread_count > 99 ? '99+' : panel.unread_count}
          </div>
        </div>
      )}

      {/* Header com ícone e nome */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center min-w-0 flex-1 mr-2">
          {getTypeIcon(panel.type)}
          <div className="ml-2 min-w-0 flex-1">
            <h3 className={`font-semibold text-gray-800 truncate text-sm sm:text-base ${
              panel.unread_count > 0 ? 'font-bold' : ''
            }`}>
              {panel.name}
            </h3>
            <p className="text-xs text-gray-500">
              {getTypeLabel(panel.type)}
            </p>
          </div>
        </div>
        <span className="text-xs font-mono bg-white px-2 py-1 rounded text-gray-600 whitespace-nowrap">
          {panel.id}
        </span>
      </div>
      
      {/* Última mensagem (se existir) */}
      {panel.last_message && (
        <div className="mb-3 p-2 bg-white bg-opacity-50 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-700">
              {panel.last_message_author}
            </span>
            <span className="text-xs text-gray-500">
              {getTimeAgo(panel.last_message_date)}
            </span>
          </div>
          <p className={`text-xs text-gray-600 ${
            panel.unread_count > 0 ? 'font-medium' : ''
          }`}>
            {formatLastMessage(panel.last_message)}
          </p>
        </div>
      )}
      
// Estatísticas em grid responsivo
      <div className="grid grid-cols-1 gap-2 text-xs text-gray-600 mb-2">
        <div className="flex items-center">
          <span className="w-2 h-2 bg-blue-400 rounded-full mr-1"></span>
          <span>{panel.post_count || 0} post{panel.post_count !== 1 ? 's' : ''}</span>
        </div>
      </div>
      
      {/* Data do último acesso */}
      <div className="text-xs text-gray-500 pt-2 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <span>Último acesso: {formatDate(panel.last_access || panel.created_at)}</span>
          {panel.unread_count > 0 && (
            <span className="text-red-600 font-medium flex items-center">
              <span className="w-2 h-2 bg-red-500 rounded-full mr-1 animate-pulse"></span>
              {panel.unread_count} nova{panel.unread_count !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};

// Componente de Criação de Painel
const CreatePanelScreen = ({ panelType, onBack, user }) => {
  const [formData, setFormData] = useState({
    name: '',
    password: '',
    requirePassword: false,
    backgroundColor: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPanel, setCurrentPanel] = useState(null);
  const [shouldGoToMyPanels, setShouldGoToMyPanels] = useState(false); // ← NOVO

  const colors = getColors(panelType);

  // Definir cor padrão
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      backgroundColor: colors.backgrounds[0]
    }));
  }, [panelType, colors.backgrounds]);

const handleSubmit = useCallback(async () => {
  if (!formData.name.trim()) {
    setError('Digite um nome para o painel');
    return;
  }

  setIsLoading(true);
  setError('');

  try {
    console.log('🔄 Criando painel...', { name: formData.name, type: panelType });

    const response = await apiService.createPanel({
      name: formData.name,
      type: panelType,
      password: formData.requirePassword ? formData.password : null,
      backgroundColor: formData.backgroundColor
    });

    console.log('✅ Painel criado com sucesso:', response.id);

    // ✅ CORREÇÃO: Ir direto para o painel criado
    setCurrentPanel(response);
    
  } catch (err) {
    console.error('❌ Erro ao criar painel:', err);
    setError(err.message || 'Erro ao criar painel');
  } finally {
    setIsLoading(false);
  }
}, [formData, panelType]);


  // ✅ CORREÇÃO: Simplificar o handling do PanelScreen
if (currentPanel) {
  return (
    <PanelScreen 
      panel={currentPanel} 
      onBackToHome={() => {
        console.log('🏠 Voltando do painel criado para meus murais');
        
        // Resetar estados
        setCurrentPanel(null);
        
        // Voltar para home primeiro
        onBack();
        
        // Depois ir para "meus murais"
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('stickly-go-to-my-panels'));
        }, 100);
      }}
    />
  );
}


  const getGradient = () => {
    switch (panelType) {
      case 'couple': return 'bg-gradient-to-br from-pink-100 to-rose-100';
      case 'family': return 'bg-gradient-to-br from-green-100 to-emerald-100';
      default: return 'bg-gradient-to-br from-blue-100 to-indigo-100';
    }
  };

  const getIcon = () => {
    switch (panelType) {
      case 'couple': return <Heart className="w-10 h-10 text-rose-500 mr-3" />;
      case 'family': return <HomeIcon className="w-10 h-10 text-green-600 mr-3" />;
      default: return <StickyNote className="w-10 h-10 text-slate-600 mr-3" />;
    }
  };

  const getTitle = () => {
    switch (panelType) {
      case 'couple': return 'Painel Romântico';
      case 'family': return 'Painel da Família';
      default: return 'Novo Mural';
    }
  };

  return (
    <div className={`min-h-screen ${getGradient()} flex items-center justify-center p-4`}>
      <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full border border-gray-100">
        <button
          onClick={onBack}
          className="mb-6 text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>

        <div className="flex items-center justify-center mb-8">
          {getIcon()}
          <h2 className="text-4xl font-bold text-gray-800">{getTitle()}</h2>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nome do Mural
            </label>
            <input
              type="text"
              placeholder={
                panelType === 'couple' ? 'Nosso cantinho romântico ❤️' : 
                panelType === 'family' ? 'Recados da família 🏠' :
                'Ideias da turma'
              }
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition-all"
              maxLength={LIMITS.PANEL_NAME_MAX_LENGTH}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cor de Fundo
            </label>
            <div className="flex gap-2 flex-wrap">
              {colors.backgrounds.map(color => (
                <button
                  key={color}
                  onClick={() => setFormData(prev => ({ ...prev, backgroundColor: color }))}
                  className={`w-12 h-12 rounded-xl border-2 transition-all relative ${
                    formData.backgroundColor === color ? 'border-gray-700 scale-110 shadow-lg' : 'border-gray-300 hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                >
                  {formData.backgroundColor === color && (
                    <Check className="w-4 h-4 text-gray-700 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center">
              {formData.requirePassword ? 
                <Lock className="w-5 h-5 text-slate-600 mr-2" /> : 
                <Lock className="w-5 h-5 text-gray-400 mr-2" />
              }
              <span className="text-sm font-medium text-gray-700">Proteger com senha</span>
            </div>
            <button
              onClick={() => setFormData(prev => ({ ...prev, requirePassword: !prev.requirePassword }))}
              className={`w-12 h-6 rounded-full transition-colors ${
                formData.requirePassword ? 'bg-slate-600' : 'bg-gray-300'
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
                formData.requirePassword ? 'translate-x-6' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          {formData.requirePassword && (
            <input
              type="password"
              placeholder="Digite a senha do mural"
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition-all"
              maxLength={LIMITS.PASSWORD_MAX_LENGTH}
            />
          )}

          <button
            onClick={handleSubmit}
            disabled={isLoading || !formData.name.trim()}
            className={`w-full py-3 rounded-xl font-semibold transition-all duration-200 disabled:opacity-50 transform hover:scale-[1.02] ${
              panelType === 'couple' 
                ? 'bg-gradient-to-r from-rose-500 to-pink-600 text-white hover:from-rose-600 hover:to-pink-700'
                : panelType === 'family'
                ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700'
                : 'bg-gradient-to-r from-slate-600 to-gray-700 text-white hover:from-slate-700 hover:to-gray-800'
            } disabled:cursor-not-allowed disabled:transform-none`}
          >
            {isLoading ? 'Criando...' : `Criar ${getTitle()}`}
          </button>
        </div>
      </div>
    </div>
  );
};

// Componente de Acesso a Painel
const JoinPanelScreen = ({ onBack, user }) => {
  const [formData, setFormData] = useState({
    code: '',
    password: ''
  });
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPanel, setCurrentPanel] = useState(null);

  // Verificar se painel requer senha quando código mudar
  useEffect(() => {
    const checkPassword = async () => {
      if (formData.code.length === LIMITS.PANEL_CODE_LENGTH) {
        try {
          const requires = await apiService.checkPanelRequiresPassword(formData.code);
          setRequiresPassword(requires);
        } catch (err) {
          setError(err.message);
        }
      }
    };
    
    checkPassword();
  }, [formData.code]);

  const handleSubmit = useCallback(async () => {
    if (!formData.code.trim()) {
      setError('Digite o código do painel');
      return;
    }

    if (requiresPassword && !formData.password.trim()) {
      setError('Digite a senha do painel');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await apiService.accessPanel(formData.code.toUpperCase(), {
        password: formData.password || undefined
      });

      setCurrentPanel(response);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [formData, requiresPassword]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full border border-gray-100">
        <button
          onClick={onBack}
          className="mb-6 text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>

        <div className="flex items-center justify-center mb-8">
          <Share2 className="w-10 h-10 text-green-600 mr-3" />
          <h2 className="text-4xl font-bold text-gray-800">Acessar Mural</h2>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Código do Mural
            </label>
            <input
              type="text"
              placeholder="Ex: ABC123"
              value={formData.code}
              onChange={(e) => {
                const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                setFormData(prev => ({ ...prev, code: value }));
                if (error) setError('');
              }}
              maxLength={LIMITS.PANEL_CODE_LENGTH}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent uppercase font-mono text-lg tracking-wider transition-all"
            />
          </div>

          {requiresPassword && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Senha do Mural
              </label>
              <input
                type="password"
                placeholder="Digite a senha do mural"
                value={formData.password}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, password: e.target.value }));
                  if (error) setError('');
                }}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition-all"
              />
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={isLoading || !formData.code.trim() || (requiresPassword && !formData.password.trim())}
            className="w-full py-3 rounded-xl font-semibold transition-all duration-200 disabled:opacity-50 transform hover:scale-[1.02] bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isLoading ? 'Entrando...' : 'Entrar no Mural'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Tela Principal
const HomeScreen = () => {
  const { user, logout } = useUser();
  const [currentScreen, setCurrentScreen] = useState('home');
  const [panelType, setPanelType] = useState('');
  const [myPanels, setMyPanels] = useState([]);
  const [loadingPanels, setLoadingPanels] = useState(false);
  const [selectedPanel, setSelectedPanel] = useState(null);
  const [shouldRefreshPanels, setShouldRefreshPanels] = useState(false); // ← NOVO

  //Função melhorada para carregar painéis
const loadMyPanels = useCallback(async (forceReload = false) => {
  if (currentScreen === 'my-panels' || forceReload) {
    console.log('🔄 Carregando painéis...', { currentScreen, forceReload });
    setLoadingPanels(true);
    try {
      // Limpar cache se forçado
      if (forceReload && apiService.clearRateLimiting) {
        apiService.clearRateLimiting();
      }
      
      const panels = await apiService.getMyPanels();
      setMyPanels(panels);
      
      console.log('📋 Painéis carregados:', {
        total: panels.length,
        panels: panels.map(p => ({ id: p.id, name: p.name, type: p.type }))
      });
      
      // Log das notificações para debug
      const panelsWithNotifications = panels.filter(p => p.unread_count > 0);
      if (panelsWithNotifications.length > 0) {
        console.log('📬 Painéis com notificações:', panelsWithNotifications.map(p => ({
          name: p.name,
          unread: p.unread_count
        })));
      }
    } catch (err) {
      console.error('❌ Erro ao carregar painéis:', err);
    } finally {
      setLoadingPanels(false);
    }
  }
}, [currentScreen]);

    // Carregar painéis quando necessário
useEffect(() => {
  loadMyPanels();
}, [loadMyPanels]);

// Atualizar a cada 30 segundos quando estiver na tela "meus painéis"
useEffect(() => {
  let interval;
  if (currentScreen === 'my-panels') {
    interval = setInterval(() => {
      console.log('🔄 Auto-reload de painéis (30s)');
      loadMyPanels();
    }, 30000);
  }

  return () => {
    if (interval) clearInterval(interval);
  };
}, [currentScreen, loadMyPanels]);

  // Tela de escolha de tipo
  if (currentScreen === 'create' && !panelType) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 via-purple-50 to-pink-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-2xl w-full border border-gray-100">
          <button
            onClick={() => setCurrentScreen('home')}
            className="mb-6 text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-2 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>

          <div className="flex items-center justify-center mb-8">
            <StickyNote className="w-12 h-12 text-slate-600 mr-3" />
            <h1 className="text-4xl font-bold text-gray-800">Novo Mural</h1>
          </div>
          
          <p className="text-center text-gray-600 mb-10 text-lg">
            Quero compartilhar com:
          </p>

          <div className="space-y-4">
            <button
              onClick={() => setPanelType(PANEL_TYPES.FRIENDS)}
              className="w-full p-6 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-2xl hover:from-blue-200 hover:to-indigo-200 transition-all duration-300 border border-blue-200 hover:shadow-lg transform hover:-translate-y-1"
            >
              <div className="flex items-center">
                <Users className="w-8 h-8 text-slate-600 mr-4" />
                <div className="text-left">
                  <h3 className="text-xl font-semibold text-gray-800">Meus amigos</h3>
                  <p className="text-gray-600 text-sm mt-1">Mural aconchegante para compartilhar com seus amigos</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setPanelType(PANEL_TYPES.COUPLE)}
              className="w-full p-6 bg-gradient-to-br from-pink-100 to-rose-100 rounded-2xl hover:from-pink-200 hover:to-rose-200 transition-all duration-300 border border-pink-200 hover:shadow-lg transform hover:-translate-y-1"
            >
              <div className="flex items-center">
                <Heart className="w-8 h-8 text-rose-500 mr-4" />
                <div className="text-left">
                  <h3 className="text-xl font-semibold text-gray-800">Meu par</h3>
                  <p className="text-gray-600 text-sm mt-1">Mural romântico para compartilhar com seu amor</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setPanelType(PANEL_TYPES.FAMILY)}
              className="w-full p-6 bg-gradient-to-br from-green-100 to-emerald-100 rounded-2xl hover:from-green-200 hover:to-emerald-200 transition-all duration-300 border border-green-200 hover:shadow-lg transform hover:-translate-y-1"
            >
              <div className="flex items-center">
                <HomeIcon className="w-8 h-8 text-green-600 mr-4" />
                <div className="text-left">
                  <h3 className="text-xl font-semibold text-gray-800">Minha família</h3>
                  <p className="text-gray-600 text-sm mt-1">Mural familiar para compartilhar momentos especiais</p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Tela de criação de painel
  if (currentScreen === 'create' && panelType) {
  return (
  <CreatePanelScreen 
    panelType={panelType} 
    onBack={() => {
      setPanelType('');
      setCurrentScreen('home');
    }}
    user={user}
  />
);
  }

  // Tela de acesso a painel
  if (currentScreen === 'join') {
    return (
      <JoinPanelScreen 
        onBack={() => setCurrentScreen('home')}
        user={user}
      />
    );
  }


// Se um painel foi selecionado, abrir o PanelScreen
if (selectedPanel) {
  return (
    <PanelScreen 
      panel={selectedPanel} 
      onBackToHome={() => {
        setSelectedPanel(null);
        // ✅ CORREÇÃO: Voltar para "meus murais" em vez da home
        setCurrentScreen('my-panels');
        // Recarregar a lista de painéis
        setTimeout(() => {
          loadMyPanels(true);
        }, 100);
      }}
    />
  );
}

// Tela dos meus painéis
if (currentScreen === 'my-panels') {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 via-purple-50 to-pink-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-10 w-full max-w-6xl border border-gray-100">
        <button
          onClick={() => setCurrentScreen('home')}
          className="mb-6 text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>

        <div className="flex items-center justify-center mb-6 sm:mb-8">
          <StickyNote className="w-8 h-8 sm:w-12 sm:h-12 text-slate-600 mr-2 sm:mr-3" />
          <h1 className="text-2xl sm:text-4xl font-bold text-gray-800">Meus Murais</h1>
        </div>

        {loadingPanels ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Carregando murais...</p>
          </div>
        ) : myPanels.length === 0 ? (
          <div className="text-center py-12">
            <StickyNote className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <p className="text-lg text-gray-600 mb-2">Você ainda não participa de nenhum mural</p>
            <p className="text-gray-500">Crie um novo mural ou acesse um existente!</p>
          </div>
        ) : (
          <div className="space-y-4 sm:grid sm:gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 sm:space-y-0">
            {myPanels.map(panel => (
              <PanelCard 
                key={panel.id} 
                panel={panel} 
                onSelectPanel={setSelectedPanel}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

  // Tela principal
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 via-purple-50 to-pink-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-2xl w-full border border-gray-100">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center">
            <StickyNote className="w-12 h-12 text-slate-600 mr-3" />
            <h1 className="text-5xl font-bold text-gray-800">Stickly Notes</h1>
          </div>
          <button
            onClick={logout}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Sair da conta"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
        
        <p className="text-center text-gray-600 mb-4 text-lg">
          Olá, <span className="font-semibold text-slate-700">{user?.firstName} {user?.lastName}</span>! 👋
        </p>
        
        <p className="text-center text-gray-600 mb-10 text-lg">
          Pense, anote, compartilhe!
        </p>

        <div className="space-y-4">
          <button
            onClick={() => setCurrentScreen('create')}
            className="w-full p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl hover:from-blue-100 hover:to-indigo-100 transition-all duration-300 border border-blue-200 hover:border-blue-300 hover:shadow-lg transform hover:-translate-y-1"
          >
            <div className="flex items-center">
              <StickyNote className="w-8 h-8 text-blue-600 mr-4" />
              <div className="text-left">
                <h3 className="text-xl font-semibold text-gray-800">Crie seu mural</h3>
                <p className="text-gray-600 text-sm mt-1">Comece um novo mural para compartilhar</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setCurrentScreen('my-panels')}
            className="w-full p-6 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-2xl hover:from-purple-100 hover:to-indigo-100 transition-all duration-300 border border-purple-200 hover:border-purple-300 hover:shadow-lg transform hover:-translate-y-1"
          >
            <div className="flex items-center">
              <User className="w-8 h-8 text-purple-600 mr-4" />
              <div className="text-left">
                <h3 className="text-xl font-semibold text-gray-800">Meus murais</h3>
                <p className="text-gray-600 text-sm mt-1">Veja todos os murais que você participa</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setCurrentScreen('join')}
            className="w-full p-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl hover:from-green-100 hover:to-emerald-100 transition-all duration-300 border border-green-200 hover:border-green-300 hover:shadow-lg transform hover:-translate-y-1"
          >
            <div className="flex items-center">
              <Share2 className="w-8 h-8 text-green-600 mr-4" />
              <div className="text-left">
                <h3 className="text-xl font-semibold text-gray-800">Acesse um mural</h3>
                <p className="text-gray-600 text-sm mt-1">Entre em um mural existente usando um código</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

// Componente do Painel (Tela principal do mural) - Touch Corrigido
const PanelScreen = ({ panel, onBackToHome }) => {
  const { user, logout } = useUser();
  const [posts, setPosts] = useState([]);
  const [showNewPostForm, setShowNewPostForm] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  
  // Estados para zoom e pan com touch
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [focusedPost, setFocusedPost] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isZooming, setIsZooming] = useState(false);
  const [lastTouchDistance, setLastTouchDistance] = useState(0);
  const panelRef = useRef(null);

  const colors = getColors(panel.type);
  const userName = `${user?.firstName} ${user?.lastName}`;

  // Detectar mobile e configurar zoom inicial
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      
      if (mobile) {
        setZoom(0.7);
      } else {
        setZoom(1);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Funções para cálculos de touch
  const getTouchDistance = (touch1, touch2) => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getTouchCenter = (touch1, touch2) => {
    return {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2
    };
  };

  const handleResetView = () => {
    setZoom(isMobile ? 0.7 : 1);
    setPan({ x: 0, y: 0 });
    setFocusedPost(null);
  };

  const focusOnPost = (post) => {
    if (focusedPost === post.id) {
      setFocusedPost(null);
      handleResetView();
      return;
    }

    setFocusedPost(post.id);
    
    if (isMobile) {
      const container = panelRef.current;
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const centerX = containerRect.width / 2;
        const centerY = containerRect.height / 2;
        
        const newPan = {
          x: centerX - (post.position_x + 125) * 1.5,
          y: centerY - (post.position_y + 90) * 1.5
        };
        
        setPan(newPan);
        setZoom(1.5);
      }
    }
  };

  // Event handlers para touch apenas no mural
  useEffect(() => {
    if (!isMobile || !panelRef.current) return;

    const panelElement = panelRef.current;
    
    const handleTouchStart = (e) => {
      // Verificar se o toque foi na área do mural (não nos post-its)
      if (e.target !== panelElement && !panelElement.contains(e.target)) return;
      
      // Se tocou em um post-it, não interferir
      if (e.target.closest('[data-postit]')) return;

      const touches = e.touches;
      
      if (touches.length === 1) {
        // Pan com um dedo
        const touch = touches[0];
        setIsPanning(true);
        setIsZooming(false);
        
        // Usar as coordenadas relativas ao painel
        const rect = panelElement.getBoundingClientRect();
        panelRef.startPoint = { 
          x: touch.clientX - rect.left, 
          y: touch.clientY - rect.top 
        };
        panelRef.lastPoint = { 
          x: touch.clientX - rect.left, 
          y: touch.clientY - rect.top 
        };
      } else if (touches.length === 2) {
        // Zoom com dois dedos
        e.preventDefault();
        setIsZooming(true);
        setIsPanning(false);
        
        const distance = getTouchDistance(touches[0], touches[1]);
        setLastTouchDistance(distance);
        
        // Salvar centro do zoom
        const center = getTouchCenter(touches[0], touches[1]);
        const rect = panelElement.getBoundingClientRect();
        panelRef.zoomCenter = {
          x: center.x - rect.left,
          y: center.y - rect.top
        };
      }
    };

    const handleTouchMove = (e) => {
      const touches = e.touches;

      if (isPanning && touches.length === 1) {
        e.preventDefault();
        const touch = touches[0];
        const rect = panelElement.getBoundingClientRect();
        const currentPoint = { 
          x: touch.clientX - rect.left, 
          y: touch.clientY - rect.top 
        };
        
        const deltaX = currentPoint.x - panelRef.lastPoint.x;
        const deltaY = currentPoint.y - panelRef.lastPoint.y;
        
        setPan(prev => ({
          x: prev.x + deltaX,
          y: prev.y + deltaY
        }));
        
        panelRef.lastPoint = currentPoint;
      } else if (isZooming && touches.length === 2) {
        e.preventDefault();
        
        const distance = getTouchDistance(touches[0], touches[1]);
        
        if (lastTouchDistance > 0) {
          const scale = distance / lastTouchDistance;
          const newZoom = Math.max(0.3, Math.min(3, zoom * scale));
          
          // Zoom com centro fixo
          if (panelRef.zoomCenter) {
            const zoomDelta = newZoom - zoom;
            const centerX = panelRef.zoomCenter.x;
            const centerY = panelRef.zoomCenter.y;
            
            setPan(prev => ({
              x: prev.x - (centerX * zoomDelta) / zoom,
              y: prev.y - (centerY * zoomDelta) / zoom
            }));
          }
          
          setZoom(newZoom);
        }
        
        setLastTouchDistance(distance);
      }
    };

    const handleTouchEnd = (e) => {
      if (e.touches.length === 0) {
        setIsPanning(false);
        setIsZooming(false);
        setLastTouchDistance(0);
        delete panelRef.startPoint;
        delete panelRef.lastPoint;
        delete panelRef.zoomCenter;
      } else if (e.touches.length === 1 && isZooming) {
        // Transição de zoom para pan
        setIsZooming(false);
        setIsPanning(true);
        const touch = e.touches[0];
        const rect = panelElement.getBoundingClientRect();
        panelRef.lastPoint = { 
          x: touch.clientX - rect.left, 
          y: touch.clientY - rect.top 
        };
      }
    };

    panelElement.addEventListener('touchstart', handleTouchStart, { passive: false });
    panelElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    panelElement.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      panelElement.removeEventListener('touchstart', handleTouchStart);
      panelElement.removeEventListener('touchmove', handleTouchMove);
      panelElement.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isMobile, isPanning, isZooming, zoom, lastTouchDistance]);

  // Carregar dados iniciais
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setIsLoading(true);
        const postsData = await apiService.getPanelPosts(panel.id);
        setPosts(postsData);
      } catch (err) {
        setError('Erro ao carregar dados');
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialData();
  }, [panel.id]);

  // Handlers de WebSocket
  const handleNewPost = useCallback((post) => {
    setPosts(prev => [post, ...prev]);
  }, []);

  const handlePostMoved = useCallback((post) => {
    setPosts(prev => prev.map(p => p.id === post.id ? post : p));
  }, []);

  const handlePostDeleted = useCallback(({ postId }) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
    if (focusedPost === postId) {
      setFocusedPost(null);
      handleResetView();
    }
  }, [focusedPost]);

  // Configurar WebSocket
  useSocket(
    panel.id,
    userName,
    user?.id,
    handleNewPost,
    handlePostMoved,
    handlePostDeleted,
    () => {},
    () => {}
  );

  const handleCreatePost = useCallback(async (postData) => {
    try {
      const maxX = isMobile ? 1200 : 800;
      const maxY = isMobile ? 1000 : 600;
      
      const viewCenterX = (-pan.x / zoom) + (window.innerWidth / 2 / zoom);
      const viewCenterY = (-pan.y / zoom) + (window.innerHeight / 2 / zoom);
      
      const randomX = Math.max(50, Math.min(viewCenterX + (Math.random() - 0.5) * 400, maxX));
      const randomY = Math.max(100, Math.min(viewCenterY + (Math.random() - 0.5) * 300, maxY));
      
      const postPayload = {
        content: postData.content?.trim(),
        color: postData.color || colors.notes[0],
        anonymous: Boolean(postData.anonymous),
        position_x: Math.round(randomX),
        position_y: Math.round(randomY)
      };
      
      if (!postPayload.content || postPayload.content.length === 0) {
        throw new Error('Conteúdo da nota não pode estar vazio');
      }
      
      if (postPayload.content.length > 1000) {
        throw new Error('Conteúdo da nota é muito longo (máximo 1000 caracteres)');
      }
      
      if (!panel.id || panel.id.length !== 6) {
        throw new Error('ID do painel inválido');
      }
      
      await apiService.createPost(panel.id, postPayload);
      setShowNewPostForm(false);
    } catch (err) {
      console.error('❌ Erro ao criar post:', err);
      setError(err.message);
    }
  }, [panel.id, userName, zoom, pan, isMobile, colors.notes]);

  const handleDeletePost = useCallback(async (postId) => {
    try {
      await apiService.deletePost(postId, { panel_id: panel.id });
    } catch (err) {
      setError(err.message);
    }
  }, [panel.id]);

  const handleMovePost = useCallback(async (postId, x, y) => {
    try {
      if (!postId || !panel.id) {
        throw new Error('Dados inválidos');
      }
      
      if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) {
        throw new Error('Posições inválidas');
      }
      
      const limitedX = Math.max(0, Math.min(2000 - 250, x));
      const limitedY = Math.max(0, Math.min(1500 - 180, y));
      
      await apiService.updatePostPosition(postId, {
        position_x: limitedX,
        position_y: limitedY,
        panel_id: panel.id
      });
    } catch (err) {
      console.error('❌ Erro ao mover post:', err);
      setError(`Erro ao mover nota: ${err.message}`);
    }
  }, [panel.id]);

  const handleLeavePanel = useCallback(async () => {
    try {
      setShowLeaveModal(false);
      await apiService.leavePanel(panel.id);
      
      if (onBackToHome) {
        onBackToHome();
      }
    } catch (err) {
      console.error('❌ Erro ao sair do painel:', err);
      setError(err.message || 'Erro ao sair do mural');
      setShowLeaveModal(true);
    }
  }, [panel.id, onBackToHome]);

  if (isLoading) {
    return <LoadingSpinner message="Carregando mural..." />;
  }

  return (
    <div 
      className="min-h-screen relative overflow-hidden"
      style={{ backgroundColor: panel.background_color }}
    >
      {/* Textura de mural */}
      <div 
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 20% 50%, #8B4513 1px, transparent 1px),
                           radial-gradient(circle at 80% 50%, #A0522D 1px, transparent 1px),
                           radial-gradient(circle at 40% 20%, #8B4513 1px, transparent 1px),
                           radial-gradient(circle at 60% 80%, #A0522D 1px, transparent 1px)`,
          backgroundSize: '30px 30px, 35px 35px, 25px 25px, 40px 40px'
        }}
      />

      {/* Header Responsivo - SIMPLIFICADO */}
      <div className={`fixed top-0 left-0 right-0 z-50 ${isMobile ? 'p-3' : 'p-4'}`}>
        <div 
          className={`rounded-xl shadow-lg border-2 ${isMobile ? 'p-3' : 'p-4'}`}
          style={{ 
            backgroundColor: panel.background_color,
            borderColor: colors.notes[0] || '#A8D8EA'
          }}
        >
          {isMobile ? (
            // Layout mobile SIMPLIFICADO
            <div className="space-y-3">
              <div className="flex items-center justify-center">
                <h1 className="text-base font-bold text-gray-800 text-center">
                  {panel.name}
                </h1>
              </div>
              
              {/* Controles em duas linhas para melhor organização */}
              <div className="flex flex-col gap-2">
                {/* Primeira linha - ações principais */}
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => setShowNewPostForm(true)}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-black hover:bg-opacity-10 transition-colors text-sm bg-white bg-opacity-20 border border-white border-opacity-30"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Nota</span>
                  </button>
                  
                  <button
                    onClick={() => setShowShareModal(true)}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-black hover:bg-opacity-10 transition-colors text-sm bg-white bg-opacity-20 border border-white border-opacity-30"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>Compartilhar</span>
                  </button>
                </div>
                
                {/* Segunda linha - navegação */}
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={onBackToHome}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-blue-100 transition-colors text-sm text-blue-600 bg-blue-50 border border-blue-200"
                  >
                    <Home className="w-4 h-4" />
                    <span>Início</span>
                  </button>
                  
                  <button
                    onClick={() => setShowLeaveModal(true)}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-red-100 transition-colors text-sm text-red-600 bg-red-50 border border-red-200"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Sair</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            // Layout desktop SIMPLIFICADO
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <h1 className="text-xl font-bold text-gray-800">{panel.name}</h1>
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowShareModal(true)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-black hover:bg-opacity-10 transition-colors text-sm"
                >
                  <Share2 className="w-4 h-4" />
                  Compartilhar
                </button>
                
                <button
                  onClick={() => setShowNewPostForm(true)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-black hover:bg-opacity-10 transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Nova Nota
                </button>

                <button
                  onClick={onBackToHome}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-blue-100 transition-colors text-sm text-blue-600"
                >
                  <Home className="w-4 h-4" />
                  Início
                </button>

                <button
                  onClick={() => setShowLeaveModal(true)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-red-100 transition-colors text-sm text-red-600"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Sair
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Área do Mural com Touch Responsivo */}
      <div 
        ref={panelRef}
        className={`relative min-h-screen overflow-hidden ${isMobile ? 'pt-28' : 'pt-24'} pb-4`}
        style={{
          cursor: isPanning ? 'grabbing' : isZooming ? 'grabbing' : (isMobile ? 'grab' : 'default'),
          touchAction: 'none'
        }}
      >
        <div
          className="relative origin-top-left transition-transform duration-200"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            width: '2000px',
            height: '1500px',
            minWidth: '100vw',
            minHeight: '100vh'
          }}
        >
          {posts.map(post => (
            <div
              key={post.id}
              data-postit="true"
              onClick={() => focusOnPost(post)}
              className={`${focusedPost === post.id ? 'ring-4 ring-blue-400 ring-opacity-75' : ''}`}
            >
              <PostIt
                post={post}
                onDelete={handleDeletePost}
                onMove={handleMovePost}
                currentUserId={user?.id}
                canDelete={true}
                zoom={zoom}
                isMobile={isMobile}
              />
            </div>
          ))}
          
          {posts.length === 0 && (
            <div className="absolute top-1/4 left-1/2 transform -translate-x-1/2 text-center text-gray-500 bg-white bg-opacity-70 rounded-xl max-w-md p-8">
              <StickyNote className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Seu mural está vazio</p>
              <p className="text-sm">Clique em "Nota" para começar!</p>
            </div>
          )}
        </div>
      </div>

      {/* Botão flutuante para nova nota no mobile */}
      {isMobile && (
        <button
          onClick={() => setShowNewPostForm(true)}
          className="fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-br from-yellow-400 to-yellow-500 text-gray-800 rounded-2xl shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-200 flex items-center justify-center z-40 border-2 border-yellow-300"
          style={{
            background: 'linear-gradient(135deg, #FEF08A 0%, #FDE047 50%, #FACC15 100%)',
          }}
        >
          <div className="relative">
            <div className="w-8 h-8 bg-yellow-200 rounded-sm transform rotate-3 absolute -top-1 -left-1 opacity-60"></div>
            <div className="w-8 h-8 bg-yellow-100 rounded-sm flex items-center justify-center">
              <span className="text-gray-700 font-bold text-lg">+</span>
            </div>
            <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-4 h-2 bg-yellow-200 opacity-70 rounded-sm"></div>
          </div>
        </button>
      )}

      {/* Modal de Nova Nota */}
      {showNewPostForm && (
        <NewPostForm
          onSubmit={handleCreatePost}
          onCancel={() => setShowNewPostForm(false)}
          colors={colors}
          userName={userName}
        />
      )}

      {/* Modal de Compartilhamento */}
      <ShareModal 
        panel={panel}
        isOpen={showShareModal} 
        onClose={() => setShowShareModal(false)}
        isMobile={isMobile}
      />

      {/* Modal de Confirmação de Saída */}
      {showLeaveModal && (
        <Modal isOpen={showLeaveModal} onClose={() => setShowLeaveModal(false)} title="Sair do Mural">
          <div className="space-y-4">
            <div className="text-center">
              <div className="text-6xl mb-4">🚪</div>
              <p className="text-lg text-gray-800 mb-2">Tem certeza que deseja sair deste mural?</p>
              <p className="text-sm text-gray-600">
                Você precisará do código <strong>{panel.id}</strong> para entrar novamente.
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowLeaveModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleLeavePanel}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                Confirmar Saída
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Toast de Erro */}
      {error && (
        <div className={`fixed ${isMobile ? 'bottom-32 left-4 right-4' : 'bottom-4 right-4'} bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50`}>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
            <button 
              onClick={() => setError('')}
              className="ml-2 hover:bg-red-600 rounded p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const ShareModal = ({ panel, isOpen, onClose, isMobile }) => {
  const [copied, setCopied] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [isEditingMessage, setIsEditingMessage] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  
  // Gerar a URL do link
  const shareUrl = `${window.location.origin}/mural/${panel.id}`;
      useEffect(() => {
    if (isOpen && panel) {
      console.log('🔗 URL gerada para compartilhamento:');
      console.log('  - Origin:', window.location.origin);
      console.log('  - Panel ID:', panel.id);
      console.log('  - URL completa:', shareUrl);
    }
  }, [isOpen, panel, shareUrl]);
  // Mensagem de convite padrão baseada no tipo do painel
  const getDefaultMessage = () => {
    const baseUrl = shareUrl;
    
    switch (panel.type) {
      case 'couple':
        return `💕 Oi amor! Te convido para nosso cantinho especial no Stickly Notes!\n\nVem deixar suas mensagens de carinho aqui: ${baseUrl}\n\n#JuntosNoStickly`;
        
      case 'family':
        return `🏠 Olá família! Criei nosso mural virtual no Stickly Notes!\n\nVamos compartilhar nossos momentos e recados aqui: ${baseUrl}\n\n#FamíliaUnida`;
        
      default: // friends
        return `🎉 Oi pessoal! Criei um mural colaborativo para a gente no Stickly Notes!\n\nVem compartilhar ideias e conversas aqui: ${baseUrl}\n\n#AmigosNoStickly`;
    }
  };

  // Inicializar mensagem personalizada quando modal abrir
  useEffect(() => {
    if (isOpen && !customMessage) {
      setCustomMessage(getDefaultMessage());
    }
  }, [isOpen]);

  const getCurrentMessage = () => {
    return isEditingMessage ? customMessage : getDefaultMessage();
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Erro ao copiar link:', err);
    }
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(getCurrentMessage());
      setCopiedMessage(true);
      setTimeout(() => setCopiedMessage(false), 2000);
    } catch (err) {
      console.error('Erro ao copiar mensagem:', err);
    }
  };

  const handleEditMessage = () => {
    setIsEditingMessage(true);
    setCustomMessage(getDefaultMessage());
  };

  const handleSaveMessage = () => {
    setIsEditingMessage(true); // Manter como editado
  };

  const handleResetMessage = () => {
    setCustomMessage(getDefaultMessage());
    setIsEditingMessage(false);
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Compartilhar Mural" size="large">
      <div className="space-y-6">
        {/* Mensagem de convite */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              💬 Mensagem de convite
            </label>
            <button
              onClick={isEditingMessage ? handleResetMessage : handleEditMessage}
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              {isEditingMessage ? (
                <>
                  <span>🔄</span> Restaurar padrão
                </>
              ) : (
                <>
                  <span>✏️</span> Personalizar
                </>
              )}
            </button>
          </div>
          
          <div className="bg-gray-50 rounded-lg border">
            {isEditingMessage ? (
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                className={`w-full h-48 p-4 bg-transparent resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg ${
                  isMobile ? 'text-sm' : 'text-base'
                }`}
                placeholder="Escreva sua mensagem personalizada..."
              />
            ) : (
              <pre className={`p-4 text-gray-800 whitespace-pre-wrap ${isMobile ? 'text-sm' : 'text-base'}`}>
                {getCurrentMessage()}
              </pre>
            )}
          </div>
          
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleCopyMessage}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              {copiedMessage ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiedMessage ? 'Mensagem copiada!' : 'Copiar convite'}
            </button>
            
            {isEditingMessage && customMessage !== getDefaultMessage() && (
              <button
                onClick={handleSaveMessage}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                ✓ Salvar
              </button>
            )}
          </div>
          
          <p className="text-xs text-gray-500 mt-1">
            {isEditingMessage ? 
              'Personalize sua mensagem de convite' : 
              'Mensagem pronta para WhatsApp, Telegram, etc.'
            }
          </p>
        </div>
      </div>
    </Modal>
  );
};


const AppContent = () => {
  const { isAuthenticated, isLoading } = useUser();
  const { currentPath, navigate } = useSimpleRouter();
  const [linkPanel, setLinkPanel] = useState(null);
  const [linkError, setLinkError] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);

  // Verificar se estamos acessando via link
  useEffect(() => {
    const handleLinkAccess = async () => {
      console.log('🔗 Verificando acesso via link:', currentPath);
      
      if (isAuthenticated && isLinkAccess(currentPath)) {
        const code = getLinkCode(currentPath);
        console.log('🔍 Código extraído da URL:', code);
        
        if (code) {
          setLinkLoading(true);
          setLinkError('');
          
          try {
            console.log('🔗 Tentando acessar painel via link:', code);
            const panel = await apiService.accessPanelViaLink(code);
            console.log('✅ Painel acessado com sucesso:', panel.name);
            
            setLinkPanel(panel);
            // Limpar a URL para não mostrar o código
            navigate('/');
            
          } catch (err) {
            console.error('❌ Erro ao acessar via link:', err);
            setLinkError(err.message);
          } finally {
            setLinkLoading(false);
          }
        } else {
          console.error('❌ Código não encontrado na URL:', currentPath);
          setLinkError('Link inválido');
        }
      }
    };

    handleLinkAccess();
  }, [isAuthenticated, currentPath, navigate]);

  if (isLoading || linkLoading) {
    const message = linkLoading ? 'Acessando mural via link...' : 'Inicializando...';
    return <LoadingSpinner message={message} />;
  }

  // Se teve erro ao acessar via link
  if (linkError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-100 to-pink-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full border border-gray-100 text-center">
          <div className="text-6xl mb-4">😔</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Link Inválido</h2>
          <p className="text-gray-600 mb-2">Não conseguimos acessar este mural:</p>
          <p className="text-red-600 text-sm mb-6">"{linkError}"</p>
          <div className="space-y-3">
            <button
              onClick={() => {
                setLinkError('');
                setLinkPanel(null);
                navigate('/');
              }}
              className="w-full py-3 rounded-xl font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Ir para Página Inicial
            </button>
            <p className="text-xs text-gray-500">
              Verifique se o link está correto ou se você tem permissão para acessar este mural.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  // Se acessou via link e obteve o painel, ir direto para o PanelScreen
  if (linkPanel) {
    return (
      <PanelScreen 
        panel={linkPanel} 
        onBackToHome={() => {
          setLinkPanel(null);
          navigate('/');
        }}
      />
    );
  }

  return <HomeScreen />;
};

const App = () => {
  return (
    <UserProvider>
      <AppContent />
    </UserProvider>
  );
};

export default App;