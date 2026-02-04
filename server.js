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
        message: 'Token obligatwa'
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
        message: 'Ou pa gen otorizasyon'
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

// === CRÉATION DES TABLES ===
async function createTables() {
  try {
    console.log('🗄️ Création des tables...');
    
    // Table des agents
    await db.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id SERIAL PRIMARY KEY,
        agent_id VARCHAR(20) UNIQUE NOT NULL,
        agent_name VARCHAR(100) NOT NULL,
        password VARCHAR(100) NOT NULL,
        supervisor_id VARCHAR(20),
        funds DECIMAL(10,2) DEFAULT 0,
        online BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        location VARCHAR(200),
        last_activity TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table des superviseurs
    await db.query(`
      CREATE TABLE IF NOT EXISTS supervisors (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL,
        name VARCHAR(100) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table des propriétaires
    await db.query(`
      CREATE TABLE IF NOT EXISTS owners (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL,
        name VARCHAR(100) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table des tirages
    await db.query(`
      CREATE TABLE IF NOT EXISTS draws (
        id SERIAL PRIMARY KEY,
        draw_id VARCHAR(10) UNIQUE NOT NULL,
        draw_name VARCHAR(50) NOT NULL,
        draw_time TIME NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table des tickets
    await db.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY,
        ticket_id VARCHAR(50) UNIQUE NOT NULL,
        agent_id VARCHAR(20) NOT NULL,
        agent_name VARCHAR(100) NOT NULL,
        draw_id VARCHAR(10) NOT NULL,
        draw_name VARCHAR(50) NOT NULL,
        bets JSONB NOT NULL,
        total DECIMAL(10,2) NOT NULL,
        checked BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Tables créées');
    return true;
  } catch (error) {
    console.error('❌ Erreur création tables:', error.message);
    return false;
  }
}

// === CRÉATION DES COMPTES PAR DÉFAUT ===
async function createDefaultAccounts() {
  try {
    console.log('👤 Création des comptes par défaut...');
    
    // Vérifier et créer le superviseur
    const supervisorCheck = await db.query(
      'SELECT * FROM supervisors WHERE username = $1',
      ['supervisor']
    );
    
    if (supervisorCheck.rows.length === 0) {
      await db.query(
        `INSERT INTO supervisors (username, password, name, is_active) 
         VALUES ($1, $2, $3, $4)`,
        ['supervisor', '123456', 'Supervizè Prensipal', true]
      );
      console.log('✅ Superviseur créé: supervisor / 123456');
    }

    // Vérifier et créer l'agent
    const agentCheck = await db.query(
      'SELECT * FROM agents WHERE agent_id = $1',
      ['AGENT01']
    );
    
    if (agentCheck.rows.length === 0) {
      await db.query(
        `INSERT INTO agents (agent_id, agent_name, password, supervisor_id, funds, is_active) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['AGENT01', 'Ajan Prensipal', '123456', 'supervisor', 50000, true]
      );
      console.log('✅ Agent créé: AGENT01 / 123456');
    }

    // Vérifier et créer le propriétaire
    const ownerCheck = await db.query(
      'SELECT * FROM owners WHERE username = $1',
      ['owner']
    );
    
    if (ownerCheck.rows.length === 0) {
      await db.query(
        `INSERT INTO owners (username, password, name, is_active) 
         VALUES ($1, $2, $3, $4)`,
        ['owner', '123456', 'Pwopriyetè', true]
      );
      console.log('✅ Propriétaire créé: owner / 123456');
    }

    // Créer des tirages par défaut
    const drawsCheck = await db.query('SELECT COUNT(*) as count FROM draws');
    if (parseInt(drawsCheck.rows[0].count) === 0) {
      await db.query(`
        INSERT INTO draws (draw_id, draw_name, draw_time, is_active) 
        VALUES 
          ('D001', 'Matin', '08:00:00', true),
          ('D002', 'Midday', '12:00:00', true),
          ('D003', 'Soir', '16:00:00', true),
          ('D004', 'Night', '20:00:00', true)
      `);
      console.log('✅ 4 tirages créés');
    }

    console.log('✅ Comptes par défaut créés');
    return true;
  } catch (error) {
    console.error('❌ Erreur création comptes:', error.message);
    return false;
  }
}

// === ROUTES D'AUTHENTIFICATION ===

// 1. Connexion Agent
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('🔐 Tentative connexion AGENT:', req.body);
    const { username, password } = req.body;
    
    const result = await db.query(
      'SELECT * FROM agents WHERE agent_id = $1',
      [username.toUpperCase()]
    );
    
    if (result.rows.length === 0) {
      console.log('❌ Agent non trouvé:', username);
      return res.status(401).json({
        success: false,
        message: 'Kòd ajan pa egziste'
      });
    }

    const agent = result.rows[0];
    console.log('✅ Agent trouvé:', agent.agent_name);

    // Vérification mot de passe EN CLAIR
    if (agent.password !== password) {
      console.log('❌ Mot de passe incorrect');
      return res.status(401).json({
        success: false,
        message: 'Modpas pa kòrèk'
      });
    }

    console.log('✅ Connexion réussie');

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
    console.error('❌ Erreur connexion agent:', error);
    res.status(500).json({
      success: false,
      message: 'Erè sèvè'
    });
  }
});

// 2. Connexion Superviseur
app.post('/api/auth/supervisor-login', async (req, res) => {
  try {
    console.log('🔐 Tentative connexion SUPERVISEUR:', req.body);
    const { username, password } = req.body;
    
    const result = await db.query(
      'SELECT * FROM supervisors WHERE username = $1',
      [username.toLowerCase()]
    );
    
    if (result.rows.length === 0) {
      console.log('❌ Superviseur non trouvé:', username);
      return res.status(401).json({
        success: false,
        message: 'Supervizè pa egziste'
      });
    }

    const supervisor = result.rows[0];

    // Vérification mot de passe EN CLAIR
    if (supervisor.password !== password) {
      console.log('❌ Mot de passe incorrect');
      return res.status(401).json({
        success: false,
        message: 'Modpas pa kòrèk'
      });
    }

    console.log('✅ Connexion réussie');

    const token = jwt.sign(
      {
        id: supervisor.id,
        username: supervisor.username,
        name: supervisor.name,
        role: 'supervisor'
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
        role: 'supervisor'
      }
    });
  } catch (error) {
    console.error('❌ Erreur connexion superviseur:', error);
    res.status(500).json({
      success: false,
      message: 'Erè sèvè'
    });
  }
});

// 3. Connexion Propriétaire
app.post('/api/auth/owner-login', async (req, res) => {
  try {
    console.log('🔐 Tentative connexion PROPRIÉTAIRE:', req.body);
    const { username, password } = req.body;
    
    const result = await db.query(
      'SELECT * FROM owners WHERE username = $1',
      [username.toLowerCase()]
    );
    
    if (result.rows.length === 0) {
      console.log('❌ Propriétaire non trouvé:', username);
      return res.status(401).json({
        success: false,
        message: 'Pwopriyetè pa egziste'
      });
    }

    const owner = result.rows[0];

    // Vérification mot de passe EN CLAIR
    if (owner.password !== password) {
      console.log('❌ Mot de passe incorrect');
      return res.status(401).json({
        success: false,
        message: 'Modpas pa kòrèk'
      });
    }

    console.log('✅ Connexion réussie');

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
    console.error('❌ Erreur connexion propriétaire:', error);
    res.status(500).json({
      success: false,
      message: 'Erè sèvè'
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

// Initialiser les tables et comptes
app.post('/api/init/default-accounts', async (req, res) => {
  try {
    console.log('🚀 Initialisation des tables et comptes...');
    
    await createTables();
    await createDefaultAccounts();
    
    res.json({
      success: true,
      message: 'Sistèm inisyalize avèk siksè'
    });
  } catch (error) {
    console.error('❌ Erreur initialisation:', error);
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
      message: 'Erreur tirages'
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
        message: 'Ajan pa jwenn'
      });
    }
    
    const agent = agentResult.rows[0];
    
    // Vérifier si le tirage existe
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
      'UPDATE agents SET funds = $1 WHERE agent_id = $2',
      [newFunds, req.user.agentId]
    );
    
    res.status(201).json({
      success: true,
      message: 'Ticket sove',
      ticket: result.rows[0]
    });
  } catch (error) {
    console.error('Erreur sauvegarde ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur sove ticket'
    });
  }
});

// Récupérer les tickets d'un agent
app.get('/api/tickets', authenticate, async (req, res) => {
  try {
    const { agentId } = req.query;
    const user = req.user;
    
    // Vérifier les permissions
    if (user.role === 'agent' && user.agentId !== agentId) {
      return res.status(403).json({
        success: false,
        message: 'Pa gen aksè'
      });
    }
    
    const result = await db.query(
      'SELECT * FROM tickets WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 100',
      [agentId]
    );
    
    res.json({
      success: true,
      tickets: result.rows
    });
  } catch (error) {
    console.error('Erreur récupération tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur tickets'
    });
  }
});

// Récupérer les rapports
app.get('/api/reports', authenticate, async (req, res) => {
  try {
    const { agentId } = req.query;
    const user = req.user;
    
    if (user.role === 'agent' && user.agentId !== agentId) {
      return res.status(403).json({
        success: false,
        message: 'Pa gen aksè'
      });
    }
    
    // Calculer les totaux
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const ticketsResult = await db.query(
      `SELECT COUNT(*) as total_tickets, COALESCE(SUM(total), 0) as total_bets
       FROM tickets WHERE agent_id = $1 AND created_at >= $2`,
      [agentId, today]
    );
    
    const agentResult = await db.query(
      'SELECT funds FROM agents WHERE agent_id = $1',
      [agentId]
    );
    
    const agent = agentResult.rows[0];
    const totalTickets = parseInt(ticketsResult.rows[0].total_tickets);
    const totalBets = parseFloat(ticketsResult.rows[0].total_bets);
    
    res.json({
      success: true,
      totalTickets,
      totalBets,
      totalWins: 0,
      totalLoss: totalBets,
      balance: totalBets,
      breakdown: {}
    });
  } catch (error) {
    console.error('Erreur récupération rapports:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur rapports'
    });
  }
});

// === ROUTES FICHIERS STATIQUES ===

// Route pour la page de connexion
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Route pour l'interface agent
app.get('/agent1.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'agent1.html'));
});

// Route pour l'interface superviseur
app.get('/supervisor.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'supervisor.html'));
});

// Route pour l'interface propriétaire
app.get('/owner.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'owner.html'));
});

// Route de santé
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({
      success: true,
      message: 'API LOTATO PRO fonksyone',
      timestamp: new Date().toISOString(),
      database: 'PostgreSQL/Neon - Konekte'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erè koneksyon database'
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
    message: 'Erè sèvè'
  });
});

// Initialiser le serveur
async function initializeServer() {
  try {
    console.log('🚀 Démarrage LOTATO PRO...');
    
    // Créer les tables
    await createTables();
    
    // Créer les comptes par défaut
    await createDefaultAccounts();
    
    console.log('\n✅ Serveur prêt!');
    console.log('📡 URL: http://localhost:' + PORT);
    console.log('\n👤 Comptes disponibles:');
    console.log('   - Agent: AGENT01 / 123456');
    console.log('   - Superviseur: supervisor / 123456');
    console.log('   - Propriétaire: owner / 123456');
    
  } catch (error) {
    console.error('❌ Erreur initialisation:', error.message);
  }
}

// Démarrer le serveur
app.listen(PORT, async () => {
  console.log(`\n🚀 Serveur LOTATO PRO démarré sur le port ${PORT}`);
  await initializeServer();
});