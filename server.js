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

// ============= FONCTIONS UTILITAIRES BDD =============
async function columnExists(tableName, columnName) {
  try {
    const result = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1 AND column_name = $2
    `, [tableName, columnName]);
    return result.rows.length > 0;
  } catch (error) {
    console.error(`Erreur vérification colonne ${tableName}.${columnName}:`, error);
    return false;
  }
}

async function addColumnIfNotExists(tableName, columnName, columnDefinition) {
  const exists = await columnExists(tableName, columnName);
  if (!exists) {
    console.log(`➕ Ajout colonne ${tableName}.${columnName}...`);
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
    console.log(`✅ Colonne ${tableName}.${columnName} ajoutée`);
  }
}

// ============= INITIALISATION BASE DE DONNÉES =============
async function initializeDatabase() {
  try {
    console.log('🔄 Initialisation de la base de données...');

    // --- Tables existantes (inchangées) ---
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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS number_limits (
        number VARCHAR(2) PRIMARY KEY,
        limit_amount DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS game_rules (
        id SERIAL PRIMARY KEY,
        rule_key VARCHAR(100) UNIQUE,
        rule_value TEXT,
        description TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(100) UNIQUE,
        setting_value TEXT,
        category VARCHAR(50),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(50),
        user_role VARCHAR(20),
        action VARCHAR(100),
        details TEXT,
        ip_address VARCHAR(45),
        user_agent TEXT,
        timestamp TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS supervisors (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(100) UNIQUE,
        phone VARCHAR(20),
        password VARCHAR(255),
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
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
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER REFERENCES tickets(id),
        amount DECIMAL(10,2),
        paid_at TIMESTAMP DEFAULT NOW(),
        confirmed_by VARCHAR(100)
      )
    `);

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

    await addColumnIfNotExists('draws', 'created_at', 'TIMESTAMP DEFAULT NOW()');
    await addColumnIfNotExists('draws', 'updated_at', 'TIMESTAMP DEFAULT NOW()');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS blocked_numbers (
        number VARCHAR(2) PRIMARY KEY,
        blocked_at TIMESTAMP DEFAULT NOW()
      )
    `);

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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        title VARCHAR(100),
        message TEXT,
        type VARCHAR(20),
        priority VARCHAR(20) DEFAULT 'medium',
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_limits (
        user_id VARCHAR(50),
        limit_type VARCHAR(50),
        limit_value DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (user_id, limit_type)
      )
    `);

    // --- AJOUTS POUR LES NOUVELLES FONCTIONNALITÉS ---
    console.log('🔄 Mise à jour des tables pour propriétaire/superviseur...');

    // Colonnes supplémentaires pour supervisors
    await addColumnIfNotExists('supervisors', 'blocked', 'BOOLEAN DEFAULT false');
    await addColumnIfNotExists('supervisors', 'username', 'VARCHAR(100) UNIQUE');
    await addColumnIfNotExists('supervisors', 'cin', 'VARCHAR(50)');
    await addColumnIfNotExists('supervisors', 'zone', 'VARCHAR(100)');

    // Colonnes supplémentaires pour agents
    await addColumnIfNotExists('agents', 'blocked', 'BOOLEAN DEFAULT false');
    await addColumnIfNotExists('agents', 'username', 'VARCHAR(100) UNIQUE');
    await addColumnIfNotExists('agents', 'cin', 'VARCHAR(50)');
    await addColumnIfNotExists('agents', 'zone', 'VARCHAR(100)');

    // Table des numéros bloqués par tirage spécifique
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blocked_numbers_draw (
        draw_id VARCHAR(50) REFERENCES draws(id),
        number VARCHAR(2),
        blocked_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (draw_id, number)
      )
    `);

    // Ajout de draw_id dans number_limits et modification de la clé primaire
    await addColumnIfNotExists('number_limits', 'draw_id', 'VARCHAR(50) DEFAULT \'global\'');
    try {
      await pool.query(`ALTER TABLE number_limits DROP CONSTRAINT number_limits_pkey CASCADE`);
    } catch (e) { /* la contrainte n'existe pas encore */ }
    await pool.query(`
      ALTER TABLE number_limits ADD PRIMARY KEY (draw_id, number)
    `);

    console.log('✅ Mise à jour des tables terminée');

    // --- Données par défaut ---
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
        await pool.query(
          'INSERT INTO draws (id, name, time, active) VALUES ($1, $2, $3, true)',
          [draw.id, draw.name, draw.time]
        );
        console.log(`➕ Tirage ${draw.name} ajouté`);
      }
    }

    const configExists = await pool.query('SELECT id FROM lottery_config LIMIT 1');
    if (configExists.rows.length === 0) {
      await pool.query(`
        INSERT INTO lottery_config (name, logo, address, phone)
        VALUES ('LOTATO PRO', 'https://raw.githubusercontent.com/your-username/your-repo/main/logo.png', '', '')
      `);
      console.log('✅ Configuration loterie par défaut ajoutée');
    }

    console.log('✅ Base de données initialisée avec succès');
  } catch (error) {
    console.error('❌ Erreur initialisation base de données:', error.message);
    console.error('Stack:', error.stack);
  }
}

// ============= MIDDLEWARE D'AUTHENTIFICATION =============
const authenticateToken = (req, res, next) => {
  const publicRoutes = [
    '/api/health',
    '/api/auth/login',
    '/api/auth/refresh',
    '/api/auth/logout',
    '/api/tickets/save',
    '/api/tickets',
    '/api/winners',
    '/api/winners/results',
    '/api/lottery-config',
    '/api/tickets/check-winners',
    '/api/blocked-numbers',
    '/api/reports',
    '/api/reports/draw'
  ];

  if (publicRoutes.includes(req.path)) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'lotato-dev-secret', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalide ou expiré' });
    }
    req.user = user; // { id, username, role, name }
    next();
  });
};

// ============= ROUTES PUBLIQUES =============
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

    // --- Simulation d'utilisateurs (à remplacer par requête BDD) ---
    const validCredentials = (
      (role === 'agent' && username === 'agent01' && password === 'agent123') ||
      (role === 'supervisor' && username === 'supervisor1' && password === 'super123') ||
      (role === 'owner' && username === 'admin' && password === 'admin123')
    );

    if (!validCredentials) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    let userInfo = {};
    if (role === 'agent') {
      userInfo = { id: 'agent-01', name: 'Agent 01', username: 'agent01' };
    } else if (role === 'supervisor') {
      userInfo = { id: 'supervisor-01', name: 'Superviseur', username: 'supervisor1' };
    } else if (role === 'owner') {
      userInfo = { id: 'owner-01', name: 'Admin', username: 'admin' };
    }

    const token = jwt.sign(
      {
        id: userInfo.id,
        username: userInfo.username,
        role: role,
        name: userInfo.name
      },
      process.env.JWT_SECRET || 'lotato-dev-secret',
      { expiresIn: '24h' }
    );

    console.log(`✅ Connexion réussie pour ${userInfo.name} (${role})`);
    res.json({
      success: true,
      token,
      name: userInfo.name,
      role: role,
      agentId: role === 'agent' ? userInfo.id : null,
      supervisorId: role === 'supervisor' ? userInfo.id : null,
      ownerId: role === 'owner' ? userInfo.id : null
    });
  } catch (error) {
    console.error('❌ Erreur login:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('❌ Erreur refresh token:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
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

// Appliquer l'authentification aux routes API (sauf publiques)
app.use('/api', authenticateToken);

// ============= ROUTES TICKETS (existantes) =============
app.post('/api/tickets/save', async (req, res) => {
  try {
    console.log('📦 Requête ticket reçue:', JSON.stringify(req.body, null, 2));
    const { agentId, agentName, drawId, drawName, bets, total } = req.body;

    if (!agentId || !drawId || !bets || !Array.isArray(bets)) {
      console.log('❌ Données invalides:', { agentId, drawId, bets });
      return res.status(400).json({ error: 'Données invalides' });
    }

    const ticketId = `T${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();
    const betsJson = JSON.stringify(bets);

    console.log('💾 Sauvegarde ticket dans base de données...');
    const ticketResult = await pool.query(
      `INSERT INTO tickets (ticket_id, agent_id, agent_name, draw_id, draw_name, bets, total_amount, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [ticketId, agentId, agentName || 'Agent Inconnu', drawId, drawName || drawId, betsJson, parseFloat(total) || 0, now]
    );

    const savedTicket = ticketResult.rows[0];
    console.log('✅ Ticket sauvegardé avec ID:', savedTicket.id);

    res.json({
      success: true,
      ticket: {
        id: savedTicket.id,
        ticket_id: savedTicket.ticket_id,
        agentId: savedTicket.agent_id,
        agentName: savedTicket.agent_name,
        drawId: savedTicket.draw_id,
        drawName: savedTicket.draw_name,
        bets: bets,
        total_amount: savedTicket.total_amount,
        total: savedTicket.total_amount,
        date: savedTicket.date,
        checked: false
      }
    });
  } catch (error) {
    console.error('❌ Erreur sauvegarde ticket:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la sauvegarde du ticket', details: error.message });
  }
});

app.get('/api/tickets', async (req, res) => {
  try {
    const { agentId } = req.query;
    console.log(`📋 Récupération tickets pour agent: ${agentId}`);

    let query = 'SELECT * FROM tickets WHERE 1=1';
    const params = [];
    if (agentId) {
      params.push(agentId);
      query += ` AND agent_id = $${params.length}`;
    }
    query += ' ORDER BY date DESC LIMIT 50';

    const result = await pool.query(query, params);
    console.log(`✅ ${result.rows.length} tickets trouvés`);

    const tickets = result.rows.map(ticket => ({
      ...ticket,
      bets: typeof ticket.bets === 'string' ? JSON.parse(ticket.bets) : ticket.bets || []
    }));

    res.json({ tickets });
  } catch (error) {
    console.error('❌ Erreur récupération tickets:', error);
    res.json({ tickets: [] });
  }
});

app.delete('/api/tickets/delete/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    console.log(`🗑️ Suppression ticket ID: ${ticketId}`);
    await pool.query('DELETE FROM tickets WHERE id = $1', [parseInt(ticketId)]);
    console.log(`✅ Ticket ${ticketId} supprimé`);
    res.json({ success: true, message: 'Ticket supprimé' });
  } catch (error) {
    console.error('❌ Erreur suppression ticket:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= ROUTES GAGNANTS (existantes) =============
app.get('/api/winners', async (req, res) => {
  try {
    const { agentId } = req.query;
    console.log(`🏆 Récupération gagnants pour agent: ${agentId}`);

    let query = 'SELECT * FROM tickets WHERE win_amount > 0';
    const params = [];
    if (agentId) {
      params.push(agentId);
      query += ` AND agent_id = $${params.length}`;
    }
    query += ' ORDER BY date DESC LIMIT 20';

    const result = await pool.query(query, params);
    console.log(`✅ ${result.rows.length} tickets gagnants trouvés`);
    res.json({ winners: result.rows });
  } catch (error) {
    console.error('❌ Erreur gagnants:', error);
    res.json({ winners: [] });
  }
});

app.post('/api/tickets/check-winners', async (req, res) => {
  try {
    const { agentId } = req.query;
    console.log(`🔍 Vérification tickets gagnants pour agent: ${agentId}`);

    const query = agentId
      ? 'SELECT * FROM tickets WHERE agent_id = $1 AND win_amount > 0 AND checked = false'
      : 'SELECT * FROM tickets WHERE win_amount > 0 AND checked = false';
    const params = agentId ? [agentId] : [];

    const result = await pool.query(query, params);
    console.log(`✅ ${result.rows.length} tickets gagnants non vérifiés`);

    for (const ticket of result.rows) {
      await pool.query('UPDATE tickets SET checked = true WHERE id = $1', [ticket.id]);
    }

    res.json({ success: true, count: result.rows.length, tickets: result.rows });
  } catch (error) {
    console.error('❌ Erreur vérification tickets gagnants:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/winners/results', async (req, res) => {
  try {
    console.log('📊 Récupération résultats gagnants');
    const result = await pool.query(`
      SELECT * FROM draw_results 
      ORDER BY published_at DESC 
      LIMIT 10
    `);
    const results = result.rows.map(row => ({
      drawId: row.draw_id,
      name: row.name,
      numbers: typeof row.results === 'string' ? JSON.parse(row.results) : row.results,
      drawTime: row.draw_time,
      publishedAt: row.published_at
    }));
    console.log(`✅ ${results.length} résultats trouvés`);
    res.json({ results });
  } catch (error) {
    console.error('❌ Erreur résultats gagnants:', error);
    res.json({ results: [] });
  }
});

// ============= ROUTES CONFIGURATION (existantes) =============
app.get('/api/lottery-config', async (req, res) => {
  try {
    console.log('⚙️ Récupération configuration loterie');
    const result = await pool.query('SELECT * FROM lottery_config LIMIT 1');
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.json({ name: 'LOTATO PRO', logo: '', address: '', phone: '' });
    }
  } catch (error) {
    console.error('❌ Erreur config:', error);
    res.json({ name: 'LOTATO PRO', logo: '', address: '', phone: '' });
  }
});

app.post('/api/lottery-config', async (req, res) => {
  try {
    const { name, logo, address, phone } = req.body;
    console.log('⚙️ Mise à jour configuration:', { name, logo, address, phone });

    const check = await pool.query('SELECT * FROM lottery_config LIMIT 1');
    if (check.rows.length === 0) {
      await pool.query(
        'INSERT INTO lottery_config (name, logo, address, phone) VALUES ($1, $2, $3, $4)',
        [name, logo, address, phone]
      );
    } else {
      await pool.query(
        'UPDATE lottery_config SET name = $1, logo = $2, address = $3, phone = $4',
        [name, logo, address, phone]
      );
    }
    console.log('✅ Configuration sauvegardée');
    res.json({ success: true, message: 'Configuration sauvegardée' });
  } catch (error) {
    console.error('❌ Erreur sauvegarde config:', error);
    res.status(500).json({ error: 'Erreur sauvegarde' });
  }
});

// ============= ROUTES RAPPORTS (existantes) =============
app.get('/api/reports', async (req, res) => {
  try {
    const { agentId } = req.query;
    console.log(`📈 Rapports pour agent: ${agentId}`);

    if (!agentId) return res.status(400).json({ error: 'Agent ID requis' });

    const todayStats = await pool.query(`
      SELECT 
        COUNT(*) as total_tickets,
        COALESCE(SUM(total_amount), 0) as total_bets,
        COALESCE(SUM(win_amount), 0) as total_wins,
        COALESCE(SUM(total_amount) - SUM(win_amount), 0) as total_loss,
        COALESCE(SUM(win_amount) - SUM(total_amount), 0) as balance
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
    console.error('❌ Erreur rapports agent:', error);
    res.json({ totalTickets: 0, totalBets: 0, totalWins: 0, totalLoss: 0, balance: 0 });
  }
});

app.get('/api/reports/draw', async (req, res) => {
  try {
    const { agentId, drawId } = req.query;
    console.log(`📈 Rapport tirage ${drawId} pour agent ${agentId}`);

    if (!agentId || !drawId) {
      return res.status(400).json({ error: 'Agent ID et Draw ID requis' });
    }

    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_tickets,
        COALESCE(SUM(total_amount), 0) as total_bets,
        COALESCE(SUM(win_amount), 0) as total_wins,
        COALESCE(SUM(total_amount) - SUM(win_amount), 0) as total_loss,
        COALESCE(SUM(win_amount) - SUM(total_amount), 0) as balance
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
    console.error('❌ Erreur rapport tirage:', error);
    res.json({ totalTickets: 0, totalBets: 0, totalWins: 0, totalLoss: 0, balance: 0 });
  }
});

// ============= ROUTES NUMÉROS BLOQUÉS (existantes) =============
app.get('/api/blocked-numbers', async (req, res) => {
  try {
    console.log('🚫 Récupération numéros bloqués');
    const result = await pool.query('SELECT number FROM blocked_numbers');
    const blocked = result.rows.map(row => row.number);
    console.log(`✅ ${blocked.length} numéros bloqués trouvés`);
    res.json({ blockedNumbers: blocked });
  } catch (error) {
    console.error('❌ Erreur numéros bloqués:', error);
    res.json({ blockedNumbers: [] });
  }
});

// ============= ROUTES PROPRIÉTAIRE =============
const isOwner = (req, res, next) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Accès réservé au propriétaire' });
  }
  next();
};

app.use('/api/owner', authenticateToken, isOwner);

// GET /api/owner/dashboard
app.get('/api/owner/dashboard', async (req, res) => {
  try {
    // Connexions - données simulées (à remplacer par une vraie table de sessions)
    const connectedSup = { supervisors_count: 2, supervisors: [{ id: 'sup1', name: 'Jean', username: 'jean' }] };
    const connectedAgents = { agents_count: 5, agents: [{ id: 'agent1', name: 'Pierre', username: 'pierre' }] };

    const salesToday = await pool.query(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM tickets
      WHERE DATE(date) = CURRENT_DATE
    `);

    const limitsProgress = await pool.query(`
      SELECT nl.draw_id, d.name as draw_name, nl.number, nl.limit_amount,
             COALESCE(SUM(t.total_amount), 0) as current_bets,
             (COALESCE(SUM(t.total_amount), 0) / nl.limit_amount * 100) as progress_percent
      FROM number_limits nl
      LEFT JOIN draws d ON nl.draw_id = d.id
      LEFT JOIN tickets t ON t.draw_id = nl.draw_id AND DATE(t.date) = CURRENT_DATE
      WHERE nl.limit_amount > 0
      GROUP BY nl.draw_id, d.name, nl.number, nl.limit_amount
    `);

    const agentsGL = await pool.query(`
      SELECT a.id, a.name,
             COALESCE(SUM(t.total_amount), 0) as total_bets,
             COALESCE(SUM(t.win_amount), 0) as total_wins,
             COALESCE(SUM(t.win_amount), 0) - COALESCE(SUM(t.total_amount), 0) as net_result
      FROM agents a
      LEFT JOIN tickets t ON t.agent_id = a.id AND DATE(t.date) = CURRENT_DATE
      GROUP BY a.id, a.name
      HAVING COALESCE(SUM(t.total_amount), 0) > 0 OR COALESCE(SUM(t.win_amount), 0) > 0
    `);

    res.json({
      connected: {
        supervisors_count: connectedSup.supervisors_count,
        agents_count: connectedAgents.agents_count,
        supervisors: connectedSup.supervisors,
        agents: connectedAgents.agents
      },
      sales_today: parseFloat(salesToday.rows[0].total),
      limits_progress: limitsProgress.rows,
      agents_gain_loss: agentsGL.rows
    });
  } catch (error) {
    console.error('Erreur /owner/dashboard:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/owner/supervisors
app.get('/api/owner/supervisors', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, email, phone, username, cin, zone, active, blocked, created_at
      FROM supervisors
      ORDER BY name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur /owner/supervisors:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/owner/agents
app.get('/api/owner/agents', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.id, a.name, a.email, a.phone, a.username, a.cin, a.zone,
             a.active, a.blocked, a.created_at,
             s.name as supervisor_name
      FROM agents a
      LEFT JOIN supervisors s ON a.supervisor_id = s.id
      ORDER BY a.name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur /owner/agents:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/owner/create-user
app.post('/api/owner/create-user', async (req, res) => {
  const { name, cin, username, password, role, supervisorId, zone } = req.body;
  if (!name || !username || !password || !role) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    let query, params;
    if (role === 'supervisor') {
      query = `
        INSERT INTO supervisors (name, cin, username, password, zone, active, blocked)
        VALUES ($1, $2, $3, $4, $5, true, false)
        RETURNING id
      `;
      params = [name, cin || null, username, hashedPassword, zone || null];
    } else if (role === 'agent') {
      query = `
        INSERT INTO agents (name, cin, username, password, supervisor_id, zone, active, blocked)
        VALUES ($1, $2, $3, $4, $5, $6, true, false)
        RETURNING id
      `;
      params = [name, cin || null, username, hashedPassword, supervisorId || null, zone || null];
    } else {
      return res.status(400).json({ error: 'Rôle invalide' });
    }
    await pool.query(query, params);
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur création utilisateur:', error);
    if (error.code === '23505') {
      res.status(400).json({ error: 'Nom d\'utilisateur déjà utilisé' });
    } else {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
});

// POST /api/owner/block-user
app.post('/api/owner/block-user', async (req, res) => {
  const { userId, type } = req.body;
  if (!userId || !type) return res.status(400).json({ error: 'userId et type requis' });
  try {
    const table = type === 'supervisor' ? 'supervisors' : 'agents';
    const current = await pool.query(`SELECT blocked FROM ${table} WHERE id = $1`, [userId]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    const newBlocked = !current.rows[0].blocked;
    await pool.query(`UPDATE ${table} SET blocked = $1 WHERE id = $2`, [newBlocked, userId]);
    res.json({ success: true, blocked: newBlocked });
  } catch (error) {
    console.error('Erreur block-user:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/owner/change-supervisor
app.put('/api/owner/change-supervisor', async (req, res) => {
  const { agentId, supervisorId } = req.body;
  if (!agentId) return res.status(400).json({ error: 'agentId requis' });
  try {
    await pool.query(
      'UPDATE agents SET supervisor_id = $1 WHERE id = $2',
      [supervisorId || null, agentId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur change-supervisor:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/owner/draws
app.get('/api/owner/draws', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, time, frequency, status, active, description, min_bet, max_bet, last_draw, created_at
      FROM draws
      ORDER BY name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur /owner/draws:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/owner/publish-results
app.post('/api/owner/publish-results', async (req, res) => {
  const { drawId, numbers } = req.body;
  if (!drawId || !numbers || !Array.isArray(numbers) || numbers.length < 3) {
    return res.status(400).json({ error: 'drawId et numbers[3] requis' });
  }
  try {
    const draw = await pool.query('SELECT name FROM draws WHERE id = $1', [drawId]);
    if (draw.rows.length === 0) return res.status(404).json({ error: 'Tirage inconnu' });

    await pool.query(`
      INSERT INTO draw_results (draw_id, name, draw_time, results, lucky_number, comment, source, published_at)
      VALUES ($1, $2, NOW(), $3, NULL, 'Publication propriétaire', 'owner', NOW())
    `, [drawId, draw.rows[0].name, JSON.stringify(numbers)]);

    // TODO: Implémenter la logique de calcul des gains
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur publish-results:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/owner/block-draw
app.post('/api/owner/block-draw', async (req, res) => {
  const { drawId, block } = req.body;
  if (!drawId) return res.status(400).json({ error: 'drawId requis' });
  try {
    await pool.query('UPDATE draws SET active = $1 WHERE id = $2', [!block, drawId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur block-draw:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/owner/blocked-numbers
app.get('/api/owner/blocked-numbers', async (req, res) => {
  try {
    const result = await pool.query('SELECT number FROM blocked_numbers ORDER BY number');
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (error) {
    console.error('Erreur blocked-numbers:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/owner/block-number
app.post('/api/owner/block-number', async (req, res) => {
  const { number } = req.body;
  if (!number) return res.status(400).json({ error: 'number requis' });
  try {
    await pool.query(
      'INSERT INTO blocked_numbers (number) VALUES ($1) ON CONFLICT (number) DO NOTHING',
      [number]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur block-number:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/owner/unblock-number
app.post('/api/owner/unblock-number', async (req, res) => {
  const { number } = req.body;
  if (!number) return res.status(400).json({ error: 'number requis' });
  try {
    await pool.query('DELETE FROM blocked_numbers WHERE number = $1', [number]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur unblock-number:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/owner/block-number-draw
app.post('/api/owner/block-number-draw', async (req, res) => {
  const { drawId, number } = req.body;
  if (!drawId || !number) return res.status(400).json({ error: 'drawId et number requis' });
  try {
    await pool.query(
      'INSERT INTO blocked_numbers_draw (draw_id, number) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [drawId, number]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur block-number-draw:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/owner/unblock-number-draw
app.post('/api/owner/unblock-number-draw', async (req, res) => {
  const { drawId, number } = req.body;
  if (!drawId || !number) return res.status(400).json({ error: 'drawId et number requis' });
  try {
    await pool.query(
      'DELETE FROM blocked_numbers_draw WHERE draw_id = $1 AND number = $2',
      [drawId, number]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur unblock-number-draw:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/owner/number-limit
app.post('/api/owner/number-limit', async (req, res) => {
  const { drawId, number, limitAmount } = req.body;
  if (!drawId || !number || limitAmount === undefined) {
    return res.status(400).json({ error: 'drawId, number, limitAmount requis' });
  }
  try {
    await pool.query(`
      INSERT INTO number_limits (draw_id, number, limit_amount)
      VALUES ($1, $2, $3)
      ON CONFLICT (draw_id, number) DO UPDATE
      SET limit_amount = EXCLUDED.limit_amount, updated_at = NOW()
    `, [drawId, number, limitAmount]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur number-limit:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/owner/reports
app.get('/api/owner/reports', async (req, res) => {
  const { supervisorId, agentId, drawId, period, fromDate, toDate, gainLoss } = req.query;
  try {
    let conditions = [];
    let params = [];
    let paramIndex = 1;

    if (agentId && agentId !== 'all') {
      conditions.push(`t.agent_id = $${paramIndex++}`);
      params.push(agentId);
    } else if (supervisorId && supervisorId !== 'all') {
      conditions.push(`a.supervisor_id = $${paramIndex++}`);
      params.push(supervisorId);
    }

    if (drawId && drawId !== 'all') {
      conditions.push(`t.draw_id = $${paramIndex++}`);
      params.push(drawId);
    }

    let dateCondition = '';
    if (period === 'today') dateCondition = 'DATE(t.date) = CURRENT_DATE';
    else if (period === 'yesterday') dateCondition = 'DATE(t.date) = CURRENT_DATE - 1';
    else if (period === 'week') dateCondition = 't.date >= date_trunc(\'week\', CURRENT_DATE)';
    else if (period === 'month') dateCondition = 't.date >= date_trunc(\'month\', CURRENT_DATE)';
    else if (period === 'custom' && fromDate && toDate) {
      dateCondition = `DATE(t.date) BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(fromDate, toDate);
      paramIndex += 2;
    }
    if (dateCondition) conditions.push(dateCondition);

    if (gainLoss === 'gain') conditions.push('t.win_amount > 0');
    else if (gainLoss === 'loss') conditions.push('t.total_amount > t.win_amount');

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const summaryQuery = `
      SELECT
        COUNT(DISTINCT t.id) as total_tickets,
        COALESCE(SUM(t.total_amount), 0) as total_bets,
        COALESCE(SUM(t.win_amount), 0) as total_wins,
        COALESCE(SUM(t.win_amount), 0) - COALESCE(SUM(t.total_amount), 0) as net_result,
        COUNT(DISTINCT CASE WHEN t.win_amount > 0 THEN t.agent_id END) as gain_count,
        COUNT(DISTINCT CASE WHEN t.total_amount > t.win_amount THEN t.agent_id END) as loss_count
      FROM tickets t
      LEFT JOIN agents a ON t.agent_id = a.id
      ${whereClause}
    `;
    const summaryRes = await pool.query(summaryQuery, params);
    const summary = summaryRes.rows[0];

    let detailQuery;
    if (drawId && drawId !== 'all') {
      detailQuery = `
        SELECT a.name as agent_name,
               COUNT(t.id) as tickets,
               COALESCE(SUM(t.total_amount), 0) as bets,
               COALESCE(SUM(t.win_amount), 0) as wins,
               COALESCE(SUM(t.win_amount), 0) - COALESCE(SUM(t.total_amount), 0) as result
        FROM tickets t
        JOIN agents a ON t.agent_id = a.id
        ${whereClause}
        GROUP BY a.id, a.name
        ORDER BY result DESC
      `;
    } else {
      detailQuery = `
        SELECT d.name as draw_name,
               COUNT(t.id) as tickets,
               COALESCE(SUM(t.total_amount), 0) as bets,
               COALESCE(SUM(t.win_amount), 0) as wins,
               COALESCE(SUM(t.win_amount), 0) - COALESCE(SUM(t.total_amount), 0) as result
        FROM tickets t
        JOIN draws d ON t.draw_id = d.id
        ${whereClause}
        GROUP BY d.id, d.name
        ORDER BY result DESC
      `;
    }
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
    console.error('Erreur /owner/reports:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= ROUTES SUPERVISEUR =============
const isSupervisor = (req, res, next) => {
  if (req.user.role !== 'supervisor') {
    return res.status(403).json({ error: 'Accès réservé aux superviseurs' });
  }
  next();
};

app.use('/api/supervisor', authenticateToken, isSupervisor);

// GET /api/supervisor/reports/overall
app.get('/api/supervisor/reports/overall', async (req, res) => {
  const supervisorId = req.user.id;
  try {
    const agents = await pool.query('SELECT id FROM agents WHERE supervisor_id = $1', [supervisorId]);
    const agentIds = agents.rows.map(a => a.id);
    if (agentIds.length === 0) {
      return res.json({ totalTickets: 0, totalBets: 0, totalWins: 0, balance: 0 });
    }

    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_tickets,
        COALESCE(SUM(total_amount), 0) as total_bets,
        COALESCE(SUM(win_amount), 0) as total_wins,
        COALESCE(SUM(win_amount), 0) - COALESCE(SUM(total_amount), 0) as balance
      FROM tickets
      WHERE agent_id = ANY($1::int[]) AND DATE(date) = CURRENT_DATE
    `, [agentIds]);

    const row = stats.rows[0];
    res.json({
      totalTickets: parseInt(row.total_tickets) || 0,
      totalBets: parseFloat(row.total_bets) || 0,
      totalWins: parseFloat(row.total_wins) || 0,
      balance: parseFloat(row.balance) || 0
    });
  } catch (error) {
    console.error('Erreur supervisor/overall:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/supervisor/agents
app.get('/api/supervisor/agents', async (req, res) => {
  const supervisorId = req.user.id;
  try {
    const result = await pool.query(`
      SELECT a.id, a.name, a.blocked,
             COALESCE(SUM(t.total_amount), 0) as total_bets,
             COALESCE(SUM(t.win_amount), 0) as total_wins,
             COUNT(DISTINCT t.id) as total_tickets,
             COALESCE(SUM(t.win_amount), 0) - COALESCE(SUM(t.total_amount), 0) as balance
      FROM agents a
      LEFT JOIN tickets t ON a.id = t.agent_id AND DATE(t.date) = CURRENT_DATE
      WHERE a.supervisor_id = $1
      GROUP BY a.id, a.name, a.blocked
      ORDER BY a.name
    `, [supervisorId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur supervisor/agents:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/supervisor/block-agent/:agentId
app.post('/api/supervisor/block-agent/:agentId', async (req, res) => {
  const agentId = req.params.agentId;
  const supervisorId = req.user.id;
  try {
    const check = await pool.query(
      'SELECT id FROM agents WHERE id = $1 AND supervisor_id = $2',
      [agentId, supervisorId]
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ error: 'Agent non autorisé' });
    }
    await pool.query('UPDATE agents SET blocked = true WHERE id = $1', [agentId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur block-agent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/supervisor/unblock-agent/:agentId
app.post('/api/supervisor/unblock-agent/:agentId', async (req, res) => {
  const agentId = req.params.agentId;
  const supervisorId = req.user.id;
  try {
    const check = await pool.query(
      'SELECT id FROM agents WHERE id = $1 AND supervisor_id = $2',
      [agentId, supervisorId]
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ error: 'Agent non autorisé' });
    }
    await pool.query('UPDATE agents SET blocked = false WHERE id = $1', [agentId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur unblock-agent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/supervisor/tickets/recent
app.get('/api/supervisor/tickets/recent', async (req, res) => {
  const { agentId } = req.query;
  const supervisorId = req.user.id;
  if (!agentId) return res.status(400).json({ error: 'agentId requis' });
  try {
    const check = await pool.query(
      'SELECT id FROM agents WHERE id = $1 AND supervisor_id = $2',
      [agentId, supervisorId]
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ error: 'Agent non autorisé' });
    }
    const tickets = await pool.query(`
      SELECT id, ticket_id, total_amount, date
      FROM tickets
      WHERE agent_id = $1
      ORDER BY date DESC
      LIMIT 20
    `, [agentId]);
    res.json(tickets.rows);
  } catch (error) {
    console.error('Erreur supervisor/tickets/recent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/supervisor/tickets/:ticketId
app.delete('/api/supervisor/tickets/:ticketId', async (req, res) => {
  const ticketId = req.params.ticketId;
  const supervisorId = req.user.id;
  try {
    const ticket = await pool.query(`
      SELECT t.id, t.agent_id, t.date
      FROM tickets t
      JOIN agents a ON t.agent_id = a.id
      WHERE t.id = $1 AND a.supervisor_id = $2
    `, [ticketId, supervisorId]);
    if (ticket.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket non trouvé ou non autorisé' });
    }
    const ticketDate = new Date(ticket.rows[0].date);
    const now = new Date();
    const diffMinutes = (now - ticketDate) / 60000;
    if (diffMinutes > 10) {
      return res.status(403).json({ error: 'Suppression impossible : plus de 10 minutes' });
    }
    await pool.query('DELETE FROM tickets WHERE id = $1', [ticketId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur delete ticket:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= ROUTES STATIQUES =============
app.use(express.static(__dirname));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/agent1.html', (req, res) => res.sendFile(path.join(__dirname, 'agent1.html')));
app.get('/responsable.html', (req, res) => res.sendFile(path.join(__dirname, 'responsable.html')));
app.get('/owner.html', (req, res) => res.sendFile(path.join(__dirname, 'owner.html')));

// ============= GESTION DES ERREURS 404 =============
app.use('/api/*', (req, res) => {
  console.log(`❌ Route API non trouvée: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Route API non trouvée' });
});

app.use('*', (req, res) => {
  console.log(`❌ Page non trouvée: ${req.originalUrl}`);
  res.status(404).send('Page non trouvée');
});

// ============= MIDDLEWARE D'ERREUR GLOBAL =============
app.use((err, req, res, next) => {
  console.error('🔥 Erreur serveur:', err.stack);
  res.status(500).json({ error: 'Erreur serveur interne', message: err.message });
});

// ============= DÉMARRAGE DU SERVEUR =============
initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur LOTATO démarré sur http://0.0.0.0:${PORT}`);
    console.log(`📊 Health: http://0.0.0.0:${PORT}/api/health`);
    console.log(`👤 Panneau agent: http://0.0.0.0:${PORT}/agent1.html`);
  });
});