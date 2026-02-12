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

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('connect', () => console.log('✅ Connecté à PostgreSQL'));
pool.on('error', (err) => console.error('❌ Erreur PostgreSQL:', err));

// --------------------------
// Utilitaires BDD
// --------------------------
async function columnExists(tableName, columnName) {
  try {
    const res = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = $1 AND column_name = $2
    `, [tableName, columnName]);
    return res.rows.length > 0;
  } catch (error) {
    console.error(`Erreur vérification colonne ${tableName}.${columnName}:`, error);
    return false;
  }
}

async function addColumnIfNotExists(tableName, columnName, columnDefinition) {
  if (!(await columnExists(tableName, columnName))) {
    console.log(`➕ Ajout colonne ${tableName}.${columnName}...`);
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
    console.log(`✅ Colonne ${tableName}.${columnName} ajoutée`);
  }
}

// --------------------------
// Initialisation des tables
// --------------------------
async function initializeDatabase() {
  try {
    console.log('🔄 Initialisation de la base de données...');

    // ---- Tables existantes (conservées) ----
    await pool.query(`CREATE TABLE IF NOT EXISTS draw_results ( id SERIAL PRIMARY KEY, draw_id VARCHAR(50), name VARCHAR(100), draw_time TIMESTAMP, results JSONB, lucky_number INTEGER, comment TEXT, source VARCHAR(50), published_at TIMESTAMP DEFAULT NOW() )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS number_limits ( number VARCHAR(2) PRIMARY KEY, limit_amount DECIMAL(10,2), created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW() )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS game_rules ( id SERIAL PRIMARY KEY, rule_key VARCHAR(100) UNIQUE, rule_value TEXT, description TEXT, updated_at TIMESTAMP DEFAULT NOW() )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS system_settings ( id SERIAL PRIMARY KEY, setting_key VARCHAR(100) UNIQUE, setting_value TEXT, category VARCHAR(50), updated_at TIMESTAMP DEFAULT NOW() )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS activity_log ( id SERIAL PRIMARY KEY, user_id VARCHAR(50), user_role VARCHAR(20), action VARCHAR(100), details TEXT, ip_address VARCHAR(45), user_agent TEXT, timestamp TIMESTAMP DEFAULT NOW() )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS tickets ( id SERIAL PRIMARY KEY, ticket_id VARCHAR(50), agent_id VARCHAR(50), agent_name VARCHAR(100), draw_id VARCHAR(50), draw_name VARCHAR(100), bets JSONB, total_amount DECIMAL(10,2), win_amount DECIMAL(10,2) DEFAULT 0, paid BOOLEAN DEFAULT false, date TIMESTAMP DEFAULT NOW(), checked BOOLEAN DEFAULT false )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS payments ( id SERIAL PRIMARY KEY, ticket_id INTEGER REFERENCES tickets(id), amount DECIMAL(10,2), paid_at TIMESTAMP DEFAULT NOW(), confirmed_by VARCHAR(100) )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS lottery_config ( id SERIAL PRIMARY KEY, name VARCHAR(100), logo TEXT, address TEXT, phone VARCHAR(20), updated_at TIMESTAMP DEFAULT NOW() )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS alerts ( id SERIAL PRIMARY KEY, title VARCHAR(100), message TEXT, type VARCHAR(20), priority VARCHAR(20) DEFAULT 'medium', active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW(), expires_at TIMESTAMP )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS user_limits ( user_id VARCHAR(50), limit_type VARCHAR(50), limit_value DECIMAL(10,2), created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(), PRIMARY KEY (user_id, limit_type) )`);

    // ---- Tables superviseurs et agents (avec ajout des colonnes manquantes) ----
    await pool.query(`CREATE TABLE IF NOT EXISTS supervisors ( id SERIAL PRIMARY KEY, name VARCHAR(100), email VARCHAR(100) UNIQUE, phone VARCHAR(20), password VARCHAR(255), active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW() )`);
    await addColumnIfNotExists('supervisors', 'username', 'VARCHAR(100) UNIQUE');
    await addColumnIfNotExists('supervisors', 'blocked', 'BOOLEAN DEFAULT false'); // on utilise blocked pour uniformiser
    await addColumnIfNotExists('supervisors', 'zone', 'VARCHAR(100)');
    await addColumnIfNotExists('supervisors', 'cin', 'VARCHAR(20)');

    await pool.query(`CREATE TABLE IF NOT EXISTS agents ( id SERIAL PRIMARY KEY, name VARCHAR(100), email VARCHAR(100) UNIQUE, phone VARCHAR(20), password VARCHAR(255), supervisor_id INTEGER REFERENCES supervisors(id), location VARCHAR(100), commission DECIMAL(5,2) DEFAULT 5.00, active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW() )`);
    await addColumnIfNotExists('agents', 'username', 'VARCHAR(100) UNIQUE');
    await addColumnIfNotExists('agents', 'blocked', 'BOOLEAN DEFAULT false');
    await addColumnIfNotExists('agents', 'zone', 'VARCHAR(100)');
    await addColumnIfNotExists('agents', 'cin', 'VARCHAR(20)');

    // ---- Tables des tirages (ajout colonnes) ----
    await pool.query(`CREATE TABLE IF NOT EXISTS draws ( id VARCHAR(50) PRIMARY KEY, name VARCHAR(100), time VARCHAR(10), frequency VARCHAR(20) DEFAULT 'daily', status VARCHAR(20) DEFAULT 'active', active BOOLEAN DEFAULT true, description TEXT, min_bet DECIMAL(10,2) DEFAULT 0, max_bet DECIMAL(10,2) DEFAULT 0, last_draw TIMESTAMP )`);
    await addColumnIfNotExists('draws', 'blocked', 'BOOLEAN DEFAULT false');
    await addColumnIfNotExists('draws', 'created_at', 'TIMESTAMP DEFAULT NOW()');
    await addColumnIfNotExists('draws', 'updated_at', 'TIMESTAMP DEFAULT NOW()');

    // ---- Numéros bloqués globalement ----
    await pool.query(`CREATE TABLE IF NOT EXISTS blocked_numbers ( number VARCHAR(2) PRIMARY KEY, blocked_at TIMESTAMP DEFAULT NOW() )`);

    // ---- Numéros bloqués par tirage ----
    await pool.query(`CREATE TABLE IF NOT EXISTS draw_blocked_numbers ( draw_id VARCHAR(50) REFERENCES draws(id) ON DELETE CASCADE, number VARCHAR(2), blocked_at TIMESTAMP DEFAULT NOW(), PRIMARY KEY (draw_id, number) )`);

    // ---- Limites de montant par numéro et par tirage ----
    await pool.query(`CREATE TABLE IF NOT EXISTS draw_number_limits ( draw_id VARCHAR(50) REFERENCES draws(id) ON DELETE CASCADE, number VARCHAR(2), limit_amount DECIMAL(10,2), created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(), PRIMARY KEY (draw_id, number) )`);

    console.log('✅ Tables créées / vérifiées');

    // ---- Insérer les tirages par défaut ----
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
    for (const draw of draws) {
      const existing = await pool.query('SELECT id FROM draws WHERE id = $1', [draw.id]);
      if (existing.rows.length === 0) {
        await pool.query('INSERT INTO draws (id, name, time, active) VALUES ($1, $2, $3, true)', [draw.id, draw.name, draw.time]);
        console.log(`➕ Tirage ${draw.name} ajouté`);
      }
    }

    // ---- Configuration loterie par défaut ----
    const configExists = await pool.query('SELECT id FROM lottery_config LIMIT 1');
    if (configExists.rows.length === 0) {
      await pool.query(`INSERT INTO lottery_config (name, logo, address, phone) VALUES ('LOTATO PRO', '', '', '')`);
      console.log('✅ Configuration loterie par défaut ajoutée');
    }

    console.log('✅ Base de données initialisée avec succès');
  } catch (error) {
    console.error('❌ Erreur initialisation base de données:', error.message);
  }
}

// --------------------------
// Middleware d'authentification simplifié (à adapter en production)
// --------------------------
const authenticateToken = (req, res, next) => {
  const publicRoutes = [
    '/api/health', '/api/auth/login', '/api/auth/refresh', '/api/auth/logout',
    '/api/tickets/save', '/api/tickets', '/api/winners', '/api/winners/results',
    '/api/lottery-config', '/api/tickets/check-winners', '/api/blocked-numbers',
    '/api/reports', '/api/reports/draw'
  ];
  if (publicRoutes.includes(req.path)) return next();

  // En développement : on simule un utilisateur selon le rôle demandé
  // Pour les routes propriétaire/superviseur, on peut déduire le rôle depuis le préfixe
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    // Fallback pour le développement : on attribue un rôle par défaut
    req.user = { id: 'owner-01', username: 'admin', role: 'owner', name: 'Propriétaire' };
    return next();
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'lotato-dev-secret');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token invalide' });
  }
};
app.use('/api', authenticateToken);

// --------------------------
// ROUTES PUBLIQUES (existantes)
// --------------------------
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({ status: 'OK', timestamp: new Date().toISOString(), database: 'connected', service: 'LOTATO API v1.0' });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    console.log('🔑 Tentative de connexion:', { username, role });

    // Validation simplifiée – à remplacer par une vraie vérification en BDD
    let user = null;
    if (role === 'agent' && username === 'agent01' && password === 'agent123') {
      user = { id: 'agent-01', name: 'Agent 01', username: 'agent01', role: 'agent' };
    } else if (role === 'supervisor' && username === 'supervisor1' && password === 'super123') {
      user = { id: 'supervisor-01', name: 'Superviseur', username: 'supervisor1', role: 'supervisor' };
    } else if (role === 'owner' && username === 'admin' && password === 'admin123') {
      user = { id: 'owner-01', name: 'Admin', username: 'admin', role: 'owner' };
    }

    if (!user) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, name: user.name },
      process.env.JWT_SECRET || 'lotato-dev-secret',
      { expiresIn: '24h' }
    );

    console.log(`✅ Connexion réussie pour ${user.name} (${user.role})`);
    res.json({
      success: true,
      token,
      name: user.name,
      role: user.role,
      agentId: user.role === 'agent' ? user.id : null,
      supervisorId: user.role === 'supervisor' ? user.id : null,
      ownerId: user.role === 'owner' ? user.id : null
    });
  } catch (error) {
    console.error('❌ Erreur login:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/auth/refresh', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token requis' });
  jwt.verify(token, process.env.JWT_SECRET || 'lotato-dev-secret', (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Token invalide' });
    const newToken = jwt.sign(
      { id: decoded.id, username: decoded.username, role: decoded.role, name: decoded.name },
      process.env.JWT_SECRET || 'lotato-dev-secret',
      { expiresIn: '24h' }
    );
    res.json({ success: true, token: newToken });
  });
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true, message: 'Déconnecté avec succès' });
});

app.get('/api/auth/verify', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token manquant' });
  jwt.verify(token, process.env.JWT_SECRET || 'lotato-dev-secret', (err, user) => {
    if (err) return res.status(403).json({ error: 'Token invalide' });
    res.json({ valid: true, user });
  });
});

// --------------------------
// ROUTES AGENTS (existantes, inchangées)
// --------------------------
app.post('/api/tickets/save', async (req, res) => { /* ... */ });
app.get('/api/tickets', async (req, res) => { /* ... */ });
app.delete('/api/tickets/delete/:ticketId', async (req, res) => { /* ... */ });
app.get('/api/winners', async (req, res) => { /* ... */ });
app.post('/api/tickets/check-winners', async (req, res) => { /* ... */ });
app.get('/api/winners/results', async (req, res) => { /* ... */ });
app.get('/api/lottery-config', async (req, res) => { /* ... */ });
app.post('/api/lottery-config', async (req, res) => { /* ... */ });
app.get('/api/reports', async (req, res) => { /* ... */ });
app.get('/api/reports/draw', async (req, res) => { /* ... */ });
app.get('/api/blocked-numbers', async (req, res) => { /* ... */ });

// (Les implémentations existantes sont conservées, je ne les recopie pas par souci de concision)

// =====================================================================
// ==================== ROUTES PROPRIÉTAIRE (OWNER) ====================
// =====================================================================

// ---------------------- Dashboard ----------------------
app.get('/api/owner/dashboard', async (req, res) => {
  try {
    // Connexions : ici nous simulons des compteurs (à remplacer par des logs réels)
    const supervisorsCount = (await pool.query('SELECT COUNT(*) FROM supervisors WHERE active = true')).rows[0].count;
    const agentsCount = (await pool.query('SELECT COUNT(*) FROM agents WHERE active = true')).rows[0].count;
    const connectedSupervisors = []; // à implémenter avec une table de sessions
    const connectedAgents = [];

    // Ventes du jour
    const today = moment().format('YYYY-MM-DD');
    const salesRes = await pool.query(`
      SELECT COALESCE(SUM(total_amount), 0) as total 
      FROM tickets 
      WHERE DATE(date) = $1
    `, [today]);
    const salesToday = parseFloat(salesRes.rows[0].total);

    // Progression des limites (draw_number_limits)
    const limitsProgress = await pool.query(`
      SELECT dnl.draw_id, d.name as draw_name, dnl.number, dnl.limit_amount,
             COALESCE(SUM(tb.amount), 0) as current_bets,
             CASE 
               WHEN dnl.limit_amount > 0 THEN ROUND((COALESCE(SUM(tb.amount), 0) / dnl.limit_amount * 100)::numeric, 1)
               ELSE 0 
             END as progress_percent
      FROM draw_number_limits dnl
      JOIN draws d ON d.id = dnl.draw_id
      LEFT JOIN tickets t ON t.draw_id = dnl.draw_id AND DATE(t.date) = $1
      LEFT JOIN jsonb_to_recordset(t.bets) AS tb(amount numeric) ON true
      GROUP BY dnl.draw_id, d.name, dnl.number, dnl.limit_amount
      ORDER BY progress_percent DESC
    `, [today]);

    // Agents gains/pertes aujourd'hui
    const agentsGainLoss = await pool.query(`
      SELECT a.id, a.name, 
             COALESCE(SUM(t.total_amount), 0) as total_bets,
             COALESCE(SUM(t.win_amount), 0) as total_wins,
             COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as net_result
      FROM agents a
      LEFT JOIN tickets t ON t.agent_id = a.id::text AND DATE(t.date) = $1
      GROUP BY a.id, a.name
      HAVING COALESCE(SUM(t.total_amount), 0) > 0 OR COALESCE(SUM(t.win_amount), 0) > 0
      ORDER BY net_result DESC
    `, [today]);

    res.json({
      connected: {
        supervisors_count: parseInt(supervisorsCount),
        agents_count: parseInt(agentsCount),
        supervisors: connectedSupervisors,
        agents: connectedAgents
      },
      sales_today: salesToday,
      limits_progress: limitsProgress.rows,
      agents_gain_loss: agentsGainLoss.rows
    });
  } catch (error) {
    console.error('❌ Erreur /owner/dashboard:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------------------- Gestion utilisateurs ----------------------
app.get('/api/owner/supervisors', async (req, res) => {
  try {
    const supervisors = await pool.query(`
      SELECT id, name, username, email, phone, active as blocked, zone, cin 
      FROM supervisors 
      ORDER BY name
    `);
    res.json(supervisors.rows);
  } catch (error) {
    console.error('❌ Erreur /owner/supervisors:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/owner/agents', async (req, res) => {
  try {
    const agents = await pool.query(`
      SELECT a.id, a.name, a.username, a.email, a.phone, a.active as blocked, a.zone, a.cin,
             a.supervisor_id, s.name as supervisor_name
      FROM agents a
      LEFT JOIN supervisors s ON s.id = a.supervisor_id
      ORDER BY a.name
    `);
    res.json(agents.rows);
  } catch (error) {
    console.error('❌ Erreur /owner/agents:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/owner/create-user', async (req, res) => {
  try {
    const { name, cin, username, password, role, supervisorId, zone } = req.body;
    if (!name || !username || !password || !role) {
      return res.status(400).json({ error: 'Champs requis manquants' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    if (role === 'supervisor') {
      // Vérifier unicité du username
      const existing = await pool.query('SELECT id FROM supervisors WHERE username = $1', [username]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Nom d’utilisateur déjà pris' });
      }
      await pool.query(`
        INSERT INTO supervisors (name, cin, username, password, zone, active, email)
        VALUES ($1, $2, $3, $4, $5, true, $6)
      `, [name, cin || null, username, hashedPassword, zone || null, `${username}@exemple.com`]);
    } else if (role === 'agent') {
      const existing = await pool.query('SELECT id FROM agents WHERE username = $1', [username]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Nom d’utilisateur déjà pris' });
      }
      await pool.query(`
        INSERT INTO agents (name, cin, username, password, supervisor_id, zone, active, email)
        VALUES ($1, $2, $3, $4, $5, $6, true, $7)
      `, [name, cin || null, username, hashedPassword, supervisorId || null, zone || null, `${username}@exemple.com`]);
    } else {
      return res.status(400).json({ error: 'Rôle invalide' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur /owner/create-user:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/owner/block-user', async (req, res) => {
  try {
    const { userId, type, block = true } = req.body; // block = true pour bloquer, false pour débloquer
    const table = type === 'supervisor' ? 'supervisors' : 'agents';
    const idColumn = type === 'supervisor' ? 'id' : 'id';
    await pool.query(`UPDATE ${table} SET active = $1 WHERE id = $2`, [!block, userId]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur /owner/block-user:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/owner/change-supervisor', async (req, res) => {
  try {
    const { agentId, supervisorId } = req.body;
    await pool.query('UPDATE agents SET supervisor_id = $1 WHERE id = $2', [supervisorId || null, agentId]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur /owner/change-supervisor:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------------------- Gestion des tirages ----------------------
app.get('/api/owner/draws', async (req, res) => {
  try {
    const draws = await pool.query('SELECT id, name, time, blocked FROM draws ORDER BY id');
    res.json(draws.rows);
  } catch (error) {
    console.error('❌ Erreur /owner/draws:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/owner/publish-results', async (req, res) => {
  try {
    const { drawId, numbers } = req.body; // numbers: [lot1, lot2, lot3]
    if (!drawId || !numbers || numbers.length !== 3) {
      return res.status(400).json({ error: 'Données invalides' });
    }
    // Insérer dans draw_results
    await pool.query(`
      INSERT INTO draw_results (draw_id, name, draw_time, results, lucky_number, source)
      VALUES ($1, (SELECT name FROM draws WHERE id = $1), NOW(), $2, null, 'owner')
    `, [drawId, JSON.stringify(numbers)]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur /owner/publish-results:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/owner/block-draw', async (req, res) => {
  try {
    const { drawId, block } = req.body; // block = true/false
    await pool.query('UPDATE draws SET blocked = $1 WHERE id = $2', [block, drawId]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur /owner/block-draw:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------------------- Numéros bloqués (global) ----------------------
app.get('/api/owner/blocked-numbers', async (req, res) => {
  try {
    const result = await pool.query('SELECT number FROM blocked_numbers');
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (error) {
    console.error('❌ Erreur /owner/blocked-numbers:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/owner/block-number', async (req, res) => {
  try {
    const { number } = req.body;
    await pool.query('INSERT INTO blocked_numbers (number) VALUES ($1) ON CONFLICT DO NOTHING', [number]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur /owner/block-number:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/owner/unblock-number', async (req, res) => {
  try {
    const { number } = req.body;
    await pool.query('DELETE FROM blocked_numbers WHERE number = $1', [number]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur /owner/unblock-number:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------------------- Numéros bloqués par tirage ----------------------
app.post('/api/owner/block-number-draw', async (req, res) => {
  try {
    const { drawId, number } = req.body;
    await pool.query('INSERT INTO draw_blocked_numbers (draw_id, number) VALUES ($1, $2) ON CONFLICT DO NOTHING', [drawId, number]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur /owner/block-number-draw:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/owner/unblock-number-draw', async (req, res) => {
  try {
    const { drawId, number } = req.body;
    await pool.query('DELETE FROM draw_blocked_numbers WHERE draw_id = $1 AND number = $2', [drawId, number]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur /owner/unblock-number-draw:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------------------- Limites de montant par tirage ----------------------
app.post('/api/owner/number-limit', async (req, res) => {
  try {
    const { drawId, number, limitAmount } = req.body;
    await pool.query(`
      INSERT INTO draw_number_limits (draw_id, number, limit_amount, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (draw_id, number) DO UPDATE SET limit_amount = EXCLUDED.limit_amount, updated_at = NOW()
    `, [drawId, number, limitAmount]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur /owner/number-limit:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------------------- Rapports (owner) ----------------------
app.get('/api/owner/reports', async (req, res) => {
  try {
    const { supervisorId, agentId, drawId, period, fromDate, toDate, gainLoss } = req.query;
    let dateFilter = '';
    let params = [];
    let paramIdx = 1;

    // Gestion de la période
    if (period === 'today') {
      dateFilter = `DATE(date) = CURRENT_DATE`;
    } else if (period === 'yesterday') {
      dateFilter = `DATE(date) = CURRENT_DATE - 1`;
    } else if (period === 'week') {
      dateFilter = `date >= CURRENT_DATE - INTERVAL '7 days'`;
    } else if (period === 'month') {
      dateFilter = `date >= CURRENT_DATE - INTERVAL '30 days'`;
    } else if (period === 'custom' && fromDate && toDate) {
      dateFilter = `DATE(date) BETWEEN $${paramIdx} AND $${paramIdx+1}`;
      params.push(fromDate, toDate);
      paramIdx += 2;
    } else {
      dateFilter = `DATE(date) = CURRENT_DATE`; // défaut
    }

    let query = `
      SELECT 
        COUNT(*) as total_tickets,
        COALESCE(SUM(total_amount), 0) as total_bets,
        COALESCE(SUM(win_amount), 0) as total_wins,
        COALESCE(SUM(win_amount) - SUM(total_amount), 0) as net_result,
        COUNT(CASE WHEN win_amount > 0 THEN 1 END) as gain_count,
        COUNT(CASE WHEN win_amount <= 0 THEN 1 END) as loss_count
      FROM tickets t
      WHERE ${dateFilter}
    `;

    if (supervisorId && supervisorId !== 'all') {
      query += ` AND agent_id IN (SELECT id::text FROM agents WHERE supervisor_id = $${paramIdx})`;
      params.push(supervisorId);
      paramIdx++;
    }
    if (agentId && agentId !== 'all') {
      query += ` AND agent_id = $${paramIdx}`;
      params.push(agentId);
      paramIdx++;
    }
    if (drawId && drawId !== 'all') {
      query += ` AND draw_id = $${paramIdx}`;
      params.push(drawId);
      paramIdx++;
    }
    if (gainLoss === 'gain') {
      query += ` AND win_amount > 0`;
    } else if (gainLoss === 'loss') {
      query += ` AND win_amount <= 0`;
    }

    const summaryRes = await pool.query(query, params);
    const summary = summaryRes.rows[0];

    // Détail (par agent ou par tirage)
    let detailQuery = `
      SELECT 
        COALESCE(a.name, 'Inconnu') as agent_name,
        COUNT(*) as tickets,
        COALESCE(SUM(t.total_amount), 0) as bets,
        COALESCE(SUM(t.win_amount), 0) as wins,
        COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as result
      FROM tickets t
      LEFT JOIN agents a ON a.id::text = t.agent_id
      WHERE ${dateFilter}
    `;
    // on réutilise les mêmes paramètres
    if (supervisorId && supervisorId !== 'all') {
      detailQuery += ` AND a.supervisor_id = $${paramIdx}`;
    }
    if (agentId && agentId !== 'all') {
      detailQuery += ` AND t.agent_id = $${paramIdx}`;
    }
    if (drawId && drawId !== 'all') {
      detailQuery += ` AND t.draw_id = $${paramIdx}`;
    }
    detailQuery += ` GROUP BY a.name ORDER BY result DESC`;

    const detailRes = await pool.query(detailQuery, params);

    res.json({
      summary: {
        totalTickets: parseInt(summary.total_tickets) || 0,
        totalBets: parseFloat(summary.total_bets) || 0,
        totalWins: parseFloat(summary.total_wins) || 0,
        netResult: parseFloat(summary.net_result) || 0,
        gainCount: parseInt(summary.gain_count) || 0,
        lossCount: parseInt(summary.loss_count) || 0
      },
      detail: detailRes.rows
    });
  } catch (error) {
    console.error('❌ Erreur /owner/reports:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =====================================================================
// ==================== ROUTES SUPERVISEUR (RESPONSABLE) ===============
// =====================================================================

// ---------------------- Rapports globaux du superviseur ----------------------
app.get('/api/supervisor/reports/overall', async (req, res) => {
  try {
    const supervisorId = req.user.id; // en production, récupéré depuis le token
    // On suppose que le superviseur a un id numérique
    const today = moment().format('YYYY-MM-DD');
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_tickets,
        COALESCE(SUM(t.total_amount), 0) as total_bets,
        COALESCE(SUM(t.win_amount), 0) as total_wins,
        COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as balance
      FROM tickets t
      WHERE t.agent_id IN (SELECT id::text FROM agents WHERE supervisor_id = $1)
        AND DATE(t.date) = $2
    `, [supervisorId, today]);

    const data = result.rows[0];
    res.json({
      totalTickets: parseInt(data.total_tickets) || 0,
      totalBets: parseFloat(data.total_bets) || 0,
      totalWins: parseFloat(data.total_wins) || 0,
      balance: parseFloat(data.balance) || 0
    });
  } catch (error) {
    console.error('❌ Erreur /supervisor/reports/overall:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------------------- Liste des agents du superviseur ----------------------
app.get('/api/supervisor/agents', async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const today = moment().format('YYYY-MM-DD');
    const agents = await pool.query(`
      SELECT a.id, a.name, a.username, a.active as blocked,
             COALESCE(SUM(t.total_amount), 0) as totalBets,
             COALESCE(SUM(t.win_amount), 0) as totalWins,
             COUNT(t.id) as totalTickets,
             COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as balance
      FROM agents a
      LEFT JOIN tickets t ON t.agent_id = a.id::text AND DATE(t.date) = $2
      WHERE a.supervisor_id = $1
      GROUP BY a.id, a.name, a.username, a.active
      ORDER BY a.name
    `, [supervisorId, today]);

    res.json(agents.rows);
  } catch (error) {
    console.error('❌ Erreur /supervisor/agents:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------------------- Bloquer / Débloquer un agent ----------------------
app.post('/api/supervisor/block-agent/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    await pool.query('UPDATE agents SET active = false WHERE id = $1', [agentId]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur block-agent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/supervisor/unblock-agent/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    await pool.query('UPDATE agents SET active = true WHERE id = $1', [agentId]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur unblock-agent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------------------- Tickets récents d'un agent ----------------------
app.get('/api/supervisor/tickets/recent', async (req, res) => {
  try {
    const { agentId } = req.query;
    if (!agentId) return res.status(400).json({ error: 'agentId requis' });
    const tickets = await pool.query(`
      SELECT id, ticket_id, total_amount, date
      FROM tickets
      WHERE agent_id = $1
      ORDER BY date DESC
      LIMIT 20
    `, [agentId]);
    res.json(tickets.rows);
  } catch (error) {
    console.error('❌ Erreur /supervisor/tickets/recent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------------------- Supprimer un ticket (si < 10 min) ----------------------
app.delete('/api/supervisor/tickets/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    // Vérifier que le ticket date de moins de 10 minutes
    const ticket = await pool.query('SELECT date FROM tickets WHERE id = $1', [ticketId]);
    if (ticket.rows.length === 0) return res.status(404).json({ error: 'Ticket non trouvé' });

    const date = new Date(ticket.rows[0].date);
    const now = new Date();
    const diffMinutes = (now - date) / (1000 * 60);
    if (diffMinutes > 10) {
      return res.status(403).json({ error: 'Ticket trop ancien (plus de 10 minutes)' });
    }

    await pool.query('DELETE FROM tickets WHERE id = $1', [ticketId]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur suppression ticket superviseur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =====================================================================
// ==================== ROUTES STATIQUES (inchangées) ==================
// =====================================================================
app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/agent1.html', (req, res) => res.sendFile(path.join(__dirname, 'agent1.html')));
app.get('/responsable.html', (req, res) => res.sendFile(path.join(__dirname, 'responsable.html')));
app.get('/owner.html', (req, res) => res.sendFile(path.join(__dirname, 'owner.html')));

// Route 404 API
app.use('/api/*', (req, res) => {
  console.log(`❌ Route API non trouvée: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Route API non trouvée' });
});

// Route 404 pages
app.use('*', (req, res) => {
  console.log(`❌ Page non trouvée: ${req.originalUrl}`);
  res.status(404).send('Page non trouvée');
});

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error('🔥 Erreur serveur:', err.stack);
  res.status(500).json({ error: 'Erreur serveur interne', message: err.message });
});

// Démarrage
initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur LOTATO démarré sur http://0.0.0.0:${PORT}`);
    console.log(`📊 Health: http://0.0.0.0:${PORT}/api/health`);
    console.log(`👤 Panneau agent: http://0.0.0.0:${PORT}/agent1.html`);
    console.log(`👥 Panneau superviseur: http://0.0.0.0:${PORT}/responsable.html`);
    console.log(`👑 Panneau propriétaire: http://0.0.0.0:${PORT}/owner.html`);
  });
});