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

// ==================== Règles de gain (copie de CONFIG.GAMING_RULES) ====================
const GAMING_RULES = {
  BORLETTE: { lot1: 60, lot2: 20, lot3: 10 },
  LOTTO3: 500,
  LOTTO4: 1000,
  LOTTO5: 5000,
  MARIAGE: 1000,
  AUTO_MARIAGE: 1000,
  AUTO_LOTTO4: 1000,
  AUTO_LOTTO5: 5000
};

// ==================== Middlewares ====================
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('dev'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  keyGenerator: (req) => req.ip
});
app.use('/api/', limiter);

// ==================== Base de données ====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('connect', () => console.log('✅ Connecté à PostgreSQL'));
pool.on('error', (err) => console.error('❌ Erreur PostgreSQL:', err));

// ==================== Utilitaires ====================
async function columnExists(table, column) { /* ... identique à avant ... */ }
async function addColumnIfNotExists(table, column, definition) { /* ... */ }

async function initializeDatabase() {
  try {
    console.log('🔄 Vérification de la base de données...');
    // On peut ajouter ici des ALTER TABLE si nécessaire, mais on part du principe que les tables existent déjà.
    console.log('✅ Base de données prête');
  } catch (error) {
    console.error('❌ Erreur initialisation:', error);
  }
}

// ==================== Authentification ====================
const JWT_SECRET = process.env.JWT_SECRET || 'lotato-pro-secret-key-change-in-production';

// Middleware de vérification du token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token manquant' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token invalide' });
    req.user = user;
    next();
  });
}

// Middleware pour vérifier le rôle
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès interdit' });
    }
    next();
  };
}

// ==================== Routes publiques ====================
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({ status: 'OK', timestamp: new Date().toISOString(), database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', error: error.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Champs requis manquants' });
    }

    let user = null;
    let table = '';
    if (role === 'supervisor') {
      table = 'supervisors';
    } else if (role === 'agent') {
      table = 'agents';
    } else if (role === 'owner') {
      // Le propriétaire est aussi dans la table supervisors (avec un rôle spécial)
      table = 'supervisors';
    } else {
      return res.status(400).json({ error: 'Rôle invalide' });
    }

    // Chercher par email ou nom d'utilisateur (on utilise email pour simplifier)
    const result = await pool.query(
      `SELECT id, name, email, password, active FROM ${table} WHERE email = $1 OR name = $1`,
      [username]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    user = result.rows[0];

    if (!user.active) {
      return res.status(403).json({ error: 'Compte désactivé' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    // Générer le token
    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: role,
        // Pour un agent, on a besoin de l'ID agent
        agentId: role === 'agent' ? user.id : null,
        supervisorId: role === 'supervisor' ? user.id : null,
        ownerId: role === 'owner' ? user.id : null
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Journaliser la connexion
    await pool.query(
      'INSERT INTO activity_log (user_id, user_role, action, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)',
      [user.id, role, 'login', req.ip, req.headers['user-agent']]
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
    console.error('❌ Erreur login:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Rafraîchir le token
app.post('/api/auth/refresh', authenticateToken, (req, res) => {
  const user = req.user;
  const newToken = jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      agentId: user.agentId,
      supervisorId: user.supervisorId,
      ownerId: user.ownerId
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  res.json({ success: true, token: newToken });
});

// Logout (côté client supprime le token, on peut juste logger)
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  await pool.query(
    'INSERT INTO activity_log (user_id, user_role, action, ip_address) VALUES ($1, $2, $3, $4)',
    [req.user.id, req.user.role, 'logout', req.ip]
  );
  res.json({ success: true });
});

// Vérifier le token
app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// ==================== Routes protégées (tous utilisateurs) ====================
app.use('/api', authenticateToken);

// --- Tirages (état actif) ---
app.get('/api/draws', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, time, active FROM draws ORDER BY name');
    res.json({ draws: result.rows });
  } catch (error) {
    console.error('❌ Erreur récupération tirages:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// --- Numéros bloqués globaux ---
app.get('/api/blocked-numbers/global', async (req, res) => {
  try {
    const result = await pool.query('SELECT number FROM blocked_numbers');
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (error) {
    console.error('❌ Erreur numéros bloqués globaux:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// --- Numéros bloqués par tirage ---
app.get('/api/blocked-numbers/draw/:drawId', async (req, res) => {
  try {
    const { drawId } = req.params;
    const result = await pool.query('SELECT number FROM draw_blocked_numbers WHERE draw_id = $1', [drawId]);
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (error) {
    console.error('❌ Erreur numéros bloqués par tirage:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// --- Tickets ---
app.post('/api/tickets/save', async (req, res) => {
  try {
    const { agentId, agentName, drawId, drawName, bets, total } = req.body;
    if (!agentId || !drawId || !bets || !Array.isArray(bets)) {
      return res.status(400).json({ error: 'Données invalides' });
    }

    // Vérifier que l'agent correspond à l'utilisateur connecté (sauf si propriétaire)
    if (req.user.role === 'agent' && req.user.id != agentId) {
      return res.status(403).json({ error: 'Vous ne pouvez enregistrer que vos propres tickets' });
    }

    // Vérifier que le tirage est actif
    const drawCheck = await pool.query('SELECT active FROM draws WHERE id = $1', [drawId]);
    if (drawCheck.rows.length === 0 || !drawCheck.rows[0].active) {
      return res.status(400).json({ error: 'Ce tirage est bloqué par l\'administrateur.' });
    }

    // Récupérer les numéros bloqués
    const globalBlocked = await pool.query('SELECT number FROM blocked_numbers');
    const globalSet = new Set(globalBlocked.rows.map(r => r.number));
    const drawBlocked = await pool.query('SELECT number FROM draw_blocked_numbers WHERE draw_id = $1', [drawId]);
    const drawSet = new Set(drawBlocked.rows.map(r => r.number));

    // Vérifier chaque pari (numéros bloqués)
    for (const bet of bets) {
      let cleanNumber = bet.cleanNumber || bet.number;
      if (cleanNumber) {
        cleanNumber = cleanNumber.toString().replace(/[-&]/g, '');
        if (globalSet.has(cleanNumber) || drawSet.has(cleanNumber)) {
          return res.status(400).json({ error: `Le numéro ${cleanNumber} est bloqué et ne peut pas être joué.` });
        }
      }
    }

    // --- NOUVEAU : Vérification des limites ---
    const today = new Date().toISOString().split('T')[0];

    // Récupérer les limites définies pour ce tirage
    const limits = await pool.query(
      'SELECT number, limit_amount FROM draw_number_limits WHERE draw_id = $1',
      [drawId]
    );
    const limitMap = new Map(limits.rows.map(l => [l.number, l.limit_amount]));

    // Récupérer tous les tickets du jour pour ce tirage (sauf celui en cours)
    const existingTickets = await pool.query(
      `SELECT bets FROM tickets WHERE draw_id = $1 AND DATE(date) = $2`,
      [drawId, today]
    );

    // Agréger les montants déjà misés par numéro
    const dailyTotals = new Map();
    existingTickets.rows.forEach(row => {
      const ticketBets = typeof row.bets === 'string' ? JSON.parse(row.bets) : row.bets;
      ticketBets.forEach(b => {
        const num = b.cleanNumber || (b.number ? b.number.replace(/[-&]/g, '') : '');
        const amt = parseFloat(b.amount) || 0;
        if (num) dailyTotals.set(num, (dailyTotals.get(num) || 0) + amt);
      });
    });

    // Vérifier pour chaque pari du nouveau ticket
    for (const bet of bets) {
      let cleanNumber = bet.cleanNumber || bet.number;
      cleanNumber = cleanNumber ? cleanNumber.toString().replace(/[-&]/g, '') : '';
      if (!cleanNumber) continue;

      const limit = limitMap.get(cleanNumber);
      if (limit) {
        const currentTotal = dailyTotals.get(cleanNumber) || 0;
        const betAmount = parseFloat(bet.amount) || 0;
        if (currentTotal + betAmount > limit) {
          return res.status(400).json({
            error: `Limite dépassée pour le numéro ${cleanNumber} : maximum ${limit} G, déjà ${currentTotal} G`
          });
        }
      }
      // Ajouter ce pari au total quotidien pour les prochaines vérifications (optionnel)
      dailyTotals.set(cleanNumber, (dailyTotals.get(cleanNumber) || 0) + (parseFloat(bet.amount) || 0));
    }

    // Générer un ID de ticket
    const ticketId = `T${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const betsJson = JSON.stringify(bets);
    const totalAmount = parseFloat(total) || 0;

    const result = await pool.query(
      `INSERT INTO tickets (ticket_id, agent_id, agent_name, draw_id, draw_name, bets, total_amount, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [ticketId, agentId, agentName, drawId, drawName, betsJson, totalAmount]
    );

    res.json({ success: true, ticket: result.rows[0] });
  } catch (error) {
    console.error('❌ Erreur sauvegarde ticket:', error);
    res.status(500).json({ error: 'Erreur serveur' });
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
    // Si c'est un agent, on filtre automatiquement sur son ID
    if (req.user.role === 'agent') {
      params.push(req.user.id);
      query += ` AND agent_id = $${params.length}`;
    }
    query += ' ORDER BY date DESC LIMIT 50';
    const result = await pool.query(query, params);
    const tickets = result.rows.map(t => ({
      ...t,
      bets: typeof t.bets === 'string' ? JSON.parse(t.bets) : t.bets
    }));
    res.json({ tickets });
  } catch (error) {
    console.error('❌ Erreur récupération tickets:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/tickets/:ticketId', authenticateToken, authorize('supervisor', 'owner'), async (req, res) => {
  try {
    const { ticketId } = req.params;
    // Vérifier que le ticket a moins de 10 minutes
    const ticket = await pool.query('SELECT date FROM tickets WHERE id = $1', [ticketId]);
    if (ticket.rows.length === 0) return res.status(404).json({ error: 'Ticket non trouvé' });
    const diffMinutes = moment().diff(moment(ticket.rows[0].date), 'minutes');
    if (diffMinutes > 10) {
      return res.status(403).json({ error: 'Suppression impossible après 10 minutes' });
    }
    await pool.query('DELETE FROM tickets WHERE id = $1', [ticketId]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur suppression ticket:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// --- Winners et résultats ---
app.get('/api/winners', async (req, res) => {
  try {
    const { agentId } = req.query;
    let query = 'SELECT * FROM tickets WHERE win_amount > 0';
    const params = [];
    if (agentId) {
      params.push(agentId);
      query += ` AND agent_id = $${params.length}`;
    }
    if (req.user.role === 'agent') {
      params.push(req.user.id);
      query += ` AND agent_id = $${params.length}`;
    }
    query += ' ORDER BY date DESC LIMIT 20';
    const result = await pool.query(query, params);
    res.json({ winners: result.rows });
  } catch (error) {
    console.error('❌ Erreur gagnants:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/winners/results', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM draw_results ORDER BY published_at DESC LIMIT 10'
    );
    const results = result.rows.map(r => ({
      ...r,
      numbers: typeof r.results === 'string' ? JSON.parse(r.results) : r.results
    }));
    res.json({ results });
  } catch (error) {
    console.error('❌ Erreur résultats:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/tickets/check-winners', async (req, res) => {
  try {
    const { agentId } = req.query;
    let query = 'SELECT * FROM tickets WHERE win_amount > 0 AND checked = false';
    const params = [];
    if (agentId) {
      params.push(agentId);
      query += ` AND agent_id = $${params.length}`;
    }
    const result = await pool.query(query, params);
    for (const ticket of result.rows) {
      await pool.query('UPDATE tickets SET checked = true WHERE id = $1', [ticket.id]);
    }
    res.json({ success: true, count: result.rows.length, tickets: result.rows });
  } catch (error) {
    console.error('❌ Erreur vérification:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// --- Configuration loterie ---
app.get('/api/lottery-config', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM lottery_config LIMIT 1');
    if (result.rows.length) res.json(result.rows[0]);
    else res.json({ name: 'LOTATO PRO', logo: '', address: '', phone: '' });
  } catch (error) {
    console.error('❌ Erreur config:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/lottery-config', authenticateToken, authorize('owner'), async (req, res) => {
  try {
    const { name, logo, address, phone } = req.body;
    const check = await pool.query('SELECT id FROM lottery_config LIMIT 1');
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
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur sauvegarde config:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// --- Numéros bloqués (globaux) - déjà existant mais on le garde pour compatibilité
app.get('/api/blocked-numbers', async (req, res) => {
  try {
    const result = await pool.query('SELECT number FROM blocked_numbers');
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (error) {
    console.error('❌ Erreur numéros bloqués:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// --- Rapports simples pour agent ---
app.get('/api/reports', async (req, res) => {
  try {
    const { agentId } = req.query;
    if (!agentId && req.user.role === 'agent') {
      // Si c'est un agent, on prend son ID
      agentId = req.user.id;
    }
    if (!agentId) return res.status(400).json({ error: 'Agent ID requis' });

    const todayStats = await pool.query(
      `SELECT 
         COUNT(*) as total_tickets,
         COALESCE(SUM(total_amount), 0) as total_bets,
         COALESCE(SUM(win_amount), 0) as total_wins,
         COALESCE(SUM(total_amount) - SUM(win_amount), 0) as total_loss,
         COALESCE(SUM(win_amount) - SUM(total_amount), 0) as balance
       FROM tickets 
       WHERE agent_id = $1 AND DATE(date) = CURRENT_DATE`,
      [agentId]
    );
    res.json(todayStats.rows[0]);
  } catch (error) {
    console.error('❌ Erreur rapports:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/reports/draw', async (req, res) => {
  try {
    const { agentId, drawId } = req.query;
    if (!agentId || !drawId) return res.status(400).json({ error: 'Agent ID et Draw ID requis' });
    const stats = await pool.query(
      `SELECT 
         COUNT(*) as total_tickets,
         COALESCE(SUM(total_amount), 0) as total_bets,
         COALESCE(SUM(win_amount), 0) as total_wins,
         COALESCE(SUM(total_amount) - SUM(win_amount), 0) as total_loss,
         COALESCE(SUM(win_amount) - SUM(total_amount), 0) as balance
       FROM tickets 
       WHERE agent_id = $1 AND draw_id = $2 AND DATE(date) = CURRENT_DATE`,
      [agentId, drawId]
    );
    res.json(stats.rows[0]);
  } catch (error) {
    console.error('❌ Erreur rapport tirage:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== Routes superviseur ====================
const supervisorRouter = express.Router();
supervisorRouter.use(authorize('supervisor'));

// Stats globales pour les agents du superviseur
supervisorRouter.get('/reports/overall', async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const result = await pool.query(
      `SELECT 
         COUNT(DISTINCT t.id) as total_tickets,
         COALESCE(SUM(t.total_amount), 0) as total_bets,
         COALESCE(SUM(t.win_amount), 0) as total_wins,
         COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as balance
       FROM tickets t
       JOIN agents a ON t.agent_id = a.id
       WHERE a.supervisor_id = $1 AND DATE(t.date) = CURRENT_DATE`,
      [supervisorId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Erreur stats superviseur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Liste des agents du superviseur avec leurs stats du jour
supervisorRouter.get('/agents', async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const agents = await pool.query(
      `SELECT a.id, a.name, a.email, a.phone, a.active as blocked,
              COALESCE(SUM(t.total_amount), 0) as total_bets,
              COALESCE(SUM(t.win_amount), 0) as total_wins,
              COUNT(t.id) as total_tickets,
              COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as balance
       FROM agents a
       LEFT JOIN tickets t ON a.id = t.agent_id AND DATE(t.date) = CURRENT_DATE
       WHERE a.supervisor_id = $1
       GROUP BY a.id, a.name, a.email, a.phone, a.active`,
      [supervisorId]
    );
    res.json(agents.rows);
  } catch (error) {
    console.error('❌ Erreur liste agents superviseur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Bloquer / débloquer un agent
supervisorRouter.post('/block-agent/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    // Vérifier que l'agent appartient bien à ce superviseur
    const check = await pool.query(
      'SELECT id FROM agents WHERE id = $1 AND supervisor_id = $2',
      [agentId, req.user.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Agent non trouvé ou non autorisé' });
    }
    await pool.query('UPDATE agents SET active = false WHERE id = $1', [agentId]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur blocage agent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

supervisorRouter.post('/unblock-agent/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const check = await pool.query(
      'SELECT id FROM agents WHERE id = $1 AND supervisor_id = $2',
      [agentId, req.user.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Agent non trouvé ou non autorisé' });
    }
    await pool.query('UPDATE agents SET active = true WHERE id = $1', [agentId]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur déblocage agent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Tickets récents d'un agent (moins de 10 minutes)
supervisorRouter.get('/tickets/recent', async (req, res) => {
  try {
    const { agentId } = req.query;
    if (!agentId) return res.status(400).json({ error: 'Agent ID requis' });
    // Vérifier que l'agent appartient au superviseur
    const check = await pool.query(
      'SELECT id FROM agents WHERE id = $1 AND supervisor_id = $2',
      [agentId, req.user.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Agent non trouvé ou non autorisé' });
    }
    const tenMinutesAgo = moment().subtract(10, 'minutes').toDate();
    const tickets = await pool.query(
      'SELECT * FROM tickets WHERE agent_id = $1 AND date > $2 ORDER BY date DESC',
      [agentId, tenMinutesAgo]
    );
    res.json(tickets.rows);
  } catch (error) {
    console.error('❌ Erreur tickets récents:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer un ticket (si <10 min) – déjà fait dans la route générale /api/tickets/:ticketId
// On peut utiliser la même route avec le rôle superviseur autorisé.

app.use('/api/supervisor', supervisorRouter);

// ==================== Routes propriétaire ====================
const ownerRouter = express.Router();
ownerRouter.use(authorize('owner'));

// Tableau de bord
ownerRouter.get('/dashboard', async (req, res) => {
  try {
    // Connexions simulées (on prend les utilisateurs actifs avec une activité récente)
    // Idéalement, on utiliserait une table de sessions, ici on simplifie
    const connectedSupervisors = await pool.query(
      `SELECT id, name, email FROM supervisors WHERE active = true LIMIT 5`
    );
    const connectedAgents = await pool.query(
      `SELECT id, name, email FROM agents WHERE active = true LIMIT 5`
    );

    // Ventes du jour
    const salesToday = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) as total FROM tickets WHERE DATE(date) = CURRENT_DATE`
    );

    // Progression des limites (exemple avec draw_number_limits)
    const limitsProgress = await pool.query(
      `SELECT d.name as draw_name, l.number, l.limit_amount,
              COALESCE(SUM(t.total_amount), 0) as current_bets,
              (COALESCE(SUM(t.total_amount), 0) / l.limit_amount * 100) as progress_percent
       FROM draw_number_limits l
       JOIN draws d ON l.draw_id = d.id
       LEFT JOIN tickets t ON t.draw_id = l.draw_id AND t.bets::text LIKE '%'||l.number||'%' AND DATE(t.date) = CURRENT_DATE
       GROUP BY d.name, l.number, l.limit_amount
       ORDER BY progress_percent DESC`
    );

    // Agents gains/pertes du jour
    const agentsGainLoss = await pool.query(
      `SELECT a.id, a.name,
              COALESCE(SUM(t.total_amount), 0) as total_bets,
              COALESCE(SUM(t.win_amount), 0) as total_wins,
              COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as net_result
       FROM agents a
       LEFT JOIN tickets t ON a.id = t.agent_id AND DATE(t.date) = CURRENT_DATE
       GROUP BY a.id, a.name
       HAVING COALESCE(SUM(t.total_amount), 0) > 0 OR COALESCE(SUM(t.win_amount), 0) > 0
       ORDER BY net_result DESC`
    );

    res.json({
      connected: {
        supervisors_count: connectedSupervisors.rows.length,
        supervisors: connectedSupervisors.rows,
        agents_count: connectedAgents.rows.length,
        agents: connectedAgents.rows
      },
      sales_today: parseFloat(salesToday.rows[0].total),
      limits_progress: limitsProgress.rows,
      agents_gain_loss: agentsGainLoss.rows
    });
  } catch (error) {
    console.error('❌ Erreur dashboard owner:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Liste des superviseurs
ownerRouter.get('/supervisors', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, phone, active as blocked FROM supervisors ORDER BY name'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erreur superviseurs:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Liste des agents
ownerRouter.get('/agents', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.id, a.name, a.email, a.phone, a.active as blocked,
              s.name as supervisor_name, a.supervisor_id
       FROM agents a
       LEFT JOIN supervisors s ON a.supervisor_id = s.id
       ORDER BY a.name`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erreur agents:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer un utilisateur (agent ou superviseur)
ownerRouter.post('/create-user', async (req, res) => {
  try {
    const { name, cin, username, password, role, supervisorId, zone } = req.body;
    if (!name || !username || !password || !role) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    let result;

    if (role === 'supervisor') {
      result = await pool.query(
        `INSERT INTO supervisors (name, email, password, phone, active)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id`,
        [name, username, hashedPassword, cin || '']
      );
    } else if (role === 'agent') {
      result = await pool.query(
        `INSERT INTO agents (name, email, password, phone, supervisor_id, location, active)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         RETURNING id`,
        [name, username, hashedPassword, cin || '', supervisorId || null, zone || '']
      );
    } else {
      return res.status(400).json({ error: 'Rôle invalide' });
    }

    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error('❌ Erreur création utilisateur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Bloquer / débloquer un utilisateur
ownerRouter.post('/block-user', async (req, res) => {
  try {
    const { userId, type } = req.body; // type = 'agent' ou 'supervisor'
    if (!userId || !type) return res.status(400).json({ error: 'Paramètres manquants' });
    const table = type === 'agent' ? 'agents' : 'supervisors';
    // On alterne le statut actif
    const current = await pool.query(`SELECT active FROM ${table} WHERE id = $1`, [userId]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    const newStatus = !current.rows[0].active;
    await pool.query(`UPDATE ${table} SET active = $1 WHERE id = $2`, [newStatus, userId]);
    res.json({ success: true, blocked: !newStatus });
  } catch (error) {
    console.error('❌ Erreur blocage utilisateur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Changer le superviseur d'un agent
ownerRouter.put('/change-supervisor', async (req, res) => {
  try {
    const { agentId, supervisorId } = req.body; // supervisorId peut être null (libre)
    if (!agentId) return res.status(400).json({ error: 'Agent ID requis' });
    await pool.query(
      'UPDATE agents SET supervisor_id = $1 WHERE id = $2',
      [supervisorId || null, agentId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur changement superviseur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Liste des tirages
ownerRouter.get('/draws', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM draws ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erreur tirages:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== NOUVELLE FONCTION : Calcul des gagnants ====================
async function calculateWinnersForDraw(drawId, results) {
  // results = [lot1, lot2, lot3] (ex: ['123','45','67'])
  const tickets = await pool.query(
    'SELECT * FROM tickets WHERE draw_id = $1 AND (checked = false OR win_amount = 0)',
    [drawId]
  );

  for (const ticket of tickets.rows) {
    const bets = typeof ticket.bets === 'string' ? JSON.parse(ticket.bets) : ticket.bets;
    let totalWin = 0;

    for (const bet of bets) {
      const cleanNum = bet.cleanNumber || (bet.number ? bet.number.replace(/[-&]/g, '') : '');
      const amount = parseFloat(bet.amount) || 0;
      const game = bet.game || '';

      // Règles simplifiées (à adapter selon vos règles exactes)
      if (game === 'borlette') {
        if (cleanNum === results[1] || cleanNum === results[2]) {
          totalWin += amount * GAMING_RULES.BORLETTE.lot2; // 20 pour lot2
        }
      } else if (game === 'lotto3') {
        if (cleanNum === results[0]) {
          totalWin += amount * GAMING_RULES.LOTTO3;
        }
      } else if (game === 'lotto4') {
        // À implémenter selon les options
      } else if (game === 'lotto5') {
        // ...
      } else if (game === 'mariage') {
        // mariage : deux borlettes, gagne si les deux sortent dans lot2 et lot3 ?
      }
      // Ajouter les jeux spéciaux (auto_marriage, auto_lotto4, etc.)
    }

    // Mettre à jour le ticket
    await pool.query(
      'UPDATE tickets SET win_amount = $1, checked = true WHERE id = $2',
      [totalWin, ticket.id]
    );
  }
}

// --- Publier les résultats d'un tirage (modifié) ---
ownerRouter.post('/publish-results', async (req, res) => {
  try {
    const { drawId, numbers } = req.body; // numbers = [lot1, lot2, lot3]
    if (!drawId || !numbers || !Array.isArray(numbers) || numbers.length !== 3) {
      return res.status(400).json({ error: 'Données invalides' });
    }
    // Récupérer le nom du tirage
    const draw = await pool.query('SELECT name FROM draws WHERE id = $1', [drawId]);
    if (draw.rows.length === 0) return res.status(404).json({ error: 'Tirage non trouvé' });

    await pool.query(
      `INSERT INTO draw_results (draw_id, name, results, draw_time, published_at)
       VALUES ($1, $2, $3, NOW(), NOW())`,
      [drawId, draw.rows[0].name, JSON.stringify(numbers)]
    );

    // Mettre à jour last_draw dans draws
    await pool.query('UPDATE draws SET last_draw = NOW() WHERE id = $1', [drawId]);

    // === NOUVEAU : Calculer les gagnants pour ce tirage ===
    await calculateWinnersForDraw(drawId, numbers);

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur publication résultats:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Bloquer / débloquer un tirage
ownerRouter.post('/block-draw', async (req, res) => {
  try {
    const { drawId, block } = req.body;
    if (!drawId) return res.status(400).json({ error: 'drawId requis' });
    await pool.query('UPDATE draws SET active = $1 WHERE id = $2', [!block, drawId]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur blocage tirage:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Numéros globalement bloqués (GET déjà fait plus haut)

// Bloquer un numéro globalement
ownerRouter.post('/block-number', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ error: 'Numéro requis' });
    await pool.query(
      'INSERT INTO blocked_numbers (number) VALUES ($1) ON CONFLICT DO NOTHING',
      [number]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur blocage numéro:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.post('/unblock-number', async (req, res) => {
  try {
    const { number } = req.body;
    await pool.query('DELETE FROM blocked_numbers WHERE number = $1', [number]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur déblocage numéro:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Bloquer un numéro pour un tirage spécifique
ownerRouter.post('/block-number-draw', async (req, res) => {
  try {
    const { drawId, number } = req.body;
    if (!drawId || !number) return res.status(400).json({ error: 'drawId et number requis' });
    await pool.query(
      'INSERT INTO draw_blocked_numbers (draw_id, number) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [drawId, number]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur blocage numéro par tirage:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.post('/unblock-number-draw', async (req, res) => {
  try {
    const { drawId, number } = req.body;
    await pool.query(
      'DELETE FROM draw_blocked_numbers WHERE draw_id = $1 AND number = $2',
      [drawId, number]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur déblocage numéro par tirage:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Définir une limite pour un numéro sur un tirage
ownerRouter.post('/number-limit', async (req, res) => {
  try {
    const { drawId, number, limitAmount } = req.body;
    if (!drawId || !number || !limitAmount) {
      return res.status(400).json({ error: 'drawId, number et limitAmount requis' });
    }
    await pool.query(
      `INSERT INTO draw_number_limits (draw_id, number, limit_amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (draw_id, number) DO UPDATE SET limit_amount = $3, updated_at = NOW()`,
      [drawId, number, limitAmount]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur définition limite:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Rapports avec filtres
ownerRouter.get('/reports', async (req, res) => {
  try {
    const { supervisorId, agentId, drawId, period, fromDate, toDate, gainLoss } = req.query;

    // Construire les conditions WHERE dynamiquement
    let conditions = [];
    let params = [];
    let paramIndex = 1;

    if (agentId && agentId !== 'all') {
      conditions.push(`t.agent_id = $${paramIndex++}`);
      params.push(agentId);
    } else if (supervisorId && supervisorId !== 'all') {
      // Filtrer par superviseur : agents dont le supervisor_id = supervisorId
      conditions.push(`a.supervisor_id = $${paramIndex++}`);
      params.push(supervisorId);
    }

    if (drawId && drawId !== 'all') {
      conditions.push(`t.draw_id = $${paramIndex++}`);
      params.push(drawId);
    }

    // Période
    let dateCondition = '';
    if (period === 'today') {
      dateCondition = 'DATE(t.date) = CURRENT_DATE';
    } else if (period === 'yesterday') {
      dateCondition = 'DATE(t.date) = CURRENT_DATE - INTERVAL \'1 day\'';
    } else if (period === 'week') {
      dateCondition = 't.date >= DATE_TRUNC(\'week\', CURRENT_DATE)';
    } else if (period === 'month') {
      dateCondition = 't.date >= DATE_TRUNC(\'month\', CURRENT_DATE)';
    } else if (period === 'custom' && fromDate && toDate) {
      dateCondition = `DATE(t.date) BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      params.push(fromDate, toDate);
    }
    if (dateCondition) {
      conditions.push(dateCondition);
    }

    // Gain / Perte
    if (gainLoss === 'gain') {
      conditions.push('t.win_amount > t.total_amount');
    } else if (gainLoss === 'loss') {
      conditions.push('t.win_amount < t.total_amount');
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Requête de résumé
    const summaryQuery = `
      SELECT 
        COUNT(DISTINCT t.id) as totalTickets,
        COALESCE(SUM(t.total_amount), 0) as totalBets,
        COALESCE(SUM(t.win_amount), 0) as totalWins,
        COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as netResult,
        COUNT(DISTINCT CASE WHEN t.win_amount > t.total_amount THEN t.agent_id END) as gainCount,
        COUNT(DISTINCT CASE WHEN t.win_amount < t.total_amount THEN t.agent_id END) as lossCount
      FROM tickets t
      LEFT JOIN agents a ON t.agent_id = a.id
      ${whereClause}
    `;

    const summary = await pool.query(summaryQuery, params);

    // Requête de détail (par agent ou par tirage)
    let detailQuery = '';
    let groupBy = '';
    if (drawId && drawId !== 'all') {
      // Détail par agent pour ce tirage
      detailQuery = `
        SELECT a.name as agent_name, a.id as agent_id,
               COUNT(t.id) as tickets,
               COALESCE(SUM(t.total_amount), 0) as bets,
               COALESCE(SUM(t.win_amount), 0) as wins,
               COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as result
        FROM tickets t
        JOIN agents a ON t.agent_id = a.id
        ${whereClause}
        GROUP BY a.id, a.name
        ORDER BY result DESC
      `;
    } else {
      // Détail par tirage
      detailQuery = `
        SELECT d.name as draw_name, d.id as draw_id,
               COUNT(t.id) as tickets,
               COALESCE(SUM(t.total_amount), 0) as bets,
               COALESCE(SUM(t.win_amount), 0) as wins,
               COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as result
        FROM tickets t
        JOIN draws d ON t.draw_id = d.id
        ${whereClause}
        GROUP BY d.id, d.name
        ORDER BY result DESC
      `;
    }

    const detail = await pool.query(detailQuery, params);

    res.json({
      summary: summary.rows[0],
      detail: detail.rows
    });
  } catch (error) {
    console.error('❌ Erreur rapport owner:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.use('/api/owner', ownerRouter);

// ==================== Routes statiques ====================
app.use(express.static(__dirname));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/agent1.html', (req, res) => res.sendFile(path.join(__dirname, 'agent1.html')));
app.get('/responsable.html', (req, res) => res.sendFile(path.join(__dirname, 'responsable.html')));
app.get('/owner.html', (req, res) => res.sendFile(path.join(__dirname, 'owner.html')));

// 404 API
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Route API non trouvée' });
});

// 404 général
app.use('*', (req, res) => {
  res.status(404).send('Page non trouvée');
});

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error('🔥 Erreur serveur:', err.stack);
  res.status(500).json({ error: 'Erreur serveur interne', message: err.message });
});

// Démarrage
initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur LOTATO démarré sur http://0.0.0.0:${PORT}`);
  });
});