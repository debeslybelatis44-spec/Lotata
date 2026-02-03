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
app.use(express.static(__dirname)); // Sert les fichiers statiques depuis le répertoire courant

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
    // Récupérer le token des headers ou du cookie
    const token = req.headers.authorization?.replace('Bearer ', '') || 
                  req.cookies?.token || 
                  req.query?.token;
    
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
    console.error('Erreur vérification token:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Token pa valab oswa ekspire'
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

// === ROUTES PUBLIQUES ===

// Route racine - page de connexion
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Route de santé
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({
      success: true,
      message: 'API LOTATO PRO fonctionne avec PostgreSQL/Neon',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      database: 'PostgreSQL/Neon - Connecté'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur de connexion à la base de données'
    });
  }
});

// === ROUTES D'AUTHENTIFICATION ===

// Connexion Agent
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Kòd ajan ak modpas obligatwa'
      });
    }
    
    const result = await db.query(
      'SELECT * FROM agents WHERE agent_id = $1 AND is_active = true',
      [username.toUpperCase()]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Kòd ajan pa egziste oswa pa aktif'
      });
    }

    const agent = result.rows[0];

    if (agent.password !== password) {
      return res.status(401).json({
        success: false,
        message: 'Modpas pa kòrèk'
      });
    }

    // Mettre à jour le statut en ligne
    await db.query(
      'UPDATE agents SET online = true, last_activity = CURRENT_TIMESTAMP WHERE id = $1',
      [agent.id]
    );

    // Créer le token JWT
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

// Connexion Superviseur
app.post('/api/auth/supervisor-login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Kòd vizè ak modpas obligatwa'
      });
    }
    
    const result = await db.query(
      'SELECT * FROM supervisors WHERE username = $1 AND is_active = true',
      [username.toLowerCase()]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Kòd vizè pa egziste'
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

// Connexion Propriétaire
app.post('/api/auth/owner-login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Kòd pwopriyetè ak modpas obligatwa'
      });
    }
    
    const result = await db.query(
      'SELECT * FROM owners WHERE username = $1 AND is_active = true',
      [username.toLowerCase()]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Kòd pwopriyetè pa egziste'
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

// === ROUTES PROTÉGÉES (FICHIERS HTML) ===

// Interface Agent
app.get('/agent', authenticate, requireRole(['agent']), (req, res) => {
  res.sendFile(path.join(__dirname, 'agent1.html'));
});

// Interface Superviseur
app.get('/supervisor', authenticate, requireRole(['supervisor']), (req, res) => {
  res.sendFile(path.join(__dirname, 'supervisor.html'));
});

// Interface Propriétaire
app.get('/owner', authenticate, requireRole(['owner']), (req, res) => {
  res.sendFile(path.join(__dirname, 'owner.html'));
});

// === ROUTES API AGENT ===

// Sauvegarder un ticket
app.post('/api/tickets/save', authenticate, requireRole(['agent']), async (req, res) => {
  try {
    const ticketData = req.body;
    
    // Vérifier l'agent
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
    
    // Vérifier les fonds
    if (parseFloat(agent.funds) < ticketData.total) {
      return res.status(400).json({
        success: false,
        message: 'Fonds ensifizan'
      });
    }
    
    // Générer ID unique
    const ticketId = `T${Date.now()}${Math.floor(Math.random() * 1000)}`;
    
    // Sauvegarder le ticket
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
    
    // Mettre à jour les fonds de l'agent
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

// Récupérer les tickets de l'agent
app.get('/api/tickets', authenticate, requireRole(['agent']), async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    
    let dateFilter = '';
    let params = [req.user.agentId];
    
    switch(period) {
      case 'today':
        dateFilter = 'AND DATE(created_at) = CURRENT_DATE';
        break;
      case 'yesterday':
        dateFilter = 'AND DATE(created_at) = CURRENT_DATE - INTERVAL \'1 day\'';
        break;
      case 'week':
        dateFilter = 'AND created_at >= CURRENT_DATE - INTERVAL \'7 days\'';
        break;
      case 'month':
        dateFilter = 'AND created_at >= CURRENT_DATE - INTERVAL \'30 days\'';
        break;
    }
    
    const result = await db.query(
      `SELECT * FROM tickets 
       WHERE agent_id = $1 ${dateFilter}
       ORDER BY created_at DESC 
       LIMIT 100`,
      params
    );
    
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

// Récupérer les rapports de l'agent
app.get('/api/reports', authenticate, requireRole(['agent']), async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    
    let dateFilter = '';
    switch(period) {
      case 'today':
        dateFilter = 'AND DATE(created_at) = CURRENT_DATE';
        break;
      case 'yesterday':
        dateFilter = 'AND DATE(created_at) = CURRENT_DATE - INTERVAL \'1 day\'';
        break;
      case 'week':
        dateFilter = 'AND created_at >= CURRENT_DATE - INTERVAL \'7 days\'';
        break;
      case 'month':
        dateFilter = 'AND created_at >= CURRENT_DATE - INTERVAL \'30 days\'';
        break;
    }
    
    // Statistiques générales
    const statsResult = await db.query(
      `SELECT 
        COUNT(*) as total_tickets,
        COALESCE(SUM(total), 0) as total_bets,
        (SELECT COALESCE(SUM(winning_amount), 0) FROM winners WHERE agent_id = $1 ${dateFilter}) as total_wins
       FROM tickets 
       WHERE agent_id = $1 ${dateFilter}`,
      [req.user.agentId]
    );
    
    const stats = statsResult.rows[0];
    const totalBets = parseFloat(stats.total_bets);
    const totalWins = parseFloat(stats.total_wins);
    const balance = totalBets - totalWins;
    
    // Détails par type de jeu
    const breakdownResult = await db.query(
      `SELECT 
        game_type,
        COUNT(*) as count,
        SUM(amount) as amount
       FROM (
         SELECT 
           jsonb_array_elements(bets::jsonb)->>'game' as game_type,
           CAST(jsonb_array_elements(bets::jsonb)->>'amount' as DECIMAL) as amount
         FROM tickets 
         WHERE agent_id = $1 ${dateFilter}
       ) as bet_details
       GROUP BY game_type`,
      [req.user.agentId]
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
      report: {
        totalTickets: parseInt(stats.total_tickets),
        totalBets: totalBets,
        totalWins: totalWins,
        totalLoss: totalBets - totalWins,
        balance: balance,
        period: period,
        breakdown: breakdown
      }
    });
  } catch (error) {
    console.error('Erreur récupération rapports:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des rapports'
    });
  }
});

// Récupérer les gains de l'agent
app.get('/api/winners', authenticate, requireRole(['agent']), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM winners 
       WHERE agent_id = $1 
       ORDER BY created_at DESC 
       LIMIT 20`,
      [req.user.agentId]
    );
    
    res.json({
      success: true,
      winners: result.rows
    });
  } catch (error) {
    console.error('Erreur récupération gains:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des gains'
    });
  }
});

// Récupérer tous les gains (pour superviseur/propriétaire)
app.get('/api/winners/all', authenticate, async (req, res) => {
  try {
    let query = 'SELECT * FROM winners';
    let params = [];
    
    // Filtrage par rôle
    if (req.user.role === 'supervisor') {
      query = `SELECT w.* FROM winners w
               INNER JOIN agents a ON w.agent_id = a.agent_id
               WHERE a.supervisor_id = $1`;
      params = [req.user.username];
    } else if (req.user.role === 'agent') {
      query = 'SELECT * FROM winners WHERE agent_id = $1';
      params = [req.user.agentId];
    }
    
    query += ' ORDER BY created_at DESC LIMIT 50';
    
    const result = await db.query(query, params);
    
    res.json({
      success: true,
      winners: result.rows
    });
  } catch (error) {
    console.error('Erreur récupération tous les gains:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des gains'
    });
  }
});

// Marquer un gain comme payé
app.post('/api/winners/:id/pay', authenticate, requireRole(['supervisor', 'owner']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Vérifier les permissions
    if (req.user.role === 'supervisor') {
      const winnerCheck = await db.query(
        `SELECT w.* FROM winners w
         INNER JOIN agents a ON w.agent_id = a.agent_id
         WHERE w.id = $1 AND a.supervisor_id = $2`,
        [id, req.user.username]
      );
      
      if (winnerCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Ou pa gen aksè a gain sa a'
        });
      }
    }
    
    const result = await db.query(
      'UPDATE winners SET paid = true WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Gain pa jwenn'
      });
    }
    
    res.json({
      success: true,
      message: 'Gain make kòm peye',
      winner: result.rows[0]
    });
  } catch (error) {
    console.error('Erreur marquage payé:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du marquage du gain'
    });
  }
});

// === ROUTES SUPERVISEUR ===

// Dashboard superviseur
app.get('/api/supervisor/dashboard', authenticate, requireRole(['supervisor']), async (req, res) => {
  try {
    // Statistiques agents
    const agentsResult = await db.query(
      `SELECT 
        COUNT(*) as total_agents,
        COUNT(CASE WHEN online = true THEN 1 END) as online_agents,
        SUM(funds) as total_funds
       FROM agents 
       WHERE supervisor_id = $1 AND is_active = true`,
      [req.user.username]
    );
    
    // Ventes aujourd'hui
    const salesResult = await db.query(
      `SELECT 
        COALESCE(SUM(total), 0) as today_sales,
        COUNT(*) as total_tickets
       FROM tickets 
       WHERE agent_id IN (SELECT agent_id FROM agents WHERE supervisor_id = $1)
       AND DATE(created_at) = CURRENT_DATE`,
      [req.user.username]
    );
    
    // Gains aujourd'hui
    const winsResult = await db.query(
      `SELECT 
        COALESCE(SUM(winning_amount), 0) as total_wins
       FROM winners 
       WHERE agent_id IN (SELECT agent_id FROM agents WHERE supervisor_id = $1)
       AND DATE(created_at) = CURRENT_DATE`,
      [req.user.username]
    );
    
    // Agents récents
    const recentAgentsResult = await db.query(
      `SELECT 
        a.agent_id, 
        a.agent_name, 
        a.online, 
        a.funds,
        COALESCE(t.today_sales, 0) as today_sales,
        COALESCE(w.total_wins, 0) as total_wins
       FROM agents a
       LEFT JOIN (
         SELECT agent_id, SUM(total) as today_sales
         FROM tickets 
         WHERE DATE(created_at) = CURRENT_DATE
         GROUP BY agent_id
       ) t ON a.agent_id = t.agent_id
       LEFT JOIN (
         SELECT agent_id, SUM(winning_amount) as total_wins
         FROM winners 
         WHERE DATE(created_at) = CURRENT_DATE
         GROUP BY agent_id
       ) w ON a.agent_id = w.agent_id
       WHERE a.supervisor_id = $1 AND a.is_active = true
       ORDER BY a.last_activity DESC
       LIMIT 5`,
      [req.user.username]
    );
    
    const todaySales = parseFloat(salesResult.rows[0].today_sales);
    const commission = todaySales * 0.05; // 5% de commission
    
    res.json({
      success: true,
      dashboard: {
        totalAgents: parseInt(agentsResult.rows[0].total_agents),
        onlineAgents: parseInt(agentsResult.rows[0].online_agents),
        todaySales: todaySales,
        totalTickets: salesResult.rows[0].total_tickets,
        totalWins: parseFloat(winsResult.rows[0].total_wins),
        totalCommission: commission,
        totalFunds: parseFloat(agentsResult.rows[0].total_funds),
        recentAgents: recentAgentsResult.rows.map(agent => ({
          agentId: agent.agent_id,
          agentName: agent.agent_name,
          online: agent.online,
          funds: parseFloat(agent.funds),
          todaySales: parseFloat(agent.today_sales),
          totalWins: parseFloat(agent.total_wins)
        }))
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

// === ROUTES PROPRIÉTAIRE ===

// Dashboard propriétaire
app.get('/api/owner/dashboard', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    // Statistiques agents
    const agentsResult = await db.query(
      `SELECT 
        COUNT(*) as total_agents,
        COUNT(CASE WHEN online = true THEN 1 END) as online_agents
       FROM agents WHERE is_active = true`
    );
    
    // Statistiques superviseurs
    const supervisorsResult = await db.query(
      `SELECT 
        COUNT(*) as total_supervisors,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_supervisors
       FROM supervisors`
    );
    
    // Ventes aujourd'hui
    const salesResult = await db.query(
      `SELECT COALESCE(SUM(total), 0) as today_sales FROM tickets WHERE DATE(created_at) = CURRENT_DATE`
    );
    
    // Gains aujourd'hui
    const winsResult = await db.query(
      `SELECT COALESCE(SUM(winning_amount), 0) as today_wins FROM winners WHERE DATE(created_at) = CURRENT_DATE`
    );
    
    res.json({
      success: true,
      dashboard: {
        totalAgents: parseInt(agentsResult.rows[0].total_agents),
        onlineAgents: parseInt(agentsResult.rows[0].online_agents),
        totalSupervisors: parseInt(supervisorsResult.rows[0].total_supervisors),
        activeSupervisors: parseInt(supervisorsResult.rows[0].active_supervisors),
        todaySales: parseFloat(salesResult.rows[0].today_sales),
        todayWins: parseFloat(winsResult.rows[0].today_wins),
        profit: parseFloat(salesResult.rows[0].today_sales) - parseFloat(winsResult.rows[0].today_wins)
      }
    });
  } catch (error) {
    console.error('Erreur dashboard propriétaire:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du chargement du dashboard'
    });
  }
});

// === ROUTES UTILITAIRES ===

// Initialiser les comptes par défaut
app.post('/api/init/default-accounts', async (req, res) => {
  try {
    await db.query(`
      INSERT INTO agents (agent_id, agent_name, password, funds, supervisor_id, is_active) 
      VALUES ('AGENT01', 'Ajan Prensipal', '123456', 50000, 'supervisor', true)
      ON CONFLICT (agent_id) DO NOTHING;
      
      INSERT INTO supervisors (username, password, name, permissions, max_delete_time, is_active) 
      VALUES ('supervisor', '123456', 'Supervizè Prensipal', 
              ARRAY['view_all', 'manage_agents', 'approve_funds', 'view_reports', 'delete_tickets', 'block_agents']::text[], 10, true)
      ON CONFLICT (username) DO NOTHING;
      
      INSERT INTO owners (username, password, name, is_active) 
      VALUES ('owner', '123456', 'Pwopriyetè', true)
      ON CONFLICT (username) DO NOTHING;
    `);
    
    res.json({
      success: true,
      message: 'Kont default kreye avèk siksè'
    });
  } catch (error) {
    console.error('Erreur initialisation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur initializasyon'
    });
  }
});

// Initialiser les données par défaut (tirages, boules, règles)
app.post('/api/init/default-data', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    // Créer les tirages par défaut
    await db.query(`
      INSERT INTO draws (draw_id, draw_name, draw_time, is_active) VALUES
        ('D001', 'Matin', '08:00:00', true),
        ('D002', 'Midday', '12:00:00', true),
        ('D003', 'Soir', '16:00:00', true),
        ('D004', 'Night', '20:00:00', true)
      ON CONFLICT (draw_id) DO NOTHING;
    `);
    
    // Créer les boules 0-99
    for (let i = 0; i < 100; i++) {
      const ballNumber = i.toString().padStart(2, '0');
      await db.query(
        'INSERT INTO balls (ball_number) VALUES ($1) ON CONFLICT (ball_number) DO NOTHING',
        [ballNumber]
      );
    }
    
    // Créer les règles de jeu
    await db.query(`
      INSERT INTO game_rules (game_type, game_name, pouts, is_active) VALUES
        ('borlette', '2 Chiffres', '{"direct": 80, "permutation": 40}', true),
        ('lotto3', '3 Chiffres', '{"direct": 600, "permutation": 300}', true),
        ('lotto4', '4 Chiffres', '{"direct": 5000, "permutation": 2500}', true),
        ('lotto5', '5 Chiffres', '{"direct": 40000, "permutation": 20000}', true)
      ON CONFLICT (game_type) DO NOTHING;
    `);
    
    res.json({
      success: true,
      message: 'Données par défaut initialisées avec succès'
    });
  } catch (error) {
    console.error('Erreur initialisation données:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'initialisation'
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
  console.log(`\n⚠️ IMPORTANT: Exécutez d'abord /api/init/default-accounts pour créer les comptes`);
  console.log(`⚠️ IMPORTANT: Puis /api/init/default-data pour initialiser les données`);
});