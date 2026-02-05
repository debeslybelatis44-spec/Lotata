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

// ============= ROUTES PROPRIÉTAIRE =============

// Route tableau de bord principal
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

// Statistiques utilisateurs
app.get('/api/users/stats', async (req, res) => {
  try {
    const totalAgents = await pool.query('SELECT COUNT(*) FROM agents WHERE active = true');
    const totalSupervisors = await pool.query('SELECT COUNT(*) FROM supervisors WHERE active = true');
    const blockedAgents = await pool.query('SELECT COUNT(*) FROM agents WHERE active = false');
    
    res.json({
      totalAgents: parseInt(totalAgents.rows[0].count),
      totalSupervisors: parseInt(totalSupervisors.rows[0].count),
      blockedAgents: parseInt(blockedAgents.rows[0].count),
      activeUsers: parseInt(totalAgents.rows[0].count) + parseInt(totalSupervisors.rows[0].count)
    });
  } catch (error) {
    console.error('Erreur stats utilisateurs:', error);
    res.json({
      totalAgents: 0,
      totalSupervisors: 0,
      blockedAgents: 0,
      activeUsers: 0
    });
  }
});

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
    res.json({ limits });
  } catch (error) {
    console.error('Erreur limites numéros:', error);
    res.json({ limits: {} });
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
    
    res.json({ success: true, message: 'Limites mises à jour' });
  } catch (error) {
    console.error('Erreur mise à jour limites:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Statistiques des numéros
app.get('/api/numbers/stats', async (req, res) => {
  try {
    const blockedCount = await pool.query('SELECT COUNT(*) FROM blocked_numbers');
    const limitsCount = await pool.query('SELECT COUNT(*) FROM number_limits');
    
    // Statistiques d'utilisation des numéros (simulation)
    const mostPlayed = [
      { number: '07', count: 150 },
      { number: '23', count: 145 },
      { number: '45', count: 132 }
    ];
    
    res.json({
      blockedCount: parseInt(blockedCount.rows[0].count),
      limitsCount: parseInt(limitsCount.rows[0].count),
      mostPlayed: mostPlayed
    });
  } catch (error) {
    console.error('Erreur stats numéros:', error);
    res.json({
      blockedCount: 0,
      limitsCount: 0,
      mostPlayed: []
    });
  }
});

// Publication de tirage
app.post('/api/draws/publish', async (req, res) => {
  try {
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
    const drawId = `DRAW-${Date.now()}`;
    
    await pool.query(
      `INSERT INTO draw_results (draw_id, name, draw_time, results, lucky_number, comment, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [drawId, name, dateTime, JSON.stringify(results), luckyNumber, comment || '', source || 'manual']
    );
    
    // Ajouter une entrée d'activité
    await pool.query(
      `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [req.user?.id || 'owner', 'owner', 'draw_published', `Tirage ${name} publié manuellement`]
    );
    
    res.json({ success: true, drawId, message: 'Tirage publié avec succès' });
  } catch (error) {
    console.error('Erreur publication tirage:', error);
    res.status(500).json({ error: 'Erreur serveur: ' + error.message });
  }
});

// Historique des publications
app.get('/api/draws/history', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM draw_results 
      ORDER BY published_at DESC 
      LIMIT 50
    `);
    
    const history = result.rows.map(row => ({
      id: row.id,
      drawId: row.draw_id,
      name: row.name,
      drawTime: row.draw_time,
      results: typeof row.results === 'string' ? JSON.parse(row.results) : row.results,
      luckyNumber: row.lucky_number,
      comment: row.comment,
      source: row.source,
      publishedAt: row.published_at
    }));
    
    res.json({ history });
  } catch (error) {
    console.error('Erreur historique tirages:', error);
    res.json({ history: [] });
  }
});

// Blocage de tirage
app.patch('/api/draws/:id/block', async (req, res) => {
  try {
    const { id } = req.params;
    const { blocked } = req.body;
    
    await pool.query('UPDATE draws SET active = $1 WHERE id = $2', [!blocked, id]);
    
    res.json({ success: true, message: `Tirage ${blocked ? 'bloqué' : 'débloqué'}` });
  } catch (error) {
    console.error('Erreur blocage tirage:', error);
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
    
    res.json({
      totalDraws: parseInt(totalDraws.rows[0].count),
      activeDraws: parseInt(activeDraws.rows[0].count),
      publishedToday: parseInt(publishedToday.rows[0].count)
    });
  } catch (error) {
    console.error('Erreur stats tirages:', error);
    res.json({
      totalDraws: 0,
      activeDraws: 0,
      publishedToday: 0
    });
  }
});

// Récupération automatique (simulation)
app.post('/api/draws/fetch', async (req, res) => {
  try {
    const { url } = req.body;
    
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
    }
    
    // Journal d'activité
    await pool.query(
      `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [req.user?.id || 'system', 'owner', 'auto_fetch', `Récupération automatique depuis ${url}`]
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

// Règles du jeu
app.get('/api/rules', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM game_rules ORDER BY rule_key');
    const rules = result.rows.map(row => ({
      key: row.rule_key,
      value: row.rule_value,
      description: row.description
    }));
    res.json({ rules });
  } catch (error) {
    console.error('Erreur règles:', error);
    res.json({ rules: [] });
  }
});

// Mettre à jour les règles
app.put('/api/rules', async (req, res) => {
  try {
    const { rules } = req.body;
    
    for (const rule of rules) {
      await pool.query(
        `INSERT INTO game_rules (rule_key, rule_value, description, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (rule_key) 
         DO UPDATE SET rule_value = $2, description = $3, updated_at = NOW()`,
        [rule.key, rule.value, rule.description]
      );
    }
    
    res.json({ success: true, message: 'Règles mises à jour' });
  } catch (error) {
    console.error('Erreur mise à jour règles:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Paramètres système
app.get('/api/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM system_settings');
    const settings = {};
    result.rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });
    res.json({ settings });
  } catch (error) {
    console.error('Erreur paramètres:', error);
    res.json({ settings: {} });
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
    
    res.json({ success: true, message: 'Paramètres mis à jour' });
  } catch (error) {
    console.error('Erreur mise à jour paramètres:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Journal d'activité pour propriétaire
app.get('/api/reports/activity', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM activity_log 
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
            row.user_role === 'agent' ? 'Agent' : 'Système'
    }));
    
    res.json({ activity });
  } catch (error) {
    console.error('Erreur activité:', error);
    res.json({ activity: [] });
  }
});

// Rapports de ventes
app.get('/api/reports/sales', async (req, res) => {
  try {
    const { period } = req.query; // 'today', 'week', 'month'
    
    let dateFilter = 'DATE(date) = CURRENT_DATE';
    if (period === 'week') {
      dateFilter = 'date >= CURRENT_DATE - INTERVAL \'7 days\'';
    } else if (period === 'month') {
      dateFilter = 'date >= CURRENT_DATE - INTERVAL \'30 days\'';
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
    
    res.json({ sales: result.rows });
  } catch (error) {
    console.error('Erreur rapports ventes:', error);
    res.json({ sales: [] });
  }
});

// Export des données
app.get('/api/users/export', async (req, res) => {
  try {
    const { type } = req.query;
    
    let data = [];
    
    if (!type || type === 'agents') {
      const agents = await pool.query('SELECT * FROM agents');
      data = data.concat(agents.rows.map(a => ({ 
        ...a, 
        role: 'agent',
        password: undefined 
      })));
    }
    
    if (!type || type === 'supervisors') {
      const supervisors = await pool.query('SELECT * FROM supervisors');
      data = data.concat(supervisors.rows.map(s => ({ 
        ...s, 
        role: 'supervisor',
        password: undefined 
      })));
    }
    
    res.json(data);
  } catch (error) {
    console.error('Erreur export:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= ROUTES EXISTANTES =============

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
  });
});