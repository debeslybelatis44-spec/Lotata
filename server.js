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

// Initialiser les tables si elles n'existent pas
async function initializeDatabase() {
  try {
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
        date TIMESTAMP DEFAULT NOW(),
        checked BOOLEAN DEFAULT false
      )
    `);

    // Table des tirages
    await pool.query(`
      CREATE TABLE IF NOT EXISTS draws (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100),
        time VARCHAR(10),
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

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
        phone VARCHAR(20),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('✅ Tables initialisées avec succès');
  } catch (error) {
    console.error('❌ Erreur initialisation base de données:', error);
  }
}

// Middleware d'authentification
const authenticateToken = (req, res, next) => {
  // Pour les routes publiques, on passe
  const publicRoutes = ['/api/health', '/api/auth/login', '/api/draws/public'];
  if (publicRoutes.includes(req.path)) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'lotato-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalide' });
    }
    req.user = user;
    next();
  });
};

// Middleware pour vérifier le rôle
const requireRole = (role) => {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    next();
  };
};

// Middleware pour vérifier que l'agent appartient au superviseur
const checkAgentOwnership = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (req.user.role === 'supervisor') {
      // Vérifier que l'agent appartient à ce superviseur
      const agentCheck = await pool.query(
        'SELECT id FROM agents WHERE id = $1 AND supervisor_id = (SELECT id FROM supervisors WHERE email = $2)',
        [parseInt(id), req.user.username]
      );
      
      if (agentCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Agent non autorisé' });
      }
    }
    
    next();
  } catch (error) {
    console.error('Erreur vérification propriété:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
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

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true, message: 'Déconnecté avec succès' });
});

// Verify token
app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// ============= ROUTES SUPERVISEUR =============

// Vérification authentification superviseur
app.get('/api/supervisor/auth/verify', authenticateToken, requireRole('supervisor'), async (req, res) => {
  try {
    // Récupérer les informations du superviseur depuis la base de données
    const supervisorResult = await pool.query(
      'SELECT id, name, email, phone FROM supervisors WHERE email = $1',
      [req.user.username]
    );

    if (supervisorResult.rows.length === 0) {
      return res.status(404).json({ error: 'Superviseur non trouvé' });
    }

    const supervisor = supervisorResult.rows[0];
    
    // Récupérer les agents assignés
    const agentsResult = await pool.query(
      'SELECT id FROM agents WHERE supervisor_id = $1 AND active = true',
      [supervisor.id]
    );

    res.json({
      id: supervisor.id.toString(),
      name: supervisor.name,
      email: supervisor.email,
      role: 'supervisor',
      agents: agentsResult.rows.map(a => a.id.toString())
    });
  } catch (error) {
    console.error('Erreur vérification superviseur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Données superviseur
app.get('/api/supervisor/data', authenticateToken, requireRole('supervisor'), async (req, res) => {
  try {
    const supervisorResult = await pool.query(
      'SELECT id, name, email, phone, created_at FROM supervisors WHERE email = $1',
      [req.user.username]
    );

    if (supervisorResult.rows.length === 0) {
      return res.status(404).json({ error: 'Superviseur non trouvé' });
    }

    const supervisor = supervisorResult.rows[0];
    
    // Statistiques
    const today = new Date().toISOString().split('T')[0];
    
    const salesResult = await pool.query(`
      SELECT 
        COUNT(t.id) as total_tickets,
        COALESCE(SUM(t.total_amount), 0) as total_sales,
        COALESCE(SUM(t.win_amount), 0) as total_wins
      FROM tickets t
      JOIN agents a ON t.agent_id = a.id::text
      WHERE a.supervisor_id = $1 AND DATE(t.date) = $2
    `, [supervisor.id, today]);

    const agentsResult = await pool.query(
      'SELECT COUNT(*) as total_agents FROM agents WHERE supervisor_id = $1 AND active = true',
      [supervisor.id]
    );

    res.json({
      supervisor: {
        id: supervisor.id.toString(),
        name: supervisor.name,
        email: supervisor.email,
        phone: supervisor.phone,
        createdAt: supervisor.created_at
      },
      stats: {
        totalTickets: parseInt(salesResult.rows[0]?.total_tickets) || 0,
        totalSales: parseFloat(salesResult.rows[0]?.total_sales) || 0,
        totalWins: parseFloat(salesResult.rows[0]?.total_wins) || 0,
        totalAgents: parseInt(agentsResult.rows[0]?.total_agents) || 0,
        commission: parseFloat(salesResult.rows[0]?.total_sales) * 0.05 || 0
      }
    });
  } catch (error) {
    console.error('Erreur données superviseur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Liste des agents assignés
app.get('/api/supervisor/agents', authenticateToken, requireRole('supervisor'), async (req, res) => {
  try {
    // Récupérer l'ID du superviseur
    const supervisorResult = await pool.query(
      'SELECT id FROM supervisors WHERE email = $1',
      [req.user.username]
    );

    if (supervisorResult.rows.length === 0) {
      return res.status(404).json({ error: 'Superviseur non trouvé' });
    }

    const supervisorId = supervisorResult.rows[0].id;
    const today = new Date().toISOString().split('T')[0];

    // Récupérer les agents avec leurs statistiques
    const agentsResult = await pool.query(`
      SELECT 
        a.id,
        a.name,
        a.email,
        a.phone,
        a.location,
        a.commission,
        a.active,
        a.created_at,
        COUNT(t.id) as ticket_count,
        COALESCE(SUM(t.total_amount), 0) as today_sales,
        COALESCE(SUM(t.win_amount), 0) as total_wins,
        MAX(t.date) as last_activity
      FROM agents a
      LEFT JOIN tickets t ON a.id::text = t.agent_id AND DATE(t.date) = $2
      WHERE a.supervisor_id = $1
      GROUP BY a.id
      ORDER BY a.name
    `, [supervisorId, today]);

    const agents = agentsResult.rows.map(agent => ({
      id: agent.id.toString(),
      name: agent.name,
      email: agent.email,
      phone: agent.phone,
      location: agent.location,
      commission: parseFloat(agent.commission),
      active: agent.active,
      blocked: !agent.active,
      online: Math.random() > 0.3, // Simulation
      lastActivity: agent.last_activity || agent.created_at,
      todaySales: parseFloat(agent.today_sales) || 0,
      totalWins: parseFloat(agent.total_wins) || 0,
      ticketCount: parseInt(agent.ticket_count) || 0,
      createdAt: agent.created_at
    }));

    res.json(agents);
  } catch (error) {
    console.error('Erreur récupération agents:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Détails d'un agent spécifique
app.get('/api/supervisor/agent/:id/details', authenticateToken, requireRole('supervisor'), checkAgentOwnership, async (req, res) => {
  try {
    const { id } = req.params;
    const today = new Date().toISOString().split('T')[0];

    const agentResult = await pool.query(`
      SELECT 
        a.*,
        s.name as supervisor_name,
        COUNT(t.id) as total_tickets,
        COALESCE(SUM(t.total_amount), 0) as total_sales,
        COALESCE(SUM(t.win_amount), 0) as total_wins,
        MAX(t.date) as last_activity
      FROM agents a
      LEFT JOIN supervisors s ON a.supervisor_id = s.id
      LEFT JOIN tickets t ON a.id::text = t.agent_id
      WHERE a.id = $1
      GROUP BY a.id, s.name
    `, [parseInt(id)]);

    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Agent non trouvé' });
    }

    const agent = agentResult.rows[0];
    
    // Statistiques du jour
    const todayStatsResult = await pool.query(`
      SELECT 
        COUNT(*) as ticket_count,
        COALESCE(SUM(total_amount), 0) as today_sales,
        COALESCE(SUM(win_amount), 0) as today_wins
      FROM tickets 
      WHERE agent_id = $1 AND DATE(date) = $2
    `, [id, today]);

    const todayStats = todayStatsResult.rows[0];

    res.json({
      id: agent.id.toString(),
      name: agent.name,
      email: agent.email,
      phone: agent.phone,
      location: agent.location,
      commission: parseFloat(agent.commission),
      supervisorName: agent.supervisor_name,
      active: agent.active,
      blocked: !agent.active,
      online: Math.random() > 0.3,
      createdAt: agent.created_at,
      lastActivity: agent.last_activity,
      stats: {
        totalTickets: parseInt(agent.total_tickets) || 0,
        totalSales: parseFloat(agent.total_sales) || 0,
        totalWins: parseFloat(agent.total_wins) || 0,
        todayTickets: parseInt(todayStats?.ticket_count) || 0,
        todaySales: parseFloat(todayStats?.today_sales) || 0,
        todayWins: parseFloat(todayStats?.today_wins) || 0,
        commission: parseFloat(todayStats?.today_sales) * (parseFloat(agent.commission) / 100) || 0
      }
    });
  } catch (error) {
    console.error('Erreur détails agent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Tickets d'un agent
app.get('/api/supervisor/agent/:id/tickets', authenticateToken, requireRole('supervisor'), checkAgentOwnership, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50 } = req.query;

    const ticketsResult = await pool.query(`
      SELECT 
        id,
        ticket_id,
        draw_id,
        draw_name,
        bets,
        total_amount,
        win_amount,
        date,
        checked
      FROM tickets 
      WHERE agent_id = $1
      ORDER BY date DESC
      LIMIT $2
    `, [id, parseInt(limit)]);

    const tickets = ticketsResult.rows.map(ticket => ({
      id: ticket.id.toString(),
      ticketId: ticket.ticket_id,
      drawId: ticket.draw_id,
      drawName: ticket.draw_name,
      bets: typeof ticket.bets === 'string' ? JSON.parse(ticket.bets) : ticket.bets || [],
      total: parseFloat(ticket.total_amount) || 0,
      winAmount: parseFloat(ticket.win_amount) || 0,
      date: ticket.date,
      checked: ticket.checked,
      betsCount: Array.isArray(ticket.bets) ? ticket.bets.length : 
                 (typeof ticket.bets === 'string' ? JSON.parse(ticket.bets).length : 0)
    }));

    res.json(tickets);
  } catch (error) {
    console.error('Erreur tickets agent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Gains d'un agent
app.get('/api/supervisor/agent/:id/wins', authenticateToken, requireRole('supervisor'), checkAgentOwnership, async (req, res) => {
  try {
    const { id } = req.params;

    const winsResult = await pool.query(`
      SELECT 
        id,
        ticket_id,
        draw_id,
        draw_name,
        bets,
        total_amount,
        win_amount,
        date
      FROM tickets 
      WHERE agent_id = $1 AND win_amount > 0
      ORDER BY date DESC
      LIMIT 20
    `, [id]);

    const wins = winsResult.rows.map(win => ({
      id: win.id.toString(),
      ticketId: win.ticket_id,
      drawId: win.draw_id,
      drawName: win.draw_name,
      numbers: typeof win.bets === 'string' ? 
        JSON.parse(win.bets).map(b => b.number).join(', ') : 
        (Array.isArray(win.bets) ? win.bets.map(b => b.number).join(', ') : ''),
      amount: parseFloat(win.win_amount) || 0,
      date: win.date,
      totalAmount: parseFloat(win.total_amount) || 0
    }));

    res.json(wins);
  } catch (error) {
    console.error('Erreur gains agent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer un ticket
app.delete('/api/supervisor/ticket/:id', authenticateToken, requireRole('supervisor'), async (req, res) => {
  try {
    const { id } = req.params;

    // Vérifier que le ticket appartient à un agent du superviseur
    const ticketCheck = await pool.query(`
      SELECT t.id 
      FROM tickets t
      JOIN agents a ON t.agent_id = a.id::text
      JOIN supervisors s ON a.supervisor_id = s.id
      WHERE t.id = $1 AND s.email = $2
    `, [parseInt(id), req.user.username]);

    if (ticketCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Ticket non autorisé' });
    }

    // Vérifier si le ticket a moins de 10 minutes
    const ticketResult = await pool.query(
      'SELECT date FROM tickets WHERE id = $1',
      [parseInt(id)]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket non trouvé' });
    }

    const ticketDate = new Date(ticketResult.rows[0].date);
    const now = new Date();
    const diffMinutes = (now - ticketDate) / (1000 * 60);

    if (diffMinutes > 10) {
      return res.status(400).json({ error: 'Ticket trop ancien pour être supprimé (>10 min)' });
    }

    // Supprimer le ticket
    await pool.query('DELETE FROM tickets WHERE id = $1', [parseInt(id)]);

    // Journal d'activité
    await pool.query(
      `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [req.user.id, 'supervisor', 'delete_ticket', `Ticket ${id} supprimé`]
    );

    res.json({ success: true, message: 'Ticket supprimé avec succès' });
  } catch (error) {
    console.error('Erreur suppression ticket:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Bloquer/Débloquer un agent
app.post('/api/supervisor/agent/:id/block', authenticateToken, requireRole('supervisor'), checkAgentOwnership, async (req, res) => {
  try {
    const { id } = req.params;
    const { blocked } = req.body;

    await pool.query(
      'UPDATE agents SET active = $1, updated_at = NOW() WHERE id = $2',
      [!blocked, parseInt(id)]
    );

    // Journal d'activité
    await pool.query(
      `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [req.user.id, 'supervisor', blocked ? 'block_agent' : 'unblock_agent', 
       `Agent ${id} ${blocked ? 'bloqué' : 'débloqué'}`]
    );

    res.json({ 
      success: true, 
      message: `Agent ${blocked ? 'bloqué' : 'débloqué'} avec succès` 
    });
  } catch (error) {
    console.error('Erreur blocage agent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer les tickets récents d'un agent
app.delete('/api/supervisor/agent/:id/tickets/recent', authenticateToken, requireRole('supervisor'), checkAgentOwnership, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Calculer la date limite (10 minutes avant maintenant)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    // Supprimer les tickets récents
    const deleteResult = await pool.query(`
      DELETE FROM tickets 
      WHERE agent_id = $1 AND date > $2
      RETURNING id
    `, [id, tenMinutesAgo]);
    
    const deletedCount = deleteResult.rowCount;

    // Journal d'activité
    await pool.query(
      `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [req.user.id, 'supervisor', 'delete_recent_tickets', 
       `${deletedCount} tickets récents supprimés pour l'agent ${id}`]
    );

    res.json({ 
      success: true, 
      message: `${deletedCount} tickets récents supprimés`,
      count: deletedCount
    });
  } catch (error) {
    console.error('Erreur suppression tickets récents:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Rapports pour superviseur
app.get('/api/supervisor/reports', authenticateToken, requireRole('supervisor'), async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    
    // Récupérer l'ID du superviseur
    const supervisorResult = await pool.query(
      'SELECT id FROM supervisors WHERE email = $1',
      [req.user.username]
    );

    if (supervisorResult.rows.length === 0) {
      return res.status(404).json({ error: 'Superviseur non trouvé' });
    }

    const supervisorId = supervisorResult.rows[0].id;
    
    // Définir la période
    let dateFilter = 'DATE(t.date) = CURRENT_DATE';
    let periodLabel = 'Aujourd\'hui';
    
    if (period === 'yesterday') {
      dateFilter = 'DATE(t.date) = CURRENT_DATE - INTERVAL \'1 day\'';
      periodLabel = 'Hier';
    } else if (period === 'week') {
      dateFilter = 't.date >= CURRENT_DATE - INTERVAL \'7 days\'';
      periodLabel = '7 derniers jours';
    } else if (period === 'month') {
      dateFilter = 't.date >= CURRENT_DATE - INTERVAL \'30 days\'';
      periodLabel = '30 derniers jours';
    }

    // Statistiques générales
    const statsResult = await pool.query(`
      SELECT 
        COUNT(t.id) as total_tickets,
        COALESCE(SUM(t.total_amount), 0) as total_sales,
        COALESCE(SUM(t.win_amount), 0) as total_wins,
        COUNT(DISTINCT t.agent_id) as active_agents
      FROM tickets t
      JOIN agents a ON t.agent_id = a.id::text
      WHERE a.supervisor_id = $1 AND ${dateFilter}
    `, [supervisorId]);

    // Meilleur agent
    const topAgentResult = await pool.query(`
      SELECT 
        a.name,
        SUM(t.total_amount) as total_sales,
        COUNT(t.id) as ticket_count
      FROM tickets t
      JOIN agents a ON t.agent_id = a.id::text
      WHERE a.supervisor_id = $1 AND ${dateFilter}
      GROUP BY a.id, a.name
      ORDER BY total_sales DESC
      LIMIT 1
    `, [supervisorId]);

    // Tirage le plus populaire
    const popularDrawResult = await pool.query(`
      SELECT 
        draw_name,
        COUNT(*) as ticket_count,
        SUM(total_amount) as total_sales
      FROM tickets t
      JOIN agents a ON t.agent_id = a.id::text
      WHERE a.supervisor_id = $1 AND ${dateFilter}
      GROUP BY draw_name
      ORDER BY ticket_count DESC
      LIMIT 1
    `, [supervisorId]);

    // Heure de pointe
    const peakHourResult = await pool.query(`
      SELECT 
        EXTRACT(HOUR FROM date) as hour,
        COUNT(*) as ticket_count
      FROM tickets t
      JOIN agents a ON t.agent_id = a.id::text
      WHERE a.supervisor_id = $1 AND ${dateFilter}
      GROUP BY EXTRACT(HOUR FROM date)
      ORDER BY ticket_count DESC
      LIMIT 1
    `, [supervisorId]);

    // Données pour le graphique (ventes par agent)
    const salesByAgentResult = await pool.query(`
      SELECT 
        a.name as agent_name,
        SUM(t.total_amount) as total_sales
      FROM tickets t
      JOIN agents a ON t.agent_id = a.id::text
      WHERE a.supervisor_id = $1 AND ${dateFilter}
      GROUP BY a.id, a.name
      ORDER BY total_sales DESC
      LIMIT 5
    `, [supervisorId]);

    const stats = statsResult.rows[0] || {};
    const topAgent = topAgentResult.rows[0] || { name: 'Aucun', total_sales: 0 };
    const popularDraw = popularDrawResult.rows[0] || { draw_name: 'Aucun', ticket_count: 0 };
    const peakHour = peakHourResult.rows[0] || { hour: 'N/A', ticket_count: 0 };

    res.json({
      period: periodLabel,
      todaySales: parseFloat(stats.total_sales) || 0,
      totalTickets: parseInt(stats.total_tickets) || 0,
      totalWins: parseFloat(stats.total_wins) || 0,
      activeAgents: parseInt(stats.active_agents) || 0,
      topAgent: topAgent.name,
      topAgentSales: parseFloat(topAgent.total_sales) || 0,
      mostPopularDraw: popularDraw.draw_name,
      popularDrawTickets: parseInt(popularDraw.ticket_count) || 0,
      peakHour: peakHour.hour ? `${peakHour.hour}:00` : 'N/A',
      peakHourTickets: parseInt(peakHour.ticket_count) || 0,
      salesData: {
        labels: salesByAgentResult.rows.map(r => r.agent_name),
        values: salesByAgentResult.rows.map(r => parseFloat(r.total_sales) || 0)
      }
    });
  } catch (error) {
    console.error('Erreur rapports superviseur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Logout superviseur
app.post('/api/supervisor/logout', authenticateToken, requireRole('supervisor'), (req, res) => {
  res.json({ success: true, message: 'Déconnecté avec succès' });
});

// Appliquer l'authentification aux routes API
app.use('/api', authenticateToken);

// ============= ROUTES EXISTANTES (Conservées) =============

// ROUTES TICKETS
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
        INSERT INTO tickets (ticket_id, agent_id, agent_name, draw_id, draw_name, bets, total_amount, date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;
      
      const ticketResult = await pool.query(ticketQuery, [
        ticketId.toString(),
        agentId,
        agentName || 'Agent Inconnu',
        drawId,
        drawName || drawId,
        JSON.stringify(bets),
        parseFloat(total) || 0,
        now
      ]);

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

// ROUTES DRAWS
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

// ROUTES PROPRIÉTAIRE (conservées)
app.get('/api/reports/dashboard', async (req, res) => {
  try {
    // Statistiques agents
    const agentsCount = await pool.query('SELECT COUNT(*) FROM agents WHERE active = true');
    const supervisorsCount = await pool.query('SELECT COUNT(*) FROM supervisors WHERE active = true');
    
    // Statistiques tickets du jour
    const ticketsToday = await pool.query(`
      SELECT 
        COUNT(*) as total_tickets,
        COALESCE(SUM(total_amount), 0) as total_bets,
        COALESCE(SUM(win_amount), 0) as total_wins
      FROM tickets 
      WHERE DATE(date) = CURRENT_DATE
    `);
    
    // Numéros bloqués
    const blockedNumbers = await pool.query('SELECT COUNT(*) FROM blocked_numbers');
    
    // Tirages actifs
    const activeDraws = await pool.query('SELECT COUNT(*) FROM draws WHERE active = true');
    
    res.json({
      totalUsers: parseInt(agentsCount.rows[0].count) + parseInt(supervisorsCount.rows[0].count),
      totalSales: parseFloat(ticketsToday.rows[0].total_bets) || 0,
      totalTickets: parseInt(ticketsToday.rows[0].total_tickets) || 0,
      totalWins: parseFloat(ticketsToday.rows[0].total_wins) || 0,
      totalBlocks: parseInt(blockedNumbers.rows[0].count) || 0,
      totalDraws: parseInt(activeDraws.rows[0].count) || 0,
      onlineUsers: Math.floor(Math.random() * 10) + 5 // Simulation
    });
  } catch (error) {
    console.error('Erreur dashboard:', error);
    res.json({
      totalUsers: 0,
      totalSales: 0,
      totalTickets: 0,
      totalWins: 0,
      totalBlocks: 0,
      totalDraws: 0,
      onlineUsers: 0
    });
  }
});

// Route unifiée pour les utilisateurs
app.get('/api/users', async (req, res) => {
  try {
    const { type } = req.query;
    
    if (type === 'supervisor' || !type) {
      // Compter les agents par superviseur
      const supervisorsWithCount = await pool.query(`
        SELECT 
          s.id, s.name, s.email, s.phone, s.active, s.created_at,
          COUNT(a.id) as agents_count
        FROM supervisors s
        LEFT JOIN agents a ON s.id = a.supervisor_id AND a.active = true
        GROUP BY s.id
        ORDER BY s.name
      `);
      
      // Calculer les ventes pour chaque superviseur
      const supervisorsFormatted = await Promise.all(supervisorsWithCount.rows.map(async (s) => {
        const salesResult = await pool.query(`
          SELECT COALESCE(SUM(t.total_amount), 0) as total_sales
          FROM tickets t
          JOIN agents a ON t.agent_id = a.id::text
          WHERE a.supervisor_id = $1 AND DATE(t.date) = CURRENT_DATE
        `, [s.id]);
        
        return {
          id: s.id.toString(),
          name: s.name,
          email: s.email,
          phone: s.phone,
          blocked: !s.active,
          online: Math.random() > 0.5, // Simulation
          role: 'supervisor',
          createdAt: s.created_at,
          agentsCount: parseInt(s.agents_count),
          sales: parseFloat(salesResult.rows[0]?.total_sales) || 0
        };
      }));
      
      if (type === 'supervisor') {
        return res.json({ supervisors: supervisorsFormatted, agents: [] });
      }
      
      // Récupérer les agents
      const agentsResult = await pool.query(`
        SELECT 
          a.id, a.name, a.email, a.phone, a.location, a.commission,
          a.active, a.created_at, a.supervisor_id,
          s.name as supervisor_name
        FROM agents a
        LEFT JOIN supervisors s ON a.supervisor_id = s.id
        ORDER BY a.name
      `);
      
      // Calculer les ventes et tickets pour chaque agent
      const agentsFormatted = await Promise.all(agentsResult.rows.map(async (a) => {
        const statsResult = await pool.query(`
          SELECT 
            COUNT(*) as ticket_count,
            COALESCE(SUM(total_amount), 0) as total_sales
          FROM tickets 
          WHERE agent_id = $1 AND DATE(date) = CURRENT_DATE
        `, [a.id.toString()]);
        
        return {
          id: a.id.toString(),
          name: a.name,
          email: a.email,
          phone: a.phone,
          location: a.location,
          commission: parseFloat(a.commission),
          supervisorName: a.supervisor_name || 'Non assigné',
          supervisorId: a.supervisor_id,
          blocked: !a.active,
          online: Math.random() > 0.5, // Simulation
          role: 'agent',
          createdAt: a.created_at,
          sales: parseFloat(statsResult.rows[0]?.total_sales) || 0,
          tickets: parseInt(statsResult.rows[0]?.ticket_count) || 0
        };
      }));
      
      return res.json({
        supervisors: supervisorsFormatted,
        agents: agentsFormatted
      });
    }
    
    if (type === 'agent') {
      const agentsResult = await pool.query(`
        SELECT 
          a.id, a.name, a.email, a.phone, a.location, a.commission,
          a.active, a.created_at, a.supervisor_id,
          s.name as supervisor_name
        FROM agents a
        LEFT JOIN supervisors s ON a.supervisor_id = s.id
        ORDER BY a.name
      `);
      
      const agentsFormatted = await Promise.all(agentsResult.rows.map(async (a) => {
        const statsResult = await pool.query(`
          SELECT 
            COUNT(*) as ticket_count,
            COALESCE(SUM(total_amount), 0) as total_sales
          FROM tickets 
          WHERE agent_id = $1 AND DATE(date) = CURRENT_DATE
        `, [a.id.toString()]);
        
        return {
          id: a.id.toString(),
          name: a.name,
          email: a.email,
          phone: a.phone,
          location: a.location,
          commission: parseFloat(a.commission),
          supervisorName: a.supervisor_name || 'Non assigné',
          supervisorId: a.supervisor_id,
          blocked: !a.active,
          online: Math.random() > 0.5,
          role: 'agent',
          createdAt: a.created_at,
          sales: parseFloat(statsResult.rows[0]?.total_sales) || 0,
          tickets: parseInt(statsResult.rows[0]?.ticket_count) || 0
        };
      }));
      
      return res.json({ supervisors: [], agents: agentsFormatted });
    }
    
  } catch (error) {
    console.error('Erreur récupération utilisateurs:', error);
    res.json({ supervisors: [], agents: [] });
  }
});

// Créer un utilisateur
app.post('/api/users', async (req, res) => {
  try {
    const { name, email, phone, password, role, supervisorId, location, commission } = req.body;
    
    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);
    
    if (role === 'supervisor') {
      const result = await pool.query(
        `INSERT INTO supervisors (name, email, phone, password, active, created_at)
         VALUES ($1, $2, $3, $4, true, NOW()) RETURNING *`,
        [name, email, phone, hashedPassword]
      );
      
      const user = result.rows[0];
      
      // Journal d'activité
      await pool.query(
        `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
         VALUES ($1, $2, $3, $4, NOW())`,
        [req.user?.id || 'system', 'owner', 'create_supervisor', `Superviseur ${name} créé`]
      );
      
      res.status(201).json({
        id: user.id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        active: user.active
      });
      
    } else if (role === 'agent') {
      const result = await pool.query(
        `INSERT INTO agents (name, email, phone, password, supervisor_id, location, commission, active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW()) RETURNING *`,
        [name, email, phone, hashedPassword, supervisorId, location, commission || 5]
      );
      
      const user = result.rows[0];
      
      // Journal d'activité
      await pool.query(
        `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
         VALUES ($1, $2, $3, $4, NOW())`,
        [req.user?.id || 'system', 'owner', 'create_agent', `Agent ${name} créé`]
      );
      
      res.status(201).json({
        id: user.id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        location: user.location,
        commission: parseFloat(user.commission),
        supervisorId: user.supervisor_id,
        active: user.active
      });
    } else {
      res.status(400).json({ error: 'Rôle invalide' });
    }
    
  } catch (error) {
    console.error('Erreur création utilisateur:', error);
    res.status(500).json({ error: 'Erreur serveur: ' + error.message });
  }
});

// Mettre à jour un utilisateur
app.put('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userData = req.body;
    
    // Vérifier si c'est un agent ou superviseur
    const isAgent = await pool.query('SELECT id FROM agents WHERE id = $1', [parseInt(id)]);
    
    if (isAgent.rows.length > 0) {
      const { name, email, phone, location, commission, supervisorId } = userData;
      const result = await pool.query(
        `UPDATE agents 
         SET name = $1, email = $2, phone = $3, location = $4, 
             commission = $5, supervisor_id = $6, updated_at = NOW()
         WHERE id = $7 RETURNING *`,
        [name, email, phone, location, commission, supervisorId, parseInt(id)]
      );
      
      res.json({ success: true, user: result.rows[0] });
    } else {
      // C'est probablement un superviseur
      const { name, email, phone } = userData;
      const result = await pool.query(
        `UPDATE supervisors 
         SET name = $1, email = $2, phone = $3, updated_at = NOW()
         WHERE id = $4 RETURNING *`,
        [name, email, phone, parseInt(id)]
      );
      
      res.json({ success: true, user: result.rows[0] });
    }
  } catch (error) {
    console.error('Erreur mise à jour utilisateur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer un utilisateur
app.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Vérifier si c'est un agent ou superviseur
    const isAgent = await pool.query('SELECT id FROM agents WHERE id = $1', [parseInt(id)]);
    
    if (isAgent.rows.length > 0) {
      await pool.query('DELETE FROM agents WHERE id = $1', [parseInt(id)]);
    } else {
      await pool.query('DELETE FROM supervisors WHERE id = $1', [parseInt(id)]);
    }
    
    res.json({ success: true, message: 'Utilisateur supprimé' });
  } catch (error) {
    console.error('Erreur suppression utilisateur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Blocage utilisateur
app.patch('/api/users/:id/block', async (req, res) => {
  try {
    const { id } = req.params;
    const { blocked } = req.body;
    
    // Vérifier si c'est un agent ou superviseur
    const isAgent = await pool.query('SELECT id FROM agents WHERE id = $1', [parseInt(id)]);
    const isSupervisor = await pool.query('SELECT id FROM supervisors WHERE id = $1', [parseInt(id)]);
    
    if (isAgent.rows.length > 0) {
      await pool.query('UPDATE agents SET active = $1 WHERE id = $2', [!blocked, parseInt(id)]);
    } else if (isSupervisor.rows.length > 0) {
      await pool.query('UPDATE supervisors SET active = $1 WHERE id = $2', [!blocked, parseInt(id)]);
    } else {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    res.json({ success: true, message: `Utilisateur ${blocked ? 'bloqué' : 'débloqué'}` });
  } catch (error) {
    console.error('Erreur blocage utilisateur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ROUTES PROPRIÉTAIRE (autres routes conservées)
// Gestion des numéros
app.get('/api/numbers', async (req, res) => {
  try {
    const blocked = await pool.query('SELECT number FROM blocked_numbers');
    const blockedNumbers = blocked.rows.map(r => r.number);
    
    const limits = await pool.query('SELECT number, limit_amount FROM number_limits');
    const limitsMap = {};
    limits.rows.forEach(row => {
      limitsMap[row.number] = parseFloat(row.limit_amount);
    });
    
    res.json({
      blocked: blockedNumbers,
      limits: limitsMap
    });
  } catch (error) {
    console.error('Erreur numéros:', error);
    res.json({ blocked: [], limits: {} });
  }
});

// Bloquer un numéro
app.post('/api/numbers/block', async (req, res) => {
  try {
    const { number } = req.body;
    
    await pool.query(
      'INSERT INTO blocked_numbers (number) VALUES ($1) ON CONFLICT (number) DO NOTHING',
      [number]
    );
    
    // Journal d'activité
    await pool.query(
      `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [req.user?.id || 'system', 'owner', 'block_number', `Numéro ${number} bloqué`]
    );
    
    res.json({ success: true, message: `Numéro ${number} bloqué` });
  } catch (error) {
    console.error('Erreur blocage numéro:', error);
    res.status(500).json({ error: 'Erreur serveur' });
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

// Initialiser la base de données et démarrer le serveur
initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur LOTATO démarré sur http://0.0.0.0:${PORT}`);
    console.log(`📊 Health: http://0.0.0.0:${PORT}/api/health`);
    console.log(`🔐 Login test: curl -X POST http://0.0.0.0:${PORT}/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123","role":"owner"}'`);
    console.log(`👑 Panneau propriétaire: http://0.0.0.0:${PORT}/owner.html`);
    console.log(`👥 Panneau superviseur: http://0.0.0.0:${PORT}/responsable.html`);
  });
});