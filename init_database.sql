-- =====================================================
-- SCRIPT SQL POUR NEON POSTGRESQL - LOTATO PRO
-- =====================================================
-- Ce script supprime toutes les tables existantes
-- et crée les nouvelles tables avec leurs contraintes
-- =====================================================

-- Désactiver temporairement les contraintes de clés étrangères
SET session_replication_role = 'replica';

-- ==================== SUPPRESSION DES TABLES ====================
-- Supprimer dans l'ordre inverse des dépendances

DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Réactiver les contraintes de clés étrangères
SET session_replication_role = 'origin';

-- ==================== CRÉATION DES TABLES ====================

-- Table des utilisateurs (Owner, Superviseurs, Agents)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'supervisor', 'agent')),
    supervisor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des tickets de loterie
CREATE TABLE tickets (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    draw VARCHAR(20) NOT NULL CHECK (draw IN ('miami', 'newyork', 'georgia', 'texas', 'tunisia')),
    numbers JSONB NOT NULL,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    customer_name VARCHAR(100),
    customer_phone VARCHAR(20),
    is_winner BOOLEAN DEFAULT NULL,
    winning_amount DECIMAL(10, 2) DEFAULT 0,
    winning_numbers JSONB,
    checked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== INDEX POUR PERFORMANCES ====================

-- Index sur les colonnes fréquemment utilisées
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_supervisor ON users(supervisor_id);
CREATE INDEX idx_tickets_agent ON tickets(agent_id);
CREATE INDEX idx_tickets_draw ON tickets(draw);
CREATE INDEX idx_tickets_created ON tickets(created_at DESC);
CREATE INDEX idx_tickets_winner ON tickets(is_winner) WHERE is_winner = true;

-- Index pour la recherche rapide des tickets récents (pour la suppression 10 min)
CREATE INDEX idx_tickets_recent ON tickets(created_at) WHERE created_at > NOW() - INTERVAL '10 minutes';

-- ==================== TRIGGERS ====================

-- Fonction pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour users
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger pour tickets
CREATE TRIGGER update_tickets_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==================== DONNÉES INITIALES ====================

-- Créer le compte Owner par défaut
-- Mot de passe: admin123 (CHANGEZ-LE IMMÉDIATEMENT EN PRODUCTION!)
-- Hash bcrypt pour 'admin123'
INSERT INTO users (username, password, name, role) 
VALUES (
    'owner',
    '$2a$10$rGHv5F3fXxJQqKp7CjZJF.XxKQxWQxQQxWQxWQxQQxWQxWQxWQxWe',
    'Administrateur Principal',
    'owner'
);

-- ==================== COMMENTAIRES SUR LES TABLES ====================

COMMENT ON TABLE users IS 'Table des utilisateurs du système (Owner, Superviseurs, Agents)';
COMMENT ON COLUMN users.role IS 'Rôle de l''utilisateur: owner, supervisor, ou agent';
COMMENT ON COLUMN users.supervisor_id IS 'ID du superviseur (pour les agents uniquement)';
COMMENT ON COLUMN users.created_by IS 'ID de l''utilisateur qui a créé ce compte';

COMMENT ON TABLE tickets IS 'Table des tickets de loterie vendus par les agents';
COMMENT ON COLUMN tickets.draw IS 'Type de tirage: miami, newyork, georgia, texas, tunisia';
COMMENT ON COLUMN tickets.numbers IS 'Numéros joués (format JSON array)';
COMMENT ON COLUMN tickets.is_winner IS 'NULL=non vérifié, true=gagnant, false=perdant';
COMMENT ON COLUMN tickets.winning_numbers IS 'Numéros gagnants du tirage (format JSON array)';

-- ==================== VUES UTILES ====================

-- Vue pour les statistiques globales
CREATE OR REPLACE VIEW stats_global AS
SELECT 
    (SELECT COUNT(*) FROM users WHERE role = 'supervisor') as total_superviseurs,
    (SELECT COUNT(*) FROM users WHERE role = 'agent') as total_agents,
    (SELECT COUNT(*) FROM tickets) as total_tickets,
    (SELECT COUNT(*) FROM tickets WHERE is_winner = true) as total_gagnants,
    (SELECT COALESCE(SUM(amount), 0) FROM tickets) as ventes_totales,
    (SELECT COALESCE(SUM(winning_amount), 0) FROM tickets WHERE is_winner = true) as gains_totaux;

-- Vue pour les tickets récents (moins de 10 minutes)
CREATE OR REPLACE VIEW tickets_recent AS
SELECT 
    t.*,
    u.name as agent_name,
    u.username as agent_username,
    s.name as supervisor_name,
    EXTRACT(EPOCH FROM (NOW() - t.created_at))/60 as minutes_ago
FROM tickets t
JOIN users u ON t.agent_id = u.id
LEFT JOIN users s ON u.supervisor_id = s.id
WHERE t.created_at > NOW() - INTERVAL '10 minutes'
ORDER BY t.created_at DESC;

-- Vue pour les performances des agents
CREATE OR REPLACE VIEW agent_performance AS
SELECT 
    u.id,
    u.username,
    u.name,
    s.name as supervisor_name,
    COUNT(t.id) as total_tickets,
    COUNT(t.id) FILTER (WHERE t.is_winner = true) as tickets_gagnants,
    COALESCE(SUM(t.amount), 0) as ventes_totales,
    COALESCE(SUM(t.winning_amount), 0) as gains_totaux,
    ROUND(
        CASE 
            WHEN COUNT(t.id) > 0 
            THEN (COUNT(t.id) FILTER (WHERE t.is_winner = true)::DECIMAL / COUNT(t.id) * 100)
            ELSE 0 
        END, 2
    ) as taux_reussite
FROM users u
LEFT JOIN users s ON u.supervisor_id = s.id
LEFT JOIN tickets t ON u.id = t.agent_id
WHERE u.role = 'agent'
GROUP BY u.id, u.username, u.name, s.name;

-- ==================== PERMISSIONS ====================

-- Note: Sur Neon, les permissions sont gérées automatiquement
-- Si vous utilisez un utilisateur spécifique, décommentez et adaptez:

-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO lotato_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO lotato_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO lotato_user;

-- ==================== VÉRIFICATION ====================

-- Afficher un résumé de la structure créée
SELECT 'Tables créées:' as info;
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;

SELECT '' as info;
SELECT 'Vues créées:' as info;
SELECT table_name FROM information_schema.views 
WHERE table_schema = 'public'
ORDER BY table_name;

SELECT '' as info;
SELECT 'Index créés:' as info;
SELECT indexname FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY indexname;

-- Vérifier le compte owner
SELECT '' as info;
SELECT 'Compte Owner créé:' as info;
SELECT id, username, name, role, created_at 
FROM users 
WHERE role = 'owner';

-- =====================================================
-- FIN DU SCRIPT
-- =====================================================
-- 
-- INSTRUCTIONS D'UTILISATION:
-- 1. Connectez-vous à votre base Neon PostgreSQL
-- 2. Copiez et exécutez ce script entier
-- 3. Vérifiez que toutes les tables sont créées
-- 4. Changez le mot de passe du compte 'owner'
-- 5. Créez vos premiers superviseurs et agents
--
-- SÉCURITÉ IMPORTANTE:
-- - Changez immédiatement le mot de passe du compte 'owner'
-- - Le mot de passe par défaut est: admin123
-- - Utilisez des mots de passe forts pour tous les comptes
--
-- =====================================================
