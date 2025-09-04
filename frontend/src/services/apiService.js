import { API_URL, ERROR_MESSAGES } from '../constants/config';

class ApiService {
  constructor() {
    this.baseURL = API_URL;
    this.authToken = null;
    // Rate limiting interno
    this.requestCounts = new Map(); // Map<endpoint, { count, resetTime }>
    this.maxRequestsPerEndpoint = 10;
    this.windowMs = 60000; // 1 minuto
  }

  setAuthToken(token) {
    this.authToken = token;
  }

  // RATE LIMITING INTERNO
  canMakeRequest(endpoint) {
    const now = Date.now();
    const requestData = this.requestCounts.get(endpoint);

    if (!requestData) {
      return true;
    }

    // Reset contador se passou da janela de tempo
    if (now > requestData.resetTime) {
      this.requestCounts.delete(endpoint);
      return true;
    }

    return requestData.count < this.maxRequestsPerEndpoint;
  }

  recordRequest(endpoint) {
    const now = Date.now();
    const requestData = this.requestCounts.get(endpoint) || { count: 0, resetTime: now + this.windowMs };

    // Reset contador se passou da janela de tempo
    if (now > requestData.resetTime) {
      requestData.count = 0;
      requestData.resetTime = now + this.windowMs;
    }

    requestData.count += 1;
    this.requestCounts.set(endpoint, requestData);
  }

  async request(endpoint, options = {}) {
    // Rate limiting check
    if (!this.canMakeRequest(endpoint)) {
      console.warn(`Rate limit atingido para ${endpoint}`);
      throw new Error('Muitas requisições. Aguarde um momento.');
    }

    const url = `${this.baseURL}${endpoint}`;
    
    const config = {
      headers: { 
        'Content-Type': 'application/json',
        ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` }),
        ...options.headers 
      },
      ...options,
    };

    try {
      // Registrar tentativa
      this.recordRequest(endpoint);

      console.log(`🌐 API Request: ${options.method || 'GET'} ${endpoint}`);
      const response = await fetch(url, config);
      
      if (!response.ok) {
        let errorMessage = ERROR_MESSAGES.GENERIC_ERROR;
        
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
          console.error(`❌ API Error ${response.status}:`, errorData);
        } catch {
          switch (response.status) {
            case 400: errorMessage = 'Dados inválidos'; break;
            case 401: 
              errorMessage = endpoint.includes('/auth/') ? 
                ERROR_MESSAGES.INVALID_CREDENTIALS : 'Não autorizado'; 
              break;
            case 403: 
              errorMessage = errorMessage.includes('lotado') ? 
                errorMessage : ERROR_MESSAGES.PANEL_FULL; 
              break;
            case 404: errorMessage = ERROR_MESSAGES.PANEL_NOT_FOUND; break;
            case 409: errorMessage = ERROR_MESSAGES.EMAIL_IN_USE; break;
            case 429: errorMessage = 'Muitas tentativas. Aguarde alguns momentos.'; break;
            case 500: errorMessage = 'Erro interno do servidor. Tente novamente.'; break;
            default: errorMessage = ERROR_MESSAGES.GENERIC_ERROR;
          }
        }
        
        throw new Error(errorMessage);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        console.log(`✅ API Success: ${options.method || 'GET'} ${endpoint}`);
        return data;
      }
      
      console.log(`✅ API Success (no content): ${options.method || 'GET'} ${endpoint}`);
      return null;
    } catch (error) {
      if (error.name === 'TypeError') {
        console.error('❌ Network Error:', error);
        throw new Error(ERROR_MESSAGES.NETWORK_ERROR);
      }
      console.error('❌ API Request Error:', error);
      throw error;
    }
  }

  get(endpoint, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;
    return this.request(url, { method: 'GET' });
  }

  post(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  patch(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  delete(endpoint, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;
    return this.request(url, { method: 'DELETE' });
  }

  // Métodos de autenticação
  async register(userData) {
    return this.post('/api/auth/register', userData);
  }

  async login(email, password) {
    return this.post('/api/auth/login', { email, password });
  }

  async logout() {
    return this.post('/api/auth/logout');
  }

  async getCurrentUser() {
    return this.get('/api/auth/me');
  }

  async getMyPanels() {
    return this.get('/api/auth/my-panels');
  }

  async leavePanel(panelId) {
    console.log('📡 API: Saindo do painel', panelId);
    return this.delete(`/api/panels/${panelId}/leave`);
  }

  // Métodos específicos da aplicação
  async checkPanelRequiresPassword(code) {
    const data = await this.get(`/api/panels/${code}/check`);
    return data.requiresPassword;
  }

  async createPanel(panelData) {
    return this.post('/api/panels', panelData);
  }

  async accessPanel(code, accessData) {
    return this.post(`/api/panels/${code}`, accessData);
  }

  // NOVO MÉTODO: Acesso via link direto (sem necessidade de senha)
  async accessPanelViaLink(code) {
    console.log('📡 API: Acessando painel via link:', code);
    
    // Validar código antes de fazer requisição
    if (!code || code.length !== 6) {
      throw new Error('Código inválido');
    }

    const upperCode = code.toUpperCase();
    
    try {
      // Usar a nova rota específica para links
      const panel = await this.get(`/api/panels/link/${upperCode}`);
      console.log('✅ Painel acessado via link:', panel.name);
      return panel;
    } catch (error) {
      console.error('❌ Erro ao acessar painel via link:', error);
      
      // Tratar erros específicos
      if (error.message.includes('não encontrado')) {
        throw new Error('Link inválido ou painel não encontrado');
      } else if (error.message.includes('lotado')) {
        throw new Error('Mural está lotado no momento. Tente novamente mais tarde.');
      } else if (error.message.includes('Muitas requisições')) {
        throw new Error('Muitas tentativas de acesso. Aguarde alguns momentos.');
      }
      
      throw error;
    }
  }

  async getPanelPosts(panelId) {
    return this.get(`/api/panels/${panelId}/posts`);
  }

  async createPost(panelId, postData) {
    // Se anonymous for true, não enviar author_name
    // Se anonymous for false, o backend usará os dados do usuário logado
    const payload = {
      content: postData.content,
      color: postData.color,
      anonymous: postData.anonymous || false,
      position_x: postData.position_x,
      position_y: postData.position_y
    };

    return this.post(`/api/panels/${panelId}/posts`, payload);
  }

  async updatePostPosition(postId, positionData) {
    return this.patch(`/api/posts/${postId}/position`, positionData);
  }

  async deletePost(postId, params) {
    return this.delete(`/api/posts/${postId}`, params);
  }

  // Método para limpar rate limiting (útil para testes)
  clearRateLimiting() {
    this.requestCounts.clear();
    console.log('Rate limiting interno limpo');
  }

  // Método para obter status de rate limiting
  getRateLimitStatus() {
    const now = Date.now();
    const status = {};
    
    for (const [endpoint, data] of this.requestCounts.entries()) {
      if (now <= data.resetTime) {
        status[endpoint] = {
          requests: data.count,
          maxRequests: this.maxRequestsPerEndpoint,
          resetIn: Math.ceil((data.resetTime - now) / 1000)
        };
      }
    }
    
    return status;
  }
}

export const apiService = new ApiService();