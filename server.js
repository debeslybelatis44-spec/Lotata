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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000
});
app.use('/api/', limiter);

// Database connection - VERSION SIMPLIFIÉE POUR RENDER
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Tester la connexion à la base de données
pool.connect()
  .then(client => {
    console.log('✅ Connexion à la base de données réussie');
    client.release();
  })
  .catch(err => {
    console.error('❌ Erreur de connexion à la base:', err.message);
  });

// Middleware d'authentification
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // Pour certaines routes publiques, on continue sans token
    if (req.path === '/api/health' || req.path === '/api/auth/login') {
      return next();
    }
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

// Routes publiques
app.get('/api/health', async (req, res) => {
  try {
    // Tester la connexion à la base
    await pool.query('SELECT 1');
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      database: 'connected',
      service: 'LOTATO API v1.0'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      database: 'disconnected',
      error: error.message 
    });
  }
});

// Route de login simplifiée pour les tests
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;

    console.log('Tentative de login:', { username, role });

    // SIMULATION POUR LES TESTS - À REMPLACER PAR LA VRAIE BASE
    let user = null;
    
    if (role === 'agent') {
      // Test avec des agents prédéfinis
      const testAgents = [
        { id: 'agent-01', username: 'agent01', password: 'agent123', name: 'Pierre Agent' },
        { id: 'agent-02', username: 'agent02', password: 'agent456', name: 'Marc Agent' }
      ];
      
      user = testAgents.find(a => a.username === username && a.password === password);
    } else if (role === 'supervisor') {
      user = { id: 'supervisor-01', username: 'supervisor1', password: 'super123', name: 'Jean Supervisor' };
    } else if (role === 'owner') {
      user = { id: 'owner-01', username: 'admin', password: 'admin123', name: 'Admin Propriétaire' };
    }

    if (!user) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    // Générer le token JWT
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
    console.error('Erreur login:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la connexion' });
  }
});

// Routes API protégées
app.use('/api', authenticateToken);

// Routes simplifiées pour le moment
app.get('/api/tickets', async (req, res) => {
  try {
    res.json({ tickets: [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tickets/save', async (req, res) => {
  try {
    const ticketData = req.body;
    console.log('Ticket reçu:', ticketData);
    
    // Simuler un ID de ticket
    const ticketId = Math.floor(100000 + Math.random() * 900000);
    
    res.json({ 
      success: true, 
      ticket: { 
        id: ticketId,
        ...ticketData,
        date: new Date().toISOString()
      } 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/draws', async (req, res) => {
  try {
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
    res.status(500).json({ error: error.message });
  }
});

// Routes statiques - SERVIR LES FICHIERS FRONTEND
app.use(express.static(path.join(__dirname)));

// Routes pour les pages HTML
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

// Route catch-all pour SPA
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Route API non trouvée' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error('Erreur:', err.stack);
  res.status(500).json({ error: 'Une erreur est survenue sur le serveur' });
});

// Démarrer le serveur
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur LOTATO démarré sur le port ${PORT}`);
  console.log(`🔗 URL: http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  console.log(`👤 Test login: curl -X POST http://localhost:${PORT}/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123","role":"owner"}'`);
});