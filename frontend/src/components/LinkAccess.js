// frontend/src/components/LinkAccess.js
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/apiService';
import { LoadingSpinner } from './LoadingSpinner';

export const LinkAccessScreen = ({ onPanelAccess }) => {
  const { code } = useParams();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  useEffect(() => {
    const accessPanelViaLink = async () => {
      if (!code) {
        setError('Código inválido');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const panel = await apiService.accessPanelViaLink(code.toUpperCase());
        
        // Sucesso - ir para o painel
        if (onPanelAccess) {
          onPanelAccess(panel);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    accessPanelViaLink();
  }, [code, onPanelAccess]);

  if (isLoading) {
    return <LoadingSpinner message="Acessando mural..." />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-100 to-pink-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full border border-gray-100 text-center">
          <div className="text-6xl mb-4">😔</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Ops!</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-3 rounded-xl font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Voltar ao Início
          </button>
        </div>
      </div>
    );
  }

  return null;
};