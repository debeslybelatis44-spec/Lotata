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

// === ROUTES SUPERVISEUR (simplifiées pour cet exemple) ===

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

// === ROUTES PROPRIÉTAIRE (simplifiées pour cet exemple) ===

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
    
    res.json({
      success: true,
      stats: {
        totalAgents: parseInt(agentsResult.rows[0].total_agents),
        onlineAgents: parseInt(agentsResult.rows[0].online_agents),
        totalSupervisors: parseInt(supervisorsResult.rows[0].total_supervisors),
        activeSupervisors: parseInt(supervisorsResult.rows[0].active_supervisors),
        todaySales: parseFloat(salesResult.rows[0].today_sales)
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

// === ROUTES FICHIERS STATIQUES ===

// Route pour la page de connexion
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Route pour l'interface agent (protégée)
app.get('/agent1.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'agent1.html'));
});

// Route pour l'interface superviseur (à créer)
app.get('/supervisor.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'supervisor.html'));
});

// Route pour l'interface propriétaire (à créer)
app.get('/owner.html', (req, res) => {
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
});