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
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('dev'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000
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

// Middleware d'authentification SIMPLIFIÉ
const authenticateToken = (req, res, next) => {
  // Pour les routes publiques, on passe
  const publicRoutes = ['/api/health', '/api/auth/login', '/api/draws'];
  if (publicRoutes.includes(req.path)) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // Pour le développement, on accepte les requêtes sans token
    console.log('⚠️ Requête sans token, on accepte pour le moment');
    req.user = { id: 'dev-user', role: 'agent' };
    return next();
  }

  jwt.verify(token, process.env.JWT_SECRET || 'lotato-secret-key', (err, user) => {
    if (err) {
      console.log('⚠️ Token invalide, on continue quand même pour le dev');
      req.user = { id: 'dev-user', role: 'agent' };
      return next();
    }
    req.user = user;
    next();
  });
};

// Routes publiques
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

// LOGIN avec utilisateurs de test
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    console.log('Login attempt:', { username, role });

    // Vérification des identifiants de test
    const testUsers = {
      'agent': [
        { id: 'agent-01', username: 'agent01', password: 'agent123', name: 'Pierre Agent' },
        { id: 'agent-02', username: 'agent02', password: 'agent456', name: 'Marc Agent' },
        { id: 'agent-03', username: 'agent03', password: 'agent789', name: 'Sophie Agent' }
      ],
      'supervisor': [
        { id: 'supervisor-01', username: 'supervisor1', password: 'super123', name: 'Jean Supervisor' }
      ],
      'owner': [
        { id: 'owner-01', username: 'admin', password: 'admin123', name: 'Admin Propriétaire' }
      ]
    };

    const users = testUsers[role] || [];
    const user = users.find(u => u.username === username && u.password === password);

    if (!user) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    // Générer le token
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: role,
        name: user.name
      },
      process.env.JWT_SECRET || 'lotato-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      name: user.name,
      role: role,
      agentId: role === 'agent' ? user.id : null,
      supervisorId: role === 'supervisor' ? user.id : null,
      ownerId: role === 'owner' ? user.id : null
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Appliquer l'authentification aux routes API
app.use('/api', authenticateToken);

// ============= ROUTES TICKETS =============
app.post('/api/tickets/save', async (req, res) => {
  try {
    console.log('📦 Requête ticket reçue:', req.body);
    
    const { agentId, agentName, drawId, drawName, bets, total } = req.body;
    
    if (!agentId || !drawId || !bets || !Array.isArray(bets)) {
      return res.status(400).json({ error: 'Données invalides' });
    }

    // Générer un ID de ticket
    const ticketId = Math.floor(100000 + Math.random() * 900000);
    const now = new Date().toISOString();

    // Dans la base de données réelle, on sauvegarde
    try {
      // 1. Sauvegarder le ticket principal
      const ticketQuery = `
        INSERT INTO tickets (id, agent_id, agent_name, draw_id, draw_name, bets, total_amount, date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;
      
      const ticketResult = await pool.query(ticketQuery, [
        ticketId,
        agentId,
        agentName || 'Agent Inconnu',
        drawId,
        drawName || drawId,
        JSON.stringify(bets),
        parseFloat(total) || 0,
        now
      ]);

      // 2. Sauvegarder chaque pari
      for (const bet of bets) {
        const betQuery = `
          INSERT INTO ticket_bets (ticket_id, game_type, number, amount, draw_id, draw_name, option, special_type, is_auto)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `;
        
        await pool.query(betQuery, [
          ticketId,
          bet.game || 'unknown',
          bet.number || '00',
          parseFloat(bet.amount) || 0,
          bet.drawId || drawId,
          bet.drawName || drawName,
          bet.option || null,
          bet.specialType || null,
          bet.isAutoGenerated || false
        ]);
      }

      console.log('✅ Ticket sauvegardé:', ticketId);
      
      res.json({
        success: true,
        ticket: {
          id: ticketId,
          agentId,
          agentName,
          drawId,
          drawName,
          bets,
          total: parseFloat(total) || 0,
          date: now,
          checked: false
        }
      });

    } catch (dbError) {
      console.error('❌ Erreur base de données:', dbError);
      // En cas d'erreur DB, on retourne quand même une réponse
      res.json({
        success: true,
        ticket: {
          id: ticketId,
          agentId,
          agentName,
          drawId,
          drawName,
          bets,
          total: parseFloat(total) || 0,
          date: now,
          checked: false
        },
        message: 'Ticket sauvegardé (mode simulation)'
      });
    }

  } catch (error) {
    console.error('❌ Erreur traitement ticket:', error);
    res.status(500).json({ error: 'Erreur lors de la sauvegarde du ticket' });
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
    
    // Convertir les bets JSON en objet
    const tickets = result.rows.map(ticket => ({
      ...ticket,
      bets: typeof ticket.bets === 'string' ? JSON.parse(ticket.bets) : ticket.bets || []
    }));
    
    res.json({ tickets });
  } catch (error) {
    console.error('Erreur récupération tickets:', error);
    res.json({ tickets: [] });
  }
});

// ============= ROUTES DRAWS =============
app.get('/api/draws', async (req, res) => {
  try {
    // Essayer de récupérer depuis la base
    const result = await pool.query(`
      SELECT id, name, time, active 
      FROM draws 
      WHERE active = true 
      ORDER BY time
    `);
    
    if (result.rows.length > 0) {
      return res.json({ draws: result.rows });
    }
    
    // Fallback: tirages par défaut
    const defaultDraws = [
      { id: 'mia_matin', name: 'Miami Matin', time: '13:30', active: true },
      { id: 'mia_soir', name: 'Miami Soir', time: '21:50', active: true },
      { id: 'ny_matin', name: 'New York Matin', time: '14:30', active: true },
      { id: 'ny_soir', name: 'New York Soir', time: '20:00', active: true },
      { id: 'ga_matin', name: 'Georgia Matin', time: '12:30', active: true },
      { id: 'ga_soir', name: 'Georgia Soir', time: '19:00', active: true },
      { id: 'tx_matin', name: 'Texas Matin', time: '11:30', active: true },
      { id: 'tx_soir', name: 'Texas Soir', time: '18:30', active: true },
      { id: 'tn_matin', name: 'Tunisia Matin', time: '10:00', active: true },
      { id: 'tn_soir', name: 'Tunisia Soir', time: '17:00', active: true }
    ];
    
    res.json({ draws: defaultDraws });
  } catch (error) {
    console.error('Erreur récupération tirages:', error);
    res.json({ draws: [] });
  }
});

// ============= ROUTES REPORTS =============
app.get('/api/reports', async (req, res) => {
  try {
    const { agentId } = req.query;
    
    let query = `
      SELECT 
        COUNT(*) as total_tickets,
        COALESCE(SUM(total_amount), 0) as total_bets,
        COALESCE(SUM(win_amount), 0) as total_wins
      FROM tickets 
      WHERE date >= CURRENT_DATE
    `;
    
    const params = [];
    if (agentId) {
      params.push(agentId);
      query += ` AND agent_id = $${params.length}`;
    }
    
    const result = await pool.query(query, params);
    const stats = result.rows[0] || { total_tickets: 0, total_bets: 0, total_wins: 0 };
    
    const totalLoss = stats.total_bets - stats.total_wins;
    
    res.json({
      totalTickets: parseInt(stats.total_tickets),
      totalBets: parseFloat(stats.total_bets),
      totalWins: parseFloat(stats.total_wins),
      totalLoss: parseFloat(totalLoss),
      balance: parseFloat(totalLoss),
      breakdown: {}
    });
  } catch (error) {
    console.error('Erreur rapports:', error);
    res.json({
      totalTickets: 0,
      totalBets: 0,
      totalWins: 0,
      totalLoss: 0,
      balance: 0,
      breakdown: {}
    });
  }
});

// ============= ROUTES GAGNANTS =============
app.get('/api/winners', async (req, res) => {
  try {
    const { agentId } = req.query;
    
    let query = `
      SELECT * FROM winning_tickets 
      WHERE 1=1
    `;
    const params = [];
    
    if (agentId) {
      params.push(agentId);
      query += ` AND agent_id = $${params.length}`;
    }
    
    query += ' ORDER BY date DESC LIMIT 20';
    
    const result = await pool.query(query, params);
    
    res.json({ winners: result.rows });
  } catch (error) {
    console.error('Erreur gagnants:', error);
    res.json({ winners: [] });
  }
});

// ============= ROUTES CONFIGURATION =============
app.get('/api/lottery-config', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM lottery_config LIMIT 1');
    
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.json({
        name: 'LOTATO PRO',
        logo: '',
        address: '',
        phone: ''
      });
    }
  } catch (error) {
    console.error('Erreur config:', error);
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
    
    res.json({ success: true, message: 'Configuration sauvegardée' });
  } catch (error) {
    console.error('Erreur sauvegarde config:', error);
    res.status(500).json({ error: 'Erreur sauvegarde' });
  }
});

// ============= ROUTES AGENTS =============
app.get('/api/agents', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, s.name as supervisor_name
      FROM agents a
      LEFT JOIN supervisors s ON a.supervisor_id = s.id
      WHERE a.active = true
      ORDER BY a.name
    `);
    
    res.json({ agents: result.rows });
  } catch (error) {
    console.error('Erreur agents:', error);
    res.json({ agents: [] });
  }
});

// ============= ROUTES SUPERVISEURS =============
app.get('/api/supervisors', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, COUNT(a.id) as agents_count
      FROM supervisors s
      LEFT JOIN agents a ON s.id = a.supervisor_id AND a.active = true
      WHERE s.active = true
      GROUP BY s.id
      ORDER BY s.name
    `);
    
    res.json({ supervisors: result.rows });
  } catch (error) {
    console.error('Erreur superviseurs:', error);
    res.json({ supervisors: [] });
  }
});

// ============= NUMÉROS BLOQUÉS =============
app.get('/api/blocked-numbers', async (req, res) => {
  try {
    const result = await pool.query('SELECT number FROM blocked_numbers');
    const blocked = result.rows.map(row => row.number);
    res.json({ blockedNumbers: blocked });
  } catch (error) {
    console.error('Erreur numéros bloqués:', error);
    res.json({ blockedNumbers: [] });
  }
});

app.post('/api/blocked-numbers', async (req, res) => {
  try {
    const { number } = req.body;
    
    await pool.query(
      'INSERT INTO blocked_numbers (number) VALUES ($1) ON CONFLICT (number) DO NOTHING',
      [number]
    );
    
    res.json({ success: true, message: `Numéro ${number} bloqué` });
  } catch (error) {
    console.error('Erreur blocage:', error);
    res.status(500).json({ error: 'Erreur blocage' });
  }
});

// ============= ACTIVITÉ =============
app.get('/api/activity', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM activity_log 
      ORDER BY timestamp DESC 
      LIMIT 50
    `);
    
    res.json({ activity: result.rows });
  } catch (error) {
    console.error('Erreur activité:', error);
    res.json({ activity: [] });
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
  res.status(404).json({ error: 'Route API non trouvée' });
});

// Route 404 pour pages
app.use('*', (req, res) => {
  res.status(404).send('Page non trouvée');
});

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error('🔥 Erreur serveur:', err.stack);
  res.status(500).json({ 
    error: 'Erreur serveur interne',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Démarrer le serveur
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur LOTATO démarré sur http://0.0.0.0:${PORT}`);
  console.log(`📊 Health: http://0.0.0.0:${PORT}/api/health`);
  console.log(`🔐 Login test: curl -X POST http://0.0.0.0:${PORT}/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123","role":"owner"}'`);
});