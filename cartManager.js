require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

// ==================== MODÈLES ====================
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  email: String,
  role: { type: String, enum: ['master', 'subsystem', 'agent'], required: true },
  subsystem_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem' },
  is_active: { type: Boolean, default: true },
  is_online: { type: Boolean, default: false },
  last_login: Date,
  created_at: { type: Date, default: Date.now }
});
userSchema.methods.comparePassword = async function(candidate) {
  return await bcrypt.compare(candidate, this.password);
};

const subsystemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  subdomain: { type: String, required: true, unique: true },
  contact_email: { type: String, required: true },
  contact_phone: String,
  max_users: { type: Number, default: 10 },
  is_active: { type: Boolean, default: true },
  subscription_type: { type: String, default: 'basic' },
  subscription_expires: Date,
  created_at: { type: Date, default: Date.now },
  stats: {
    active_users: { type: Number, default: 0 },
    today_sales: { type: Number, default: 0 },
    today_tickets: { type: Number, default: 0 },
    total_sales: { type: Number, default: 0 }
  }
});

const betSchema = new mongoose.Schema({
  type: String, name: String, number: String, amount: Number, multiplier: Number,
  isGroup: Boolean, details: Array, options: Object, perOptionAmount: Number,
  isLotto4: Boolean, isLotto5: Boolean, isAuto: Boolean
}, { _id: false });

const ticketSchema = new mongoose.Schema({
  subsystem_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem', required: true },
  agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  agent_name: String,
  number: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  draw: String,
  draw_time: String,
  bets: [betSchema],
  total: Number,
  status: { type: String, default: 'active' },
  syncStatus: { type: String, default: 'synced' },
  is_synced: { type: Boolean, default: true },
  synced_at: Date
});
ticketSchema.index({ subsystem_id: 1, date: -1 });
ticketSchema.index({ agent_id: 1, date: -1 });

const resultSchema = new mongoose.Schema({
  draw: { type: String, required: true },
  time: { type: String, enum: ['morning', 'evening'], required: true },
  date: { type: Date, required: true },
  lot1: { type: String, required: true },
  lot2: String,
  lot3: String,
  verified: { type: Boolean, default: false },
  subsystem_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem' }
});
resultSchema.index({ draw: 1, time: 1, date: 1 }, { unique: true });

const restrictionSchema = new mongoose.Schema({
  subsystem_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem', required: true },
  number: { type: String, required: true },
  type: { type: String, enum: ['block', 'limit'], required: true },
  limitAmount: Number,
  draw: { type: String, default: 'all' },
  time: { type: String, default: 'all' },
  created_at: { type: Date, default: Date.now }
});

const companyInfoSchema = new mongoose.Schema({
  subsystem_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem', unique: true },
  name: String,
  phone: String,
  address: String,
  reportTitle: String,
  reportPhone: String,
  logoUrl: String
});

const User = mongoose.model('User', userSchema);
const Subsystem = mongoose.model('Subsystem', subsystemSchema);
const Ticket = mongoose.model('Ticket', ticketSchema);
const Result = mongoose.model('Result', resultSchema);
const Restriction = mongoose.model('Restriction', restrictionSchema);
const CompanyInfo = mongoose.model('CompanyInfo', companyInfoSchema);

// ==================== MIDDLEWARE AUTH ====================
const auth = async (req, res, next) => {
  try {
    const token = req.header('x-auth-token');
    if (!token) return res.status(401).json({ error: 'Accès refusé. Token manquant.' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (!user || !user.is_active) return res.status(401).json({ error: 'Utilisateur invalide.' });
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token invalide.' });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Accès interdit.' });
  next();
};

// ==================== EXPRESS APP ====================
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname))); // sert les fichiers HTML/CSS/JS

// ==================== ROUTES ====================

// --- AUTH ---
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: 'Champs requis.' });
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ success: false, error: 'Identifiants incorrects.' });
    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ success: false, error: 'Identifiants incorrects.' });
    if (!user.is_active) return res.status(403).json({ success: false, error: 'Compte désactivé.' });

    user.last_login = new Date();
    user.is_online = true;
    await user.save();

    const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const userData = {
      id: user._id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      subsystem_id: user.subsystem_id
    };
    res.json({ success: true, admin: userData, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// --- Vérification de session (pour les applications frontend) ---
app.get('/api/auth/check', auth, async (req, res) => {
  // auth middleware a déjà vérifié le token et attaché req.user
  const userData = {
    id: req.user._id,
    username: req.user.username,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role,
    subsystem_id: req.user.subsystem_id
  };
  res.json({ success: true, admin: userData });
});

// --- MASTER (protégé) ---
app.get('/api/master/subsystems', auth, authorize('master'), async (req, res) => {
  try {
    const { page = 1, limit = 10, status = 'all', search } = req.query;
    const query = {};
    if (status !== 'all') query.is_active = status === 'active';
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { subdomain: { $regex: search, $options: 'i' } },
        { contact_email: { $regex: search, $options: 'i' } }
      ];
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Subsystem.countDocuments(query);
    const subsystems = await Subsystem.find(query).skip(skip).limit(parseInt(limit)).sort({ created_at: -1 });
    for (let sub of subsystems) {
      const activeUsers = await User.countDocuments({ subsystem_id: sub._id, role: 'agent', is_active: true });
      sub.stats = sub.stats || {};
      sub.stats.active_users = activeUsers;
      sub.stats.usage_percentage = sub.max_users ? Math.round((activeUsers / sub.max_users) * 100) : 0;
    }
    res.json({
      success: true,
      subsystems,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, total_pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.post('/api/master/subsystems', auth, authorize('master'), async (req, res) => {
  try {
    const { name, subdomain, contact_email, contact_phone, max_users = 10, subscription_type = 'basic', subscription_months = 1 } = req.body;
    if (!name || !subdomain || !contact_email) return res.status(400).json({ success: false, error: 'Champs manquants.' });
    const existing = await Subsystem.findOne({ subdomain });
    if (existing) return res.status(400).json({ success: false, error: 'Sous-domaine déjà utilisé.' });

    const subscription_expires = new Date();
    subscription_expires.setMonth(subscription_expires.getMonth() + subscription_months);

    const subsystem = new Subsystem({ name, subdomain, contact_email, contact_phone, max_users, subscription_type, subscription_expires });
    await subsystem.save();

    // Créer l'admin du sous-système
    const adminUsername = `admin_${subdomain.replace(/[^a-z0-9]/g, '')}`;
    const adminPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    const adminUser = new User({
      username: adminUsername,
      password: hashedPassword,
      name: `Admin ${name}`,
      email: contact_email,
      role: 'subsystem',
      subsystem_id: subsystem._id
    });
    await adminUser.save();

    res.json({
      success: true,
      subsystem,
      admin_credentials: { username: adminUsername, password: adminPassword, email: contact_email },
      access_url: `https://${subdomain}.${req.get('host')}`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.get('/api/master/subsystems/:id', auth, authorize('master'), async (req, res) => {
  try {
    const subsystem = await Subsystem.findById(req.params.id);
    if (!subsystem) return res.status(404).json({ success: false, error: 'Sous-système non trouvé.' });
    const activeUsers = await User.countDocuments({ subsystem_id: subsystem._id, role: 'agent', is_active: true });
    subsystem.stats = subsystem.stats || {};
    subsystem.stats.active_users = activeUsers;
    subsystem.stats.usage_percentage = subsystem.max_users ? Math.round((activeUsers / subsystem.max_users) * 100) : 0;
    res.json({ success: true, subsystem });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.put('/api/master/subsystems/:id/deactivate', auth, authorize('master'), async (req, res) => {
  try {
    const subsystem = await Subsystem.findByIdAndUpdate(req.params.id, { is_active: false }, { new: true });
    if (!subsystem) return res.status(404).json({ success: false, error: 'Non trouvé.' });
    // Désactiver aussi les utilisateurs du sous-système ?
    await User.updateMany({ subsystem_id: subsystem._id }, { is_active: false });
    res.json({ success: true, subsystem });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.put('/api/master/subsystems/:id/activate', auth, authorize('master'), async (req, res) => {
  try {
    const subsystem = await Subsystem.findByIdAndUpdate(req.params.id, { is_active: true }, { new: true });
    if (!subsystem) return res.status(404).json({ success: false, error: 'Non trouvé.' });
    await User.updateMany({ subsystem_id: subsystem._id }, { is_active: true });
    res.json({ success: true, subsystem });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.get('/api/master/subsystems/:id/users', auth, authorize('master'), async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const query = { subsystem_id: req.params.id, role: 'agent' };
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await User.countDocuments(query);
    const users = await User.find(query).skip(skip).limit(parseInt(limit)).sort({ created_at: -1 });
    res.json({
      success: true,
      users,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, total_pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// --- SUBSYSTEM (protégé, rôle subsystem) ---
app.get('/api/subsystem/mine', auth, authorize('subsystem'), async (req, res) => {
  const subsystem = await Subsystem.findById(req.user.subsystem_id);
  res.json({ success: true, subsystems: [subsystem] });
});

app.get('/api/subsystem/users', auth, authorize('subsystem'), async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const users = await User.find({ subsystem_id: req.user.subsystem_id, role: 'agent' }).limit(parseInt(limit)).sort({ created_at: -1 });
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.post('/api/subsystem/users/create', auth, authorize('subsystem'), async (req, res) => {
  try {
    const { name, username, email, password } = req.body;
    if (!name || !username || !password) return res.status(400).json({ success: false, error: 'Champs manquants.' });
    const subsystem = await Subsystem.findById(req.user.subsystem_id);
    const activeCount = await User.countDocuments({ subsystem_id: subsystem._id, role: 'agent', is_active: true });
    if (activeCount >= subsystem.max_users) return res.status(400).json({ success: false, error: 'Quota d\'agents atteint.' });

    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ success: false, error: 'Nom d\'utilisateur déjà pris.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      username,
      password: hashedPassword,
      name,
      email,
      role: 'agent',
      subsystem_id: subsystem._id
    });
    await user.save();

    res.json({ success: true, user: { id: user._id, username, name, email, created_at: user.created_at } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.put('/api/subsystem/users/:id', auth, authorize('subsystem'), async (req, res) => {
  try {
    const { name, email, is_active, password } = req.body;
    const update = { name, email, is_active };
    if (password) {
      update.password = await bcrypt.hash(password, 10);
    }
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, subsystem_id: req.user.subsystem_id },
      update,
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, error: 'Utilisateur non trouvé.' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.put('/api/subsystem/users/:id/status', auth, authorize('subsystem'), async (req, res) => {
  try {
    const { is_active } = req.body;
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, subsystem_id: req.user.subsystem_id },
      { is_active },
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, error: 'Utilisateur non trouvé.' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.delete('/api/subsystem/users/:id', auth, authorize('subsystem'), async (req, res) => {
  try {
    const user = await User.findOneAndDelete({ _id: req.params.id, subsystem_id: req.user.subsystem_id });
    if (!user) return res.status(404).json({ success: false, error: 'Utilisateur non trouvé.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.get('/api/subsystem/tickets', auth, authorize('subsystem'), async (req, res) => {
  try {
    const { period = 'today', limit = 10, status } = req.query;
    let startDate;
    if (period === 'today') {
      startDate = new Date(); startDate.setHours(0,0,0,0);
    } else if (period === 'month') {
      startDate = new Date(); startDate.setDate(1); startDate.setHours(0,0,0,0);
    }
    const query = { subsystem_id: req.user.subsystem_id };
    if (startDate) query.date = { $gte: startDate };
    if (status === 'pending') query.syncStatus = 'pending';
    const tickets = await Ticket.find(query).sort({ date: -1 }).limit(parseInt(limit));
    res.json({ success: true, tickets });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.get('/api/subsystem/stats', auth, authorize('subsystem'), async (req, res) => {
  try {
    const subsystem = await Subsystem.findById(req.user.subsystem_id);
    const today = new Date(); today.setHours(0,0,0,0);
    const todayTickets = await Ticket.countDocuments({ subsystem_id: subsystem._id, date: { $gte: today } });
    const todaySalesAgg = await Ticket.aggregate([
      { $match: { subsystem_id: subsystem._id, date: { $gte: today } } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
    const todaySales = todaySalesAgg[0]?.total || 0;
    const activeUsers = await User.countDocuments({ subsystem_id: subsystem._id, role: 'agent', is_active: true });
    const onlineUsers = await User.countDocuments({ subsystem_id: subsystem._id, role: 'agent', is_online: true });
    const pendingPayout = 0; // à calculer selon les tickets gagnants non payés

    res.json({
      success: true,
      stats: {
        active_users: activeUsers,
        max_users: subsystem.max_users,
        today_tickets: todayTickets,
        today_sales: todaySales,
        online_agents: onlineUsers,
        pending_payout: pendingPayout,
        pending_issues: 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.get('/api/subsystem/activities', auth, authorize('subsystem'), async (req, res) => {
  // Pour simplifier, on retourne un tableau vide (à implémenter plus tard)
  res.json({ success: true, activities: [] });
});

// --- TICKETS (protégé) ---
app.post('/api/tickets', auth, authorize('agent', 'subsystem'), async (req, res) => {
  try {
    const { subsystem_id, agent_id, agent_name, number, draw, draw_time, bets, total } = req.body;
    // Vérifier que l'agent appartient au bon sous-système
    if (req.user.role === 'agent' && req.user._id.toString() !== agent_id) {
      return res.status(403).json({ success: false, error: 'Accès interdit.' });
    }
    const ticket = new Ticket({
      subsystem_id: subsystem_id || req.user.subsystem_id,
      agent_id,
      agent_name,
      number,
      draw,
      draw_time,
      bets,
      total,
      status: 'active',
      syncStatus: 'synced'
    });
    await ticket.save();
    res.json({ success: true, ticket });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.get('/api/tickets', auth, authorize('agent', 'subsystem', 'master'), async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'agent') {
      query.agent_id = req.user._id;
    } else if (req.user.role === 'subsystem') {
      query.subsystem_id = req.user.subsystem_id;
    } else if (req.user.role === 'master') {
      // master peut tout voir, on peut filtrer par subsystem_id si fourni
      if (req.query.subsystem_id) query.subsystem_id = req.query.subsystem_id;
    }
    const tickets = await Ticket.find(query).sort({ date: -1 }).limit(parseInt(req.query.limit || 100));
    res.json({ success: true, tickets });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.get('/api/tickets/:id', auth, authorize('agent', 'subsystem', 'master'), async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket non trouvé.' });
    // Vérification des droits
    if (req.user.role === 'agent' && ticket.agent_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Accès interdit.' });
    }
    if (req.user.role === 'subsystem' && ticket.subsystem_id.toString() !== req.user.subsystem_id.toString()) {
      return res.status(403).json({ success: false, error: 'Accès interdit.' });
    }
    res.json({ success: true, ticket });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.put('/api/tickets/:id/sync', auth, authorize('subsystem'), async (req, res) => {
  try {
    const ticket = await Ticket.findOneAndUpdate(
      { _id: req.params.id, subsystem_id: req.user.subsystem_id },
      { syncStatus: 'synced', is_synced: true, synced_at: new Date() },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket non trouvé.' });
    res.json({ success: true, ticket });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.delete('/api/tickets/:id', auth, authorize('subsystem'), async (req, res) => {
  try {
    const ticket = await Ticket.findOneAndDelete({ _id: req.params.id, subsystem_id: req.user.subsystem_id });
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket non trouvé.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// --- RESULTS ---
app.post('/api/results', auth, authorize('subsystem'), async (req, res) => {
  try {
    const { draw, time, date, lot1, lot2, lot3, verified } = req.body;
    const result = new Result({
      draw, time, date: new Date(date), lot1, lot2, lot3, verified,
      subsystem_id: req.user.subsystem_id
    });
    await result.save();
    res.json({ success: true, result });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, error: 'Ce résultat existe déjà.' });
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.get('/api/results', auth, authorize('subsystem', 'master', 'agent'), async (req, res) => {
  try {
    const { draw, time, date, limit = 10 } = req.query;
    let query = {};
    if (req.user.role === 'subsystem') {
      query.subsystem_id = req.user.subsystem_id;
    } else if (req.user.role === 'agent') {
      query.subsystem_id = req.user.subsystem_id;
    }
    if (draw) query.draw = draw;
    if (time) query.time = time;
    if (date) query.date = { $gte: new Date(date), $lt: new Date(new Date(date).setDate(new Date(date).getDate()+1)) };
    const results = await Result.find(query).sort({ date: -1 }).limit(parseInt(limit));
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// --- RESTRICTIONS ---
app.post('/api/restrictions', auth, authorize('subsystem'), async (req, res) => {
  try {
    const { number, type, limitAmount, draw, time } = req.body;
    const restriction = new Restriction({
      subsystem_id: req.user.subsystem_id,
      number, type, limitAmount, draw, time
    });
    await restriction.save();
    res.json({ success: true, restriction });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.get('/api/restrictions', auth, authorize('subsystem'), async (req, res) => {
  try {
    const restrictions = await Restriction.find({ subsystem_id: req.user.subsystem_id });
    res.json({ success: true, restrictions });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.put('/api/restrictions/:id', auth, authorize('subsystem'), async (req, res) => {
  try {
    const restriction = await Restriction.findOneAndUpdate(
      { _id: req.params.id, subsystem_id: req.user.subsystem_id },
      req.body,
      { new: true }
    );
    if (!restriction) return res.status(404).json({ success: false, error: 'Restriction non trouvée.' });
    res.json({ success: true, restriction });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.delete('/api/restrictions/:id', auth, authorize('subsystem'), async (req, res) => {
  try {
    const restriction = await Restriction.findOneAndDelete({ _id: req.params.id, subsystem_id: req.user.subsystem_id });
    if (!restriction) return res.status(404).json({ success: false, error: 'Restriction non trouvée.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// --- UTILS ---
app.get('/api/health', (req, res) => res.json({ status: 'OK' }));
app.get('/api/logo', (req, res) => res.json({ logoUrl: '/logo-borlette.jpg' }));
app.get('/api/company-info', (req, res) => {
  res.json({
    name: "Nova Lotto",
    phone: "+509 32 53 49 58",
    address: "Cap Haïtien",
    reportTitle: "Nova Lotto",
    reportPhone: "40104585"
  });
});

// ==================== SERVEUR STATIQUE ET FALLBACK ====================
// Route catch-all pour les applications monopages (si nécessaire)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ==================== DÉMARRAGE ====================
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅ MongoDB connecté');
    // Créer le master par défaut si inexistant
    const masterExists = await User.findOne({ role: 'master' });
    if (!masterExists) {
      let masterUsername, masterPassword;
      if (process.env.DEFAULT_MASTER_USERNAME && process.env.DEFAULT_MASTER_PASSWORD) {
        masterUsername = process.env.DEFAULT_MASTER_USERNAME;
        masterPassword = process.env.DEFAULT_MASTER_PASSWORD;
        console.log('Création du master avec les variables d\'environnement');
      } else {
        // Fallback pour le développement : identifiants par défaut
        masterUsername = 'admin';
        masterPassword = 'admin123';
        console.warn('⚠️  ATTENTION: Utilisation des identifiants par défaut pour le master (admin/admin123). Changez-les dès que possible.');
      }
      const hashedPassword = await bcrypt.hash(masterPassword, 10);
      await User.create({
        username: masterUsername,
        password: hashedPassword,
        name: 'Master Admin',
        role: 'master',
        is_active: true
      });
      console.log('✅ Master par défaut créé');
    }
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`🚀 Serveur sur le port ${PORT}`));
  })
  .catch(err => {
    console.error('❌ Erreur MongoDB:', err);
    process.exit(1);
  });