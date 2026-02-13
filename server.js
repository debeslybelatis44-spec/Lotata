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

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('dev'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  keyGenerator: (req) => req.ip
});
app.use('/api/', limiter);

// Connexion PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('connect', () => console.log('✅ Connecté à PostgreSQL'));
pool.on('error', err => console.error('❌ Erreur PostgreSQL:', err));

// ----------------------------------------------------------------------
// UTILITAIRES DB
// ----------------------------------------------------------------------
async function columnExists(table, column) {
  try {
    const res = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`,
      [table, column]
    );
    return res.rows.length > 0;
  } catch (error) {
    console.error(`Erreur vérification colonne ${table}.${column}:`, error);
    return false;
  }
}

async function addColumnIfNotExists(table, column, definition) {
  if (!(await columnExists(table, column))) {
    console.log(`➕ Ajout colonne ${table}.${column}...`);
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`✅ Colonne ${table}.${column} ajoutée`);
  }
}

async function tableExists(table) {
  const res = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_name=$1`,
    [table]
  );
  return res.rows.length > 0;
}

// ----------------------------------------------------------------------
// INITIALISATION DES TABLES (base + extensions pour owner/supervisor)
// ----------------------------------------------------------------------
async function initializeDatabase() {
  try {
    console.log('🔄 Initialisation de la base de données...');

    // ----- Tables existantes du petit serveur -----
    await pool.query(`CREATE TABLE IF NOT EXISTS draw_results (id SERIAL PRIMARY KEY, draw_id VARCHAR(50), name VARCHAR(100), draw_time TIMESTAMP, results JSONB, lucky_number INTEGER, comment TEXT, source VARCHAR(50), published_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS number_limits (number VARCHAR(2) PRIMARY KEY, limit_amount DECIMAL(10,2), created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS game_rules (id SERIAL PRIMARY KEY, rule_key VARCHAR(100) UNIQUE, rule_value TEXT, description TEXT, updated_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS system_settings (id SERIAL PRIMARY KEY, setting_key VARCHAR(100) UNIQUE, setting_value TEXT, category VARCHAR(50), updated_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS activity_log (id SERIAL PRIMARY KEY, user_id VARCHAR(50), user_role VARCHAR(20), action VARCHAR(100), details TEXT, ip_address VARCHAR(45), user_agent TEXT, timestamp TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS supervisors (id SERIAL PRIMARY KEY, name VARCHAR(100), email VARCHAR(100) UNIQUE, phone VARCHAR(20), password VARCHAR(255), active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS agents (id SERIAL PRIMARY KEY, name VARCHAR(100), email VARCHAR(100) UNIQUE, phone VARCHAR(20), password VARCHAR(255), supervisor_id INTEGER REFERENCES supervisors(id), location VARCHAR(100), commission DECIMAL(5,2) DEFAULT 5.00, active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS tickets (id SERIAL PRIMARY KEY, ticket_id VARCHAR(50), agent_id VARCHAR(50), agent_name VARCHAR(100), draw_id VARCHAR(50), draw_name VARCHAR(100), bets JSONB, total_amount DECIMAL(10,2), win_amount DECIMAL(10,2) DEFAULT 0, paid BOOLEAN DEFAULT false, date TIMESTAMP DEFAULT NOW(), checked BOOLEAN DEFAULT false)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS payments (id SERIAL PRIMARY KEY, ticket_id INTEGER REFERENCES tickets(id), amount DECIMAL(10,2), paid_at TIMESTAMP DEFAULT NOW(), confirmed_by VARCHAR(100))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS draws (id VARCHAR(50) PRIMARY KEY, name VARCHAR(100), time VARCHAR(10), frequency VARCHAR(20) DEFAULT 'daily', status VARCHAR(20) DEFAULT 'active', active BOOLEAN DEFAULT true, description TEXT, min_bet DECIMAL(10,2) DEFAULT 0, max_bet DECIMAL(10,2) DEFAULT 0, last_draw TIMESTAMP)`);
    await addColumnIfNotExists('draws', 'created_at', 'TIMESTAMP DEFAULT NOW()');
    await addColumnIfNotExists('draws', 'updated_at', 'TIMESTAMP DEFAULT NOW()');
    await addColumnIfNotExists('draws', 'blocked', 'BOOLEAN DEFAULT false');
    await pool.query(`CREATE TABLE IF NOT EXISTS blocked_numbers (number VARCHAR(2) PRIMARY KEY, blocked_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS lottery_config (id SERIAL PRIMARY KEY, name VARCHAR(100), logo TEXT, address TEXT, phone VARCHAR(20))`);
    await addColumnIfNotExists('lottery_config', 'updated_at', 'TIMESTAMP DEFAULT NOW()');
    await pool.query(`CREATE TABLE IF NOT EXISTS alerts (id SERIAL PRIMARY KEY, title VARCHAR(100), message TEXT, type VARCHAR(20), priority VARCHAR(20) DEFAULT 'medium', active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW(), expires_at TIMESTAMP)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS user_limits (user_id VARCHAR(50), limit_type VARCHAR(50), limit_value DECIMAL(10,2), created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(), PRIMARY KEY (user_id, limit_type))`);

    // ----- NOUVELLES TABLES pour les fonctionnalités propriétaire / superviseur -----
    // Table des propriétaires (owners)
    await pool.query(`CREATE TABLE IF NOT EXISTS owners (id SERIAL PRIMARY KEY, name VARCHAR(100), email VARCHAR(100) UNIQUE, password VARCHAR(255), active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);

    // Table des numéros bloqués par tirage (pour gestion fine)
    await pool.query(`CREATE TABLE IF NOT EXISTS draw_blocked_numbers (draw_id VARCHAR(50) REFERENCES draws(id), number VARCHAR(2), blocked_at TIMESTAMP DEFAULT NOW(), PRIMARY KEY (draw_id, number))`);

    // Table des limites par tirage/numéro
    await pool.query(`CREATE TABLE IF NOT EXISTS draw_number_limits (draw_id VARCHAR(50) REFERENCES draws(id), number VARCHAR(2), limit_amount DECIMAL(10,2) NOT NULL, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(), PRIMARY KEY (draw_id, number))`);

    // Ajout d'une colonne agent_id_int sur tickets pour lier à agents.id (si besoin)
    await addColumnIfNotExists('tickets', 'agent_id_int', 'INTEGER');

    console.log('✅ Tables vérifiées / créées');

    // ----- Données par défaut -----
    // Tirages
    const draws = [
      { id: 'tn_matin', name: 'Tunisia Matin', time: '10:00' },
      { id: 'tn_soir', name: 'Tunisia Soir', time: '17:00' },
      { id: 'fl_matin', name: 'Florida Matin', time: '13:30' },
      { id: 'fl_soir', name: 'Florida Soir', time: '21:50' },
      { id: 'ny_matin', name: 'New York Matin', time: '14:30' },
      { id: 'ny_soir', name: 'New York Soir', time: '20:00' },
      { id: 'ga_matin', name: 'Georgia Matin', time: '12:30' },
      { id: 'ga_soir', name: 'Georgia Soir', time: '19:00' },
      { id: 'tx_matin', name: 'Texas Matin', time: '11:30' },
      { id: 'tx_soir', name: 'Texas Soir', time: '18:30' }
    ];
    for (const d of draws) {
      await pool.query(
        `INSERT INTO draws (id, name, time, active) VALUES ($1, $2, $3, true) ON CONFLICT (id) DO NOTHING`,
        [d.id, d.name, d.time]
      );
    }

    // Configuration loterie par défaut
    const configExists = await pool.query('SELECT id FROM lottery_config LIMIT 1');
    if (configExists.rows.length === 0) {
      await pool.query(`INSERT INTO lottery_config (name, logo, address, phone) VALUES ('LOTATO PRO', '', '', '')`);
    }

    // Comptes par défaut (uniquement si tables vides)
    // Superviseur par défaut
    const supCount = await pool.query('SELECT COUNT(*) FROM supervisors');
    if (parseInt(supCount.rows[0].count) === 0) {
      const hashedSuper = await bcrypt.hash('super123', 10);
      await pool.query(
        `INSERT INTO supervisors (name, email, password) VALUES ($1, $2, $3)`,
        ['Superviseur Principal', 'super@lotato.com', hashedSuper]
      );
    }
    // Agent par défaut
    const agentCount = await pool.query('SELECT COUNT(*) FROM agents');
    if (parseInt(agentCount.rows[0].count) === 0) {
      const sup = await pool.query('SELECT id FROM supervisors LIMIT 1');
      const supId = sup.rows[0]?.id || 1;
      const hashedAgent = await bcrypt.hash('agent123', 10);
      await pool.query(
        `INSERT INTO agents (name, email, password, supervisor_id, location) VALUES ($1, $2, $3, $4, $5)`,
        ['Agent Test', 'agent@lotato.com', hashedAgent, supId, 'Port-au-Prince']
      );
    }
    // Propriétaire par défaut
    const ownerCount = await pool.query('SELECT COUNT(*) FROM owners');
    if (parseInt(ownerCount.rows[0].count) === 0) {
      const hashedOwner = await bcrypt.hash('admin123', 10);
      await pool.query(
        `INSERT INTO owners (name, email, password) VALUES ($1, $2, $3)`,
        ['Administrateur', 'admin@lotato.com', hashedOwner]
      );
    }

    console.log('✅ Données par défaut insérées');
  } catch (error) {
    console.error('❌ Erreur initialisation DB:', error.message);
  }
}

// ----------------------------------------------------------------------
// JWT & AUTH
// ----------------------------------------------------------------------
const JWT_SECRET = process.env.JWT_SECRET || 'lotato-dev-secret';
const TOKEN_EXPIRY = '24h';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

// Middleware d'authentification (version simplifiée mais avec vérification réelle)
const authenticateToken = (req, res, next) => {
  const publicRoutes = [
    '/api/health', '/api/auth/login', '/api/auth/refresh', '/api/auth/logout',
    '/api/tickets/save', '/api/tickets', '/api/winners', '/api/winners/results',
    '/api/lottery-config', '/api/tickets/check-winners', '/api/blocked-numbers',
    '/api/reports', '/api/reports/draw'
  ];
  if (publicRoutes.includes(req.path)) return next();

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token invalide' });
    req.user = user;
    next();
  });
};

// Middleware de restriction par rôle
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès interdit - rôle insuffisant' });
    }
    next();
  };
}

// ----------------------------------------------------------------------
// ROUTES PUBLIQUES & AUTH
// ----------------------------------------------------------------------
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({ status: 'OK', timestamp: new Date().toISOString(), database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', error: error.message });
  }
});

// Login amélioré avec vérification dans les tables correspondantes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    console.log(`🔑 Tentative connexion: ${username} (${role})`);

    let user = null;
    let table = '';
    if (role === 'agent') table = 'agents';
    else if (role === 'supervisor') table = 'supervisors';
    else if (role === 'owner') table = 'owners';
    else return res.status(400).json({ error: 'Rôle invalide' });

    const result = await pool.query(`SELECT * FROM ${table} WHERE email = $1`, [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Identifiants incorrects' });
    if (user.active === false) return res.status(403).json({ error: 'Compte désactivé' });

    const token = generateToken({ id: user.id, email: user.email, name: user.name, role });

    // Journalisation
    await pool.query(
      `INSERT INTO activity_log (user_id, user_role, action, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)`,
      [user.id, role, 'LOGIN', req.ip, req.headers['user-agent']]
    );

    res.json({
      success: true, token,
      name: user.name, role,
      agentId: role === 'agent' ? user.id : null,
      supervisorId: role === 'supervisor' ? user.id : null,
      ownerId: role === 'owner' ? user.id : null
    });
  } catch (error) {
    console.error('❌ Erreur login:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/auth/refresh', authenticateToken, (req, res) => {
  const newToken = generateToken(req.user);
  res.json({ success: true, token: newToken });
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  await pool.query(
    `INSERT INTO activity_log (user_id, user_role, action, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)`,
    [req.user.id, req.user.role, 'LOGOUT', req.ip, req.headers['user-agent']]
  );
  res.json({ success: true, message: 'Déconnecté' });
});

app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

app.use('/api', authenticateToken);

// ----------------------------------------------------------------------
// ROUTES TICKETS (inchangées du petit serveur, robustes)
// ----------------------------------------------------------------------
app.post('/api/tickets/save', requireRole('agent', 'supervisor'), async (req, res) => {
  try {
    const { agentId, agentName, drawId, drawName, bets, total } = req.body;
    if (!agentId || !drawId || !bets || !Array.isArray(bets)) {
      return res.status(400).json({ error: 'Données invalides' });
    }

    const ticketId = `T${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const betsJson = JSON.stringify(bets);
    const now = new Date();

    const result = await pool.query(
      `INSERT INTO tickets (ticket_id, agent_id, agent_name, draw_id, draw_name, bets, total_amount, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [ticketId, agentId, agentName || 'Agent', drawId, drawName || drawId, betsJson, parseFloat(total) || 0, now]
    );

    res.json({ success: true, ticket: result.rows[0] });
  } catch (error) {
    console.error('❌ Erreur sauvegarde ticket:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/tickets', async (req, res) => {
  try {
    const { agentId } = req.query;
    let query = 'SELECT * FROM tickets WHERE 1=1';
    const params = [];
    if (agentId) {
      params.push(agentId);
      query += ` AND agent_id = $${params.length}`;
    }
    query += ' ORDER BY date DESC LIMIT 50';
    const result = await pool.query(query, params);
    res.json({ tickets: result.rows });
  } catch (error) {
    console.error('❌ Erreur tickets:', error);
    res.json({ tickets: [] });
  }
});

app.delete('/api/tickets/delete/:ticketId', requireRole('agent','supervisor','owner'), async (req, res) => {
  try {
    await pool.query('DELETE FROM tickets WHERE id = $1', [parseInt(req.params.ticketId)]);
    res.json({ success: true, message: 'Ticket supprimé' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tickets/check-winners', async (req, res) => {
  try {
    const { agentId } = req.query;
    let query = 'SELECT * FROM tickets WHERE win_amount > 0 AND checked = false';
    const params = [];
    if (agentId) {
      params.push(agentId);
      query += ` AND agent_id = $${params.length}`;
    }
    const result = await pool.query(query, params);
    for (const t of result.rows) {
      await pool.query('UPDATE tickets SET checked = true WHERE id = $1', [t.id]);
    }
    res.json({ success: true, count: result.rows.length, tickets: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/winners', async (req, res) => {
  try {
    const { agentId } = req.query;
    let query = 'SELECT * FROM tickets WHERE win_amount > 0';
    const params = [];
    if (agentId) {
      params.push(agentId);
      query += ` AND agent_id = $${params.length}`;
    }
    query += ' ORDER BY date DESC LIMIT 20';
    const result = await pool.query(query, params);
    res.json({ winners: result.rows });
  } catch (error) {
    res.json({ winners: [] });
  }
});

app.get('/api/winners/results', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM draw_results ORDER BY published_at DESC LIMIT 10`
    );
    res.json({ results: result.rows });
  } catch (error) {
    res.json({ results: [] });
  }
});

// ----------------------------------------------------------------------
// ROUTES CONFIGURATION LOTERIE
// ----------------------------------------------------------------------
app.get('/api/lottery-config', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM lottery_config LIMIT 1');
    if (result.rows.length) res.json(result.rows[0]);
    else res.json({ name: 'LOTATO PRO', logo: '', address: '', phone: '' });
  } catch {
    res.json({ name: 'LOTATO PRO', logo: '', address: '', phone: '' });
  }
});

app.post('/api/lottery-config', requireRole('owner'), async (req, res) => {
  try {
    const { name, logo, address, phone } = req.body;
    const exists = await pool.query('SELECT id FROM lottery_config LIMIT 1');
    if (exists.rows.length === 0) {
      await pool.query('INSERT INTO lottery_config (name, logo, address, phone) VALUES ($1,$2,$3,$4)',
        [name, logo, address, phone]);
    } else {
      await pool.query('UPDATE lottery_config SET name=$1, logo=$2, address=$3, phone=$4, updated_at=NOW()',
        [name, logo, address, phone]);
    }
    res.json({ success: true, message: 'Configuration sauvegardée' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------------------------
// ROUTES NUMÉROS BLOQUÉS (globaux)
// ----------------------------------------------------------------------
app.get('/api/blocked-numbers', async (req, res) => {
  try {
    const result = await pool.query('SELECT number FROM blocked_numbers');
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (error) {
    res.json({ blockedNumbers: [] });
  }
});

// ----------------------------------------------------------------------
// ROUTES RAPPORTS AGENT (inchangées)
// ----------------------------------------------------------------------
app.get('/api/reports', async (req, res) => {
  try {
    const { agentId } = req.query;
    if (!agentId) return res.status(400).json({ error: 'Agent ID requis' });

    const todayStats = await pool.query(`
      SELECT COUNT(*) as total_tickets,
             COALESCE(SUM(total_amount),0) as total_bets,
             COALESCE(SUM(win_amount),0) as total_wins,
             COALESCE(SUM(total_amount)-SUM(win_amount),0) as total_loss,
             COALESCE(SUM(win_amount)-SUM(total_amount),0) as balance
      FROM tickets
      WHERE agent_id = $1 AND DATE(date) = CURRENT_DATE
    `, [agentId]);

    const stats = todayStats.rows[0];
    res.json({
      totalTickets: parseInt(stats.total_tickets) || 0,
      totalBets: parseFloat(stats.total_bets) || 0,
      totalWins: parseFloat(stats.total_wins) || 0,
      totalLoss: parseFloat(stats.total_loss) || 0,
      balance: parseFloat(stats.balance) || 0
    });
  } catch (error) {
    console.error('❌ Erreur rapports:', error);
    res.json({ totalTickets:0, totalBets:0, totalWins:0, totalLoss:0, balance:0 });
  }
});

app.get('/api/reports/draw', async (req, res) => {
  try {
    const { agentId, drawId } = req.query;
    if (!agentId || !drawId) return res.status(400).json({ error: 'Agent ID et Draw ID requis' });

    const stats = await pool.query(`
      SELECT COUNT(*) as total_tickets,
             COALESCE(SUM(total_amount),0) as total_bets,
             COALESCE(SUM(win_amount),0) as total_wins,
             COALESCE(SUM(total_amount)-SUM(win_amount),0) as total_loss,
             COALESCE(SUM(win_amount)-SUM(total_amount),0) as balance
      FROM tickets
      WHERE agent_id = $1 AND draw_id = $2 AND DATE(date) = CURRENT_DATE
    `, [agentId, drawId]);

    const data = stats.rows[0];
    res.json({
      totalTickets: parseInt(data.total_tickets) || 0,
      totalBets: parseFloat(data.total_bets) || 0,
      totalWins: parseFloat(data.total_wins) || 0,
      totalLoss: parseFloat(data.total_loss) || 0,
      balance: parseFloat(data.balance) || 0
    });
  } catch (error) {
    res.json({ totalTickets:0, totalBets:0, totalWins:0, totalLoss:0, balance:0 });
  }
});

// ----------------------------------------------------------------------
// ROUTES SUPERVISEUR (RESPONSABLE)
// ----------------------------------------------------------------------
app.get('/api/supervisor/agents', requireRole('supervisor', 'owner'), async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const result = await pool.query(
      `SELECT id, name, email, phone, location, commission, active, created_at
       FROM agents WHERE supervisor_id = $1 ORDER BY name`,
      [supervisorId]
    );
    res.json({ agents: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/supervisor/agents', requireRole('supervisor', 'owner'), async (req, res) => {
  try {
    const { name, email, phone, location, commission } = req.body;
    const supervisorId = req.user.id;
    const hashedPassword = await bcrypt.hash('agent123', 10); // mot de passe par défaut
    const result = await pool.query(
      `INSERT INTO agents (name, email, phone, password, supervisor_id, location, commission)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, email, phone, location, commission, active, created_at`,
      [name, email, phone, hashedPassword, supervisorId, location, commission || 5.00]
    );
    res.json({ success: true, agent: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/supervisor/agents/:agentId', requireRole('supervisor', 'owner'), async (req, res) => {
  try {
    const { name, email, phone, location, commission, active } = req.body;
    const agentId = req.params.agentId;
    const supervisorId = req.user.id;
    // Vérifier que l'agent appartient bien au superviseur
    const check = await pool.query(
      'SELECT id FROM agents WHERE id = $1 AND supervisor_id = $2',
      [agentId, supervisorId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Agent non trouvé ou non autorisé' });
    }
    await pool.query(
      `UPDATE agents SET name=$1, email=$2, phone=$3, location=$4, commission=$5, active=$6, updated_at=NOW()
       WHERE id = $7`,
      [name, email, phone, location, commission, active, agentId]
    );
    res.json({ success: true, message: 'Agent mis à jour' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/supervisor/agents/:agentId', requireRole('supervisor', 'owner'), async (req, res) => {
  try {
    const agentId = req.params.agentId;
    const supervisorId = req.user.id;
    await pool.query(
      'DELETE FROM agents WHERE id = $1 AND supervisor_id = $2',
      [agentId, supervisorId]
    );
    res.json({ success: true, message: 'Agent supprimé' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/supervisor/dashboard', requireRole('supervisor', 'owner'), async (req, res) => {
  try {
    const supervisorId = req.user.id;
    // Récupérer les agents du superviseur
    const agents = await pool.query(
      'SELECT id, name FROM agents WHERE supervisor_id = $1 AND active = true',
      [supervisorId]
    );
    const agentIds = agents.rows.map(a => a.id);
    let stats = {
      totalBets: 0,
      totalWins: 0,
      totalTickets: 0,
      agentsCount: agents.rows.length
    };
    if (agentIds.length > 0) {
      const placeholders = agentIds.map((_, i) => `$${i+1}`).join(',');
      const ticketStats = await pool.query(`
        SELECT COALESCE(SUM(total_amount),0) as total_bets,
               COALESCE(SUM(win_amount),0) as total_wins,
               COUNT(*) as total_tickets
        FROM tickets
        WHERE agent_id_int IN (${placeholders}) AND DATE(date) = CURRENT_DATE
      `, agentIds);
      stats.totalBets = parseFloat(ticketStats.rows[0].total_bets);
      stats.totalWins = parseFloat(ticketStats.rows[0].total_wins);
      stats.totalTickets = parseInt(ticketStats.rows[0].total_tickets);
    }
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------------------------
// ROUTES PROPRIÉTAIRE (OWNER)
// ----------------------------------------------------------------------
app.get('/api/owner/dashboard', requireRole('owner'), async (req, res) => {
  try {
    // Utilisateurs actifs (dernières 5 minutes)
    const activeThreshold = moment().subtract(5, 'minutes').toDate();
    const connectedSup = await pool.query(
      `SELECT id, name, email FROM supervisors WHERE active = true AND updated_at > $1`,
      [activeThreshold]
    );
    const connectedAgents = await pool.query(
      `SELECT id, name, email FROM agents WHERE active = true AND updated_at > $1`,
      [activeThreshold]
    );

    // Ventes du jour
    const sales = await pool.query(
      `SELECT COALESCE(SUM(total_amount),0) as total FROM tickets WHERE DATE(date) = CURRENT_DATE`
    );

    // Progression des limites par tirage
    let limitsProgress = [];
    if (await tableExists('draw_number_limits')) {
      const progress = await pool.query(`
        SELECT d.name as draw_name, dnl.number, dnl.limit_amount,
               COALESCE((
                 SELECT SUM((bet->>'amount')::float)
                 FROM tickets, jsonb_array_elements(tickets.bets) AS bet
                 WHERE tickets.draw_id = dnl.draw_id
                   AND bet->>'number' = dnl.number
                   AND DATE(tickets.date) = CURRENT_DATE
               ),0) as current_bets,
               CASE WHEN dnl.limit_amount > 0
                 THEN (COALESCE((
                   SELECT SUM((bet->>'amount')::float)
                   FROM tickets, jsonb_array_elements(tickets.bets) AS bet
                   WHERE tickets.draw_id = dnl.draw_id
                     AND bet->>'number' = dnl.number
                     AND DATE(tickets.date) = CURRENT_DATE
                 ),0) / dnl.limit_amount * 100)
                 ELSE 0
               END as progress_percent
        FROM draw_number_limits dnl
        JOIN draws d ON dnl.draw_id = d.id
        WHERE dnl.limit_amount > 0
      `);
      limitsProgress = progress.rows;
    }

    // Gains/pertes des agents aujourd'hui
    const agentsGainLoss = await pool.query(`
      SELECT a.id, a.name,
             COALESCE(SUM(t.total_amount),0) as total_bets,
             COALESCE(SUM(t.win_amount),0) as total_wins,
             COALESCE(SUM(t.win_amount) - SUM(t.total_amount),0) as net_result
      FROM agents a
      LEFT JOIN tickets t ON a.id::text = t.agent_id AND DATE(t.date) = CURRENT_DATE
      WHERE a.active = true
      GROUP BY a.id, a.name
      HAVING COALESCE(SUM(t.total_amount),0) > 0 OR COALESCE(SUM(t.win_amount),0) > 0
      ORDER BY net_result DESC
      LIMIT 20
    `);

    res.json({
      connected: {
        supervisors_count: connectedSup.rows.length,
        supervisors: connectedSup.rows,
        agents_count: connectedAgents.rows.length,
        agents: connectedAgents.rows
      },
      sales_today: parseFloat(sales.rows[0].total),
      limits_progress: limitsProgress,
      agents_gain_loss: agentsGainLoss.rows
    });
  } catch (error) {
    console.error('❌ Dashboard owner:', error);
    res.status(500).json({ error: error.message });
  }
});

// Gestion des tirages (owner)
app.get('/api/owner/draws', requireRole('owner'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM draws ORDER BY name');
    res.json({ draws: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/owner/draws', requireRole('owner'), async (req, res) => {
  try {
    const { id, name, time, description, min_bet, max_bet, blocked } = req.body;
    await pool.query(
      `INSERT INTO draws (id, name, time, description, min_bet, max_bet, active, blocked)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         time = EXCLUDED.time,
         description = EXCLUDED.description,
         min_bet = EXCLUDED.min_bet,
         max_bet = EXCLUDED.max_bet,
         blocked = EXCLUDED.blocked,
         updated_at = NOW()`,
      [id, name, time, description, min_bet || 0, max_bet || 0, blocked || false]
    );
    res.json({ success: true, message: 'Tirage enregistré' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Gestion des limites par tirage
app.get('/api/owner/draw-limits', requireRole('owner'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT dnl.*, d.name as draw_name
      FROM draw_number_limits dnl
      JOIN draws d ON dnl.draw_id = d.id
      ORDER BY d.name, dnl.number
    `);
    res.json({ limits: result.rows });
  } catch (error) {
    res.json({ limits: [] });
  }
});

app.post('/api/owner/draw-limits', requireRole('owner'), async (req, res) => {
  try {
    const { draw_id, number, limit_amount } = req.body;
    await pool.query(
      `INSERT INTO draw_number_limits (draw_id, number, limit_amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (draw_id, number) DO UPDATE SET
         limit_amount = EXCLUDED.limit_amount,
         updated_at = NOW()`,
      [draw_id, number, limit_amount]
    );
    res.json({ success: true, message: 'Limite enregistrée' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Numéros bloqués par tirage
app.get('/api/owner/draw-blocked', requireRole('owner'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT dbn.*, d.name as draw_name
      FROM draw_blocked_numbers dbn
      JOIN draws d ON dbn.draw_id = d.id
      ORDER BY d.name, dbn.number
    `);
    res.json({ blocked: result.rows });
  } catch (error) {
    res.json({ blocked: [] });
  }
});

app.post('/api/owner/draw-blocked', requireRole('owner'), async (req, res) => {
  try {
    const { draw_id, number } = req.body;
    await pool.query(
      `INSERT INTO draw_blocked_numbers (draw_id, number) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [draw_id, number]
    );
    res.json({ success: true, message: 'Numéro bloqué pour ce tirage' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/owner/draw-blocked', requireRole('owner'), async (req, res) => {
  try {
    const { draw_id, number } = req.body;
    await pool.query(
      `DELETE FROM draw_blocked_numbers WHERE draw_id = $1 AND number = $2`,
      [draw_id, number]
    );
    res.json({ success: true, message: 'Blocage retiré' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------------------------
// SERVEUR STATIQUE
// ----------------------------------------------------------------------
app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/agent1.html', (req, res) => res.sendFile(path.join(__dirname, 'agent1.html')));
app.get('/responsable.html', (req, res) => res.sendFile(path.join(__dirname, 'responsable.html')));
app.get('/owner.html', (req, res) => res.sendFile(path.join(__dirname, 'owner.html')));

// 404
app.use('/api/*', (req, res) => res.status(404).json({ error: 'Route API non trouvée' }));
app.use('*', (req, res) => res.status(404).send('Page non trouvée'));

// Gestion erreurs
app.use((err, req, res, next) => {
  console.error('🔥 Erreur serveur:', err.stack);
  res.status(500).json({ error: 'Erreur serveur interne', message: err.message });
});

// ----------------------------------------------------------------------
// DÉMARRAGE
// ----------------------------------------------------------------------
initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur LOTATO démarré sur http://0.0.0.0:${PORT}`);
    console.log(`📊 Health: http://0.0.0.0:${PORT}/api/health`);
    console.log(`👤 Panneau agent: http://0.0.0.0:${PORT}/agent1.html`);
    console.log(`👥 Panneau responsable: http://0.0.0.0:${PORT}/responsable.html`);
    console.log(`👑 Panneau propriétaire: http://0.0.0.0:${PORT}/owner.html`);
  });
});