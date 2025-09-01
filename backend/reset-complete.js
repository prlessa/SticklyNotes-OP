require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/stickly_notes_db',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

async function completeReset() {
    console.log('🔥 RESET COMPLETO DO BANCO - Stickly Notes');
    console.log('=========================================\n');
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // 1. DROPAR TODAS AS TABELAS
        console.log('🗑️ 1. Removendo todas as tabelas...');
        
        const dropOrder = [
            'panel_participants',
            'active_users', 
            'posts',
            'panels',
            'users'
        ];
        
        for (const table of dropOrder) {
            try {
                await client.query(`DROP TABLE IF EXISTS ${table} CASCADE;`);
                console.log(`   ✅ Tabela ${table} removida`);
            } catch (err) {
                console.log(`   ⚠️ Tabela ${table} não existia`);
            }
        }
        
        // 2. DROPAR FUNÇÃO DE TRIGGER
        console.log('\n🗑️ 2. Removendo funções...');
        await client.query('DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;');
        console.log('   ✅ Função de trigger removida');

        // 3. CRIAR FUNÇÃO DE TRIGGER
        console.log('\n⚙️ 3. Criando função de trigger...');
        await client.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);
        console.log('✅ Função de trigger criada');

        // 4. CRIAR TABELA USERS
        console.log('\n👥 4. Criando tabela users...');
        await client.query(`
            CREATE TABLE users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                first_name VARCHAR(50) NOT NULL,
                last_name VARCHAR(50) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                birth_date DATE NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                CONSTRAINT valid_email CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'),
                CONSTRAINT valid_birth_date CHECK (birth_date <= CURRENT_DATE),
                CONSTRAINT valid_name_length CHECK (
                    length(trim(first_name)) >= 2 AND 
                    length(trim(last_name)) >= 2
                )
            );
        `);
        console.log('✅ Tabela users criada');

        // 5. CRIAR TABELA PANELS
        console.log('\n📋 5. Criando tabela panels...');
        await client.query(`
            CREATE TABLE panels (
                id VARCHAR(6) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                type VARCHAR(10) NOT NULL CHECK (type IN ('friends', 'couple', 'family')),
                password_hash VARCHAR(255),
                creator VARCHAR(50) NOT NULL,
                creator_id VARCHAR(50) NOT NULL,
                creator_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                border_color VARCHAR(7) DEFAULT '#9EC6F3',
                background_color VARCHAR(7) DEFAULT '#FBFBFB',
                max_users INTEGER DEFAULT 15 CHECK (max_users > 0 AND max_users <= 50),
                post_count INTEGER DEFAULT 0 CHECK (post_count >= 0),
                active_users INTEGER DEFAULT 0 CHECK (active_users >= 0),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Tabela panels criada');

        // 6. CRIAR TABELA POSTS
        console.log('\n📝 6. Criando tabela posts...');
        await client.query(`
            CREATE TABLE posts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                panel_id VARCHAR(6) REFERENCES panels(id) ON DELETE CASCADE,
                author_name VARCHAR(50),
                author_id VARCHAR(50) NOT NULL,
                author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                content TEXT NOT NULL CHECK (length(trim(content)) > 0 AND length(content) <= 1000),
                color VARCHAR(7) DEFAULT '#A8D8EA' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
                position_x INTEGER DEFAULT 50 CHECK (position_x >= 0 AND position_x <= 2000),
                position_y INTEGER DEFAULT 50 CHECK (position_y >= 0 AND position_y <= 2000),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Tabela posts criada');

        // 7. CRIAR TABELA ACTIVE_USERS
        console.log('\n👤 7. Criando tabela active_users...');
        await client.query(`
            CREATE TABLE active_users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                panel_id VARCHAR(6) REFERENCES panels(id) ON DELETE CASCADE,
                user_id VARCHAR(50) NOT NULL,
                username VARCHAR(50) NOT NULL,
                user_uuid UUID REFERENCES users(id) ON DELETE CASCADE,
                joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                CONSTRAINT unique_user_per_panel UNIQUE(panel_id, user_uuid)
            );
        `);
        console.log('✅ Tabela active_users criada');

        // 8. CRIAR TABELA PANEL_PARTICIPANTS
        console.log('\n👥 8. Criando tabela panel_participants...');
        await client.query(`
            CREATE TABLE panel_participants (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                panel_id VARCHAR(6) REFERENCES panels(id) ON DELETE CASCADE,
                user_id VARCHAR(50) NOT NULL,
                username VARCHAR(50) NOT NULL,
                user_uuid UUID REFERENCES users(id) ON DELETE CASCADE,
                joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                last_access TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                CONSTRAINT unique_participant_per_panel UNIQUE(panel_id, user_uuid)
            );
        `);
        console.log('✅ Tabela panel_participants criada');

        // 9. CRIAR TRIGGERS
        console.log('\n⚙️ 9. Criando triggers...');
        await client.query(`
            CREATE TRIGGER trigger_update_users_updated_at
                BEFORE UPDATE ON users
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        `);

        await client.query(`
            CREATE TRIGGER trigger_update_posts_updated_at
                BEFORE UPDATE ON posts
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        `);
        console.log('✅ Triggers criados');

        // 10. CRIAR ÍNDICES
        console.log('\n📊 10. Criando índices...');
        const indexes = [
            'CREATE INDEX idx_users_email ON users(email);',
            'CREATE INDEX idx_panels_creator_user_id ON panels(creator_user_id);',
            'CREATE INDEX idx_posts_panel_id ON posts(panel_id);',
            'CREATE INDEX idx_posts_author_user_id ON posts(author_user_id);',
            'CREATE INDEX idx_active_users_panel_id ON active_users(panel_id);',
            'CREATE INDEX idx_active_users_user_uuid ON active_users(user_uuid);',
            'CREATE INDEX idx_panel_participants_user_uuid ON panel_participants(user_uuid);'
        ];

        for (const indexQuery of indexes) {
            try {
                await client.query(indexQuery);
                const indexName = indexQuery.split(' ')[2];
                console.log(`   ✅ Índice ${indexName} criado`);
            } catch (err) {
                console.log(`   ⚠️ Erro no índice: ${err.message}`);
            }
        }

        await client.query('COMMIT');
        console.log('\n🎉 RESET COMPLETO FINALIZADO!');

        // TESTE FINAL
        console.log('\n🧪 11. Teste completo...');
        
        // Criar usuário de teste
        const testEmail = `teste_completo_${Date.now()}@example.com`;
        console.log(`📧 Criando usuário: ${testEmail}`);
        
        const userResult = await client.query(`
            INSERT INTO users (first_name, last_name, email, password_hash, birth_date)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, email, first_name, last_name
        `, ['Teste', 'Completo', testEmail, '$2a$12$dummy.hash.for.complete.testing', '1990-01-01']);

        const testUser = userResult.rows[0];
        console.log('✅ Usuário criado:', {
            id: testUser.id.substring(0, 8) + '...',
            email: testUser.email,
            name: `${testUser.first_name} ${testUser.last_name}`
        });

        // Criar painel de teste
        console.log('📋 Criando painel de teste...');
        const panelResult = await client.query(`
            INSERT INTO panels (id, name, type, creator, creator_id, creator_user_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, name, type
        `, ['TEST99', 'Painel de Teste Completo', 'friends', 'Teste Completo', 'test_user', testUser.id]);

        console.log('✅ Painel criado:', panelResult.rows[0]);

        // Adicionar usuário como participante
        console.log('👥 Adicionando como participante...');
        await client.query(`
            INSERT INTO panel_participants (panel_id, user_id, username, user_uuid)
            VALUES ($1, $2, $3, $4)
        `, ['TEST99', 'test_user', 'Teste Completo', testUser.id]);
        console.log('✅ Participante adicionado');

        // Criar post de teste
        console.log('📝 Criando post de teste...');
        const postResult = await client.query(`
            INSERT INTO posts (panel_id, author_name, author_id, author_user_id, content)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, content, author_name
        `, ['TEST99', 'Teste Completo', 'test_user', testUser.id, 'Este é um post de teste completo! 🎉']);

        console.log('✅ Post criado:', {
            id: postResult.rows[0].id.substring(0, 8) + '...',
            content: postResult.rows[0].content,
            author: postResult.rows[0].author_name
        });

        // Verificar relacionamentos
        console.log('🔍 Verificando relacionamentos...');
        const verificationResult = await client.query(`
            SELECT 
                u.first_name, u.last_name, u.email,
                p.id as panel_id, p.name as panel_name, p.type,
                po.content, po.author_name,
                pp.username as participant_name
            FROM users u
            JOIN panels p ON p.creator_user_id = u.id
            JOIN posts po ON po.panel_id = p.id AND po.author_user_id = u.id
            JOIN panel_participants pp ON pp.panel_id = p.id AND pp.user_uuid = u.id
            WHERE u.email = $1
        `, [testEmail]);

        if (verificationResult.rows.length > 0) {
            const result = verificationResult.rows[0];
            console.log('✅ Todos os relacionamentos funcionando:');
            console.log(`   - Usuário: ${result.first_name} ${result.last_name} (${result.email})`);
            console.log(`   - Painel: ${result.panel_name} (${result.panel_id}) - ${result.type}`);
            console.log(`   - Post: "${result.content}" por ${result.author_name}`);
            console.log(`   - Participante: ${result.participant_name}`);
        } else {
            console.log('❌ Problemas nos relacionamentos');
        }

        // Limpeza
        console.log('\n🧹 Limpando dados de teste...');
        await client.query('DELETE FROM posts WHERE panel_id = $1', ['TEST99']);
        await client.query('DELETE FROM panel_participants WHERE panel_id = $1', ['TEST99']);
        await client.query('DELETE FROM panels WHERE id = $1', ['TEST99']);
        await client.query('DELETE FROM users WHERE email = $1', [testEmail]);
        console.log('✅ Dados de teste removidos');

        console.log('\n🎉 BANCO COMPLETAMENTE CONFIGURADO E TESTADO!');
        console.log('\n📋 Próximos passos:');
        console.log('   1. cd backend && npm start     (iniciar backend)');
        console.log('   2. cd frontend && npm start    (iniciar frontend)');
        console.log('   3. Abrir http://localhost:3000  (usar aplicação)');
        console.log('\n💡 Agora você pode criar uma conta e testar todos os recursos!');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('\n❌ Erro no reset completo:', error);
        console.log('\n🔧 Detalhes:');
        console.log('   Código:', error.code);
        console.log('   Mensagem:', error.message);
        if (error.detail) console.log('   Detalhe:', error.detail);
        if (error.hint) console.log('   Dica:', error.hint);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    completeReset().catch(error => {
        console.error('❌ Erro fatal no reset completo:', error.message);
        process.exit(1);
    });
}

module.exports = { completeReset };