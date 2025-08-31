-- Script de inicialização do banco de dados PostgreSQL
-- Este script será executado automaticamente quando o container do PostgreSQL for criado

-- Garantir que o banco existe
CREATE DATABASE stickly_notes_db;

-- Conectar ao banco
\c stickly_notes_db;

-- Criar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Criar tabelas
CREATE TABLE IF NOT EXISTS panels (
  id VARCHAR(6) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('friends', 'couple')),
  password_hash VARCHAR(255),
  creator VARCHAR(50) NOT NULL,
  creator_id VARCHAR(50) NOT NULL,
  border_color VARCHAR(7) DEFAULT '#9EC6F3',
  background_color VARCHAR(7) DEFAULT '#FBFBFB',
  max_users INTEGER DEFAULT 15,
  post_count INTEGER DEFAULT 0,
  active_users INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT valid_colors CHECK (
    border_color ~ '^#[0-9A-Fa-f]{6}$' AND 
    background_color ~ '^#[0-9A-Fa-f]{6}$'
  )
);

CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  panel_id VARCHAR(6) REFERENCES panels(id) ON DELETE CASCADE,
  author_name VARCHAR(50),
  author_id VARCHAR(50) NOT NULL,
  content TEXT NOT NULL CHECK (length(content) <= 1000),
  color VARCHAR(7) DEFAULT '#A8D8EA',
  position_x INTEGER DEFAULT 50 CHECK (position_x >= 0 AND position_x <= 2000),
  position_y INTEGER DEFAULT 50 CHECK (position_y >= 0 AND position_y <= 2000),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT valid_post_color CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE TABLE IF NOT EXISTS active_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  panel_id VARCHAR(6) REFERENCES panels(id) ON DELETE CASCADE,
  user_id VARCHAR(50) NOT NULL,
  username VARCHAR(50) NOT NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(panel_id, user_id)
);

CREATE TABLE IF NOT EXISTS panel_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  panel_id VARCHAR(6) REFERENCES panels(id) ON DELETE CASCADE,
  user_id VARCHAR(50) NOT NULL,
  username VARCHAR(50) NOT NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_access TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(panel_id, user_id)
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_panels_type ON panels(type);
CREATE INDEX IF NOT EXISTS idx_panels_creator_id ON panels(creator_id);
CREATE INDEX IF NOT EXISTS idx_panels_last_activity ON panels(last_activity);

CREATE INDEX IF NOT EXISTS idx_posts_panel_id ON posts(panel_id);
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);

CREATE INDEX IF NOT EXISTS idx_active_users_panel_id ON active_users(panel_id);
CREATE INDEX IF NOT EXISTS idx_active_users_last_seen ON active_users(last_seen);

CREATE INDEX IF NOT EXISTS idx_participants_user_id ON panel_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_participants_last_access ON panel_participants(last_access);

-- Criar triggers para manter contadores
CREATE OR REPLACE FUNCTION update_panel_post_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE panels SET post_count = post_count + 1 WHERE id = NEW.panel_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE panels SET post_count = post_count - 1 WHERE id = OLD.panel_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_post_count ON posts;
CREATE TRIGGER trigger_update_post_count
  AFTER INSERT OR DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_panel_post_count();

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_posts_updated_at ON posts;
CREATE TRIGGER trigger_update_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Inserir dados de teste (opcional)
INSERT INTO panels (id, name, type, creator, creator_id, border_color, background_color, max_users)
VALUES 
  ('DEMO01', 'Painel de Demonstração', 'friends', 'Admin', 'admin_user', '#9EC6F3', '#FBFBFB', 15)
ON CONFLICT (id) DO NOTHING;

-- Log de sucesso
\echo 'Database stickly_notes_db initialized successfully!';