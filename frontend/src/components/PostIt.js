import React, { useState, useRef, useEffect } from 'react';

export function PostIt({ post, onDelete, onMove, canDelete, currentUserId }) {
  const [position, setPosition] = useState({ 
    x: post.position_x || 50, 
    y: post.position_y || 50 
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const noteRef = useRef(null);
  const dragStart = useRef({ x: 0, y: 0 });

  // Detectar se é mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Ajustar posição inicial para mobile
  useEffect(() => {
    if (isMobile && noteRef.current) {
      const parent = noteRef.current.parentElement;
      if (parent) {
        const parentRect = parent.getBoundingClientRect();
        const noteWidth = 250; // Largura da nota
        const noteHeight = 180; // Altura da nota
        
        // Garantir que a nota fique dentro da tela
        let adjustedX = Math.min(position.x, parentRect.width - noteWidth - 20);
        let adjustedY = Math.min(position.y, parentRect.height - noteHeight - 20);
        
        // Mínimo de 10px das bordas
        adjustedX = Math.max(10, adjustedX);
        adjustedY = Math.max(10, adjustedY);
        
        if (adjustedX !== position.x || adjustedY !== position.y) {
          setPosition({ x: adjustedX, y: adjustedY });
        }
      }
    }
  }, [isMobile, position.x, position.y]);

  const handleStart = (clientX, clientY, e) => {
    if (e?.target?.tagName === 'BUTTON') return;
    
    e?.preventDefault();
    const rect = noteRef.current.getBoundingClientRect();
    dragStart.current = {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
    setIsDragging(true);
  };

  // Mouse events
  const handleMouseDown = (e) => {
    handleStart(e.clientX, e.clientY, e);
  };

  // Touch events para mobile
  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    handleStart(touch.clientX, touch.clientY, e);
  };

  useEffect(() => {
    const handleMove = (clientX, clientY) => {
      if (!isDragging || !noteRef.current) return;
      
      const parent = noteRef.current.parentElement;
      const parentRect = parent.getBoundingClientRect();
      
      let newX = clientX - parentRect.left - dragStart.current.x;
      let newY = clientY - parentRect.top - dragStart.current.y;
      
      // Dimensões da nota
      const noteWidth = isMobile ? 220 : 250;
      const noteHeight = isMobile ? 160 : 180;
      
      // Limitar dentro da área do painel com margens adequadas para mobile
      const margin = isMobile ? 10 : 20;
      newX = Math.max(margin, Math.min(newX, parentRect.width - noteWidth - margin));
      newY = Math.max(margin, Math.min(newY, parentRect.height - noteHeight - margin));
      
      setPosition({ x: newX, y: newY });
    };

    const handleMouseMove = (e) => {
      handleMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e) => {
      e.preventDefault(); // Previne scroll durante drag
      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY);
    };

    const handleEnd = () => {
      if (isDragging) {
        setIsDragging(false);
        if (onMove) {
          onMove(post.id, position.x, position.y);
        }
      }
    };

    if (isDragging) {
      // Mouse events
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleEnd);
      
      // Touch events
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleEnd);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleEnd);
      };
    }
  }, [isDragging, position, post.id, onMove, isMobile]);

  const formatDate = (date) => {
    try {
      const d = new Date(date);
      return d.toLocaleString('pt-BR', { 
        day: '2-digit', 
        month: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return 'Data inválida';
    }
  };

  const canDeletePost = post.author_user_id === currentUserId || (!post.author_name && canDelete);

  return (
    <div
      ref={noteRef}
      className={`absolute transition-all duration-200 ${
        isDragging ? 'cursor-grabbing scale-105 rotate-1 shadow-xl z-50' : 'cursor-grab hover:shadow-xl hover:-rotate-1'
      } ${
        isMobile ? 'w-52 min-h-[140px] p-3' : 'w-64 min-h-[180px] p-4'
      } rounded-lg shadow-lg transform`}
      style={{
        backgroundColor: post.color || '#A8D8EA',
        left: position.x,
        top: position.y,
        background: `linear-gradient(135deg, ${post.color || '#A8D8EA'} 0%, ${post.color || '#A8D8EA'}dd 100%)`,
        touchAction: 'none' // Importante para touch events
      }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      {/* Fita adesiva */}
      <div className={`absolute -top-2 left-1/2 transform -translate-x-1/2 bg-yellow-200 opacity-60 rotate-3 rounded-sm ${
        isMobile ? 'w-12 h-4' : 'w-16 h-6'
      }`}></div>
      
      {/* Header do post */}
      <div className={`flex justify-between items-start mb-2 -m-2 p-2 cursor-grab active:cursor-grabbing ${
        isMobile ? 'text-xs' : ''
      }`}>
        <div className="flex-1">
          <p className={`font-medium text-gray-700 ${isMobile ? 'text-xs' : 'text-xs'}`}>
            {post.author_name || 'Anônimo'}
          </p>
          <p className={`text-gray-500 ${isMobile ? 'text-xs' : 'text-xs'}`}>
            {formatDate(post.created_at)}
          </p>
        </div>
        {canDeletePost && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(post.id);
            }}
            className={`hover:bg-black hover:bg-opacity-10 rounded transition-colors z-10 ${
              isMobile ? 'p-1 text-lg' : 'p-1 text-lg'
            }`}
            style={{ cursor: 'pointer' }}
            title="Deletar nota"
          >
            <span className="text-gray-600 font-bold">×</span>
          </button>
        )}
      </div>
      
      {/* Conteúdo */}
      <div className={`text-gray-800 whitespace-pre-wrap break-words leading-relaxed ${
        isMobile ? 'text-xs' : 'text-sm'
      }`}>
        {post.content}
      </div>

      {/* Sombra de papel */}
      <div className="absolute inset-0 rounded-lg pointer-events-none opacity-30" 
           style={{
             boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.1)'
           }} 
      />
    </div>
  );
}