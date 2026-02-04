require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const path = require('path');

// Configuration
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'lotato-pro-secret-key-2025';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Configuration de la base de données Neon
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test de connexion à la base de données
pool.connect((err, client, release) => {
  if (err) {
    console.error('Erreur de connexion à la base de données:', err);
  } else {
    console.log('✅ Connecté à la base de données Neon');
    release();
  }
});

// Middleware d'authentification
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalide' });
    }
    req.user = user;
    next();
  });
};

// Routes d'authentification
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Chercher dans les agents
    let query = 'SELECT * FROM agents WHERE agent_id = $1 AND is_active = true';
    let result = await pool.query(query, [username]);

    let user = result.rows[0];
    let role = 'agent';

    // Si pas trouvé dans les agents, chercher dans les superviseurs
    if (!user) {
      query = 'SELECT * FROM supervisors WHERE username = $1 AND is_active = true';
      result = await pool.query(query, [username]);
      user = result.rows[0];
      role = 'supervisor';
    }

    // Si pas trouvé dans les superviseurs, chercher dans les owners
    if (!user) {
      query = 'SELECT * FROM owners WHERE username = $1 AND is_active = true';
      result = await pool.query(query, [username]);
      user = result.rows[0];
      role = 'owner';
    }

    if (!user) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    // Vérifier le mot de passe (en clair pour le moment, mais vous devriez utiliser bcrypt)
    const validPassword = password === user.password;
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    // Mettre à jour le statut en ligne pour les agents
    if (role === 'agent') {
      await pool.query(
        'UPDATE agents SET online = true, last_activity = CURRENT_TIMESTAMP WHERE agent_id = $1',
        [username]
      );
    }

    // Créer le token JWT
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.agent_id || user.username,
        name: user.agent_name || user.name,
        role: role,
        supervisor_id: user.supervisor_id
      }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        agentId: user.agent_id || user.username,
        name: user.agent_name || user.name,
        role: role,
        funds: user.funds || 0,
        supervisorId: user.supervisor_id
      }
    });

  } catch (error) {
    console.error('Erreur login:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Vérifier l'authentification
app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// Déconnexion
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    if (req.user.role === 'agent') {
      await pool.query(
        'UPDATE agents SET online = false WHERE agent_id = $1',
        [req.user.username]
      );
    }
    res.json({ message: 'Déconnexion réussie' });
  } catch (error) {
    console.error('Erreur logout:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour les tirages actifs
app.get('/api/draws/active', authenticateToken, async (req, res) => {
  try {
    // Dans un système réel, vous auriez une table des tirages
    // Pour l'instant, nous retournons des tirages fixes
    const draws = [
      { 
        drawId: 'D001', 
        drawName: 'Matin', 
        drawTime: '08:00',
        isActive: true
      },
      { 
        drawId: 'D002', 
        drawName: 'Midday', 
        drawTime: '12:00',
        isActive: true
      },
      { 
        drawId: 'D003', 
        drawName: 'Soir', 
        drawTime: '16:00',
        isActive: true
      },
      { 
        drawId: 'D004', 
        drawName: 'Night', 
        drawTime: '20:00',
        isActive: true
      }
    ];

    res.json({ draws });
  } catch (error) {
    console.error('Erreur récupération tirages:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Sauvegarder un ticket
app.post('/api/tickets/save', authenticateToken, async (req, res) => {
  try {
    const { drawId, drawName, bets, total } = req.body;
    const agentId = req.user.username;
    const agentName = req.user.name;

    // Générer un ID de ticket unique
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    const ticketId = `TKT-${timestamp}-${random}`;

    // Insérer le ticket dans la base de données
    const query = `
      INSERT INTO tickets (ticket_id, agent_id, agent_name, draw_id, draw_name, bets, total)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const values = [ticketId, agentId, agentName, drawId, drawName, JSON.stringify(bets), total];
    const result = await pool.query(query, values);

    // Mettre à jour les fonds de l'agent
    await pool.query(
      'UPDATE agents SET funds = funds - $1 WHERE agent_id = $2',
      [total, agentId]
    );

    res.json({ 
      success: true, 
      message: 'Ticket sauvegardé',
      ticket: result.rows[0]
    });

  } catch (error) {
    console.error('Erreur sauvegarde ticket:', error);
    res.status(500).json({ error: 'Erreur sauvegarde ticket' });
  }
});

// Récupérer les tickets d'un agent
app.get('/api/tickets', authenticateToken, async (req, res) => {
  try {
    const { agentId } = req.query;
    
    const query = `
      SELECT * FROM tickets 
      WHERE agent_id = $1 
      ORDER BY created_at DESC
      LIMIT 50
    `;
    
    const result = await pool.query(query, [agentId]);
    
    res.json({ tickets: result.rows });
  } catch (error) {
    console.error('Erreur récupération tickets:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les rapports
app.get('/api/reports', authenticateToken, async (req, res) => {
  try {
    const { agentId } = req.query;
    
    // Total des tickets aujourd'hui
    const today = new Date().toISOString().split('T')[0];
    const ticketsQuery = `
      SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total
      FROM tickets 
      WHERE agent_id = $1 
      AND DATE(created_at) = $2
    `;
    
    const ticketsResult = await pool.query(ticketsQuery, [agentId, today]);
    
    // Total des gains (depuis la table winners)
    const winsQuery = `
      SELECT COALESCE(SUM(winning_amount), 0) as total
      FROM winners 
      WHERE agent_id = $1
      AND DATE(created_at) = $2
    `;
    
    const winsResult = await pool.query(winsQuery, [agentId, today]);
    
    // Récupérer le solde de l'agent
    const agentQuery = 'SELECT funds FROM agents WHERE agent_id = $1';
    const agentResult = await pool.query(agentQuery, [agentId]);
    
    // Détails par type de jeu (simplifié)
    const breakdownQuery = `
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM((bet->>'amount')::numeric), 0) as amount
      FROM tickets,
      jsonb_array_elements(bets) as bet
      WHERE agent_id = $1
      AND DATE(created_at) = $2
      GROUP BY bet->>'game'
    `;
    
    const breakdownResult = await pool.query(breakdownQuery, [agentId, today]);
    
    const breakdown = {};
    breakdownResult.rows.forEach(row => {
      const game = row.game || 'unknown';
      breakdown[game] = {
        count: parseInt(row.count),
        amount: parseFloat(row.amount)
      };
    });
    
    const totalTickets = parseInt(ticketsResult.rows[0].count) || 0;
    const totalBets = parseFloat(ticketsResult.rows[0].total) || 0;
    const totalWins = parseFloat(winsResult.rows[0].total) || 0;
    const totalLoss = totalBets - totalWins;
    const balance = parseFloat(agentResult.rows[0]?.funds) || 0;
    
    res.json({
      totalTickets,
      totalBets,
      totalWins,
      totalLoss,
      balance,
      breakdown
    });
    
  } catch (error) {
    console.error('Erreur récupération rapports:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Routes pour les superviseurs
app.get('/api/supervisor/agents', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'supervisor' && req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    
    const query = 'SELECT * FROM agents WHERE supervisor_id = $1 ORDER BY agent_name';
    const result = await pool.query(query, [req.user.username]);
    
    res.json({ agents: result.rows });
  } catch (error) {
    console.error('Erreur récupération agents:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Ajouter un nouvel agent
app.post('/api/supervisor/agents', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'supervisor' && req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    
    const { agent_id, agent_name, password, funds } = req.body;
    
    const query = `
      INSERT INTO agents (agent_id, agent_name, password, funds, supervisor_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const values = [agent_id, agent_name, password || '123456', funds || 10000, req.user.username];
    const result = await pool.query(query, values);
    
    res.json({ success: true, agent: result.rows[0] });
  } catch (error) {
    console.error('Erreur création agent:', error);
    res.status(500).json({ error: 'Erreur création agent' });
  }
});

// Mettre à jour les fonds d'un agent
app.put('/api/supervisor/agents/:id/funds', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'supervisor' && req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    
    const { id } = req.params;
    const { amount } = req.body;
    
    const query = 'UPDATE agents SET funds = funds + $1 WHERE agent_id = $2 RETURNING *';
    const result = await pool.query(query, [amount, id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Agent non trouvé' });
    }
    
    res.json({ success: true, agent: result.rows[0] });
  } catch (error) {
    console.error('Erreur mise à jour fonds:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour vérifier les résultats (simulée)
app.post('/api/results/check', authenticateToken, async (req, res) => {
  try {
    const { ticketId } = req.body;
    
    // Dans un système réel, vous vérifieriez contre les résultats du tirage
    // Pour l'instant, nous simulons une vérification
    
    const query = 'SELECT * FROM tickets WHERE ticket_id = $1';
    const result = await pool.query(query, [ticketId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Ticket non trouvé' });
    }
    
    const ticket = result.rows[0];
    
    // Simuler des gains aléatoires (pour démonstration)
    const simulatedWins = [];
    let totalWin = 0;
    
    if (Math.random() > 0.7) { // 30% de chance de gagner
      const bets = Array.isArray(ticket.bets) ? ticket.bets : JSON.parse(ticket.bets);
      
      bets.forEach(bet => {
        if (Math.random() > 0.5) {
          const winAmount = bet.amount * 50; // Gain fictif
          simulatedWins.push({
            game_type: bet.game,
            winning_number: bet.cleanNumber || bet.number,
            winning_amount: winAmount
          });
          totalWin += winAmount;
        }
      });
    }
    
    // Marquer le ticket comme vérifié
    await pool.query(
      'UPDATE tickets SET checked = true WHERE ticket_id = $1',
      [ticketId]
    );
    
    // Ajouter les gains à la table winners
    if (simulatedWins.length > 0) {
      for (const win of simulatedWins) {
        await pool.query(`
          INSERT INTO winners (ticket_id, agent_id, agent_name, draw_id, draw_name, game_type, winning_number, winning_amount)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          ticketId,
          ticket.agent_id,
          ticket.agent_name,
          ticket.draw_id,
          ticket.draw_name,
          win.game_type,
          win.winning_number,
          win.winning_amount
        ]);
      }
      
      // Mettre à jour les fonds de l'agent
      await pool.query(
        'UPDATE agents SET funds = funds + $1 WHERE agent_id = $2',
        [totalWin, ticket.agent_id]
      );
    }
    
    res.json({
      checked: true,
      hasWin: simulatedWins.length > 0,
      wins: simulatedWins,
      totalWin
    });
    
  } catch (error) {
    console.error('Erreur vérification résultats:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour servir l'interface agent
app.get('/agent', (req, res) => {
  res.sendFile(path.join(__dirname, 'agent1.html'));
});

// Route pour servir l'interface superviseur (à créer séparément)
app.get('/supervisor', (req, res) => {
  res.sendFile(path.join(__dirname, 'supervisor.html'));
});

// Route de santé
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Page d'accueil
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>LOTATO PRO</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background: linear-gradient(135deg, #0a0b1e, #1a1b3a);
          color: white;
          text-align: center;
          padding: 50px;
        }
        .container {
          max-width: 500px;
          margin: 0 auto;
          background: rgba(255,255,255,0.1);
          padding: 30px;
          border-radius: 20px;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(81, 6, 75, 0.7);
        }
        h1 {
          color: #ad00f1;
        }
        .btn {
          display: block;
          width: 100%;
          padding: 15px;
          margin: 10px 0;
          background: linear-gradient(135deg, #ad00f1, #ff007a);
          color: white;
          text-decoration: none;
          border-radius: 10px;
          font-weight: bold;
          transition: transform 0.3s;
        }
        .btn:hover {
          transform: scale(1.05);
        }
        .btn-supervisor {
          background: linear-gradient(135deg, #00d4ff, #00f190);
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>LOTATO PRO v6</h1>
        <p>Système de loterie professionnel</p>
        <a href="/agent" class="btn">Interface Agent</a>
        <a href="/supervisor" class="btn btn-supervisor">Interface Superviseur</a>
      </div>
    </body>
    </html>
  `);
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`✅ Serveur LOTATO PRO démarré sur le port ${PORT}`);
  console.log(`📊 URL: http://localhost:${PORT}`);
  console.log(`👤 Interface agent: http://localhost:${PORT}/agent`);
  console.log(`👨‍💼 Interface superviseur: http://localhost:${PORT}/supervisor`);
});