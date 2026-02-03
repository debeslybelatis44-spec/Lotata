const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
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

// Middleware pour vérifier que l'agent appartient au superviseur
const checkSupervisorAgent = async (req, res, next) => {
  if (req.user.role !== 'supervisor') return next();
  
  try {
    const { agentId } = req.params;
    
    const agentResult = await db.query(
      'SELECT supervisor_id FROM agents WHERE agent_id = $1',
      [agentId]
    );
    
    if (agentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ajan pa jwenn'
      });
    }
    
    const agent = agentResult.rows[0];
    
    if (agent.supervisor_id !== req.user.username) {
      return res.status(403).json({
        success: false,
        message: 'Ou pa gen aksè a ajan sa a'
      });
    }
    
    next();
  } catch (error) {
    console.error('Erreur vérification agent:', error);
    res.status(500).json({
      success: false,
      message: 'Erè sèvè entèn'
    });
  }
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

// === ROUTES PROPRIÉTAIRE ===

// Dashboard propriétaire
app.get('/api/owner/dashboard', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    // Statistiques des agents
    const agentsResult = await db.query(
      `SELECT 
        COUNT(*) as total_agents,
        COUNT(CASE WHEN online = true AND is_active = true THEN 1 END) as online_agents
       FROM agents`
    );
    
    // Statistiques des superviseurs
    const supervisorsResult = await db.query(
      `SELECT 
        COUNT(*) as total_supervisors,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_supervisors
       FROM supervisors`
    );
    
    // Ventes aujourd'hui
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const salesResult = await db.query(
      `SELECT COALESCE(SUM(total), 0) as today_sales FROM tickets WHERE created_at >= $1`,
      [today]
    );
    
    // Gains aujourd'hui
    const winsResult = await db.query(
      `SELECT COALESCE(SUM(winning_amount), 0) as today_wins FROM winners WHERE created_at >= $1`,
      [today]
    );
    
    // Tirages actifs
    const drawsResult = await db.query(
      `SELECT 
        COUNT(*) as total_draws,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_draws
       FROM draws`
    );
    
    // Boules bloquées
    const ballsResult = await db.query(
      `SELECT COUNT(*) as blocked_balls FROM balls WHERE is_blocked = true`
    );
    
    // Activités récentes
    const activityResult = await db.query(
      `SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 10`
    );
    
    const stats = {
      totalAgents: parseInt(agentsResult.rows[0].total_agents),
      onlineAgents: parseInt(agentsResult.rows[0].online_agents),
      totalSupervisors: parseInt(supervisorsResult.rows[0].total_supervisors),
      onlineSupervisors: parseInt(supervisorsResult.rows[0].active_supervisors),
      todaySales: parseFloat(salesResult.rows[0].today_sales),
      todayWins: parseFloat(winsResult.rows[0].today_wins),
      activeDraws: parseInt(drawsResult.rows[0].active_draws),
      totalDraws: parseInt(drawsResult.rows[0].total_draws),
      blockedBalls: parseInt(ballsResult.rows[0].blocked_balls)
    };
    
    const recentActivities = activityResult.rows.map(activity => ({
      action: activity.action,
      details: activity.details,
      userRole: activity.user_role,
      userId: activity.user_id,
      createdAt: activity.created_at
    }));
    
    res.json({
      success: true,
      stats,
      recentActivities
    });
  } catch (error) {
    console.error('Erreur dashboard propriétaire:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du chargement du dashboard'
    });
  }
});

// Initialiser les données par défaut
app.post('/api/owner/init-defaults', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    // Vérifier si les tirages existent déjà
    const drawsCount = await db.query('SELECT COUNT(*) FROM draws');
    
    if (drawsCount.rows[0].count === '0') {
      // Créer les tirages par défaut
      await db.query(`
        INSERT INTO draws (draw_id, draw_name, draw_time, is_active) VALUES
          ('D001', 'Matin', '08:00:00', true),
          ('D002', 'Midday', '12:00:00', true),
          ('D003', 'Soir', '16:00:00', true),
          ('D004', 'Night', '20:00:00', true)
        ON CONFLICT (draw_id) DO NOTHING;
      `);
    }
    
    // Vérifier si les boules existent déjà
    const ballsCount = await db.query('SELECT COUNT(*) FROM balls');
    
    if (ballsCount.rows[0].count === '0') {
      // Créer les boules 0-99
      await db.query(`
        INSERT INTO balls (ball_number)
        SELECT TO_CHAR(num, 'FM00') FROM generate_series(0, 99) as num
        ON CONFLICT (ball_number) DO NOTHING;
      `);
    }
    
    // Vérifier si les règles existent déjà
    const rulesCount = await db.query('SELECT COUNT(*) FROM game_rules');
    
    if (rulesCount.rows[0].count === '0') {
      // Créer les règles par défaut
      await db.query(`
        INSERT INTO game_rules (game_type, game_name, pouts, is_active) VALUES
          ('2-chiffres', '2 Chiffres', '{"direct": 80, "permutation": 40}', true),
          ('3-chiffres', '3 Chiffres', '{"direct": 600, "permutation": 300}', true),
          ('4-chiffres', '4 Chiffres', '{"direct": 5000, "permutation": 2500}', true),
          ('5-chiffres', '5 Chiffres', '{"direct": 40000, "permutation": 20000}', true)
        ON CONFLICT (game_type) DO NOTHING;
      `);
    }
    
    // Journaliser l'action
    await db.query(
      'INSERT INTO activity_log (user_id, user_role, action, details) VALUES ($1, $2, $3, $4)',
      [req.user.username, req.user.role, 'Initialisation des données', 'Données par défaut initialisées avec succès']
    );
    
    res.json({
      success: true,
      message: 'Données initialisées avec succès'
    });
  } catch (error) {
    console.error('Erreur initialisation données:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'initialisation'
    });
  }
});

// Gestion des utilisateurs (agents + superviseurs)
app.get('/api/owner/users', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    // Récupérer tous les agents
    const agentsResult = await db.query(
      `SELECT 
        a.*,
        s.name as supervisor_name,
        (SELECT COUNT(*) FROM tickets t WHERE t.agent_id = a.agent_id AND DATE(t.created_at) = CURRENT_DATE) as today_tickets,
        (SELECT COALESCE(SUM(total), 0) FROM tickets t WHERE t.agent_id = a.agent_id AND DATE(t.created_at) = CURRENT_DATE) as today_sales
       FROM agents a
       LEFT JOIN supervisors s ON a.supervisor_id = s.username
       ORDER BY a.created_at DESC`
    );
    
    // Récupérer tous les superviseurs
    const supervisorsResult = await db.query(
      `SELECT 
        s.*,
        (SELECT COUNT(*) FROM agents a WHERE a.supervisor_id = s.username) as agent_count
       FROM supervisors s
       ORDER BY s.created_at DESC`
    );
    
    const agents = agentsResult.rows.map(agent => ({
      agentId: agent.agent_id,
      agentName: agent.agent_name,
      supervisorId: agent.supervisor_id,
      supervisorName: agent.supervisor_name,
      funds: parseFloat(agent.funds),
      isActive: agent.is_active,
      online: agent.online,
      location: agent.location,
      createdAt: agent.created_at,
      todayTickets: parseInt(agent.today_tickets),
      todaySales: parseFloat(agent.today_sales)
    }));
    
    const supervisors = supervisorsResult.rows.map(supervisor => ({
      username: supervisor.username,
      name: supervisor.name,
      isActive: supervisor.is_active,
      permissions: supervisor.permissions,
      maxDeleteTime: supervisor.max_delete_time,
      agentCount: parseInt(supervisor.agent_count),
      createdAt: supervisor.created_at
    }));
    
    res.json({
      success: true,
      agents,
      supervisors
    });
  } catch (error) {
    console.error('Erreur récupération utilisateurs:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des utilisateurs'
    });
  }
});

// Créer un utilisateur (agent ou superviseur)
app.post('/api/owner/users', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    const { type, username, name, password, email, phone, supervisorId, location } = req.body;
    
    if (type === 'supervisor') {
      // Créer un superviseur
      const result = await db.query(
        `INSERT INTO supervisors (username, password, name, email, phone, permissions, max_delete_time) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) 
         RETURNING *`,
        [
          username.toLowerCase(),
          password || '123456',
          name,
          email || null,
          phone || null,
          ['view_all', 'manage_agents', 'approve_funds', 'view_reports'],
          10
        ]
      );
      
      // Journaliser
      await db.query(
        'INSERT INTO activity_log (user_id, user_role, action, details) VALUES ($1, $2, $3, $4)',
        [req.user.username, req.user.role, 'Création superviseur', `Superviseur ${username} créé`]
      );
      
      res.json({
        success: true,
        message: 'Superviseur créé avec succès',
        user: result.rows[0]
      });
      
    } else if (type === 'agent') {
      // Créer un agent
      const result = await db.query(
        `INSERT INTO agents (agent_id, agent_name, password, supervisor_id, location, funds) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING *`,
        [
          username.toUpperCase(),
          name,
          password || '123456',
          supervisorId || 'supervisor',
          location || null,
          10000
        ]
      );
      
      // Journaliser
      await db.query(
        'INSERT INTO activity_log (user_id, user_role, action, details) VALUES ($1, $2, $3, $4)',
        [req.user.username, req.user.role, 'Création agent', `Agent ${username} créé`]
      );
      
      res.json({
        success: true,
        message: 'Agent créé avec succès',
        user: result.rows[0]
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Type d\'utilisateur invalide'
      });
    }
  } catch (error) {
    console.error('Erreur création utilisateur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de l\'utilisateur'
    });
  }
});

// Bloquer/Débloquer un utilisateur
app.post('/api/owner/users/:userId/block', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { block = true } = req.body;
    
    // Vérifier si c'est un agent ou un superviseur
    let query, table, idField;
    
    // Vérifier dans agents
    const agentCheck = await db.query('SELECT * FROM agents WHERE agent_id = $1', [userId.toUpperCase()]);
    if (agentCheck.rows.length > 0) {
      table = 'agents';
      idField = 'agent_id';
    } else {
      // Vérifier dans superviseurs
      const supervisorCheck = await db.query('SELECT * FROM supervisors WHERE username = $1', [userId.toLowerCase()]);
      if (supervisorCheck.rows.length > 0) {
        table = 'supervisors';
        idField = 'username';
      } else {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }
    }
    
    const result = await db.query(
      `UPDATE ${table} SET is_active = $1, online = false WHERE ${idField} = $2 RETURNING *`,
      [!block, table === 'supervisors' ? userId.toLowerCase() : userId.toUpperCase()]
    );
    
    const action = block ? 'bloqué' : 'débloqué';
    
    // Journaliser
    await db.query(
      'INSERT INTO activity_log (user_id, user_role, action, details) VALUES ($1, $2, $3, $4)',
      [req.user.username, req.user.role, 'Blocage utilisateur', `Utilisateur ${userId} ${action}`]
    );
    
    res.json({
      success: true,
      message: `Utilisateur ${action} avec succès`,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Erreur blocage utilisateur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du blocage/déblocage'
    });
  }
});

// Gestion des tirages
app.get('/api/owner/draws', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    const drawsResult = await db.query(
      `SELECT 
        d.*,
        (SELECT COUNT(*) FROM tickets t WHERE t.draw_id = d.draw_id AND DATE(t.created_at) = CURRENT_DATE) as today_tickets,
        (SELECT COALESCE(SUM(total), 0) FROM tickets t WHERE t.draw_id = d.draw_id AND DATE(t.created_at) = CURRENT_DATE) as today_sales
       FROM draws d
       ORDER BY d.draw_time`
    );
    
    const draws = drawsResult.rows.map(draw => ({
      drawId: draw.draw_id,
      drawName: draw.draw_name,
      drawTime: draw.draw_time,
      isActive: draw.is_active,
      createdAt: draw.created_at,
      sales: parseFloat(draw.today_sales),
      ticketCount: parseInt(draw.today_tickets)
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

// Activer/Désactiver un tirage
app.post('/api/owner/draws/:drawId/toggle', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    const { drawId } = req.params;
    const { isActive } = req.body;
    
    const result = await db.query(
      'UPDATE draws SET is_active = $1 WHERE draw_id = $2 RETURNING *',
      [isActive, drawId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tirage non trouvé'
      });
    }
    
    const action = isActive ? 'activé' : 'désactivé';
    
    // Journaliser
    await db.query(
      'INSERT INTO activity_log (user_id, user_role, action, details) VALUES ($1, $2, $3, $4)',
      [req.user.username, req.user.role, 'Modification tirage', `Tirage ${drawId} ${action}`]
    );
    
    res.json({
      success: true,
      message: `Tirage ${action} avec succès`,
      draw: result.rows[0]
    });
  } catch (error) {
    console.error('Erreur modification tirage:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la modification'
    });
  }
});

// Publier un tirage manuellement
app.post('/api/owner/draws/publish', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    const { drawName, results, luckyNumber, publishedBy, source = 'manual', comment } = req.body;
    
    // Vérifier que le tirage existe et est actif
    const drawResult = await db.query(
      'SELECT * FROM draws WHERE draw_name = $1 AND is_active = true',
      [drawName]
    );
    
    if (drawResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tirage non trouvé ou inactif'
      });
    }
    
    const draw = drawResult.rows[0];
    
    // Vérifier les résultats (5 numéros)
    if (!results || !Array.isArray(results) || results.length !== 5) {
      return res.status(400).json({
        success: false,
        message: '5 numéros sont requis'
      });
    }
    
    // Sauvegarder les résultats
    const result = await db.query(
      `INSERT INTO draw_results (draw_name, draw_id, results, lucky_number, published_by, source, comment) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [
        drawName,
        draw.draw_id,
        results,
        luckyNumber || null,
        publishedBy,
        source,
        comment || null
      ]
    );
    
    // Journaliser
    await db.query(
      'INSERT INTO activity_log (user_id, user_role, action, details) VALUES ($1, $2, $3, $4)',
      [req.user.username, req.user.role, 'Publication tirage', `Tirage ${drawName} publié manuellement`]
    );
    
    res.json({
      success: true,
      message: 'Tirage publié avec succès',
      result: result.rows[0]
    });
  } catch (error) {
    console.error('Erreur publication tirage:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la publication'
    });
  }
});

// Historique des publications
app.get('/api/owner/draws/history', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    const historyResult = await db.query(
      'SELECT * FROM draw_results ORDER BY published_at DESC LIMIT $1',
      [limit]
    );
    
    const history = historyResult.rows.map(record => ({
      drawName: record.draw_name,
      drawId: record.draw_id,
      results: record.results,
      luckyNumber: record.lucky_number,
      publishedBy: record.published_by,
      publishedAt: record.published_at,
      source: record.source,
      comment: record.comment
    }));
    
    res.json({
      success: true,
      history
    });
  } catch (error) {
    console.error('Erreur récupération historique:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de l\'historique'
    });
  }
});

// Gestion des boules
app.get('/api/owner/balls', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    const ballsResult = await db.query(
      'SELECT * FROM balls ORDER BY ball_number'
    );
    
    const balls = ballsResult.rows.map(ball => ({
      ballNumber: ball.ball_number,
      isBlocked: ball.is_blocked,
      blockedAt: ball.blocked_at,
      limitAmount: parseFloat(ball.limit_amount),
      currentAmount: parseFloat(ball.current_amount)
    }));
    
    res.json({
      success: true,
      balls
    });
  } catch (error) {
    console.error('Erreur récupération boules:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des boules'
    });
  }
});

// Bloquer/Débloquer une boule
app.post('/api/owner/balls/:ballNumber/block', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    const { ballNumber } = req.params;
    const { isBlocked } = req.body;
    
    // Vérifier que le numéro est valide (00-99)
    if (!/^\d{2}$/.test(ballNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Numéro de boule invalide'
      });
    }
    
    const result = await db.query(
      'UPDATE balls SET is_blocked = $1, blocked_at = $2 WHERE ball_number = $3 RETURNING *',
      [isBlocked, isBlocked ? new Date() : null, ballNumber]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Boule non trouvée'
      });
    }
    
    const action = isBlocked ? 'bloquée' : 'débloquée';
    
    // Journaliser
    await db.query(
      'INSERT INTO activity_log (user_id, user_role, action, details) VALUES ($1, $2, $3, $4)',
      [req.user.username, req.user.role, 'Modification boule', `Boule ${ballNumber} ${action}`]
    );
    
    res.json({
      success: true,
      message: `Boule ${ballNumber} ${action} avec succès`,
      ball: result.rows[0]
    });
  } catch (error) {
    console.error('Erreur modification boule:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la modification'
    });
  }
});

// Définir une limite sur une boule
app.post('/api/owner/balls/:ballNumber/limit', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    const { ballNumber } = req.params;
    const { limitAmount } = req.body;
    
    if (!/^\d{2}$/.test(ballNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Numéro de boule invalide'
      });
    }
    
    const result = await db.query(
      'UPDATE balls SET limit_amount = $1 WHERE ball_number = $2 RETURNING *',
      [limitAmount, ballNumber]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Boule non trouvée'
      });
    }
    
    const action = limitAmount > 0 ? `Limite définie: ${limitAmount} Gdes` : 'Limite supprimée';
    
    // Journaliser
    await db.query(
      'INSERT INTO activity_log (user_id, user_role, action, details) VALUES ($1, $2, $3, $4)',
      [req.user.username, req.user.role, 'Modification limite boule', `Boule ${ballNumber}: ${action}`]
    );
    
    res.json({
      success: true,
      message: action,
      ball: result.rows[0]
    });
  } catch (error) {
    console.error('Erreur modification limite:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la modification'
    });
  }
});

// Gestion des règles de jeu
app.get('/api/owner/rules', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    const rulesResult = await db.query('SELECT * FROM game_rules ORDER BY game_type');
    
    const rules = rulesResult.rows.map(rule => ({
      gameType: rule.game_type,
      gameName: rule.game_name,
      pouts: rule.pouts,
      isActive: rule.is_active,
      createdAt: rule.created_at
    }));
    
    res.json({
      success: true,
      rules
    });
  } catch (error) {
    console.error('Erreur récupération règles:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des règles'
    });
  }
});

// Activer/Désactiver une règle
app.post('/api/owner/rules/:gameType/toggle', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    const { gameType } = req.params;
    const { isActive } = req.body;
    
    const result = await db.query(
      'UPDATE game_rules SET is_active = $1 WHERE game_type = $2 RETURNING *',
      [isActive, gameType]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Règle non trouvée'
      });
    }
    
    const action = isActive ? 'activée' : 'désactivée';
    
    // Journaliser
    await db.query(
      'INSERT INTO activity_log (user_id, user_role, action, details) VALUES ($1, $2, $3, $4)',
      [req.user.username, req.user.role, 'Modification règle', `Règle ${gameType} ${action}`]
    );
    
    res.json({
      success: true,
      message: `Règle ${action} avec succès`,
      rule: result.rows[0]
    });
  } catch (error) {
    console.error('Erreur modification règle:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la modification'
    });
  }
});

// Modifier une règle
app.post('/api/owner/rules/:gameType', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    const { gameType } = req.params;
    const { gameName, pouts } = req.body;
    
    const result = await db.query(
      'UPDATE game_rules SET game_name = $1, pouts = $2 WHERE game_type = $3 RETURNING *',
      [gameName, pouts, gameType]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Règle non trouvée'
      });
    }
    
    // Journaliser
    await db.query(
      'INSERT INTO activity_log (user_id, user_role, action, details) VALUES ($1, $2, $3, $4)',
      [req.user.username, req.user.role, 'Modification règle', `Règle ${gameType} modifiée`]
    );
    
    res.json({
      success: true,
      message: 'Règle modifiée avec succès',
      rule: result.rows[0]
    });
  } catch (error) {
    console.error('Erreur modification règle:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la modification'
    });
  }
});

// Journal d'activité
app.get('/api/owner/activity', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const activityResult = await db.query(
      'SELECT * FROM activity_log ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    
    const activities = activityResult.rows.map(activity => ({
      id: activity.id,
      userId: activity.user_id,
      userRole: activity.user_role,
      action: activity.action,
      details: activity.details,
      createdAt: activity.created_at
    }));
    
    res.json({
      success: true,
      activities
    });
  } catch (error) {
    console.error('Erreur récupération journal:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du journal'
    });
  }
});

// Sauvegarder un ticket
app.post('/api/tickets/save', authenticate, requireRole(['agent']), async (req, res) => {
  try {
    const ticketData = req.body;
    
    const agentResult = await db.query(
      'SELECT * FROM agents WHERE agent_id = $1 AND is_active = true',
      [ticketData.agentId]
    );
    
    if (agentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ajan pa jwenn oswa pa aktif'
      });
    }
    
    const agent = agentResult.rows[0];
    
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
        ticketData.agentId,
        ticketData.agentName,
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
      [newFunds, ticketData.agentId]
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

// Récupérer les tickets
app.get('/api/tickets', authenticate, async (req, res) => {
  try {
    const { agentId, period } = req.query;
    
    if (req.user.role === 'agent' && req.user.agentId !== agentId) {
      return res.status(403).json({
        success: false,
        message: 'Ou pa gen aksè a istorik ajan sa a'
      });
    }
    
    if (req.user.role === 'supervisor' && agentId) {
      const agentResult = await db.query(
        'SELECT * FROM agents WHERE agent_id = $1 AND supervisor_id = $2',
        [agentId, req.user.username]
      );
      
      if (agentResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Ou pa gen aksè a istorik ajan sa a'
        });
      }
    }
    
    let query = 'SELECT * FROM tickets';
    let params = [];
    
    if (agentId) {
      query += ' WHERE agent_id = $1';
      params.push(agentId);
    }
    
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
      
      if (params.length > 0) {
        query += ` AND created_at >= $${params.length + 1}`;
      } else {
        query += ' WHERE created_at >= $1';
      }
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

// === ROUTES SUPERVISEUR ===

// Dashboard superviseur
app.get('/api/supervisor/dashboard', authenticate, requireRole(['supervisor']), async (req, res) => {
  try {
    const supervisorId = req.user.username;
    
    const agentsResult = await db.query(
      `SELECT 
        COUNT(*) as total_agents,
        COUNT(CASE WHEN online = true AND is_active = true THEN 1 END) as online_agents,
        SUM(CASE WHEN is_active = true THEN funds ELSE 0 END) as total_funds
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
    
    const winsResult = await db.query(
      `SELECT 
        COALESCE(SUM(winning_amount), 0) as total_wins
       FROM winners 
       WHERE agent_id IN (SELECT agent_id FROM agents WHERE supervisor_id = $1)
       AND created_at >= $2`,
      [supervisorId, today]
    );
    
    const recentAgentsResult = await db.query(
      `SELECT 
        a.agent_id, 
        a.agent_name, 
        a.online, 
        a.last_activity,
        a.funds,
        a.is_active,
        COALESCE(t.today_sales, 0) as today_sales,
        COALESCE(t.ticket_count, 0) as ticket_count,
        COALESCE(w.total_wins, 0) as total_wins
       FROM agents a
       LEFT JOIN (
         SELECT agent_id, SUM(total) as today_sales, COUNT(*) as ticket_count
         FROM tickets 
         WHERE created_at >= $2
         GROUP BY agent_id
       ) t ON a.agent_id = t.agent_id
       LEFT JOIN (
         SELECT agent_id, SUM(winning_amount) as total_wins
         FROM winners 
         WHERE created_at >= $2
         GROUP BY agent_id
       ) w ON a.agent_id = w.agent_id
       WHERE a.supervisor_id = $1
       ORDER BY a.last_activity DESC
       LIMIT 5`,
      [supervisorId, today]
    );
    
    const commission = salesResult.rows[0].today_sales * 0.05;
    
    res.json({
      success: true,
      data: {
        activeAgents: agentsResult.rows[0].total_agents,
        onlineAgents: agentsResult.rows[0].online_agents,
        todaySales: parseFloat(salesResult.rows[0].today_sales),
        totalTickets: salesResult.rows[0].total_tickets,
        totalWins: parseFloat(winsResult.rows[0].total_wins),
        totalCommission: commission,
        totalFunds: parseFloat(agentsResult.rows[0].total_funds),
        recentAgents: recentAgentsResult.rows.map(agent => ({
          agentId: agent.agent_id,
          agentName: agent.agent_name,
          online: agent.online,
          lastActivity: agent.last_activity,
          funds: parseFloat(agent.funds),
          isActive: agent.is_active,
          todaySales: parseFloat(agent.today_sales),
          ticketCount: agent.ticket_count,
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

// Récupérer tous les agents assignés
app.get('/api/supervisor/agents', authenticate, requireRole(['supervisor']), async (req, res) => {
  try {
    const supervisorId = req.user.username;
    
    const agentsResult = await db.query(
      `SELECT 
        a.*,
        COALESCE(t.today_sales, 0) as today_sales,
        COALESCE(t.ticket_count, 0) as ticket_count,
        COALESCE(w.total_wins, 0) as total_wins
       FROM agents a
       LEFT JOIN (
         SELECT agent_id, SUM(total) as today_sales, COUNT(*) as ticket_count
         FROM tickets 
         WHERE created_at >= CURRENT_DATE
         GROUP BY agent_id
       ) t ON a.agent_id = t.agent_id
       LEFT JOIN (
         SELECT agent_id, SUM(winning_amount) as total_wins
         FROM winners 
         WHERE created_at >= CURRENT_DATE
         GROUP BY agent_id
       ) w ON a.agent_id = w.agent_id
       WHERE a.supervisor_id = $1
       ORDER BY a.agent_name`,
      [supervisorId]
    );
    
    res.json({
      success: true,
      agents: agentsResult.rows.map(agent => ({
        id: agent.id,
        agentId: agent.agent_id,
        agentName: agent.agent_name,
        online: agent.online,
        isActive: agent.is_active,
        funds: parseFloat(agent.funds),
        lastActivity: agent.last_activity,
        location: agent.location,
        todaySales: parseFloat(agent.today_sales),
        ticketCount: agent.ticket_count,
        totalWins: parseFloat(agent.total_wins),
        supervisorId: agent.supervisor_id
      }))
    });
  } catch (error) {
    console.error('Erreur récupération agents:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des agents'
    });
  }
});

// Récupérer tickets d'un agent
app.get('/api/supervisor/agents/:agentId/tickets', authenticate, requireRole(['supervisor']), checkSupervisorAgent, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { limit = 50 } = req.query;
    
    const agentResult = await db.query(
      'SELECT * FROM agents WHERE agent_id = $1',
      [agentId]
    );
    
    if (agentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ajan pa jwenn'
      });
    }
    
    const ticketsResult = await db.query(
      'SELECT * FROM tickets WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2',
      [agentId, limit]
    );
    
    res.json({
      success: true,
      agent: {
        agentId: agentResult.rows[0].agent_id,
        agentName: agentResult.rows[0].agent_name,
        funds: parseFloat(agentResult.rows[0].funds),
        isActive: agentResult.rows[0].is_active,
        online: agentResult.rows[0].online
      },
      tickets: ticketsResult.rows.map(ticket => ({
        id: ticket.id,
        ticketId: ticket.ticket_id,
        agentId: ticket.agent_id,
        agentName: ticket.agent_name,
        drawId: ticket.draw_id,
        drawName: ticket.draw_name,
        bets: ticket.bets,
        total: parseFloat(ticket.total),
        checked: ticket.checked,
        date: ticket.created_at
      }))
    });
  } catch (error) {
    console.error('Erreur récupération tickets agent:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des tickets'
    });
  }
});

// Rapport agent
app.get('/api/supervisor/agents/:agentId/reports', authenticate, requireRole(['supervisor']), checkSupervisorAgent, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { period = 'today' } = req.query;
    
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
    
    const salesResult = await db.query(
      `SELECT 
        COUNT(*) as total_tickets,
        COALESCE(SUM(total), 0) as total_bets
       FROM tickets 
       WHERE agent_id = $1 AND created_at >= $2`,
      [agentId, startDate]
    );
    
    const winsResult = await db.query(
      `SELECT 
        COALESCE(SUM(winning_amount), 0) as total_wins
       FROM winners 
       WHERE agent_id = $1 AND created_at >= $2`,
      [agentId, startDate]
    );
    
    const agentResult = await db.query(
      'SELECT funds, agent_name FROM agents WHERE agent_id = $1',
      [agentId]
    );
    
    const agent = agentResult.rows[0];
    const totalBets = parseFloat(salesResult.rows[0].total_bets);
    const totalWins = parseFloat(winsResult.rows[0].total_wins);
    const totalTickets = salesResult.rows[0].total_tickets;
    const balance = totalBets - totalWins;
    const successRate = totalBets > 0 ? (totalWins / totalBets) * 100 : 0;
    
    res.json({
      success: true,
      report: {
        agentName: agent.agent_name,
        period: period,
        totalBets: totalBets,
        totalWins: totalWins,
        totalTickets: totalTickets,
        balance: balance,
        successRate: successRate,
        currentFunds: parseFloat(agent.funds),
        commission: totalBets * 0.05,
        startDate: startDate,
        endDate: now
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

// Récupérer les gains d'un agent
app.get('/api/supervisor/agents/:agentId/winners', authenticate, requireRole(['supervisor']), checkSupervisorAgent, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { limit = 20 } = req.query;
    
    const winnersResult = await db.query(
      `SELECT * FROM winners 
       WHERE agent_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [agentId, limit]
    );
    
    res.json({
      success: true,
      winners: winnersResult.rows.map(winner => ({
        id: winner.id,
        ticketId: winner.ticket_id,
        agentId: winner.agent_id,
        agentName: winner.agent_name,
        drawName: winner.draw_name,
        gameType: winner.game_type,
        winningNumber: winner.winning_number,
        winningAmount: parseFloat(winner.winning_amount),
        customerName: winner.customer_name,
        paid: winner.paid,
        date: winner.created_at
      }))
    });
  } catch (error) {
    console.error('Erreur récupération gains:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des gains'
    });
  }
});

// Tous les gagnants
app.get('/api/winners/all', authenticate, requireRole(['supervisor']), async (req, res) => {
  try {
    const supervisorId = req.user.username;
    const { period = 'today' } = req.query;
    
    const startDate = new Date();
    switch(period) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'all':
        break;
    }
    
    let query = `
      SELECT w.* 
      FROM winners w
      INNER JOIN agents a ON w.agent_id = a.agent_id
      WHERE a.supervisor_id = $1
    `;
    
    const params = [supervisorId];
    
    if (period !== 'all') {
      query += ` AND w.created_at >= $${params.length + 1}`;
      params.push(startDate);
    }
    
    query += ' ORDER BY w.created_at DESC';
    
    const winnersResult = await db.query(query, params);
    
    res.json({
      success: true,
      winners: winnersResult.rows.map(winner => ({
        id: winner.id,
        ticketId: winner.ticket_id,
        agentId: winner.agent_id,
        agentName: winner.agent_name,
        drawName: winner.draw_name,
        gameType: winner.game_type,
        winningNumber: winner.winning_number,
        winningAmount: parseFloat(winner.winning_amount),
        customerName: winner.customer_name,
        paid: winner.paid,
        date: winner.created_at
      }))
    });
  } catch (error) {
    console.error('Erreur récupération tous les gagnants:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des gagnants'
    });
  }
});

// Tous les rapports
app.get('/api/reports/all', authenticate, requireRole(['supervisor']), async (req, res) => {
  try {
    const supervisorId = req.user.username;
    const { period = 'today' } = req.query;
    
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
    
    const globalResult = await db.query(
      `SELECT 
        COUNT(DISTINCT t.agent_id) as active_agents,
        COUNT(*) as total_tickets,
        COALESCE(SUM(t.total), 0) as total_bets,
        COALESCE(SUM(w.winning_amount), 0) as total_wins
       FROM tickets t
       LEFT JOIN winners w ON t.ticket_id = w.ticket_id
       INNER JOIN agents a ON t.agent_id = a.agent_id
       WHERE a.supervisor_id = $1
       AND t.created_at >= $2`,
      [supervisorId, startDate]
    );
    
    const agentsResult = await db.query(
      `SELECT 
        a.agent_id,
        a.agent_name,
        COALESCE(SUM(t.total), 0) as amount,
        COALESCE(SUM(w.winning_amount), 0) as wins,
        COUNT(t.id) as tickets,
        (COALESCE(SUM(t.total), 0) - COALESCE(SUM(w.winning_amount), 0)) as balance
       FROM agents a
       LEFT JOIN tickets t ON a.agent_id = t.agent_id AND t.created_at >= $2
       LEFT JOIN winners w ON t.ticket_id = w.ticket_id
       WHERE a.supervisor_id = $1
       GROUP BY a.agent_id, a.agent_name
       ORDER BY amount DESC`,
      [supervisorId, startDate]
    );
    
    const global = globalResult.rows[0];
    const agentBreakdown = {};
    
    agentsResult.rows.forEach(agent => {
      agentBreakdown[agent.agent_id] = {
        agentName: agent.agent_name,
        amount: parseFloat(agent.amount),
        wins: parseFloat(agent.wins),
        tickets: agent.tickets,
        balance: parseFloat(agent.balance)
      };
    });
    
    res.json({
      success: true,
      report: {
        activeAgents: global.active_agents,
        totalTickets: global.total_tickets,
        totalBets: parseFloat(global.total_bets),
        totalWins: parseFloat(global.total_wins),
        balance: parseFloat(global.total_bets) - parseFloat(global.total_wins),
        period: period,
        agentBreakdown: agentBreakdown
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

// Marquer gain comme payé
app.post('/api/winners/:id/pay', authenticate, requireRole(['supervisor']), async (req, res) => {
  try {
    const { id } = req.params;
    
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

// Bloquer/Débloquer agent
app.post('/api/supervisor/agents/:agentId/block', authenticate, requireRole(['supervisor']), checkSupervisorAgent, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { block = true } = req.body;
    
    const result = await db.query(
      'UPDATE agents SET is_active = $1, online = false WHERE agent_id = $2 RETURNING *',
      [!block, agentId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ajan pa jwenn'
      });
    }
    
    const action = block ? 'bloke' : 'debloke';
    
    res.json({
      success: true,
      message: `Ajan ${action} avèk siksè`,
      agent: result.rows[0]
    });
  } catch (error) {
    console.error('Erreur blocage agent:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du blocage/déblocage de l\'agent'
    });
  }
});

// Supprimer tickets récents
app.delete('/api/supervisor/tickets/recent', authenticate, requireRole(['supervisor']), async (req, res) => {
  try {
    const { agentId, maxAgeMinutes = 10 } = req.body;
    
    const agentResult = await db.query(
      'SELECT * FROM agents WHERE agent_id = $1 AND supervisor_id = $2',
      [agentId, req.user.username]
    );
    
    if (agentResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Ou pa gen aksè a ajan sa a'
      });
    }
    
    const cutoffDate = new Date();
    cutoffDate.setMinutes(cutoffDate.getMinutes() - maxAgeMinutes);
    
    const ticketsResult = await db.query(
      'SELECT SUM(total) as total_amount FROM tickets WHERE agent_id = $1 AND created_at >= $2',
      [agentId, cutoffDate]
    );
    
    const totalAmount = parseFloat(ticketsResult.rows[0].total_amount) || 0;
    
    const deleteResult = await db.query(
      'DELETE FROM tickets WHERE agent_id = $1 AND created_at >= $2 RETURNING *',
      [agentId, cutoffDate]
    );
    
    if (totalAmount > 0) {
      await db.query(
        'UPDATE agents SET funds = funds + $1 WHERE agent_id = $2',
        [totalAmount, agentId]
      );
    }
    
    res.json({
      success: true,
      message: `${deleteResult.rows.length} tikè retire avèk siksè`,
      ticketsDeleted: deleteResult.rows.length,
      amountRefunded: totalAmount
    });
  } catch (error) {
    console.error('Erreur suppression tickets récents:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression des tickets'
    });
  }
});

// Supprimer ticket spécifique
app.delete('/api/supervisor/tickets/:ticketId', authenticate, requireRole(['supervisor']), async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { agentId } = req.body;
    
    if (agentId) {
      const agentResult = await db.query(
        'SELECT * FROM agents WHERE agent_id = $1 AND supervisor_id = $2',
        [agentId, req.user.username]
      );
      
      if (agentResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Ou pa gen aksè a tikè sa a'
        });
      }
    }
    
    const ticketResult = await db.query(
      'SELECT * FROM tickets WHERE ticket_id = $1',
      [ticketId]
    );
    
    if (ticketResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tikè pa jwenn'
      });
    }
    
    const ticket = ticketResult.rows[0];
    const ticketAge = new Date() - new Date(ticket.created_at);
    const maxAgeMinutes = req.user.maxDeleteTime || 10;
    const maxAgeMs = maxAgeMinutes * 60 * 1000;
    
    if (ticketAge > maxAgeMs) {
      return res.status(400).json({
        success: false,
        message: `Tikè twò ansyen. Sèlman tikè mwens pase ${maxAgeMinutes} minit kapab retire.`
      });
    }
    
    await db.query(
      'DELETE FROM tickets WHERE ticket_id = $1',
      [ticketId]
    );
    
    await db.query(
      'UPDATE agents SET funds = funds + $1 WHERE agent_id = $2',
      [ticket.total, ticket.agent_id]
    );
    
    res.json({
      success: true,
      message: 'Tikè retire avèk siksè',
      amountRefunded: parseFloat(ticket.total)
    });
  } catch (error) {
    console.error('Erreur suppression ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du ticket'
    });
  }
});

// Mettre à jour paramètres superviseur
app.post('/api/supervisor/settings', authenticate, requireRole(['supervisor']), async (req, res) => {
  try {
    const { maxDeleteTime } = req.body;
    
    if (maxDeleteTime < 1 || maxDeleteTime > 60) {
      return res.status(400).json({
        success: false,
        message: 'Tan dwe ant 1 ak 60 minit'
      });
    }
    
    const result = await db.query(
      'UPDATE supervisors SET max_delete_time = $1 WHERE username = $2 RETURNING *',
      [maxDeleteTime, req.user.username]
    );
    
    res.json({
      success: true,
      message: 'Anviwònman anrejistre avèk siksè',
      supervisor: result.rows[0]
    });
  } catch (error) {
    console.error('Erreur mise à jour paramètres:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour des paramètres'
    });
  }
});

// Mettre à jour fonds agent
app.post('/api/agents/:agentId/funds', authenticate, requireRole(['supervisor']), checkSupervisorAgent, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { amount, operation = 'add' } = req.body;
    
    if (!amount || isNaN(amount)) {
      return res.status(400).json({
        success: false,
        message: 'Kantite lajan pa valab'
      });
    }
    
    const numericAmount = parseFloat(amount);
    
    let query;
    if (operation === 'add') {
      query = 'UPDATE agents SET funds = funds + $1 WHERE agent_id = $2 RETURNING *';
    } else if (operation === 'subtract') {
      query = 'UPDATE agents SET funds = funds - $1 WHERE agent_id = $2 RETURNING *';
    } else {
      return res.status(400).json({
        success: false,
        message: 'Operasyon pa valab. Itilize "add" oswa "subtract"'
      });
    }
    
    const result = await db.query(query, [numericAmount, agentId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ajan pa jwenn'
      });
    }
    
    res.json({
      success: true,
      message: `Fonds ajan mete ajou avèk siksè`,
      agent: result.rows[0]
    });
  } catch (error) {
    console.error('Erreur mise à jour fonds:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour des fonds'
    });
  }
});

// Ajouter agent
app.post('/api/supervisor/agents', authenticate, requireRole(['supervisor']), async (req, res) => {
  try {
    const { agentId, agentName, password = '123456', initialFunds = 10000, location } = req.body;
    const supervisorId = req.user.username;
    
    const existingAgent = await db.query(
      'SELECT * FROM agents WHERE agent_id = $1',
      [agentId.toUpperCase()]
    );
    
    if (existingAgent.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Kòd ajan deja egziste'
      });
    }
    
    const result = await db.query(
      `INSERT INTO agents (agent_id, agent_name, password, funds, supervisor_id, location) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [agentId.toUpperCase(), agentName, password, initialFunds, supervisorId, location]
    );
    
    res.status(201).json({
      success: true,
      message: 'Ajan kreye avèk siksè',
      agent: result.rows[0]
    });
  } catch (error) {
    console.error('Erreur création agent:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de l\'agent'
    });
  }
});

// Route pour vérifier la connexion
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({
      success: true,
      message: 'API LOTATO PRO fonctionne avec PostgreSQL/Neon',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      database: 'PostgreSQL/Neon - Connecté',
      nodeEnv: process.env.NODE_ENV || 'production'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur de connexion à la base de données'
    });
  }
});

// Route racine
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Routes protégées
app.get('/agent1.html', authenticate, (req, res) => {
  if (req.user.role === 'agent') {
    res.sendFile(__dirname + '/agent1.html');
  } else {
    res.status(403).send('Accès non autorisé');
  }
});

app.get('/supervisor.html', authenticate, (req, res) => {
  if (req.user.role === 'supervisor') {
    res.sendFile(__dirname + '/supervisor.html');
  } else {
    res.status(403).send('Accès non autorisé');
  }
});

app.get('/owner.html', authenticate, (req, res) => {
  if (req.user.role === 'owner') {
    res.sendFile(__dirname + '/owner.html');
  } else {
    res.status(403).send('Accès non autorisé');
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
  console.log(`📡 URL: https://lotata-islp.onrender.com`);
  console.log(`🗄️ Base de données: PostgreSQL/Neon`);
  console.log(`👤 Comptes par défaut:`);
  console.log(`   - Agent: AGENT01 / 123456`);
  console.log(`   - Superviseur: supervisor / 123456`);
  console.log(`   - Propriétaire: owner / 123456`);
});