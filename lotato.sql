-- Base de données LOTATO pour Neon PostgreSQL

-- Table des propriétaires
CREATE TABLE IF NOT EXISTS owner (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(100) NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des superviseurs
CREATE TABLE IF NOT EXISTS supervisors (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(100) NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des agents
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

-- Table des tirages
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

-- Table des tickets
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

-- Table des items de ticket
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

-- Table des gains
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

-- Table des numéros bloqués
CREATE TABLE IF NOT EXISTS blocked_numbers (
    number VARCHAR(2) PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table de configuration
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

-- Table du journal d'activité
CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    user_type VARCHAR(20) NOT NULL,
    user_id INTEGER,
    action VARCHAR(100) NOT NULL,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Données initiales
INSERT INTO owner (username, password, name, email) 
VALUES ('admin', 'admin123', 'Administrateur Propriétaire', 'admin@lotato.com')
ON CONFLICT (username) DO NOTHING;

INSERT INTO supervisors (username, password, name, email, phone) VALUES
('supervisor1', 'sup123', 'Jean Pierre', 'jean@lotato.com', '3411-2233'),
('supervisor2', 'sup456', 'Marie Claire', 'marie@lotato.com', '3411-4455')
ON CONFLICT (username) DO NOTHING;

INSERT INTO agents (username, password, name, supervisor_id, location, commission) VALUES
('agent001', 'agent123', 'Marc Antoine', 1, 'Port-au-Prince', 5.00),
('agent002', 'agent456', 'Sophie Bernard', 1, 'Delmas', 5.00),
('agent003', 'agent789', 'Robert Pierre', 2, 'Pétion-Ville', 5.00)
ON CONFLICT (username) DO NOTHING;

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

INSERT INTO lottery_config (name, logo_url, address, phone, currency) 
VALUES ('LOTATO PRO', '', '', '', 'Gdes')
ON CONFLICT (id) DO NOTHING;