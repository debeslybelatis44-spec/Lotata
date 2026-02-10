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

    // Table des tirages
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
        last_draw TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
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

    // Insérer des tirages par défaut
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
      await pool.query(`
        INSERT INTO draws (id, name, time, active)
        VALUES ($1, $2, $3, true)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          time = EXCLUDED.time,
          updated_at = NOW()
      `, [draw.id, draw.name, draw.time]);
    }

    // Configuration loterie par défaut
    await pool.query(`
      INSERT INTO lottery_config (name, logo, address, phone)
      VALUES ('LOTATO PRO', 'https://raw.githubusercontent.com/your-username/your-repo/main/logo.png', '', '')
      ON CONFLICT (id) DO NOTHING
    `);

    console.log('✅ Tables initialisées avec succès');
  } catch (error) {
    console.error('❌ Erreur initialisation base de données:', error);
  }
}

// Middleware d'authentification SIMPLIFIÉ POUR LE DÉVELOPPEMENT
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
    '/api/tickets/check-winners'
  ];
  
  if (publicRoutes.includes(req.path)) {
    return next();
  }

  // En mode développement, on accepte tout sans vérification
  if (process.env.NODE_ENV !== 'production') {
    req.user = { 
      id: 'owner-01', 
      username: 'admin',
      role: 'owner',
      name: 'Admin Propriétaire'
    };
    return next();
  }

  // En production, vérifier le token
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'lotato-secret-key', (err, user) => {
    if (err) {
      console.log('⚠️ Token invalide');
      return res.status(403).json({ error: 'Token invalide' });
    }
    req.user = user;
    next();
  });
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

    // Générer les tokens
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: role,
        name: user.name
      },
      process.env.JWT_SECRET || 'lotato-secret-key',
      { expiresIn: '1h' }
    );

    const refreshToken = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: role
      },
      process.env.JWT_SECRET || 'lotato-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      refreshToken,
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

// Rafraîchir le token
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const refreshToken = authHeader && authHeader.split(' ')[1];

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token manquant' });
    }

    jwt.verify(refreshToken, process.env.JWT_SECRET || 'lotato-secret-key', (err, user) => {
      if (err) {
        return res.status(403).json({ error: 'Refresh token invalide' });
      }

      const newToken = jwt.sign(
        {
          id: user.id,
          username: user.username,
          role: user.role,
          name: user.name
        },
        process.env.JWT_SECRET || 'lotato-secret-key',
        { expiresIn: '1h' }
      );

      res.json({
        success: true,
        token: newToken
      });
    });
  } catch (error) {
    console.error('Refresh token error:', error);
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

// Appliquer l'authentification aux routes API
app.use('/api', authenticateToken);

// ============= ROUTES RAPPORTS AGENT =============

// Rapports pour agent
app.get('/api/reports', async (req, res) => {
  try {
    const { agentId } = req.query;
    
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
    console.error('Erreur rapports agent:', error);
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
    console.error('Erreur rapport tirage:', error);
    res.json({
      totalTickets: 0,
      totalBets: 0,
      totalWins: 0,
      totalLoss: 0,
      balance: 0
    });
  }
});

// Marquer un gagnant comme payé
app.post('/api/winners/pay/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    
    // Mettre à jour le ticket
    await pool.query(
      'UPDATE tickets SET paid = true WHERE id = $1',
      [parseInt(ticketId)]
    );
    
    // Enregistrer le paiement
    const ticketInfo = await pool.query(
      'SELECT total_amount, win_amount FROM tickets WHERE id = $1',
      [parseInt(ticketId)]
    );
    
    if (ticketInfo.rows[0]) {
      const winAmount = ticketInfo.rows[0].win_amount || 0;
      
      await pool.query(
        `INSERT INTO payments (ticket_id, amount, confirmed_by, paid_at)
         VALUES ($1, $2, $3, NOW())`,
        [parseInt(ticketId), winAmount, req.user?.name || 'system']
      );
    }
    
    res.json({ success: true, message: 'Ticket marqué comme payé' });
  } catch (error) {
    console.error('Erreur paiement:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route agents améliorée
app.get('/api/agents', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        a.*, 
        s.name as supervisor_name,
        (SELECT COUNT(*) FROM tickets t WHERE t.agent_id = a.id::text AND DATE(t.date) = CURRENT_DATE) as tickets_today,
        (SELECT COALESCE(SUM(t.total_amount), 0) FROM tickets t WHERE t.agent_id = a.id::text AND DATE(t.date) = CURRENT_DATE) as sales_today
      FROM agents a
      LEFT JOIN supervisors s ON a.supervisor_id = s.id
      WHERE a.active = true
      ORDER BY a.name
    `);
    
    // Formater pour le front-end
    const agents = result.rows.map(agent => ({
      id: agent.id.toString(),
      name: agent.name,
      email: agent.email,
      phone: agent.phone,
      location: agent.location,
      commission: parseFloat(agent.commission),
      supervisorName: agent.supervisor_name || 'Non assigné',
      active: agent.active,
      ticketsToday: parseInt(agent.tickets_today) || 0,
      salesToday: parseFloat(agent.sales_today) || 0
    }));
    
    res.json({ agents });
  } catch (error) {
    console.error('Erreur agents:', error);
    res.json({ agents: [] });
  }
});

// ============= ROUTES PROPRIÉTAIRE =============

// Route tableau de bord principal
app.get('/api/reports/dashboard', async (req, res) => {
  try {
    console.log('📊 GET /api/reports/dashboard appelé par:', req.user);
    
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
    
    // En ligne simulation
    const onlineUsers = Math.floor(Math.random() * 10) + 5;
    
    res.json({
      totalUsers: parseInt(agentsCount.rows[0].count) + parseInt(supervisorsCount.rows[0].count),
      totalSales: parseFloat(ticketsToday.rows[0].total_bets) || 0,
      totalTickets: parseInt(ticketsToday.rows[0].total_tickets) || 0,
      totalWins: parseFloat(ticketsToday.rows[0].total_wins) || 0,
      totalBlocks: parseInt(blockedNumbers.rows[0].count) || 0,
      totalDraws: parseInt(activeDraws.rows[0].count) || 0,
      onlineUsers: onlineUsers
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

// Stats temps réel
app.get('/api/reports/dashboard/realtime', async (req, res) => {
  try {
    // Dernières ventes (1h)
    const recentSales = await pool.query(`
      SELECT COALESCE(SUM(total_amount), 0) as sales_last_hour
      FROM tickets 
      WHERE date >= NOW() - INTERVAL '1 hour'
    `);
    
    // Nouveaux tickets (30 min)
    const newTickets = await pool.query(`
      SELECT COUNT(*) as tickets_last_30min
      FROM tickets 
      WHERE date >= NOW() - INTERVAL '30 minutes'
    `);
    
    // Gains récents
    const recentWins = await pool.query(`
      SELECT COALESCE(SUM(win_amount), 0) as wins_last_hour
      FROM tickets 
      WHERE date >= NOW() - INTERVAL '1 hour' AND win_amount > 0
    `);
    
    res.json({
      salesLastHour: parseFloat(recentSales.rows[0].sales_last_hour) || 0,
      ticketsLast30Min: parseInt(newTickets.rows[0].tickets_last_30min) || 0,
      winsLastHour: parseFloat(recentWins.rows[0].wins_last_hour) || 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erreur stats temps réel:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= ROUTES UTILISATEURS =============

// Route unifiée pour les utilisateurs
app.get('/api/users', async (req, res) => {
  try {
    console.log('👥 GET /api/users appelé');
    console.log('📦 Query params:', req.query);
    console.log('👤 User:', req.user);
    
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
          online: Math.random() > 0.5,
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
          online: Math.random() > 0.5,
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

// Obtenir un utilisateur par ID
app.get('/api/users/:id', async (req, res) => {
  try {
    console.log('👤 GET /api/users/:id appelé', req.params.id);
    const { id } = req.params;
    
    // Vérifier si c'est un agent
    const agentResult = await pool.query('SELECT * FROM agents WHERE id = $1', [parseInt(id)]);
    
    if (agentResult.rows.length > 0) {
      const agent = agentResult.rows[0];
      const supervisorResult = await pool.query('SELECT name FROM supervisors WHERE id = $1', [agent.supervisor_id]);
      
      // Statistiques de l'agent
      const statsResult = await pool.query(`
        SELECT 
          COUNT(*) as total_tickets,
          COALESCE(SUM(total_amount), 0) as total_sales,
          COALESCE(SUM(win_amount), 0) as total_wins
        FROM tickets 
        WHERE agent_id = $1 AND DATE(date) = CURRENT_DATE
      `, [id]);
      
      return res.json({
        id: agent.id.toString(),
        name: agent.name,
        email: agent.email,
        phone: agent.phone,
        location: agent.location,
        commission: parseFloat(agent.commission),
        supervisorId: agent.supervisor_id,
        supervisorName: supervisorResult.rows[0]?.name || 'Non assigné',
        role: 'agent',
        blocked: !agent.active,
        online: Math.random() > 0.5,
        createdAt: agent.created_at,
        ticketsToday: parseInt(statsResult.rows[0]?.total_tickets) || 0,
        salesToday: parseFloat(statsResult.rows[0]?.total_sales) || 0,
        winsToday: parseFloat(statsResult.rows[0]?.total_wins) || 0
      });
    }
    
    // Vérifier si c'est un superviseur
    const supervisorResult = await pool.query('SELECT * FROM supervisors WHERE id = $1', [parseInt(id)]);
    
    if (supervisorResult.rows.length > 0) {
      const supervisor = supervisorResult.rows[0];
      
      // Compter les agents
      const agentsCount = await pool.query('SELECT COUNT(*) FROM agents WHERE supervisor_id = $1 AND active = true', [parseInt(id)]);
      
      // Ventes totales des agents
      const salesResult = await pool.query(`
        SELECT COALESCE(SUM(t.total_amount), 0) as total_sales
        FROM tickets t
        JOIN agents a ON t.agent_id = a.id::text
        WHERE a.supervisor_id = $1 AND DATE(t.date) = CURRENT_DATE
      `, [parseInt(id)]);
      
      return res.json({
        id: supervisor.id.toString(),
        name: supervisor.name,
        email: supervisor.email,
        phone: supervisor.phone,
        role: 'supervisor',
        blocked: !supervisor.active,
        online: Math.random() > 0.5,
        createdAt: supervisor.created_at,
        agentsCount: parseInt(agentsCount.rows[0].count),
        salesToday: parseFloat(salesResult.rows[0]?.total_sales) || 0
      });
    }
    
    res.status(404).json({ error: 'Utilisateur non trouvé' });
  } catch (error) {
    console.error('Erreur récupération utilisateur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer un utilisateur
app.post('/api/users', async (req, res) => {
  try {
    console.log('👤 POST /api/users appelé');
    console.log('📦 Body:', req.body);
    
    const { name, email, phone, password, role, supervisorId, location, commission, dailyLimit } = req.body;
    
    // Vérifier si l'email existe déjà
    const emailCheck = await pool.query(
      'SELECT id FROM agents WHERE email = $1 UNION SELECT id FROM supervisors WHERE email = $1',
      [email]
    );
    
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Email déjà utilisé' });
    }
    
    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);
    
    if (role === 'supervisor') {
      const result = await pool.query(
        `INSERT INTO supervisors (name, email, phone, password, active, created_at)
         VALUES ($1, $2, $3, $4, true, NOW()) RETURNING *`,
        [name, email, phone, hashedPassword]
      );
      
      const user = result.rows[0];
      
      // Ajouter les limites par défaut
      if (dailyLimit) {
        await pool.query(
          `INSERT INTO user_limits (user_id, limit_type, limit_value)
           VALUES ($1, 'daily', $2)`,
          [user.id.toString(), parseFloat(dailyLimit)]
        );
      }
      
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
        active: user.active,
        role: 'supervisor'
      });
      
    } else if (role === 'agent') {
      // Si pas de supervisorId, trouver le premier superviseur
      let finalSupervisorId = supervisorId;
      if (!finalSupervisorId) {
        const firstSupervisor = await pool.query('SELECT id FROM supervisors LIMIT 1');
        if (firstSupervisor.rows.length > 0) {
          finalSupervisorId = firstSupervisor.rows[0].id;
        } else {
          // Créer un superviseur par défaut si aucun n'existe
          const defaultSupervisor = await pool.query(
            `INSERT INTO supervisors (name, email, phone, password, active) 
             VALUES ('Superviseur Principal', 'superviseur@lotato.com', '0000000000', $1, true) RETURNING id`,
            [await bcrypt.hash('super123', 10)]
          );
          finalSupervisorId = defaultSupervisor.rows[0].id;
        }
      }
      
      const result = await pool.query(
        `INSERT INTO agents (name, email, phone, password, supervisor_id, location, commission, active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW()) RETURNING *`,
        [name, email, phone, hashedPassword, finalSupervisorId, location, commission || 5]
      );
      
      const user = result.rows[0];
      
      // Ajouter les limites par défaut
      if (dailyLimit) {
        await pool.query(
          `INSERT INTO user_limits (user_id, limit_type, limit_value)
           VALUES ($1, 'daily', $2)`,
          [user.id.toString(), parseFloat(dailyLimit)]
        );
      }
      
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
        active: user.active,
        role: 'agent'
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
    console.log('🔄 PUT /api/users/:id appelé', req.params.id);
    const { id } = req.params;
    const userData = req.body;
    
    // Vérifier si c'est un agent
    const agentResult = await pool.query('SELECT id FROM agents WHERE id = $1', [parseInt(id)]);
    
    if (agentResult.rows.length > 0) {
      const { name, email, phone, location, commission, supervisorId, dailyLimit } = userData;
      
      const result = await pool.query(
        `UPDATE agents 
         SET name = $1, email = $2, phone = $3, location = $4, 
             commission = $5, supervisor_id = $6, updated_at = NOW()
         WHERE id = $7 RETURNING *`,
        [name, email, phone, location, commission, supervisorId, parseInt(id)]
      );
      
      // Mettre à jour les limites
      if (dailyLimit !== undefined) {
        await pool.query(
          `INSERT INTO user_limits (user_id, limit_type, limit_value)
           VALUES ($1, 'daily', $2)
           ON CONFLICT (user_id, limit_type) 
           DO UPDATE SET limit_value = $2, updated_at = NOW()`,
          [id, parseFloat(dailyLimit)]
        );
      }
      
      // Journal d'activité
      await pool.query(
        `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
         VALUES ($1, $2, $3, $4, NOW())`,
        [req.user?.id || 'system', 'owner', 'update_agent', `Agent ${name} mis à jour`]
      );
      
      res.json({ success: true, user: result.rows[0] });
    } else {
      // C'est probablement un superviseur
      const { name, email, phone, dailyLimit } = userData;
      const result = await pool.query(
        `UPDATE supervisors 
         SET name = $1, email = $2, phone = $3, updated_at = NOW()
         WHERE id = $4 RETURNING *`,
        [name, email, phone, parseInt(id)]
      );
      
      // Mettre à jour les limites
      if (dailyLimit !== undefined) {
        await pool.query(
          `INSERT INTO user_limits (user_id, limit_type, limit_value)
           VALUES ($1, 'daily', $2)
           ON CONFLICT (user_id, limit_type) 
           DO UPDATE SET limit_value = $2, updated_at = NOW()`,
          [id, parseFloat(dailyLimit)]
        );
      }
      
      // Journal d'activité
      await pool.query(
        `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
         VALUES ($1, $2, $3, $4, NOW())`,
        [req.user?.id || 'system', 'owner', 'update_supervisor', `Superviseur ${name} mis à jour`]
      );
      
      res.json({ success: true, user: result.rows[0] });
    }
  } catch (error) {
    console.error('Erreur mise à jour utilisateur:', error);
    res.status(500).json({ error: 'Erreur serveur: ' + error.message });
  }
});

// Supprimer un utilisateur
app.delete('/api/users/:id', async (req, res) => {
  try {
    console.log('🗑️ DELETE /api/users/:id appelé', req.params.id);
    const { id } = req.params;
    
    // Vérifier si c'est un agent
    const agentResult = await pool.query('SELECT name FROM agents WHERE id = $1', [parseInt(id)]);
    
    if (agentResult.rows.length > 0) {
      const agentName = agentResult.rows[0].name;
      await pool.query('DELETE FROM agents WHERE id = $1', [parseInt(id)]);
      
      // Supprimer les limites
      await pool.query('DELETE FROM user_limits WHERE user_id = $1', [id]);
      
      // Journal d'activité
      await pool.query(
        `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
         VALUES ($1, $2, $3, $4, NOW())`,
        [req.user?.id || 'system', 'owner', 'delete_agent', `Agent ${agentName} supprimé`]
      );
      
      res.json({ success: true, message: 'Agent supprimé' });
    } else {
      // C'est un superviseur
      const supervisorResult = await pool.query('SELECT name FROM supervisors WHERE id = $1', [parseInt(id)]);
      
      if (supervisorResult.rows.length > 0) {
        const supervisorName = supervisorResult.rows[0].name;
        
        // Vérifier si le superviseur a des agents
        const agentsCount = await pool.query('SELECT COUNT(*) FROM agents WHERE supervisor_id = $1', [parseInt(id)]);
        
        if (parseInt(agentsCount.rows[0].count) > 0) {
          return res.status(400).json({ error: 'Le superviseur a encore des agents assignés' });
        }
        
        await pool.query('DELETE FROM supervisors WHERE id = $1', [parseInt(id)]);
        
        // Supprimer les limites
        await pool.query('DELETE FROM user_limits WHERE user_id = $1', [id]);
        
        // Journal d'activité
        await pool.query(
          `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
           VALUES ($1, $2, $3, $4, NOW())`,
          [req.user?.id || 'system', 'owner', 'delete_supervisor', `Superviseur ${supervisorName} supprimé`]
        );
        
        res.json({ success: true, message: 'Superviseur supprimé' });
      } else {
        res.status(404).json({ error: 'Utilisateur non trouvé' });
      }
    }
  } catch (error) {
    console.error('Erreur suppression utilisateur:', error);
    res.status(500).json({ error: 'Erreur serveur: ' + error.message });
  }
});

// Blocage utilisateur
app.patch('/api/users/:id/block', async (req, res) => {
  try {
    console.log('🔒 PATCH /api/users/:id/block appelé', req.params.id);
    const { id } = req.params;
    const { blocked } = req.body;
    
    // Vérifier si c'est un agent
    const agentResult = await pool.query('SELECT name FROM agents WHERE id = $1', [parseInt(id)]);
    
    if (agentResult.rows.length > 0) {
      const agentName = agentResult.rows[0].name;
      await pool.query('UPDATE agents SET active = $1 WHERE id = $2', [!blocked, parseInt(id)]);
      
      // Journal d'activité
      await pool.query(
        `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
         VALUES ($1, $2, $3, $4, NOW())`,
        [req.user?.id || 'system', 'owner', blocked ? 'block_agent' : 'unblock_agent', 
         `Agent ${agentName} ${blocked ? 'bloqué' : 'débloqué'}`]
      );
      
      res.json({ success: true, message: `Agent ${blocked ? 'bloqué' : 'débloqué'}` });
    } else {
      // C'est un superviseur
      const supervisorResult = await pool.query('SELECT name FROM supervisors WHERE id = $1', [parseInt(id)]);
      
      if (supervisorResult.rows.length > 0) {
        const supervisorName = supervisorResult.rows[0].name;
        await pool.query('UPDATE supervisors SET active = $1 WHERE id = $2', [!blocked, parseInt(id)]);
        
        // Journal d'activité
        await pool.query(
          `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
           VALUES ($1, $2, $3, $4, NOW())`,
          [req.user?.id || 'system', 'owner', blocked ? 'block_supervisor' : 'unblock_supervisor', 
           `Superviseur ${supervisorName} ${blocked ? 'bloqué' : 'débloqué'}`]
        );
        
        res.json({ success: true, message: `Superviseur ${blocked ? 'bloqué' : 'débloqué'}` });
      } else {
        res.status(404).json({ error: 'Utilisateur non trouvé' });
      }
    }
  } catch (error) {
    console.error('Erreur blocage utilisateur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Exporter les utilisateurs
app.get('/api/users/export', async (req, res) => {
  try {
    const { format } = req.query;
    
    // Récupérer tous les utilisateurs
    const agents = await pool.query(`
      SELECT a.*, s.name as supervisor_name
      FROM agents a
      LEFT JOIN supervisors s ON a.supervisor_id = s.id
    `);
    
    const supervisors = await pool.query('SELECT * FROM supervisors');
    
    const users = [
      ...supervisors.rows.map(s => ({
        ...s,
        role: 'supervisor',
        password: undefined
      })),
      ...agents.rows.map(a => ({
        ...a,
        role: 'agent',
        password: undefined
      }))
    ];
    
    if (format === 'csv') {
      // Convertir en CSV
      const headers = ['ID', 'Nom', 'Email', 'Téléphone', 'Rôle', 'Statut', 'Date de création'];
      const csvRows = users.map(user => [
        user.id,
        user.name,
        user.email,
        user.phone,
        user.role,
        user.active ? 'Actif' : 'Inactif',
        new Date(user.created_at).toLocaleDateString()
      ].join(','));
      
      const csvContent = [headers.join(','), ...csvRows].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=lotato_users_${new Date().toISOString().split('T')[0]}.csv`);
      return res.send(csvContent);
    } else {
      // JSON par défaut
      res.json(users);
    }
  } catch (error) {
    console.error('Erreur export utilisateurs:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Statistiques utilisateurs
app.get('/api/users/stats', async (req, res) => {
  try {
    const totalAgents = await pool.query('SELECT COUNT(*) FROM agents WHERE active = true');
    const totalSupervisors = await pool.query('SELECT COUNT(*) FROM supervisors WHERE active = true');
    const blockedAgents = await pool.query('SELECT COUNT(*) FROM agents WHERE active = false');
    const blockedSupervisors = await pool.query('SELECT COUNT(*) FROM supervisors WHERE active = false');
    
    // Nouvelles inscriptions aujourd'hui
    const newToday = await pool.query(`
      SELECT COUNT(*) as new_today
      FROM (
        SELECT id, created_at FROM agents WHERE DATE(created_at) = CURRENT_DATE
        UNION ALL
        SELECT id, created_at FROM supervisors WHERE DATE(created_at) = CURRENT_DATE
      ) as new_users
    `);
    
    // Utilisateurs en ligne (simulation)
    const onlineUsers = Math.floor(Math.random() * 15) + 5;
    
    res.json({
      totalAgents: parseInt(totalAgents.rows[0].count),
      totalSupervisors: parseInt(totalSupervisors.rows[0].count),
      blockedAgents: parseInt(blockedAgents.rows[0].count),
      blockedSupervisors: parseInt(blockedSupervisors.rows[0].count),
      newToday: parseInt(newToday.rows[0].new_today),
      onlineUsers: onlineUsers,
      totalUsers: parseInt(totalAgents.rows[0].count) + parseInt(totalSupervisors.rows[0].count)
    });
  } catch (error) {
    console.error('Erreur stats utilisateurs:', error);
    res.json({
      totalAgents: 0,
      totalSupervisors: 0,
      blockedAgents: 0,
      blockedSupervisors: 0,
      newToday: 0,
      onlineUsers: 0,
      totalUsers: 0
    });
  }
});

// Activité utilisateur
app.get('/api/users/activity', async (req, res) => {
  try {
    const { userId, limit = 50 } = req.query;
    
    let query = `
      SELECT * FROM activity_log 
      WHERE 1=1
    `;
    const params = [];
    
    if (userId) {
      params.push(userId);
      query += ` AND user_id = $${params.length}`;
    }
    
    query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));
    
    const result = await pool.query(query, params);
    
    const activity = result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      userRole: row.user_role,
      action: row.action,
      details: row.details,
      timestamp: row.timestamp,
      user: row.user_role === 'owner' ? 'Administrateur' : 
            row.user_role === 'supervisor' ? 'Superviseur' : 
            row.user_role === 'agent' ? 'Agent' : 'Système'
    }));
    
    res.json({ activity });
  } catch (error) {
    console.error('Erreur activité utilisateur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Limites utilisateur
app.post('/api/users/limits', async (req, res) => {
  try {
    const { userId, dailyLimit, weeklyLimit, monthlyLimit } = req.body;
    
    // Mettre à jour les limites
    if (dailyLimit !== undefined) {
      await pool.query(
        `INSERT INTO user_limits (user_id, limit_type, limit_value)
         VALUES ($1, 'daily', $2)
         ON CONFLICT (user_id, limit_type) 
         DO UPDATE SET limit_value = $2, updated_at = NOW()`,
        [userId, parseFloat(dailyLimit)]
      );
    }
    
    if (weeklyLimit !== undefined) {
      await pool.query(
        `INSERT INTO user_limits (user_id, limit_type, limit_value)
         VALUES ($1, 'weekly', $2)
         ON CONFLICT (user_id, limit_type) 
         DO UPDATE SET limit_value = $2, updated_at = NOW()`,
        [userId, parseFloat(weeklyLimit)]
      );
    }
    
    if (monthlyLimit !== undefined) {
      await pool.query(
        `INSERT INTO user_limits (user_id, limit_type, limit_value)
         VALUES ($1, 'monthly', $2)
         ON CONFLICT (user_id, limit_type) 
         DO UPDATE SET limit_value = $2, updated_at = NOW()`,
        [userId, parseFloat(monthlyLimit)]
      );
    }
    
    // Journal d'activité
    await pool.query(
      `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [req.user?.id || 'system', 'owner', 'update_user_limits', `Limites mises à jour pour l'utilisateur ${userId}`]
    );
    
    res.json({ success: true, message: 'Limites mises à jour' });
  } catch (error) {
    console.error('Erreur limites utilisateur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= ROUTES TIRAGES =============

// Liste des tirages
app.get('/api/draws', async (req, res) => {
  try {
    console.log('🎰 GET /api/draws appelé');
    const { status = 'all' } = req.query;
    
    let query = 'SELECT * FROM draws WHERE 1=1';
    const params = [];
    
    if (status !== 'all') {
      if (status === 'active') {
        query += ' AND active = true';
      } else if (status === 'blocked') {
        query += ' AND active = false';
      } else if (status === 'scheduled') {
        query += ' AND status = $1';
        params.push('scheduled');
      }
    }
    
    query += ' ORDER BY time, name';
    
    const result = await pool.query(query, params);
    
    // Enrichir avec les statistiques
    const draws = await Promise.all(result.rows.map(async (draw) => {
      // Statistiques du tirage
      const statsResult = await pool.query(`
        SELECT 
          COUNT(*) as tickets_today,
          COALESCE(SUM(total_amount), 0) as sales_today,
          COALESCE(SUM(win_amount), 0) as payouts_today
        FROM tickets 
        WHERE draw_id = $1 AND DATE(date) = CURRENT_DATE
      `, [draw.id]);
      
      // Derniers résultats
      const lastResultsResult = await pool.query(`
        SELECT results, draw_time
        FROM draw_results 
        WHERE name = $1
        ORDER BY draw_time DESC 
        LIMIT 1
      `, [draw.name]);
      
      let lastResults = [];
      let lastDraw = null;
      
      if (lastResultsResult.rows.length > 0) {
        const resultsData = lastResultsResult.rows[0];
        lastResults = typeof resultsData.results === 'string' 
          ? JSON.parse(resultsData.results) 
          : resultsData.results || [];
        lastDraw = resultsData.draw_time;
      }
      
      return {
        id: draw.id,
        name: draw.name,
        time: draw.time,
        frequency: draw.frequency || 'daily',
        status: draw.active ? (draw.status || 'active') : 'blocked',
        description: draw.description,
        minBet: parseFloat(draw.min_bet) || 0,
        maxBet: parseFloat(draw.max_bet) || 0,
        lastDraw: lastDraw,
        lastResults: lastResults,
        ticketsToday: parseInt(statsResult.rows[0]?.tickets_today) || 0,
        salesToday: parseFloat(statsResult.rows[0]?.sales_today) || 0,
        payoutsToday: parseFloat(statsResult.rows[0]?.payouts_today) || 0
      };
    }));
    
    res.json(draws);
  } catch (error) {
    console.error('Erreur récupération tirages:', error);
    res.json([]);
  }
});

// Obtenir un tirage par ID
app.get('/api/draws/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('SELECT * FROM draws WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tirage non trouvé' });
    }
    
    const draw = result.rows[0];
    
    // Statistiques détaillées
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_tickets,
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(SUM(win_amount), 0) as total_payouts,
        COUNT(CASE WHEN DATE(date) = CURRENT_DATE THEN 1 END) as tickets_today,
        COALESCE(SUM(CASE WHEN DATE(date) = CURRENT_DATE THEN total_amount END), 0) as sales_today,
        COALESCE(SUM(CASE WHEN DATE(date) = CURRENT_DATE THEN win_amount END), 0) as payouts_today
      FROM tickets 
      WHERE draw_id = $1
    `, [id]);
    
    // Derniers résultats (5 derniers)
    const resultsResult = await pool.query(`
      SELECT results, draw_time, lucky_number
      FROM draw_results 
      WHERE draw_id = $1 OR name = $2
      ORDER BY draw_time DESC 
      LIMIT 5
    `, [id, draw.name]);
    
    const lastResults = resultsResult.rows.map(row => ({
      results: typeof row.results === 'string' ? JSON.parse(row.results) : row.results,
      drawTime: row.draw_time,
      luckyNumber: row.lucky_number
    }));
    
    res.json({
      id: draw.id,
      name: draw.name,
      time: draw.time,
      frequency: draw.frequency || 'daily',
      status: draw.active ? (draw.status || 'active') : 'blocked',
      description: draw.description,
      minBet: parseFloat(draw.min_bet) || 0,
      maxBet: parseFloat(draw.max_bet) || 0,
      createdAt: draw.created_at,
      updatedAt: draw.updated_at,
      stats: {
        totalTickets: parseInt(statsResult.rows[0]?.total_tickets) || 0,
        totalSales: parseFloat(statsResult.rows[0]?.total_sales) || 0,
        totalPayouts: parseFloat(statsResult.rows[0]?.total_payouts) || 0,
        ticketsToday: parseInt(statsResult.rows[0]?.tickets_today) || 0,
        salesToday: parseFloat(statsResult.rows[0]?.sales_today) || 0,
        payoutsToday: parseFloat(statsResult.rows[0]?.payouts_today) || 0
      },
      lastResults: lastResults.length > 0 ? lastResults[0].results : [],
      luckyNumber: lastResults.length > 0 ? lastResults[0].lucky_number : null,
      history: lastResults
    });
  } catch (error) {
    console.error('Erreur récupération tirage:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer un tirage
app.post('/api/draws', async (req, res) => {
  try {
    console.log('🎰 POST /api/draws appelé');
    const { name, time, frequency, description, minBet, maxBet } = req.body;
    
    const drawId = `DRAW-${Date.now()}`;
    
    const result = await pool.query(
      `INSERT INTO draws (id, name, time, frequency, description, min_bet, max_bet, active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW()) RETURNING *`,
      [drawId, name, time, frequency || 'daily', description, minBet || 0, maxBet || 0]
    );
    
    // Journal d'activité
    await pool.query(
      `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [req.user?.id || 'system', 'owner', 'create_draw', `Tirage ${name} créé`]
    );
    
    res.status(201).json({ 
      success: true, 
      draw: result.rows[0],
      message: 'Tirage créé avec succès'
    });
  } catch (error) {
    console.error('Erreur création tirage:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Publication de tirage
app.post('/api/draws/publish', async (req, res) => {
  try {
    console.log('📢 POST /api/draws/publish appelé');
    const { name, dateTime, results, luckyNumber, comment, source } = req.body;
    
    // Valider les résultats
    if (!results || !Array.isArray(results) || results.length !== 5) {
      return res.status(400).json({ error: '5 numéros requis' });
    }
    
    // Valider les numéros
    for (const num of results) {
      if (isNaN(num) || num < 0 || num > 99) {
        return res.status(400).json({ error: 'Numéros invalides (0-99)' });
      }
    }
    
    // Générer un ID de tirage
    const drawId = `PUB-${Date.now()}`;
    
    await pool.query(
      `INSERT INTO draw_results (draw_id, name, draw_time, results, lucky_number, comment, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [drawId, name, dateTime, JSON.stringify(results), luckyNumber, comment || '', source || 'manual']
    );
    
    // Mettre à jour le dernier tirage
    await pool.query(
      `UPDATE draws 
       SET last_draw = $1, updated_at = NOW()
       WHERE name = $2`,
      [dateTime, name]
    );
    
    // Ajouter une entrée d'activité
    await pool.query(
      `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [req.user?.id || 'owner', 'owner', 'draw_published', `Tirage ${name} publié manuellement`]
    );
    
    res.json({ 
      success: true, 
      drawId, 
      message: 'Tirage publié avec succès',
      count: 1
    });
  } catch (error) {
    console.error('Erreur publication tirage:', error);
    res.status(500).json({ error: 'Erreur serveur: ' + error.message });
  }
});

// Programmer un tirage
app.post('/api/draws/schedule', async (req, res) => {
  try {
    const { drawId, date, time, publishType, notifyEmail } = req.body;
    
    const drawTime = `${date} ${time}`;
    
    // Mettre à jour le tirage
    await pool.query(
      `UPDATE draws 
       SET time = $1, status = 'scheduled', updated_at = NOW()
       WHERE id = $2`,
      [time, drawId]
    );
    
    // Créer une entrée de programmation (simulation)
    const scheduleId = `SCHED-${Date.now()}`;
    
    // Journal d'activité
    await pool.query(
      `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [req.user?.id || 'system', 'owner', 'schedule_draw', `Tirage programmé pour le ${date} à ${time}`]
    );
    
    res.json({ 
      success: true, 
      scheduleId,
      message: 'Tirage programmé avec succès',
      scheduledFor: drawTime
    });
  } catch (error) {
    console.error('Erreur programmation tirage:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Blocage de tirage
app.patch('/api/draws/:id/block', async (req, res) => {
  try {
    const { id } = req.params;
    const { blocked } = req.body;
    
    const result = await pool.query(
      'SELECT name FROM draws WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tirage non trouvé' });
    }
    
    const drawName = result.rows[0].name;
    
    await pool.query(
      'UPDATE draws SET active = $1, updated_at = NOW() WHERE id = $2',
      [!blocked, id]
    );
    
    // Journal d'activité
    await pool.query(
      `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [req.user?.id || 'system', 'owner', blocked ? 'block_draw' : 'unblock_draw',
       `Tirage ${drawName} ${blocked ? 'bloqué' : 'débloqué'}`]
    );
    
    res.json({ 
      success: true, 
      message: `Tirage ${blocked ? 'bloqué' : 'débloqué'}` 
    });
  } catch (error) {
    console.error('Erreur blocage tirage:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer un tirage
app.delete('/api/draws/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT name FROM draws WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tirage non trouvé' });
    }
    
    const drawName = result.rows[0].name;
    
    await pool.query('DELETE FROM draws WHERE id = $1', [id]);
    
    // Journal d'activité
    await pool.query(
      `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [req.user?.id || 'system', 'owner', 'delete_draw', `Tirage ${drawName} supprimé`]
    );
    
    res.json({ success: true, message: 'Tirage supprimé' });
  } catch (error) {
    console.error('Erreur suppression tirage:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Historique des tirages
app.get('/api/draws/history', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = `
      SELECT * FROM draw_results 
      WHERE 1=1
    `;
    const params = [];
    
    if (startDate) {
      params.push(startDate);
      query += ` AND DATE(draw_time) >= $${params.length}`;
    }
    
    if (endDate) {
      params.push(endDate);
      query += ` AND DATE(draw_time) <= $${params.length}`;
    }
    
    query += ' ORDER BY draw_time DESC LIMIT 100';
    
    const result = await pool.query(query, params);
    
    const history = result.rows.map(row => ({
      id: row.id,
      drawId: row.draw_id,
      drawName: row.name,
      publishDate: row.published_at,
      drawTime: row.draw_time,
      results: typeof row.results === 'string' ? JSON.parse(row.results) : row.results,
      luckyNumber: row.lucky_number,
      comment: row.comment,
      source: row.source
    }));
    
    res.json(history);
  } catch (error) {
    console.error('Erreur historique tirages:', error);
    res.json([]);
  }
});

// Récupération automatique
app.post('/api/draws/fetch', async (req, res) => {
  try {
    const { source } = req.body;
    
    // Simulation de récupération
    const mockResults = [
      { name: 'Florida Matin', results: [12, 34, 56, 78, 90], time: new Date().toISOString() },
      { name: 'Florida Soir', results: [11, 22, 33, 44, 55], time: new Date().toISOString() }
    ];
    
    // Enregistrer les résultats simulés
    for (const draw of mockResults) {
      const drawId = `FETCH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      await pool.query(
        `INSERT INTO draw_results (draw_id, name, draw_time, results, source)
         VALUES ($1, $2, $3, $4, $5)`,
        [drawId, draw.name, draw.time, JSON.stringify(draw.results), 'auto_fetch']
      );
      
      // Mettre à jour le dernier tirage
      await pool.query(
        `UPDATE draws 
         SET last_draw = $1, updated_at = NOW()
         WHERE name = $2`,
        [draw.time, draw.name]
      );
    }
    
    // Journal d'activité
    await pool.query(
      `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [req.user?.id || 'system', 'owner', 'auto_fetch', `Récupération automatique depuis ${source}`]
    );
    
    res.json({ 
      success: true, 
      message: 'Récupération effectuée',
      results: mockResults,
      count: mockResults.length
    });
  } catch (error) {
    console.error('Erreur récupération:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Statistiques des tirages
app.get('/api/draws/stats', async (req, res) => {
  try {
    const totalDraws = await pool.query('SELECT COUNT(*) FROM draws');
    const activeDraws = await pool.query('SELECT COUNT(*) FROM draws WHERE active = true');
    const publishedToday = await pool.query(`
      SELECT COUNT(*) FROM draw_results 
      WHERE DATE(published_at) = CURRENT_DATE
    `);
    
    // Tirages les plus populaires
    const popularDraws = await pool.query(`
      SELECT 
        d.name,
        COUNT(t.id) as ticket_count,
        COALESCE(SUM(t.total_amount), 0) as total_sales
      FROM draws d
      LEFT JOIN tickets t ON d.id = t.draw_id AND DATE(t.date) = CURRENT_DATE
      WHERE d.active = true
      GROUP BY d.id, d.name
      ORDER BY ticket_count DESC
      LIMIT 5
    `);
    
    res.json({
      totalDraws: parseInt(totalDraws.rows[0].count),
      activeDraws: parseInt(activeDraws.rows[0].count),
      publishedToday: parseInt(publishedToday.rows[0].count),
      popularDraws: popularDraws.rows.map(row => ({
        name: row.name,
        ticketCount: parseInt(row.ticket_count),
        totalSales: parseFloat(row.total_sales)
      }))
    });
  } catch (error) {
    console.error('Erreur stats tirages:', error);
    res.json({
      totalDraws: 0,
      activeDraws: 0,
      publishedToday: 0,
      popularDraws: []
    });
  }
});

// Résultats d'un tirage
app.get('/api/draws/results/:drawId', async (req, res) => {
  try {
    const { drawId } = req.params;
    
    const result = await pool.query(`
      SELECT * FROM draw_results 
      WHERE draw_id = $1 
      ORDER BY draw_time DESC 
      LIMIT 1
    `, [drawId]);
    
    if (result.rows.length === 0) {
      return res.json({ results: null, message: 'Aucun résultat trouvé' });
    }
    
    const drawResult = result.rows[0];
    
    res.json({
      results: typeof drawResult.results === 'string' 
        ? JSON.parse(drawResult.results) 
        : drawResult.results,
      drawTime: drawResult.draw_time,
      luckyNumber: drawResult.lucky_number,
      source: drawResult.source,
      publishedAt: drawResult.published_at
    });
  } catch (error) {
    console.error('Erreur résultats tirage:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= ROUTES NUMÉROS =============

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

// Débloquer un ou plusieurs numéros
app.post('/api/numbers/unblock', async (req, res) => {
  try {
    const { number, numbers } = req.body;
    
    if (numbers && Array.isArray(numbers)) {
      for (const num of numbers) {
        await pool.query('DELETE FROM blocked_numbers WHERE number = $1', [num]);
      }
      
      // Journal d'activité
      await pool.query(
        `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
         VALUES ($1, $2, $3, $4, NOW())`,
        [req.user?.id || 'system', 'owner', 'unblock_numbers', `${numbers.length} numéro(s) débloqué(s)`]
      );
      
      res.json({ success: true, message: `${numbers.length} numéro(s) débloqué(s)` });
    } else if (number) {
      await pool.query('DELETE FROM blocked_numbers WHERE number = $1', [number]);
      
      // Journal d'activité
      await pool.query(
        `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
         VALUES ($1, $2, $3, $4, NOW())`,
        [req.user?.id || 'system', 'owner', 'unblock_number', `Numéro ${number} débloqué`]
      );
      
      res.json({ success: true, message: `Numéro ${number} débloqué` });
    } else {
      res.status(400).json({ error: 'Données invalides' });
    }
  } catch (error) {
    console.error('Erreur déblocage numéro:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Gestion des limites de numéros
app.get('/api/numbers/limits', async (req, res) => {
  try {
    const result = await pool.query('SELECT number, limit_amount FROM number_limits');
    const limits = {};
    result.rows.forEach(row => {
      limits[row.number] = parseFloat(row.limit_amount);
    });
    res.json(limits);
  } catch (error) {
    console.error('Erreur limites numéros:', error);
    res.json({});
  }
});

// Définir une limite pour un numéro
app.post('/api/numbers/limits', async (req, res) => {
  try {
    const { number, limit } = req.body;
    
    await pool.query(
      `INSERT INTO number_limits (number, limit_amount) 
       VALUES ($1, $2) 
       ON CONFLICT (number) 
       DO UPDATE SET limit_amount = $2, updated_at = NOW()`,
      [number, parseFloat(limit)]
    );
    
    // Journal d'activité
    await pool.query(
      `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [req.user?.id || 'system', 'owner', 'set_number_limit', `Limite pour ${number} définie à ${limit}`]
    );
    
    res.json({ success: true, message: `Limite pour ${number} définie à ${limit}` });
  } catch (error) {
    console.error('Erreur définition limite:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Mettre à jour plusieurs limites
app.put('/api/numbers/limits', async (req, res) => {
  try {
    const { limits } = req.body;
    
    for (const [number, limit] of Object.entries(limits)) {
      await pool.query(
        `INSERT INTO number_limits (number, limit_amount) 
         VALUES ($1, $2) 
         ON CONFLICT (number) 
         DO UPDATE SET limit_amount = $2, updated_at = NOW()`,
        [number, parseFloat(limit)]
      );
    }
    
    // Journal d'activité
    await pool.query(
      `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [req.user?.id || 'system', 'owner', 'update_number_limits', `Limites mises à jour pour ${Object.keys(limits).length} numéros`]
    );
    
    res.json({ success: true, message: 'Limites mises à jour' });
  } catch (error) {
    console.error('Erreur mise à jour limites:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Statistiques des numéros
app.get('/api/numbers/stats', async (req, res) => {
  try {
    const { number } = req.query;
    
    if (number) {
      // Statistiques pour un numéro spécifique
      const result = await pool.query(`
        SELECT 
          COUNT(*) as frequency,
          COALESCE(SUM(total_amount), 0) as total_bets,
          COALESCE(SUM(win_amount), 0) as total_wins
        FROM tickets 
        WHERE bets @> $1::jsonb AND DATE(date) >= CURRENT_DATE - INTERVAL '30 days'
      `, [JSON.stringify([parseInt(number)])]);
      
      const stats = result.rows[0] || { frequency: 0, total_bets: 0, total_wins: 0 };
      
      res.json({
        number: number,
        frequency: parseInt(stats.frequency),
        totalBets: parseFloat(stats.total_bets),
        totalWins: parseFloat(stats.total_wins),
        averageBet: stats.frequency > 0 ? parseFloat(stats.total_bets) / parseInt(stats.frequency) : 0
      });
    } else {
      // Statistiques générales
      const blockedCount = await pool.query('SELECT COUNT(*) FROM blocked_numbers');
      const limitsCount = await pool.query('SELECT COUNT(*) FROM number_limits');
      
      // Numéros les plus joués (simulation)
      const mostPlayed = await pool.query(`
        SELECT 
          number,
          COUNT(*) as count
        FROM (
          SELECT jsonb_array_elements(bets)::text as number
          FROM tickets 
          WHERE DATE(date) = CURRENT_DATE
        ) as bet_numbers
        GROUP BY number
        ORDER BY count DESC
        LIMIT 10
      `);
      
      res.json({
        blockedCount: parseInt(blockedCount.rows[0].count),
        limitsCount: parseInt(limitsCount.rows[0].count),
        mostPlayed: mostPlayed.rows.map(row => ({
          number: row.number.replace(/"/g, ''),
          count: parseInt(row.count)
        }))
      });
    }
  } catch (error) {
    console.error('Erreur stats numéros:', error);
    res.json({
      blockedCount: 0,
      limitsCount: 0,
      mostPlayed: []
    });
  }
});

// Historique d'un numéro
app.get('/api/numbers/history', async (req, res) => {
  try {
    const { number, days = 30 } = req.query;
    
    const result = await pool.query(`
      SELECT 
        t.draw_name,
        t.draw_id,
        t.date,
        t.total_amount as bet_amount,
        t.win_amount > 0 as won,
        t.win_amount
      FROM tickets t
      WHERE t.bets @> $1::jsonb 
        AND t.date >= CURRENT_DATE - INTERVAL '${days} days'
      ORDER BY t.date DESC
      LIMIT 100
    `, [JSON.stringify([parseInt(number)])]);
    
    const history = result.rows.map(row => ({
      drawName: row.draw_name,
      drawId: row.draw_id,
      timestamp: row.date,
      betAmount: parseFloat(row.bet_amount),
      won: row.won,
      winAmount: parseFloat(row.win_amount)
    }));
    
    res.json(history);
  } catch (error) {
    console.error('Erreur historique numéro:', error);
    res.json([]);
  }
});

// ============= ROUTES RÈGLES =============

// Règles du jeu
app.get('/api/rules', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM game_rules ORDER BY rule_key');
    const rules = {};
    result.rows.forEach(row => {
      rules[row.rule_key] = {
        value: row.rule_value,
        description: row.description
      };
    });
    res.json(rules);
  } catch (error) {
    console.error('Erreur règles:', error);
    res.json({});
  }
});

// Mettre à jour les règles
app.put('/api/rules', async (req, res) => {
  try {
    const { rules } = req.body;
    
    for (const [key, rule] of Object.entries(rules)) {
      await pool.query(
        `INSERT INTO game_rules (rule_key, rule_value, description, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (rule_key) 
         DO UPDATE SET rule_value = $2, description = $3, updated_at = NOW()`,
        [key, rule.value, rule.description]
      );
    }
    
    // Journal d'activité
    await pool.query(
      `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [req.user?.id || 'system', 'owner', 'update_rules', 'Règles du jeu mises à jour']
    );
    
    res.json({ success: true, message: 'Règles mises à jour' });
  } catch (error) {
    console.error('Erreur mise à jour règles:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Valider les règles
app.post('/api/rules/validate', async (req, res) => {
  try {
    const { rules } = req.body;
    
    // Simuler une validation
    const validationResults = [];
    let isValid = true;
    
    for (const [key, rule] of Object.entries(rules)) {
      const result = {
        key: key,
        valid: true,
        message: 'Règle valide'
      };
      
      // Validation simple
      if (!rule.value || rule.value.trim() === '') {
        result.valid = false;
        result.message = 'La valeur ne peut pas être vide';
        isValid = false;
      }
      
      validationResults.push(result);
    }
    
    res.json({
      valid: isValid,
      results: validationResults,
      message: isValid ? 'Toutes les règles sont valides' : 'Certaines règles sont invalides'
    });
  } catch (error) {
    console.error('Erreur validation règles:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= ROUTES JOURNAL D'ACTIVITÉ =============

// Journal d'activité pour propriétaire
app.get('/api/reports/activity', async (req, res) => {
  try {
    const { period = 'today', type = 'all' } = req.query;
    
    let dateCondition = 'DATE(timestamp) = CURRENT_DATE';
    if (period === 'week') {
      dateCondition = 'timestamp >= CURRENT_DATE - INTERVAL \'7 days\'';
    } else if (period === 'month') {
      dateCondition = 'timestamp >= CURRENT_DATE - INTERVAL \'30 days\'';
    } else if (period === 'all') {
      dateCondition = '1=1';
    }
    
    let typeCondition = '1=1';
    if (type !== 'all') {
      typeCondition = `action LIKE '%${type}%'`;
    }
    
    const result = await pool.query(`
      SELECT * FROM activity_log 
      WHERE ${dateCondition} AND ${typeCondition}
      ORDER BY timestamp DESC 
      LIMIT 100
    `);
    
    const activity = result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      userRole: row.user_role,
      action: row.action,
      details: row.details,
      timestamp: row.timestamp,
      user: row.user_role === 'owner' ? 'Administrateur' : 
            row.user_role === 'supervisor' ? 'Superviseur' : 
            row.user_role === 'agent' ? 'Agent' : 'Système',
      type: row.action.includes('user') ? 'user' :
            row.action.includes('draw') ? 'draw' :
            row.action.includes('system') ? 'system' :
            row.action.includes('security') ? 'security' : 'other'
    }));
    
    res.json(activity);
  } catch (error) {
    console.error('Erreur activité:', error);
    res.json([]);
  }
});

// Exporter l'activité
app.get('/api/reports/export/activity', async (req, res) => {
  try {
    const { format = 'json' } = req.query;
    
    const result = await pool.query(`
      SELECT * FROM activity_log 
      ORDER BY timestamp DESC 
      LIMIT 1000
    `);
    
    const activity = result.rows.map(row => ({
      timestamp: row.timestamp,
      user: row.user_role === 'owner' ? 'Administrateur' : 
            row.user_role === 'supervisor' ? 'Superviseur' : 
            row.user_role === 'agent' ? 'Agent' : 'Système',
      action: row.action,
      details: row.details,
      ipAddress: row.ip_address
    }));
    
    if (format === 'csv') {
      const headers = ['Date', 'Utilisateur', 'Action', 'Détails', 'Adresse IP'];
      const csvRows = activity.map(item => [
        new Date(item.timestamp).toLocaleString(),
        item.user,
        item.action,
        item.details,
        item.ipAddress || ''
      ].map(val => `"${val}"`).join(','));
      
      const csvContent = [headers.join(','), ...csvRows].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=lotato_activity_${new Date().toISOString().split('T')[0]}.csv`);
      return res.send(csvContent);
    } else {
      res.json(activity);
    }
  } catch (error) {
    console.error('Erreur export activité:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= ROUTES RAPPORTS PROPRIÉTAIRE =============

// Rapports de ventes
app.get('/api/reports/sales', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter = 'DATE(date) = CURRENT_DATE';
    if (startDate && endDate) {
      dateFilter = `DATE(date) BETWEEN '${startDate}' AND '${endDate}'`;
    } else if (startDate) {
      dateFilter = `DATE(date) >= '${startDate}'`;
    } else if (endDate) {
      dateFilter = `DATE(date) <= '${endDate}'`;
    }
    
    const result = await pool.query(`
      SELECT 
        DATE(date) as day,
        COUNT(*) as ticket_count,
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(SUM(win_amount), 0) as total_wins
      FROM tickets 
      WHERE ${dateFilter}
      GROUP BY DATE(date)
      ORDER BY day DESC
    `);
    
    const summary = result.rows.reduce((acc, row) => {
      acc.totalTickets += parseInt(row.ticket_count);
      acc.totalSales += parseFloat(row.total_sales);
      acc.totalWins += parseFloat(row.total_wins);
      return acc;
    }, { totalTickets: 0, totalSales: 0, totalWins: 0 });
    
    summary.totalLoss = summary.totalSales - summary.totalWins;
    
    res.json({
      summary: summary,
      daily: result.rows.map(row => ({
        day: row.day,
        tickets: parseInt(row.ticket_count),
        sales: parseFloat(row.total_sales),
        wins: parseFloat(row.total_wins),
        loss: parseFloat(row.total_sales) - parseFloat(row.total_wins)
      }))
    });
  } catch (error) {
    console.error('Erreur rapports ventes:', error);
    res.json({
      summary: { totalTickets: 0, totalSales: 0, totalWins: 0, totalLoss: 0 },
      daily: []
    });
  }
});

// Rapport financier
app.get('/api/reports/financial', async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    let interval = '30 days';
    if (period === 'week') {
      interval = '7 days';
    } else if (period === 'year') {
      interval = '365 days';
    }
    
    const result = await pool.query(`
      SELECT 
        DATE_TRUNC('day', date) as day,
        COUNT(*) as ticket_count,
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(SUM(win_amount), 0) as total_wins
      FROM tickets 
      WHERE date >= CURRENT_DATE - INTERVAL '${interval}'
      GROUP BY DATE_TRUNC('day', date)
      ORDER BY day
    `);
    
    // Calculer les tendances
    const totalSales = result.rows.reduce((sum, row) => sum + parseFloat(row.total_sales), 0);
    const totalWins = result.rows.reduce((sum, row) => sum + parseFloat(row.total_wins), 0);
    const totalTickets = result.rows.reduce((sum, row) => sum + parseInt(row.ticket_count), 0);
    
    const profit = totalSales - totalWins;
    const averageTicket = totalTickets > 0 ? totalSales / totalTickets : 0;
    const winRate = totalSales > 0 ? (totalWins / totalSales) * 100 : 0;
    
    res.json({
      period: period,
      summary: {
        totalSales: totalSales,
        totalWins: totalWins,
        totalTickets: totalTickets,
        profit: profit,
        averageTicket: averageTicket,
        winRate: winRate
      },
      daily: result.rows.map(row => ({
        day: row.day,
        sales: parseFloat(row.total_sales),
        wins: parseFloat(row.total_wins),
        profit: parseFloat(row.total_sales) - parseFloat(row.total_wins)
      }))
    });
  } catch (error) {
    console.error('Erreur rapport financier:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Rapport de performance
app.get('/api/reports/performance', async (req, res) => {
  try {
    // Performances des agents
    const agentsPerformance = await pool.query(`
      SELECT 
        a.name as agent_name,
        s.name as supervisor_name,
        COUNT(t.id) as ticket_count,
        COALESCE(SUM(t.total_amount), 0) as total_sales,
        COALESCE(SUM(t.win_amount), 0) as total_wins,
        (COALESCE(SUM(t.total_amount), 0) - COALESCE(SUM(t.win_amount), 0)) as profit
      FROM agents a
      LEFT JOIN supervisors s ON a.supervisor_id = s.id
      LEFT JOIN tickets t ON a.id::text = t.agent_id AND DATE(t.date) = CURRENT_DATE
      WHERE a.active = true
      GROUP BY a.id, a.name, s.name
      ORDER BY profit DESC
    `);
    
    // Performances des tirages
    const drawsPerformance = await pool.query(`
      SELECT 
        d.name,
        COUNT(t.id) as ticket_count,
        COALESCE(SUM(t.total_amount), 0) as total_sales,
        COALESCE(SUM(t.win_amount), 0) as total_wins
      FROM draws d
      LEFT JOIN tickets t ON d.id = t.draw_id AND DATE(t.date) = CURRENT_DATE
      WHERE d.active = true
      GROUP BY d.id, d.name
      ORDER BY total_sales DESC
    `);
    
    // Statistiques globales
    const overallStats = await pool.query(`
      SELECT 
        COUNT(DISTINCT agent_id) as active_agents,
        COUNT(*) as total_tickets,
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(SUM(win_amount), 0) as total_wins,
        AVG(total_amount) as average_ticket
      FROM tickets 
      WHERE DATE(date) = CURRENT_DATE
    `);
    
    res.json({
      overall: overallStats.rows[0] || {
        active_agents: 0,
        total_tickets: 0,
        total_sales: 0,
        total_wins: 0,
        average_ticket: 0
      },
      agents: agentsPerformance.rows.map(row => ({
        agentName: row.agent_name,
        supervisorName: row.supervisor_name,
        ticketCount: parseInt(row.ticket_count),
        totalSales: parseFloat(row.total_sales),
        totalWins: parseFloat(row.total_wins),
        profit: parseFloat(row.profit)
      })),
      draws: drawsPerformance.rows.map(row => ({
        name: row.name,
        ticketCount: parseInt(row.ticket_count),
        totalSales: parseFloat(row.total_sales),
        totalWins: parseFloat(row.total_wins)
      }))
    });
  } catch (error) {
    console.error('Erreur rapport performance:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Exporter un rapport
app.get('/api/reports/export/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { format = 'json' } = req.query;
    
    let data = [];
    let filename = '';
    
    if (type === 'sales') {
      const result = await pool.query(`
        SELECT 
          DATE(date) as day,
          COUNT(*) as ticket_count,
          COALESCE(SUM(total_amount), 0) as total_sales,
          COALESCE(SUM(win_amount), 0) as total_wins
        FROM tickets 
        WHERE date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY DATE(date)
        ORDER BY day DESC
      `);
      
      data = result.rows.map(row => ({
        Date: row.day,
        'Tickets vendus': parseInt(row.ticket_count),
        'Ventes totales (Gdes)': parseFloat(row.total_sales),
        'Gains distribués (Gdes)': parseFloat(row.total_wins),
        'Bénéfice (Gdes)': parseFloat(row.total_sales) - parseFloat(row.total_wins)
      }));
      
      filename = `lotato_sales_report_${new Date().toISOString().split('T')[0]}`;
    } else if (type === 'users') {
      const result = await pool.query(`
        SELECT 
          name,
          email,
          phone,
          'agent' as role,
          location,
          commission,
          created_at
        FROM agents
        WHERE active = true
        UNION ALL
        SELECT 
          name,
          email,
          phone,
          'supervisor' as role,
          '' as location,
          0 as commission,
          created_at
        FROM supervisors
        WHERE active = true
        ORDER BY created_at DESC
      `);
      
      data = result.rows.map(row => ({
        Nom: row.name,
        Email: row.email,
        Téléphone: row.phone,
        Rôle: row.role === 'agent' ? 'Agent' : 'Superviseur',
        Localisation: row.location,
        Commission: row.commission ? `${row.commission}%` : 'N/A',
        'Date d\'inscription': new Date(row.created_at).toLocaleDateString()
      }));
      
      filename = `lotato_users_report_${new Date().toISOString().split('T')[0]}`;
    }
    
    if (format === 'csv') {
      const headers = Object.keys(data[0] || {});
      const csvRows = data.map(item => 
        headers.map(header => `"${item[header] || ''}"`).join(',')
      );
      
      const csvContent = [headers.join(','), ...csvRows].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
      return res.send(csvContent);
    } else {
      res.json(data);
    }
  } catch (error) {
    console.error('Erreur export rapport:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= ROUTES PARAMÈTRES =============

// Paramètres système
app.get('/api/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM system_settings');
    const settings = {};
    result.rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });
    res.json(settings);
  } catch (error) {
    console.error('Erreur paramètres:', error);
    res.json({});
  }
});

// Mettre à jour les paramètres
app.put('/api/settings', async (req, res) => {
  try {
    const { settings } = req.body;
    
    for (const [key, value] of Object.entries(settings)) {
      await pool.query(
        `INSERT INTO system_settings (setting_key, setting_value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (setting_key) 
         DO UPDATE SET setting_value = $2, updated_at = NOW()`,
        [key, value]
      );
    }
    
    // Journal d'activité
    await pool.query(
      `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [req.user?.id || 'system', 'owner', 'update_settings', 'Paramètres système mis à jour']
    );
    
    res.json({ success: true, message: 'Paramètres mis à jour' });
  } catch (error) {
    console.error('Erreur mise à jour paramètres:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Sauvegarde des paramètres
app.post('/api/settings/backup', async (req, res) => {
  try {
    // Récupérer tous les paramètres
    const settingsResult = await pool.query('SELECT * FROM system_settings');
    const rulesResult = await pool.query('SELECT * FROM game_rules');
    
    const backupData = {
      timestamp: new Date().toISOString(),
      settings: settingsResult.rows,
      rules: rulesResult.rows
    };
    
    const backupId = `BACKUP-${Date.now()}`;
    
    // Enregistrer la sauvegarde dans une table dédiée (simulation)
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value, category)
       VALUES ($1, $2, 'backup')`,
      [backupId, JSON.stringify(backupData)]
    );
    
    res.json({
      success: true,
      backupId: backupId,
      timestamp: backupData.timestamp,
      message: 'Sauvegarde créée avec succès'
    });
  } catch (error) {
    console.error('Erreur sauvegarde:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Restauration des paramètres
app.post('/api/settings/restore', async (req, res) => {
  try {
    const { backupId } = req.body;
    
    // Récupérer la sauvegarde
    const result = await pool.query(
      'SELECT setting_value FROM system_settings WHERE setting_key = $1 AND category = \'backup\'',
      [backupId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sauvegarde non trouvée' });
    }
    
    const backupData = JSON.parse(result.rows[0].setting_value);
    
    // Restaurer les paramètres
    for (const setting of backupData.settings) {
      if (setting.category !== 'backup') {
        await pool.query(
          `INSERT INTO system_settings (setting_key, setting_value, category, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (setting_key) 
           DO UPDATE SET setting_value = $2, category = $3, updated_at = NOW()`,
          [setting.setting_key, setting.setting_value, setting.category]
        );
      }
    }
    
    // Restaurer les règles
    for (const rule of backupData.rules) {
      await pool.query(
        `INSERT INTO game_rules (rule_key, rule_value, description, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (rule_key) 
         DO UPDATE SET rule_value = $2, description = $3, updated_at = NOW()`,
        [rule.rule_key, rule.rule_value, rule.description]
      );
    }
    
    // Journal d'activité
    await pool.query(
      `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [req.user?.id || 'system', 'owner', 'restore_settings', 'Paramètres restaurés depuis sauvegarde']
    );
    
    res.json({
      success: true,
      message: 'Paramètres restaurés avec succès',
      restoredFrom: backupData.timestamp
    });
  } catch (error) {
    console.error('Erreur restauration:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= ROUTES ALERTES =============

// Liste des alertes
app.get('/api/alerts', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM alerts 
      WHERE active = true OR expires_at > NOW()
      ORDER BY created_at DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur alertes:', error);
    res.json([]);
  }
});

// Créer une alerte
app.post('/api/alerts', async (req, res) => {
  try {
    const { title, message, type, priority, expiresAt } = req.body;
    
    const result = await pool.query(
      `INSERT INTO alerts (title, message, type, priority, active, expires_at, created_at)
       VALUES ($1, $2, $3, $4, true, $5, NOW()) RETURNING *`,
      [title, message, type || 'info', priority || 'medium', expiresAt]
    );
    
    // Journal d'activité
    await pool.query(
      `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [req.user?.id || 'system', 'owner', 'create_alert', `Alerte "${title}" créée`]
    );
    
    res.status(201).json({
      success: true,
      alert: result.rows[0],
      message: 'Alerte créée avec succès'
    });
  } catch (error) {
    console.error('Erreur création alerte:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Mettre à jour une alerte
app.put('/api/alerts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, message, type, priority, active, expiresAt } = req.body;
    
    const result = await pool.query(
      `UPDATE alerts 
       SET title = $1, message = $2, type = $3, priority = $4, active = $5, expires_at = $6
       WHERE id = $7 RETURNING *`,
      [title, message, type, priority, active, expiresAt, parseInt(id)]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alerte non trouvée' });
    }
    
    // Journal d'activité
    await pool.query(
      `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [req.user?.id || 'system', 'owner', 'update_alert', `Alerte "${title}" mise à jour`]
    );
    
    res.json({
      success: true,
      alert: result.rows[0],
      message: 'Alerte mise à jour'
    });
  } catch (error) {
    console.error('Erreur mise à jour alerte:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer une alerte
app.delete('/api/alerts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('SELECT title FROM alerts WHERE id = $1', [parseInt(id)]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alerte non trouvé' });
    }
    
    const alertTitle = result.rows[0].title;
    
    await pool.query('DELETE FROM alerts WHERE id = $1', [parseInt(id)]);
    
    // Journal d'activité
    await pool.query(
      `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [req.user?.id || 'system', 'owner', 'delete_alert', `Alerte "${alertTitle}" supprimée`]
    );
    
    res.json({ success: true, message: 'Alerte supprimée' });
  } catch (error) {
    console.error('Erreur suppression alerte:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= ROUTES SUPERVISEURS SPÉCIFIQUES =============

// Route pour récupérer les superviseurs
app.get('/api/supervisor/auth/verify', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'supervisor' && req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    
    const supervisorId = req.user.id.replace('supervisor-', '');
    
    const result = await pool.query(
      'SELECT * FROM supervisors WHERE id = $1',
      [parseInt(supervisorId)]
    );
    
    if (result.rows.length === 0) {
      // Retourner les informations de base pour le développement
      return res.json({
        id: 1,
        name: req.user.name || 'Superviseur Test',
        email: 'supervisor@test.com',
        phone: '+509XXXXXXXX'
      });
    }
    
    const supervisor = result.rows[0];
    res.json({
      id: supervisor.id,
      name: supervisor.name,
      email: supervisor.email,
      phone: supervisor.phone
    });
  } catch (error) {
    console.error('Erreur récupération superviseur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les agents d'un superviseur
app.get('/api/supervisor/agents', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'supervisor' && req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    
    const supervisorId = req.user.id.replace('supervisor-', '');
    
    const result = await pool.query(
      `SELECT a.*, 
              (SELECT COUNT(*) FROM tickets t WHERE t.agent_id = a.id::text AND DATE(t.date) = CURRENT_DATE) as tickets_today,
              (SELECT COALESCE(SUM(t.total_amount), 0) FROM tickets t WHERE t.agent_id = a.id::text AND DATE(t.date) = CURRENT_DATE) as sales_today
       FROM agents a 
       WHERE a.supervisor_id = $1 AND a.active = true
       ORDER BY a.name`,
      [parseInt(supervisorId)]
    );
    
    // Formater les agents
    const agents = result.rows.map(agent => ({
      id: agent.id.toString(),
      name: agent.name,
      email: agent.email,
      phone: agent.phone,
      location: agent.location,
      commission: parseFloat(agent.commission),
      active: agent.active,
      online: Math.random() > 0.5,
      ticketsToday: parseInt(agent.tickets_today) || 0,
      salesToday: parseFloat(agent.sales_today) || 0,
      supervisorId: agent.supervisor_id
    }));
    
    res.json(agents);
  } catch (error) {
    console.error('Erreur récupération agents superviseur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
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

// ============= ROUTES TICKETS =============
app.post('/api/tickets/save', async (req, res) => {
  try {
    console.log('📦 Requête ticket reçue:', req.body);
    
    const { agentId, agentName, drawId, drawName, bets, total } = req.body;
    
    if (!agentId || !drawId || !bets || !Array.isArray(bets)) {
      return res.status(400).json({ error: 'Données invalides' });
    }

    // Générer un ID de ticket
    const ticketId = `T${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();

    // Convertir les bets en format simplifié pour le stockage
    const simplifiedBets = bets.map(bet => ({
      game: bet.game || 'borlette',
      number: bet.number || '',
      amount: bet.amount || 0,
      specialType: bet.specialType || null,
      option: bet.option || null
    }));

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
      JSON.stringify(simplifiedBets),
      parseFloat(total) || 0,
      now
    ]);

    const savedTicket = ticketResult.rows[0];
    
    // Retourner au format attendu par le front-end
    res.json({
      success: true,
      ticket: {
        id: savedTicket.id,
        ticket_id: savedTicket.ticket_id,
        agentId: savedTicket.agent_id,
        agentName: savedTicket.agent_name,
        drawId: savedTicket.draw_id,
        drawName: savedTicket.draw_name,
        bets: simplifiedBets,
        total_amount: savedTicket.total_amount,
        total: savedTicket.total_amount, // Alias pour compatibilité
        date: savedTicket.date,
        checked: false
      }
    });

  } catch (error) {
    console.error('❌ Erreur sauvegarde ticket:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur lors de la sauvegarde du ticket',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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

// Supprimer un ticket
app.delete('/api/tickets/delete/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    
    // Vérifier si le ticket a moins de 10 minutes
    const ticketResult = await pool.query(
      'SELECT * FROM tickets WHERE id = $1',
      [parseInt(ticketId)]
    );
    
    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket non trouvé' });
    }
    
    const ticket = ticketResult.rows[0];
    const ticketTime = new Date(ticket.date);
    const now = new Date();
    const diffMinutes = (now - ticketTime) / (1000 * 60);
    
    // Autoriser la suppression seulement si moins de 10 minutes
    if (diffMinutes > 10) {
      return res.status(400).json({ error: 'Ticket trop ancien pour être supprimé (max 10 minutes)' });
    }
    
    await pool.query('DELETE FROM tickets WHERE id = $1', [parseInt(ticketId)]);
    
    res.json({ success: true, message: 'Ticket supprimé avec succès' });
  } catch (error) {
    console.error('Erreur suppression ticket:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= ROUTES GAGNANTS =============
app.get('/api/winners', async (req, res) => {
  try {
    const { agentId } = req.query;
    
    let query = `
      SELECT * FROM tickets 
      WHERE win_amount > 0
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

// Vérifier les tickets gagnants
app.post('/api/tickets/check-winners', async (req, res) => {
  try {
    const { agentId } = req.query;
    
    // Simulation de vérification
    const query = agentId 
      ? 'SELECT * FROM tickets WHERE agent_id = $1 AND win_amount > 0 AND checked = false'
      : 'SELECT * FROM tickets WHERE win_amount > 0 AND checked = false';
    
    const params = agentId ? [agentId] : [];
    
    const result = await pool.query(query, params);
    
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
    console.error('Erreur vérification tickets gagnants:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Résultats gagnants
app.get('/api/winners/results', async (req, res) => {
  try {
    // Récupérer les derniers résultats de tirages
    const result = await pool.query(`
      SELECT dr.* 
      FROM draw_results dr
      ORDER BY dr.published_at DESC 
      LIMIT 10
    `);
    
    const results = result.rows.map(row => ({
      drawId: row.draw_id,
      name: row.name,
      numbers: typeof row.results === 'string' ? JSON.parse(row.results) : row.results,
      drawTime: row.draw_time,
      publishedAt: row.published_at
    }));
    
    res.json({ results });
  } catch (error) {
    console.error('Erreur résultats gagnants:', error);
    res.json({ results: [] });
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
    console.log(`👨‍💼 Panneau superviseur: http://0.0.0.0:${PORT}/responsable.html`);
    console.log(`👤 Panneau agent: http://0.0.0.0:${PORT}/agent1.html`);
  });
});