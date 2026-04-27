const { query } = require('./index');

async function initDB() {
  console.log('Initializing database...');

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id          SERIAL PRIMARY KEY,
      name        VARCHAR(100) NOT NULL,
      email       VARCHAR(150) UNIQUE NOT NULL,
      password    VARCHAR(255) NOT NULL,
      role        VARCHAR(20)  NOT NULL DEFAULT 'user',
      is_active   BOOLEAN      NOT NULL DEFAULT true,
      created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS reservations (
      id            SERIAL PRIMARY KEY,
      code          VARCHAR(20) UNIQUE NOT NULL,
      sala          VARCHAR(10) NOT NULL,
      motivo        TEXT        NOT NULL,
      user_id       INTEGER     NOT NULL REFERENCES users(id),
      fecha         DATE        NOT NULL,
      hora_inicio   TIME        NOT NULL,
      hora_fin      TIME        NOT NULL,
      participantes INTEGER     NOT NULL DEFAULT 1,
      status        VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
      priority      VARCHAR(10) NOT NULL DEFAULT 'Media',
      admin_note    TEXT,
      approved_by   INTEGER     REFERENCES users(id),
      created_at    TIMESTAMP   NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMP   NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER     REFERENCES users(id) ON DELETE CASCADE,
      icon        VARCHAR(10) NOT NULL DEFAULT '🔔',
      message     TEXT        NOT NULL,
      rv_code     VARCHAR(20),
      is_read     BOOLEAN     NOT NULL DEFAULT false,
      created_at  TIMESTAMP   NOT NULL DEFAULT NOW()
    );
  `);

  await query(`CREATE SEQUENCE IF NOT EXISTS reservation_seq START 1;`);

  // Create default super-admin if no admin exists
  const adminCheck = await query("SELECT id FROM users WHERE role='admin' LIMIT 1");
  if (adminCheck.rows.length === 0) {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('Admin123!', 12);
    await query(
      "INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,'admin') ON CONFLICT DO NOTHING",
      ['Administrador', 'admin@sistema.local', hash]
    );
    console.log('✅ Default admin created: admin@sistema.local / Admin123!');
  }

  console.log('✅ Database ready');
}

module.exports = { initDB };
