// =============================================
//  LOTATO PRO - BACKEND SERVER (PostgreSQL/Neon)
//  Routes pour Agents, Superviseurs, Propriétaire
//  Authentification JWT, validation, synchronisation
// =============================================

require('dotenv').config();
const express = require('express');
const { Sequelize, DataTypes, Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

// ------------------  VARIABLES D'ENVIRONNEMENT  ------------------
const PORT = process.env.PORT || 5000;
const DATABASE_URL = process.env.DATABASE_URL; // format: postgresql://user:pass@host:5432/db
const JWT_SECRET = process.env.JWT_SECRET || 'lotato_pro_secret_key_2024';

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL manquante dans .env');
  process.exit(1);
}

// ------------------  CONNEXION POSTGRES (Sequelize)  ------------------
const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false // nécessaire pour Neon
    }
  },
  logging: false,
  define: {
    timestamps: true,
    underscored: true // utilise snake_case dans la base
  }
});

sequelize.authenticate()
  .then(() => console.log('✅ PostgreSQL (Neon) connecté'))
  .catch(err => {
    console.error('❌ Erreur PostgreSQL:', err);
    process.exit(1);
  });

// ==================  MODÈLES SEQUELIZE  ==================

// ----  Utilisateur  ----
const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  cin: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('agent', 'supervisor', 'owner'),
    allowNull: false
  },
  zone: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  blocked: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'users'
});

// ----  Relation auto-référencée (superviseur → agents)  ----
User.belongsTo(User, { as: 'supervisor', foreignKey: 'supervisor_id' });
User.hasMany(User, { as: 'agents', foreignKey: 'supervisor_id' });

// ----  Tirage  ----
const Draw = sequelize.define('Draw', {
  id: {
    type: DataTypes.STRING, // ex: 'tn_matin'
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  time: {
    type: DataTypes.STRING,
    allowNull: false
  },
  color: {
    type: DataTypes.STRING,
    defaultValue: '#6a11cb'
  },
  blocked: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  results: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  result_date: {
    type: DataTypes.DATE
  },
  published_by: {
    type: DataTypes.UUID,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  tableName: 'draws',
  underscored: true
});

// ----  Paris (sous-document dans Ticket)  ----
// On stocke les paris en JSON dans le ticket, pas de table séparée pour simplifier
// Mais on peut définir un modèle si besoin, ici on utilise JSONB

// ----  Ticket  ----
const Ticket = sequelize.define('Ticket', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ticket_id: {
    type: DataTypes.STRING,
    unique: true,
    defaultValue: () => Date.now() + '' + Math.floor(Math.random() * 1000)
  },
  agent_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  agent_name: {
    type: DataTypes.STRING
  },
  draw_id: {
    type: DataTypes.STRING,
    allowNull: false,
    references: { model: 'draws', key: 'id' }
  },
  draw_name: {
    type: DataTypes.STRING
  },
  bets: {
    type: DataTypes.JSONB, // tableau d'objets
    defaultValue: []
  },
  total: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  checked: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  win_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  paid: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'tickets',
  underscored: true
});

// ----  Résultats gagnants (pour affichage)  ----
const WinningResult = sequelize.define('WinningResult', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  draw_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  draw_name: {
    type: DataTypes.STRING
  },
  numbers: {
    type: DataTypes.ARRAY(DataTypes.STRING)
  },
  date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'winning_results',
  underscored: true
});

// ----  Configuration de la loterie  ----
const LotteryConfig = sequelize.define('LotteryConfig', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    defaultValue: 'LOTATO PRO'
  },
  logo: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  address: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  phone: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  currency: {
    type: DataTypes.STRING,
    defaultValue: 'Gdes'
  },
  gaming_rules: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'lottery_configs',
  underscored: true
});

// ----  Numéros bloqués (global)  ----
const BlockedNumber = sequelize.define('BlockedNumber', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  number: {
    type: DataTypes.STRING(2),
    allowNull: false,
    unique: true
  }
}, {
  tableName: 'blocked_numbers',
  underscored: true
});

// ----  Numéros bloqués par tirage  ----
const DrawBlockedNumber = sequelize.define('DrawBlockedNumber', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  draw_id: {
    type: DataTypes.STRING,
    allowNull: false,
    references: { model: 'draws', key: 'id' }
  },
  number: {
    type: DataTypes.STRING(2),
    allowNull: false
  }
}, {
  tableName: 'draw_blocked_numbers',
  underscored: true,
  indexes: [
    { unique: true, fields: ['draw_id', 'number'] }
  ]
});

// ----  Limite de mise par numéro et tirage  ----
const NumberLimit = sequelize.define('NumberLimit', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  draw_id: {
    type: DataTypes.STRING,
    allowNull: false,
    references: { model: 'draws', key: 'id' }
  },
  number: {
    type: DataTypes.STRING(2),
    allowNull: false
  },
  limit_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  }
}, {
  tableName: 'number_limits',
  underscored: true,
  indexes: [
    { unique: true, fields: ['draw_id', 'number'] }
  ]
});

// ----  Associations supplémentaires  ----
Draw.hasMany(Ticket, { foreignKey: 'draw_id', sourceKey: 'id' });
Ticket.belongsTo(Draw, { foreignKey: 'draw_id', targetKey: 'id' });

User.hasMany(Ticket, { foreignKey: 'agent_id' });
Ticket.belongsTo(User, { foreignKey: 'agent_id' });

// ==================  SYNCHRONISATION (création/ajustement des tables)  ==================
async function syncDatabase() {
  try {
    await sequelize.sync({ alter: true }); // adapte les colonnes sans tout supprimer
    console.log('📦 Tables synchronisées');
  } catch (err) {
    console.error('❌ Erreur synchronisation:', err);
  }
}

// ==================  INITIALISATION DES DONNÉES PAR DÉFAUT  ==================
async function initData() {
  // Tirages par défaut
  const drawCount = await Draw.count();
  if (drawCount === 0) {
    const defaultDraws = [
      { id: 'tn_matin', name: 'Tunisia Matin', time: '10:00', color: '#ad00f1' },
      { id: 'tn_soir', name: 'Tunisia Soir', time: '17:00', color: '#ad00f1' },
      { id: 'fl_matin', name: 'Florida Matin', time: '13:30', color: '#00d4ff' },
      { id: 'fl_soir', name: 'Florida Soir', time: '21:50', color: '#00d4ff' },
      { id: 'ny_matin', name: 'New York Matin', time: '14:30', color: '#ff416c' },
      { id: 'ny_soir', name: 'New York Soir', time: '20:00', color: '#ff416c' },
      { id: 'ga_matin', name: 'Georgia Matin', time: '12:30', color: '#00b09b' },
      { id: 'ga_soir', name: 'Georgia Soir', time: '19:00', color: '#00b09b' },
      { id: 'tx_matin', name: 'Texas Matin', time: '11:30', color: '#f1c40f' },
      { id: 'tx_soir', name: 'Texas Soir', time: '18:30', color: '#f1c40f' }
    ];
    await Draw.bulkCreate(defaultDraws);
    console.log('🎲 Tirages par défaut créés');
  }

  // Propriétaire par défaut
  const ownerExists = await User.findOne({ where: { role: 'owner' } });
  if (!ownerExists) {
    const hashed = await bcrypt.hash('admin123', 10);
    await User.create({
      name: 'Administrateur',
      username: 'admin',
      password: hashed,
      role: 'owner'
    });
    console.log('👑 Propriétaire par défaut créé (admin/admin123)');
  }

  // Configuration loterie
  const configExists = await LotteryConfig.findOne();
  if (!configExists) {
    await LotteryConfig.create({
      name: 'LOTATO PRO',
      currency: 'Gdes',
      gaming_rules: {
        BORLETTE: { lot1: 60, lot2: 20, lot3: 10 },
        LOTTO3: 500,
        LOTTO4: 1000,
        LOTTO5: 5000,
        MARIAGE: 1000,
        AUTO_MARRIAGE: 1000,
        AUTO_LOTTO4: 1000,
        AUTO_LOTTO5: 5000
      }
    });
    console.log('⚙️ Configuration loterie créée');
  }
}

// Lancer la synchronisation et l'init après la connexion
sequelize.afterConnect(async () => {
  await syncDatabase();
  await initData();
});

// ==================  MIDDLEWARES  ==================

// --- Vérification token JWT ---
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findByPk(decoded.id);
    if (!user) throw new Error('Utilisateur inexistant');
    if (user.blocked) throw new Error('Compte bloqué');
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
};

// --- Vérification du rôle ---
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Accès non autorisé' });
  }
  next();
};

// ==================  ROUTES PUBLIQUES  ==================

// --- Authentification ---
app.post('/api/auth/login', async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }

  try {
    const user = await User.findOne({
      where: { username, role },
      include: [{ model: User, as: 'supervisor', attributes: ['id', 'name'] }]
    });
    if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });
    if (user.blocked) return res.status(403).json({ error: 'Compte bloqué' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Identifiants incorrects' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    const response = {
      success: true,
      token,
      role: user.role,
      name: user.name,
      id: user.id
    };

    if (user.role === 'agent') {
      response.agentId = user.id;
      response.agentName = user.name;
      response.supervisorId = user.supervisor_id;
    }
    if (user.role === 'supervisor') {
      response.supervisorId = user.id;
    }

    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// --- Récupération configuration loterie (public) ---
app.get('/api/lottery-config', async (req, res) => {
  try {
    let config = await LotteryConfig.findOne();
    if (!config) config = { name: 'LOTATO PRO', currency: 'Gdes' };
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================  ROUTES AGENT  ==================
app.use('/api/agent', authenticate, authorize('agent'));

// --- Sauvegarder un ticket ---
app.post('/api/agent/tickets/save', async (req, res) => {
  try {
    const { drawId, drawName, bets, total } = req.body;
    const agent = req.user;

    // Vérifier si le tirage est bloqué
    const draw = await Draw.findByPk(drawId);
    if (draw && draw.blocked) {
      return res.status(403).json({ error: 'Ce tirage est bloqué pour les paris' });
    }

    // Vérifier les limites et numéros bloqués (simplifié)
    for (const bet of bets) {
      if (bet.game === 'borlette' && bet.cleanNumber) {
        const num = bet.cleanNumber;
        // Global block
        const globalBlocked = await BlockedNumber.findOne({ where: { number: num } });
        if (globalBlocked) {
          return res.status(400).json({ error: `Le numéro ${num} est bloqué globalement` });
        }
        // Draw block
        const drawBlocked = await DrawBlockedNumber.findOne({ where: { draw_id: drawId, number: num } });
        if (drawBlocked) {
          return res.status(400).json({ error: `Le numéro ${num} est bloqué pour ce tirage` });
        }
        // Vérifier limite
        const limit = await NumberLimit.findOne({ where: { draw_id: drawId, number: num } });
        if (limit) {
          // Calculer le total misé aujourd'hui sur ce numéro
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const ticketsToday = await Ticket.findAll({
            where: {
              draw_id: drawId,
              date: { [Op.gte]: today }
            }
          });
          let current = 0;
          ticketsToday.forEach(t => {
            t.bets.forEach(b => {
              if (b.cleanNumber === num && b.game === 'borlette') {
                current += parseFloat(b.amount || 0);
              }
            });
          });
          if (current + bet.amount > parseFloat(limit.limit_amount)) {
            return res.status(400).json({ error: `Limite atteinte pour le numéro ${num} (max ${limit.limit_amount} Gdes)` });
          }
        }
      }
    }

    const ticket = await Ticket.create({
      agent_id: agent.id,
      agent_name: agent.name,
      draw_id: drawId,
      draw_name: drawName,
      bets,
      total,
      date: new Date()
    });

    res.json({ success: true, ticket: ticket.toJSON() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la sauvegarde' });
  }
});

// --- Récupérer les tickets de l'agent ---
app.get('/api/agent/tickets', async (req, res) => {
  try {
    const { agentId } = req.query;
    if (!agentId) return res.status(400).json({ error: 'agentId requis' });
    const tickets = await Ticket.findAll({
      where: { agent_id: agentId },
      order: [['date', 'DESC']],
      raw: true
    });
    res.json({ tickets, data: tickets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Rapports globaux de l'agent ---
app.get('/api/agent/reports', async (req, res) => {
  try {
    const { agentId } = req.query;
    if (!agentId) return res.status(400).json({ error: 'agentId requis' });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tickets = await Ticket.findAll({
      where: {
        agent_id: agentId,
        date: { [Op.gte]: today }
      }
    });
    const totalTickets = tickets.length;
    const totalBets = tickets.reduce((acc, t) => acc + parseFloat(t.total || 0), 0);
    const totalWins = tickets
      .filter(t => t.checked && parseFloat(t.win_amount) > 0)
      .reduce((acc, t) => acc + parseFloat(t.win_amount), 0);
    const totalLoss = tickets
      .filter(t => t.checked && parseFloat(t.win_amount) === 0)
      .reduce((acc, t) => acc + parseFloat(t.total), 0);
    res.json({ totalTickets, totalBets, totalWins, totalLoss, balance: totalBets - totalWins });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Rapport par tirage (agent) ---
app.get('/api/agent/reports/draw', async (req, res) => {
  try {
    const { agentId, drawId } = req.query;
    if (!agentId || !drawId) return res.status(400).json({ error: 'agentId et drawId requis' });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tickets = await Ticket.findAll({
      where: {
        agent_id: agentId,
        draw_id: drawId,
        date: { [Op.gte]: today }
      }
    });
    const totalTickets = tickets.length;
    const totalBets = tickets.reduce((acc, t) => acc + parseFloat(t.total || 0), 0);
    const totalWins = tickets
      .filter(t => t.checked && parseFloat(t.win_amount) > 0)
      .reduce((acc, t) => acc + parseFloat(t.win_amount), 0);
    const totalLoss = tickets
      .filter(t => t.checked && parseFloat(t.win_amount) === 0)
      .reduce((acc, t) => acc + parseFloat(t.total), 0);
    res.json({ totalTickets, totalBets, totalWins, totalLoss, balance: totalBets - totalWins });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Récupérer les tickets gagnants de l'agent (non payés ou tous) ---
app.get('/api/agent/winners', async (req, res) => {
  try {
    const { agentId } = req.query;
    if (!agentId) return res.status(400).json({ error: 'agentId requis' });
    const tickets = await Ticket.findAll({
      where: {
        agent_id: agentId,
        checked: true,
        win_amount: { [Op.gt]: 0 }
      },
      order: [['date', 'DESC']]
    });
    res.json({ winners: tickets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Récupérer les résultats gagnants (pour affichage) ---
app.get('/api/agent/winners/results', async (req, res) => {
  try {
    const results = await WinningResult.findAll({
      order: [['date', 'DESC']],
      limit: 20
    });
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Marquer un ticket comme payé ---
app.post('/api/agent/winners/pay/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const ticket = await Ticket.findOne({ where: { ticket_id: ticketId } });
    if (!ticket) return res.status(404).json({ error: 'Ticket non trouvé' });
    ticket.paid = true;
    await ticket.save();
    res.json({ success: true, ticket });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Supprimer un ticket (si moins de 5 min) ---
app.delete('/api/agent/tickets/delete/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const ticket = await Ticket.findOne({ where: { ticket_id: ticketId } });
    if (!ticket) return res.status(404).json({ error: 'Ticket non trouvé' });
    const now = new Date();
    const diffMs = now - new Date(ticket.date);
    const diffMin = diffMs / (1000 * 60);
    if (diffMin > 5) {
      return res.status(403).json({ error: 'Ticket trop ancien pour être supprimé' });
    }
    await ticket.destroy();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Vérifier les tickets gagnants (après publication des résultats) ---
app.post('/api/agent/tickets/check-winners', async (req, res) => {
  try {
    const { agentId } = req.query;
    if (!agentId) return res.status(400).json({ error: 'agentId requis' });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const drawsWithResults = await Draw.findAll({
      where: {
        results: { [Op.ne]: [] },
        result_date: { [Op.gte]: today }
      }
    });
    let updatedCount = 0;
    for (const draw of drawsWithResults) {
      const tickets = await Ticket.findAll({
        where: {
          agent_id: agentId,
          draw_id: draw.id,
          checked: false
        }
      });
      for (const ticket of tickets) {
        let win = false;
        let winAmount = 0;
        for (const bet of ticket.bets) {
          if (bet.game === 'borlette' && bet.cleanNumber) {
            if (draw.results.includes(bet.cleanNumber)) {
              win = true;
              const index = draw.results.indexOf(bet.cleanNumber);
              const multiplier = index === 0 ? 60 : (index === 1 ? 20 : 10);
              winAmount += bet.amount * multiplier;
            }
          }
          // Ajouter autres jeux si besoin
        }
        ticket.checked = true;
        ticket.win_amount = winAmount;
        await ticket.save();
        updatedCount++;
      }
    }
    res.json({ success: true, checked: updatedCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ==================  ROUTES SUPERVISEUR  ==================
app.use('/api/supervisor', authenticate, authorize('supervisor'));

// --- Rapport global du superviseur (tous ses agents) ---
app.get('/api/supervisor/reports/overall', async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const agents = await User.findAll({ where: { role: 'agent', supervisor_id: supervisorId } });
    const agentIds = agents.map(a => a.id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tickets = await Ticket.findAll({
      where: {
        agent_id: { [Op.in]: agentIds },
        date: { [Op.gte]: today }
      }
    });
    const totalTickets = tickets.length;
    const totalBets = tickets.reduce((acc, t) => acc + parseFloat(t.total || 0), 0);
    const totalWins = tickets
      .filter(t => t.checked && parseFloat(t.win_amount) > 0)
      .reduce((acc, t) => acc + parseFloat(t.win_amount), 0);
    const balance = totalBets - totalWins;
    res.json({ totalTickets, totalBets, totalWins, balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Liste des agents du superviseur ---
app.get('/api/supervisor/agents', async (req, res) => {
  try {
    const agents = await User.findAll({
      where: { role: 'agent', supervisor_id: req.user.id },
      attributes: { exclude: ['password'] }
    });
    const agentIds = agents.map(a => a.id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tickets = await Ticket.findAll({
      where: {
        agent_id: { [Op.in]: agentIds },
        date: { [Op.gte]: today }
      }
    });
    const result = agents.map(agent => {
      const agentTickets = tickets.filter(t => t.agent_id === agent.id);
      const totalBets = agentTickets.reduce((acc, t) => acc + parseFloat(t.total || 0), 0);
      const totalWins = agentTickets
        .filter(t => t.checked && parseFloat(t.win_amount) > 0)
        .reduce((acc, t) => acc + parseFloat(t.win_amount), 0);
      const totalTickets = agentTickets.length;
      return {
        id: agent.id,
        name: agent.name,
        username: agent.username,
        blocked: agent.blocked,
        totalBets,
        totalWins,
        totalTickets,
        balance: totalBets - totalWins
      };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Bloquer un agent ---
app.post('/api/supervisor/block-agent/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const agent = await User.findOne({
      where: { id: agentId, role: 'agent', supervisor_id: req.user.id }
    });
    if (!agent) return res.status(404).json({ error: 'Agent non trouvé ou non assigné' });
    agent.blocked = true;
    await agent.save();
    res.json({ success: true, blocked: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Débloquer un agent ---
app.post('/api/supervisor/unblock-agent/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const agent = await User.findOne({
      where: { id: agentId, role: 'agent', supervisor_id: req.user.id }
    });
    if (!agent) return res.status(404).json({ error: 'Agent non trouvé ou non assigné' });
    agent.blocked = false;
    await agent.save();
    res.json({ success: true, blocked: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Tickets récents d'un agent (pour le superviseur) ---
app.get('/api/supervisor/tickets/recent', async (req, res) => {
  try {
    const { agentId } = req.query;
    if (!agentId) return res.status(400).json({ error: 'agentId requis' });
    const agent = await User.findOne({
      where: { id: agentId, role: 'agent', supervisor_id: req.user.id }
    });
    if (!agent) return res.status(403).json({ error: 'Agent non autorisé' });
    const tickets = await Ticket.findAll({
      where: { agent_id: agentId },
      order: [['date', 'DESC']],
      limit: 20
    });
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Supprimer un ticket (superviseur peut supprimer même après 5 min) ---
app.delete('/api/supervisor/tickets/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const ticket = await Ticket.findOne({ where: { ticket_id: ticketId } });
    if (!ticket) return res.status(404).json({ error: 'Ticket non trouvé' });
    // Vérifier que l'agent du ticket est sous ce superviseur
    const agent = await User.findOne({
      where: { id: ticket.agent_id, role: 'agent', supervisor_id: req.user.id }
    });
    if (!agent) return res.status(403).json({ error: 'Vous ne pouvez pas supprimer ce ticket' });
    await ticket.destroy();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================  ROUTES PROPRIÉTAIRE  ==================
app.use('/api/owner', authenticate, authorize('owner'));

// --- Dashboard ---
app.get('/api/owner/dashboard', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const allTickets = await Ticket.findAll({ where: { date: { [Op.gte]: today } } });
    const totalSales = allTickets.reduce((acc, t) => acc + parseFloat(t.total || 0), 0);

    // Connexions (simulation: utilisateurs actifs récemment - on prend non bloqués)
    const supervisors = await User.findAll({
      where: { role: 'supervisor', blocked: false },
      limit: 10
    });
    const agents = await User.findAll({
      where: { role: 'agent', blocked: false },
      limit: 20
    });

    // Limites progress
    const limitsProgressRaw = await NumberLimit.findAll({
      include: [{ model: Draw, as: 'draw', attributes: ['name'] }]
    });
    const limitsProgress = [];
    for (const l of limitsProgressRaw) {
      const betsToday = await Ticket.findAll({
        where: { draw_id: l.draw_id, date: { [Op.gte]: today } }
      });
      let current = 0;
      betsToday.forEach(t => {
        t.bets.forEach(b => {
          if (b.cleanNumber === l.number && b.game === 'borlette') {
            current += parseFloat(b.amount || 0);
          }
        });
      });
      limitsProgress.push({
        draw_id: l.draw_id,
        draw_name: l.draw?.name || l.draw_id,
        number: l.number,
        limit_amount: parseFloat(l.limit_amount),
        current_bets: current,
        progress_percent: (current / parseFloat(l.limit_amount)) * 100
      });
    }

    // Agents gains/pertes aujourd'hui
    const agentsGainLoss = await User.findAll({
      where: { role: 'agent' },
      attributes: ['id', 'name']
    });
    const agentStats = [];
    for (const agent of agentsGainLoss) {
      const agentTickets = await Ticket.findAll({
        where: { agent_id: agent.id, date: { [Op.gte]: today } }
      });
      const totalBets = agentTickets.reduce((acc, t) => acc + parseFloat(t.total || 0), 0);
      const totalWins = agentTickets
        .filter(t => t.checked && parseFloat(t.win_amount) > 0)
        .reduce((acc, t) => acc + parseFloat(t.win_amount), 0);
      agentStats.push({
        name: agent.name,
        totalBets,
        totalWins,
        net_result: totalBets - totalWins
      });
    }

    res.json({
      sales_today: totalSales,
      connected: {
        supervisors_count: supervisors.length,
        supervisors,
        agents_count: agents.length,
        agents
      },
      limits_progress: limitsProgress,
      agents_gain_loss: agentStats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Liste des superviseurs ---
app.get('/api/owner/supervisors', async (req, res) => {
  const supervisors = await User.findAll({
    where: { role: 'supervisor' },
    attributes: { exclude: ['password'] }
  });
  res.json(supervisors);
});

// --- Liste des agents ---
app.get('/api/owner/agents', async (req, res) => {
  const agents = await User.findAll({
    where: { role: 'agent' },
    include: [{ model: User, as: 'supervisor', attributes: ['id', 'name'] }],
    attributes: { exclude: ['password'] }
  });
  res.json(agents);
});

// --- Créer un utilisateur ---
app.post('/api/owner/create-user', async (req, res) => {
  try {
    const { name, cin, username, password, role, supervisorId, zone } = req.body;
    if (!name || !username || !password || !role) {
      return res.status(400).json({ error: 'Champs requis manquants' });
    }
    const existing = await User.findOne({ where: { username } });
    if (existing) return res.status(400).json({ error: 'Nom d\'utilisateur déjà pris' });
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      cin,
      username,
      password: hashed,
      role,
      supervisor_id: supervisorId || null,
      zone
    });
    res.json({ success: true, user: { id: user.id, name: user.name, username: user.username, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Bloquer / Débloquer utilisateur ---
app.post('/api/owner/block-user', async (req, res) => {
  const { userId } = req.body;
  try {
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    user.blocked = !user.blocked; // toggle
    await user.save();
    res.json({ success: true, blocked: user.blocked });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Changer superviseur d'un agent ---
app.put('/api/owner/change-supervisor', async (req, res) => {
  const { agentId, supervisorId } = req.body;
  try {
    const agent = await User.findOne({ where: { id: agentId, role: 'agent' } });
    if (!agent) return res.status(404).json({ error: 'Agent non trouvé' });
    agent.supervisor_id = supervisorId || null;
    await agent.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Récupérer tous les tirages ---
app.get('/api/owner/draws', async (req, res) => {
  const draws = await Draw.findAll();
  res.json(draws);
});

// --- Publier les résultats d'un tirage ---
app.post('/api/owner/publish-results', async (req, res) => {
  const { drawId, numbers } = req.body;
  if (!drawId || !numbers || !Array.isArray(numbers)) {
    return res.status(400).json({ error: 'drawId et numbers requis' });
  }
  try {
    const draw = await Draw.findByPk(drawId);
    if (!draw) return res.status(404).json({ error: 'Tirage non trouvé' });
    draw.results = numbers;
    draw.result_date = new Date();
    draw.published_by = req.user.id;
    await draw.save();

    await WinningResult.create({
      draw_id: draw.id,
      draw_name: draw.name,
      numbers,
      date: new Date()
    });

    res.json({ success: true, draw });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Bloquer / Débloquer un tirage (pour les paris) ---
app.post('/api/owner/block-draw', async (req, res) => {
  const { drawId, block } = req.body;
  try {
    const draw = await Draw.findByPk(drawId);
    if (!draw) return res.status(404).json({ error: 'Tirage non trouvé' });
    draw.blocked = block;
    await draw.save();
    res.json({ success: true, blocked: draw.blocked });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Liste des numéros bloqués globalement ---
app.get('/api/owner/blocked-numbers', async (req, res) => {
  const blocked = await BlockedNumber.findAll();
  res.json({ blockedNumbers: blocked.map(b => b.number) });
});

// --- Bloquer un numéro globalement ---
app.post('/api/owner/block-number', async (req, res) => {
  const { number } = req.body;
  if (!number) return res.status(400).json({ error: 'Numéro requis' });
  try {
    await BlockedNumber.findOrCreate({ where: { number } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Débloquer un numéro globalement ---
app.post('/api/owner/unblock-number', async (req, res) => {
  const { number } = req.body;
  if (!number) return res.status(400).json({ error: 'Numéro requis' });
  await BlockedNumber.destroy({ where: { number } });
  res.json({ success: true });
});

// --- Bloquer un numéro pour un tirage spécifique ---
app.post('/api/owner/block-number-draw', async (req, res) => {
  const { drawId, number } = req.body;
  if (!drawId || !number) return res.status(400).json({ error: 'drawId et number requis' });
  try {
    await DrawBlockedNumber.findOrCreate({ where: { draw_id: drawId, number } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Débloquer un numéro pour un tirage spécifique ---
app.post('/api/owner/unblock-number-draw', async (req, res) => {
  const { drawId, number } = req.body;
  await DrawBlockedNumber.destroy({ where: { draw_id: drawId, number } });
  res.json({ success: true });
});

// --- Définir une limite de mise pour un numéro dans un tirage ---
app.post('/api/owner/number-limit', async (req, res) => {
  const { drawId, number, limitAmount } = req.body;
  if (!drawId || !number || !limitAmount) {
    return res.status(400).json({ error: 'drawId, number et limitAmount requis' });
  }
  try {
    await NumberLimit.upsert({
      draw_id: drawId,
      number,
      limit_amount: limitAmount
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Rapports (propriétaire) ---
app.get('/api/owner/reports', async (req, res) => {
  try {
    const { supervisorId, agentId, drawId, period, fromDate, toDate, gainLoss } = req.query;
    let dateFilter = {};
    const now = new Date();
    if (period === 'today') {
      const start = new Date(); start.setHours(0,0,0,0);
      dateFilter = { [Op.gte]: start };
    } else if (period === 'yesterday') {
      const start = new Date(); start.setDate(start.getDate()-1); start.setHours(0,0,0,0);
      const end = new Date(); end.setDate(end.getDate()-1); end.setHours(23,59,59);
      dateFilter = { [Op.gte]: start, [Op.lte]: end };
    } else if (period === 'week') {
      const start = new Date(); start.setDate(start.getDate() - start.getDay()); start.setHours(0,0,0,0);
      dateFilter = { [Op.gte]: start };
    } else if (period === 'month') {
      const start = new Date(); start.setDate(1); start.setHours(0,0,0,0);
      dateFilter = { [Op.gte]: start };
    } else if (period === 'custom' && fromDate && toDate) {
      dateFilter = { [Op.gte]: new Date(fromDate), [Op.lte]: new Date(toDate) };
    }

    let where = { date: dateFilter };
    if (agentId && agentId !== 'all') where.agent_id = agentId;
    if (drawId && drawId !== 'all') where.draw_id = drawId;
    if (supervisorId && supervisorId !== 'all') {
      const agents = await User.findAll({ where: { role: 'agent', supervisor_id: supervisorId }, attributes: ['id'] });
      const agentIds = agents.map(a => a.id);
      where.agent_id = { [Op.in]: agentIds };
    }

    const tickets = await Ticket.findAll({ where });
    const totalTickets = tickets.length;
    const totalBets = tickets.reduce((acc, t) => acc + parseFloat(t.total || 0), 0);
    const totalWins = tickets
      .filter(t => t.checked && parseFloat(t.win_amount) > 0)
      .reduce((acc, t) => acc + parseFloat(t.win_amount), 0);
    const netResult = totalBets - totalWins;

    // Gain / Loss count
    const agentsStats = {};
    tickets.forEach(t => {
      const aid = t.agent_id;
      if (!agentsStats[aid]) agentsStats[aid] = { bets: 0, wins: 0 };
      agentsStats[aid].bets += parseFloat(t.total || 0);
      if (t.checked && parseFloat(t.win_amount) > 0) agentsStats[aid].wins += parseFloat(t.win_amount);
    });
    let gainCount = 0, lossCount = 0;
    for (let a in agentsStats) {
      if (agentsStats[a].bets - agentsStats[a].wins >= 0) gainCount++;
      else lossCount++;
    }

    res.json({
      summary: { totalTickets, totalBets, totalWins, netResult, gainCount, lossCount },
      detail: tickets.slice(0, 100) // limité
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================  DÉMARRAGE SERVEUR  ==================
app.listen(PORT, () => {
  console.log(`🚀 Serveur LOTATO PRO (PostgreSQL) démarré sur le port ${PORT}`);
});