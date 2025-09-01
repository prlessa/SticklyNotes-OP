import React, { useState, useRef, useEffect } from 'react';

export function PostIt({ post, onDelete, onMove, canDelete, currentUserId }) {
  const [position, setPosition] = useState({ 
    x: post.position_x || 50, 
    y: post.position_y || 50 
  });
  const [isDragging, setIsDragging] = useState(false);
  const noteRef = useRef(null);
  const dragStart = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e) => {
    if (e.target.tagName === 'BUTTON') return; // Não arrastar se clicar no botão
    
    e.preventDefault();
    const rect = noteRef.current.getBoundingClientRect();
    dragStart.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging || !noteRef.current) return;
      
      const parent = noteRef.current.parentElement;
      const parentRect = parent.getBoundingClientRect();
      
      let newX = e.clientX - parentRect.left - dragStart.current.x;
      let newY = e.clientY - parentRect.top - dragStart.current.y;
      
      // Limitar dentro da área do painel
      newX = Math.max(0, Math.min(newX, parentRect.width - 250));
      newY = Math.max(0, Math.min(newY, parentRect.height - 200));
      
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        if (onMove) {
          onMove(post.id, position.x, position.y);
        }
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, position, post.id, onMove]);

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

  // Usuário pode deletar se é o autor do post ou se o post é anônimo
  const canDeletePost = post.author_user_id === currentUserId || (!post.author_name && canDelete);

  return (
    <div
      ref={noteRef}
      className={`absolute w-64 min-h-[180px] p-4 rounded-lg shadow-lg transform transition-all duration-200 ${
        isDragging ? 'cursor-grabbing scale-105 rotate-1 shadow-xl z-50' : 'cursor-grab hover:shadow-xl hover:-rotate-1'
      }`}
      style={{
        backgroundColor: post.color || '#A8D8EA',
        left: position.x,
        top: position.y,
        background: `linear-gradient(135deg, ${post.color || '#A8D8EA'} 0%, ${post.color || '#A8D8EA'}dd 100%)`
      }}
    >
      {/* Fita adesiva */}
      <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 w-16 h-6 bg-yellow-200 opacity-60 rotate-3 rounded-sm"></div>
      
      {/* Header do post */}
      <div 
        className="flex justify-between items-start mb-3 -m-2 p-2 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
      >
        <div className="flex-1">
          <p className="text-xs font-medium text-gray-700">
            {post.author_name || 'Anônimo'}
          </p>
          <p className="text-xs text-gray-500">
            {formatDate(post.created_at)}
          </p>
        </div>
        {canDeletePost && (
          <button
            onClick={() => onDelete(post.id)}
            className="p-1 hover:bg-black hover:bg-opacity-10 rounded transition-colors z-10"
            style={{ cursor: 'pointer' }}
            title="Deletar nota"
          >
            <span className="text-gray-600 text-lg font-bold">×</span>
          </button>
        )}
      </div>
      
      {/* Conteúdo */}
      <div className="text-gray-800 text-sm whitespace-pre-wrap break-words leading-relaxed">
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