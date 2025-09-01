require('dotenv').config();
const { Pool } = require('pg');

// Configuração do banco
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/stickly_notes_db',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

async function fixDatabaseComplete() {
    console.log('🔧 Correção completa da estrutura do banco...\n');
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        console.log('📋 1. Verificando estrutura existente...');
        
        // Verificar se tabelas existem
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        `);
        
        console.log('Tabelas existentes:', tablesResult.rows.map(r => r.table_name));
        
        console.log('\n🔧 2. Corrigindo tabela panels...');
        
        // Verificar colunas da tabela panels
        const panelsColumns = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'panels' AND table_schema = 'public'
            ORDER BY ordinal_position;
        `);
        
        console.log('Colunas existentes em panels:', panelsColumns.rows.map(r => r.column_name));
        
        // Adicionar colunas que faltam na tabela panels
        const requiredPanelColumns = [
            { name: 'creator_user_id', type: 'UUID', reference: 'REFERENCES users(id) ON DELETE SET NULL' },
            { name: 'border_color', type: 'VARCHAR(7)', default: "'#9EC6F3'" },
            { name: 'background_color', type: 'VARCHAR(7)', default: "'#FBFBFB'" },
            { name: 'max_users', type: 'INTEGER', default: '15' },
            { name: 'post_count', type: 'INTEGER', default: '0' },
            { name: 'active_users', type: 'INTEGER', default: '0' },
            { name: 'last_activity', type: 'TIMESTAMP WITH TIME ZONE', default: 'CURRENT_TIMESTAMP' }
        ];
        
        for (const col of requiredPanelColumns) {
            const hasColumn = panelsColumns.rows.some(r => r.column_name === col.name);
            if (!hasColumn) {
                console.log(`   Adicionando coluna ${col.name}...`);
                let query = `ALTER TABLE panels ADD COLUMN ${col.name} ${col.type}`;
                if (col.default) query += ` DEFAULT ${col.default}`;
                if (col.reference) query += ` ${col.reference}`;
                await client.query(query);
                console.log(`   ✅ Coluna ${col.name} adicionada`);
            }
        }
        
        console.log('\n🔧 3. Corrigindo tabela posts...');
        
        // Verificar colunas da tabela posts
        const postsColumns = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'posts' AND table_schema = 'public'
            ORDER BY ordinal_position;
        `);
        
        console.log('Colunas existentes em posts:', postsColumns.rows.map(r => r.column_name));
        
        // Adicionar colunas que faltam na tabela posts
        const requiredPostColumns = [
            { name: 'author_user_id', type: 'UUID', reference: 'REFERENCES users(id) ON DELETE SET NULL' },
            { name: 'updated_at', type: 'TIMESTAMP WITH TIME ZONE', default: 'CURRENT_TIMESTAMP' }
        ];
        
        for (const col of requiredPostColumns) {
            const hasColumn = postsColumns.rows.some(r => r.column_name === col.name);
            if (!hasColumn) {
                console.log(`   Adicionando coluna ${col.name}...`);
                let query = `ALTER TABLE posts ADD COLUMN ${col.name} ${col.type}`;
                if (col.default) query += ` DEFAULT ${col.default}`;
                if (col.reference) query += ` ${col.reference}`;
                await client.query(query);
                console.log(`   ✅ Coluna ${col.name} adicionada`);
            }
        }
        
        console.log('\n🔧 4. Corrigindo tabela active_users...');
        
        // Verificar colunas da tabela active_users
        const activeUsersColumns = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'active_users' AND table_schema = 'public'
            ORDER BY ordinal_position;
        `);
        
        console.log('Colunas existentes em active_users:', activeUsersColumns.rows.map(r => r.column_name));
        
        // Adicionar coluna user_uuid se não existir
        const hasUserUuid = activeUsersColumns.rows.some(r => r.column_name === 'user_uuid');
        if (!hasUserUuid) {
            console.log('   Adicionando coluna user_uuid...');
            await client.query(`
                ALTER TABLE active_users 
                ADD COLUMN user_uuid UUID REFERENCES users(id) ON DELETE CASCADE
            `);
            console.log('   ✅ Coluna user_uuid adicionada');
        }
        
        console.log('\n📋 5. Criando função de trigger...');
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

        console.log('\n⚙️ 6. Criando triggers...');
        // Triggers para updated_at
        await client.query(`
            DROP TRIGGER IF EXISTS trigger_update_users_updated_at ON users;
            CREATE TRIGGER trigger_update_users_updated_at
                BEFORE UPDATE ON users
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        `);

        await client.query(`
            DROP TRIGGER IF EXISTS trigger_update_posts_updated_at ON posts;
            CREATE TRIGGER trigger_update_posts_updated_at
                BEFORE UPDATE ON posts
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        `);
        console.log('✅ Triggers criados');

        console.log('\n📊 7. Criando índices (apenas os que não causam erro)...');
        // Índices seguros
        const safeIndexes = [
            'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);',
            'CREATE INDEX IF NOT EXISTS idx_posts_panel_id ON posts(panel_id);'
        ];
        
        for (const indexQuery of safeIndexes) {
            try {
                await client.query(indexQuery);
                console.log(`   ✅ Índice criado: ${indexQuery.split(' ')[5]}`);
            } catch (err) {
                console.log(`   ⚠️ Índice já existe ou erro: ${indexQuery.split(' ')[5]}`);
            }
        }
        
        // Tentar criar índices das novas colunas
        const conditionalIndexes = [
            'CREATE INDEX IF NOT EXISTS idx_panels_creator_user_id ON panels(creator_user_id);',
            'CREATE INDEX IF NOT EXISTS idx_posts_author_user_id ON posts(author_user_id);',
            'CREATE INDEX IF NOT EXISTS idx_active_users_panel_id ON active_users(panel_id);',
            'CREATE INDEX IF NOT EXISTS idx_active_users_user_uuid ON active_users(user_uuid);'
        ];
        
        for (const indexQuery of conditionalIndexes) {
            try {
                await client.query(indexQuery);
                console.log(`   ✅ Índice criado: ${indexQuery.split(' ')[5]}`);
            } catch (err) {
                console.log(`   ⚠️ Erro no índice ${indexQuery.split(' ')[5]}: ${err.message}`);
            }
        }

        console.log('\n🔧 8. Adicionando constraints...');
        
        // Adicionar constraints que podem estar faltando
        const constraints = [
            {
                name: 'panels_type_check',
                table: 'panels',
                constraint: "CHECK (type IN ('friends', 'couple', 'family'))"
            },
            {
                name: 'posts_content_check', 
                table: 'posts',
                constraint: "CHECK (length(trim(content)) > 0 AND length(content) <= 1000)"
            },
            {
                name: 'posts_color_check',
                table: 'posts', 
                constraint: "CHECK (color ~ '^#[0-9A-Fa-f]{6}$')"
            }
        ];
        
        for (const constraint of constraints) {
            try {
                await client.query(`
                    ALTER TABLE ${constraint.table} 
                    DROP CONSTRAINT IF EXISTS ${constraint.name};
                    
                    ALTER TABLE ${constraint.table} 
                    ADD CONSTRAINT ${constraint.name} ${constraint.constraint};
                `);
                console.log(`   ✅ Constraint ${constraint.name} adicionada`);
            } catch (err) {
                console.log(`   ⚠️ Erro na constraint ${constraint.name}: ${err.message}`);
            }
        }

        await client.query('COMMIT');
        console.log('\n🎉 Correção completa finalizada!');

        console.log('\n🔍 9. Verificando estrutura final...');
        
        // Verificar tabelas finais
        const finalTables = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        `);

        console.log('📋 Tabelas finais:');
        finalTables.rows.forEach(row => {
            console.log(`   ✅ ${row.table_name}`);
        });
        
        // Verificar colunas da tabela panels
        const finalPanelsColumns = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'panels' AND table_schema = 'public'
            ORDER BY ordinal_position;
        `);
        
        console.log('\n📊 Estrutura da tabela panels:');
        finalPanelsColumns.rows.forEach(col => {
            console.log(`   - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
        });

        console.log('\n🧪 10. Teste final...');
        // Testar inserção de usuário
        const testEmail = `test_${Date.now()}@example.com`;
        const testResult = await client.query(`
            INSERT INTO users (first_name, last_name, email, password_hash, birth_date)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, email, first_name, last_name
        `, ['Teste', 'Usuario', testEmail, '$2a$12$dummy.hash.for.testing', '1990-01-01']);

        console.log('✅ Usuário de teste criado:', {
            id: testResult.rows[0].id,
            email: testResult.rows[0].email
        });

        // Limpar usuário de teste
        await client.query('DELETE FROM users WHERE email = $1', [testEmail]);
        console.log('🧹 Usuário de teste removido');

        console.log('\n🎉 BANCO DE DADOS TOTALMENTE CONFIGURADO!');
        console.log('\n📋 Agora execute:');
        console.log('   node test-db.js');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('\n❌ Erro na correção:', error);
        console.log('\n🔧 Detalhes:');
        console.log('   Código:', error.code);
        console.log('   Mensagem:', error.message);
        if (error.detail) console.log('   Detalhe:', error.detail);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    fixDatabaseComplete().catch(error => {
        console.error('❌ Erro fatal:', error.message);
        process.exit(1);
    });
}

module.exports = { fixDatabaseComplete };