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

// ---------- Middleware ----------
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

// ---------- Connexion PostgreSQL ----------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('connect', () => console.log('✅ Connecté à PostgreSQL'));
pool.on('error', (err) => console.error('❌ Erreur PostgreSQL:', err));

// ---------- Fonctions utilitaires pour schéma ----------
async function columnExists(tableName, columnName) {
  const res = await pool.query(
    `SELECT column_name FROM information_schema.columns 
     WHERE table_name = $1 AND column_name = $2`,
    [tableName, columnName]
  );
  return res.rows.length > 0;
}

async function addColumnIfNotExists(tableName, columnName, columnDefinition) {
  if (!(await columnExists(tableName, columnName))) {
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
    console.log(`➕ Colonne ${tableName}.${columnName} ajoutée`);
  }
}

// ---------- INITIALISATION COMPLÈTE DE LA BASE ----------
async function initializeDatabase() {
  try {
    console.log('🔄 Initialisation de la base de données...');

    // ---- Tables principales ----
    await pool.query(`
      CREATE TABLE IF NOT EXISTS draws (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100),
        time VARCHAR(10),
        frequency VARCHAR(20) DEFAULT 'daily',
        status VARCHAR(20) DEFAULT 'active',
        active BOOLEAN DEFAULT true,
        description TEXT,
        min_bet DECIMAL(10,2) DEFAULT 0,
        max_bet DECIMAL(10,2) DEFAULT 0,
        last_draw TIMESTAMP
      )
    `);
    await addColumnIfNotExists('draws', 'blocked', 'BOOLEAN DEFAULT false');
    await addColumnIfNotExists('draws', 'created_at', 'TIMESTAMP DEFAULT NOW()');
    await addColumnIfNotExists('draws', 'updated_at', 'TIMESTAMP DEFAULT NOW()');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS supervisors (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        username VARCHAR(50) UNIQUE,
        email VARCHAR(100) UNIQUE,
        phone VARCHAR(20),
        password VARCHAR(255),
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await addColumnIfNotExists('supervisors', 'blocked', 'BOOLEAN DEFAULT false');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        username VARCHAR(50) UNIQUE,
        email VARCHAR(100) UNIQUE,
        phone VARCHAR(20),
        password VARCHAR(255),
        supervisor_id INTEGER REFERENCES supervisors(id),
        location VARCHAR(100),
        commission DECIMAL(5,2) DEFAULT 5.00,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await addColumnIfNotExists('agents', 'blocked', 'BOOLEAN DEFAULT false');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY,
        ticket_id VARCHAR(50),
        agent_id VARCHAR(50),
        agent_name VARCHAR(100),
        draw_id VARCHAR(50),
        draw_name VARCHAR(100),
        bets JSONB,
        total_amount DECIMAL(10,2),
        win_amount DECIMAL(10,2) DEFAULT 0,
        paid BOOLEAN DEFAULT false,
        date TIMESTAMP DEFAULT NOW(),
        checked BOOLEAN DEFAULT false
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS draw_results (
        id SERIAL PRIMARY KEY,
        draw_id VARCHAR(50),
        name VARCHAR(100),
        draw_time TIMESTAMP,
        results JSONB,
        lucky_number INTEGER,
        comment TEXT,
        source VARCHAR(50),
        published_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // ---- Blocage / limites ----
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blocked_numbers (
        number VARCHAR(2) PRIMARY KEY,
        blocked_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Blocage par tirage spécifique
    await pool.query(`
      CREATE TABLE IF NOT EXISTS draw_blocked_numbers (
        draw_id VARCHAR(50) REFERENCES draws(id) ON DELETE CASCADE,
        number VARCHAR(2),
        PRIMARY KEY (draw_id, number),
        blocked_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Limite de mise par (tirage, numéro)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS number_limits (
        draw_id VARCHAR(50) REFERENCES draws(id) ON DELETE CASCADE,
        number VARCHAR(2),
        limit_amount DECIMAL(10,2) NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (draw_id, number)
      )
    `);

    // ---- Autres tables ----
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lottery_config (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        logo TEXT,
        address TEXT,
        phone VARCHAR(20)
      )
    `);
    await addColumnIfNotExists('lottery_config', 'updated_at', 'TIMESTAMP DEFAULT NOW()');

    // ---- Insertion des tirages par défaut ----
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
      const exists = await pool.query('SELECT id FROM draws WHERE id = $1', [d.id]);
      if (exists.rows.length === 0) {
        await pool.query(
          `INSERT INTO draws (id, name, time, active, blocked) VALUES ($1, $2, $3, true, false)`,
          [d.id, d.name, d.time]
        );
        console.log(`➕ Tirage ${d.name} ajouté`);
      }
    }

    // ---- Configuration par défaut ----
    const cfg = await pool.query('SELECT id FROM lottery_config LIMIT 1');
    if (cfg.rows.length === 0) {
      await pool.query(
        `INSERT INTO lottery_config (name, logo, address, phone) 
         VALUES ('LOTATO PRO', '', '', '')`
      );
    }

    console.log('✅ Base de données initialisée');
  } catch (err) {
    console.error('❌ Erreur init DB:', err.message);
  }
}

// ---------- AUTHENTIFICATION JWT RÉELLE ----------
const JWT_SECRET = process.env.JWT_SECRET || 'lotato-pro-secret-key-change-in-production';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// Middleware d'authentification stricte
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalide ou expiré' });
    }
    req.user = user;
    next();
  });
};

// Middleware de vérification du rôle propriétaire
const requireOwner = (req, res, next) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Accès réservé au propriétaire' });
  }
  next();
};

// Routes publiques (sans token)
const publicRoutes = [
  '/api/health',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/lottery-config',
  '/api/blocked-numbers'
];

// ---------- ROUTES PUBLIQUES ----------
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', error: err.message });
  }
});

// LOGIN avec vérification BDD
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    console.log(`🔑 Tentative login: ${username} (${role})`);

    // --- Propriétaire (hardcodé, mais on peut le mettre en BDD si souhaité) ---
    if (role === 'owner') {
      if (username === 'admin' && password === 'admin123') {
        const token = generateToken({
          id: 'owner-01',
          username: 'admin',
          role: 'owner',
          name: 'Administrateur'
        });
        return res.json({
          success: true,
          token,
          name: 'Administrateur',
          role: 'owner',
          ownerId: 'owner-01'
        });
      }
      return res.status(401).json({ error: 'Identifiants propriétaire incorrects' });
    }

    // --- Superviseur ---
    if (role === 'supervisor') {
      const result = await pool.query(
        'SELECT id, name, username, password, blocked FROM supervisors WHERE username = $1 OR email = $1',
        [username]
      );
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Superviseur introuvable' });
      }
      const supervisor = result.rows[0];
      if (supervisor.blocked) {
        return res.status(403).json({ error: 'Compte superviseur bloqué' });
      }
      const valid = await bcrypt.compare(password, supervisor.password);
      if (!valid) {
        return res.status(401).json({ error: 'Mot de passe incorrect' });
      }
      const token = generateToken({
        id: supervisor.id.toString(),
        username: supervisor.username,
        role: 'supervisor',
        name: supervisor.name
      });
      return res.json({
        success: true,
        token,
        name: supervisor.name,
        role: 'supervisor',
        supervisorId: supervisor.id
      });
    }

    // --- Agent ---
    if (role === 'agent') {
      const result = await pool.query(
        'SELECT id, name, username, password, blocked FROM agents WHERE username = $1 OR email = $1',
        [username]
      );
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Agent introuvable' });
      }
      const agent = result.rows[0];
      if (agent.blocked) {
        return res.status(403).json({ error: 'Compte agent bloqué' });
      }
      const valid = await bcrypt.compare(password, agent.password);
      if (!valid) {
        return res.status(401).json({ error: 'Mot de passe incorrect' });
      }
      const token = generateToken({
        id: agent.id.toString(),
        username: agent.username,
        role: 'agent',
        name: agent.name
      });
      return res.json({
        success: true,
        token,
        name: agent.name,
        role: 'agent',
        agentId: agent.id
      });
    }

    return res.status(400).json({ error: 'Rôle invalide' });
  } catch (err) {
    console.error('❌ Erreur login:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Rafraîchir token
app.post('/api/auth/refresh', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token requis' });
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Token invalide' });
    const newToken = generateToken({
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
      name: decoded.name
    });
    res.json({ success: true, token: newToken });
  });
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true, message: 'Déconnecté' });
});

// ---------- MIDDLEWARE APPLIQUÉ À /API SAUF ROUTES PUBLIQUES ----------
app.use('/api', (req, res, next) => {
  if (publicRoutes.includes(req.path)) return next();
  authenticateToken(req, res, next);
});

// ---------- ROUTES TICKETS (inchangées, avec vérifications) ----------
app.post('/api/tickets/save', async (req, res) => {
  try {
    const { agentId, agentName, drawId, drawName, bets, total } = req.body;

    // Vérifier tirage bloqué
    const drawCheck = await pool.query('SELECT blocked FROM draws WHERE id = $1', [drawId]);
    if (drawCheck.rows.length && drawCheck.rows[0].blocked) {
      return res.status(403).json({ error: 'Ce tirage est bloqué par l’administrateur' });
    }

    // Vérifier agent bloqué
    const agentCheck = await pool.query('SELECT blocked FROM agents WHERE id = $1', [agentId]);
    if (agentCheck.rows.length && agentCheck.rows[0].blocked) {
      return res.status(403).json({ error: 'Votre compte agent est bloqué' });
    }

    // Vérifier numéros bloqués globalement
    const blockedGlobal = await pool.query('SELECT number FROM blocked_numbers');
    const blockedSet = new Set(blockedGlobal.rows.map(r => r.number));

    // Vérifier numéros bloqués pour ce tirage
    const blockedDraw = await pool.query(
      'SELECT number FROM draw_blocked_numbers WHERE draw_id = $1',
      [drawId]
    );
    const blockedDrawSet = new Set(blockedDraw.rows.map(r => r.number));

    for (const bet of bets) {
      const num = bet.cleanNumber || bet.number;
      if (bet.game === 'borlette' && num.length === 2) {
        if (blockedSet.has(num)) {
          return res.status(403).json({ error: `Le numéro ${num} est bloqué globalement` });
        }
        if (blockedDrawSet.has(num)) {
          return res.status(403).json({ error: `Le numéro ${num} est bloqué pour ce tirage` });
        }
      }
    }

    // Vérifier les limites par numéro pour ce tirage
    const limits = await pool.query(
      'SELECT number, limit_amount FROM number_limits WHERE draw_id = $1',
      [drawId]
    );
    for (const limit of limits.rows) {
      const totalPlayed = await pool.query(
        `SELECT COALESCE(SUM((bet->>'amount')::numeric), 0) as total
         FROM tickets, jsonb_array_elements(bets) AS bet
         WHERE draw_id = $1 AND bet->>'cleanNumber' = $2`,
        [drawId, limit.number]
      );
      const currentTotal = parseFloat(totalPlayed.rows[0].total);
      const betAmount = bets
        .filter(b => (b.cleanNumber || b.number) === limit.number)
        .reduce((sum, b) => sum + parseFloat(b.amount || 0), 0);
      if (currentTotal + betAmount > parseFloat(limit.limit_amount)) {
        return res.status(403).json({
          error: `Limite de ${limit.limit_amount} G dépassée pour le numéro ${limit.number}`
        });
      }
    }

    // Sauvegarde du ticket
    const ticketId = `T${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const betsJson = JSON.stringify(bets);
    const result = await pool.query(
      `INSERT INTO tickets (ticket_id, agent_id, agent_name, draw_id, draw_name, bets, total_amount, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [ticketId, agentId, agentName, drawId, drawName, betsJson, parseFloat(total)]
    );

    res.json({ success: true, ticket: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Récupération des tickets (agent)
app.get('/api/tickets', async (req, res) => {
  try {
    const { agentId } = req.query;
    let query = 'SELECT * FROM tickets';
    const params = [];
    if (agentId) {
      params.push(agentId);
      query += ' WHERE agent_id = $1';
    }
    query += ' ORDER BY date DESC LIMIT 50';
    const result = await pool.query(query, params);
    res.json({ tickets: result.rows.map(t => ({ ...t, bets: JSON.parse(t.bets) })) });
  } catch (err) {
    res.json({ tickets: [] });
  }
});

// Supprimer un ticket (agent/superviseur)
app.delete('/api/tickets/delete/:ticketId', async (req, res) => {
  try {
    await pool.query('DELETE FROM tickets WHERE id = $1', [req.params.ticketId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- ROUTES PROPRIÉTAIRE (avec requireOwner) ----------

// --- Gestion des superviseurs ---
app.get('/api/owner/supervisors', requireOwner, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, username, email, phone, blocked FROM supervisors ORDER BY name'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Gestion des agents ---
app.get('/api/owner/agents', requireOwner, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.id, a.name, a.username, a.email, a.phone, a.blocked, 
             a.supervisor_id, s.name as supervisor_name
      FROM agents a
      LEFT JOIN supervisors s ON s.id = a.supervisor_id
      ORDER BY a.name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Création d'utilisateur (agent/superviseur) ---
app.post('/api/owner/create-user', requireOwner, async (req, res) => {
  try {
    const { name, cin, username, password, role, supervisorId, zone } = req.body;
    if (!name || !username || !password) {
      return res.status(400).json({ error: 'Nom, identifiant et mot de passe requis' });
    }

    const hashed = await bcrypt.hash(password, 10);

    if (role === 'supervisor') {
      // Vérifier unicité du username
      const exist = await pool.query(
        'SELECT id FROM supervisors WHERE username = $1 OR email = $1',
        [username]
      );
      if (exist.rows.length > 0) {
        return res.status(400).json({ error: 'Cet identifiant est déjà utilisé' });
      }
      await pool.query(
        `INSERT INTO supervisors (name, username, email, phone, password, active, blocked)
         VALUES ($1, $2, $3, $4, $5, true, false)`,
        [name, username, username, cin || '', hashed]
      );
    } else if (role === 'agent') {
      const exist = await pool.query(
        'SELECT id FROM agents WHERE username = $1 OR email = $1',
        [username]
      );
      if (exist.rows.length > 0) {
        return res.status(400).json({ error: 'Cet identifiant est déjà utilisé' });
      }
      await pool.query(
        `INSERT INTO agents (name, username, email, phone, password, supervisor_id, location, active, blocked)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, false)`,
        [name, username, username, cin || '', hashed, supervisorId || null, zone || '']
      );
    } else {
      return res.status(400).json({ error: 'Rôle invalide' });
    }

    res.json({ success: true, message: 'Utilisateur créé avec succès' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- Changer superviseur d'un agent ---
app.put('/api/owner/change-supervisor', requireOwner, async (req, res) => {
  try {
    const { agentId, supervisorId } = req.body;
    await pool.query(
      'UPDATE agents SET supervisor_id = $1 WHERE id = $2',
      [supervisorId || null, agentId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Bloquer / débloquer un utilisateur ---
app.post('/api/owner/block-user', requireOwner, async (req, res) => {
  try {
    const { userId, type } = req.body;
    const table = type === 'agent' ? 'agents' : 'supervisors';
    await pool.query(
      `UPDATE ${table} SET blocked = NOT blocked WHERE id = $1`,
      [userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Tirages (liste) ---
app.get('/api/owner/draws', requireOwner, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, time, blocked FROM draws ORDER BY time'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Publier les résultats manuellement ---
app.post('/api/owner/publish-results', requireOwner, async (req, res) => {
  try {
    const { drawId, numbers } = req.body;
    const draw = await pool.query('SELECT name FROM draws WHERE id = $1', [drawId]);
    if (draw.rows.length === 0) {
      return res.status(404).json({ error: 'Tirage inconnu' });
    }
    await pool.query(
      `INSERT INTO draw_results (draw_id, name, draw_time, results, published_at)
       VALUES ($1, $2, NOW(), $3, NOW())`,
      [drawId, draw.rows[0].name, JSON.stringify(numbers)]
    );
    // Ici, on pourrait déclencher le calcul automatique des gains
    res.json({ success: true, message: 'Résultats publiés' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Bloquer / débloquer un tirage entier ---
app.post('/api/owner/block-draw', requireOwner, async (req, res) => {
  try {
    const { drawId, block } = req.body;
    await pool.query('UPDATE draws SET blocked = $1 WHERE id = $2', [block, drawId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Gestion des numéros bloqués GLOBAUX ---
app.get('/api/owner/blocked-numbers', requireOwner, async (req, res) => {
  try {
    const result = await pool.query('SELECT number FROM blocked_numbers');
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/owner/block-number', requireOwner, async (req, res) => {
  try {
    const { number } = req.body;
    await pool.query(
      'INSERT INTO blocked_numbers (number) VALUES ($1) ON CONFLICT DO NOTHING',
      [number.padStart(2, '0')]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/owner/unblock-number', requireOwner, async (req, res) => {
  try {
    const { number } = req.body;
    await pool.query('DELETE FROM blocked_numbers WHERE number = $1', [number.padStart(2, '0')]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Gestion des numéros bloqués PAR TIRAGE ---
app.post('/api/owner/block-number-draw', requireOwner, async (req, res) => {
  try {
    const { drawId, number } = req.body;
    await pool.query(
      `INSERT INTO draw_blocked_numbers (draw_id, number) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [drawId, number.padStart(2, '0')]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/owner/unblock-number-draw', requireOwner, async (req, res) => {
  try {
    const { drawId, number } = req.body;
    await pool.query(
      'DELETE FROM draw_blocked_numbers WHERE draw_id = $1 AND number = $2',
      [drawId, number.padStart(2, '0')]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Fixer une limite de mise pour un (tirage, numéro) ---
app.post('/api/owner/number-limit', requireOwner, async (req, res) => {
  try {
    const { drawId, number, limitAmount } = req.body;
    await pool.query(
      `INSERT INTO number_limits (draw_id, number, limit_amount, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (draw_id, number) DO UPDATE
       SET limit_amount = EXCLUDED.limit_amount, updated_at = NOW()`,
      [drawId, number.padStart(2, '0'), parseFloat(limitAmount)]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- RAPPORTS ÉVOLUÉS (propriétaire) ---
app.get('/api/owner/reports', requireOwner, async (req, res) => {
  try {
    const {
      supervisorId, agentId, drawId, period,
      fromDate, toDate, gainLoss // 'gain' ou 'loss' ou ''
    } = req.query;

    // Construction de la condition de date
    let dateCondition = '';
    if (period === 'today') dateCondition = "DATE(date) = CURRENT_DATE";
    else if (period === 'yesterday') dateCondition = "DATE(date) = CURRENT_DATE - 1";
    else if (period === 'week') dateCondition = "date >= date_trunc('week', CURRENT_DATE)";
    else if (period === 'month') dateCondition = "date >= date_trunc('month', CURRENT_DATE)";
    else if (period === 'custom' && fromDate && toDate) {
      dateCondition = `DATE(date) BETWEEN '${fromDate}' AND '${toDate}'`;
    } else dateCondition = '1=1';

    // Jointures et filtres
    let joinTables = '';
    let whereClause = `WHERE ${dateCondition}`;
    const params = [];
    let paramIndex = 1;

    if (supervisorId && supervisorId !== 'all') {
      joinTables += ' JOIN agents a ON a.id = t.agent_id::integer';
      whereClause += ` AND a.supervisor_id = $${paramIndex++}`;
      params.push(supervisorId);
    }
    if (agentId && agentId !== 'all') {
      whereClause += ` AND t.agent_id = $${paramIndex++}`;
      params.push(agentId);
    }
    if (drawId && drawId !== 'all') {
      whereClause += ` AND t.draw_id = $${paramIndex++}`;
      params.push(drawId);
    }

    // Filtre gain/perte (gain : win_amount > total_amount, perte : win_amount < total_amount)
    if (gainLoss === 'gain') {
      whereClause += ' AND t.win_amount > t.total_amount';
    } else if (gainLoss === 'loss') {
      whereClause += ' AND t.win_amount < t.total_amount';
    }

    const query = `
      SELECT
        COUNT(DISTINCT t.id) AS total_tickets,
        COALESCE(SUM(t.total_amount), 0) AS total_bets,
        COALESCE(SUM(t.win_amount), 0) AS total_wins,
        COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) AS net_result,
        COALESCE(SUM(CASE WHEN t.win_amount > t.total_amount THEN 1 ELSE 0 END), 0) AS gain_count,
        COALESCE(SUM(CASE WHEN t.win_amount < t.total_amount THEN 1 ELSE 0 END), 0) AS loss_count
      FROM tickets t
      ${joinTables}
      ${whereClause}
    `;

    const result = await pool.query(query, params);
    const stats = result.rows[0];

    // Détail par agent ou par tirage (selon les filtres)
    let detail = [];
    if (drawId === 'all' || !drawId) {
      // Détail par tirage
      const detailQuery = `
        SELECT
          t.draw_id,
          t.draw_name,
          COUNT(DISTINCT t.id) AS tickets,
          SUM(t.total_amount) AS bets,
          SUM(t.win_amount) AS wins,
          SUM(t.win_amount) - SUM(t.total_amount) AS result
        FROM tickets t
        ${joinTables}
        ${whereClause}
        GROUP BY t.draw_id, t.draw_name
        ORDER BY result DESC
      `;
      const detailRes = await pool.query(detailQuery, params);
      detail = detailRes.rows;
    } else {
      // Détail par agent
      const detailQuery = `
        SELECT
          t.agent_id,
          t.agent_name,
          COUNT(DISTINCT t.id) AS tickets,
          SUM(t.total_amount) AS bets,
          SUM(t.win_amount) AS wins,
          SUM(t.win_amount) - SUM(t.total_amount) AS result
        FROM tickets t
        ${joinTables}
        ${whereClause}
        GROUP BY t.agent_id, t.agent_name
        ORDER BY result DESC
      `;
      const detailRes = await pool.query(detailQuery, params);
      detail = detailRes.rows;
    }

    res.json({
      summary: {
        totalTickets: parseInt(stats.total_tickets) || 0,
        totalBets: parseFloat(stats.total_bets) || 0,
        totalWins: parseFloat(stats.total_wins) || 0,
        netResult: parseFloat(stats.net_result) || 0,
        gainCount: parseInt(stats.gain_count) || 0,
        lossCount: parseInt(stats.loss_count) || 0
      },
      detail
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- Numéros bloqués publics (pour le front agent) ---
app.get('/api/blocked-numbers', async (req, res) => {
  try {
    const global = await pool.query('SELECT number FROM blocked_numbers');
    const draw = req.query.drawId
      ? await pool.query('SELECT number FROM draw_blocked_numbers WHERE draw_id = $1', [req.query.drawId])
      : { rows: [] };
    const all = [
      ...global.rows.map(r => r.number),
      ...draw.rows.map(r => r.number)
    ];
    res.json({ blockedNumbers: [...new Set(all)] });
  } catch (err) {
    res.json({ blockedNumbers: [] });
  }
});

// ---------- SERVIR LES FICHIERS STATIQUES ----------
app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/agent1.html', (req, res) => res.sendFile(path.join(__dirname, 'agent1.html')));
app.get('/responsable.html', (req, res) => res.sendFile(path.join(__dirname, 'responsable.html')));
app.get('/owner.html', (req, res) => res.sendFile(path.join(__dirname, 'owner.html')));

// 404
app.use('/api/*', (req, res) => res.status(404).json({ error: 'Route API non trouvée' }));
app.use('*', (req, res) => res.status(404).send('Page non trouvée'));

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erreur serveur interne', message: err.message });
});

// DÉMARRAGE
initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur LOTATO sur http://0.0.0.0:${PORT}`);
  });
});