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

// Fonction pour réparer complètement la table tickets
async function repairTicketsTable() {
  try {
    console.log('🔧 Vérification complète de la table tickets...');
    
    // Vérifier si la table existe
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'tickets'
      )
    `);
    
    if (!tableExists.rows[0].exists) {
      console.log('⚠️ Table tickets n\'existe pas, création...');
      await pool.query(`
        CREATE TABLE tickets (
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
          checked BOOLEAN DEFAULT false,
          paid BOOLEAN DEFAULT false
        )
      `);
      console.log('✅ Table tickets créée avec succès');
      return;
    }
    
    // Vérifier si la colonne id existe et est correcte
    const idColumn = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_name = 'tickets' AND column_name = 'id'
    `);
    
    if (idColumn.rows.length === 0) {
      console.log('⚠️ Colonne id manquante, ajout...');
      await pool.query(`
        ALTER TABLE tickets 
        ADD COLUMN id SERIAL PRIMARY KEY
      `);
      console.log('✅ Colonne id ajoutée');
    } else if (!idColumn.rows[0].column_default) {
      console.log('⚠️ Colonne id sans valeur par défaut, correction...');
      // Supprimer et recréer la colonne id
      await pool.query(`
        ALTER TABLE tickets DROP COLUMN IF EXISTS id CASCADE;
        ALTER TABLE tickets ADD COLUMN id SERIAL PRIMARY KEY;
      `);
      console.log('✅ Colonne id corrigée');
    }
    
    // Vérifier la colonne ticket_id
    const ticketIdColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'tickets' AND column_name = 'ticket_id'
    `);
    
    if (ticketIdColumn.rows.length === 0) {
      console.log('⚠️ Colonne ticket_id manquante, ajout...');
      await pool.query(`
        ALTER TABLE tickets 
        ADD COLUMN ticket_id VARCHAR(50)
      `);
      console.log('✅ Colonne ticket_id ajoutée');
    }
    
    // Mettre à jour les tickets existants avec ticket_id
    const nullTickets = await pool.query(`
      SELECT COUNT(*) as count FROM tickets WHERE ticket_id IS NULL
    `);
    
    if (parseInt(nullTickets.rows[0].count) > 0) {
      console.log(`⚠️ ${nullTickets.rows[0].count} tickets sans ticket_id, correction...`);
      await pool.query(`
        UPDATE tickets 
        SET ticket_id = 'T' || EXTRACT(EPOCH FROM date)::BIGINT || id
        WHERE ticket_id IS NULL
      `);
      console.log('✅ Tickets sans ticket_id corrigés');
    }
    
    console.log('✅ Table tickets vérifiée et réparée avec succès');
  } catch (error) {
    console.error('❌ Erreur réparation table tickets:', error.message);
  }
}

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

    // Table des tickets - VERSION SIMPLIFIÉE
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
        checked BOOLEAN DEFAULT false,
        paid BOOLEAN DEFAULT false
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

    // Table des résultats gagnants par tirage
    await pool.query(`
      CREATE TABLE IF NOT EXISTS winning_results (
        id SERIAL PRIMARY KEY,
        draw_id VARCHAR(50),
        draw_name VARCHAR(100),
        numbers JSONB,
        winning_numbers JSONB,
        date DATE,
        published_at TIMESTAMP DEFAULT NOW()
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
    console.log('📦 Requête ticket reçue:', JSON.stringify(req.body, null, 2));
    
    const { agentId, agentName, drawId, drawName, bets, total } = req.body;
    
    if (!agentId || !drawId || !bets || !Array.isArray(bets)) {
      console.error('❌ Données invalides:', { agentId, drawId, bets });
      return res.status(400).json({ error: 'Données invalides' });
    }

    // Formatage des paris
    const formattedBets = bets.map(bet => ({
      id: bet.id || Date.now() + Math.random(),
      game: bet.game || 'unknown',
      number: bet.number || '',
      cleanNumber: bet.cleanNumber || '',
      amount: parseFloat(bet.amount) || 0,
      isAutoGenerated: bet.isAutoGenerated || false,
      specialType: bet.specialType || null,
      option: bet.option || null,
      timestamp: new Date().toISOString()
    }));

    // Calcul du montant total
    const totalAmount = formattedBets.reduce((sum, bet) => sum + bet.amount, 0);
    
    // APPROCHE SIMPLIFIÉE : Insérer sans spécifier l'id
    const query = `
      INSERT INTO tickets (
        agent_id, agent_name, draw_id, draw_name, 
        bets, total_amount, date, ticket_id
      ) 
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW(), $7)
      RETURNING *
    `;
    
    const ticketId = 'T' + Date.now() + Math.floor(Math.random() * 1000);
    
    console.log('📝 Exécution requête SQL...');
    
    const result = await pool.query(query, [
      agentId,
      agentName || 'Agent Inconnu',
      drawId,
      drawName || drawId,
      JSON.stringify(formattedBets),
      totalAmount,
      ticketId
    ]);
    
    const savedTicket = result.rows[0];
    console.log('✅ Ticket sauvegardé avec succès:', savedTicket.id);
    
    res.json({
      success: true,
      ticket: {
        ...savedTicket,
        bets: formattedBets
      }
    });

  } catch (error) {
    console.error('❌ Erreur traitement ticket:', error);
    
    // Si l'erreur persiste, créer la table dynamiquement
    if (error.message.includes('tickets') || error.message.includes('id')) {
      try {
        console.log('🔄 Tentative de création de table dynamique...');
        await pool.query(`
          CREATE TABLE IF NOT EXISTS tickets_backup (
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
            checked BOOLEAN DEFAULT false,
            paid BOOLEAN DEFAULT false
          )
        `);
        
        // Réessayer l'insertion
        const ticketId = 'T' + Date.now() + Math.floor(Math.random() * 1000);
        const totalAmount = formattedBets.reduce((sum, bet) => sum + bet.amount, 0);
        
        const result = await pool.query(`
          INSERT INTO tickets_backup (
            agent_id, agent_name, draw_id, draw_name, 
            bets, total_amount, ticket_id
          ) 
          VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
          RETURNING *
        `, [
          agentId,
          agentName || 'Agent Inconnu',
          drawId,
          drawName || drawId,
          JSON.stringify(formattedBets),
          totalAmount,
          ticketId
        ]);
        
        res.json({
          success: true,
          ticket: result.rows[0],
          warning: 'Ticket sauvegardé dans table de secours'
        });
        
      } catch (backupError) {
        res.status(500).json({ 
          error: 'Erreur critique',
          details: backupError.message 
        });
      }
    } else {
      res.status(500).json({ 
        error: 'Erreur lors de la sauvegarde du ticket',
        details: error.message 
      });
    }
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
    
    const tickets = result.rows.map(ticket => ({
      ...ticket,
      bets: typeof ticket.bets === 'string' ? JSON.parse(ticket.bets) : ticket.bets || []
    }));
    
    console.log(`📋 ${tickets.length} tickets récupérés pour agent: ${agentId || 'tous'}`);
    
    res.json({ tickets });
  } catch (error) {
    console.error('Erreur récupération tickets:', error);
    res.json({ tickets: [] });
  }
});

// Supprimer un ticket (uniquement dans les 5 minutes)
app.delete('/api/tickets/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Vérifier si le ticket existe et a moins de 5 minutes
    const ticketResult = await pool.query('SELECT * FROM tickets WHERE id = $1', [id]);
    
    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket non trouvé' });
    }
    
    const ticket = ticketResult.rows[0];
    const ticketDate = new Date(ticket.date);
    const now = new Date();
    const minutesDiff = (now - ticketDate) / (1000 * 60);
    
    if (minutesDiff > 5) {
      return res.status(400).json({ error: 'Ticket ne peut être supprimé que dans les 5 minutes suivant sa création' });
    }
    
    await pool.query('DELETE FROM tickets WHERE id = $1', [id]);
    
    res.json({ success: true, message: 'Ticket supprimé avec succès' });
  } catch (error) {
    console.error('Erreur suppression ticket:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Vérifier les tickets gagnants
app.post('/api/tickets/check-winners', async (req, res) => {
  try {
    const { agentId } = req.query;
    
    // Récupérer les résultats des tirages d'aujourd'hui
    const today = new Date().toISOString().split('T')[0];
    const resultsQuery = await pool.query(
      'SELECT * FROM winning_results WHERE date = $1',
      [today]
    );
    
    if (resultsQuery.rows.length === 0) {
      return res.json({ success: true, message: 'Aucun résultat aujourd\'hui', updated: 0 });
    }
    
    // Récupérer les tickets non vérifiés de l'agent
    let ticketsQuery = 'SELECT * FROM tickets WHERE checked = false';
    const params = [];
    
    if (agentId) {
      params.push(agentId);
      ticketsQuery += ` AND agent_id = $${params.length}`;
    }
    
    const ticketsResult = await pool.query(ticketsQuery, params);
    const tickets = ticketsResult.rows;
    
    let updatedCount = 0;
    
    // Pour chaque ticket, vérifier s'il gagne
    for (const ticket of tickets) {
      const drawResults = resultsQuery.rows.find(r => r.draw_id === ticket.draw_id);
      
      if (!drawResults) continue;
      
      const bets = typeof ticket.bets === 'string' ? JSON.parse(ticket.bets) : ticket.bets;
      let winAmount = 0;
      let winningNumber = null;
      
      // Logique de vérification des gains
      for (const bet of bets) {
        let gain = 0;
        
        // Exemple: pour borlette, vérifier si le numéro correspond aux résultats
        if (bet.game === 'borlette') {
          // Logique simplifiée: si le numéro correspond au premier résultat
          const results = drawResults.numbers || [];
          if (results.length > 0 && bet.cleanNumber === results[0].toString().padStart(2, '0')) {
            gain = bet.amount * 60; // Lot 1
            winningNumber = bet.cleanNumber;
          } else if (results.length > 1 && bet.cleanNumber === results[1].toString().padStart(2, '0')) {
            gain = bet.amount * 20; // Lot 2
            winningNumber = bet.cleanNumber;
          } else if (results.length > 2 && bet.cleanNumber === results[2].toString().padStart(2, '0')) {
            gain = bet.amount * 10; // Lot 3
            winningNumber = bet.cleanNumber;
          }
        }
        // Ajouter d'autres logiques pour lotto, mariage, etc.
        
        winAmount += gain;
      }
      
      if (winAmount > 0) {
        // Mettre à jour le ticket avec le gain
        await pool.query(
          'UPDATE tickets SET win_amount = $1, checked = true WHERE id = $2',
          [winAmount, ticket.id]
        );
        updatedCount++;
      } else {
        // Marquer comme vérifié mais pas gagnant
        await pool.query(
          'UPDATE tickets SET checked = true WHERE id = $1',
          [ticket.id]
        );
      }
    }
    
    res.json({ success: true, updated: updatedCount });
  } catch (error) {
    console.error('Erreur vérification tickets:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= ROUTES DRAWS =============
app.get('/api/draws', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, time, active 
      FROM draws 
      WHERE active = true 
      ORDER BY time
    `);
    
    if (result.rows.length > 0) {
      return res.json({ draws: result.rows });
    }
    
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

// ============= ROUTES RAPPORTS =============
app.get('/api/reports', async (req, res) => {
  try {
    const { agentId } = req.query;
    const today = new Date().toISOString().split('T')[0];
    
    let query = `
      SELECT 
        COUNT(*) as total_tickets,
        COALESCE(SUM(total_amount), 0) as total_bets,
        COALESCE(SUM(win_amount), 0) as total_wins
      FROM tickets 
      WHERE DATE(date) = $1
    `;
    
    const params = [today];
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
      balance: parseFloat(totalLoss)
    });
  } catch (error) {
    console.error('Erreur rapports:', error);
    res.json({
      totalTickets: 0,
      totalBets: 0,
      totalWins: 0,
      totalLoss: 0,
      balance: 0
    });
  }
});

// Rapport par tirage spécifique
app.get('/api/reports/draw', async (req, res) => {
  try {
    const { agentId, drawId } = req.query;
    const today = new Date().toISOString().split('T')[0];
    
    if (!drawId) {
      return res.status(400).json({ error: 'drawId requis' });
    }
    
    let query = `
      SELECT 
        COUNT(*) as total_tickets,
        COALESCE(SUM(total_amount), 0) as total_bets,
        COALESCE(SUM(win_amount), 0) as total_wins
      FROM tickets 
      WHERE DATE(date) = $1 AND draw_id = $2
    `;
    
    const params = [today, drawId];
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
      balance: parseFloat(totalLoss)
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

// ============= ROUTES GAGNANTS =============
app.get('/api/winners', async (req, res) => {
  try {
    const { agentId } = req.query;
    const today = new Date().toISOString().split('T')[0];
    
    let query = `
      SELECT t.*, wr.numbers as draw_results
      FROM tickets t
      LEFT JOIN winning_results wr ON t.draw_id = wr.draw_id AND wr.date = $1
      WHERE t.win_amount > 0
    `;
    const params = [today];
    
    if (agentId) {
      params.push(agentId);
      query += ` AND t.agent_id = $${params.length}`;
    }
    
    query += ' ORDER BY t.date DESC LIMIT 20';
    
    const result = await pool.query(query, params);
    
    const winners = result.rows.map(row => ({
      id: row.id,
      ticket_id: row.ticket_id || 'N/A',
      agent_id: row.agent_id,
      agent_name: row.agent_name,
      draw_id: row.draw_id,
      draw_name: row.draw_name,
      total_amount: row.total_amount,
      win_amount: row.win_amount,
      date: row.date,
      paid: row.paid,
      bets: typeof row.bets === 'string' ? JSON.parse(row.bets) : row.bets,
      draw_results: typeof row.draw_results === 'string' ? JSON.parse(row.draw_results) : row.draw_results
    }));
    
    res.json({ winners });
  } catch (error) {
    console.error('Erreur gagnants:', error);
    res.json({ winners: [] });
  }
});

// Obtenir les résultats gagnants
app.get('/api/winners/results', async (req, res) => {
  try {
    const { agentId } = req.query;
    const today = new Date().toISOString().split('T')[0];
    
    const result = await pool.query(
      'SELECT * FROM winning_results WHERE date = $1 ORDER BY published_at DESC',
      [today]
    );
    
    const results = result.rows.map(row => ({
      id: row.id,
      drawId: row.draw_id,
      drawName: row.draw_name,
      numbers: typeof row.numbers === 'string' ? JSON.parse(row.numbers) : row.numbers,
      winningNumbers: typeof row.winning_numbers === 'string' ? JSON.parse(row.winning_numbers) : row.winning_numbers,
      date: row.date,
      publishedAt: row.published_at
    }));
    
    res.json({ results });
  } catch (error) {
    console.error('Erreur résultats gagnants:', error);
    res.json({ results: [] });
  }
});

// Marquer un ticket gagnant comme payé
app.post('/api/winners/pay/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.query(
      'UPDATE tickets SET paid = true WHERE id = $1',
      [id]
    );
    
    res.json({ success: true, message: 'Ticket marqué comme payé' });
  } catch (error) {
    console.error('Erreur marquage payé:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= ROUTES CONFIGURATION =============
app.get('/api/lottery-config', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM lottery_config LIMIT 1');
    
    if (result.rows.length > 0) {
      const config = result.rows[0];
      res.json({
        name: config.name,
        logo: config.logo || '/logo.png',
        address: config.address || '',
        phone: config.phone || ''
      });
    } else {
      res.json({
        name: 'LOTATO PRO',
        logo: '/logo.png',
        address: '',
        phone: ''
      });
    }
  } catch (error) {
    console.error('Erreur config:', error);
    res.json({
      name: 'LOTATO PRO',
      logo: '/logo.png',
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
// ============= ROUTES SUPERVISEURS SPÉCIFIQUES =============

// Route de vérification pour superviseur
app.get('/api/supervisor/auth/verify', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'supervisor') {
            return res.status(403).json({ error: 'Accès non autorisé' });
        }
        
        // Récupérer les données du superviseur
        const result = await pool.query(
            'SELECT * FROM supervisors WHERE id = $1',
            [req.user.id.replace('supervisor-', '')]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Superviseur non trouvé' });
        }
        
        const supervisor = result.rows[0];
        
        res.json({
            id: req.user.id,
            name: req.user.name,
            email: supervisor.email,
            phone: supervisor.phone
        });
    } catch (error) {
        console.error('Erreur vérification superviseur:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour récupérer les données superviseur
app.get('/api/supervisor/data', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'supervisor') {
            return res.status(403).json({ error: 'Accès non autorisé' });
        }
        
        const supervisorId = req.user.id.replace('supervisor-', '');
        
        // Récupérer le superviseur
        const supervisorResult = await pool.query(
            'SELECT * FROM supervisors WHERE id = $1',
            [supervisorId]
        );
        
        if (supervisorResult.rows.length === 0) {
            return res.status(404).json({ error: 'Superviseur non trouvé' });
        }
        
        // Récupérer les agents assignés
        const agentsResult = await pool.query(
            `SELECT a.*, 
                    COUNT(t.id) as ticket_count,
                    COALESCE(SUM(t.total_amount), 0) as total_sales,
                    COALESCE(SUM(t.win_amount), 0) as total_wins
             FROM agents a
             LEFT JOIN tickets t ON a.id::text = t.agent_id AND DATE(t.date) = CURRENT_DATE
             WHERE a.supervisor_id = $1
             GROUP BY a.id`,
            [supervisorId]
        );
        
        const agents = agentsResult.rows.map(agent => ({
            id: agent.id.toString(),
            name: agent.name,
            email: agent.email,
            phone: agent.phone,
            location: agent.location,
            commission: parseFloat(agent.commission),
            active: agent.active,
            online: Math.random() > 0.3, // Simulation
            lastActivity: new Date().toISOString(),
            ticketCount: parseInt(agent.ticket_count) || 0,
            todaySales: parseFloat(agent.total_sales) || 0,
            totalWins: parseFloat(agent.total_wins) || 0
        }));
        
        res.json({
            id: req.user.id,
            name: req.user.name,
            agents: agents
        });
    } catch (error) {
        console.error('Erreur récupération données superviseur:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route simplifiée pour les agents du superviseur
app.get('/api/supervisor/agents', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'supervisor') {
            return res.status(403).json({ error: 'Accès non autorisé' });
        }
        
        const supervisorId = req.user.id.replace('supervisor-', '');
        
        const result = await pool.query(
            `SELECT a.*, 
                    COUNT(t.id) as ticket_count,
                    COALESCE(SUM(t.total_amount), 0) as total_sales,
                    COALESCE(SUM(t.win_amount), 0) as total_wins
             FROM agents a
             LEFT JOIN tickets t ON a.id::text = t.agent_id AND DATE(t.date) = CURRENT_DATE
             WHERE a.supervisor_id = $1
             GROUP BY a.id`,
            [supervisorId]
        );
        
        const agents = result.rows.map(agent => ({
            id: agent.id.toString(),
            name: agent.name,
            email: agent.email,
            phone: agent.phone,
            location: agent.location,
            commission: parseFloat(agent.commission),
            active: agent.active,
            blocked: !agent.active,
            online: Math.random() > 0.3,
            lastActivity: new Date().toISOString(),
            ticketCount: parseInt(agent.ticket_count) || 0,
            todaySales: parseFloat(agent.total_sales) || 0,
            totalWins: parseFloat(agent.total_wins) || 0
        }));
        
        res.json(agents);
    } catch (error) {
        console.error('Erreur récupération agents:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Détails d'un agent spécifique
app.get('/api/supervisor/agent/:id/details', authenticateToken, async (req, res) => {
    try {
        const agentId = req.params.id;
        
        const result = await pool.query(
            'SELECT * FROM agents WHERE id = $1',
            [agentId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Agent non trouvé' });
        }
        
        const agent = result.rows[0];
        
        // Statistiques du jour
        const statsResult = await pool.query(
            `SELECT COUNT(*) as ticket_count,
                    COALESCE(SUM(total_amount), 0) as total_sales,
                    COALESCE(SUM(win_amount), 0) as total_wins
             FROM tickets 
             WHERE agent_id = $1 AND DATE(date) = CURRENT_DATE`,
            [agentId]
        );
        
        const stats = statsResult.rows[0];
        
        res.json({
            id: agent.id.toString(),
            name: agent.name,
            email: agent.email,
            phone: agent.phone,
            location: agent.location,
            active: agent.active,
            blocked: !agent.active,
            online: Math.random() > 0.3,
            lastActivity: new Date().toISOString(),
            ticketCount: parseInt(stats.ticket_count) || 0,
            todaySales: parseFloat(stats.total_sales) || 0,
            totalWins: parseFloat(stats.total_wins) || 0
        });
    } catch (error) {
        console.error('Erreur détails agent:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Tickets d'un agent
app.get('/api/supervisor/agent/:id/tickets', authenticateToken, async (req, res) => {
    try {
        const agentId = req.params.id;
        
        const result = await pool.query(
            `SELECT id, ticket_id, draw_id, draw_name, total_amount, date, bets
             FROM tickets 
             WHERE agent_id = $1 
             ORDER BY date DESC 
             LIMIT 20`,
            [agentId]
        );
        
        const tickets = result.rows.map(ticket => {
            const bets = typeof ticket.bets === 'string' ? JSON.parse(ticket.bets) : ticket.bets;
            return {
                id: ticket.id,
                ticketId: ticket.ticket_id,
                drawId: ticket.draw_id,
                drawName: ticket.draw_name,
                total: parseFloat(ticket.total_amount),
                timestamp: ticket.date,
                betsCount: bets.length,
                bets: bets
            };
        });
        
        res.json(tickets);
    } catch (error) {
        console.error('Erreur tickets agent:', error);
        res.status(500).json({ error: 'Erreur serveur' });
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
      onlineUsers: Math.floor(Math.random() * 10) + 5
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
      const supervisorsWithCount = await pool.query(`
        SELECT 
          s.id, s.name, s.email, s.phone, s.active, s.created_at,
          COUNT(a.id) as agents_count
        FROM supervisors s
        LEFT JOIN agents a ON s.id = a.supervisor_id AND a.active = true
        GROUP BY s.id
        ORDER BY s.name
      `);
      
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
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    if (role === 'supervisor') {
      const result = await pool.query(
        `INSERT INTO supervisors (name, email, phone, password, active, created_at)
         VALUES ($1, $2, $3, $4, true, NOW()) RETURNING *`,
        [name, email, phone, hashedPassword]
      );
      
      const user = result.rows[0];
      
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
      
      await pool.query(
        `INSERT INTO activity_log (user_id, user_role, action, details, timestamp)
         VALUES ($1, $2, $3, $4, NOW())`,
        [req.user?.id || 'system', 'owner', 'unblock_numbers', `${numbers.length} numéro(s) débloqué(s)`]
      );
      
      res.json({ success: true, message: `${numbers.length} numéro(s) débloqué(s)` });
    } else if (number) {
      await pool.query('DELETE FROM blocked_numbers WHERE number = $1', [number]);
      
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

// Publication de tirage
app.post('/api/draws/publish', async (req, res) => {
  try {
    const { name, dateTime, results, luckyNumber, comment, source } = req.body;
    
    if (!results || !Array.isArray(results) || results.length !== 5) {
      return res.status(400).json({ error: '5 numéros requis' });
    }
    
    for (const num of results) {
      if (isNaN(num) || num < 0 || num > 99) {
        return res.status(400).json({ error: 'Numéros invalides (0-99)' });
      }
    }
    
    const drawId = `DRAW-${Date.now()}`;
    
    await pool.query(
      `INSERT INTO draw_results (draw_id, name, draw_time, results, lucky_number, comment, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [drawId, name, dateTime, JSON.stringify(results), luckyNumber, comment || '', source || 'manual']
    );
    
    // Enregistrer aussi dans winning_results pour les vérifications
    const today = new Date().toISOString().split('T')[0];
    await pool.query(
      `INSERT INTO winning_results (draw_id, draw_name, numbers, date)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (draw_id, date) 
       DO UPDATE SET numbers = $3, published_at = NOW()`,
      [name.toLowerCase().replace(/\s+/g, '_'), name, JSON.stringify(results), today]
    );
    
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
initializeDatabase().then(async () => {
  // Réparer la table tickets si nécessaire
  await repairTicketsTable();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur LOTATO démarré sur http://0.0.0.0:${PORT}`);
    console.log(`📊 Health: http://0.0.0.0:${PORT}/api/health`);
    console.log(`🔐 Login test: curl -X POST http://0.0.0.0:${PORT}/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123","role":"owner"}'`);
    console.log(`👑 Panneau propriétaire: http://0.0.0.0:${PORT}/owner.html`);
    console.log(`👤 Interface agent: http://0.0.0.0:${PORT}/agent1.html`);
  });
});

// Gestionnaire pour nettoyer proprement
process.on('SIGINT', () => {
  console.log('🧹 Arrêt propre du serveur...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🧹 Arrêt propre du serveur...');
  process.exit(0);
});