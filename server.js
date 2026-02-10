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
  keyGenerator: (req) => {
    return req.ip;
  }
});
app.use('/api/', limiter);

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Tester la connexion
pool.on('connect', () => {
  console.log('✅ Connecté à PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ Erreur PostgreSQL:', err);
});

// Fonction pour vérifier si une colonne existe
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

// Fonction pour ajouter une colonne si elle n'existe pas
async function addColumnIfNotExists(tableName, columnName, columnDefinition) {
  const exists = await columnExists(tableName, columnName);
  if (!exists) {
    console.log(`➕ Ajout colonne ${tableName}.${columnName}...`);
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
    console.log(`✅ Colonne ${tableName}.${columnName} ajoutée`);
  }
}

// Initialiser les tables si elles n'existent pas
async function initializeDatabase() {
  try {
    console.log('🔄 Initialisation de la base de données...');
    
    // Table pour les résultats de tirages
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

    // Table pour les limites de numéros
    await pool.query(`
      CREATE TABLE IF NOT EXISTS number_limits (
        number VARCHAR(2) PRIMARY KEY,
        limit_amount DECIMAL(10, 2),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Table pour les règles du jeu
    await pool.query(`
      CREATE TABLE IF NOT EXISTS game_rules (
        id SERIAL PRIMARY KEY,
        rule_key VARCHAR(100) UNIQUE,
        rule_value TEXT,
        description TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Table pour les paramètres système
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(100) UNIQUE,
        setting_value TEXT,
        category VARCHAR(50),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Table d'activité étendue
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

    // Table des superviseurs
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

    // Table des agents
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

    // Table des tickets
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

    // Table des paiements
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER REFERENCES tickets(id),
        amount DECIMAL(10,2),
        paid_at TIMESTAMP DEFAULT NOW(),
        confirmed_by VARCHAR(100)
      )
    `);

    // Table des tirages - CRÉATION SANS LES COLONNES OPTIONNELLES
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

    // Ajouter les colonnes optionnelles si elles n'existent pas
    await addColumnIfNotExists('draws', 'created_at', 'TIMESTAMP DEFAULT NOW()');
    await addColumnIfNotExists('draws', 'updated_at', 'TIMESTAMP DEFAULT NOW()');

    // Table des numéros bloqués
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blocked_numbers (
        number VARCHAR(2) PRIMARY KEY,
        blocked_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Table de configuration loterie
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lottery_config (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        logo TEXT,
        address TEXT,
        phone VARCHAR(20)
      )
    `);

    // Ajouter la colonne updated_at si elle n'existe pas
    await addColumnIfNotExists('lottery_config', 'updated_at', 'TIMESTAMP DEFAULT NOW()');

    // Table des alertes
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

    // Table des limites utilisateur
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

    console.log('✅ Tables créées ou existantes vérifiées');

    // Insérer des tirages par défaut - SANS LES COLONNES OPTIONNELLES
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
      // Vérifier si le tirage existe déjà
      const existingDraw = await pool.query(
        'SELECT id FROM draws WHERE id = $1',
        [draw.id]
      );
      
      if (existingDraw.rows.length === 0) {
        // Insérer sans les colonnes optionnelles
        await pool.query(`
          INSERT INTO draws (id, name, time, active)
          VALUES ($1, $2, $3, true)
        `, [draw.id, draw.name, draw.time]);
        console.log(`➕ Tirage ${draw.name} ajouté`);
      }
    }

    // Configuration loterie par défaut
    const existingConfig = await pool.query(
      'SELECT id FROM lottery_config LIMIT 1'
    );
    
    if (existingConfig.rows.length === 0) {
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

// Middleware d'authentification TRÈS SIMPLIFIÉ
const authenticateToken = (req, res, next) => {
  // Routes publiques
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
  
  // Vérifier si la route actuelle est publique
  if (publicRoutes.includes(req.path)) {
    return next();
  }

  // Pour toutes les autres routes, on accepte sans vérification en développement
  // Dans le front-end, les tokens sont gérés mais ici on bypass pour faciliter le développement
  req.user = { 
    id: 'agent-01', 
    username: 'agent01',
    role: 'agent',
    name: 'Agent Test'
  };
  
  return next();
};

// ============= ROUTES PUBLIQUES =============

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      database: 'connected',
      service: 'LOTATO API v1.0'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      error: error.message 
    });
  }
});

// LOGIN simplifié
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    console.log('🔑 Tentative de connexion:', { username, role });

    // Utilisateurs de test très simples
    const validCredentials = (
      (role === 'agent' && username === 'agent01' && password === 'agent123') ||
      (role === 'supervisor' && username === 'supervisor1' && password === 'super123') ||
      (role === 'owner' && username === 'admin' && password === 'admin123')
    );

    if (!validCredentials) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    // Informations utilisateur selon le rôle
    let userInfo = {};
    if (role === 'agent') {
      userInfo = { id: 'agent-01', name: 'Agent 01', username: 'agent01' };
    } else if (role === 'supervisor') {
      userInfo = { id: 'supervisor-01', name: 'Superviseur', username: 'supervisor1' };
    } else if (role === 'owner') {
      userInfo = { id: 'owner-01', name: 'Admin', username: 'admin' };
    }

    // Générer un token simple
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

// Rafraîchir le token
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Token requis' });
    }

    // Vérifier le token
    jwt.verify(token, process.env.JWT_SECRET || 'lotato-dev-secret', (err, decoded) => {
      if (err) {
        return res.status(403).json({ error: 'Token invalide' });
      }

      // Générer un nouveau token
      const newToken = jwt.sign(
        {
          id: decoded.id,
          username: decoded.username,
          role: decoded.role,
          name: decoded.name
        },
        process.env.JWT_SECRET || 'lotato-dev-secret',
        { expiresIn: '24h' }
      );

      res.json({
        success: true,
        token: newToken
      });
    });
  } catch (error) {
    console.error('❌ Erreur refresh token:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true, message: 'Déconnecté avec succès' });
});

// Verify token
app.get('/api/auth/verify', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'lotato-dev-secret', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalide' });
    }
    res.json({ valid: true, user: user });
  });
});

// Appliquer l'authentification aux routes API
app.use('/api', authenticateToken);

// ============= ROUTES TICKETS =============
app.post('/api/tickets/save', async (req, res) => {
  try {
    console.log('📦 Requête ticket reçue:', JSON.stringify(req.body, null, 2));
    
    const { agentId, agentName, drawId, drawName, bets, total } = req.body;
    
    // Validation simple
    if (!agentId || !drawId || !bets || !Array.isArray(bets)) {
      console.log('❌ Données invalides:', { agentId, drawId, bets });
      return res.status(400).json({ error: 'Données invalides' });
    }

    // Générer un ID de ticket
    const ticketId = `T${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();

    // Convertir les bets en format JSON
    const betsJson = JSON.stringify(bets);

    console.log('💾 Sauvegarde ticket dans base de données...');
    
    // Sauvegarder le ticket
    const ticketQuery = `
      INSERT INTO tickets (ticket_id, agent_id, agent_name, draw_id, draw_name, bets, total_amount, date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    
    const ticketResult = await pool.query(ticketQuery, [
      ticketId,
      agentId,
      agentName || 'Agent Inconnu',
      drawId,
      drawName || drawId,
      betsJson,
      parseFloat(total) || 0,
      now
    ]);

    const savedTicket = ticketResult.rows[0];
    console.log('✅ Ticket sauvegardé avec ID:', savedTicket.id);
    
    // Retourner la réponse au format attendu
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
    res.status(500).json({ 
      success: false,
      error: 'Erreur lors de la sauvegarde du ticket',
      details: error.message
    });
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
    
    // Convertir les bets JSON en objet
    const tickets = result.rows.map(ticket => ({
      id: ticket.id,
      ticket_id: ticket.ticket_id,
      agent_id: ticket.agent_id,
      agent_name: ticket.agent_name,
      draw_id: ticket.draw_id,
      draw_name: ticket.draw_name,
      bets: typeof ticket.bets === 'string' ? JSON.parse(ticket.bets) : ticket.bets || [],
      total_amount: ticket.total_amount,
      win_amount: ticket.win_amount,
      paid: ticket.paid,
      date: ticket.date,
      checked: ticket.checked
    }));
    
    res.json({ tickets });
  } catch (error) {
    console.error('❌ Erreur récupération tickets:', error);
    res.json({ tickets: [] });
  }
});

// Supprimer un ticket
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

// ============= ROUTES GAGNANTS =============
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

// Vérifier les tickets gagnants
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
    
    // Marquer comme vérifié
    for (const ticket of result.rows) {
      await pool.query(
        'UPDATE tickets SET checked = true WHERE id = $1',
        [ticket.id]
      );
    }
    
    res.json({ 
      success: true, 
      count: result.rows.length,
      tickets: result.rows 
    });
  } catch (error) {
    console.error('❌ Erreur vérification tickets gagnants:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Résultats gagnants
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

// ============= ROUTES CONFIGURATION =============
app.get('/api/lottery-config', async (req, res) => {
  try {
    console.log('⚙️ Récupération configuration loterie');
    
    const result = await pool.query('SELECT * FROM lottery_config LIMIT 1');
    
    if (result.rows.length > 0) {
      console.log('✅ Configuration trouvée');
      res.json(result.rows[0]);
    } else {
      console.log('⚠️ Configuration par défaut utilisée');
      res.json({
        name: 'LOTATO PRO',
        logo: '',
        address: '',
        phone: ''
      });
    }
  } catch (error) {
    console.error('❌ Erreur config:', error);
    res.json({
      name: 'LOTATO PRO',
      logo: '',
      address: '',
      phone: ''
    });
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

// ============= ROUTES RAPPORTS =============
app.get('/api/reports', async (req, res) => {
  try {
    const { agentId } = req.query;
    console.log(`📈 Rapports pour agent: ${agentId}`);
    
    if (!agentId) {
      return res.status(400).json({ error: 'Agent ID requis' });
    }
    
    // Statistiques du jour
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
    res.json({
      totalTickets: 0,
      totalBets: 0,
      totalWins: 0,
      totalLoss: 0,
      balance: 0
    });
  }
});

// Rapport par tirage
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
    res.json({
      totalTickets: 0,
      totalBets: 0,
      totalWins: 0,
      totalLoss: 0,
      balance: 0
    });
  }
});

// ============= ROUTES NUMÉROS BLOQUÉS =============
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

// ============= ROUTES STATIQUES =============
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/agent1.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'agent1.html'));
});

app.get('/responsable.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'responsable.html'));
});

app.get('/owner.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'owner.html'));
});

// Route 404 pour API
app.use('/api/*', (req, res) => {
  console.log(`❌ Route API non trouvée: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Route API non trouvée' });
});

// Route 404 pour pages
app.use('*', (req, res) => {
  console.log(`❌ Page non trouvée: ${req.originalUrl}`);
  res.status(404).send('Page non trouvée');
});

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error('🔥 Erreur serveur:', err.stack);
  res.status(500).json({ 
    error: 'Erreur serveur interne',
    message: err.message
  });
});

// Initialiser la base de données et démarrer le serveur
initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur LOTATO démarré sur http://0.0.0.0:${PORT}`);
    console.log(`📊 Health: http://0.0.0.0:${PORT}/api/health`);
    console.log(`👤 Panneau agent: http://0.0.0.0:${PORT}/agent1.html`);
  });
});