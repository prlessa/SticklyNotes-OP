require('dotenv').config();
const { connectDatabase, connectRedis, db } = require('./src/config/database');

async function testDatabase() {
  try {
    console.log('🔄 Testando conexões...');
    
    // Conectar ao Redis (opcional)
    await connectRedis();
    
    // Conectar ao PostgreSQL
    await connectDatabase();
    
    console.log('🧪 Testando criação de usuário...');
    
    // Testar inserção de usuário de teste
    const testEmail = `test_${Date.now()}@example.com`;
    const result = await db.query(`
      INSERT INTO users (first_name, last_name, email, password_hash, birth_date)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, email
    `, ['Teste', 'Usuario', testEmail, '$2a$12$dummy.hash', '1990-01-01']);
    
    console.log('✅ Usuário de teste criado:', result.rows[0]);
    
    // Limpar usuário de teste
    await db.query('DELETE FROM users WHERE email = $1', [testEmail]);
    console.log('🧹 Usuário de teste removido');
    
    console.log('🎉 Teste completado com sucesso!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Erro no teste:', error);
    process.exit(1);
  }
}

testDatabase();