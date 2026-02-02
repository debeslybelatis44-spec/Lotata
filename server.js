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

// Configuration PostgreSQL/Neon pour Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 20, // Nombre maximum de clients dans le pool
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
    
    // Chercher l'agent
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

    // Comparer les mots de passe
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
        role: 'agent'
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
        role: 'agent'
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
    
    // Chercher le superviseur
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

    // Comparer les mots de passe
    if (supervisor.password !== password) {
      return res.status(401).json({
        success: false,
        message: 'Modpas pa kòrèk'
      });
    }

    // Créer le token JWT
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
    
    // Chercher le propriétaire
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

    // Comparer les mots de passe
    if (owner.password !== password) {
      return res.status(401).json({
        success: false,
        message: 'Modpas pa kòrèk'
      });
    }

    // Créer le token JWT
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
    // Vérifier et créer les comptes si nécessaire
    const result = await db.query(`
      DO $$
      BEGIN
        -- Créer agent par défaut
        INSERT INTO agents (agent_id, agent_name, password, funds, supervisor_id) 
        VALUES ('AGENT01', 'Ajan Prensipal', '123456', 50000, 'SUPER01')
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

// Sauvegarder un ticket
app.post('/api/tickets/save', authenticate, requireRole(['agent']), async (req, res) => {
  try {
    const ticketData = req.body;
    
    // Vérifier que l'agent a assez de fonds
    const agentResult = await db.query(
      'SELECT * FROM agents WHERE agent_id = $1',
      [ticketData.agentId]
    );
    
    if (agentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ajan pa jwenn'
      });
    }
    
    const agent = agentResult.rows[0];
    
    if (parseFloat(agent.funds) < ticketData.total) {
      return res.status(400).json({
        success: false,
        message: 'Fonds ensifizan'
      });
    }
    
    // Générer un ID de ticket unique
    const ticketId = `T${Date.now()}${Math.floor(Math.random() * 1000)}`;
    
    // Sauvegarder le ticket
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
    
    // Mettre à jour les fonds de l'agent
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

// Récupérer les tickets d'un agent
app.get('/api/tickets', authenticate, async (req, res) => {
  try {
    const { agentId } = req.query;
    
    // Vérifier les permissions
    if (req.user.role === 'agent' && req.user.agentId !== agentId) {
      return res.status(403).json({
        success: false,
        message: 'Ou pa gen aksè a istorik ajan sa a'
      });
    }
    
    // Si c'est un superviseur, vérifier que l'agent lui appartient
    if (req.user.role === 'supervisor') {
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
      message: 'Erreur lors de la récupération des tickets'
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