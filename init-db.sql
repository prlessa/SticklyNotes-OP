-- Atualização do schema para suporte a autenticação de usuários

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  birth_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT valid_email CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT valid_birth_date CHECK (birth_date <= CURRENT_DATE)
);

-- Atualizar tabela de painéis para usar UUID do usuário
ALTER TABLE panels ADD COLUMN IF NOT EXISTS creator_user_id UUID REFERENCES users(id);

-- Atualizar tabela de posts para usar UUID do usuário
ALTER TABLE posts ADD COLUMN IF NOT EXISTS author_user_id UUID REFERENCES users(id);

-- Remover a obrigatoriedade da borda (permitir NULL)
ALTER TABLE panels ALTER COLUMN border_color DROP NOT NULL;
ALTER TABLE panels ALTER COLUMN border_color DROP DEFAULT;

-- Adicionar tipo família
ALTER TABLE panels DROP CONSTRAINT IF EXISTS panels_type_check;
ALTER TABLE panels ADD CONSTRAINT panels_type_check CHECK (type IN ('friends', 'couple', 'family'));

-- Atualizar active_users para usar UUID
ALTER TABLE active_users ADD COLUMN IF NOT EXISTS user_uuid UUID REFERENCES users(id);

-- Atualizar panel_participants para usar UUID
ALTER TABLE panel_participants ADD COLUMN IF NOT EXISTS user_uuid UUID REFERENCES users(id);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_panels_creator_user_id ON panels(creator_user_id);
CREATE INDEX IF NOT EXISTS idx_posts_author_user_id ON posts(author_user_id);

-- Trigger para atualizar updated_at em users
DROP TRIGGER IF EXISTS trigger_update_users_updated_at ON users;
CREATE TRIGGER trigger_update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Dados de demonstração (opcional)
-- Inserir usuário de teste
INSERT INTO users (first_name, last_name, email, password_hash, birth_date)
VALUES 
  ('Demo', 'User', 'prlessajunior@gmail.com', 'QWERT1234', '1990-01-01')
ON CONFLICT (email) DO NOTHING;

\echo 'Database schema updated successfully for user authentication!';