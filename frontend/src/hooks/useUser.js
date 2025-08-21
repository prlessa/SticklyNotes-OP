import React, { createContext, useContext, useEffect, useState } from 'react';

const UserContext = createContext();

export function UserProvider({ children }) {
  const [userId, setUserId] = useState(null);
  const [username, setUserNameState] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = () => {
    try {
      setIsLoading(true);

      // Gerar ou recuperar userId
      let storedUserId = localStorage.getItem('stickyNotesUserId');
      if (!storedUserId) {
        storedUserId = 'user_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        localStorage.setItem('stickyNotesUserId', storedUserId);
      }

      // Recuperar username se existir
      const storedUsername = localStorage.getItem('stickyNotesUserName');

      setUserId(storedUserId);
      setUserNameState(storedUsername);
      setError(null);
    } catch (err) {
      console.error('Erro ao carregar dados do usuário:', err);
      setError('Erro ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  };

  const setUsername = (name) => {
    try {
      if (!name || name.trim().length === 0) {
        setError('Nome é obrigatório');
        return false;
      }

      const trimmedName = name.trim();
      if (trimmedName.length > 50) {
        setError('Nome muito longo');
        return false;
      }

      localStorage.setItem('stickyNotesUserName', trimmedName);
      setUserNameState(trimmedName);
      setError(null);
      return true;
    } catch (err) {
      setError('Erro ao salvar nome');
      return false;
    }
  };

  const clearUser = () => {
    try {
      localStorage.removeItem('stickyNotesUserName');
      setUserNameState(null);
      setError(null);
    } catch (err) {
      console.error('Erro ao limpar usuário:', err);
    }
  };

  const value = {
    userId,
    username,
    isLoggedIn: !!username,
    isLoading,
    error,
    setUsername,
    clearUser,
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