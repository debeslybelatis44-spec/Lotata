const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_jhJrOgqYYQ79@ep-patient-darkness-a5v7ycpz.us-east-2.aws.neon.tech/neondb?sslmode=require',
  ssl: {
    rejectUnauthorized: false
  }
});

async function setupDatabase() {
  console.log('Début de la création de la base de données LOTATO...');
  
  try {
    // Création des tables
    await pool.query(`
      -- Table des propriétaires
      CREATE TABLE IF NOT EXISTS owners (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE,
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        active BOOLEAN DEFAULT true
      );
    `);

    await pool.query(`
      -- Table des superviseurs
      CREATE TABLE IF NOT EXISTS supervisors (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE,
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        active BOOLEAN DEFAULT true
      );
    `);

    await pool.query(`
      -- Table des agents
      CREATE TABLE IF NOT EXISTS agents (
        id VARCHAR(50) PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL,
        name VARCHAR(100) NOT NULL,
        supervisor_id INTEGER REFERENCES supervisors(id),
        location VARCHAR(100),
        commission DECIMAL(5,2) DEFAULT 5.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        online BOOLEAN DEFAULT false,
        active BOOLEAN DEFAULT true
      );
    `);

    await pool.query(`
      -- Table des tirages
      CREATE TABLE IF NOT EXISTS draws (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        date DATE NOT NULL,
        time TIME NOT NULL,
        results INTEGER[],
        lucky_number INTEGER,
        comment TEXT,
        source VARCHAR(50),
        published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        active BOOLEAN DEFAULT true
      );
    `);

    await pool.query(`
      -- Table des tickets
      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY,
        agent_id VARCHAR(50) REFERENCES agents(id),
        agent_name VARCHAR(100),
        draw_id VARCHAR(50),
        draw_name VARCHAR(100),
        bets JSONB NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        win_amount DECIMAL(10,2) DEFAULT 0,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        checked BOOLEAN DEFAULT false,
        has_wins BOOLEAN DEFAULT false,
        paid BOOLEAN DEFAULT false
      );
    `);

    await pool.query(`
      -- Table des paris (détail)
      CREATE TABLE IF NOT EXISTS ticket_bets (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER REFERENCES tickets(id),
        game_type VARCHAR(50) NOT NULL,
        number VARCHAR(10) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        draw_id VARCHAR(50),
        draw_name VARCHAR(100),
        option INTEGER,
        special_type VARCHAR(50),
        is_auto BOOLEAN DEFAULT false,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      -- Table des tickets gagnants
      CREATE TABLE IF NOT EXISTS winning_tickets (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER REFERENCES tickets(id),
        agent_id VARCHAR(50),
        agent_name VARCHAR(100),
        draw_id VARCHAR(50),
        draw_name VARCHAR(100),
        winning_numbers VARCHAR(50),
        winning_amount DECIMAL(10,2) NOT NULL,
        game_type VARCHAR(50),
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        paid BOOLEAN DEFAULT false,
        paid_at TIMESTAMP
      );
    `);

    await pool.query(`
      -- Table des numéros bloqués
      CREATE TABLE IF NOT EXISTS blocked_numbers (
        id SERIAL PRIMARY KEY,
        number VARCHAR(2) NOT NULL UNIQUE,
        blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reason TEXT
      );
    `);

    await pool.query(`
      -- Table des limites de numéros
      CREATE TABLE IF NOT EXISTS number_limits (
        id SERIAL PRIMARY KEY,
        number VARCHAR(2) NOT NULL UNIQUE,
        limit_amount DECIMAL(10,2) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      -- Table de configuration de la loterie
      CREATE TABLE IF NOT EXISTS lottery_config (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        logo TEXT,
        address TEXT,
        phone VARCHAR(20),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      -- Table du journal d'activité
      CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(50),
        user_type VARCHAR(20),
        action VARCHAR(100) NOT NULL,
        details TEXT,
        ip_address VARCHAR(45),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Tables créées avec succès!');

    // Insertion des utilisateurs de test (sans hacher les mots de passe)
    console.log('Insertion des utilisateurs de test...');

    // Propriétaire
    await pool.query(`
      INSERT INTO owners (username, password, name, email, phone) 
      VALUES ('admin', 'admin123', 'Admin Propriétaire', 'admin@lotato.com', '+509XXXXXXXX')
      ON CONFLICT (username) DO NOTHING;
    `);

    // Superviseurs
    await pool.query(`
      INSERT INTO supervisors (username, password, name, email, phone) 
      VALUES 
      ('supervisor1', 'super123', 'Jean Supervisor', 'super1@lotato.com', '+50911111111'),
      ('supervisor2', 'super456', 'Marie Supervisor', 'super2@lotato.com', '+50922222222')
      ON CONFLICT (username) DO NOTHING;
    `);

    // Agents (avec supervisor_id)
    await pool.query(`
      INSERT INTO agents (id, username, password, name, supervisor_id, location, commission) 
      VALUES 
      ('agent-01', 'agent01', 'agent123', 'Pierre Agent', 1, 'Port-au-Prince', 5),
      ('agent-02', 'agent02', 'agent456', 'Marc Agent', 1, 'Delmas', 5),
      ('agent-03', 'agent03', 'agent789', 'Sophie Agent', 2, 'Pétion-Ville', 5),
      ('agent-04', 'agent04', 'agent000', 'Luc Agent', 2, 'Carrefour', 5)
      ON CONFLICT (id) DO NOTHING;
    `);

    // Tirages de test
    const draws = [
      ['mia_matin', 'Miami Matin', '2024-01-15', '13:30', '{12, 34, 56, 78, 90}', 5, 'Tiraj test', 'manual'],
      ['mia_soir', 'Miami Soir', '2024-01-15', '21:50', '{23, 45, 67, 89, 01}', 9, 'Tiraj test', 'manual'],
      ['ny_matin', 'New York Matin', '2024-01-15', '14:30', '{11, 22, 33, 44, 55}', 0, 'Tiraj test', 'manual']
    ];

    for (const draw of draws) {
      await pool.query(`
        INSERT INTO draws (id, name, date, time, results, lucky_number, comment, source) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO NOTHING;
      `, draw);
    }

    // Configuration par défaut
    await pool.query(`
      INSERT INTO lottery_config (name, logo, address, phone) 
      VALUES ('LOTATO PRO', '', '', '+509XXXXXXXX')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Numéros bloqués de test
    await pool.query(`
      INSERT INTO blocked_numbers (number, reason) 
      VALUES 
      ('78', 'Trop joué'),
      ('45', 'Limite atteinte')
      ON CONFLICT (number) DO NOTHING;
    `);

    // Limites de test
    await pool.query(`
      INSERT INTO number_limits (number, limit_amount) 
      VALUES 
      ('78', 100),
      ('45', 50),
      ('12', 200)
      ON CONFLICT (number) DO NOTHING;
    `);

    // Activité de test
    await pool.query(`
      INSERT INTO activity_log (user_id, user_type, action, details) 
      VALUES 
      ('agent-01', 'agent', 'CONNEXION', 'Agent connecté'),
      ('admin', 'owner', 'CONFIGURATION', 'Configuration système modifiée'),
      ('supervisor1', 'supervisor', 'SUPPRESSION', 'Tickets récents supprimés')
      ON CONFLICT (id) DO NOTHING;
    `);

    console.log('Données de test insérées avec succès!');
    console.log('\n=== COMPTES DE TEST ===');
    console.log('Propriétaire: admin / admin123');
    console.log('Superviseur 1: supervisor1 / super123');
    console.log('Superviseur 2: supervisor2 / super456');
    console.log('Agent 1: agent01 / agent123');
    console.log('Agent 2: agent02 / agent456');
    console.log('Agent 3: agent03 / agent789');
    console.log('Agent 4: agent04 / agent000');
    console.log('\nBase de données LOTATO prête!');

  } catch (error) {
    console.error('Erreur lors de la configuration de la base:', error);
  } finally {
    await pool.end();
  }
}

setupDatabase();