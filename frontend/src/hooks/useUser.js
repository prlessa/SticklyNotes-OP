import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiService } from '../services/apiService';

const UserContext = createContext();

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      setIsLoading(true);

      // Recuperar token do localStorage
      const storedToken = localStorage.getItem('sticklyNotesToken');
      
      if (storedToken) {
        setToken(storedToken);
        apiService.setAuthToken(storedToken);
        
        // Verificar se o token ainda é válido
        try {
          const userData = await apiService.getCurrentUser();
          setUser(userData);
        } catch (err) {
          // Token inválido, remover
          localStorage.removeItem('sticklyNotesToken');
          setToken(null);
          apiService.setAuthToken(null);
        }
      }

      setError(null);
    } catch (err) {
      console.error('Erro ao carregar dados do usuário:', err);
      setError('Erro ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      setError(null);
      const response = await apiService.login(email, password);
      
      const { token, user } = response;
      
      // Salvar token no localStorage
      localStorage.setItem('sticklyNotesToken', token);
      
      // Configurar token no apiService
      apiService.setAuthToken(token);
      
      setToken(token);
      setUser(user);
      
      return response;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const register = async (userData) => {
    try {
      setError(null);
      const response = await apiService.register(userData);
      
      const { token, user } = response;
      
      // Salvar token no localStorage
      localStorage.setItem('sticklyNotesToken', token);
      
      // Configurar token no apiService
      apiService.setAuthToken(token);
      
      setToken(token);
      setUser(user);
      
      return response;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const logout = async () => {
    try {
      // Fazer logout no servidor (opcional)
      if (token) {
        await apiService.logout();
      }
    } catch (err) {
      console.error('Erro ao fazer logout:', err);
    } finally {
      // Limpar dados locais
      localStorage.removeItem('sticklyNotesToken');
      apiService.setAuthToken(null);
      setToken(null);
      setUser(null);
      setError(null);
    }
  };

  const value = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    error,
    login,
    register,
    logout,
    setError
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser deve ser usado dentro de UserProvider');
  }
  return context;
}