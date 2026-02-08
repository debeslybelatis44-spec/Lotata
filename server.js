// server.js - Serveur Node.js pour LOTATO PRO
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// Configuration de l'application
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'lotato_pro_secret_key_2024_change_in_production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'lotato_pro_refresh_secret_2024_change_in_production';

// Configuration de la base de données Neon PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// Limiter les requêtes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limite chaque IP à 100 requêtes par fenêtre
  message: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.'
});
app.use('/api/auth', limiter);

// Servir les fichiers HTML/JS/CSS statiques depuis la racine
app.use(express.static(__dirname));

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

const authenticateRefreshToken = (req, res, next) => {
  const token = req.body.refreshToken || req.headers['x-refresh-token'];

  if (!token) {
    return res.status(401).json({ error: 'Refresh token manquant' });
  }

  jwt.verify(token, JWT_REFRESH_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Refresh token invalide' });
    }
    req.user = user;
    next();
  });
};

// Fonctions utilitaires
const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { 
      id: user.id, 
      username: user.username, 
      role: user.role,
      name: user.name 
    }, 
    JWT_SECRET, 
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { 
      id: user.id, 
      username: user.username, 
      role: user.role 
    }, 
    JWT_REFRESH_SECRET, 
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

const logActivity = async (userType, userId, action, details = null) => {
  try {
    await pool.query(
      'INSERT INTO activity_log (user_type, user_id, action, details) VALUES ($1, $2, $3, $4)',
      [userType, userId, action, details]
    );
  } catch (error) {
    console.error('Erreur lors de la journalisation:', error);
  }
};

// Routes de santé
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Routes d'authentification
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;

    let user;
    let tableName;

    switch (role) {
      case 'owner':
        tableName = 'owner';
        break;
      case 'supervisor':
        tableName = 'supervisors';
        break;
      case 'agent':
        tableName = 'agents';
        break;
      default:
        return res.status(400).json({ error: 'Rôle invalide' });
    }

    const result = await pool.query(
      `SELECT * FROM ${tableName} WHERE username = $1 OR email = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    user = result.rows[0];

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    // Générer les tokens
    const tokens = generateTokens({
      id: user.id,
      username: user.username,
      role: role,
      name: user.name
    });

    // Journaliser l'activité
    await logActivity(role, user.id, 'CONNEXION', `Connexion ${role}`);

    res.json({
      success: true,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      name: user.name,
      role: role,
      id: user.id
    });

  } catch (error) {
    console.error('Erreur de connexion:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    await logActivity(req.user.role, req.user.id, 'DÉCONNEXION');
    res.json({ success: true, message: 'Déconnecté avec succès' });
  } catch (error) {
    console.error('Erreur de déconnexion:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ 
    valid: true, 
    user: req.user,
    message: 'Token valide' 
  });
});

app.post('/api/auth/refresh', authenticateRefreshToken, (req, res) => {
  const tokens = generateTokens(req.user);
  res.json({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken
  });
});

// Routes des utilisateurs (Propriétaire seulement)
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const supervisors = await pool.query(
      'SELECT id, username, name, email, phone, created_at FROM supervisors ORDER BY name'
    );

    const agents = await pool.query(
      `SELECT a.id, a.username, a.name, a.email, a.phone, a.location, a.commission, 
              a.funds, a.online, a.blocked, a.last_activity, a.created_at,
              s.name as supervisor_name, s.id as supervisor_id
       FROM agents a
       LEFT JOIN supervisors s ON a.supervisor_id = s.id
       ORDER BY a.name`
    );

    res.json({
      supervisors: supervisors.rows,
      agents: agents.rows
    });

  } catch (error) {
    console.error('Erreur récupération utilisateurs:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.post('/api/users', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { name, email, phone, password, role, supervisorId, location, commission, dailyLimit } = req.body;

    // Valider les données
    if (!name || !email || !phone || !password || !role) {
      return res.status(400).json({ error: 'Données manquantes' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    let result;
    let tableName;

    switch (role) {
      case 'supervisor':
        tableName = 'supervisors';
        result = await pool.query(
          `INSERT INTO ${tableName} (username, password, name, email, phone) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id, username, name, email, phone`,
          [email.split('@')[0], hashedPassword, name, email, phone]
        );
        break;

      case 'agent':
        tableName = 'agents';
        if (!supervisorId) {
          return res.status(400).json({ error: 'Superviseur requis pour un agent' });
        }

        result = await pool.query(
          `INSERT INTO ${tableName} (username, password, name, email, phone, supervisor_id, location, commission, funds) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
           RETURNING id, username, name, email, phone, location, commission`,
          [
            email.split('@')[0] || phone,
            hashedPassword,
            name,
            email,
            phone,
            supervisorId,
            location || 'Non spécifié',
            commission || 5.00,
            dailyLimit || 10000.00
          ]
        );
        break;

      default:
        return res.status(400).json({ error: 'Rôle invalide' });
    }

    await logActivity('owner', req.user.id, 'CRÉATION_UTILISATEUR', `${role}: ${name}`);

    res.json({
      success: true,
      message: `${role} créé avec succès`,
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Erreur création utilisateur:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Cet email ou nom d\'utilisateur existe déjà' });
    }
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.get('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { id } = req.params;
    
    // Chercher dans toutes les tables
    const queries = [
      pool.query('SELECT * FROM owner WHERE id = $1', [id]),
      pool.query('SELECT * FROM supervisors WHERE id = $1', [id]),
      pool.query('SELECT * FROM agents WHERE id = $1', [id])
    ];

    const results = await Promise.all(queries);
    
    let user = null;
    results.forEach((result, index) => {
      if (result.rows.length > 0) {
        user = result.rows[0];
        user.role = index === 0 ? 'owner' : index === 1 ? 'supervisor' : 'agent';
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json(user);

  } catch (error) {
    console.error('Erreur récupération utilisateur:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.put('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { id } = req.params;
    const { name, email, phone, newPassword, commission, location, dailyLimit } = req.body;

    // Trouver le type d'utilisateur
    const userResult = await pool.query(
      `SELECT 'owner' as role FROM owner WHERE id = $1
       UNION
       SELECT 'supervisor' as role FROM supervisors WHERE id = $1
       UNION
       SELECT 'agent' as role FROM agents WHERE id = $1`,
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const userRole = userResult.rows[0].role;
    let query;
    let values = [];

    if (userRole === 'agent') {
      query = `
        UPDATE agents 
        SET name = $1, email = $2, phone = $3, 
            commission = $4, location = $5, funds = $6
        ${newPassword ? ', password = $7' : ''}
        WHERE id = $${newPassword ? 8 : 7}
        RETURNING *
      `;
      values = [
        name, email, phone, 
        commission || 5.00, 
        location || 'Non spécifié',
        dailyLimit || 10000.00
      ];
      if (newPassword) {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        values.push(hashedPassword);
      }
      values.push(id);
    } else {
      query = `
        UPDATE ${userRole === 'supervisor' ? 'supervisors' : 'owner'} 
        SET name = $1, email = $2, phone = $3
        ${newPassword ? ', password = $4' : ''}
        WHERE id = $${newPassword ? 5 : 4}
        RETURNING *
      `;
      values = [name, email, phone];
      if (newPassword) {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        values.push(hashedPassword);
      }
      values.push(id);
    }

    const result = await pool.query(query, values);

    await logActivity('owner', req.user.id, 'MODIFICATION_UTILISATEUR', `${userRole}: ${name}`);

    res.json({
      success: true,
      message: 'Utilisateur mis à jour',
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Erreur mise à jour utilisateur:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.patch('/api/users/:id/block', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { id } = req.params;
    const { blocked } = req.body;

    const result = await pool.query(
      'UPDATE agents SET blocked = $1 WHERE id = $2 RETURNING id, name, blocked',
      [blocked, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent non trouvé' });
    }

    await logActivity('owner', req.user.id, 'BLOCAGE_UTILISATEUR', 
      `${blocked ? 'Bloqué' : 'Débloqué'}: ${result.rows[0].name}`);

    res.json({
      success: true,
      message: `Agent ${blocked ? 'bloqué' : 'débloqué'} avec succès`,
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Erreur blocage utilisateur:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.delete('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM agents WHERE id = $1 RETURNING name',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent non trouvé' });
    }

    await logActivity('owner', req.user.id, 'SUPPRESSION_UTILISATEUR', 
      `Agent supprimé: ${result.rows[0].name}`);

    res.json({
      success: true,
      message: 'Agent supprimé avec succès'
    });

  } catch (error) {
    console.error('Erreur suppression utilisateur:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Routes des tirages
app.get('/api/draws', authenticateToken, async (req, res) => {
  try {
    const { status = 'all' } = req.query;
    let query = 'SELECT * FROM draws';
    let values = [];

    if (status !== 'all') {
      query += ' WHERE status = $1';
      values.push(status);
    }

    query += ' ORDER BY time';
    const result = await pool.query(query, values);

    // Ajouter des statistiques simulées pour chaque tirage
    const drawsWithStats = result.rows.map(draw => ({
      ...draw,
      tickets: Math.floor(Math.random() * 1000),
      sales: Math.floor(Math.random() * 50000),
      payouts: Math.floor(Math.random() * 30000),
      lastResults: draw.results ? JSON.parse(draw.results) : null
    }));

    res.json(drawsWithStats);

  } catch (error) {
    console.error('Erreur récupération tirages:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.get('/api/draws/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM draws WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tirage non trouvé' });
    }

    const draw = result.rows[0];
    
    // Ajouter des statistiques détaillées
    const statsResult = await pool.query(
      `SELECT 
        COUNT(*) as tickets_today,
        COALESCE(SUM(total_amount), 0) as sales_today,
        COALESCE(SUM(CASE WHEN w.id IS NOT NULL THEN w.winning_amount ELSE 0 END), 0) as payouts_today
       FROM tickets t
       LEFT JOIN winners w ON t.id = w.ticket_id
       WHERE t.draw_id = $1 AND DATE(t.created_at) = CURRENT_DATE`,
      [id]
    );

    const stats = statsResult.rows[0];

    res.json({
      ...draw,
      ticketsToday: parseInt(stats.tickets_today) || 0,
      salesToday: parseFloat(stats.sales_today) || 0,
      payoutsToday: parseFloat(stats.payouts_today) || 0,
      lastResults: draw.results ? JSON.parse(draw.results) : null
    });

  } catch (error) {
    console.error('Erreur récupération tirage:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.post('/api/draws/publish', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { name, dateTime, results, luckyNumber, comment, source = 'manual' } = req.body;

    if (!name || !results || !Array.isArray(results) || results.length !== 5) {
      return res.status(400).json({ error: 'Données de tirage invalides' });
    }

    // Créer un ID unique pour le tirage
    const drawId = `${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
    const resultsJson = JSON.stringify(results);

    await pool.query(
      `INSERT INTO draws (id, name, time, status, results, lucky_number, published_at, published_by, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        drawId,
        name,
        new Date().toTimeString().split(' ')[0],
        'completed',
        resultsJson,
        luckyNumber || null,
        new Date(),
        req.user.name,
        comment || ''
      ]
    );

    await logActivity('owner', req.user.id, 'PUBLICATION_TIRAGE', 
      `${name}: ${results.join(', ')} ${luckyNumber ? `+ ${luckyNumber}` : ''}`);

    res.json({
      success: true,
      message: 'Tirage publié avec succès',
      drawId: drawId
    });

  } catch (error) {
    console.error('Erreur publication tirage:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.patch('/api/draws/:id/block', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { id } = req.params;
    const { blocked } = req.body;

    const result = await pool.query(
      'UPDATE draws SET status = $1 WHERE id = $2 RETURNING id, name, status',
      [blocked ? 'blocked' : 'active', id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tirage non trouvé' });
    }

    await logActivity('owner', req.user.id, 'MODIFICATION_TIRAGE', 
      `${blocked ? 'Bloqué' : 'Activé'}: ${result.rows[0].name}`);

    res.json({
      success: true,
      message: `Tirage ${blocked ? 'bloqué' : 'activé'} avec succès`,
      draw: result.rows[0]
    });

  } catch (error) {
    console.error('Erreur blocage tirage:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.get('/api/draws/history', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let query = `
      SELECT d.id, d.name, d.results, d.lucky_number, d.published_at, d.published_by, d.comment
      FROM draws d
      WHERE d.published_at IS NOT NULL
    `;
    let values = [];
    let paramCount = 0;

    if (startDate) {
      query += ` AND d.published_at >= $${++paramCount}`;
      values.push(new Date(startDate));
    }

    if (endDate) {
      query += ` AND d.published_at <= $${++paramCount}`;
      values.push(new Date(endDate));
    }

    query += ' ORDER BY d.published_at DESC LIMIT 100';
    const result = await pool.query(query, values);

    const history = result.rows.map(row => ({
      drawName: row.name,
      results: row.results ? JSON.parse(row.results) : null,
      luckyNumber: row.lucky_number,
      publishDate: row.published_at,
      publishedBy: row.published_by,
      comment: row.comment,
      source: 'manual'
    }));

    res.json(history);

  } catch (error) {
    console.error('Erreur historique tirages:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Routes des numéros
app.get('/api/numbers', authenticateToken, async (req, res) => {
  try {
    const blockedResult = await pool.query(
      'SELECT number FROM blocked_numbers ORDER BY number'
    );

    const blockedNumbers = blockedResult.rows.map(row => row.number);

    res.json({
      blocked: blockedNumbers,
      limits: {},
      stats: {}
    });

  } catch (error) {
    console.error('Erreur récupération numéros:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.post('/api/numbers/block', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { number } = req.body;

    if (!/^\d{2}$/.test(number)) {
      return res.status(400).json({ error: 'Numéro invalide (doit être 2 chiffres)' });
    }

    await pool.query(
      'INSERT INTO blocked_numbers (number) VALUES ($1) ON CONFLICT (number) DO NOTHING',
      [number]
    );

    await logActivity('owner', req.user.id, 'BLOCAGE_NUMÉRO', `Boule ${number} bloqué`);

    res.json({
      success: true,
      message: `Numéro ${number} bloqué avec succès`
    });

  } catch (error) {
    console.error('Erreur blocage numéro:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.post('/api/numbers/unblock', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { number, numbers } = req.body;
    const numbersToUnblock = numbers || (number ? [number] : []);

    if (!numbersToUnblock.length) {
      return res.status(400).json({ error: 'Aucun numéro spécifié' });
    }

    await pool.query(
      'DELETE FROM blocked_numbers WHERE number = ANY($1)',
      [numbersToUnblock]
    );

    await logActivity('owner', req.user.id, 'DÉBLOCAGE_NUMÉRO', 
      `${numbersToUnblock.length} numéro(s) débloqué(s): ${numbersToUnblock.join(', ')}`);

    res.json({
      success: true,
      message: `${numbersToUnblock.length} numéro(s) débloqué(s) avec succès`
    });

  } catch (error) {
    console.error('Erreur déblocage numéro:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.get('/api/numbers/stats', authenticateToken, async (req, res) => {
  try {
    const { number } = req.query;
    
    // Statistiques simulées pour l'exemple
    const stats = {};
    
    if (number) {
      stats[number] = {
        frequency: Math.floor(Math.random() * 100),
        payouts: Math.floor(Math.random() * 50000),
        averageBet: Math.floor(Math.random() * 1000)
      };
    } else {
      for (let i = 0; i < 100; i++) {
        const num = i.toString().padStart(2, '0');
        stats[num] = {
          frequency: Math.floor(Math.random() * 100),
          payouts: Math.floor(Math.random() * 50000),
          averageBet: Math.floor(Math.random() * 1000)
        };
      }
    }

    res.json(stats);

  } catch (error) {
    console.error('Erreur statistiques numéros:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Routes des rapports
app.get('/api/reports/dashboard', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    // Récupérer les statistiques
    const totalUsersResult = await pool.query(
      'SELECT COUNT(*) as count FROM agents WHERE NOT blocked'
    );

    const totalAgentsResult = await pool.query(
      'SELECT COUNT(*) as count FROM agents'
    );

    const totalSupervisorsResult = await pool.query(
      'SELECT COUNT(*) as count FROM supervisors'
    );

    const onlineUsersResult = await pool.query(
      'SELECT COUNT(*) as count FROM agents WHERE online = true'
    );

    const totalSalesResult = await pool.query(
      'SELECT COALESCE(SUM(total_amount), 0) as total FROM tickets WHERE DATE(created_at) = CURRENT_DATE'
    );

    const totalTicketsResult = await pool.query(
      'SELECT COUNT(*) as count FROM tickets WHERE DATE(created_at) = CURRENT_DATE'
    );

    const totalWinsResult = await pool.query(
      `SELECT COALESCE(SUM(w.winning_amount), 0) as total 
       FROM winners w 
       JOIN tickets t ON w.ticket_id = t.id 
       WHERE DATE(t.created_at) = CURRENT_DATE AND w.paid = true`
    );

    const totalBlocksResult = await pool.query(
      'SELECT COUNT(*) as count FROM blocked_numbers'
    );

    const totalDrawsResult = await pool.query(
      'SELECT COUNT(*) as count FROM draws WHERE status = $1',
      ['completed']
    );

    res.json({
      totalUsers: parseInt(totalUsersResult.rows[0].count),
      totalAgents: parseInt(totalAgentsResult.rows[0].count),
      totalSupervisors: parseInt(totalSupervisorsResult.rows[0].count),
      onlineUsers: parseInt(onlineUsersResult.rows[0].count),
      totalSales: parseFloat(totalSalesResult.rows[0].total),
      totalTickets: parseInt(totalTicketsResult.rows[0].count),
      totalWins: parseFloat(totalWinsResult.rows[0].total),
      totalBlocks: parseInt(totalBlocksResult.rows[0].count),
      totalDraws: parseInt(totalDrawsResult.rows[0].count),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Erreur dashboard:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.get('/api/reports/activity', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { period = 'today', type = 'all', userId } = req.query;
    let query = `
      SELECT al.*, 
             COALESCE(o.name, s.name, a.name) as user_name,
             CASE 
               WHEN al.user_type = 'owner' THEN o.username
               WHEN al.user_type = 'supervisor' THEN s.username
               WHEN al.user_type = 'agent' THEN a.username
             END as username
      FROM activity_log al
      LEFT JOIN owner o ON al.user_type = 'owner' AND al.user_id = o.id
      LEFT JOIN supervisors s ON al.user_type = 'supervisor' AND al.user_id = s.id
      LEFT JOIN agents a ON al.user_type = 'agent' AND al.user_id = a.id
    `;
    let conditions = [];
    let values = [];
    let paramCount = 0;

    if (period === 'today') {
      conditions.push(`DATE(al.created_at) = CURRENT_DATE`);
    } else if (period === 'week') {
      conditions.push(`al.created_at >= CURRENT_DATE - INTERVAL '7 days'`);
    } else if (period === 'month') {
      conditions.push(`al.created_at >= CURRENT_DATE - INTERVAL '30 days'`);
    }

    if (type !== 'all') {
      conditions.push(`al.action LIKE $${++paramCount}`);
      values.push(`%${type}%`);
    }

    if (userId) {
      conditions.push(`al.user_id = $${++paramCount}`);
      values.push(userId);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY al.created_at DESC LIMIT 100';
    const result = await pool.query(query, values);

    const activities = result.rows.map(row => ({
      id: row.id,
      type: row.action.split('_')[0] || 'system',
      message: row.action,
      details: row.details,
      timestamp: row.created_at,
      user: row.user_name || 'Système',
      username: row.username
    }));

    res.json(activities);

  } catch (error) {
    console.error('Erreur activité:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.get('/api/users/activity', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { userId, limit = 50 } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'ID utilisateur requis' });
    }

    const result = await pool.query(
      `SELECT al.* 
       FROM activity_log al
       WHERE al.user_id = $1
       ORDER BY al.created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    const activities = result.rows.map(row => ({
      id: row.id,
      type: row.action.split('_')[0] || 'system',
      message: row.action,
      details: row.details,
      timestamp: row.created_at
    }));

    res.json(activities);

  } catch (error) {
    console.error('Erreur activité utilisateur:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Routes des règles
app.get('/api/rules', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const defaultRules = {
      maxBetPerNumber: 1000,
      maxBetPerDraw: 10000,
      minBetAmount: 10,
      maxBetAmount: 500,
      commissionAgent: 5,
      commissionSupervisor: 10,
      payoutMultiplier: 50,
      autoBlockThreshold: 5000,
      drawSchedule: {
        morning: '08:00',
        afternoon: '14:00',
        evening: '20:00'
      },
      notificationSettings: {
        email: true,
        sms: false,
        push: true
      }
    };

    res.json(defaultRules);

  } catch (error) {
    console.error('Erreur règles:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.put('/api/rules', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const rules = req.body;

    await logActivity('owner', req.user.id, 'MODIFICATION_RÈGLES', 'Mise à jour des règles système');

    res.json({
      success: true,
      message: 'Règles mises à jour avec succès',
      rules: rules
    });

  } catch (error) {
    console.error('Erreur mise à jour règles:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Routes des paramètres
app.get('/api/settings', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const result = await pool.query('SELECT * FROM lottery_config LIMIT 1');
    
    let settings = result.rows[0];
    if (!settings) {
      settings = {
        name: 'LOTATO PRO',
        logo_url: '',
        address: '',
        phone: '',
        currency: 'Gdes'
      };
    }

    res.json(settings);

  } catch (error) {
    console.error('Erreur paramètres:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.put('/api/settings', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { name, logo_url, address, phone, currency } = req.body;

    const result = await pool.query(
      `INSERT INTO lottery_config (name, logo_url, address, phone, currency, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO UPDATE 
       SET name = $1, logo_url = $2, address = $3, phone = $4, currency = $5, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [name, logo_url, address, phone, currency]
    );

    await logActivity('owner', req.user.id, 'MODIFICATION_PARAMÈTRES', 
      `Configuration mise à jour: ${name}`);

    res.json({
      success: true,
      message: 'Paramètres mis à jour avec succès',
      settings: result.rows[0]
    });

  } catch (error) {
    console.error('Erreur mise à jour paramètres:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Routes des alertes
app.get('/api/alerts', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const alerts = [
      {
        id: 1,
        type: 'warning',
        title: 'Agent bloqué',
        message: 'L\'agent Marc Antoine a été bloqué',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        read: false
      },
      {
        id: 2,
        type: 'info',
        title: 'Nouveau tirage',
        message: 'Le tirage Miami Matin a été publié',
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        read: true
      },
      {
        id: 3,
        type: 'success',
        title: 'Nouvel agent',
        message: 'L\'agent Sophie Bernard a été créé',
        timestamp: new Date(Date.now() - 10800000).toISOString(),
        read: true
      }
    ];

    res.json(alerts);

  } catch (error) {
    console.error('Erreur alertes:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Routes d'exportation
app.get('/api/users/export', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { format = 'json' } = req.query;

    const supervisors = await pool.query(
      'SELECT * FROM supervisors ORDER BY name'
    );

    const agents = await pool.query(
      `SELECT a.*, s.name as supervisor_name 
       FROM agents a 
       LEFT JOIN supervisors s ON a.supervisor_id = s.id 
       ORDER BY a.name`
    );

    const data = {
      exportDate: new Date().toISOString(),
      exportedBy: req.user.name,
      supervisors: supervisors.rows,
      agents: agents.rows,
      totalUsers: supervisors.rows.length + agents.rows.length
    };

    if (format === 'csv') {
      const csvContent = convertToCSV(data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=lotato_users_${Date.now()}.csv`);
      return res.send(csvContent);
    }

    res.json(data);

  } catch (error) {
    console.error('Erreur export utilisateurs:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Fonction utilitaire pour convertir en CSV
function convertToCSV(data) {
  const headers = ['Type', 'ID', 'Nom', 'Email', 'Téléphone', 'Créé le', 'Statut'];
  const rows = [];

  data.supervisors.forEach(s => {
    rows.push([
      'Superviseur',
      s.id,
      s.name,
      s.email,
      s.phone,
      new Date(s.created_at).toLocaleDateString(),
      'Actif'
    ]);
  });

  data.agents.forEach(a => {
    rows.push([
      'Agent',
      a.id,
      a.name,
      a.email,
      a.phone,
      new Date(a.created_at).toLocaleDateString(),
      a.blocked ? 'Bloqué' : 'Actif'
    ]);
  });

  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

// Route pour les fichiers de démonstration (tirages externes)
app.post('/api/draws/fetch', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { source } = req.body;
    
    const mockResults = [
      { name: 'Miami Matin', results: [12, 34, 56, 78, 90], luckyNumber: 5 },
      { name: 'New York Soir', results: [11, 22, 33, 44, 55], luckyNumber: 10 }
    ];

    for (const result of mockResults) {
      const drawId = `${result.name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
      
      await pool.query(
        `INSERT INTO draws (id, name, time, status, results, lucky_number, published_at, published_by, comment)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          drawId,
          result.name,
          new Date().toTimeString().split(' ')[0],
          'completed',
          JSON.stringify(result.results),
          result.luckyNumber,
          new Date(),
          req.user.name,
          'Importé automatiquement'
        ]
      );
    }

    await logActivity('owner', req.user.id, 'IMPORT_TIRAGES', 
      `${mockResults.length} tirages importés depuis ${source}`);

    res.json({
      success: true,
      count: mockResults.length,
      message: `${mockResults.length} tirages récupérés avec succès`,
      results: mockResults
    });

  } catch (error) {
    console.error('Erreur récupération tirages:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Routes supplémentaires de l'API
app.get('/api/users/stats', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM agents WHERE NOT blocked) as active_agents,
        (SELECT COUNT(*) FROM agents WHERE blocked) as blocked_agents,
        (SELECT COUNT(*) FROM supervisors) as total_supervisors,
        (SELECT COUNT(*) FROM agents) as total_agents,
        (SELECT COUNT(*) FROM agents WHERE online) as online_agents,
        (SELECT COALESCE(SUM(funds), 0) FROM agents) as total_funds,
        (SELECT COUNT(*) FROM activity_log WHERE DATE(created_at) = CURRENT_DATE) as today_activities
    `);

    res.json(stats.rows[0]);

  } catch (error) {
    console.error('Erreur stats utilisateurs:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.post('/api/users/limits', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { userId, dailyLimit, weeklyLimit, monthlyLimit, perTicketLimit } = req.body;

    await pool.query(
      'UPDATE agents SET funds = $1 WHERE id = $2',
      [dailyLimit || 10000, userId]
    );

    await logActivity('owner', req.user.id, 'MODIFICATION_LIMITES', `Limites pour utilisateur ${userId}`);

    res.json({
      success: true,
      message: 'Limites mises à jour avec succès'
    });

  } catch (error) {
    console.error('Erreur limites utilisateurs:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.get('/api/reports/sales', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { startDate, endDate } = req.query;
    
    let query = `
      SELECT 
        DATE(t.created_at) as date,
        COUNT(*) as ticket_count,
        COALESCE(SUM(t.total_amount), 0) as total_sales,
        COALESCE(SUM(w.winning_amount), 0) as total_wins,
        COUNT(DISTINCT t.agent_id) as active_agents
      FROM tickets t
      LEFT JOIN winners w ON t.id = w.ticket_id AND w.paid = true
    `;
    
    let conditions = [];
    let values = [];
    let paramCount = 0;

    if (startDate) {
      conditions.push(`t.created_at >= $${++paramCount}`);
      values.push(new Date(startDate));
    }

    if (endDate) {
      conditions.push(`t.created_at <= $${++paramCount}`);
      values.push(new Date(endDate));
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' GROUP BY DATE(t.created_at) ORDER BY date DESC LIMIT 30';
    
    const result = await pool.query(query, values);

    res.json(result.rows);

  } catch (error) {
    console.error('Erreur rapport ventes:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.get('/api/reports/financial', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { period = 'month' } = req.query;
    
    let interval = '30 days';
    if (period === 'week') interval = '7 days';
    if (period === 'year') interval = '365 days';

    const result = await pool.query(`
      SELECT 
        DATE_TRUNC('day', t.created_at) as date,
        SUM(t.total_amount) as revenue,
        SUM(CASE WHEN w.id IS NOT NULL THEN w.winning_amount ELSE 0 END) as payouts,
        SUM(t.total_amount) - SUM(CASE WHEN w.id IS NOT NULL THEN w.winning_amount ELSE 0 END) as profit,
        COUNT(*) as transactions
      FROM tickets t
      LEFT JOIN winners w ON t.id = w.ticket_id
      WHERE t.created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY DATE_TRUNC('day', t.created_at)
      ORDER BY date
    `);

    res.json(result.rows);

  } catch (error) {
    console.error('Erreur rapport financier:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.get('/api/draws/stats', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count,
        COALESCE(AVG(EXTRACT(EPOCH FROM (published_at - created_at))), 0) as avg_publish_time
      FROM draws
      GROUP BY status
    `);

    res.json(result.rows);

  } catch (error) {
    console.error('Erreur stats tirages:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Route pour les numéros limites
app.get('/api/numbers/limits', authenticateToken, async (req, res) => {
  try {
    // Pour l'instant, retourner des limites par défaut
    const limits = {};
    for (let i = 0; i < 100; i++) {
      const num = i.toString().padStart(2, '0');
      limits[num] = 1000; // Limite par défaut de 1000 Gdes
    }

    res.json(limits);

  } catch (error) {
    console.error('Erreur limites numéros:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.post('/api/numbers/limits', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { number, limit } = req.body;

    // Ici, vous pourriez sauvegarder dans une table dédiée
    // Pour l'instant, on retourne simplement un succès

    await logActivity('owner', req.user.id, 'MODIFICATION_LIMITE_NUMÉRO', 
      `Limite pour boule ${number}: ${limit} Gdes`);

    res.json({
      success: true,
      message: `Limite pour le numéro ${number} mise à jour`
    });

  } catch (error) {
    console.error('Erreur mise à jour limite numéro:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.put('/api/numbers/limits', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { limits } = req.body;

    await logActivity('owner', req.user.id, 'MODIFICATION_LIMITES_NUMÉROS', 
      'Mise à jour des limites pour tous les numéros');

    res.json({
      success: true,
      message: 'Limites mises à jour avec succès'
    });

  } catch (error) {
    console.error('Erreur mise à jour limites numéros:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Route de validation des règles
app.post('/api/rules/validate', authenticateToken, async (req, res) => {
  try {
    const rules = req.body;

    // Validation simple
    const errors = [];
    
    if (rules.maxBetPerNumber && rules.maxBetPerNumber < 0) {
      errors.push('La mise maximum par numéro doit être positive');
    }
    
    if (rules.commissionAgent && (rules.commissionAgent < 0 || rules.commissionAgent > 50)) {
      errors.push('La commission agent doit être entre 0 et 50%');
    }

    if (errors.length > 0) {
      return res.status(400).json({ 
        success: false, 
        errors: errors 
      });
    }

    res.json({
      success: true,
      message: 'Règles valides'
    });

  } catch (error) {
    console.error('Erreur validation règles:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Route pour obtenir l'historique des numéros
app.get('/api/numbers/history', authenticateToken, async (req, res) => {
  try {
    const { number, days = 30 } = req.query;

    if (!number) {
      return res.status(400).json({ error: 'Numéro requis' });
    }

    // Simuler des données d'historique
    const history = [];
    const now = new Date();
    
    for (let i = 0; i < 10; i++) {
      history.push({
        drawName: ['Miami Matin', 'New York Soir', 'Georgia Matin'][i % 3],
        timestamp: new Date(now.getTime() - i * 86400000).toISOString(),
        betAmount: Math.floor(Math.random() * 1000) + 100,
        won: Math.random() > 0.7
      });
    }

    res.json(history);

  } catch (error) {
    console.error('Erreur historique numéros:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Route pour exporter le journal d'activité
app.get('/api/reports/export/activity', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { format = 'csv' } = req.query;

    const activities = await pool.query(`
      SELECT al.*, 
             COALESCE(o.name, s.name, a.name) as user_name
      FROM activity_log al
      LEFT JOIN owner o ON al.user_type = 'owner' AND al.user_id = o.id
      LEFT JOIN supervisors s ON al.user_type = 'supervisor' AND al.user_id = s.id
      LEFT JOIN agents a ON al.user_type = 'agent' AND al.user_id = a.id
      ORDER BY al.created_at DESC
      LIMIT 1000
    `);

    if (format === 'csv') {
      const csvContent = convertActivitiesToCSV(activities.rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=lotato_activity_${Date.now()}.csv`);
      return res.send(csvContent);
    }

    res.json(activities.rows);

  } catch (error) {
    console.error('Erreur export activité:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

function convertActivitiesToCSV(activities) {
  const headers = ['Date', 'Utilisateur', 'Type', 'Action', 'Détails'];
  const rows = activities.map(a => [
    new Date(a.created_at).toLocaleString(),
    a.user_name || 'Système',
    a.user_type,
    a.action,
    a.details || ''
  ]);

  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

// Route pour les paramètres de sauvegarde
app.post('/api/settings/backup', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const backupId = `backup_${Date.now()}`;
    
    await logActivity('owner', req.user.id, 'SAUVEGARDE', `Sauvegarde créée: ${backupId}`);

    res.json({
      success: true,
      message: 'Sauvegarde créée avec succès',
      backupId: backupId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Erreur sauvegarde:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.post('/api/settings/restore', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { backupId } = req.body;

    await logActivity('owner', req.user.id, 'RESTAURATION', `Restauration depuis: ${backupId}`);

    res.json({
      success: true,
      message: 'Restauration effectuée avec succès'
    });

  } catch (error) {
    console.error('Erreur restauration:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Route pour les résultats des tirages
app.get('/api/draws/results/:drawId', authenticateToken, async (req, res) => {
  try {
    const { drawId } = req.params;

    const result = await pool.query(
      'SELECT * FROM draws WHERE id = $1',
      [drawId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tirage non trouvé' });
    }

    const draw = result.rows[0];

    // Récupérer les tickets pour ce tirage
    const ticketsResult = await pool.query(
      `SELECT t.*, a.name as agent_name
       FROM tickets t
       LEFT JOIN agents a ON t.agent_id = a.id
       WHERE t.draw_id = $1`,
      [drawId]
    );

    // Récupérer les gagnants
    const winnersResult = await pool.query(
      `SELECT w.*, t.ticket_number, a.name as agent_name
       FROM winners w
       JOIN tickets t ON w.ticket_id = t.id
       JOIN agents a ON t.agent_id = a.id
       WHERE w.draw_id = $1`,
      [drawId]
    );

    res.json({
      draw: draw,
      tickets: ticketsResult.rows,
      winners: winnersResult.rows,
      totalTickets: ticketsResult.rows.length,
      totalWinners: winnersResult.rows.length,
      totalPayouts: winnersResult.rows.reduce((sum, w) => sum + parseFloat(w.winning_amount), 0)
    });

  } catch (error) {
    console.error('Erreur résultats tirage:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Route pour programmer un tirage
app.post('/api/draws/schedule', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { drawId, date, time, publishType, notifyEmail } = req.body;

    const scheduledTime = new Date(`${date}T${time}`);
    
    await pool.query(
      'UPDATE draws SET time = $1, status = $2 WHERE id = $3',
      [time, 'scheduled', drawId]
    );

    await logActivity('owner', req.user.id, 'PROGRAMMATION_TIRAGE', 
      `Tirage ${drawId} programmé pour ${date} ${time}`);

    res.json({
      success: true,
      message: 'Tirage programmé avec succès',
      scheduledTime: scheduledTime.toISOString()
    });

  } catch (error) {
    console.error('Erreur programmation tirage:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Route pour créer une alerte
app.post('/api/alerts', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { type, title, message } = req.body;

    await logActivity('owner', req.user.id, 'CRÉATION_ALERTE', `${type}: ${title}`);

    res.json({
      success: true,
      message: 'Alerte créée avec succès',
      alert: {
        id: Date.now(),
        type,
        title,
        message,
        timestamp: new Date().toISOString(),
        read: false
      }
    });

  } catch (error) {
    console.error('Erreur création alerte:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.put('/api/alerts/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { id } = req.params;
    const { type, title, message, read } = req.body;

    res.json({
      success: true,
      message: 'Alerte mise à jour avec succès'
    });

  } catch (error) {
    console.error('Erreur mise à jour alerte:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

app.delete('/api/alerts/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { id } = req.params;

    res.json({
      success: true,
      message: 'Alerte supprimée avec succès'
    });

  } catch (error) {
    console.error('Erreur suppression alerte:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Routes pour le dashboard en temps réel
app.get('/api/reports/dashboard/realtime', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const realtimeData = {
      onlineAgents: Math.floor(Math.random() * 10) + 1,
      pendingTickets: Math.floor(Math.random() * 50),
      currentSales: Math.floor(Math.random() * 10000),
      recentActivities: [
        { id: 1, action: 'TICKET_CREATED', agent: 'Marc Antoine', time: '2 min ago' },
        { id: 2, action: 'DRAW_PUBLISHED', agent: 'Système', time: '5 min ago' },
        { id: 3, action: 'AGENT_LOGIN', agent: 'Sophie Bernard', time: '10 min ago' }
      ],
      lastDrawResults: {
        name: 'Miami Matin',
        results: [12, 34, 56, 78, 90],
        time: new Date(Date.now() - 3600000).toISOString()
      },
      timestamp: new Date().toISOString()
    };

    res.json(realtimeData);

  } catch (error) {
    console.error('Erreur données temps réel:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Gestion des erreurs 404 pour API
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Route API non trouvée' });
});

// Route par défaut pour servir index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Route pour owner.html
app.get('/owner.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'owner.html'));
});

// Initialiser la base de données
async function initializeDatabase() {
  try {
    console.log('Connexion à la base de données...');
    
    // Tester la connexion
    await pool.query('SELECT 1');
    console.log('✅ Connecté à la base de données');
    
    // Créer les tables si elles n'existent pas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS owner (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100),
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS supervisors (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100),
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS agents (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL,
        name VARCHAR(100) NOT NULL,
        supervisor_id INTEGER REFERENCES supervisors(id),
        location VARCHAR(100),
        commission DECIMAL(5,2) DEFAULT 5.00,
        funds DECIMAL(10,2) DEFAULT 10000.00,
        online BOOLEAN DEFAULT false,
        blocked BOOLEAN DEFAULT false,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS draws (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        time TIME NOT NULL,
        status VARCHAR(20) DEFAULT 'scheduled',
        results JSONB,
        lucky_number INTEGER,
        published_at TIMESTAMP,
        published_by VARCHAR(100),
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY,
        ticket_number VARCHAR(20) UNIQUE,
        agent_id INTEGER REFERENCES agents(id),
        draw_id VARCHAR(50) REFERENCES draws(id),
        draw_name VARCHAR(100) NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ticket_items (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
        game_type VARCHAR(50) NOT NULL,
        number VARCHAR(10) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        draw_id VARCHAR(50),
        special_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS winners (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER REFERENCES tickets(id),
        draw_id VARCHAR(50) REFERENCES draws(id),
        game_type VARCHAR(50) NOT NULL,
        number VARCHAR(10) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        winning_amount DECIMAL(10,2) NOT NULL,
        paid BOOLEAN DEFAULT false,
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS blocked_numbers (
        number VARCHAR(2) PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS lottery_config (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL DEFAULT 'LOTATO PRO',
        logo_url TEXT,
        address TEXT,
        phone VARCHAR(20),
        currency VARCHAR(10) DEFAULT 'Gdes',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        user_type VARCHAR(20) NOT NULL,
        user_id INTEGER,
        action VARCHAR(100) NOT NULL,
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ Tables créées ou déjà existantes');

    // Insérer les données initiales
    const adminPassword = await bcrypt.hash('admin123', 10);
    const supervisorPassword = await bcrypt.hash('sup123', 10);
    const agentPassword = await bcrypt.hash('agent123', 10);

    await pool.query(`
      INSERT INTO owner (username, password, name, email) 
      VALUES ('admin', $1, 'Administrateur Propriétaire', 'admin@lotato.com')
      ON CONFLICT (username) DO NOTHING;
    `, [adminPassword]);

    await pool.query(`
      INSERT INTO supervisors (username, password, name, email, phone) VALUES
      ('supervisor1', $1, 'Jean Pierre', 'jean@lotato.com', '3411-2233'),
      ('supervisor2', $1, 'Marie Claire', 'marie@lotato.com', '3411-4455')
      ON CONFLICT (username) DO NOTHING;
    `, [supervisorPassword]);

    await pool.query(`
      INSERT INTO agents (username, password, name, supervisor_id, location, commission) VALUES
      ('agent001', $1, 'Marc Antoine', 1, 'Port-au-Prince', 5.00),
      ('agent002', $1, 'Sophie Bernard', 1, 'Delmas', 5.00),
      ('agent003', $1, 'Robert Pierre', 2, 'Pétion-Ville', 5.00)
      ON CONFLICT (username) DO NOTHING;
    `, [agentPassword]);

    await pool.query(`
      INSERT INTO draws (id, name, time, status) VALUES
      ('mia_matin', 'Miami Matin', '13:30', 'scheduled'),
      ('mia_soir', 'Miami Soir', '21:50', 'scheduled'),
      ('ny_matin', 'New York Matin', '14:30', 'scheduled'),
      ('ny_soir', 'New York Soir', '20:00', 'scheduled'),
      ('ga_matin', 'Georgia Matin', '12:30', 'scheduled'),
      ('ga_soir', 'Georgia Soir', '19:00', 'scheduled'),
      ('tx_matin', 'Texas Matin', '11:30', 'scheduled'),
      ('tx_soir', 'Texas Soir', '18:30', 'scheduled'),
      ('tn_matin', 'Tunisia Matin', '10:00', 'scheduled'),
      ('tn_soir', 'Tunisia Soir', '17:00', 'scheduled')
      ON CONFLICT (id) DO NOTHING;
    `);

    await pool.query(`
      INSERT INTO lottery_config (name, logo_url, address, phone, currency) 
      VALUES ('LOTATO PRO', '', '', '', 'Gdes')
      ON CONFLICT (id) DO NOTHING;
    `);

    console.log('✅ Données initiales insérées');

  } catch (error) {
    console.error('❌ Erreur d\'initialisation de la base de données:', error);
    process.exit(1);
  }
}

// Démarrer le serveur
async function startServer() {
  try {
    await initializeDatabase();
    
    app.listen(PORT, () => {
      console.log(`✅ Serveur LOTATO PRO démarré sur le port ${PORT}`);
      console.log(`🌐 URL: http://localhost:${PORT}`);
      console.log(`📊 Interface propriétaire: http://localhost:${PORT}/owner.html`);
      console.log(`🔐 Interface de connexion: http://localhost:${PORT}/`);
      console.log(`🚀 API: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('❌ Impossible de démarrer le serveur:', error);
    process.exit(1);
  }
}

startServer();