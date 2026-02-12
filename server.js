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

// ----------------------------------------------------------------------
// MIDDLEWARE GLOBAUX
// ----------------------------------------------------------------------
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

// ----------------------------------------------------------------------
// CONNEXION POSTGRESQL
// ----------------------------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('connect', () => console.log('✅ Connecté à PostgreSQL'));
pool.on('error', (err) => console.error('❌ Erreur PostgreSQL:', err));

// ----------------------------------------------------------------------
// UTILITAIRES BASE DE DONNÉES
// ----------------------------------------------------------------------
async function columnExists(table, column) {
  const res = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`,
    [table, column]
  );
  return res.rows.length > 0;
}

async function addColumnIfNotExists(table, column, definition) {
  if (!(await columnExists(table, column))) {
    console.log(`➕ Ajout colonne ${table}.${column}...`);
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`✅ Colonne ${table}.${column} ajoutée`);
  }
}

// ----------------------------------------------------------------------
// INITIALISATION COMPLÈTE DE LA BASE DE DONNÉES
// ----------------------------------------------------------------------
async function initializeDatabase() {
  try {
    console.log('🔄 Initialisation de la base de données...');

    // ---------- TABLE UTILISATEURS UNIFIÉE ----------
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('agent', 'supervisor', 'owner')),
        supervisor_id INTEGER REFERENCES users(id),
        zone VARCHAR(100),
        cin VARCHAR(50),
        blocked BOOLEAN DEFAULT false,
        last_active TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await addColumnIfNotExists('users', 'cin', 'VARCHAR(50)');
    await addColumnIfNotExists('users', 'zone', 'VARCHAR(100)');

    // ---------- TIRAGES ----------
    await pool.query(`
      CREATE TABLE IF NOT EXISTS draws (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100),
        time VARCHAR(10),
        frequency VARCHAR(20) DEFAULT 'daily',
        status VARCHAR(20) DEFAULT 'active',
        blocked BOOLEAN DEFAULT false,
        description TEXT,
        min_bet DECIMAL(10,2) DEFAULT 0,
        max_bet DECIMAL(10,2) DEFAULT 0,
        last_draw TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await addColumnIfNotExists('draws', 'blocked', 'BOOLEAN DEFAULT false');

    // ---------- RÉSULTATS DE TIRAGES ----------
    await pool.query(`
      CREATE TABLE IF NOT EXISTS draw_results (
        id SERIAL PRIMARY KEY,
        draw_id VARCHAR(50) REFERENCES draws(id),
        name VARCHAR(100),
        draw_time TIMESTAMP,
        results JSONB NOT NULL,
        lucky_number INTEGER,
        comment TEXT,
        source VARCHAR(50),
        published_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // ---------- NUMÉROS BLOQUÉS GLOBAUX ----------
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blocked_numbers (
        number VARCHAR(2) PRIMARY KEY,
        blocked_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // ---------- NUMÉROS BLOQUÉS PAR TIRAGE ----------
    await pool.query(`
      CREATE TABLE IF NOT EXISTS draw_blocked_numbers (
        draw_id VARCHAR(50) REFERENCES draws(id),
        number VARCHAR(2),
        blocked_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (draw_id, number)
      )
    `);

    // ---------- LIMITES DE MISE PAR NUMÉRO / TIRAGE ----------
    await pool.query(`
      CREATE TABLE IF NOT EXISTS draw_number_limits (
        draw_id VARCHAR(50) REFERENCES draws(id),
        number VARCHAR(2),
        limit_amount DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (draw_id, number)
      )
    `);

    // ---------- TICKETS ----------
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY,
        ticket_id VARCHAR(50) UNIQUE,
        agent_id INTEGER REFERENCES users(id),
        agent_name VARCHAR(100),
        draw_id VARCHAR(50) REFERENCES draws(id),
        draw_name VARCHAR(100),
        bets JSONB NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        win_amount DECIMAL(10,2) DEFAULT 0,
        paid BOOLEAN DEFAULT false,
        checked BOOLEAN DEFAULT false,
        date TIMESTAMP DEFAULT NOW()
      )
    `);

    // ---------- PAIEMENTS ----------
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER REFERENCES tickets(id),
        amount DECIMAL(10,2),
        paid_at TIMESTAMP DEFAULT NOW(),
        confirmed_by INTEGER REFERENCES users(id)
      )
    `);

    // ---------- JOURNAL D'ACTIVITÉ ----------
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        user_role VARCHAR(20),
        action VARCHAR(100),
        details TEXT,
        ip_address VARCHAR(45),
        user_agent TEXT,
        timestamp TIMESTAMP DEFAULT NOW()
      )
    `);

    // ---------- CONFIGURATION LOTERIE ----------
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lottery_config (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        logo TEXT,
        address TEXT,
        phone VARCHAR(20),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('✅ Tables créées / vérifiées');

    // ---------- DONNÉES PAR DÉFAUT ----------
    
    // Créer un propriétaire par défaut si aucun utilisateur n'existe
    const userCount = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(userCount.rows[0].count) === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await pool.query(
        `INSERT INTO users (username, password, name, role, blocked) VALUES ($1, $2, $3, $4, $5)`,
        ['admin', hashedPassword, 'Administrateur', 'owner', false]
      );
      console.log('👑 Compte propriétaire créé (admin / admin123)');
      
      // Créer un superviseur de test
      const supPass = await bcrypt.hash('super123', 10);
      const sup = await pool.query(
        `INSERT INTO users (username, password, name, role, blocked) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        ['supervisor1', supPass, 'Superviseur Test', 'supervisor', false]
      );
      const supId = sup.rows[0].id;
      
      // Créer un agent de test lié à ce superviseur
      const agentPass = await bcrypt.hash('agent123', 10);
      await pool.query(
        `INSERT INTO users (username, password, name, role, supervisor_id, zone, blocked) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ['agent01', agentPass, 'Agent Test', 'agent', supId, 'Port-au-Prince', false]
      );
      console.log('👤 Comptes de test créés (superviseur/super123, agent/agent123)');
    }

    // Tirages par défaut
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
        `INSERT INTO draws (id, name, time, active, blocked) VALUES ($1, $2, $3, true, false)
         ON CONFLICT (id) DO NOTHING`,
        [d.id, d.name, d.time]
      );
    }

    // Configuration loterie par défaut
    const cfg = await pool.query('SELECT COUNT(*) FROM lottery_config');
    if (parseInt(cfg.rows[0].count) === 0) {
      await pool.query(
        `INSERT INTO lottery_config (name, logo, address, phone) VALUES ($1, $2, $3, $4)`,
        ['LOTATO PRO', '', '', '']
      );
    }

    console.log('✅ Base de données initialisée avec succès');
  } catch (error) {
    console.error('❌ Erreur initialisation BDD:', error.message);
    throw error;
  }
}

// ----------------------------------------------------------------------
// JWT & MIDDLEWARE D'AUTHENTIFICATION
// ----------------------------------------------------------------------
const JWT_SECRET = process.env.JWT_SECRET || 'lotato-secret-key-change-in-production';
const TOKEN_EXPIRY = '24h';

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Vérifier que l'utilisateur existe toujours et n'est pas bloqué
    const user = await pool.query(
      'SELECT id, username, name, role, blocked FROM users WHERE id = $1',
      [decoded.id]
    );
    if (user.rows.length === 0 || user.rows[0].blocked) {
      return res.status(403).json({ error: 'Utilisateur inexistant ou bloqué' });
    }
    req.user = user.rows[0];
    // Mettre à jour last_active
    await pool.query('UPDATE users SET last_active = NOW() WHERE id = $1', [req.user.id]);
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token invalide ou expiré' });
  }
}

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
// ROUTES PUBLIQUES / AUTH
// ----------------------------------------------------------------------
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({ status: 'OK', timestamp: new Date().toISOString(), database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    console.log(`🔑 Tentative de connexion: ${username} (${role})`);

    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND role = $2',
      [username, role]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    if (user.blocked) {
      return res.status(403).json({ error: 'Compte bloqué' });
    }

    const token = generateToken(user);
    
    // Journalisation
    await pool.query(
      `INSERT INTO activity_log (user_id, user_role, action, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, user.role, 'LOGIN', 'Connexion réussie', req.ip, req.headers['user-agent']]
    );

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

app.post('/api/auth/refresh', authenticateToken, (req, res) => {
  const newToken = generateToken(req.user);
  res.json({ success: true, token: newToken });
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  await pool.query(
    `INSERT INTO activity_log (user_id, user_role, action, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [req.user.id, req.user.role, 'LOGOUT', req.ip, req.headers['user-agent']]
  );
  res.json({ success: true, message: 'Déconnecté avec succès' });
});

app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// ----------------------------------------------------------------------
// ROUTES TICKETS (existantes adaptées)
// ----------------------------------------------------------------------
app.post('/api/tickets/save', authenticateToken, requireRole('agent', 'supervisor'), async (req, res) => {
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

app.get('/api/tickets', authenticateToken, async (req, res) => {
  try {
    const { agentId } = req.query;
    let query = 'SELECT * FROM tickets WHERE 1=1';
    const params = [];
    if (agentId) {
      params.push(parseInt(agentId));
      query += ` AND agent_id = $${params.length}`;
    }
    // Si superviseur, voir les tickets de ses agents ?
    if (req.user.role === 'supervisor') {
      const agents = await pool.query('SELECT id FROM users WHERE supervisor_id = $1', [req.user.id]);
      const ids = agents.rows.map(a => a.id);
      if (ids.length > 0) {
        query += ` AND agent_id = ANY($${params.length + 1}::int[])`;
        params.push(ids);
      }
    }
    query += ' ORDER BY date DESC LIMIT 50';
    const result = await pool.query(query, params);
    res.json({ tickets: result.rows });
  } catch (error) {
    console.error('❌ Erreur tickets:', error);
    res.json({ tickets: [] });
  }
});

app.delete('/api/tickets/delete/:ticketId', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM tickets WHERE id = $1', [parseInt(req.params.ticketId)]);
    res.json({ success: true, message: 'Ticket supprimé' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Vérification gains (simplifiée)
app.post('/api/tickets/check-winners', authenticateToken, async (req, res) => {
  try {
    const { agentId } = req.query;
    let query = 'SELECT * FROM tickets WHERE win_amount > 0 AND checked = false';
    const params = [];
    if (agentId) {
      params.push(parseInt(agentId));
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

app.get('/api/winners', authenticateToken, async (req, res) => {
  try {
    const { agentId } = req.query;
    let query = 'SELECT * FROM tickets WHERE win_amount > 0';
    const params = [];
    if (agentId) {
      params.push(parseInt(agentId));
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

app.post('/api/lottery-config', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const { name, logo, address, phone } = req.body;
    const exists = await pool.query('SELECT id FROM lottery_config LIMIT 1');
    if (exists.rows.length === 0) {
      await pool.query(
        'INSERT INTO lottery_config (name, logo, address, phone) VALUES ($1,$2,$3,$4)',
        [name, logo, address, phone]
      );
    } else {
      await pool.query(
        'UPDATE lottery_config SET name=$1, logo=$2, address=$3, phone=$4, updated_at=NOW()',
        [name, logo, address, phone]
      );
    }
    res.json({ success: true, message: 'Configuration sauvegardée' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------------------------
// ROUTES PROPRIÉTAIRE (OWNER)
// ----------------------------------------------------------------------

// Middleware spécifique propriétaire
app.use('/api/owner', authenticateToken, requireRole('owner'));

// --- Tableau de bord ---
app.get('/api/owner/dashboard', async (req, res) => {
  try {
    // Connexions (simulées via last_active dans les 5 dernières minutes)
    const activeThreshold = moment().subtract(5, 'minutes').toDate();
    const connectedSup = await pool.query(
      `SELECT id, name, username FROM users WHERE role='supervisor' AND last_active > $1`,
      [activeThreshold]
    );
    const connectedAgents = await pool.query(
      `SELECT id, name, username FROM users WHERE role='agent' AND last_active > $1`,
      [activeThreshold]
    );

    // Ventes du jour
    const sales = await pool.query(
      `SELECT COALESCE(SUM(total_amount),0) as total FROM tickets WHERE DATE(date) = CURRENT_DATE`
    );

    // Progression des limites (draw_number_limits)
    const limitsProgress = await pool.query(`
      SELECT 
        d.name as draw_name,
        dnl.number,
        dnl.limit_amount,
        COALESCE((
          SELECT SUM((bet->>'amount')::float) 
          FROM tickets, jsonb_array_elements(tickets.bets) AS bet
          WHERE tickets.draw_id = dnl.draw_id 
            AND bet->>'number' = dnl.number
            AND DATE(tickets.date) = CURRENT_DATE
        ), 0) as current_bets,
        CASE 
          WHEN dnl.limit_amount > 0 
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

    // Gains / pertes des agents aujourd'hui
    const agentsGainLoss = await pool.query(`
      SELECT 
        u.id,
        u.name,
        COALESCE(SUM(t.total_amount),0) as total_bets,
        COALESCE(SUM(t.win_amount),0) as total_wins,
        COALESCE(SUM(t.win_amount) - SUM(t.total_amount),0) as net_result
      FROM users u
      LEFT JOIN tickets t ON u.id = t.agent_id AND DATE(t.date) = CURRENT_DATE
      WHERE u.role = 'agent'
      GROUP BY u.id, u.name
      HAVING COALESCE(SUM(t.total_amount),0) > 0 OR COALESCE(SUM(t.win_amount),0) > 0
      ORDER BY net_result DESC
    `);

    res.json({
      connected: {
        supervisors_count: connectedSup.rows.length,
        supervisors: connectedSup.rows,
        agents_count: connectedAgents.rows.length,
        agents: connectedAgents.rows
      },
      sales_today: parseFloat(sales.rows[0].total),
      limits_progress: limitsProgress.rows,
      agents_gain_loss: agentsGainLoss.rows
    });
  } catch (error) {
    console.error('❌ Dashboard owner:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Gestion utilisateurs ---
app.get('/api/owner/supervisors', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, username, blocked FROM users WHERE role = 'supervisor' ORDER BY name`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/owner/agents', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.username, u.blocked, u.zone, 
             s.name as supervisor_name, u.supervisor_id
      FROM users u
      LEFT JOIN users s ON u.supervisor_id = s.id
      WHERE u.role = 'agent'
      ORDER BY u.name
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/owner/create-user', async (req, res) => {
  try {
    const { name, cin, username, password, role, supervisorId, zone } = req.body;
    if (!name || !username || !password || !role) {
      return res.status(400).json({ success: false, error: 'Champs obligatoires manquants' });
    }
    // Vérifier unicité
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Nom d\'utilisateur déjà pris' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, cin, username, password, role, supervisor_id, zone, blocked)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false) RETURNING id`,
      [name, cin || null, username, hashedPassword, role, supervisorId || null, zone || null]
    );
    res.json({ success: true, userId: result.rows[0].id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/owner/block-user', async (req, res) => {
  try {
    const { userId, type } = req.body; // type non utilisé, on se base sur l'ID
    const user = await pool.query('SELECT blocked FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) return res.status(404).json({ error: 'Utilisateur inconnu' });
    const newBlocked = !user.rows[0].blocked;
    await pool.query('UPDATE users SET blocked = $1 WHERE id = $2', [newBlocked, userId]);
    res.json({ success: true, blocked: newBlocked });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/owner/change-supervisor', async (req, res) => {
  try {
    const { agentId, supervisorId } = req.body;
    await pool.query('UPDATE users SET supervisor_id = $1 WHERE id = $2 AND role = $3',
      [supervisorId || null, agentId, 'agent']);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Tirages ---
app.get('/api/owner/draws', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, time, blocked FROM draws ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/owner/publish-results', async (req, res) => {
  try {
    const { drawId, numbers } = req.body;
    if (!drawId || !numbers || numbers.length !== 3) {
      return res.status(400).json({ success: false, error: 'Données incomplètes' });
    }
    const draw = await pool.query('SELECT name FROM draws WHERE id = $1', [drawId]);
    if (draw.rows.length === 0) return res.status(404).json({ error: 'Tirage inconnu' });
    await pool.query(
      `INSERT INTO draw_results (draw_id, name, draw_time, results, published_at)
       VALUES ($1, $2, NOW(), $3, NOW())`,
      [drawId, draw.rows[0].name, JSON.stringify(numbers)]
    );
    // TODO: calculer les gains des tickets correspondants (peut être fait en tâche de fond)
    res.json({ success: true, message: 'Résultats publiés' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/owner/block-draw', async (req, res) => {
  try {
    const { drawId, block } = req.body;
    await pool.query('UPDATE draws SET blocked = $1 WHERE id = $2', [block, drawId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Numéros bloqués ---
app.get('/api/owner/blocked-numbers', async (req, res) => {
  try {
    const global = await pool.query('SELECT number FROM blocked_numbers');
    res.json({ blockedNumbers: global.rows.map(r => r.number) });
  } catch (error) {
    res.json({ blockedNumbers: [] });
  }
});

app.post('/api/owner/block-number', async (req, res) => {
  try {
    const { number } = req.body;
    await pool.query('INSERT INTO blocked_numbers (number) VALUES ($1) ON CONFLICT DO NOTHING', [number]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/owner/unblock-number', async (req, res) => {
  try {
    const { number } = req.body;
    await pool.query('DELETE FROM blocked_numbers WHERE number = $1', [number]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/owner/block-number-draw', async (req, res) => {
  try {
    const { drawId, number } = req.body;
    await pool.query(
      'INSERT INTO draw_blocked_numbers (draw_id, number) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [drawId, number]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/owner/unblock-number-draw', async (req, res) => {
  try {
    const { drawId, number } = req.body;
    await pool.query('DELETE FROM draw_blocked_numbers WHERE draw_id = $1 AND number = $2', [drawId, number]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Limites par numéro / tirage ---
app.post('/api/owner/number-limit', async (req, res) => {
  try {
    const { drawId, number, limitAmount } = req.body;
    await pool.query(
      `INSERT INTO draw_number_limits (draw_id, number, limit_amount) 
       VALUES ($1, $2, $3)
       ON CONFLICT (draw_id, number) 
       DO UPDATE SET limit_amount = $3, updated_at = NOW()`,
      [drawId, number, limitAmount]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Rapports ---
app.get('/api/owner/reports', async (req, res) => {
  try {
    const { supervisorId, agentId, drawId, period, fromDate, toDate, gainLoss } = req.query;

    // Construction de la plage de dates
    let startDate, endDate;
    const today = moment().startOf('day');
    if (period === 'today') {
      startDate = today.toDate();
      endDate = moment(today).endOf('day').toDate();
    } else if (period === 'yesterday') {
      startDate = moment(today).subtract(1, 'day').startOf('day').toDate();
      endDate = moment(today).subtract(1, 'day').endOf('day').toDate();
    } else if (period === 'week') {
      startDate = moment(today).startOf('week').toDate();
      endDate = moment(today).endOf('week').toDate();
    } else if (period === 'month') {
      startDate = moment(today).startOf('month').toDate();
      endDate = moment(today).endOf('month').toDate();
    } else if (period === 'custom' && fromDate && toDate) {
      startDate = moment(fromDate).startOf('day').toDate();
      endDate = moment(toDate).endOf('day').toDate();
    } else {
      startDate = today.toDate();
      endDate = moment(today).endOf('day').toDate();
    }

    // Construction de la requête SQL
    let sql = `
      SELECT 
        t.draw_name,
        u.name as agent_name,
        COUNT(*) as tickets,
        COALESCE(SUM(t.total_amount),0) as bets,
        COALESCE(SUM(t.win_amount),0) as wins
      FROM tickets t
      JOIN users u ON t.agent_id = u.id
      WHERE t.date BETWEEN $1 AND $2
    `;
    const params = [startDate, endDate];
    let paramIndex = 3;

    if (supervisorId && supervisorId !== 'all') {
      sql += ` AND u.supervisor_id = $${paramIndex++}`;
      params.push(supervisorId);
    }
    if (agentId && agentId !== 'all') {
      sql += ` AND t.agent_id = $${paramIndex++}`;
      params.push(parseInt(agentId));
    }
    if (drawId && drawId !== 'all') {
      sql += ` AND t.draw_id = $${paramIndex++}`;
      params.push(drawId);
    }

    sql += ` GROUP BY t.draw_name, u.name`;

    const result = await pool.query(sql, params);
    const detail = result.rows;

    // Calcul des totaux
    let totalTickets = 0, totalBets = 0, totalWins = 0, gainCount = 0, lossCount = 0;
    detail.forEach(row => {
      totalTickets += parseInt(row.tickets);
      totalBets += parseFloat(row.bets);
      totalWins += parseFloat(row.wins);
      const net = row.wins - row.bets;
      if (net > 0) gainCount++;
      else if (net < 0) lossCount++;
    });
    const netResult = totalWins - totalBets;

    // Filtre gain/perte si demandé
    let filteredDetail = detail;
    if (gainLoss === 'gain') filteredDetail = detail.filter(d => (d.wins - d.bets) > 0);
    if (gainLoss === 'loss') filteredDetail = detail.filter(d => (d.wins - d.bets) < 0);

    res.json({
      summary: {
        totalTickets,
        totalBets,
        totalWins,
        netResult,
        gainCount,
        lossCount
      },
      detail: filteredDetail
    });
  } catch (error) {
    console.error('❌ Rapport owner:', error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------------------------
// SERVEUR STATIQUE (HTML, CSS, JS)
// ----------------------------------------------------------------------
app.use(express.static(__dirname));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/agent1.html', (req, res) => res.sendFile(path.join(__dirname, 'agent1.html')));
app.get('/responsable.html', (req, res) => res.sendFile(path.join(__dirname, 'responsable.html')));
app.get('/owner.html', (req, res) => res.sendFile(path.join(__dirname, 'owner.html')));

// ----------------------------------------------------------------------
// GESTION DES ERREURS 404
// ----------------------------------------------------------------------
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Route API non trouvée' });
});

app.use('*', (req, res) => {
  res.status(404).send('Page non trouvée');
});

// ----------------------------------------------------------------------
// GESTION DES ERREURS GÉNÉRALES
// ----------------------------------------------------------------------
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
    console.log(`👤 Panneau propriétaire: http://0.0.0.0:${PORT}/owner.html`);
  });
});