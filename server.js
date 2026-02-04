require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const path = require('path');

// Configuration
const app = express();
const PORT = process.env.PORT || 3000;

// Connexion à Neon PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Vérification de la connexion DB
pool.connect((err) => {
  if (err) {
    console.error('Erreur connexion DB:', err.stack);
  } else {
    console.log('✅ Connecté à PostgreSQL (Neon)');
  }
});

// ==================== API ROUTES ====================

// 1. AUTHENTIFICATION SIMPLE
app.post('/api/login', async (req, res) => {
  const { username, password, userType } = req.body;
  
  try {
    let query, params;
    
    switch(userType) {
      case 'agent':
        query = 'SELECT * FROM agents WHERE username = $1 AND password = $2 AND blocked = false';
        params = [username, password];
        break;
      case 'supervisor':
        query = 'SELECT * FROM supervisors WHERE username = $1 AND password = $2';
        params = [username, password];
        break;
      case 'owner':
        query = 'SELECT * FROM owner WHERE username = $1 AND password = $2';
        params = [username, password];
        break;
      default:
        return res.status(400).json({ error: 'Type d\'utilisateur invalide' });
    }
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    
    const user = result.rows[0];
    const userData = { ...user };
    delete userData.password;
    
    res.json({
      success: true,
      user: userData,
      token: `${userType}_${Date.now()}`
    });
    
  } catch (error) {
    console.error('Erreur login:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// 2. TICKETS (Agent)
app.post('/api/tickets/save', async (req, res) => {
  const { agentId, drawId, bets, total, drawName } = req.body;
  
  try {
    // Générer un numéro de ticket unique
    const ticketNumber = 'TKT-' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 100);
    
    const ticketResult = await pool.query(
      `INSERT INTO tickets (ticket_number, agent_id, draw_id, draw_name, total_amount, status) 
       VALUES ($1, $2, $3, $4, $5, 'pending') 
       RETURNING *`,
      [ticketNumber, agentId, drawId, drawName, total]
    );
    
    const ticket = ticketResult.rows[0];
    const ticketId = ticket.id;
    
    // Sauvegarder les paris
    for (const bet of bets) {
      await pool.query(
        `INSERT INTO ticket_items (ticket_id, game_type, number, amount, draw_id, special_type) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [ticketId, bet.game, bet.number, bet.amount, bet.drawId, bet.specialType || null]
      );
    }
    
    // Journal d'activité
    await pool.query(
      `INSERT INTO activity_log (user_type, user_id, action) 
       VALUES ('agent', $1, 'Ticket créé: ' || $2)`,
      [agentId, ticketNumber]
    );
    
    res.json({ 
      success: true, 
      ticketId: ticketNumber,
      message: 'Ticket enregistré'
    });
    
  } catch (error) {
    console.error('Erreur sauvegarde ticket:', error);
    res.status(500).json({ error: 'Erreur sauvegarde' });
  }
});

app.get('/api/tickets', async (req, res) => {
  const { agentId, supervisorId, owner, limit = 50 } = req.query;
  
  try {
    let query;
    let params = [];
    
    if (owner === 'true') {
      query = `
        SELECT t.*, a.name as agent_name, a.supervisor_id, s.name as supervisor_name
        FROM tickets t
        LEFT JOIN agents a ON t.agent_id = a.id
        LEFT JOIN supervisors s ON a.supervisor_id = s.id
        ORDER BY t.created_at DESC
        LIMIT $1`;
      params = [parseInt(limit)];
    } else if (supervisorId) {
      query = `
        SELECT t.*, a.name as agent_name
        FROM tickets t
        JOIN agents a ON t.agent_id = a.id
        WHERE a.supervisor_id = $1
        ORDER BY t.created_at DESC
        LIMIT $2`;
      params = [supervisorId, parseInt(limit)];
    } else if (agentId) {
      query = `
        SELECT * FROM tickets 
        WHERE agent_id = $1 
        ORDER BY created_at DESC
        LIMIT $2`;
      params = [agentId, parseInt(limit)];
    }
    
    const result = await pool.query(query, params);
    
    // Récupérer les items pour chaque ticket
    const ticketsWithItems = await Promise.all(result.rows.map(async (ticket) => {
      const itemsResult = await pool.query(
        'SELECT * FROM ticket_items WHERE ticket_id = $1',
        [ticket.id]
      );
      
      return {
        ...ticket,
        bets: itemsResult.rows
      };
    }));
    
    res.json({ tickets: ticketsWithItems });
    
  } catch (error) {
    console.error('Erreur récupération tickets:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// 3. DRAWS (Tirages)
app.get('/api/draws', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.*, 
             COUNT(t.id) as ticket_count,
             COALESCE(SUM(t.total_amount), 0) as total_sales
      FROM draws d
      LEFT JOIN tickets t ON d.id = t.draw_id AND DATE(t.created_at) = CURRENT_DATE
      GROUP BY d.id
      ORDER BY d.time
    `);
    
    res.json({ draws: result.rows });
    
  } catch (error) {
    console.error('Erreur récupération tirages:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/draws/publish', async (req, res) => {
  const { drawId, results, luckyNumber, publishedBy } = req.body;
  
  try {
    await pool.query(
      `UPDATE draws 
       SET results = $1, 
           lucky_number = $2, 
           published_at = NOW(), 
           published_by = $3,
           status = 'published'
       WHERE id = $4`,
      [JSON.stringify(results), luckyNumber, publishedBy, drawId]
    );
    
    // Journal d'activité
    await pool.query(
      `INSERT INTO activity_log (user_type, user_id, action) 
       VALUES ('owner', $1, 'Tirage publié: ' || $2)`,
      [publishedBy, drawId]
    );
    
    res.json({ success: true, message: 'Tirage publié' });
    
  } catch (error) {
    console.error('Erreur publication tirage:', error);
    res.status(500).json({ error: 'Erreur publication' });
  }
});

// 4. WINNERS (Gagnants)
app.get('/api/winners', async (req, res) => {
  const { agentId, supervisorId, owner, drawId } = req.query;
  
  try {
    let query = `
      SELECT w.*, t.agent_id, a.name as agent_name, d.name as draw_name
      FROM winners w
      JOIN tickets t ON w.ticket_id = t.id
      JOIN agents a ON t.agent_id = a.id
      JOIN draws d ON w.draw_id = d.id
      WHERE 1=1`;
    
    const params = [];
    let paramCount = 1;
    
    if (drawId) {
      query += ` AND w.draw_id = $${paramCount}`;
      params.push(drawId);
      paramCount++;
    }
    
    if (agentId) {
      query += ` AND t.agent_id = $${paramCount}`;
      params.push(agentId);
      paramCount++;
    }
    
    if (supervisorId) {
      query += ` AND a.supervisor_id = $${paramCount}`;
      params.push(supervisorId);
      paramCount++;
    }
    
    if (owner !== 'true') {
      query += ` AND w.paid = false`;
    }
    
    query += ` ORDER BY w.winning_amount DESC`;
    
    const result = await pool.query(query, params);
    res.json({ winners: result.rows });
    
  } catch (error) {
    console.error('Erreur récupération gagnants:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/winners/pay', async (req, res) => {
  const { winnerId, agentId } = req.body;
  
  try {
    // Vérifier si l'agent a suffisamment de fonds
    const agentResult = await pool.query(
      'SELECT funds FROM agents WHERE id = $1',
      [agentId]
    );
    
    const winnerResult = await pool.query(
      'SELECT winning_amount FROM winners WHERE id = $1 AND paid = false',
      [winnerId]
    );
    
    if (agentResult.rows.length === 0 || winnerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Non trouvé' });
    }
    
    const agentFunds = parseFloat(agentResult.rows[0].funds);
    const winningAmount = parseFloat(winnerResult.rows[0].winning_amount);
    
    if (agentFunds < winningAmount) {
      return res.status(400).json({ error: 'Fonds insuffisants' });
    }
    
    // Marquer le gain comme payé
    await pool.query(
      'UPDATE winners SET paid = true, paid_at = NOW() WHERE id = $1',
      [winnerId]
    );
    
    // Déduire du fonds de l'agent
    await pool.query(
      'UPDATE agents SET funds = funds - $1 WHERE id = $2',
      [winningAmount, agentId]
    );
    
    res.json({ success: true, message: 'Gain payé' });
    
  } catch (error) {
    console.error('Erreur paiement gain:', error);
    res.status(500).json({ error: 'Erreur paiement' });
  }
});

// 5. REPORTS (Rapports)
app.get('/api/reports', async (req, res) => {
  const { agentId, supervisorId, period = 'today' } = req.query;
  
  try {
    let dateCondition = '';
    switch(period) {
      case 'today':
        dateCondition = "AND DATE(t.created_at) = CURRENT_DATE";
        break;
      case 'yesterday':
        dateCondition = "AND DATE(t.created_at) = CURRENT_DATE - INTERVAL '1 day'";
        break;
      case 'week':
        dateCondition = "AND t.created_at >= CURRENT_DATE - INTERVAL '7 days'";
        break;
      case 'month':
        dateCondition = "AND t.created_at >= CURRENT_DATE - INTERVAL '30 days'";
        break;
    }
    
    let query;
    let params = [];
    
    if (supervisorId) {
      query = `
        SELECT 
          COUNT(DISTINCT t.id) as total_tickets,
          COALESCE(SUM(t.total_amount), 0) as total_sales,
          COALESCE(SUM(w.winning_amount), 0) as total_wins,
          COUNT(DISTINCT w.id) as winners_count
        FROM tickets t
        JOIN agents a ON t.agent_id = a.id
        LEFT JOIN winners w ON t.id = w.ticket_id
        WHERE a.supervisor_id = $1 ${dateCondition}`;
      params = [supervisorId];
    } else if (agentId) {
      query = `
        SELECT 
          COUNT(DISTINCT t.id) as total_tickets,
          COALESCE(SUM(t.total_amount), 0) as total_sales,
          COALESCE(SUM(w.winning_amount), 0) as total_wins,
          COUNT(DISTINCT w.id) as winners_count
        FROM tickets t
        LEFT JOIN winners w ON t.id = w.ticket_id
        WHERE t.agent_id = $1 ${dateCondition}`;
      params = [agentId];
    } else {
      // Propriétaire - tous les tickets
      query = `
        SELECT 
          COUNT(DISTINCT t.id) as total_tickets,
          COALESCE(SUM(t.total_amount), 0) as total_sales,
          COALESCE(SUM(w.winning_amount), 0) as total_wins,
          COUNT(DISTINCT w.id) as winners_count
        FROM tickets t
        LEFT JOIN winners w ON t.id = w.ticket_id
        WHERE 1=1 ${dateCondition}`;
    }
    
    const result = await pool.query(query, params);
    const stats = result.rows[0];
    
    // Calculer le profit/pertes
    const profitLoss = (stats.total_sales || 0) - (stats.total_wins || 0);
    
    res.json({
      totalTickets: parseInt(stats.total_tickets) || 0,
      totalSales: parseFloat(stats.total_sales) || 0,
      totalWins: parseFloat(stats.total_wins) || 0,
      profitLoss: profitLoss,
      winnersCount: parseInt(stats.winners_count) || 0
    });
    
  } catch (error) {
    console.error('Erreur récupération rapports:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// 6. AGENTS MANAGEMENT
app.get('/api/agents', async (req, res) => {
  const { supervisorId } = req.query;
  
  try {
    let query = `
      SELECT a.*, s.name as supervisor_name,
             COALESCE(SUM(t.total_amount), 0) as today_sales,
             COUNT(t.id) as ticket_count
      FROM agents a
      LEFT JOIN supervisors s ON a.supervisor_id = s.id
      LEFT JOIN tickets t ON a.id = t.agent_id AND DATE(t.created_at) = CURRENT_DATE
    `;
    
    const params = [];
    
    if (supervisorId) {
      query += ` WHERE a.supervisor_id = $1`;
      params.push(supervisorId);
    }
    
    query += ` GROUP BY a.id, s.name ORDER BY a.name`;
    
    const result = await pool.query(query, params);
    res.json({ agents: result.rows });
    
  } catch (error) {
    console.error('Erreur récupération agents:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/agents/create', async (req, res) => {
  const { name, username, password, supervisorId, location, commission } = req.body;
  
  try {
    const result = await pool.query(
      `INSERT INTO agents (name, username, password, supervisor_id, location, commission, funds) 
       VALUES ($1, $2, $3, $4, $5, $6, 10000) 
       RETURNING id, name`,
      [name, username, password, supervisorId, location, commission || 5]
    );
    
    // Journal d'activité
    await pool.query(
      `INSERT INTO activity_log (user_type, user_id, action) 
       VALUES ('supervisor', $1, 'Agent créé: ' || $2)`,
      [supervisorId, name]
    );
    
    res.json({ 
      success: true, 
      agent: result.rows[0],
      message: 'Agent créé avec succès'
    });
    
  } catch (error) {
    console.error('Erreur création agent:', error);
    res.status(500).json({ error: 'Erreur création' });
  }
});

app.put('/api/agents/:id/block', async (req, res) => {
  const { id } = req.params;
  const { blocked } = req.body;
  
  try {
    await pool.query(
      'UPDATE agents SET blocked = $1 WHERE id = $2',
      [blocked, id]
    );
    
    res.json({ success: true, message: `Agent ${blocked ? 'bloqué' : 'débloqué'}` });
    
  } catch (error) {
    console.error('Erreur blocage agent:', error);
    res.status(500).json({ error: 'Erreur opération' });
  }
});

// 7. SUPERVISORS
app.get('/api/supervisors', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, 
             COUNT(a.id) as agents_count,
             COALESCE(SUM(CASE WHEN DATE(t.created_at) = CURRENT_DATE THEN t.total_amount ELSE 0 END), 0) as today_sales
      FROM supervisors s
      LEFT JOIN agents a ON s.id = a.supervisor_id
      LEFT JOIN tickets t ON a.id = t.agent_id
      GROUP BY s.id
      ORDER BY s.name
    `);
    
    res.json({ supervisors: result.rows });
    
  } catch (error) {
    console.error('Erreur récupération superviseurs:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// 8. FUNDS
app.put('/api/agents/:id/funds', async (req, res) => {
  const { id } = req.params;
  const { amount, type } = req.body;
  
  try {
    let query;
    if (type === 'add') {
      query = `UPDATE agents SET funds = funds + $1 WHERE id = $2 RETURNING funds`;
    } else {
      query = `UPDATE agents SET funds = funds - $1 WHERE id = $2 RETURNING funds`;
    }
    
    const result = await pool.query(query, [amount, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent non trouvé' });
    }
    
    res.json({ 
      success: true, 
      newBalance: result.rows[0].funds,
      message: `Fonds ${type === 'add' ? 'ajoutés' : 'retirés'}`
    });
    
  } catch (error) {
    console.error('Erreur mise à jour fonds:', error);
    res.status(500).json({ error: 'Erreur opération' });
  }
});

// 9. BLOCKED NUMBERS
app.get('/api/blocked-numbers', async (req, res) => {
  try {
    const result = await pool.query('SELECT number FROM blocked_numbers');
    res.json({ numbers: result.rows.map(row => row.number) });
    
  } catch (error) {
    console.error('Erreur récupération numéros bloqués:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/blocked-numbers', async (req, res) => {
  const { numbers } = req.body;
  
  try {
    // Supprimer tous les blocages existants
    await pool.query('DELETE FROM blocked_numbers');
    
    // Ajouter les nouveaux
    if (numbers && numbers.length > 0) {
      for (const number of numbers) {
        await pool.query(
          'INSERT INTO blocked_numbers (number) VALUES ($1)',
          [number]
        );
      }
    }
    
    res.json({ success: true, message: `${numbers?.length || 0} numéros bloqués` });
    
  } catch (error) {
    console.error('Erreur blocage numéros:', error);
    res.status(500).json({ error: 'Erreur blocage' });
  }
});

// 10. LOTTERY CONFIG
app.get('/api/lottery-config', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM lottery_config LIMIT 1');
    
    if (result.rows.length === 0) {
      const defaultConfig = {
        name: 'LOTATO PRO',
        logo_url: '',
        address: '',
        phone: '',
        currency: 'Gdes'
      };
      res.json({ config: defaultConfig });
    } else {
      res.json({ config: result.rows[0] });
    }
    
  } catch (error) {
    console.error('Erreur récupération config:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/lottery-config', async (req, res) => {
  const { name, logo_url, address, phone, currency } = req.body;
  
  try {
    const checkResult = await pool.query('SELECT id FROM lottery_config LIMIT 1');
    
    if (checkResult.rows.length > 0) {
      await pool.query(`
        UPDATE lottery_config 
        SET name = $1, logo_url = $2, address = $3, phone = $4, currency = $5, updated_at = NOW()
        WHERE id = $6`,
        [name, logo_url, address, phone, currency, checkResult.rows[0].id]
      );
    } else {
      await pool.query(`
        INSERT INTO lottery_config (name, logo_url, address, phone, currency) 
        VALUES ($1, $2, $3, $4, $5)`,
        [name, logo_url, address, phone, currency]
      );
    }
    
    res.json({ success: true, message: 'Configuration sauvegardée' });
    
  } catch (error) {
    console.error('Erreur sauvegarde config:', error);
    res.status(500).json({ error: 'Erreur sauvegarde' });
  }
});

// 11. ACTIVITY LOG
app.get('/api/activity', async (req, res) => {
  const { userType, userId, limit = 50 } = req.query;
  
  try {
    let query = 'SELECT * FROM activity_log WHERE 1=1';
    const params = [];
    
    if (userType && userId) {
      query += ` AND user_type = $1 AND user_id = $2`;
      params.push(userType, userId);
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));
    
    const result = await pool.query(query, params);
    res.json({ activities: result.rows });
    
  } catch (error) {
    console.error('Erreur récupération activité:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// 12. HEALTH CHECK
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'OK', 
      database: 'Connected',
      timestamp: new Date().toISOString(),
      version: 'LOTATO 1.0'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      database: 'Disconnected',
      error: error.message
    });
  }
});

// 13. RESET TEST DATA (pour développement)
app.post('/api/test/reset', async (req, res) => {
  const { secret } = req.query;
  
  if (secret !== 'lotato2024') {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  
  try {
    await pool.query('DELETE FROM winners');
    await pool.query('DELETE FROM ticket_items');
    await pool.query('DELETE FROM tickets WHERE id > 0');
    await pool.query('UPDATE agents SET funds = 10000, blocked = false');
    
    res.json({ success: true, message: 'Données réinitialisées' });
    
  } catch (error) {
    console.error('Erreur réinitialisation:', error);
    res.status(500).json({ error: 'Erreur réinitialisation' });
  }
});

// Routes pour les pages HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'agent1.html'));
});

app.get('/supervisor', (req, res) => {
  res.sendFile(path.join(__dirname, 'supervisor.html'));
});

app.get('/owner', (req, res) => {
  res.sendFile(path.join(__dirname, 'owner.html'));
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur LOTATO démarré sur http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`👤 Agent: http://localhost:${PORT}/`);
  console.log(`👨‍💼 Superviseur: http://localhost:${PORT}/supervisor`);
  console.log(`👑 Propriétaire: http://localhost:${PORT}/owner`);
});