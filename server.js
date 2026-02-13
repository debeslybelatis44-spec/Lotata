require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const moment = require('moment');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

/* =========================
   MIDDLEWARES
========================= */
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('dev'));

app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000
}));

/* =========================
   POSTGRESQL
========================= */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('connect', () => console.log('✅ PostgreSQL connecté'));
pool.on('error', e => console.error('❌ PostgreSQL erreur', e));

/* =========================
   OUTILS DB
========================= */
async function columnExists(table, column) {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`,
    [table, column]
  );
  return res.rowCount > 0;
}

async function addColumnIfNotExists(table, column, definition) {
  if (!(await columnExists(table, column))) {
    console.log(`➕ Ajout ${table}.${column}`);
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/* =========================
   INIT DATABASE (CORRIGÉ)
========================= */
async function initializeDatabase() {
  console.log('🔄 Initialisation DB...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS supervisors (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      password VARCHAR(255),
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS agents (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      password VARCHAR(255),
      supervisor_id INTEGER,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS owners (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      password VARCHAR(255),
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  /* 🔥 FIX CRITIQUE ICI */
  await addColumnIfNotExists('agents', 'email', 'VARCHAR(100)');
  await addColumnIfNotExists('supervisors', 'email', 'VARCHAR(100)');
  await addColumnIfNotExists('owners', 'email', 'VARCHAR(100)');

  console.log('✅ Colonnes email vérifiées');

  /* Comptes par défaut */
  if ((await pool.query('SELECT COUNT(*) FROM supervisors')).rows[0].count === '0') {
    await pool.query(
      `INSERT INTO supervisors (name, email, password)
       VALUES ($1,$2,$3)`,
      ['Superviseur', 'super@lotato.com', await bcrypt.hash('super123', 10)]
    );
  }

  if ((await pool.query('SELECT COUNT(*) FROM agents')).rows[0].count === '0') {
    await pool.query(
      `INSERT INTO agents (name, email, password)
       VALUES ($1,$2,$3)`,
      ['Agent', 'agent@lotato.com', await bcrypt.hash('agent123', 10)]
    );
  }

  if ((await pool.query('SELECT COUNT(*) FROM owners')).rows[0].count === '0') {
    await pool.query(
      `INSERT INTO owners (name, email, password)
       VALUES ($1,$2,$3)`,
      ['Admin', 'admin@lotato.com', await bcrypt.hash('admin123', 10)]
    );
  }

  console.log('✅ DB prête');
}

/* =========================
   AUTH
========================= */
const JWT_SECRET = process.env.JWT_SECRET || 'lotato-secret';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;

    const table =
      role === 'agent' ? 'agents' :
      role === 'supervisor' ? 'supervisors' :
      role === 'owner' ? 'owners' : null;

    if (!table) return res.status(400).json({ error: 'Rôle invalide' });

    const { rows } = await pool.query(
      `SELECT * FROM ${table} WHERE email=$1`,
      [username]
    );

    if (!rows.length) return res.status(401).json({ error: 'Login incorrect' });

    const user = rows[0];
    if (!(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: 'Mot de passe incorrect' });

    res.json({
      success: true,
      token: generateToken({ ...user, role }),
      role,
      name: user.name
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/* =========================
   STATIC FILES
========================= */
app.use(express.static(__dirname));
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'index.html')));

/* =========================
   START
========================= */
initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () =>
    console.log(`🚀 LOTATO en ligne : http://localhost:${PORT}`)
  );
});