import { API_URL, ERROR_MESSAGES } from '../constants/config';

class ApiService {
  constructor() {
    this.baseURL = API_URL;
    this.authToken = null;
  }

  setAuthToken(token) {
    this.authToken = token;
  }

  async request(endpoint, options = {}) {
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
      const response = await fetch(url, config);
      
      if (!response.ok) {
        let errorMessage = ERROR_MESSAGES.GENERIC_ERROR;
        
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          switch (response.status) {
            case 400: errorMessage = 'Dados inválidos'; break;
            case 401: 
              errorMessage = endpoint.includes('/auth/') ? 
                ERROR_MESSAGES.INVALID_CREDENTIALS : 'Não autorizado'; 
              break;
            case 403: errorMessage = ERROR_MESSAGES.PANEL_FULL; break;
            case 404: errorMessage = ERROR_MESSAGES.PANEL_NOT_FOUND; break;
            case 409: errorMessage = ERROR_MESSAGES.EMAIL_IN_USE; break;
            case 429: errorMessage = 'Muitas tentativas. Aguarde.'; break;
            default: errorMessage = ERROR_MESSAGES.GENERIC_ERROR;
          }
        }
        
        throw new Error(errorMessage);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      
      return null;
    } catch (error) {
      if (error.name === 'TypeError') {
        throw new Error(ERROR_MESSAGES.NETWORK_ERROR);
      }
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
}

export const apiService = new ApiService();