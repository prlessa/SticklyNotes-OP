import { API_URL, ERROR_MESSAGES } from '../constants/config';

class ApiService {
  constructor() {
    this.baseURL = API_URL;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    
    const config = {
      headers: { 'Content-Type': 'application/json', ...options.headers },
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
            case 401: errorMessage = ERROR_MESSAGES.WRONG_PASSWORD; break;
            case 403: errorMessage = ERROR_MESSAGES.PANEL_FULL; break;
            case 404: errorMessage = ERROR_MESSAGES.PANEL_NOT_FOUND; break;
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
    return this.post(`/api/panels/${panelId}/posts`, postData);
  }

  async updatePostPosition(postId, positionData) {
    return this.patch(`/api/posts/${postId}/position`, positionData);
  }

  async deletePost(postId, params) {
    return this.delete(`/api/posts/${postId}`, params);
  }
}

export const apiService = new ApiService();