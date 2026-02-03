const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.'));

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'lotato-pro-super-secret-key-2024';

// Configuration PostgreSQL/Neon
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test de connexion
pool.on('connect', () => {
  console.log('✅ Connecté à PostgreSQL/Neon');
});

pool.on('error', (err) => {
  console.error('❌ Erreur PostgreSQL:', err);
});

// Middleware d'authentification
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token otantifikasyon obligatwa'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token pa valab'
    });
  }
};

// Middleware de vérification de rôle
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Ou pa gen otorizasyon pou aksyon sa a'
      });
    }
    next();
  };
};

// Fonction helper pour exécuter les requêtes
const db = {
  query: async (text, params) => {
    const client = await pool.connect();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }
};

// === ROUTES D'AUTHENTIFICATION ===

// 1. Connexion Agent
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const result = await db.query(
      'SELECT * FROM agents WHERE agent_id = $1 AND is_active = true',
      [username.toUpperCase()]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Kòd ajan pa egziste'
      });
    }

    const agent = result.rows[0];

    if (agent.password !== password) {
      return res.status(401).json({
        success: false,
        message: 'Modpas pa kòrèk'
      });
    }

    await db.query(
      'UPDATE agents SET online = true, last_activity = CURRENT_TIMESTAMP WHERE id = $1',
      [agent.id]
    );

    const token = jwt.sign(
      {
        id: agent.id,
        agentId: agent.agent_id,
        name: agent.agent_name,
        role: 'agent',
        supervisorId: agent.supervisor_id
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'Koneksyon reyisi',
      token: token,
      user: {
        id: agent.id,
        agentId: agent.agent_id,
        name: agent.agent_name,
        role: 'agent',
        supervisorId: agent.supervisor_id
      }
    });
  } catch (error) {
    console.error('Erreur connexion agent:', error);
    res.status(500).json({
      success: false,
      message: 'Erè sèvè entèn'
    });
  }
});

// 2. Connexion Superviseur
app.post('/api/auth/supervisor-login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const result = await db.query(
      'SELECT * FROM supervisors WHERE username = $1 AND is_active = true',
      [username.toLowerCase()]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Supervizè pa egziste'
      });
    }

    const supervisor = result.rows[0];

    if (supervisor.password !== password) {
      return res.status(401).json({
        success: false,
        message: 'Modpas pa kòrèk'
      });
    }

    const token = jwt.sign(
      {
        id: supervisor.id,
        username: supervisor.username,
        name: supervisor.name,
        role: 'supervisor',
        permissions: supervisor.permissions || [],
        maxDeleteTime: supervisor.max_delete_time
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'Koneksyon reyisi',
      token: token,
      user: {
        id: supervisor.id,
        username: supervisor.username,
        name: supervisor.name,
        role: 'supervisor',
        permissions: supervisor.permissions || [],
        maxDeleteTime: supervisor.max_delete_time
      }
    });
  } catch (error) {
    console.error('Erreur connexion superviseur:', error);
    res.status(500).json({
      success: false,
      message: 'Erè sèvè entèn'
    });
  }
});

// 3. Connexion Propriétaire
app.post('/api/auth/owner-login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const result = await db.query(
      'SELECT * FROM owners WHERE username = $1 AND is_active = true',
      [username.toLowerCase()]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Pwopriyetè pa egziste'
      });
    }

    const owner = result.rows[0];

    if (owner.password !== password) {
      return res.status(401).json({
        success: false,
        message: 'Modpas pa kòrèk'
      });
    }

    const token = jwt.sign(
      {
        id: owner.id,
        username: owner.username,
        name: owner.name,
        role: 'owner'
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'Koneksyon reyisi',
      token: token,
      user: {
        id: owner.id,
        username: owner.username,
        name: owner.name,
        role: 'owner'
      }
    });
  } catch (error) {
    console.error('Erreur connexion propriétaire:', error);
    res.status(500).json({
      success: false,
      message: 'Erè sèvè entèn'
    });
  }
});

// Vérification de session
app.get('/api/auth/verify', authenticate, async (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// Déconnexion
app.post('/api/auth/logout', authenticate, async (req, res) => {
  try {
    if (req.user.role === 'agent') {
      await db.query(
        'UPDATE agents SET online = false WHERE agent_id = $1',
        [req.user.agentId]
      );
    }
    
    res.json({
      success: true,
      message: 'Dekonekte avèk siksè'
    });
  } catch (error) {
    res.json({
      success: true,
      message: 'Dekonekte avèk siksè'
    });
  }
});

// Initialiser les comptes par défaut
app.post('/api/init/default-accounts', async (req, res) => {
  try {
    const result = await db.query(`
      DO $$
      BEGIN
        -- Créer agent par défaut
        INSERT INTO agents (agent_id, agent_name, password, funds, supervisor_id) 
        VALUES ('AGENT01', 'Ajan Prensipal', '123456', 50000, 'supervisor')
        ON CONFLICT (agent_id) DO NOTHING;
        
        -- Créer superviseur par défaut
        INSERT INTO supervisors (username, password, name, permissions, max_delete_time) 
        VALUES ('supervisor', '123456', 'Supervizè Prensipal', 
                ARRAY['view_all', 'manage_agents', 'approve_funds', 'view_reports', 'delete_tickets', 'block_agents'], 10)
        ON CONFLICT (username) DO NOTHING;
        
        -- Créer propriétaire par défaut
        INSERT INTO owners (username, password, name) 
        VALUES ('owner', '123456', 'Pwopriyetè')
        ON CONFLICT (username) DO NOTHING;
        
        -- Créer des tirages par défaut
        INSERT INTO draws (draw_id, draw_name, draw_time, is_active) 
        VALUES 
          ('D001', 'Matin', '08:00:00', true),
          ('D002', 'Midday', '12:00:00', true),
          ('D003', 'Soir', '16:00:00', true),
          ('D004', 'Night', '20:00:00', true)
        ON CONFLICT (draw_id) DO NOTHING;
      END $$;
    `);
    
    res.json({
      success: true,
      message: 'Kont default kreye avèk siksè'
    });
  } catch (error) {
    console.error('Erreur initialisation:', error);
    res.status(500).json({
      success: false,
      message: 'Erè initializasyon'
    });
  }
});

// === ROUTES AGENT ===

// Récupérer les tirages actifs
app.get('/api/draws/active', authenticate, requireRole(['agent']), async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM draws WHERE is_active = true ORDER BY draw_time'
    );
    
    const draws = result.rows.map(draw => ({
      drawId: draw.draw_id,
      drawName: draw.draw_name,
      drawTime: draw.draw_time,
      isActive: draw.is_active
    }));
    
    res.json({
      success: true,
      draws
    });
  } catch (error) {
    console.error('Erreur récupération tirages:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des tirages'
    });
  }
});

// Sauvegarder un ticket
app.post('/api/tickets/save', authenticate, requireRole(['agent']), async (req, res) => {
  try {
    const ticketData = req.body;
    
    const agentResult = await db.query(
      'SELECT * FROM agents WHERE agent_id = $1 AND is_active = true',
      [req.user.agentId]
    );
    
    if (agentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ajan pa jwenn oswa pa aktif'
      });
    }
    
    const agent = agentResult.rows[0];
    
    // Vérifier si le tirage est bloqué (3 minutes avant)
    const drawResult = await db.query(
      'SELECT * FROM draws WHERE draw_id = $1',
      [ticketData.drawId]
    );
    
    if (drawResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tiraj pa jwenn'
      });
    }
    
    const draw = drawResult.rows[0];
    const drawTime = new Date(`1970-01-01T${draw.draw_time}`);
    const now = new Date();
    const currentTime = new Date(`1970-01-01T${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:00`);
    
    // Bloquer 3 minutes avant
    const blockedTime = new Date(drawTime.getTime() - (3 * 60 * 1000));
    
    if (currentTime >= blockedTime && currentTime < drawTime) {
      return res.status(400).json({
        success: false,
        message: 'Tiraj sa a ap rantre nan 3 minit. Ou pa ka ajoute paray.'
      });
    }
    
    if (parseFloat(agent.funds) < ticketData.total) {
      return res.status(400).json({
        success: false,
        message: 'Fonds ensifizan'
      });
    }
    
    const ticketId = `T${Date.now()}${Math.floor(Math.random() * 1000)}`;
    
    const result = await db.query(
      `INSERT INTO tickets (ticket_id, agent_id, agent_name, draw_id, draw_name, bets, total, checked) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING *`,
      [
        ticketId,
        req.user.agentId,
        req.user.name,
        ticketData.drawId,
        ticketData.drawName,
        JSON.stringify(ticketData.bets),
        ticketData.total,
        false
      ]
    );
    
    const newFunds = parseFloat(agent.funds) - ticketData.total;
    await db.query(
      'UPDATE agents SET funds = $1, last_activity = CURRENT_TIMESTAMP WHERE agent_id = $2',
      [newFunds, req.user.agentId]
    );
    
    res.status(201).json({
      success: true,
      message: 'Ticket sauvegardé avec succès',
      ticket: result.rows[0]
    });
  } catch (error) {
    console.error('Erreur sauvegarde ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la sauvegarde du ticket'
    });
  }
});

// Récupérer les tickets d'un agent
app.get('/api/tickets', authenticate, async (req, res) => {
  try {
    const { agentId, period } = req.query;
    const user = req.user;
    
    // Vérifier les permissions
    if (user.role === 'agent' && user.agentId !== agentId) {
      return res.status(403).json({
        success: false,
        message: 'Ou pa gen aksè a istorik ajan sa a'
      });
    }
    
    if (user.role === 'supervisor' && agentId) {
      const agentResult = await db.query(
        'SELECT * FROM agents WHERE agent_id = $1 AND supervisor_id = $2',
        [agentId, user.username]
      );
      
      if (agentResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Ou pa gen aksè a istorik ajan sa a'
        });
      }
    }
    
    let query = 'SELECT * FROM tickets WHERE agent_id = $1';
    let params = [agentId];
    
    if (period) {
      const now = new Date();
      let startDate = new Date();
      
      switch(period) {
        case 'today':
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'yesterday':
          startDate.setDate(startDate.getDate() - 1);
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(startDate.getMonth() - 1);
          break;
      }
      
      query += ` AND created_at >= $2`;
      params.push(startDate.toISOString());
    }
    
    query += ' ORDER BY created_at DESC LIMIT 100';
    
    const result = await db.query(query, params);
    
    res.json({
      success: true,
      tickets: result.rows
    });
  } catch (error) {
    console.error('Erreur récupération tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des tickets'
    });
  }
});

// Récupérer les rapports d'un agent
app.get('/api/reports', authenticate, async (req, res) => {
  try {
    const { agentId, period = 'today' } = req.query;
    const user = req.user;
    
    // Vérifier les permissions
    if (user.role === 'agent' && user.agentId !== agentId) {
      return res.status(403).json({
        success: false,
        message: 'Ou pa gen aksè a rapò ajan sa a'
      });
    }
    
    const startDate = new Date();
    switch(period) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'yesterday':
        startDate.setDate(startDate.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
    }
    
    // Tickets vendus
    const ticketsResult = await db.query(
      `SELECT 
        COUNT(*) as total_tickets,
        COALESCE(SUM(total), 0) as total_bets
       FROM tickets 
       WHERE agent_id = $1 AND created_at >= $2`,
      [agentId, startDate]
    );
    
    // Gains
    const winsResult = await db.query(
      `SELECT 
        COALESCE(SUM(winning_amount), 0) as total_wins
       FROM winners 
       WHERE agent_id = $1 AND created_at >= $2 AND paid = true`,
      [agentId, startDate]
    );
    
    // Agent info
    const agentResult = await db.query(
      'SELECT funds, agent_name FROM agents WHERE agent_id = $1',
      [agentId]
    );
    
    const agent = agentResult.rows[0];
    const totalTickets = parseInt(ticketsResult.rows[0].total_tickets);
    const totalBets = parseFloat(ticketsResult.rows[0].total_bets);
    const totalWins = parseFloat(winsResult.rows[0].total_wins);
    const totalLoss = totalBets - totalWins;
    const balance = totalBets - totalWins;
    
    // Breakdown par type de jeu
    const breakdownResult = await db.query(
      `SELECT 
        game_type,
        COUNT(*) as count,
        SUM(amount) as amount
       FROM (
         SELECT 
           jsonb_array_elements(bets)->>'game' as game_type,
           CAST(jsonb_array_elements(bets)->>'amount' AS DECIMAL) as amount
         FROM tickets 
         WHERE agent_id = $1 AND created_at >= $2
       ) sub
       GROUP BY game_type`,
      [agentId, startDate]
    );
    
    const breakdown = {};
    breakdownResult.rows.forEach(row => {
      breakdown[row.game_type] = {
        count: parseInt(row.count),
        amount: parseFloat(row.amount)
      };
    });
    
    res.json({
      success: true,
      totalTickets,
      totalBets,
      totalWins,
      totalLoss,
      balance,
      breakdown
    });
  } catch (error) {
    console.error('Erreur récupération rapports:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des rapports'
    });
  }
});

// === ROUTES SUPERVISEUR ===

app.get('/api/supervisor/dashboard', authenticate, requireRole(['supervisor']), async (req, res) => {
  try {
    const supervisorId = req.user.username;
    
    const agentsResult = await db.query(
      `SELECT 
        COUNT(*) as total_agents,
        COUNT(CASE WHEN online = true AND is_active = true THEN 1 END) as online_agents,
        SUM(funds) as total_funds
       FROM agents 
       WHERE supervisor_id = $1`,
      [supervisorId]
    );
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const salesResult = await db.query(
      `SELECT 
        COALESCE(SUM(total), 0) as today_sales,
        COUNT(*) as total_tickets
       FROM tickets 
       WHERE agent_id IN (SELECT agent_id FROM agents WHERE supervisor_id = $1)
       AND created_at >= $2`,
      [supervisorId, today]
    );
    
    res.json({
      success: true,
      data: {
        totalAgents: agentsResult.rows[0].total_agents,
        onlineAgents: agentsResult.rows[0].online_agents,
        todaySales: parseFloat(salesResult.rows[0].today_sales),
        totalTickets: salesResult.rows[0].total_tickets,
        totalFunds: parseFloat(agentsResult.rows[0].total_funds)
      }
    });
  } catch (error) {
    console.error('Erreur dashboard superviseur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du chargement du dashboard'
    });
  }
});

// Liste des agents d'un superviseur
app.get('/api/supervisor/agents', authenticate, requireRole(['supervisor']), async (req, res) => {
  try {
    const supervisorId = req.user.username;
    
    const result = await db.query(
      'SELECT * FROM agents WHERE supervisor_id = $1 ORDER BY created_at DESC',
      [supervisorId]
    );
    
    res.json({
      success: true,
      agents: result.rows
    });
  } catch (error) {
    console.error('Erreur liste agents:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des agents'
    });
  }
});

// === ROUTES PROPRIÉTAIRE ===

app.get('/api/owner/dashboard', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    const agentsResult = await db.query(
      `SELECT 
        COUNT(*) as total_agents,
        COUNT(CASE WHEN online = true THEN 1 END) as online_agents
       FROM agents`
    );
    
    const supervisorsResult = await db.query(
      `SELECT 
        COUNT(*) as total_supervisors,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_supervisors
       FROM supervisors`
    );
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const salesResult = await db.query(
      `SELECT COALESCE(SUM(total), 0) as today_sales FROM tickets WHERE created_at >= $1`,
      [today]
    );
    
    // Calcul des gains du jour
    const winsResult = await db.query(
      `SELECT COALESCE(SUM(winning_amount), 0) as today_wins FROM winners WHERE created_at >= $1 AND paid = true`,
      [today]
    );
    
    // Tirages actifs
    const drawsResult = await db.query(
      `SELECT COUNT(*) as total_draws, COUNT(CASE WHEN is_active = true THEN 1 END) as active_draws FROM draws`
    );
    
    // Boules bloquées
    const ballsResult = await db.query(
      `SELECT COUNT(*) as blocked_balls FROM blocked_numbers WHERE is_blocked = true`
    );
    
    // Activités récentes
    const activitiesResult = await db.query(
      `SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 10`
    );
    
    // Récupérer les superviseurs en ligne
    const onlineSupervisorsResult = await db.query(
      `SELECT COUNT(*) as online_supervisors FROM supervisors WHERE last_activity > NOW() - INTERVAL '5 minutes'`
    );
    
    res.json({
      success: true,
      stats: {
        totalAgents: parseInt(agentsResult.rows[0].total_agents),
        onlineAgents: parseInt(agentsResult.rows[0].online_agents),
        totalSupervisors: parseInt(supervisorsResult.rows[0].total_supervisors),
        activeSupervisors: parseInt(supervisorsResult.rows[0].active_supervisors),
        onlineSupervisors: parseInt(onlineSupervisorsResult.rows[0].online_supervisors),
        todaySales: parseFloat(salesResult.rows[0].today_sales),
        todayWins: parseFloat(winsResult.rows[0].today_wins),
        totalDraws: parseInt(drawsResult.rows[0].total_draws),
        activeDraws: parseInt(drawsResult.rows[0].active_draws),
        blockedBalls: parseInt(ballsResult.rows[0].blocked_balls)
      },
      recentActivities: activitiesResult.rows
    });
  } catch (error) {
    console.error('Erreur dashboard propriétaire:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du chargement du dashboard'
    });
  }
});

// Récupérer tous les utilisateurs
app.get('/api/owner/users', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    // Agents
    const agentsResult = await db.query(
      'SELECT * FROM agents ORDER BY created_at DESC'
    );
    
    // Superviseurs
    const supervisorsResult = await db.query(
      'SELECT * FROM supervisors ORDER BY created_at DESC'
    );
    
    // Pour chaque superviseur, compter le nombre d'agents
    const supervisorsWithCount = await Promise.all(supervisorsResult.rows.map(async supervisor => {
      const countResult = await db.query(
        'SELECT COUNT(*) as agent_count FROM agents WHERE supervisor_id = $1',
        [supervisor.username]
      );
      
      return {
        ...supervisor,
        agentCount: parseInt(countResult.rows[0].agent_count)
      };
    }));
    
    res.json({
      success: true,
      agents: agentsResult.rows,
      supervisors: supervisorsWithCount
    });
  } catch (error) {
    console.error('Erreur récupération utilisateurs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur récupération utilisateurs' 
    });
  }
});

// Créer un nouvel utilisateur
app.post('/api/owner/users', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    const { type, username, name, password, email, phone, supervisorId, location } = req.body;
    
    if (type === 'supervisor') {
      const result = await db.query(
        `INSERT INTO supervisors (username, password, name, email, phone, is_active) 
         VALUES ($1, $2, $3, $4, $5, true) 
         RETURNING *`,
        [username.toLowerCase(), password, name, email || null, phone || null]
      );
      
      // Journaliser l'action
      await db.query(
        `INSERT INTO system_logs (user_id, user_role, action, details) 
         VALUES ($1, 'owner', 'CREATE_SUPERVISOR', $2)`,
        [req.user.username, `Création superviseur: ${username}`]
      );
      
      res.json({
        success: true,
        message: 'Superviseur créé',
        user: result.rows[0]
      });
      
    } else if (type === 'agent') {
      // Vérifier que le superviseur existe
      const supervisorResult = await db.query(
        'SELECT * FROM supervisors WHERE username = $1',
        [supervisorId]
      );
      
      if (supervisorResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Supervizè sa pa egziste'
        });
      }
      
      const result = await db.query(
        `INSERT INTO agents (agent_id, agent_name, password, supervisor_id, location, funds, is_active) 
         VALUES ($1, $2, $3, $4, $5, 0, true) 
         RETURNING *`,
        [username.toUpperCase(), name, password, supervisorId, location || null]
      );
      
      // Journaliser l'action
      await db.query(
        `INSERT INTO system_logs (user_id, user_role, action, details) 
         VALUES ($1, 'owner', 'CREATE_AGENT', $2)`,
        [req.user.username, `Création agent: ${username}`]
      );
      
      res.json({
        success: true,
        message: 'Agent créé',
        user: result.rows[0]
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Tip itilizatè pa valab'
      });
    }
  } catch (error) {
    console.error('Erreur création utilisateur:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur création utilisateur' 
    });
  }
});

// Blocage/déblocage utilisateur
app.post('/api/owner/users/:userId/block', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { block } = req.body;
    
    let table, idField;
    
    // Déterminer si c'est un agent ou superviseur
    if (userId.toUpperCase().startsWith('AGENT')) {
      table = 'agents';
      idField = 'agent_id';
    } else {
      table = 'supervisors';
      idField = 'username';
    }
    
    await db.query(
      `UPDATE ${table} SET is_active = $1 WHERE ${idField} = $2`,
      [block, userId]
    );
    
    // Journaliser l'action
    await db.query(
      `INSERT INTO system_logs (user_id, user_role, action, details) 
       VALUES ($1, 'owner', 'BLOCK_USER', $2)`,
      [req.user.username, `${block ? 'Blocage' : 'Déblocage'} utilisateur: ${userId}`]
    );
    
    res.json({
      success: true,
      message: `Utilisateur ${block ? 'bloqué' : 'débloqué'}`
    });
  } catch (error) {
    console.error('Erreur blocage:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur blocage' 
    });
  }
});

// Gestion des tirages
app.get('/api/owner/draws', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM draws ORDER BY draw_time'
    );
    
    // Ajouter les ventes d'aujourd'hui pour chaque tirage
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const draws = await Promise.all(result.rows.map(async draw => {
      const salesResult = await db.query(
        'SELECT COALESCE(SUM(total), 0) as sales FROM tickets WHERE draw_id = $1 AND created_at >= $2',
        [draw.draw_id, today]
      );
      
      return {
        drawId: draw.draw_id,
        drawName: draw.draw_name,
        drawTime: draw.draw_time,
        isActive: draw.is_active,
        sales: parseFloat(salesResult.rows[0].sales)
      };
    }));
    
    res.json({ 
      success: true, 
      draws 
    });
  } catch (error) {
    console.error('Erreur tirages:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur tirages' 
    });
  }
});

// Activer/désactiver un tirage
app.post('/api/owner/draws/:drawId/toggle', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    const { drawId } = req.params;
    const { isActive } = req.body;
    
    await db.query(
      'UPDATE draws SET is_active = $1 WHERE draw_id = $2',
      [isActive, drawId]
    );
    
    // Journaliser l'action
    await db.query(
      `INSERT INTO system_logs (user_id, user_role, action, details) 
       VALUES ($1, 'owner', 'TOGGLE_DRAW', $2)`,
      [req.user.username, `${isActive ? 'Activation' : 'Désactivation'} tirage: ${drawId}`]
    );
    
    res.json({
      success: true,
      message: `Tirage ${isActive ? 'activé' : 'désactivé'}`
    });
  } catch (error) {
    console.error('Erreur modification tirage:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur modification tirage' 
    });
  }
});

// Gestion des boules (numéros)
app.get('/api/owner/balls', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    // Récupérer les boules bloquées
    const blockedResult = await db.query(
      'SELECT * FROM blocked_numbers ORDER BY ball_number'
    );
    
    // Récupérer les limites
    const limitsResult = await db.query(
      'SELECT * FROM number_limits ORDER BY ball_number'
    );
    
    // Créer un tableau de 0 à 99
    const balls = [];
    for (let i = 0; i < 100; i++) {
      const ballNumber = i.toString().padStart(2, '0');
      const blocked = blockedResult.rows.find(b => b.ball_number === ballNumber);
      const limit = limitsResult.rows.find(l => l.ball_number === ballNumber);
      
      balls.push({
        ballNumber,
        isBlocked: blocked ? blocked.is_blocked : false,
        blockedAt: blocked ? blocked.blocked_at : null,
        limitAmount: limit ? parseFloat(limit.limit_amount) : 0,
        currentAmount: limit ? parseFloat(limit.current_amount) : 0
      });
    }
    
    res.json({
      success: true,
      balls
    });
  } catch (error) {
    console.error('Erreur récupération boules:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur récupération boules' 
    });
  }
});

// Bloquer/débloquer une boule
app.post('/api/owner/balls/:ballNumber/block', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    const { ballNumber } = req.params;
    const { isBlocked } = req.body;
    
    if (isBlocked) {
      await db.query(
        `INSERT INTO blocked_numbers (ball_number, is_blocked) 
         VALUES ($1, true) 
         ON CONFLICT (ball_number) 
         DO UPDATE SET is_blocked = true, blocked_at = CURRENT_TIMESTAMP`,
        [ballNumber]
      );
    } else {
      await db.query(
        'DELETE FROM blocked_numbers WHERE ball_number = $1',
        [ballNumber]
      );
    }
    
    // Journaliser l'action
    await db.query(
      `INSERT INTO system_logs (user_id, user_role, action, details) 
       VALUES ($1, 'owner', 'BLOCK_BALL', $2)`,
      [req.user.username, `${isBlocked ? 'Blocage' : 'Déblocage'} boule: ${ballNumber}`]
    );
    
    res.json({
      success: true,
      message: `Boule ${ballNumber} ${isBlocked ? 'bloquée' : 'débloquée'}`
    });
  } catch (error) {
    console.error('Erreur blocage boule:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur blocage boule' 
    });
  }
});

// Définir une limite pour une boule
app.post('/api/owner/balls/:ballNumber/limit', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    const { ballNumber } = req.params;
    const { limitAmount } = req.body;
    
    if (limitAmount > 0) {
      await db.query(
        `INSERT INTO number_limits (ball_number, limit_amount) 
         VALUES ($1, $2) 
         ON CONFLICT (ball_number) 
         DO UPDATE SET limit_amount = $2`,
        [ballNumber, limitAmount]
      );
    } else {
      await db.query(
        'DELETE FROM number_limits WHERE ball_number = $1',
        [ballNumber]
      );
    }
    
    // Journaliser l'action
    await db.query(
      `INSERT INTO system_logs (user_id, user_role, action, details) 
       VALUES ($1, 'owner', 'SET_BALL_LIMIT', $2)`,
      [req.user.username, `Limite boule ${ballNumber}: ${limitAmount} Gdes`]
    );
    
    res.json({
      success: true,
      message: `Limite définie pour boule ${ballNumber}`
    });
  } catch (error) {
    console.error('Erreur définition limite:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur définition limite' 
    });
  }
});

// Récupérer les règles de jeu
app.get('/api/owner/rules', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM game_rules ORDER BY game_type'
    );
    
    res.json({
      success: true,
      rules: result.rows
    });
  } catch (error) {
    console.error('Erreur récupération règles:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur récupération règles' 
    });
  }
});

// Publier un tirage manuellement
app.post('/api/owner/draws/publish', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    const { drawName, results, luckyNumber, publishedBy, source, comment } = req.body;
    
    // Vérifier que le tirage existe
    const drawResult = await db.query(
      'SELECT * FROM draws WHERE draw_name = $1',
      [drawName]
    );
    
    if (drawResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tiraj pa jwenn'
      });
    }
    
    const draw = drawResult.rows[0];
    
    // Vérifier que les résultats sont valides
    if (!results || results.length !== 5) {
      return res.status(400).json({
        success: false,
        message: '5 rezilta obligatwa'
      });
    }
    
    // Enregistrer les résultats
    const resultId = `R${Date.now()}`;
    
    await db.query(
      `INSERT INTO draw_results (result_id, draw_id, draw_name, results, lucky_number, published_by, source, comment) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        resultId,
        draw.draw_id,
        drawName,
        JSON.stringify(results),
        luckyNumber || null,
        publishedBy,
        source || 'manual',
        comment || null
      ]
    );
    
    // Calculer les gains pour tous les tickets non vérifiés de ce tirage
    const ticketsResult = await db.query(
      'SELECT * FROM tickets WHERE draw_id = $1 AND checked = false',
      [draw.draw_id]
    );
    
    for (const ticket of ticketsResult.rows) {
      const bets = JSON.parse(ticket.bets);
      let totalWinning = 0;
      
      // Logique de calcul des gains (simplifiée)
      for (const bet of bets) {
        // Exemple simple: pour borlette, vérifier si le numéro est dans les résultats
        if (bet.game === 'borlette') {
          const cleanNumber = bet.cleanNumber;
          const lastTwoDigits = results.map(num => num.toString().padStart(2, '0').slice(-2));
          
          if (lastTwoDigits.includes(cleanNumber)) {
            totalWinning += bet.amount * 70; // Exemple: gain 70x
          }
        }
        // Ajouter d'autres logiques de jeu ici
      }
      
      if (totalWinning > 0) {
        // Enregistrer le gain
        await db.query(
          `INSERT INTO winners (ticket_id, agent_id, agent_name, winning_amount, draw_id, draw_name, paid) 
           VALUES ($1, $2, $3, $4, $5, $6, false)`,
          [
            ticket.ticket_id,
            ticket.agent_id,
            ticket.agent_name,
            totalWinning,
            draw.draw_id,
            drawName
          ]
        );
      }
      
      // Marquer le ticket comme vérifié
      await db.query(
        'UPDATE tickets SET checked = true WHERE ticket_id = $1',
        [ticket.ticket_id]
      );
    }
    
    // Journaliser l'action
    await db.query(
      `INSERT INTO system_logs (user_id, user_role, action, details) 
       VALUES ($1, 'owner', 'PUBLISH_DRAW', $2)`,
      [req.user.username, `Publication tirage ${drawName}: ${results.join(', ')}`]
    );
    
    res.json({
      success: true,
      message: 'Tirage publié avec succès'
    });
  } catch (error) {
    console.error('Erreur publication tirage:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur publication tirage' 
    });
  }
});

// Historique des publications
app.get('/api/owner/draws/history', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    const result = await db.query(
      'SELECT * FROM draw_results ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    
    res.json({
      success: true,
      history: result.rows
    });
  } catch (error) {
    console.error('Erreur historique publications:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur historique publications' 
    });
  }
});

// Journal d'activité
app.get('/api/owner/activity', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const result = await db.query(
      'SELECT * FROM system_logs ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    
    res.json({
      success: true,
      activities: result.rows
    });
  } catch (error) {
    console.error('Erreur journal activité:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur journal activité' 
    });
  }
});

// Initialisation des données par défaut (pour owner)
app.post('/api/owner/init-defaults', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    // Créer les tables si elles n'existent pas
    await db.query(`
      -- Table des tirages
      CREATE TABLE IF NOT EXISTS draws (
        id SERIAL PRIMARY KEY,
        draw_id VARCHAR(10) UNIQUE NOT NULL,
        draw_name VARCHAR(50) NOT NULL,
        draw_time TIME NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Table des boules bloquées
      CREATE TABLE IF NOT EXISTS blocked_numbers (
        id SERIAL PRIMARY KEY,
        ball_number VARCHAR(2) UNIQUE NOT NULL,
        is_blocked BOOLEAN DEFAULT true,
        blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Table des limites de numéros
      CREATE TABLE IF NOT EXISTS number_limits (
        id SERIAL PRIMARY KEY,
        ball_number VARCHAR(2) UNIQUE NOT NULL,
        limit_amount DECIMAL(10,2) DEFAULT 0,
        current_amount DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Table des résultats de tirages
      CREATE TABLE IF NOT EXISTS draw_results (
        id SERIAL PRIMARY KEY,
        result_id VARCHAR(20) UNIQUE NOT NULL,
        draw_id VARCHAR(10) NOT NULL,
        draw_name VARCHAR(50) NOT NULL,
        results JSONB NOT NULL,
        lucky_number INTEGER,
        published_by VARCHAR(100) NOT NULL,
        source VARCHAR(20) DEFAULT 'manual',
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Table des gains
      CREATE TABLE IF NOT EXISTS winners (
        id SERIAL PRIMARY KEY,
        ticket_id VARCHAR(50) NOT NULL,
        agent_id VARCHAR(20) NOT NULL,
        agent_name VARCHAR(100) NOT NULL,
        winning_amount DECIMAL(10,2) NOT NULL,
        draw_id VARCHAR(10) NOT NULL,
        draw_name VARCHAR(50) NOT NULL,
        paid BOOLEAN DEFAULT false,
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Table des règles de jeu
      CREATE TABLE IF NOT EXISTS game_rules (
        id SERIAL PRIMARY KEY,
        game_type VARCHAR(50) UNIQUE NOT NULL,
        game_name VARCHAR(100) NOT NULL,
        payouts JSONB NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Table des logs système
      CREATE TABLE IF NOT EXISTS system_logs (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL,
        user_role VARCHAR(20) NOT NULL,
        action VARCHAR(100) NOT NULL,
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Insérer les règles de jeu par défaut
    const defaultRules = [
      {
        game_type: 'borlette',
        game_name: 'Borlette',
        payouts: JSON.stringify({ win: 70 }),
        is_active: true
      },
      {
        game_type: 'lotto3',
        game_name: 'Lotto 3',
        payouts: JSON.stringify({ win: 500 }),
        is_active: true
      },
      {
        game_type: 'lotto4',
        game_name: 'Lotto 4',
        payouts: JSON.stringify({ win: 2500 }),
        is_active: true
      },
      {
        game_type: 'lotto5',
        game_name: 'Lotto 5',
        payouts: JSON.stringify({ win: 10000 }),
        is_active: true
      }
    ];
    
    for (const rule of defaultRules) {
      await db.query(
        `INSERT INTO game_rules (game_type, game_name, payouts, is_active) 
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (game_type) DO NOTHING`,
        [rule.game_type, rule.game_name, rule.payouts, rule.is_active]
      );
    }
    
    res.json({
      success: true,
      message: 'Done default inisyalize avèk siksè'
    });
  } catch (error) {
    console.error('Erreur initialisation données:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur initialisation données'
    });
  }
});

// === ROUTES FICHIERS STATIQUES ===

// Route pour la page de connexion
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Route pour l'interface agent
app.get('/agent1.html', authenticate, requireRole(['agent']), (req, res) => {
  res.sendFile(path.join(__dirname, 'agent1.html'));
});

// Route pour l'interface superviseur
app.get('/supervisor.html', authenticate, requireRole(['supervisor']), (req, res) => {
  res.sendFile(path.join(__dirname, 'supervisor.html'));
});

// Route pour l'interface propriétaire
app.get('/owner.html', authenticate, requireRole(['owner']), (req, res) => {
  res.sendFile(path.join(__dirname, 'owner.html'));
});

// Route de santé
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({
      success: true,
      message: 'API LOTATO PRO fonctionne',
      timestamp: new Date().toISOString(),
      database: 'PostgreSQL/Neon - Connecté'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur de connexion à la base de données'
    });
  }
});

// Gestion des erreurs 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Rout pa jwenn'
  });
});

// Middleware de gestion d'erreurs global
app.use((err, req, res, next) => {
  console.error('Erreur globale:', err);
  res.status(500).json({
    success: false,
    message: 'Erè sèvè entèn'
  });
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur LOTATO PRO démarré sur le port ${PORT}`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`🗄️ Base de données: PostgreSQL/Neon`);
  console.log(`👤 Comptes par défaut:`);
  console.log(`   - Agent: AGENT01 / 123456`);
  console.log(`   - Superviseur: supervisor / 123456`);
  console.log(`   - Propriétaire: owner / 123456`);
  console.log(`\n📋 Tables créées automatiquement:`);
  console.log(`   ✅ draws, tickets, winners`);
  console.log(`   ✅ blocked_numbers, number_limits`);
  console.log(`   ✅ draw_results, game_rules, system_logs`);
});