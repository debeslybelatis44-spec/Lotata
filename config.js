// Configuration globale pour toutes les interfaces
const API_CONFIG = {
    BASE_URL: window.location.origin + '/api',
    ENDPOINTS: {
        LOGIN: '/login',
        SAVE_TICKET: '/tickets/save',
        GET_TICKETS: '/tickets',
        GET_REPORTS: '/reports',
        GET_DRAWS: '/draws',
        GET_WINNERS: '/winners',
        PAY_WINNER: '/winners/pay',
        GET_AGENTS: '/agents',
        CREATE_AGENT: '/agents/create',
        BLOCK_AGENT: '/agents/:id/block',
        GET_SUPERVISORS: '/supervisors',
        UPDATE_FUNDS: '/agents/:id/funds',
        PUBLISH_DRAW: '/draws/publish',
        GET_BLOCKED_NUMBERS: '/blocked-numbers',
        UPDATE_BLOCKED_NUMBERS: '/blocked-numbers',
        GET_LOTTERY_CONFIG: '/lottery-config',
        UPDATE_LOTTERY_CONFIG: '/lottery-config',
        GET_ACTIVITY: '/activity',
        HEALTH: '/health'
    }
};

// Fonction utilitaire pour appeler l'API
async function apiCall(endpoint, method = 'GET', data = null) {
    const url = `${API_CONFIG.BASE_URL}${endpoint}`;
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
        }
    };
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(url, options);
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        return { error: 'Erreur de connexion' };
    }
}

// Fonction pour mettre à jour la configuration API dans les fichiers HTML existants
function updateApiConfig() {
    if (typeof window.API_CONFIG !== 'undefined') {
        window.API_CONFIG.BASE_URL = API_CONFIG.BASE_URL;
    }
}

// Exécuter au chargement
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateApiConfig);
} else {
    updateApiConfig();
}