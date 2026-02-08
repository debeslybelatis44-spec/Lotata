// Configuration de l'API - Connecté à votre backend
const API_CONFIG = {
    BASE_URL: 'https://lotata-islp.onrender.com/api',
    ENDPOINTS: {
        AUTH: {
            LOGIN: '/auth/login',
            LOGOUT: '/auth/logout',
            VERIFY: '/auth/verify',
            REFRESH: '/auth/refresh'
        },
        USERS: {
            LIST: '/users',
            CREATE: '/users',
            UPDATE: (id) => `/users/${id}`,
            BLOCK: (id) => `/users/${id}/block`,
            DELETE: (id) => `/users/${id}`,
            EXPORT: '/users/export',
            STATS: '/users/stats',
            ACTIVITY: '/users/activity',
            LIMITS: '/users/limits'
        },
        DRAWS: {
            LIST: '/draws',
            CREATE: '/draws',
            PUBLISH: '/draws/publish',
            BLOCK: (id) => `/draws/${id}/block`,
            HISTORY: '/draws/history',
            FETCH: '/draws/fetch',
            STATS: '/draws/stats',
            RESULTS: '/draws/results',
            SCHEDULE: '/draws/schedule'
        },
        NUMBERS: {
            LIST: '/numbers',
            BLOCK: '/numbers/block',
            UNBLOCK: '/numbers/unblock',
            LIMITS: '/numbers/limits',
            STATS: '/numbers/stats',
            HISTORY: '/numbers/history'
        },
        RULES: {
            GET: '/rules',
            UPDATE: '/rules',
            VALIDATE: '/rules/validate'
        },
        REPORTS: {
            DASHBOARD: '/reports/dashboard',
            SALES: '/reports/sales',
            ACTIVITY: '/reports/activity',
            FINANCIAL: '/reports/financial',
            PERFORMANCE: '/reports/performance',
            EXPORT: '/reports/export'
        },
        SETTINGS: {
            GET: '/settings',
            UPDATE: '/settings',
            BACKUP: '/settings/backup',
            RESTORE: '/settings/restore'
        },
        ALERTS: {
            LIST: '/alerts',
            CREATE: '/alerts',
            UPDATE: (id) => `/alerts/${id}`,
            DELETE: (id) => `/alerts/${id}`
        }
    },
    
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        
        const token = localStorage.getItem('auth_token');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        return headers;
    },
    
    // Gestion des erreurs HTTP courantes
    handleResponse: async function(response) {
        if (response.status === 401) {
            // Token expiré, essayer de rafraîchir
            try {
                const refreshToken = localStorage.getItem('refresh_token');
                if (refreshToken) {
                    const refreshResponse = await fetch(this.BASE_URL + this.ENDPOINTS.AUTH.REFRESH, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${refreshToken}`
                        }
                    });
                    
                    if (refreshResponse.ok) {
                        const data = await refreshResponse.json();
                        localStorage.setItem('auth_token', data.accessToken);
                        // Réessayer la requête originale
                        return this.handleResponse(response);
                    }
                }
            } catch (error) {
                console.error('Erreur de rafraîchissement du token:', error);
            }
            
            // Déconnexion si impossible de rafraîchir
            localStorage.removeItem('auth_token');
            localStorage.removeItem('refresh_token');
            window.location.href = '/login.html';
            throw new Error('Session expirée. Veuillez vous reconnecter.');
        }
        
        if (response.status === 403) {
            throw new Error('Accès refusé. Vous n\'avez pas les permissions nécessaires.');
        }
        
        if (response.status === 404) {
            throw new Error('Ressource non trouvée.');
        }
        
        if (response.status === 500) {
            throw new Error('Erreur serveur. Veuillez réessayer plus tard.');
        }
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Erreur ${response.status}: ${response.statusText}`);
        }
        
        return response.json();
    },
    
    // Formatage des dates pour l'API
    formatDateForAPI: function(date) {
        return date.toISOString().split('.')[0] + 'Z';
    },
    
    // Vérification de la connexion
    checkConnection: async function() {
        try {
            const response = await fetch(this.BASE_URL + '/health', {
                method: 'GET',
                headers: this.getHeaders(),
                signal: AbortSignal.timeout(5000) // Timeout de 5 secondes
            });
            return response.ok;
        } catch (error) {
            console.error('Erreur de connexion à l\'API:', error);
            return false;
        }
    }
};