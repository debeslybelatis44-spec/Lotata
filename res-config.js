// Configuration du superviseur
const SUPERVISOR_CONFIG = {
    SUPERVISOR_ID: null,
    SUPERVISOR_NAME: '',
    SUPERVISOR_EMAIL: '',
    SUPERVISOR_PHONE: '',
    PERMISSIONS: {
        DELETE_TICKETS: true,
        BLOCK_AGENTS: true,
        VIEW_REPORTS: true,
        VIEW_WINNERS: true,
        MAX_DELETE_TIME: 10 // minutes
    }
};

// État global de l'application
let SUPERVISOR_STATE = {
    agents: [],
    tickets: [],
    selectedAgent: null,
    currentView: 'dashboard',
    reports: null,
    isLoading: false
};

// Gestionnaire d'événements global
const EVENT_HANDLERS = {
    onAgentBlock: null,
    onTicketDelete: null,
    onViewChange: null,
    onDataRefresh: null
};

// URLs API selon l'environnement
const API_CONFIG = {
    LOCAL: 'http://localhost:10000/api',
    PRODUCTION: '/api',
    
    getBaseUrl: function() {
        return window.location.hostname === 'localhost' || 
               window.location.hostname === '127.0.0.1' ? 
               this.LOCAL : this.PRODUCTION;
    }
};

// Constantes pour les messages
const MESSAGES = {
    ERROR: {
        AUTH_FAILED: 'Authentification échouée. Redirection...',
        LOAD_FAILED: 'Chargement échoué',
        DELETE_FAILED: 'Suppression échouée',
        BLOCK_FAILED: 'Action échouée',
        NETWORK_ERROR: 'Erreur réseau. Vérifiez votre connexion.'
    },
    SUCCESS: {
        LOGIN_SUCCESS: 'Connexion réussie',
        DELETE_SUCCESS: 'Suppression réussie',
        BLOCK_SUCCESS: 'Action réussie',
        REFRESH_SUCCESS: 'Actualisation réussie',
        EXPORT_SUCCESS: 'Export réussi'
    },
    CONFIRM: {
        DELETE_TICKET: 'Supprimer ce ticket? Cette action est irréversible.',
        DELETE_RECENT_TICKETS: 'Supprimer tous les tickets de moins de 10 minutes?',
        BLOCK_AGENT: 'Bloquer cet agent?',
        UNBLOCK_AGENT: 'Débloquer cet agent?',
        LOGOUT: 'Déconnexion?'
    }
};

// Formateurs de données
const DATA_FORMATTERS = {
    formatCurrency: function(amount) {
        return new Intl.NumberFormat('fr-HT', {
            style: 'decimal',
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(amount) + ' Gdes';
    },
    
    formatDate: function(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('fr-HT', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },
    
    formatTimeAgo: function(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return 'À l\'instant';
        if (diffMins < 60) return `Il y a ${diffMins} min`;
        if (diffMins < 1440) return `Il y a ${Math.floor(diffMins / 60)} h`;
        return this.formatDate(dateString);
    },
    
    calculateCommission: function(salesAmount, rate = 0.05) {
        return salesAmount * rate;
    },
    
    calculateSuccessRate: function(totalTickets, winningTickets) {
        if (totalTickets === 0) return 0;
        return ((winningTickets / totalTickets) * 100).toFixed(2);
    }
};

// Validation
const VALIDATORS = {
    isValidEmail: function(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },
    
    isValidPhone: function(phone) {
        const re = /^(\+509)?\s?(3\d{2}|4\d{2})\s?\d{2}\s?\d{2}\s?\d{2}$/;
        return re.test(phone);
    },
    
    isRecentTicket: function(ticketDate) {
        const ticketTime = new Date(ticketDate);
        const now = new Date();
        const diffMinutes = (now - ticketTime) / (1000 * 60);
        return diffMinutes <= SUPERVISOR_CONFIG.PERMISSIONS.MAX_DELETE_TIME;
    }
};

// Stockage local
const STORAGE = {
    get: function(key) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : null;
        } catch (error) {
            console.error('Erreur lecture localStorage:', error);
            return null;
        }
    },
    
    set: function(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Erreur écriture localStorage:', error);
            return false;
        }
    },
    
    remove: function(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Erreur suppression localStorage:', error);
            return false;
        }
    },
    
    clear: function() {
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            console.error('Erreur nettoyage localStorage:', error);
            return false;
        }
    }
};

// Export des configurations
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SUPERVISOR_CONFIG,
        SUPERVISOR_STATE,
        EVENT_HANDLERS,
        API_CONFIG,
        MESSAGES,
        DATA_FORMATTERS,
        VALIDATORS,
        STORAGE
    };
}