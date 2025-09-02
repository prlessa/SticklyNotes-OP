import React, { useState, useEffect, useCallback } from 'react';
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
    if (!content.trim()) return;

    onSubmit({
      content: content.trim(),
      color,
      anonymous
    });

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

// Card de Painel para "Meus Murais"
const PanelCard = ({ panel, onSelectPanel }) => {
  const getTypeIcon = (type) => {
    switch (type) {
      case 'couple': return <Heart className="w-5 h-5 text-rose-500" />;
      case 'family': return <HomeIcon className="w-5 h-5 text-green-600" />;
      default: return <Users className="w-5 h-5 text-blue-600" />;
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'couple': return 'border-rose-200 bg-rose-50';
      case 'family': return 'border-green-200 bg-green-50';
      default: return 'border-blue-200 bg-blue-50';
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  return (
    <button
      onClick={() => onSelectPanel(panel)}
      className={`p-4 rounded-xl border-2 ${getTypeColor(panel.type)} hover:shadow-lg transition-all duration-200 transform hover:-translate-y-1 text-left w-full`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center">
          {getTypeIcon(panel.type)}
          <h3 className="font-semibold text-gray-800 ml-2 truncate">{panel.name}</h3>
        </div>
        <span className="text-xs font-mono bg-white px-2 py-1 rounded">{panel.id}</span>
      </div>
      
      <div className="space-y-1 text-sm text-gray-600">
        <p>{panel.post_count || 0} mensagens</p>
        <p>{panel.active_users || 0} usuários online</p>
        <p className="text-xs">Último acesso: {formatDate(panel.last_access || panel.created_at)}</p>
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
      const response = await apiService.createPanel({
        name: formData.name,
        type: panelType,
        password: formData.requirePassword ? formData.password : null,
        backgroundColor: formData.backgroundColor
      });

      setCurrentPanel(response);
    } catch (err) {
      setError(err.message || 'Erro ao criar painel');
    } finally {
      setIsLoading(false);
    }
  }, [formData, panelType]);

  if (currentPanel) {
  return (
    <PanelScreen 
      panel={currentPanel} 
      onBackToHome={onBack}  // ← CORRIGIDO
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

  if (currentPanel) {
  return (
    <PanelScreen 
      panel={currentPanel} 
      onBackToHome={onBack}
    />
  );
}

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
  // Carregar painéis do usuário
  useEffect(() => {
    const loadMyPanels = async () => {
      if (currentScreen === 'my-panels') {
        setLoadingPanels(true);
        try {
          const panels = await apiService.getMyPanels();
          setMyPanels(panels);
        } catch (err) {
          console.error('Erro ao carregar painéis:', err);
        } finally {
          setLoadingPanels(false);
        }
      }
    };

    loadMyPanels();
  }, [currentScreen]);

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
        setCurrentScreen('home');
      }}
    />
  );
}

// Tela dos meus painéis
if (currentScreen === 'my-panels') {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 via-purple-50 to-pink-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-4xl w-full border border-gray-100">
        <button
          onClick={() => setCurrentScreen('home')}
          className="mb-6 text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>

        <div className="flex items-center justify-center mb-8">
          <StickyNote className="w-12 h-12 text-slate-600 mr-3" />
          <h1 className="text-4xl font-bold text-gray-800">Meus Murais</h1>
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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

// Componente do Painel (Tela principal do mural) - Atualizado com visual de mural
const PanelScreen = ({ panel, onBackToHome }) => {
  const { user, logout } = useUser();
  const [posts, setPosts] = useState([]);
  const [activeUsers, setActiveUsers] = useState([]);
  const [showNewPostForm, setShowNewPostForm] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const colors = getColors(panel.type);
  const userName = `${user?.firstName} ${user?.lastName}`;

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
  }, []);

  const handleUserJoined = useCallback(({ userName, userId: joinedUserId }) => {
    setActiveUsers(prev => {
      const exists = prev.some(u => u.user_id === joinedUserId);
      if (!exists) {
        return [...prev, { user_id: joinedUserId, name: userName }];
      }
      return prev;
    });
  }, []);

  const handleUserLeft = useCallback(({ userId: leftUserId }) => {
    setActiveUsers(prev => prev.filter(u => u.user_id !== leftUserId));
  }, []);

  // Configurar WebSocket
  useSocket(
    panel.id,
    userName,
    user?.id,
    handleNewPost,
    handlePostMoved,
    handlePostDeleted,
    handleUserJoined,
    handleUserLeft
  );

  const handleCreatePost = useCallback(async (postData) => {
    try {
      await apiService.createPost(panel.id, {
        content: postData.content,
        color: postData.color,
        author_name: postData.anonymous ? null : userName,
        position_x: Math.floor(Math.random() * 600) + 50,
        position_y: Math.floor(Math.random() * 300) + 50
      });
      
      setShowNewPostForm(false);
    } catch (err) {
      setError(err.message);
    }
  }, [panel.id, userName]);

  const handleDeletePost = useCallback(async (postId) => {
    try {
      await apiService.deletePost(postId, { panel_id: panel.id });
    } catch (err) {
      setError(err.message);
    }
  }, [panel.id]);

  const handleMovePost = useCallback(async (postId, x, y) => {
    try {
      await apiService.updatePostPosition(postId, {
        position_x: x,
        position_y: y,
        panel_id: panel.id
      });
    } catch (err) {
      setError(err.message);
    }
  }, [panel.id]);

  const handleShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(panel.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Erro ao copiar:', err);
    }
  }, [panel.id]);

  const handleLeavePanel = useCallback(async () => {
  try {
    console.log('🚪 Saindo do painel:', panel.id);
    await apiService.leavePanel(panel.id);
    console.log('✅ Saída realizada com sucesso');
    
    if (onBackToHome) {
      onBackToHome();
    } else {
      window.location.reload();
    }
  } catch (err) {
    console.error('❌ Erro ao sair do painel:', err);
    setError(err.message);
  }
}, [panel.id, onBackToHome]);

  if (isLoading) {
    return <LoadingSpinner message="Carregando mural..." />;
  }

  return (
    <div 
      className="min-h-screen relative"
      style={{ backgroundColor: panel.background_color }}
    >
      {/* Textura de mural - padrão de cortiça */}
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `radial-gradient(circle at 20% 50%, #8B4513 1px, transparent 1px),
                           radial-gradient(circle at 80% 50%, #A0522D 1px, transparent 1px),
                           radial-gradient(circle at 40% 20%, #8B4513 1px, transparent 1px),
                           radial-gradient(circle at 60% 80%, #A0522D 1px, transparent 1px)`,
          backgroundSize: '30px 30px, 35px 35px, 25px 25px, 40px 40px'
        }}
      />

      {/* Header Flutuante */}
      <div className="fixed top-4 left-4 right-4 z-50">
        <div 
          className="rounded-2xl shadow-lg border-2 p-4"
          style={{ 
            backgroundColor: panel.background_color,
            borderColor: colors.notes[0] || '#A8D8EA'
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-800">{panel.name}</h1>
              <span className="ml-3 px-2 py-1 bg-white bg-opacity-70 rounded text-xs text-gray-600 font-mono">
                {panel.id}
              </span>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center text-sm text-gray-600">
                <Users className="w-4 h-4 mr-1" />
                {activeUsers.length}
              </div>
              
              <button
                onClick={() => setShowShareModal(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-black hover:bg-opacity-10 transition-colors text-sm"
                style={{ backgroundColor: panel.background_color }}
              >
                <Share2 className="w-4 h-4" />
                Compartilhar
              </button>
              
              <button
                onClick={() => setShowNewPostForm(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-black hover:bg-opacity-10 transition-colors text-sm"
                style={{ backgroundColor: panel.background_color }}
              >
                <Plus className="w-4 h-4" />
                Nova Nota
              </button>

              <button
                onClick={onBackToHome}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-blue-100 transition-colors text-sm text-blue-600"
                style={{ backgroundColor: panel.background_color }}
              >
                <Home className="w-4 h-4" />
                Início
              </button>

              <button
                onClick={() => setShowLeaveModal(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-red-100 transition-colors text-sm text-red-600"
                style={{ backgroundColor: panel.background_color }}
              >
                <ArrowLeft className="w-4 h-4" />
                Sair
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Área do Mural */}
      <div className="relative min-h-screen pt-24 pb-8 px-8">
        {posts.map(post => (
          <PostIt
            key={post.id}
            post={post}
            onDelete={handleDeletePost}
            onMove={handleMovePost}
            currentUserId={user?.id}
            canDelete={true}
          />
        ))}
        
        {posts.length === 0 && (
          <div className="text-center text-gray-500 mt-20 bg-white bg-opacity-70 rounded-xl p-8 mx-auto max-w-md">
            <StickyNote className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg">Seu mural está vazio</p>
            <p className="text-sm">Clique em "Nova Nota" para começar!</p>
          </div>
        )}
      </div>

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
      <Modal 
        isOpen={showShareModal} 
        onClose={() => setShowShareModal(false)}
        title="Compartilhar Mural"
        size="small"
      >
        <div className="text-center">
          <p className="text-gray-600 mb-4">
            Compartilhe este código com outros usuários:
          </p>
          
          <div className="bg-gray-100 rounded-lg p-4 mb-4">
            <div className="font-mono text-2xl font-bold text-gray-800 tracking-wider">
              {panel.id}
            </div>
          </div>
          
          <button
            onClick={handleShare}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copiado!' : 'Copiar Código'}
          </button>
        </div>
      </Modal>

      {/* Modal de Confirmação para Sair */}
      <Modal 
        isOpen={showLeaveModal} 
        onClose={() => setShowLeaveModal(false)}
        title="Sair do Mural"
        size="small"
      >
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-orange-500 mx-auto mb-4" />
          <p className="text-gray-600 mb-6">
            Tem certeza que deseja sair do mural "{panel.name}"?
          </p>
          
          <div className="flex gap-3">
            <button
              onClick={() => setShowLeaveModal(false)}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleLeavePanel}
              className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Sair do Mural
            </button>
          </div>
        </div>
      </Modal>

      {/* Toast de Erro */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
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

// Componente Principal da Aplicação
const AppContent = () => {
  const { isAuthenticated, isLoading } = useUser();

  if (isLoading) {
    return <LoadingSpinner message="Inicializando..." />;
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  return <HomeScreen />;
};

// App Principal
const App = () => {
  return (
    <UserProvider>
      <AppContent />
    </UserProvider>
  );
};

export default App;