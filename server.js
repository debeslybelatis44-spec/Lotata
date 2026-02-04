const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Servir les fichiers HTML statiques

// Secret JWT
const JWT_SECRET = process.env.JWT_SECRET || 'votre_secret_jwt_super_securise_changez_moi';

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

// Middleware pour vérifier le rôle
const checkRole = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    next();
  };
};

// ==================== ROUTES D'AUTHENTIFICATION ====================

// Connexion
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND role = $2',
      [username, role]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        supervisorId: user.supervisor_id
      }
    });
  } catch (error) {
    console.error('Erreur de connexion:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== ROUTES OWNER ====================

// Créer un superviseur
app.post('/api/owner/supervisors', authenticateToken, checkRole('owner'), async (req, res) => {
  try {
    const { username, password, name } = req.body;

    if (!username || !password || !name) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    // Vérifier si le username existe déjà
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Ce nom d\'utilisateur existe déjà' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (username, password, name, role, created_by) 
       VALUES ($1, $2, $3, 'supervisor', $4) 
       RETURNING id, username, name, role, created_at`,
      [username, hashedPassword, name, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erreur création superviseur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer un agent
app.post('/api/owner/agents', authenticateToken, checkRole('owner'), async (req, res) => {
  try {
    const { username, password, name, supervisorId } = req.body;

    if (!username || !password || !name || !supervisorId) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    // Vérifier que le superviseur existe
    const supervisor = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND role = $2',
      [supervisorId, 'supervisor']
    );

    if (supervisor.rows.length === 0) {
      return res.status(400).json({ error: 'Superviseur invalide' });
    }

    // Vérifier si le username existe déjà
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Ce nom d\'utilisateur existe déjà' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (username, password, name, role, supervisor_id, created_by) 
       VALUES ($1, $2, $3, 'agent', $4, $5) 
       RETURNING id, username, name, role, supervisor_id, created_at`,
      [username, hashedPassword, name, supervisorId, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erreur création agent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Lister tous les superviseurs
app.get('/api/owner/supervisors', authenticateToken, checkRole('owner'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, name, created_at,
       (SELECT COUNT(*) FROM users WHERE supervisor_id = u.id) as agent_count
       FROM users u WHERE role = 'supervisor' ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur liste superviseurs:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Lister tous les agents
app.get('/api/owner/agents', authenticateToken, checkRole('owner'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.id, a.username, a.name, a.supervisor_id, a.created_at,
       s.name as supervisor_name,
       (SELECT COUNT(*) FROM tickets WHERE agent_id = a.id) as ticket_count
       FROM users a
       LEFT JOIN users s ON a.supervisor_id = s.id
       WHERE a.role = 'agent'
       ORDER BY a.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur liste agents:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Statistiques globales
app.get('/api/owner/stats', authenticateToken, checkRole('owner'), async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE role = 'supervisor') as supervisors,
        (SELECT COUNT(*) FROM users WHERE role = 'agent') as agents,
        (SELECT COUNT(*) FROM tickets) as total_tickets,
        (SELECT COUNT(*) FROM tickets WHERE is_winner = true) as winning_tickets,
        (SELECT COALESCE(SUM(amount), 0) FROM tickets) as total_amount,
        (SELECT COALESCE(SUM(winning_amount), 0) FROM tickets WHERE is_winner = true) as total_winnings
    `);
    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Erreur stats:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== ROUTES SUPERVISEUR ====================

// Lister les agents du superviseur
app.get('/api/supervisor/agents', authenticateToken, checkRole('supervisor'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.id, a.username, a.name, a.created_at,
       (SELECT COUNT(*) FROM tickets WHERE agent_id = a.id) as ticket_count,
       (SELECT COALESCE(SUM(amount), 0) FROM tickets WHERE agent_id = a.id) as total_sales
       FROM users a
       WHERE a.supervisor_id = $1 AND a.role = 'agent'
       ORDER BY a.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur liste agents superviseur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Lister tous les tickets des agents
app.get('/api/supervisor/tickets', authenticateToken, checkRole('supervisor'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, u.name as agent_name, u.username as agent_username
       FROM tickets t
       JOIN users u ON t.agent_id = u.id
       WHERE u.supervisor_id = $1
       ORDER BY t.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur liste tickets superviseur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer un ticket (si moins de 10 minutes)
app.delete('/api/supervisor/tickets/:id', authenticateToken, checkRole('supervisor'), async (req, res) => {
  try {
    const { id } = req.params;

    // Vérifier que le ticket appartient à un agent du superviseur et a moins de 10 minutes
    const result = await pool.query(
      `DELETE FROM tickets t
       USING users u
       WHERE t.id = $1 
       AND t.agent_id = u.id 
       AND u.supervisor_id = $2
       AND t.created_at > NOW() - INTERVAL '10 minutes'
       RETURNING t.id`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Ticket non trouvé ou délai de 10 minutes dépassé' });
    }

    res.json({ message: 'Ticket supprimé avec succès' });
  } catch (error) {
    console.error('Erreur suppression ticket:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Statistiques du superviseur
app.get('/api/supervisor/stats', authenticateToken, checkRole('supervisor'), async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE supervisor_id = $1 AND role = 'agent') as agents,
        (SELECT COUNT(*) FROM tickets t JOIN users u ON t.agent_id = u.id WHERE u.supervisor_id = $1) as total_tickets,
        (SELECT COUNT(*) FROM tickets t JOIN users u ON t.agent_id = u.id WHERE u.supervisor_id = $1 AND t.is_winner = true) as winning_tickets,
        (SELECT COALESCE(SUM(t.amount), 0) FROM tickets t JOIN users u ON t.agent_id = u.id WHERE u.supervisor_id = $1) as total_sales
    `, [req.user.id]);
    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Erreur stats superviseur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== ROUTES AGENT ====================

// Créer un ticket
app.post('/api/agent/tickets', authenticateToken, checkRole('agent'), async (req, res) => {
  try {
    const { draw, numbers, amount, customerName, customerPhone } = req.body;

    if (!draw || !numbers || !amount) {
      return res.status(400).json({ error: 'Champs requis manquants' });
    }

    // Valider les numéros selon le tirage
    const numbersArray = Array.isArray(numbers) ? numbers : JSON.parse(numbers);
    
    let valid = false;
    switch(draw) {
      case 'miami':
      case 'newyork':
      case 'texas':
        valid = numbersArray.length === 2 && numbersArray.every(n => n >= 0 && n <= 99);
        break;
      case 'georgia':
        valid = numbersArray.length === 3 && numbersArray.every(n => n >= 0 && n <= 99);
        break;
      case 'tunisia':
        valid = numbersArray.length === 4 && numbersArray.every(n => n >= 0 && n <= 99);
        break;
    }

    if (!valid) {
      return res.status(400).json({ error: 'Numéros invalides pour ce tirage' });
    }

    const result = await pool.query(
      `INSERT INTO tickets (agent_id, draw, numbers, amount, customer_name, customer_phone) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [req.user.id, draw, JSON.stringify(numbersArray), amount, customerName, customerPhone]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erreur création ticket:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Lister les tickets de l'agent
app.get('/api/agent/tickets', authenticateToken, checkRole('agent'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM tickets 
       WHERE agent_id = $1 
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur liste tickets agent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Vérifier les résultats d'un tirage
app.post('/api/agent/check-results', authenticateToken, checkRole('agent'), async (req, res) => {
  try {
    const { draw, winningNumbers } = req.body;

    if (!draw || !winningNumbers) {
      return res.status(400).json({ error: 'Tirage et numéros gagnants requis' });
    }

    const winningArray = Array.isArray(winningNumbers) ? winningNumbers : JSON.parse(winningNumbers);

    // Récupérer tous les tickets de ce tirage pour cet agent
    const tickets = await pool.query(
      `SELECT * FROM tickets 
       WHERE agent_id = $1 AND draw = $2 AND is_winner IS NULL
       ORDER BY created_at DESC`,
      [req.user.id, draw]
    );

    const results = [];

    for (const ticket of tickets.rows) {
      const ticketNumbers = typeof ticket.numbers === 'string' 
        ? JSON.parse(ticket.numbers) 
        : ticket.numbers;

      // Calculer les correspondances
      const matches = ticketNumbers.filter(num => winningArray.includes(num)).length;
      const isWinner = matches >= 2; // Au moins 2 numéros corrects pour gagner
      
      let winningAmount = 0;
      if (isWinner) {
        // Calcul du gain selon le nombre de correspondances et le tirage
        const baseAmount = parseFloat(ticket.amount);
        switch(matches) {
          case 2:
            winningAmount = baseAmount * 5;
            break;
          case 3:
            winningAmount = baseAmount * 50;
            break;
          case 4:
            winningAmount = baseAmount * 500;
            break;
        }
      }

      // Mettre à jour le ticket
      await pool.query(
        `UPDATE tickets 
         SET is_winner = $1, winning_amount = $2, winning_numbers = $3, checked_at = NOW()
         WHERE id = $4`,
        [isWinner, winningAmount, JSON.stringify(winningArray), ticket.id]
      );

      results.push({
        id: ticket.id,
        numbers: ticketNumbers,
        isWinner,
        matches,
        winningAmount,
        amount: ticket.amount
      });
    }

    res.json({ 
      draw, 
      winningNumbers: winningArray, 
      results,
      totalWinners: results.filter(r => r.isWinner).length
    });
  } catch (error) {
    console.error('Erreur vérification résultats:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Statistiques de l'agent
app.get('/api/agent/stats', authenticateToken, checkRole('agent'), async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_tickets,
        COUNT(*) FILTER (WHERE is_winner = true) as winning_tickets,
        COALESCE(SUM(amount), 0) as total_sales,
        COALESCE(SUM(winning_amount), 0) as total_winnings,
        COUNT(*) FILTER (WHERE draw = 'miami') as miami_tickets,
        COUNT(*) FILTER (WHERE draw = 'newyork') as newyork_tickets,
        COUNT(*) FILTER (WHERE draw = 'georgia') as georgia_tickets,
        COUNT(*) FILTER (WHERE draw = 'texas') as texas_tickets,
        COUNT(*) FILTER (WHERE draw = 'tunisia') as tunisia_tickets
      FROM tickets 
      WHERE agent_id = $1
    `, [req.user.id]);
    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Erreur stats agent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== ROUTES DES FICHIERS HTML ====================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/owner.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'owner.html'));
});

app.get('/responsable.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'responsable.html'));
});

app.get('/agent1.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'agent1.html'));
});

// Test de la connexion DB
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur le port ${PORT}`);
  console.log(`🌐 API disponible sur http://localhost:${PORT}`);
});

// Gestion des erreurs non capturées
process.on('unhandledRejection', (err) => {
  console.error('Erreur non gérée:', err);
});
