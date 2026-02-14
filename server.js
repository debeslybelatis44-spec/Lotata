// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const moment = require('moment');

const app = express();
const PORT = process.env.PORT || 3000;

// Connexion PostgreSQL (Neon)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // nécessaire pour Neon
  }
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limite chaque IP à 100 requêtes par fenêtre
});
app.use('/api/', limiter);

// Clé secrète JWT
const JWT_SECRET = process.env.JWT_SECRET || 'votre_secret_tres_long_et_aleatoire';

// -------------------------
// Middleware d'authentification
// -------------------------
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Middleware pour vérifier le rôle
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès interdit' });
    }
    next();
  };
};

// -------------------------
// Routes publiques
// -------------------------

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    const user = result.rows[0];
    if (user.blocked) {
      return res.status(403).json({ error: 'Compte bloqué' });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    // Mise à jour last_login
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/lottery-config
app.get('/api/lottery-config', async (req, res) => {
  try {
    const result = await pool.query('SELECT name, logo_url as logo, address, phone FROM lottery_config WHERE id = 1');
    if (result.rows.length === 0) {
      return res.json({ name: 'LOTATO PRO', logo: '', address: '', phone: '' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/draws
app.get('/api/draws', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, time, color FROM draws ORDER BY time');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// -------------------------
// Routes protégées (agents, superviseurs, owner)
// -------------------------

// POST /api/tickets/save
app.post('/api/tickets/save', authenticateToken, async (req, res) => {
  const { agentId, agentName, drawId, drawName, bets, total } = req.body;
  // Vérifier que l'agent correspond à l'utilisateur connecté (sauf si owner/supervisor)
  if (req.user.role === 'agent' && req.user.id !== agentId) {
    return res.status(403).json({ error: 'Vous ne pouvez pas créer un ticket pour un autre agent' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Générer un ticket_id unique (par exemple timestamp + random)
    const ticketId = 'T' + Date.now() + Math.floor(Math.random() * 1000);
    const insertTicket = await client.query(
      'INSERT INTO tickets (ticket_id, agent_id, draw_id, total_amount, date) VALUES ($1, $2, $3, $4, NOW()) RETURNING id',
      [ticketId, agentId, drawId, total]
    );
    const ticketDbId = insertTicket.rows[0].id;
    // Insérer chaque bet
    for (const bet of bets) {
      await client.query(
        `INSERT INTO bets (ticket_id, game, number, clean_number, amount, option, is_auto_generated, special_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [ticketDbId, bet.game, bet.number, bet.cleanNumber, bet.amount, bet.option || null,
         bet.isAutoGenerated || false, bet.specialType || null]
      );
    }
    await client.query('COMMIT');
    // Retourner le ticket avec son ID
    res.json({
      success: true,
      ticket: {
        id: ticketDbId,
        ticket_id: ticketId,
        agent_name: agentName,
        draw_name: drawName,
        total_amount: total,
        date: new Date().toISOString(),
        bets: bets
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la sauvegarde du ticket' });
  } finally {
    client.release();
  }
});

// GET /api/tickets
app.get('/api/tickets', authenticateToken, async (req, res) => {
  const { agentId } = req.query;
  // Vérification des droits : agent ne voit que ses tickets, superviseur voit ceux de ses agents, owner voit tout
  try {
    let query = `
      SELECT t.*, u.name as agent_name, d.name as draw_name
      FROM tickets t
      JOIN users u ON t.agent_id = u.id
      JOIN draws d ON t.draw_id = d.id
    `;
    const params = [];
    if (req.user.role === 'agent') {
      query += ' WHERE t.agent_id = $1';
      params.push(req.user.id);
    } else if (req.user.role === 'supervisor') {
      // tickets des agents dont le supervisor_id = req.user.id
      query += ' WHERE u.supervisor_id = $1';
      params.push(req.user.id);
    } else if (req.user.role === 'owner' && agentId) {
      query += ' WHERE t.agent_id = $1';
      params.push(agentId);
    }
    query += ' ORDER BY t.date DESC';
    const result = await pool.query(query, params);
    res.json({ tickets: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/reports
app.get('/api/reports', authenticateToken, async (req, res) => {
  const { agentId } = req.query;
  // Pour simplifier, on renvoie des stats globales pour l'agent ou le superviseur
  try {
    let totalTickets = 0, totalBets = 0, totalWins = 0, balance = 0;
    if (req.user.role === 'agent') {
      const result = await pool.query(
        `SELECT COUNT(*) as tickets, COALESCE(SUM(total_amount),0) as bets,
                COALESCE(SUM(win_amount),0) as wins
         FROM tickets WHERE agent_id = $1 AND date::date = CURRENT_DATE`,
        [req.user.id]
      );
      totalTickets = parseInt(result.rows[0].tickets);
      totalBets = parseFloat(result.rows[0].bets);
      totalWins = parseFloat(result.rows[0].wins);
      balance = totalBets - totalWins;
    } else if (req.user.role === 'supervisor') {
      // somme des agents sous ce superviseur
      const result = await pool.query(
        `SELECT COUNT(t.*) as tickets, COALESCE(SUM(t.total_amount),0) as bets,
                COALESCE(SUM(t.win_amount),0) as wins
         FROM tickets t
         JOIN users u ON t.agent_id = u.id
         WHERE u.supervisor_id = $1 AND t.date::date = CURRENT_DATE`,
        [req.user.id]
      );
      totalTickets = parseInt(result.rows[0].tickets);
      totalBets = parseFloat(result.rows[0].bets);
      totalWins = parseFloat(result.rows[0].wins);
      balance = totalBets - totalWins;
    } else if (req.user.role === 'owner') {
      // total général du jour
      const result = await pool.query(
        `SELECT COUNT(*) as tickets, COALESCE(SUM(total_amount),0) as bets,
                COALESCE(SUM(win_amount),0) as wins
         FROM tickets WHERE date::date = CURRENT_DATE`
      );
      totalTickets = parseInt(result.rows[0].tickets);
      totalBets = parseFloat(result.rows[0].bets);
      totalWins = parseFloat(result.rows[0].wins);
      balance = totalBets - totalWins;
    }
    res.json({
      totalTickets,
      totalBets,
      totalWins,
      totalLoss: totalBets - totalWins,
      balance
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/reports/draw
app.get('/api/reports/draw', authenticateToken, async (req, res) => {
  const { agentId, drawId } = req.query;
  try {
    // Construction de la requête selon le rôle
    let query = `
      SELECT COUNT(*) as tickets, COALESCE(SUM(total_amount),0) as bets,
             COALESCE(SUM(win_amount),0) as wins
      FROM tickets t
      JOIN users u ON t.agent_id = u.id
      WHERE t.date::date = CURRENT_DATE
    `;
    const params = [];
    let paramIndex = 1;
    if (drawId && drawId !== 'all') {
      query += ` AND t.draw_id = $${paramIndex++}`;
      params.push(drawId);
    }
    if (req.user.role === 'agent') {
      query += ` AND t.agent_id = $${paramIndex++}`;
      params.push(req.user.id);
    } else if (req.user.role === 'supervisor') {
      query += ` AND u.supervisor_id = $${paramIndex++}`;
      params.push(req.user.id);
    } else if (req.user.role === 'owner' && agentId) {
      query += ` AND t.agent_id = $${paramIndex++}`;
      params.push(agentId);
    }
    const result = await pool.query(query, params);
    const row = result.rows[0];
    res.json({
      totalTickets: parseInt(row.tickets),
      totalBets: parseFloat(row.bets),
      totalWins: parseFloat(row.wins),
      totalLoss: parseFloat(row.bets) - parseFloat(row.wins),
      balance: parseFloat(row.bets) - parseFloat(row.wins)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/winners
app.get('/api/winners', authenticateToken, async (req, res) => {
  const { agentId } = req.query;
  try {
    let query = `
      SELECT t.*, u.name as agent_name, d.name as draw_name
      FROM tickets t
      JOIN users u ON t.agent_id = u.id
      JOIN draws d ON t.draw_id = d.id
      WHERE t.win_amount > 0
    `;
    const params = [];
    if (req.user.role === 'agent') {
      query += ' AND t.agent_id = $1';
      params.push(req.user.id);
    } else if (req.user.role === 'supervisor') {
      query += ' AND u.supervisor_id = $1';
      params.push(req.user.id);
    } else if (req.user.role === 'owner' && agentId) {
      query += ' AND t.agent_id = $1';
      params.push(agentId);
    }
    query += ' ORDER BY t.date DESC';
    const result = await pool.query(query, params);
    res.json({ winners: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/winners/results
app.get('/api/winners/results', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT w.*, d.name as draw_name FROM winning_results w
       JOIN draws d ON w.draw_id = d.id
       ORDER BY w.date DESC`
    );
    res.json({ results: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/winners/pay/:ticketId
app.post('/api/winners/pay/:ticketId', authenticateToken, authorize('owner', 'supervisor'), async (req, res) => {
  const { ticketId } = req.params;
  try {
    await pool.query('UPDATE tickets SET paid = TRUE WHERE id = $1', [ticketId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/tickets/delete/:ticketId
app.delete('/api/tickets/delete/:ticketId', authenticateToken, async (req, res) => {
  const { ticketId } = req.params;
  // Vérifier que le ticket a moins de 10 minutes (ou 5 selon règle)
  try {
    const ticket = await pool.query('SELECT date, agent_id FROM tickets WHERE id = $1', [ticketId]);
    if (ticket.rows.length === 0) return res.status(404).json({ error: 'Ticket non trouvé' });
    const ticketDate = new Date(ticket.rows[0].date);
    const now = new Date();
    const diffMinutes = (now - ticketDate) / (1000 * 60);
    if (diffMinutes > 10) {
      return res.status(403).json({ error: 'Délai de suppression dépassé (10 min)' });
    }
    // Vérification des droits
    if (req.user.role === 'agent' && req.user.id !== ticket.rows[0].agent_id) {
      return res.status(403).json({ error: 'Vous ne pouvez supprimer que vos propres tickets' });
    }
    if (req.user.role === 'supervisor') {
      // Vérifier que l'agent est sous sa supervision
      const agent = await pool.query('SELECT supervisor_id FROM users WHERE id = $1', [ticket.rows[0].agent_id]);
      if (agent.rows[0].supervisor_id !== req.user.id) {
        return res.status(403).json({ error: 'Cet agent n\'est pas sous votre supervision' });
      }
    }
    await pool.query('DELETE FROM tickets WHERE id = $1', [ticketId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/tickets/check-winners
app.post('/api/tickets/check-winners', authenticateToken, authorize('owner'), async (req, res) => {
  // Cette route devrait être appelée après publication des résultats
  // Elle compare les bets avec les résultats et met à jour win_amount
  // Implémentation simplifiée : on peut laisser vide ou faire un calcul basique
  res.json({ message: 'Fonction à implémenter' });
});

// GET /api/agents
app.get('/api/agents', authenticateToken, authorize('owner', 'supervisor'), async (req, res) => {
  try {
    let query = 'SELECT id, name, username, role, blocked FROM users WHERE role = $1';
    const params = ['agent'];
    if (req.user.role === 'supervisor') {
      query += ' AND supervisor_id = $2';
      params.push(req.user.id);
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// -------------------------
// Routes propriétaire (owner)
// -------------------------

// GET /api/owner/dashboard
app.get('/api/owner/dashboard', authenticateToken, authorize('owner'), async (req, res) => {
  try {
    // Connexions : utilisateurs connectés récemment (last_login dans les 5 dernières minutes)
    const connected = await pool.query(`
      SELECT role, COUNT(*) as count, json_agg(json_build_object('id', id, 'name', name, 'username', username)) as users
      FROM users
      WHERE last_login > NOW() - INTERVAL '5 minutes'
      GROUP BY role
    `);
    let supervisors = [], agents = [];
    connected.rows.forEach(row => {
      if (row.role === 'supervisor') supervisors = row.users;
      if (row.role === 'agent') agents = row.users;
    });
    // Ventes du jour
    const sales = await pool.query(`
      SELECT COALESCE(SUM(total_amount),0) as total
      FROM tickets WHERE date::date = CURRENT_DATE
    `);
    // Progression des limites (à implémenter selon vos données)
    const limitsProgress = []; // à remplir
    // Agents gains/pertes du jour
    const agentsGainLoss = await pool.query(`
      SELECT u.id, u.name,
             COALESCE(SUM(t.total_amount),0) as total_bets,
             COALESCE(SUM(t.win_amount),0) as total_wins,
             COALESCE(SUM(t.win_amount),0) - COALESCE(SUM(t.total_amount),0) as net_result
      FROM users u
      LEFT JOIN tickets t ON u.id = t.agent_id AND t.date::date = CURRENT_DATE
      WHERE u.role = 'agent'
      GROUP BY u.id, u.name
    `);
    res.json({
      connected: {
        supervisors_count: supervisors.length,
        agents_count: agents.length,
        supervisors,
        agents
      },
      sales_today: parseFloat(sales.rows[0].total),
      limits_progress: limitsProgress,
      agents_gain_loss: agentsGainLoss.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/owner/supervisors
app.get('/api/owner/supervisors', authenticateToken, authorize('owner'), async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, username, blocked FROM users WHERE role = $1', ['supervisor']);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/owner/agents
app.get('/api/owner/agents', authenticateToken, authorize('owner'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.username, u.blocked, s.name as supervisor_name
      FROM users u
      LEFT JOIN users s ON u.supervisor_id = s.id
      WHERE u.role = 'agent'
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/owner/create-user
app.post('/api/owner/create-user', authenticateToken, authorize('owner'), async (req, res) => {
  const { name, cin, username, password, role, supervisorId, zone } = req.body;
  if (!name || !username || !password || !role) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  }
  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, password, role, name, cin, zone, supervisor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [username, hashed, role, name, cin || null, zone || null, supervisorId || null]
    );
    res.json({ success: true, userId: result.rows[0].id });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') { // duplicate key
      return res.status(400).json({ error: 'Nom d\'utilisateur déjà pris' });
    }
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/owner/block-user
app.post('/api/owner/block-user', authenticateToken, authorize('owner'), async (req, res) => {
  const { userId, type } = req.body; // type non utilisé ici
  try {
    await pool.query('UPDATE users SET blocked = NOT blocked WHERE id = $1', [userId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/owner/change-supervisor
app.put('/api/owner/change-supervisor', authenticateToken, authorize('owner'), async (req, res) => {
  const { agentId, supervisorId } = req.body;
  try {
    await pool.query('UPDATE users SET supervisor_id = $1 WHERE id = $2', [supervisorId, agentId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/owner/draws
app.get('/api/owner/draws', authenticateToken, authorize('owner'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM draws ORDER BY time');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/owner/publish-results
app.post('/api/owner/publish-results', authenticateToken, authorize('owner'), async (req, res) => {
  const { drawId, numbers } = req.body;
  try {
    await pool.query(
      'INSERT INTO winning_results (draw_id, numbers, published_by) VALUES ($1, $2, $3)',
      [drawId, JSON.stringify(numbers), req.user.id]
    );
    // Ici vous pourriez déclencher la vérification des tickets gagnants
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/owner/block-draw
app.post('/api/owner/block-draw', authenticateToken, authorize('owner'), async (req, res) => {
  const { drawId, block } = req.body;
  try {
    await pool.query('UPDATE draws SET blocked = $1 WHERE id = $2', [block, drawId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/owner/blocked-numbers
app.get('/api/owner/blocked-numbers', authenticateToken, authorize('owner'), async (req, res) => {
  try {
    const global = await pool.query('SELECT number FROM blocked_numbers_global ORDER BY number');
    const draw = await pool.query('SELECT * FROM blocked_numbers_draw');
    res.json({
      blockedNumbers: global.rows.map(r => r.number),
      drawBlocks: draw.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/owner/block-number
app.post('/api/owner/block-number', authenticateToken, authorize('owner'), async (req, res) => {
  const { number } = req.body;
  try {
    await pool.query('INSERT INTO blocked_numbers_global (number) VALUES ($1) ON CONFLICT DO NOTHING', [number]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/owner/unblock-number
app.post('/api/owner/unblock-number', authenticateToken, authorize('owner'), async (req, res) => {
  const { number } = req.body;
  try {
    await pool.query('DELETE FROM blocked_numbers_global WHERE number = $1', [number]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/owner/block-number-draw
app.post('/api/owner/block-number-draw', authenticateToken, authorize('owner'), async (req, res) => {
  const { drawId, number } = req.body;
  try {
    await pool.query(
      'INSERT INTO blocked_numbers_draw (draw_id, number) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [drawId, number]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/owner/unblock-number-draw
app.post('/api/owner/unblock-number-draw', authenticateToken, authorize('owner'), async (req, res) => {
  const { drawId, number } = req.body;
  try {
    await pool.query('DELETE FROM blocked_numbers_draw WHERE draw_id = $1 AND number = $2', [drawId, number]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/owner/number-limit
app.post('/api/owner/number-limit', authenticateToken, authorize('owner'), async (req, res) => {
  const { drawId, number, limitAmount } = req.body;
  try {
    await pool.query(
      `INSERT INTO number_limits (draw_id, number, limit_amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (draw_id, number) DO UPDATE SET limit_amount = $3`,
      [drawId, number, limitAmount]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/owner/reports
app.get('/api/owner/reports', authenticateToken, authorize('owner'), async (req, res) => {
  const { supervisorId, agentId, drawId, period, fromDate, toDate, gainLoss } = req.query;
  // Implémentation simplifiée : retourne des stats groupées
  try {
    let query = `
      SELECT
        COUNT(DISTINCT t.id) as totalTickets,
        COALESCE(SUM(t.total_amount),0) as totalBets,
        COALESCE(SUM(t.win_amount),0) as totalWins,
        COALESCE(SUM(t.win_amount),0) - COALESCE(SUM(t.total_amount),0) as netResult,
        COUNT(CASE WHEN t.win_amount > 0 THEN 1 END) as gainCount,
        COUNT(CASE WHEN t.win_amount = 0 AND t.checked THEN 1 END) as lossCount
      FROM tickets t
      JOIN users u ON t.agent_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (supervisorId && supervisorId !== 'all') {
      query += ` AND u.supervisor_id = $${idx++}`;
      params.push(supervisorId);
    }
    if (agentId && agentId !== 'all') {
      query += ` AND t.agent_id = $${idx++}`;
      params.push(agentId);
    }
    if (drawId && drawId !== 'all') {
      query += ` AND t.draw_id = $${idx++}`;
      params.push(drawId);
    }
    // Filtre date
    if (period === 'today') {
      query += ` AND t.date::date = CURRENT_DATE`;
    } else if (period === 'yesterday') {
      query += ` AND t.date::date = CURRENT_DATE - 1`;
    } else if (period === 'week') {
      query += ` AND t.date >= date_trunc('week', CURRENT_DATE)`;
    } else if (period === 'month') {
      query += ` AND t.date >= date_trunc('month', CURRENT_DATE)`;
    } else if (period === 'custom' && fromDate && toDate) {
      query += ` AND t.date::date BETWEEN $${idx++} AND $${idx++}`;
      params.push(fromDate, toDate);
    }
    const result = await pool.query(query, params);
    const summary = result.rows[0];
    // Détail par agent ou tirage
    let detailQuery = `
      SELECT
        COALESCE(u.name, d.name) as name,
        COUNT(DISTINCT t.id) as tickets,
        COALESCE(SUM(t.total_amount),0) as bets,
        COALESCE(SUM(t.win_amount),0) as wins
      FROM tickets t
      JOIN users u ON t.agent_id = u.id
      JOIN draws d ON t.draw_id = d.id
      WHERE 1=1
    `;
    // Réappliquer les mêmes filtres
    // ... (similaire)
    // On groupe par agent ou par tirage selon le besoin, ici on groupe par agent
    detailQuery += ` GROUP BY u.id, u.name`;
    const detail = await pool.query(detailQuery, params); // attention aux paramètres partagés
    res.json({
      summary: {
        totalTickets: parseInt(summary.totalTickets),
        totalBets: parseFloat(summary.totalbets),
        totalWins: parseFloat(summary.totalwins),
        netResult: parseFloat(summary.netresult),
        gainCount: parseInt(summary.gaincount),
        lossCount: parseInt(summary.losscount)
      },
      detail: detail.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// -------------------------
// Routes superviseur (supervisor)
// -------------------------

// GET /api/supervisor/reports/overall
app.get('/api/supervisor/reports/overall', authenticateToken, authorize('supervisor'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         COUNT(t.*) as totalTickets,
         COALESCE(SUM(t.total_amount),0) as totalBets,
         COALESCE(SUM(t.win_amount),0) as totalWins,
         COALESCE(SUM(t.win_amount),0) - COALESCE(SUM(t.total_amount),0) as balance
       FROM tickets t
       JOIN users u ON t.agent_id = u.id
       WHERE u.supervisor_id = $1 AND t.date::date = CURRENT_DATE`,
      [req.user.id]
    );
    res.json({
      totalTickets: parseInt(result.rows[0].totaltickets),
      totalBets: parseFloat(result.rows[0].totalbets),
      totalWins: parseFloat(result.rows[0].totalwins),
      balance: parseFloat(result.rows[0].balance)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/supervisor/agents
app.get('/api/supervisor/agents', authenticateToken, authorize('supervisor'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.username, u.blocked,
              COALESCE(SUM(t.total_amount),0) as totalBets,
              COALESCE(SUM(t.win_amount),0) as totalWins,
              COUNT(t.id) as totalTickets,
              COALESCE(SUM(t.win_amount),0) - COALESCE(SUM(t.total_amount),0) as balance
       FROM users u
       LEFT JOIN tickets t ON u.id = t.agent_id AND t.date::date = CURRENT_DATE
       WHERE u.role = 'agent' AND u.supervisor_id = $1
       GROUP BY u.id, u.name, u.username, u.blocked`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/supervisor/block-agent/:agentId
app.post('/api/supervisor/block-agent/:agentId', authenticateToken, authorize('supervisor'), async (req, res) => {
  const { agentId } = req.params;
  try {
    // Vérifier que l'agent est bien sous ce superviseur
    const check = await pool.query('SELECT supervisor_id FROM users WHERE id = $1', [agentId]);
    if (check.rows.length === 0 || check.rows[0].supervisor_id !== req.user.id) {
      return res.status(403).json({ error: 'Agent non autorisé' });
    }
    await pool.query('UPDATE users SET blocked = TRUE WHERE id = $1', [agentId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/supervisor/unblock-agent/:agentId
app.post('/api/supervisor/unblock-agent/:agentId', authenticateToken, authorize('supervisor'), async (req, res) => {
  const { agentId } = req.params;
  try {
    const check = await pool.query('SELECT supervisor_id FROM users WHERE id = $1', [agentId]);
    if (check.rows.length === 0 || check.rows[0].supervisor_id !== req.user.id) {
      return res.status(403).json({ error: 'Agent non autorisé' });
    }
    await pool.query('UPDATE users SET blocked = FALSE WHERE id = $1', [agentId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/supervisor/tickets/recent
app.get('/api/supervisor/tickets/recent', authenticateToken, authorize('supervisor'), async (req, res) => {
  const { agentId } = req.query;
  if (!agentId) return res.status(400).json({ error: 'agentId requis' });
  try {
    const check = await pool.query('SELECT supervisor_id FROM users WHERE id = $1', [agentId]);
    if (check.rows.length === 0 || check.rows[0].supervisor_id !== req.user.id) {
      return res.status(403).json({ error: 'Agent non autorisé' });
    }
    const result = await pool.query(
      `SELECT id, ticket_id, total_amount, date
       FROM tickets
       WHERE agent_id = $1
       ORDER BY date DESC
       LIMIT 10`,
      [agentId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/supervisor/tickets/:ticketId
app.delete('/api/supervisor/tickets/:ticketId', authenticateToken, authorize('supervisor'), async (req, res) => {
  const { ticketId } = req.params;
  try {
    // Vérifier que le ticket appartient à un agent sous ce superviseur
    const ticket = await pool.query(
      `SELECT t.*, u.supervisor_id
       FROM tickets t
       JOIN users u ON t.agent_id = u.id
       WHERE t.id = $1`,
      [ticketId]
    );
    if (ticket.rows.length === 0) return res.status(404).json({ error: 'Ticket non trouvé' });
    if (ticket.rows[0].supervisor_id !== req.user.id) {
      return res.status(403).json({ error: 'Accès interdit' });
    }
    // Vérifier délai
    const ticketDate = new Date(ticket.rows[0].date);
    const now = new Date();
    const diffMinutes = (now - ticketDate) / (1000 * 60);
    if (diffMinutes > 10) {
      return res.status(403).json({ error: 'Délai de suppression dépassé (10 min)' });
    }
    await pool.query('DELETE FROM tickets WHERE id = $1', [ticketId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// -------------------------
// Démarrage du serveur
// -------------------------
app.listen(PORT, () => {
  console.log(`Serveur LOTATO PRO démarré sur le port ${PORT}`);
});