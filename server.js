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

// ---------- MIDDLEWARE ----------
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: '*', credentials: true, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization','X-Requested-With'] }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('dev'));

// Rate limiting global
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, keyGenerator: (req) => req.ip });
app.use('/api/', limiter);

// ---------- BASE DE DONNÉES ----------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('connect', () => console.log('✅ Connecté à PostgreSQL'));
pool.on('error', (err) => console.error('❌ Erreur PostgreSQL:', err));

// Utilitaires pour ajout dynamique de colonnes
async function columnExists(table, column) {
  const res = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`, [table, column]);
  return res.rows.length > 0;
}
async function addColumnIfNotExists(table, column, definition) {
  if (!(await columnExists(table, column))) {
    console.log(`➕ Ajout colonne ${table}.${column}...`);
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// ---------- INITIALISATION COMPLÈTE DES TABLES ----------
async function initializeDatabase() {
  try {
    console.log('🔄 Initialisation de la base de données...');

    // ---- Tables existantes (conservées) ----
    await pool.query(`CREATE TABLE IF NOT EXISTS draw_results (id SERIAL PRIMARY KEY, draw_id VARCHAR(50), name VARCHAR(100), draw_time TIMESTAMP, results JSONB, lucky_number INTEGER, comment TEXT, source VARCHAR(50), published_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS game_rules (id SERIAL PRIMARY KEY, rule_key VARCHAR(100) UNIQUE, rule_value TEXT, description TEXT, updated_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS system_settings (id SERIAL PRIMARY KEY, setting_key VARCHAR(100) UNIQUE, setting_value TEXT, category VARCHAR(50), updated_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS activity_log (id SERIAL PRIMARY KEY, user_id VARCHAR(50), user_role VARCHAR(20), action VARCHAR(100), details TEXT, ip_address VARCHAR(45), user_agent TEXT, timestamp TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS payments (id SERIAL PRIMARY KEY, ticket_id INTEGER REFERENCES tickets(id), amount DECIMAL(10,2), paid_at TIMESTAMP DEFAULT NOW(), confirmed_by VARCHAR(100))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS alerts (id SERIAL PRIMARY KEY, title VARCHAR(100), message TEXT, type VARCHAR(20), priority VARCHAR(20) DEFAULT 'medium', active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW(), expires_at TIMESTAMP)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS user_limits (user_id VARCHAR(50), limit_type VARCHAR(50), limit_value DECIMAL(10,2), created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(), PRIMARY KEY (user_id, limit_type))`);

    // ---- Table des propriétaires (owner) ----
    await pool.query(`CREATE TABLE IF NOT EXISTS owners (id SERIAL PRIMARY KEY, name VARCHAR(100), username VARCHAR(50) UNIQUE, password VARCHAR(255), active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);

    // ---- Superviseurs - ajout username si absent ----
    await pool.query(`CREATE TABLE IF NOT EXISTS supervisors (id SERIAL PRIMARY KEY, name VARCHAR(100), email VARCHAR(100) UNIQUE, phone VARCHAR(20), password VARCHAR(255), active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
    await addColumnIfNotExists('supervisors', 'username', 'VARCHAR(50) UNIQUE');
    // ---- Agents - ajout username si absent ----
    await pool.query(`CREATE TABLE IF NOT EXISTS agents (id SERIAL PRIMARY KEY, name VARCHAR(100), email VARCHAR(100) UNIQUE, phone VARCHAR(20), password VARCHAR(255), supervisor_id INTEGER REFERENCES supervisors(id), location VARCHAR(100), commission DECIMAL(5,2) DEFAULT 5.00, active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
    await addColumnIfNotExists('agents', 'username', 'VARCHAR(50) UNIQUE');

    // ---- Tirages ----
    await pool.query(`CREATE TABLE IF NOT EXISTS draws (id VARCHAR(50) PRIMARY KEY, name VARCHAR(100), time VARCHAR(10), frequency VARCHAR(20) DEFAULT 'daily', status VARCHAR(20) DEFAULT 'active', active BOOLEAN DEFAULT true, description TEXT, min_bet DECIMAL(10,2) DEFAULT 0, max_bet DECIMAL(10,2) DEFAULT 0, last_draw TIMESTAMP)`);
    await addColumnIfNotExists('draws', 'created_at', 'TIMESTAMP DEFAULT NOW()');
    await addColumnIfNotExists('draws', 'updated_at', 'TIMESTAMP DEFAULT NOW()');

    // ---- Tickets ----
    await pool.query(`CREATE TABLE IF NOT EXISTS tickets (id SERIAL PRIMARY KEY, ticket_id VARCHAR(50), agent_id VARCHAR(50), agent_name VARCHAR(100), draw_id VARCHAR(50), draw_name VARCHAR(100), bets JSONB, total_amount DECIMAL(10,2), win_amount DECIMAL(10,2) DEFAULT 0, paid BOOLEAN DEFAULT false, date TIMESTAMP DEFAULT NOW(), checked BOOLEAN DEFAULT false)`);

    // ---- Configuration loterie ----
    await pool.query(`CREATE TABLE IF NOT EXISTS lottery_config (id SERIAL PRIMARY KEY, name VARCHAR(100), logo TEXT, address TEXT, phone VARCHAR(20))`);
    await addColumnIfNotExists('lottery_config', 'updated_at', 'TIMESTAMP DEFAULT NOW()');

    // ---- Numéros bloqués globaux ----
    await pool.query(`CREATE TABLE IF NOT EXISTS blocked_numbers (number VARCHAR(2) PRIMARY KEY, blocked_at TIMESTAMP DEFAULT NOW())`);

    // ---- Numéros bloqués par tirage (NOUVEAU) ----
    await pool.query(`CREATE TABLE IF NOT EXISTS draw_blocked_numbers (draw_id VARCHAR(50) REFERENCES draws(id) ON DELETE CASCADE, number VARCHAR(2), blocked_at TIMESTAMP DEFAULT NOW(), PRIMARY KEY (draw_id, number))`);

    // ---- Limites de mises par tirage/numéro (NOUVEAU) ----
    // On transforme l'ancienne table number_limits en table draw_number_limits
    await pool.query(`DROP TABLE IF EXISTS number_limits`); // on recrée proprement
    await pool.query(`CREATE TABLE IF NOT EXISTS draw_number_limits (draw_id VARCHAR(50) REFERENCES draws(id) ON DELETE CASCADE, number VARCHAR(2), limit_amount DECIMAL(10,2) NOT NULL, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(), PRIMARY KEY (draw_id, number))`);

    console.log('✅ Toutes les tables sont prêtes');

    // ---- Insertion des tirages par défaut (si absents) ----
    const defaultDraws = [
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
    for (const d of defaultDraws) {
      const exist = await pool.query(`SELECT id FROM draws WHERE id = $1`, [d.id]);
      if (exist.rows.length === 0) {
        await pool.query(`INSERT INTO draws (id, name, time, active) VALUES ($1, $2, $3, true)`, [d.id, d.name, d.time]);
        console.log(`➕ Tirage ${d.name} ajouté`);
      }
    }

    // ---- Configuration loterie par défaut ----
    const cfg = await pool.query(`SELECT id FROM lottery_config LIMIT 1`);
    if (cfg.rows.length === 0) {
      await pool.query(`INSERT INTO lottery_config (name, logo, address, phone) VALUES ('LOTATO PRO', '', '', '')`);
    }

    // ---- Compte propriétaire par défaut (admin/admin123) ----
    const ownerExists = await pool.query(`SELECT id FROM owners WHERE username = 'admin'`);
    if (ownerExists.rows.length === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await pool.query(`INSERT INTO owners (name, username, password) VALUES ($1, $2, $3)`, ['Administrateur', 'admin', hash]);
      console.log('➕ Compte propriétaire créé (admin/admin123)');
    }

    // ---- Comptes superviseur par défaut (supervisor1/super123) ----
    const supExists = await pool.query(`SELECT id FROM supervisors WHERE username = 'supervisor1'`);
    if (supExists.rows.length === 0) {
      const hash = await bcrypt.hash('super123', 10);
      await pool.query(`INSERT INTO supervisors (name, username, password) VALUES ($1, $2, $3)`, ['Superviseur Principal', 'supervisor1', hash]);
    }

    // ---- Comptes agent par défaut (agent01/agent123) ----
    const agentExists = await pool.query(`SELECT id FROM agents WHERE username = 'agent01'`);
    if (agentExists.rows.length === 0) {
      const hash = await bcrypt.hash('agent123', 10);
      await pool.query(`INSERT INTO agents (name, username, password, commission) VALUES ($1, $2, $3, $4)`, ['Agent 01', 'agent01', hash, 5.00]);
    }

    console.log('✅ Base de données initialisée avec succès');
  } catch (error) {
    console.error('❌ Erreur initialisation BDD:', error.message);
  }
}

// ---------- AUTHENTIFICATION VÉRITABLE (JWT) ----------
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
  if (!token) return res.status(401).json({ error: 'Token manquant' });

  jwt.verify(token, process.env.JWT_SECRET || 'lotato-pro-secret-change-me', (err, user) => {
    if (err) return res.status(403).json({ error: 'Token invalide' });
    req.user = user; // contient id, username, role, name
    next();
  });
};
app.use('/api', authenticateToken);

// ---------- LOGIN DYNAMIQUE (BDD) ----------
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    console.log(`🔑 Tentative de connexion: ${username} (${role})`);

    let user = null;
    let table = '';
    if (role === 'owner') table = 'owners';
    else if (role === 'supervisor') table = 'supervisors';
    else if (role === 'agent') table = 'agents';
    else return res.status(400).json({ error: 'Rôle invalide' });

    const result = await pool.query(`SELECT * FROM ${table} WHERE username = $1 AND active = true`, [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Identifiants incorrects' });

    user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Identifiants incorrects' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role, name: user.name },
      process.env.JWT_SECRET || 'lotato-pro-secret-change-me',
      { expiresIn: '24h' }
    );

    console.log(`✅ Connexion réussie: ${user.name} (${role})`);
    res.json({
      success: true,
      token,
      name: user.name,
      role,
      agentId: role === 'agent' ? user.id : null,
      supervisorId: role === 'supervisor' ? user.id : null,
      ownerId: role === 'owner' ? user.id : null
    });
  } catch (error) {
    console.error('❌ Erreur login:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Rafraîchissement token
app.post('/api/auth/refresh', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token requis' });
  jwt.verify(token, process.env.JWT_SECRET || 'lotato-pro-secret-change-me', (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Token invalide' });
    const newToken = jwt.sign(
      { id: decoded.id, username: decoded.username, role: decoded.role, name: decoded.name },
      process.env.JWT_SECRET || 'lotato-pro-secret-change-me',
      { expiresIn: '24h' }
    );
    res.json({ success: true, token: newToken });
  });
});

app.post('/api/auth/logout', (req, res) => res.json({ success: true, message: 'Déconnecté' }));
app.get('/api/auth/verify', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token manquant' });
  jwt.verify(token, process.env.JWT_SECRET || 'lotato-pro-secret-change-me', (err, user) => {
    if (err) return res.status(403).json({ error: 'Token invalide' });
    res.json({ valid: true, user });
  });
});

// ---------- ROUTES EXISTANTES (tickets, gagnants, config, rapports agents) ----------
// (conservées à l'identique, avec légères adaptations)
app.post('/api/tickets/save', async (req, res) => { /* ... inchangé ... */ 
  try {
    const { agentId, agentName, drawId, drawName, bets, total } = req.body;
    if (!agentId || !drawId || !bets) return res.status(400).json({ error: 'Données invalides' });
    const ticketId = `T${Date.now()}${Math.floor(Math.random()*1000)}`;
    const result = await pool.query(
      `INSERT INTO tickets (ticket_id, agent_id, agent_name, draw_id, draw_name, bets, total_amount, date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [ticketId, agentId, agentName || 'Agent', drawId, drawName || drawId, JSON.stringify(bets), parseFloat(total)||0, new Date()]
    );
    res.json({ success: true, ticket: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/tickets', async (req, res) => { /* ... */ 
  try {
    const { agentId } = req.query;
    let q = `SELECT * FROM tickets WHERE 1=1`;
    const p = [];
    if (agentId) { p.push(agentId); q += ` AND agent_id = $${p.length}`; }
    q += ` ORDER BY date DESC LIMIT 50`;
    const r = await pool.query(q, p);
    res.json({ tickets: r.rows.map(t => ({ ...t, bets: typeof t.bets === 'string' ? JSON.parse(t.bets) : t.bets })) });
  } catch { res.json({ tickets: [] }); }
});
app.delete('/api/tickets/delete/:ticketId', async (req, res) => {
  try { await pool.query(`DELETE FROM tickets WHERE id = $1`, [parseInt(req.params.ticketId)]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/winners', async (req, res) => {
  try {
    const { agentId } = req.query;
    let q = `SELECT * FROM tickets WHERE win_amount > 0`;
    const p = [];
    if (agentId) { p.push(agentId); q += ` AND agent_id = $${p.length}`; }
    q += ` ORDER BY date DESC LIMIT 20`;
    const r = await pool.query(q, p);
    res.json({ winners: r.rows });
  } catch { res.json({ winners: [] }); }
});
app.post('/api/tickets/check-winners', async (req, res) => {
  try {
    const { agentId } = req.query;
    const q = agentId ? `SELECT * FROM tickets WHERE agent_id = $1 AND win_amount > 0 AND checked = false` : `SELECT * FROM tickets WHERE win_amount > 0 AND checked = false`;
    const p = agentId ? [agentId] : [];
    const r = await pool.query(q, p);
    for (const t of r.rows) await pool.query(`UPDATE tickets SET checked = true WHERE id = $1`, [t.id]);
    res.json({ success: true, count: r.rows.length, tickets: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/winners/results', async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM draw_results ORDER BY published_at DESC LIMIT 10`);
    res.json({ results: r.rows.map(row => ({ drawId: row.draw_id, name: row.name, numbers: row.results, drawTime: row.draw_time, publishedAt: row.published_at })) });
  } catch { res.json({ results: [] }); }
});
app.get('/api/lottery-config', async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM lottery_config LIMIT 1`);
    res.json(r.rows[0] || { name: 'LOTATO PRO', logo: '', address: '', phone: '' });
  } catch { res.json({ name: 'LOTATO PRO', logo: '', address: '', phone: '' }); }
});
app.post('/api/lottery-config', async (req, res) => {
  try {
    const { name, logo, address, phone } = req.body;
    const chk = await pool.query(`SELECT id FROM lottery_config LIMIT 1`);
    if (chk.rows.length === 0) await pool.query(`INSERT INTO lottery_config (name,logo,address,phone) VALUES ($1,$2,$3,$4)`, [name,logo,address,phone]);
    else await pool.query(`UPDATE lottery_config SET name=$1,logo=$2,address=$3,phone=$4`, [name,logo,address,phone]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/reports', async (req, res) => {
  try {
    const { agentId } = req.query;
    if (!agentId) return res.status(400).json({ error: 'Agent ID requis' });
    const r = await pool.query(`SELECT COUNT(*) as total_tickets, COALESCE(SUM(total_amount),0) as total_bets, COALESCE(SUM(win_amount),0) as total_wins FROM tickets WHERE agent_id = $1 AND DATE(date)=CURRENT_DATE`, [agentId]);
    const d = r.rows[0];
    res.json({ totalTickets: parseInt(d.total_tickets), totalBets: parseFloat(d.total_bets), totalWins: parseFloat(d.total_wins), totalLoss: parseFloat(d.total_bets)-parseFloat(d.total_wins), balance: parseFloat(d.total_wins)-parseFloat(d.total_bets) });
  } catch { res.json({ totalTickets:0,totalBets:0,totalWins:0,totalLoss:0,balance:0 }); }
});
app.get('/api/reports/draw', async (req, res) => {
  try {
    const { agentId, drawId } = req.query;
    if (!agentId || !drawId) return res.status(400).json({ error: 'Agent ID et Draw ID requis' });
    const r = await pool.query(`SELECT COUNT(*) as total_tickets, COALESCE(SUM(total_amount),0) as total_bets, COALESCE(SUM(win_amount),0) as total_wins FROM tickets WHERE agent_id=$1 AND draw_id=$2 AND DATE(date)=CURRENT_DATE`, [agentId, drawId]);
    const d = r.rows[0];
    res.json({ totalTickets: parseInt(d.total_tickets), totalBets: parseFloat(d.total_bets), totalWins: parseFloat(d.total_wins), totalLoss: parseFloat(d.total_bets)-parseFloat(d.total_wins), balance: parseFloat(d.total_wins)-parseFloat(d.total_bets) });
  } catch { res.json({ totalTickets:0,totalBets:0,totalWins:0,totalLoss:0,balance:0 }); }
});
app.get('/api/blocked-numbers', async (req, res) => {
  try {
    const r = await pool.query(`SELECT number FROM blocked_numbers`);
    res.json({ blockedNumbers: r.rows.map(r=>r.number) });
  } catch { res.json({ blockedNumbers: [] }); }
});

// ---------- ROUTES SUPERVISEUR (responsable) ----------
// Middleware de vérification de rôle
const requireRole = (role) => (req, res, next) => {
  if (!req.user || req.user.role !== role) return res.status(403).json({ error: 'Accès interdit' });
  next();
};

// ========== API /supervisor ==========
app.get('/api/supervisor/reports/overall', requireRole('supervisor'), async (req, res) => {
  try {
    const supervisorId = req.user.id;
    // Récupérer les IDs des agents sous ce superviseur
    const agents = await pool.query(`SELECT id FROM agents WHERE supervisor_id = $1 AND active = true`, [supervisorId]);
    const agentIds = agents.rows.map(a => a.id);
    if (agentIds.length === 0) return res.json({ totalTickets:0, totalBets:0, totalWins:0, balance:0 });

    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_tickets,
        COALESCE(SUM(total_amount),0) as total_bets,
        COALESCE(SUM(win_amount),0) as total_wins,
        COALESCE(SUM(win_amount) - SUM(total_amount),0) as balance
      FROM tickets
      WHERE agent_id = ANY($1::int[]) AND DATE(date) = CURRENT_DATE
    `, [agentIds]);
    res.json(stats.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/supervisor/agents', requireRole('supervisor'), async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const agents = await pool.query(`
      SELECT a.id, a.name, a.username, a.active as blocked, 
        COALESCE(SUM(t.total_amount),0) as totalBets,
        COALESCE(SUM(t.win_amount),0) as totalWins,
        COUNT(t.id) as totalTickets,
        COALESCE(SUM(t.win_amount) - SUM(t.total_amount),0) as balance
      FROM agents a
      LEFT JOIN tickets t ON a.id::text = t.agent_id AND DATE(t.date) = CURRENT_DATE
      WHERE a.supervisor_id = $1
      GROUP BY a.id
    `, [supervisorId]);
    res.json(agents.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/supervisor/block-agent/:agentId', requireRole('supervisor'), async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const agentId = req.params.agentId;
    // Vérifier que l'agent appartient bien à ce superviseur
    const check = await pool.query(`SELECT id FROM agents WHERE id = $1 AND supervisor_id = $2`, [agentId, supervisorId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Agent non trouvé' });
    await pool.query(`UPDATE agents SET active = false WHERE id = $1`, [agentId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/supervisor/unblock-agent/:agentId', requireRole('supervisor'), async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const agentId = req.params.agentId;
    const check = await pool.query(`SELECT id FROM agents WHERE id = $1 AND supervisor_id = $2`, [agentId, supervisorId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Agent non trouvé' });
    await pool.query(`UPDATE agents SET active = true WHERE id = $1`, [agentId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/supervisor/tickets/recent', requireRole('supervisor'), async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const { agentId } = req.query;
    if (!agentId) return res.status(400).json({ error: 'agentId requis' });
    // Vérifier que l'agent appartient au superviseur
    const check = await pool.query(`SELECT id FROM agents WHERE id = $1 AND supervisor_id = $2`, [agentId, supervisorId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Agent non trouvé' });
    const tickets = await pool.query(`
      SELECT id, ticket_id, total_amount, date
      FROM tickets
      WHERE agent_id = $1
      ORDER BY date DESC LIMIT 10
    `, [agentId]);
    res.json(tickets.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/supervisor/tickets/:ticketId', requireRole('supervisor'), async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const ticketId = req.params.ticketId;
    // Récupérer le ticket et vérifier que l'agent est sous ce superviseur
    const ticket = await pool.query(`
      SELECT t.id, t.agent_id, t.date
      FROM tickets t
      JOIN agents a ON t.agent_id::int = a.id
      WHERE t.id = $1 AND a.supervisor_id = $2
    `, [ticketId, supervisorId]);
    if (ticket.rows.length === 0) return res.status(404).json({ error: 'Ticket non trouvé' });

    const diffMinutes = (new Date() - new Date(ticket.rows[0].date)) / 60000;
    if (diffMinutes > 10) return res.status(403).json({ error: 'Ticket trop ancien (>10 min)' });

    await pool.query(`DELETE FROM tickets WHERE id = $1`, [ticketId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- ROUTES PROPRIÉTAIRE (owner) ----------
// ========== API /owner ==========
app.get('/api/owner/dashboard', requireRole('owner'), async (req, res) => {
  try {
    // Données simplifiées, mais suffisantes pour l'interface
    const [supCount, agentCount, salesToday] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM supervisors WHERE active = true`),
      pool.query(`SELECT COUNT(*) FROM agents WHERE active = true`),
      pool.query(`SELECT COALESCE(SUM(total_amount),0) as total FROM tickets WHERE DATE(date)=CURRENT_DATE`)
    ]);

    // Limites progression (depuis draw_number_limits)
    const limitsProgress = await pool.query(`
      SELECT d.name as draw_name, dnl.number, dnl.limit_amount,
        COALESCE(SUM(t.total_amount),0) as current_bets,
        (COALESCE(SUM(t.total_amount),0) / dnl.limit_amount * 100) as progress_percent
      FROM draw_number_limits dnl
      JOIN draws d ON dnl.draw_id = d.id
      LEFT JOIN tickets t ON t.draw_id = dnl.draw_id AND DATE(t.date)=CURRENT_DATE AND t.bets::text LIKE '%'||dnl.number||'%'
      GROUP BY d.id, dnl.number, dnl.limit_amount
    `);
    
    // Agents gains/pertes
    const agentsGL = await pool.query(`
      SELECT a.name, COALESCE(SUM(t.total_amount),0) as total_bets, COALESCE(SUM(t.win_amount),0) as total_wins,
        COALESCE(SUM(t.win_amount)-SUM(t.total_amount),0) as net_result
      FROM agents a
      LEFT JOIN tickets t ON a.id::text = t.agent_id AND DATE(t.date)=CURRENT_DATE
      GROUP BY a.id
      HAVING COALESCE(SUM(t.total_amount),0) > 0 OR COALESCE(SUM(t.win_amount),0) > 0
      ORDER BY net_result DESC
      LIMIT 20
    `);

    res.json({
      connected: {
        supervisors_count: parseInt(supCount.rows[0].count),
        agents_count: parseInt(agentCount.rows[0].count),
        supervisors: await pool.query(`SELECT name, username FROM supervisors WHERE active = true LIMIT 10`).then(r=>r.rows),
        agents: await pool.query(`SELECT name, username FROM agents WHERE active = true LIMIT 10`).then(r=>r.rows)
      },
      sales_today: parseFloat(salesToday.rows[0].total),
      limits_progress: limitsProgress.rows,
      agents_gain_loss: agentsGL.rows
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/owner/supervisors', requireRole('owner'), async (req, res) => {
  try {
    const sups = await pool.query(`SELECT id, name, username, active as blocked FROM supervisors ORDER BY name`);
    res.json(sups.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/owner/agents', requireRole('owner'), async (req, res) => {
  try {
    const agents = await pool.query(`
      SELECT a.id, a.name, a.username, a.active as blocked, s.name as supervisor_name
      FROM agents a
      LEFT JOIN supervisors s ON a.supervisor_id = s.id
      ORDER BY a.name
    `);
    res.json(agents.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/owner/create-user', requireRole('owner'), async (req, res) => {
  try {
    const { name, cin, username, password, role, supervisorId, zone } = req.body;
    if (!name || !username || !password || !role) return res.status(400).json({ error: 'Champs requis' });
    const hash = await bcrypt.hash(password, 10);
    
    if (role === 'supervisor') {
      await pool.query(
        `INSERT INTO supervisors (name, username, password, phone) VALUES ($1, $2, $3, $4)`,
        [name, username, hash, cin || '']
      );
    } else if (role === 'agent') {
      await pool.query(
        `INSERT INTO agents (name, username, password, supervisor_id, location, commission) VALUES ($1, $2, $3, $4, $5, 5.00)`,
        [name, username, hash, supervisorId || null, zone || '']
      );
    } else return res.status(400).json({ error: 'Rôle non supporté' });
    
    res.json({ success: true });
  } catch (e) {
    if (e.code === '23505') res.status(400).json({ error: 'Nom d’utilisateur déjà utilisé' });
    else res.status(500).json({ error: e.message });
  }
});

app.post('/api/owner/block-user', requireRole('owner'), async (req, res) => {
  try {
    const { userId, type } = req.body;
    const table = type === 'supervisor' ? 'supervisors' : 'agents';
    await pool.query(`UPDATE ${table} SET active = NOT active WHERE id = $1`, [userId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/owner/change-supervisor', requireRole('owner'), async (req, res) => {
  try {
    const { agentId, supervisorId } = req.body;
    await pool.query(`UPDATE agents SET supervisor_id = $1 WHERE id = $2`, [supervisorId || null, agentId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/owner/draws', requireRole('owner'), async (req, res) => {
  try {
    const draws = await pool.query(`SELECT id, name, time, active FROM draws ORDER BY name`);
    res.json(draws.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/owner/publish-results', requireRole('owner'), async (req, res) => {
  try {
    const { drawId, numbers } = req.body;
    if (!drawId || !Array.isArray(numbers) || numbers.length < 3) return res.status(400).json({ error: 'Données invalides' });
    const draw = await pool.query(`SELECT name FROM draws WHERE id = $1`, [drawId]);
    if (draw.rows.length === 0) return res.status(404).json({ error: 'Tirage inconnu' });
    await pool.query(
      `INSERT INTO draw_results (draw_id, name, results, draw_time, published_at) VALUES ($1, $2, $3, NOW(), NOW())`,
      [drawId, draw.rows[0].name, JSON.stringify(numbers)]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/owner/block-draw', requireRole('owner'), async (req, res) => {
  try {
    const { drawId, block } = req.body;
    await pool.query(`UPDATE draws SET active = $1 WHERE id = $2`, [block, drawId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Blocage global
app.post('/api/owner/block-number', requireRole('owner'), async (req, res) => {
  try {
    const { number } = req.body;
    await pool.query(`INSERT INTO blocked_numbers (number) VALUES ($1) ON CONFLICT DO NOTHING`, [number.padStart(2,'0')]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/owner/unblock-number', requireRole('owner'), async (req, res) => {
  try {
    const { number } = req.body;
    await pool.query(`DELETE FROM blocked_numbers WHERE number = $1`, [number.padStart(2,'0')]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/owner/blocked-numbers', requireRole('owner'), async (req, res) => {
  try {
    const r = await pool.query(`SELECT number FROM blocked_numbers`);
    res.json({ blockedNumbers: r.rows.map(r=>r.number) });
  } catch { res.json({ blockedNumbers: [] }); }
});

// Blocage par tirage
app.post('/api/owner/block-number-draw', requireRole('owner'), async (req, res) => {
  try {
    const { drawId, number } = req.body;
    await pool.query(`INSERT INTO draw_blocked_numbers (draw_id, number) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [drawId, number.padStart(2,'0')]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/owner/unblock-number-draw', requireRole('owner'), async (req, res) => {
  try {
    const { drawId, number } = req.body;
    await pool.query(`DELETE FROM draw_blocked_numbers WHERE draw_id = $1 AND number = $2`, [drawId, number.padStart(2,'0')]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Limites par tirage/numéro
app.post('/api/owner/number-limit', requireRole('owner'), async (req, res) => {
  try {
    const { drawId, number, limitAmount } = req.body;
    await pool.query(
      `INSERT INTO draw_number_limits (draw_id, number, limit_amount) VALUES ($1, $2, $3)
       ON CONFLICT (draw_id, number) DO UPDATE SET limit_amount = EXCLUDED.limit_amount, updated_at = NOW()`,
      [drawId, number.padStart(2,'0'), limitAmount]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Rapport propriétaire (version simplifiée)
app.get('/api/owner/reports', requireRole('owner'), async (req, res) => {
  try {
    let { supervisorId, agentId, drawId, period, fromDate, toDate, gainLoss } = req.query;
    let dateCondition = '';
    if (period === 'today') dateCondition = `AND DATE(date) = CURRENT_DATE`;
    else if (period === 'yesterday') dateCondition = `AND DATE(date) = CURRENT_DATE - 1`;
    else if (period === 'week') dateCondition = `AND date >= DATE_TRUNC('week', CURRENT_DATE)`;
    else if (period === 'month') dateCondition = `AND date >= DATE_TRUNC('month', CURRENT_DATE)`;
    else if (period === 'custom' && fromDate && toDate) dateCondition = `AND DATE(date) BETWEEN '${fromDate}' AND '${toDate}'`;

    let where = `WHERE 1=1 ${dateCondition}`;
    const params = [];
    let paramIdx = 1;
    if (supervisorId && supervisorId !== 'all') {
      where += ` AND a.supervisor_id = $${paramIdx++}`;
      params.push(supervisorId);
    }
    if (agentId && agentId !== 'all') {
      where += ` AND t.agent_id::int = $${paramIdx++}`;
      params.push(agentId);
    }
    if (drawId && drawId !== 'all') {
      where += ` AND t.draw_id = $${paramIdx++}`;
      params.push(drawId);
    }

    // Résumé
    const summarySql = `
      SELECT 
        COUNT(DISTINCT t.id) as totalTickets,
        COALESCE(SUM(t.total_amount),0) as totalBets,
        COALESCE(SUM(t.win_amount),0) as totalWins,
        COALESCE(SUM(t.win_amount)-SUM(t.total_amount),0) as netResult,
        COUNT(DISTINCT CASE WHEN t.win_amount > t.total_amount THEN t.agent_id END) as gainCount,
        COUNT(DISTINCT CASE WHEN t.win_amount < t.total_amount THEN t.agent_id END) as lossCount
      FROM tickets t
      LEFT JOIN agents a ON t.agent_id::int = a.id
      ${where}
    `;
    const summary = await pool.query(summarySql, params);

    // Détail par agent ou par tirage
    let detailSql = '';
    if (drawId && drawId !== 'all') {
      detailSql = `
        SELECT a.name as agent_name, COUNT(t.id) as tickets, SUM(t.total_amount) as bets, SUM(t.win_amount) as wins
        FROM tickets t
        JOIN agents a ON t.agent_id::int = a.id
        ${where}
        GROUP BY a.id
        ORDER BY bets DESC
      `;
    } else {
      detailSql = `
        SELECT t.draw_id, t.draw_name, COUNT(t.id) as tickets, SUM(t.total_amount) as bets, SUM(t.win_amount) as wins
        FROM tickets t
        LEFT JOIN agents a ON t.agent_id::int = a.id
        ${where}
        GROUP BY t.draw_id, t.draw_name
        ORDER BY bets DESC
      `;
    }
    const detail = await pool.query(detailSql, params);

    res.json({
      summary: summary.rows[0],
      detail: detail.rows
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- SERVEUR STATIQUE ----------
app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/agent1.html', (req, res) => res.sendFile(path.join(__dirname, 'agent1.html')));
app.get('/responsable.html', (req, res) => res.sendFile(path.join(__dirname, 'responsable.html')));
app.get('/owner.html', (req, res) => res.sendFile(path.join(__dirname, 'owner.html')));

// 404 API
app.use('/api/*', (req, res) => res.status(404).json({ error: 'Route API non trouvée' }));
app.use('*', (req, res) => res.status(404).send('Page non trouvée'));

// Gestion globale des erreurs
app.use((err, req, res, next) => {
  console.error('🔥 Erreur serveur:', err.stack);
  res.status(500).json({ error: 'Erreur interne', message: err.message });
});

// DÉMARRAGE
initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur LOTATO démarré sur http://0.0.0.0:${PORT}`);
    console.log(`📊 Health: http://0.0.0.0:${PORT}/api/health`);
  });
});