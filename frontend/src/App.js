import React, { useState, useEffect, useCallback } from 'react';
import { UserProvider, useUser } from './hooks/useUser';
import { useSocket } from './hooks/useSockets';
import { PostIt } from './components/PostIt';
import { apiService } from './services/apiService';
import { 
  StickyNote, Users, Heart, Home, Plus, Share2, 
  Copy, Check, X, AlertCircle, Send, Palette,
  Lock, Unlock, Hash, User
} from 'lucide-react';
import { 
  FRIENDS_COLORS, COUPLE_COLORS, PANEL_TYPES, 
  LIMITS, ERROR_MESSAGES 
} from './constants/config';

// Função para obter cores baseadas no tipo do painel
const getColors = (type) => {
  return type === 'couple' ? COUPLE_COLORS : FRIENDS_COLORS;
};

// Componente de Loading
function LoadingSpinner({ message = 'Carregando...' }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  );
}

// Componente Modal
function Modal({ isOpen, onClose, title, children, size = 'medium' }) {
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
}

// Componente de Formulário de Post
function NewPostForm({ onSubmit, onCancel, colors }) {
  const [content, setContent] = useState('');
  const [color, setColor] = useState(colors.notes[0]);
  const [authorName, setAuthorName] = useState('');
  const [anonymous, setAnonymous] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    onSubmit({
      content: content.trim(),
      color,
      author_name: anonymous ? null : authorName.trim() || null
    });

    setContent('');
    setAuthorName('');
    setAnonymous(false);
  };

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

        <div className="flex items-center justify-between">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">Postar anonimamente</span>
          </label>
        </div>

        {!anonymous && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Seu nome (opcional)
            </label>
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Digite seu nome..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={LIMITS.USERNAME_MAX_LENGTH}
            />
          </div>
        )}

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
}

// Tela de Boas-vindas
function WelcomeScreen() {
  const { setUsername, error, setError } = useUser();
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Digite seu nome');
      return;
    }
    
    setIsLoading(true);
    const success = setUsername(name);
    setIsLoading(false);
    
    if (success) {
      setError(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 via-purple-50 to-pink-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full border border-gray-100">
        <div className="flex items-center justify-center mb-8">
          <StickyNote className="w-12 h-12 text-slate-600 mr-3" />
          <h1 className="text-4xl font-bold text-gray-800">Stickly Notes</h1>
        </div>
        
        <p className="text-center text-gray-600 mb-8 text-lg">
          Informe seu nome e seja bem-vindo!
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-5">
          <input
            type="text"
            placeholder="Digite seu nome..."
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition-all text-center text-lg"
            onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSubmit()}
            autoFocus
            disabled={isLoading}
            maxLength={LIMITS.USERNAME_MAX_LENGTH}
          />

          <button
            onClick={handleSubmit}
            disabled={isLoading || !name.trim()}
            className="w-full py-3 rounded-xl font-semibold transition-all duration-200 transform hover:scale-[1.02] bg-gradient-to-r from-slate-600 to-gray-700 text-white hover:from-slate-700 hover:to-gray-800 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isLoading ? 'Carregando...' : 'Continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Tela Principal
function HomeScreen() {
  const { username, clearUser } = useUser();
  const [currentScreen, setCurrentScreen] = useState('home');
  const [panelType, setPanelType] = useState('');

  // Tela de escolha de tipo
  if (currentScreen === 'create' && !panelType) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 via-purple-50 to-pink-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-2xl w-full border border-gray-100">
          <button
            onClick={() => setCurrentScreen('home')}
            className="mb-6 text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1 text-sm"
          >
            ← Voltar
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
        onBack={() => setPanelType('')}
        username={username}
      />
    );
  }

  // Tela de acesso a painel
  if (currentScreen === 'join') {
    return (
      <JoinPanelScreen 
        onBack={() => setCurrentScreen('home')}
        username={username}
      />
    );
  }

  // Tela principal
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 via-purple-50 to-pink-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-2xl w-full border border-gray-100">
        <div className="flex items-center justify-center mb-8">
          <StickyNote className="w-12 h-12 text-slate-600 mr-3" />
          <h1 className="text-5xl font-bold text-gray-800">Stickly Notes</h1>
        </div>
        
        <p className="text-center text-gray-600 mb-4 text-lg">
          Olá, <span className="font-semibold text-slate-700">{username}</span>! 👋
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
            onClick={() => setCurrentScreen('join')}
            className="w-full p-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl hover:from-green-100 hover:to-emerald-100 transition-all duration-300 border border-green-200 hover:border-green-300 hover:shadow-lg transform hover:-translate-y-1"
          >
            <div className="flex items-center">
              <Hash className="w-8 h-8 text-green-600 mr-4" />
              <div className="text-left">
                <h3 className="text-xl font-semibold text-gray-800">Acesse um mural</h3>
                <p className="text-gray-600 text-sm mt-1">Entre em um mural existente usando um código</p>
              </div>
            </div>
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <button
            onClick={clearUser}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Alterar nome
          </button>
        </div>
      </div>
    </div>
  );
}

// Componente de Criação de Painel
function CreatePanelScreen({ panelType, onBack, username }) {
  const { userId } = useUser();
  const [formData, setFormData] = useState({
    name: '',
    password: '',
    requirePassword: false,
    borderColor: '',
    backgroundColor: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPanel, setCurrentPanel] = useState(null);

  const colors = getColors(panelType);

  // Definir cores padrão
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      borderColor: colors.borders[0],
      backgroundColor: colors.backgrounds[0]
    }));
  }, [panelType]);

  const handleSubmit = async () => {
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
        creator: username,
        userId: userId,
        borderColor: formData.borderColor,
        backgroundColor: formData.backgroundColor
      });

      setCurrentPanel(response);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (currentPanel) {
    return <PanelScreen panel={currentPanel} />;
  }

  const gradient = panelType === 'couple' ? 
    'bg-gradient-to-br from-pink-100 to-rose-100' : 
    'bg-gradient-to-br from-blue-100 to-indigo-100';

  return (
    <div className={`min-h-screen ${gradient} flex items-center justify-center p-4`}>
      <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full border border-gray-100">
        <button
          onClick={onBack}
          className="mb-6 text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1 text-sm"
        >
          ← Voltar
        </button>

        <div className="flex items-center justify-center mb-8">
          {panelType === 'couple' ? (
            <Heart className="w-10 h-10 text-rose-500 mr-3" />
          ) : (
            <StickyNote className="w-10 h-10 text-slate-600 mr-3" />
          )}
          <h2 className="text-4xl font-bold text-gray-800">
            {panelType === 'couple' ? 'Painel Romântico' : 'Novo Mural'}
          </h2>
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
              placeholder={panelType === 'couple' ? 'Nosso cantinho romântico ❤️' : 'Ideias da turma'}
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition-all"
              maxLength={LIMITS.PANEL_NAME_MAX_LENGTH}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Palette className="w-4 h-4 inline mr-1" />
              Cor da Borda
            </label>
            <div className="flex gap-2 flex-wrap">
              {colors.borders.map(color => (
                <button
                  key={color}
                  onClick={() => setFormData(prev => ({ ...prev, borderColor: color }))}
                  className={`w-12 h-12 rounded-xl border-4 transition-all ${
                    formData.borderColor === color ? 'scale-110 shadow-lg' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: color, borderColor: color }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Palette className="w-4 h-4 inline mr-1" />
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
                <Unlock className="w-5 h-5 text-gray-400 mr-2" />
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
                : 'bg-gradient-to-r from-slate-600 to-gray-700 text-white hover:from-slate-700 hover:to-gray-800'
            } disabled:cursor-not-allowed disabled:transform-none`}
          >
            {isLoading ? 'Criando...' : `Criar ${panelType === 'couple' ? 'Mural Romântico' : 'Mural'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// Componente de Acesso a Painel
function JoinPanelScreen({ onBack, username }) {
  const { userId } = useUser();
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

  const handleSubmit = async () => {
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
        password: formData.password || undefined,
        userName: username,
        userId: userId
      });

      setCurrentPanel(response);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (currentPanel) {
    return <PanelScreen panel={currentPanel} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full border border-gray-100">
        <button
          onClick={onBack}
          className="mb-6 text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1 text-sm"
        >
          ← Voltar
        </button>

        <div className="flex items-center justify-center mb-8">
          <Hash className="w-10 h-10 text-green-600 mr-3" />
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
}

// Componente do Painel (Tela principal do mural)
function PanelScreen({ panel }) {
  const { username, userId } = useUser();
  const [posts, setPosts] = useState([]);
  const [activeUsers, setActiveUsers] = useState([]);
  const [showNewPostForm, setShowNewPostForm] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const colors = getColors(panel.type);

  // Carregar dados iniciais
  useEffect(() => {
    loadInitialData();
  }, []);

  // Configurar WebSocket
  useSocket(
    panel.id,
    username,
    userId,
    handleNewPost,
    handlePostMoved,
    handlePostDeleted,
    handleUserJoined,
    handleUserLeft
  );

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

  // Handlers de WebSocket
  const handleNewPost = (post) => {
    setPosts(prev => [post, ...prev]);
  };

  const handlePostMoved = (post) => {
    setPosts(prev => prev.map(p => p.id === post.id ? post : p));
  };

  const handlePostDeleted = ({ postId }) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  const handleUserJoined = ({ userName, userId: joinedUserId }) => {
    setActiveUsers(prev => {
      const exists = prev.some(u => u.user_id === joinedUserId);
      if (!exists) {
        return [...prev, { user_id: joinedUserId, name: userName }];
      }
      return prev;
    });
  };

  const handleUserLeft = ({ userId: leftUserId }) => {
    setActiveUsers(prev => prev.filter(u => u.user_id !== leftUserId));
  };

  const handleCreatePost = async (postData) => {
    try {
      await apiService.createPost(panel.id, {
        ...postData,
        author_id: userId,
        position_x: Math.floor(Math.random() * 600) + 50,
        position_y: Math.floor(Math.random() * 300) + 50
      });
      
      setShowNewPostForm(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeletePost = async (postId) => {
    try {
      await apiService.deletePost(postId, { panel_id: panel.id });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleMovePost = async (postId, x, y) => {
    try {
      await apiService.updatePostPosition(postId, {
        position_x: x,
        position_y: y,
        panel_id: panel.id
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(panel.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Erro ao copiar:', err);
    }
  };

  if (isLoading) {
    return <LoadingSpinner message="Carregando mural..." />;
  }

  const panelGradient = panel.type === 'couple' ? 
    'bg-gradient-to-br from-pink-50 to-rose-50' : 
    'bg-gradient-to-br from-blue-50 to-indigo-50';

  return (
    <div className={`min-h-screen ${panelGradient}`}>
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div 
                className="w-4 h-4 rounded-full mr-3"
                style={{ backgroundColor: panel.border_color }}
              />
              <h1 className="text-xl font-bold text-gray-800">{panel.name}</h1>
              <span className="ml-3 px-2 py-1 bg-gray-100 rounded text-xs text-gray-600 font-mono">
                {panel.id}
              </span>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center text-sm text-gray-600">
                <Users className="w-4 h-4 mr-1" />
                {activeUsers.length} online
              </div>
              
              <button
                onClick={() => setShowShareModal(true)}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                <Share2 className="w-4 h-4" />
                Compartilhar
              </button>
              
              <button
                onClick={() => setShowNewPostForm(true)}
                className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                Nova Nota
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Área do Mural */}
      <div 
        className="relative min-h-screen p-8"
        style={{ backgroundColor: panel.background_color }}
      >
        {posts.map(post => (
          <PostIt
            key={post.id}
            post={post}
            onDelete={handleDeletePost}
            onMove={handleMovePost}
            currentUserId={userId}
            canDelete={true}
          />
        ))}
        
        {posts.length === 0 && (
          <div className="text-center text-gray-500 mt-20">
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
            Compartilhe este código com seus amigos:
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

      {/* Toast de Erro */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg">
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
}

// Componente Principal da Aplicação
function AppContent() {
  const { username, isLoading } = useUser();

  if (isLoading) {
    return <LoadingSpinner message="Inicializando..." />;
  }

  if (!username) {
    return <WelcomeScreen />;
  }

  return <HomeScreen />;
}

// App Principal
function App() {
  return (
    <UserProvider>
      <AppContent />
    </UserProvider>
  );
}

export default App;
    