// Configuration de l'API - Connecté à votre backend
const API_CONFIG = {
    BASE_URL: window.location.origin.includes('localhost') 
        ? 'http://localhost:10000/api' 
        : `${window.location.origin}/api`,
    
    ENDPOINTS: {
        // Authentification
        AUTH: {
            LOGIN: '/auth/login',
            LOGOUT: '/auth/logout',
            VERIFY: '/auth/verify',
            REFRESH: '/auth/refresh'
        },
        
        // Utilisateurs
        USERS: {
            LIST: '/users',
            CREATE: '/users/create',
            GET: (id) => `/users/${id}`,
            UPDATE: (id) => `/users/${id}`,
            DELETE: (id) => `/users/${id}`,
            BLOCK: (id) => `/users/${id}/block`,
            LIMITS: (id) => `/users/${id}/limits`,
            ACTIVITY: (id) => `/users/${id}/activity`,
            STATS: '/users/stats',
            EXPORT: '/users/export'
        },
        
        // Tirages
        DRAWS: {
            LIST: '/draws',
            CREATE: '/draws',
            GET: (id) => `/draws/${id}`,
            UPDATE: (id) => `/draws/${id}`,
            DELETE: (id) => `/draws/${id}`,
            PUBLISH: '/draws/publish',
            SCHEDULE: '/draws/schedule',
            BLOCK: (id) => `/draws/${id}/block`,
            FORCE_PUBLISH: (id) => `/draws/${id}/force-publish`,
            RESULTS: (id) => `/draws/${id}/results`,
            HISTORY: '/draws/history',
            STATS: '/draws/stats',
            FETCH_EXTERNAL: '/draws/fetch-external'
        },
        
        // Numéros/Boules
        NUMBERS: {
            LIST: '/numbers',
            BLOCK: '/numbers/block',
            UNBLOCK: '/numbers/unblock',
            UNBLOCK_MULTIPLE: '/numbers/unblock-multiple',
            LIMITS: '/numbers/limits',
            LIMIT_UPDATE: '/numbers/limits/update',
            STATS: '/numbers/stats',
            HISTORY: (number) => `/numbers/${number}/history`,
            AUTO_BLOCK_CONFIG: '/numbers/auto-block'
        },
        
        // Règles
        RULES: {
            GET: '/rules',
            UPDATE: '/rules/update',
            RESET: '/rules/reset',
            VALIDATE: '/rules/validate'
        },
        
        // Rapports
        REPORTS: {
            DASHBOARD: '/reports/dashboard',
            SALES: '/reports/sales',
            FINANCIAL: '/reports/financial',
            PERFORMANCE: '/reports/performance',
            ACTIVITY: '/reports/activity',
            EXPORT: (type) => `/reports/export/${type}`
        },
        
        // Alertes
        ALERTS: {
            LIST: '/alerts',
            CREATE: '/alerts/create',
            UPDATE: (id) => `/alerts/${id}`,
            DELETE: (id) => `/alerts/${id}`,
            MARK_READ: (id) => `/alerts/${id}/read`
        },
        
        // Paramètres
        SETTINGS: {
            GET: '/settings',
            UPDATE: '/settings/update',
            BACKUP: '/settings/backup',
            RESTORE: '/settings/restore'
        },
        
        // Limites
        LIMITS: {
            USER: '/limits/users',
            ZONE: '/limits/zones',
            TEMPORARY: '/limits/temporary'
        }
    },
    
    // Méthode pour obtenir les headers
    getHeaders: function() {
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
    
    // Gestion des réponses API
    handleResponse: async function(response) {
        // Si réponse vide (204)
        if (response.status === 204) {
            return { success: true };
        }
        
        // Récupérer le contenu
        let data;
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            try {
                data = text ? JSON.parse(text) : {};
            } catch {
                data = { message: text };
            }
        }
        
        // Gestion des erreurs HTTP
        if (!response.ok) {
            switch (response.status) {
                case 400:
                    throw new Error(data.error || 'Requête invalide');
                case 401:
                    localStorage.removeItem('auth_token');
                    localStorage.removeItem('refresh_token');
                    window.location.href = '/login.html';
                    throw new Error('Session expirée. Veuillez vous reconnecter.');
                case 403:
                    throw new Error('Accès refusé. Permissions insuffisantes.');
                case 404:
                    throw new Error('Ressource non trouvée.');
                case 409:
                    throw new Error(data.error || 'Conflit de données');
                case 422:
                    throw new Error(data.error || 'Données invalides');
                case 429:
                    throw new Error('Trop de requêtes. Veuillez patienter.');
                case 500:
                    throw new Error('Erreur serveur. Veuillez contacter l\'administrateur.');
                case 502:
                case 503:
                case 504:
                    throw new Error('Service temporairement indisponible.');
                default:
                    throw new Error(data.error || `Erreur ${response.status}: ${response.statusText}`);
            }
        }
        
        return data;
    },
    
    // Gestion des erreurs réseau
    handleNetworkError: function(error) {
        console.error('Erreur réseau:', error);
        
        // Vérifier si hors ligne
        if (!navigator.onLine) {
            return {
                success: false,
                error: 'Vous êtes hors ligne. Veuillez vérifier votre connexion internet.',
                offline: true
            };
        }
        
        // Timeout
        if (error.name === 'AbortError') {
            return {
                success: false,
                error: 'La requête a expiré. Veuillez réessayer.',
                timeout: true
            };
        }
        
        // Autres erreurs
        return {
            success: false,
            error: 'Erreur de connexion au serveur. Veuillez réessayer.',
            network: true
        };
    },
    
    // Méthode générique pour les requêtes
    request: async function(endpoint, method = 'GET', data = null, timeout = 30000) {
        const url = this.BASE_URL + endpoint;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const options = {
            method: method,
            headers: this.getHeaders(),
            signal: controller.signal,
            credentials: 'include'
        };
        
        if (data && method !== 'GET' && method !== 'HEAD') {
            options.body = JSON.stringify(data);
        }
        
        try {
            console.log(`API ${method} ${endpoint}`, data || '');
            const response = await fetch(url, options);
            clearTimeout(timeoutId);
            
            return await this.handleResponse(response);
            
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw new Error('La requête a expiré. Veuillez réessayer.');
            }
            
            const networkError = this.handleNetworkError(error);
            if (networkError.offline || networkError.timeout) {
                throw new Error(networkError.error);
            }
            
            throw error;
        }
    },
    
    // Méthodes HTTP spécifiques
    get: function(endpoint, params = null) {
        let url = endpoint;
        if (params) {
            const queryParams = new URLSearchParams(params).toString();
            url += `?${queryParams}`;
        }
        return this.request(url, 'GET');
    },
    
    post: function(endpoint, data) {
        return this.request(endpoint, 'POST', data);
    },
    
    put: function(endpoint, data) {
        return this.request(endpoint, 'PUT', data);
    },
    
    patch: function(endpoint, data) {
        return this.request(endpoint, 'PATCH', data);
    },
    
    delete: function(endpoint) {
        return this.request(endpoint, 'DELETE');
    },
    
    // Upload de fichier
    upload: async function(endpoint, file, fieldName = 'file') {
        const url = this.BASE_URL + endpoint;
        const formData = new FormData();
        formData.append(fieldName, file);
        
        const token = localStorage.getItem('auth_token');
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: formData
        });
        
        return await this.handleResponse(response);
    },
    
    // Téléchargement de fichier
    download: async function(endpoint, filename) {
        const url = this.BASE_URL + endpoint;
        const token = localStorage.getItem('auth_token');
        const headers = { 'Authorization': `Bearer ${token}` };
        
        const response = await fetch(url, { headers });
        
        if (!response.ok) {
            throw new Error(`Erreur de téléchargement: ${response.status}`);
        }
        
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
    },
    
    // Vérification de connexion
    testConnection: async function() {
        try {
            const response = await fetch(this.BASE_URL + '/health', {
                method: 'GET',
                headers: this.getHeaders(),
                signal: AbortSignal.timeout(5000)
            });
            return response.ok;
        } catch {
            return false;
        }
    },
    
    // Gestion des tokens
    refreshToken: async function() {
        try {
            const refreshToken = localStorage.getItem('refresh_token');
            if (!refreshToken) {
                throw new Error('Aucun token de rafraîchissement');
            }
            
            const response = await fetch(this.BASE_URL + this.ENDPOINTS.AUTH.REFRESH, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${refreshToken}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                localStorage.setItem('auth_token', data.token);
                if (data.refresh_token) {
                    localStorage.setItem('refresh_token', data.refresh_token);
                }
                return true;
            }
        } catch (error) {
            console.error('Erreur rafraîchissement token:', error);
        }
        return false;
    }
};

// Exporter pour usage global
window.API_CONFIG = API_CONFIG;