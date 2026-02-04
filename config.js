// Configuration de l'API
// Ce fichier doit être inclus dans tous les fichiers HTML

const API_CONFIG = {
    // URL de base de l'API - À modifier selon votre déploiement
    BASE_URL: window.location.origin, // Utilise automatiquement l'URL actuelle
    // BASE_URL: 'https://votre-app.onrender.com', // Ou spécifiez votre URL Render
    
    // Endpoints
    ENDPOINTS: {
        // Auth
        LOGIN: '/api/auth/login',
        
        // Owner
        CREATE_SUPERVISOR: '/api/owner/supervisors',
        CREATE_AGENT: '/api/owner/agents',
        GET_SUPERVISORS: '/api/owner/supervisors',
        GET_AGENTS: '/api/owner/agents',
        OWNER_STATS: '/api/owner/stats',
        
        // Supervisor
        SUPERVISOR_AGENTS: '/api/supervisor/agents',
        SUPERVISOR_TICKETS: '/api/supervisor/tickets',
        DELETE_TICKET: '/api/supervisor/tickets',
        SUPERVISOR_STATS: '/api/supervisor/stats',
        
        // Agent
        CREATE_TICKET: '/api/agent/tickets',
        GET_TICKETS: '/api/agent/tickets',
        CHECK_RESULTS: '/api/agent/check-results',
        AGENT_STATS: '/api/agent/stats',
        
        // Health
        HEALTH: '/api/health'
    }
};

// Fonction helper pour faire des requêtes API
class APIClient {
    constructor() {
        this.baseURL = API_CONFIG.BASE_URL;
        this.token = localStorage.getItem('token');
    }
    
    // Mettre à jour le token
    setToken(token) {
        this.token = token;
        localStorage.setItem('token', token);
    }
    
    // Supprimer le token (déconnexion)
    clearToken() {
        this.token = null;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    }
    
    // Récupérer les headers avec authentification
    getHeaders(includeAuth = true) {
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (includeAuth && this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        
        return headers;
    }
    
    // Méthode générique pour les requêtes
    async request(endpoint, method = 'GET', data = null, includeAuth = true) {
        const url = `${this.baseURL}${endpoint}`;
        const options = {
            method,
            headers: this.getHeaders(includeAuth)
        };
        
        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            options.body = JSON.stringify(data);
        }
        
        try {
            const response = await fetch(url, options);
            
            // Si non autorisé, rediriger vers la page de connexion
            if (response.status === 401 || response.status === 403) {
                this.clearToken();
                if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
                    window.location.href = '/';
                }
                throw new Error('Session expirée. Veuillez vous reconnecter.');
            }
            
            // Parser la réponse JSON
            const responseData = await response.json();
            
            if (!response.ok) {
                throw new Error(responseData.error || 'Erreur serveur');
            }
            
            return responseData;
        } catch (error) {
            console.error('Erreur API:', error);
            throw error;
        }
    }
    
    // Méthodes raccourcies
    async get(endpoint, includeAuth = true) {
        return this.request(endpoint, 'GET', null, includeAuth);
    }
    
    async post(endpoint, data, includeAuth = true) {
        return this.request(endpoint, 'POST', data, includeAuth);
    }
    
    async put(endpoint, data, includeAuth = true) {
        return this.request(endpoint, 'PUT', data, includeAuth);
    }
    
    async delete(endpoint, includeAuth = true) {
        return this.request(endpoint, 'DELETE', null, includeAuth);
    }
    
    // Vérifier si l'utilisateur est connecté
    isAuthenticated() {
        return !!this.token;
    }
    
    // Récupérer l'utilisateur depuis le localStorage
    getUser() {
        const userStr = localStorage.getItem('user');
        return userStr ? JSON.parse(userStr) : null;
    }
    
    // Sauvegarder l'utilisateur
    setUser(user) {
        localStorage.setItem('user', JSON.stringify(user));
    }
}

// Instance globale du client API
const api = new APIClient();

// Fonction pour vérifier l'authentification au chargement de la page
function checkAuth(requiredRole = null) {
    const user = api.getUser();
    
    if (!api.isAuthenticated() || !user) {
        // Pas connecté, rediriger vers la page de connexion
        if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
            window.location.href = '/';
        }
        return false;
    }
    
    if (requiredRole && user.role !== requiredRole) {
        // Mauvais rôle, rediriger vers la bonne page
        redirectToRolePage(user.role);
        return false;
    }
    
    return true;
}

// Rediriger vers la page appropriée selon le rôle
function redirectToRolePage(role) {
    const pages = {
        'owner': '/owner.html',
        'supervisor': '/responsable.html',
        'agent': '/agent1.html'
    };
    
    const targetPage = pages[role];
    if (targetPage && window.location.pathname !== targetPage) {
        window.location.href = targetPage;
    }
}

// Fonction de déconnexion
function logout() {
    api.clearToken();
    window.location.href = '/';
}

// Fonction pour afficher les erreurs de manière conviviale
function showError(message, element = null) {
    if (element) {
        element.textContent = message;
        element.style.display = 'block';
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    } else {
        alert(message);
    }
}

// Fonction pour afficher les succès
function showSuccess(message, element = null) {
    if (element) {
        element.textContent = message;
        element.style.display = 'block';
        setTimeout(() => {
            element.style.display = 'none';
        }, 3000);
    } else {
        alert(message);
    }
}

// Formater les montants
function formatCurrency(amount) {
    return new Intl.NumberFormat('fr-HT', {
        style: 'currency',
        currency: 'HTG'
    }).format(amount);
}

// Formater les dates
function formatDate(dateString) {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('fr-HT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}
