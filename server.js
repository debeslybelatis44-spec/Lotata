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

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_jhJrOgqYYQ79@ep-patient-darkness-a5v7ycpz.us-east-2.aws.neon.tech/neondb?sslmode=require',
  ssl: {
    rejectUnauthorized: false
  }
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'lotato-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalide' });
    }
    req.user = user;
    next();
  });
};

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'LOTATO API'
  });
});

// ============= AUTHENTIFICATION =============
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;

    // Validation basique
    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    // Chercher l'utilisateur selon le rôle
    let query = '';
    let userType = '';

    switch (role) {
      case 'agent':
        query = 'SELECT * FROM agents WHERE username = $1 OR id = $1';
        userType = 'agent';
        break;
      case 'supervisor':
        query = 'SELECT * FROM supervisors WHERE username = $1 OR email = $1';
        userType = 'supervisor';
        break;
      case 'owner':
        query = 'SELECT * FROM owners WHERE username = $1 OR email = $1';
        userType = 'owner';
        break;
      default:
        return res.status(400).json({ error: 'Rôle invalide' });
    }

    const result = await pool.query(query, [username]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const user = result.rows[0];

    // Note: NE PAS hacher les mots de passe comme demandé
    // Comparaison directe (à utiliser uniquement en développement)
    if (user.password !== password) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    // Générer le token JWT
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: userType,
        name: user.name || user.username
      },
      process.env.JWT_SECRET || 'lotato-secret-key',
      { expiresIn: '8h' }
    );

    res.json({
      success: true,
      token,
      name: user.name || user.username,
      role: userType,
      agentId: userType === 'agent' ? user.id : null,
      supervisorId: userType === 'supervisor' ? user.id : null,
      ownerId: userType === 'owner' ? user.id : null
    });

  } catch (error) {
    console.error('Erreur login:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/auth/logout', authenticateToken, (req, res) => {
  res.json({ success: true, message: 'Déconnexion réussie' });
});

// ============= GESTION DES AGENTS =============
app.get('/api/agents', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, s.name as supervisor_name,
      COUNT(t.id) as ticket_count,
      COALESCE(SUM(CASE WHEN t.date >= CURRENT_DATE THEN t.total_amount ELSE 0 END), 0) as today_sales,
      COALESCE(SUM(CASE WHEN t.checked = true AND t.has_wins = true THEN t.win_amount ELSE 0 END), 0) as total_wins
      FROM agents a
      LEFT JOIN supervisors s ON a.supervisor_id = s.id
      LEFT JOIN tickets t ON a.id = t.agent_id
      WHERE a.active = true
      GROUP BY a.id, s.name
      ORDER BY a.name
    `);
    
    res.json({ agents: result.rows });
  } catch (error) {
    console.error('Erreur récupération agents:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/agents/create', authenticateToken, async (req, res) => {
  try {
    const { name, username, password, supervisor_id, location, commission } = req.body;
    
    // Générer un ID unique pour l'agent
    const agentId = `agent-${Date.now().toString().slice(-6)}`;
    
    const result = await pool.query(
      `INSERT INTO agents (id, name, username, password, supervisor_id, location, commission, active) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, true) 
       RETURNING *`,
      [agentId, name, username, password, supervisor_id, location, commission || 5]
    );
    
    res.json({ success: true, agent: result.rows[0] });
  } catch (error) {
    console.error('Erreur création agent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.patch('/api/agents/:id/block', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { blocked } = req.body;
    
    await pool.query(
      'UPDATE agents SET active = $1 WHERE id = $2',
      [!blocked, id]
    );
    
    res.json({ success: true, message: `Agent ${blocked ? 'bloqué' : 'débloqué'}` });
  } catch (error) {
    console.error('Erreur blocage agent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/agent/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM agents WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent non trouvé' });
    }
    
    res.json({ agent: result.rows[0] });
  } catch (error) {
    console.error('Erreur récupération agent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= GESTION DES SUPERVISEURS =============
app.get('/api/supervisors', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, 
      COUNT(a.id) as agents_count,
      COALESCE(SUM(t.total_amount), 0) as total_sales
      FROM supervisors s
      LEFT JOIN agents a ON s.id = a.supervisor_id AND a.active = true
      LEFT JOIN tickets t ON a.id = t.agent_id
      WHERE s.active = true
      GROUP BY s.id
      ORDER BY s.name
    `);
    
    res.json({ supervisors: result.rows });
  } catch (error) {
    console.error('Erreur récupération superviseurs:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= GESTION DES TICKETS =============
app.post('/api/tickets/save', authenticateToken, async (req, res) => {
  try {
    const { agentId, agentName, drawId, drawName, bets, total } = req.body;
    
    // Générer un ID de ticket
    const ticketId = Math.floor(100000 + Math.random() * 900000);
    
    // Insérer le ticket principal
    const ticketResult = await pool.query(
      `INSERT INTO tickets (id, agent_id, agent_name, draw_id, draw_name, bets, total_amount, date, checked, has_wins) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, false) 
       RETURNING *`,
      [ticketId, agentId, agentName, drawId, drawName, JSON.stringify(bets), total, new Date()]
    );
    
    // Ajouter chaque pari séparément pour le reporting
    for (const bet of bets) {
      await pool.query(
        `INSERT INTO ticket_bets (ticket_id, game_type, number, amount, draw_id, draw_name, option, special_type, is_auto) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [ticketId, bet.game, bet.number, bet.amount, bet.drawId, bet.drawName, bet.option || null, bet.specialType || null, bet.isAutoGenerated || false]
      );
    }
    
    res.json({ 
      success: true, 
      ticket: { 
        id: ticketId, 
        ...ticketResult.rows[0],
        bets: bets 
      } 
    });
  } catch (error) {
    console.error('Erreur sauvegarde ticket:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/tickets', authenticateToken, async (req, res) => {
  try {
    const { agentId } = req.query;
    
    let query = `
      SELECT * FROM tickets 
      WHERE 1=1
    `;
    const params = [];
    
    if (agentId) {
      params.push(agentId);
      query += ` AND agent_id = $${params.length}`;
    }
    
    query += ' ORDER BY date DESC LIMIT 100';
    
    const result = await pool.query(query, params);
    
    // Parse les paris JSON
    const tickets = result.rows.map(ticket => ({
      ...ticket,
      bets: typeof ticket.bets === 'string' ? JSON.parse(ticket.bets) : ticket.bests
    }));
    
    res.json({ tickets });
  } catch (error) {
    console.error('Erreur récupération tickets:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= GESTION DES TIRAGES =============
app.get('/api/draws', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM draws 
      WHERE date >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY date DESC
    `);
    
    // Ajouter les tirages prédéfinis si aucun dans la base
    if (result.rows.length === 0) {
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
    } else {
      res.json({ draws: result.rows });
    }
  } catch (error) {
    console.error('Erreur récupération tirages:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/draws/status', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.*, 
      COUNT(t.id) as ticket_count,
      COALESCE(SUM(t.total_amount), 0) as total_sales
      FROM draws d
      LEFT JOIN tickets t ON d.id = t.draw_id
      WHERE d.date >= CURRENT_DATE
      GROUP BY d.id
      ORDER BY d.time
    `);
    
    res.json({ draws: result.rows });
  } catch (error) {
    console.error('Erreur statut tirages:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/draws/publish', authenticateToken, async (req, res) => {
  try {
    const { name, dateTime, results, luckyNumber, comment, source } = req.body;
    
    // Créer un ID de tirage
    const drawId = name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now().toString().slice(-6);
    
    const result = await pool.query(
      `INSERT INTO draws (id, name, date, time, results, lucky_number, comment, source, published_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [drawId, name, dateTime.split('T')[0], dateTime.split('T')[1], results, luckyNumber, comment, source, new Date()]
    );
    
    res.json({ success: true, draw: result.rows[0] });
  } catch (error) {
    console.error('Erreur publication tirage:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= RAPPORTS =============
app.get('/api/reports', authenticateToken, async (req, res) => {
  try {
    const { agentId } = req.query;
    
    let queryParams = [];
    let agentFilter = '';
    
    if (agentId) {
      queryParams.push(agentId);
      agentFilter = 'AND agent_id = $1';
    }
    
    // Totaux du jour
    const todayResult = await pool.query(`
      SELECT 
        COUNT(*) as total_tickets,
        COALESCE(SUM(total_amount), 0) as total_bets,
        COALESCE(SUM(CASE WHEN has_wins = true THEN win_amount ELSE 0 END), 0) as total_wins
      FROM tickets 
      WHERE date >= CURRENT_DATE ${agentFilter}
    `, agentId ? [agentId] : []);
    
    const today = todayResult.rows[0];
    
    // Balance
    const balance = today.total_bets - today.total_wins;
    
    // Répartition par jeu
    const breakdownResult = await pool.query(`
      SELECT 
        game_type,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as amount
      FROM ticket_bets 
      WHERE date >= CURRENT_DATE ${agentFilter}
      GROUP BY game_type
      ORDER BY amount DESC
    `, agentId ? [agentId] : []);
    
    const breakdown = {};
    breakdownResult.rows.forEach(row => {
      breakdown[row.game_type] = {
        count: row.count,
        amount: row.amount
      };
    });
    
    res.json({
      totalTickets: parseInt(today.total_tickets),
      totalBets: parseFloat(today.total_bets),
      totalWins: parseFloat(today.total_wins),
      totalLoss: parseFloat(today.total_bets - today.total_wins),
      balance: parseFloat(balance),
      breakdown
    });
  } catch (error) {
    console.error('Erreur rapports:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= GAGNANTS =============
app.get('/api/winners', authenticateToken, async (req, res) => {
  try {
    const { agentId } = req.query;
    
    let query = `
      SELECT w.*, t.agent_name, t.draw_name
      FROM winning_tickets w
      JOIN tickets t ON w.ticket_id = t.id
      WHERE 1=1
    `;
    const params = [];
    
    if (agentId) {
      params.push(agentId);
      query += ` AND t.agent_id = $${params.length}`;
    }
    
    query += ' ORDER BY w.date DESC';
    
    const result = await pool.query(query, params);
    
    res.json({ winners: result.rows });
  } catch (error) {
    console.error('Erreur récupération gagnants:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/winners/pay', authenticateToken, async (req, res) => {
  try {
    const { ticketId } = req.body;
    
    await pool.query(
      'UPDATE winning_tickets SET paid = true, paid_at = $1 WHERE ticket_id = $2',
      [new Date(), ticketId]
    );
    
    res.json({ success: true, message: 'Paiement enregistré' });
  } catch (error) {
    console.error('Erreur paiement gagnant:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= NUMÉROS BLOQUÉS =============
app.get('/api/blocked-numbers', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM blocked_numbers');
    const blocked = result.rows.map(row => row.number);
    
    res.json({ blockedNumbers: blocked });
  } catch (error) {
    console.error('Erreur récupération numéros bloqués:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/blocked-numbers', authenticateToken, async (req, res) => {
  try {
    const { number } = req.body;
    
    // Vérifier si déjà bloqué
    const check = await pool.query(
      'SELECT * FROM blocked_numbers WHERE number = $1',
      [number]
    );
    
    if (check.rows.length === 0) {
      await pool.query(
        'INSERT INTO blocked_numbers (number, blocked_at) VALUES ($1, $2)',
        [number, new Date()]
      );
    }
    
    res.json({ success: true, message: `Numéro ${number} bloqué` });
  } catch (error) {
    console.error('Erreur blocage numéro:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= CONFIGURATION LOTERIE =============
app.get('/api/lottery-config', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM lottery_config LIMIT 1');
    
    if (result.rows.length === 0) {
      // Configuration par défaut
      res.json({
        name: 'LOTATO PRO',
        logo: '',
        address: '',
        phone: ''
      });
    } else {
      res.json(result.rows[0]);
    }
  } catch (error) {
    console.error('Erreur récupération config:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/lottery-config', authenticateToken, async (req, res) => {
  try {
    const { name, logo, address, phone } = req.body;
    
    // Vérifier si une config existe déjà
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
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= JOURNAL D'ACTIVITÉ =============
app.get('/api/activity', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM activity_log 
      ORDER BY timestamp DESC 
      LIMIT 50
    `);
    
    res.json({ activity: result.rows });
  } catch (error) {
    console.error('Erreur récupération activité:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= ROUTES SUPERVISEUR =============
app.get('/api/supervisor/agents', authenticateToken, async (req, res) => {
  try {
    const supervisorId = req.user.id;
    
    const result = await pool.query(`
      SELECT a.*,
      COUNT(t.id) as ticket_count,
      COALESCE(SUM(CASE WHEN t.date >= CURRENT_DATE THEN t.total_amount ELSE 0 END), 0) as today_sales,
      COALESCE(SUM(CASE WHEN t.checked = true AND t.has_wins = true THEN t.win_amount ELSE 0 END), 0) as total_wins
      FROM agents a
      LEFT JOIN tickets t ON a.id = t.agent_id
      WHERE a.supervisor_id = $1 AND a.active = true
      GROUP BY a.id
      ORDER BY a.name
    `, [supervisorId]);
    
    res.json({ agents: result.rows });
  } catch (error) {
    console.error('Erreur agents superviseur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= ROUTES PROPRIÉTAIRE =============
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const { type } = req.query;
    
    let agents = [];
    let supervisors = [];
    
    if (!type || type === 'agent') {
      const agentsResult = await pool.query(`
        SELECT a.*, s.name as supervisor_name,
        COUNT(t.id) as ticket_count,
        COALESCE(SUM(CASE WHEN t.date >= CURRENT_DATE THEN t.total_amount ELSE 0 END), 0) as today_sales
        FROM agents a
        LEFT JOIN supervisors s ON a.supervisor_id = s.id
        LEFT JOIN tickets t ON a.id = t.agent_id
        GROUP BY a.id, s.name
        ORDER BY a.name
      `);
      agents = agentsResult.rows;
    }
    
    if (!type || type === 'supervisor') {
      const supervisorsResult = await pool.query(`
        SELECT s.*, 
        COUNT(a.id) as agents_count,
        COALESCE(SUM(t.total_amount), 0) as total_sales
        FROM supervisors s
        LEFT JOIN agents a ON s.id = a.supervisor_id AND a.active = true
        LEFT JOIN tickets t ON a.id = t.agent_id
        GROUP BY s.id
        ORDER BY s.name
      `);
      supervisors = supervisorsResult.rows;
    }
    
    res.json({ agents, supervisors });
  } catch (error) {
    console.error('Erreur récupération utilisateurs:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= DASHBOARD PROPRIÉTAIRE =============
app.get('/api/reports/dashboard', authenticateToken, async (req, res) => {
  try {
    // Statistiques générales
    const statsResult = await pool.query(`
      SELECT 
        COUNT(DISTINCT a.id) as total_users,
        COUNT(DISTINCT s.id) as total_supervisors,
        COUNT(DISTINCT CASE WHEN a.active = true THEN a.id END) as online_users,
        COALESCE(SUM(CASE WHEN t.date >= CURRENT_DATE THEN t.total_amount ELSE 0 END), 0) as total_sales,
        COUNT(DISTINCT CASE WHEN t.date >= CURRENT_DATE THEN t.id END) as total_tickets,
        COALESCE(SUM(CASE WHEN t.date >= CURRENT_DATE AND t.has_wins = true THEN t.win_amount ELSE 0 END), 0) as total_wins,
        COUNT(DISTINCT CASE WHEN bn.number IS NOT NULL THEN bn.number END) as total_blocks,
        COUNT(DISTINCT CASE WHEN d.date >= CURRENT_DATE THEN d.id END) as total_draws
      FROM agents a
      LEFT JOIN supervisors s ON 1=1
      LEFT JOIN tickets t ON a.id = t.agent_id
      LEFT JOIN blocked_numbers bn ON 1=1
      LEFT JOIN draws d ON d.date >= CURRENT_DATE
    `);
    
    res.json(statsResult.rows[0]);
  } catch (error) {
    console.error('Erreur dashboard:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= GESTION DES LIMITES =============
app.get('/api/numbers/limits', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM number_limits');
    
    const limits = {};
    result.rows.forEach(row => {
      limits[row.number] = row.limit_amount;
    });
    
    res.json({ limits });
  } catch (error) {
    console.error('Erreur récupération limites:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/numbers/limits', authenticateToken, async (req, res) => {
  try {
    const { number, limit } = req.body;
    
    // Vérifier si la limite existe déjà
    const check = await pool.query(
      'SELECT * FROM number_limits WHERE number = $1',
      [number]
    );
    
    if (check.rows.length === 0) {
      await pool.query(
        'INSERT INTO number_limits (number, limit_amount) VALUES ($1, $2)',
        [number, limit]
      );
    } else {
      await pool.query(
        'UPDATE number_limits SET limit_amount = $1 WHERE number = $2',
        [limit, number]
      );
    }
    
    res.json({ success: true, message: `Limite pour ${number} sauvegardée` });
  } catch (error) {
    console.error('Erreur sauvegarde limite:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour débloquer plusieurs numéros
app.post('/api/numbers/unblock', authenticateToken, async (req, res) => {
  try {
    const { numbers } = req.body;
    
    if (Array.isArray(numbers) && numbers.length > 0) {
      await pool.query(
        'DELETE FROM blocked_numbers WHERE number = ANY($1)',
        [numbers]
      );
    }
    
    res.json({ success: true, message: `${numbers.length} numéro(s) débloqué(s)` });
  } catch (error) {
    console.error('Erreur déblocage numéros:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route 404
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// Servir les fichiers statiques du frontend
app.use(express.static('public'));

// Redirection vers l'interface selon le rôle
app.get('/login', (req, res) => {
  res.redirect('/');
});

app.get('/agent', (req, res) => {
  res.redirect('/agent1.html');
});

app.get('/supervisor', (req, res) => {
  res.redirect('/responsable.html');
});

app.get('/owner', (req, res) => {
  res.redirect('/owner.html');
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`Serveur LOTATO démarré sur le port ${PORT}`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});