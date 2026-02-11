// Gestionnaire d'état - COMPLET
class StateManager {
    constructor() {
        this.state = {
            currentView: 'dashboard',
            currentNumbersTab: 'blocks',
            currentPublishTab: 'manual',
            currentReportsTab: 'sales',
            autoFetchEnabled: false,
            autoFetchInterval: null,
            mobileMenuOpen: false,
            
            data: {
                dashboard: {
                    totalUsers: 0,
                    totalSales: 0,
                    onlineUsers: 0,
                    totalTickets: 0,
                    totalWins: 0,
                    totalBlocks: 0,
                    totalDraws: 0,
                    recentActivity: [],
                    alerts: []
                },
                users: {
                    supervisors: [],
                    agents: []
                },
                draws: [],
                numbers: {
                    blocked: [],
                    limits: {},
                    stats: {}
                },
                activity: [],
                rules: {},
                reports: {},
                settings: {},
                limits: {
                    users: [],
                    zones: [],
                    temporary: []
                }
            },
            
            filters: {
                activity: {
                    period: 'today',
                    type: 'all'
                },
                users: {
                    type: 'all',
                    status: 'all'
                },
                draws: {
                    status: 'all',
                    date: null
                }
            },
            
            notifications: [],
            lastUpdate: null,
            isOnline: navigator.onLine
        };
        
        // Écouteurs d'événements
        this.initEventListeners();
    }
    
    // Initialiser les écouteurs
    initEventListeners() {
        // État réseau
        window.addEventListener('online', () => {
            this.state.isOnline = true;
            this.addNotification('Connexion rétablie', 'success');
        });
        
        window.addEventListener('offline', () => {
            this.state.isOnline = false;
            this.addNotification('Vous êtes hors ligne', 'warning');
        });
        
        // Sauvegarde avant déchargement
        window.addEventListener('beforeunload', () => {
            this.saveToLocalStorage();
        });
    }
    
    // === GETTERS ===
    getCurrentView() {
        return this.state.currentView;
    }
    
    getData(key) {
        return key ? this.state.data[key] : this.state.data;
    }
    
    getFilter(key) {
        return this.state.filters[key];
    }
    
    getNotifications() {
        return this.state.notifications;
    }
    
    isOnline() {
        return this.state.isOnline;
    }
    
    // === SETTERS ===
    setCurrentView(view) {
        this.state.currentView = view;
        this.saveToLocalStorage();
    }
    
    setData(key, value) {
        if (key.includes('.')) {
            // Accès profond (ex: 'dashboard.stats')
            const keys = key.split('.');
            let current = this.state.data;
            for (let i = 0; i < keys.length - 1; i++) {
                if (!current[keys[i]]) {
                    current[keys[i]] = {};
                }
                current = current[keys[i]];
            }
            current[keys[keys.length - 1]] = value;
        } else {
            this.state.data[key] = value;
        }
        this.state.lastUpdate = new Date();
        this.saveToLocalStorage();
    }
    
    updateData(key, partialData) {
        const current = this.getData(key);
        this.setData(key, { ...current, ...partialData });
    }
    
    setFilter(filterKey, value) {
        this.state.filters[filterKey] = { ...this.state.filters[filterKey], ...value };
        this.saveToLocalStorage();
    }
    
    // === GESTION DES NOTIFICATIONS ===
    addNotification(message, type = 'info', duration = 5000) {
        const notification = {
            id: Date.now() + Math.random(),
            message,
            type,
            timestamp: new Date(),
            duration,
            read: false
        };
        
        this.state.notifications.unshift(notification);
        
        // Limiter à 100 notifications
        if (this.state.notifications.length > 100) {
            this.state.notifications.pop();
        }
        
        this.saveToLocalStorage();
        return notification.id;
    }
    
    removeNotification(id) {
        this.state.notifications = this.state.notifications.filter(n => n.id !== id);
        this.saveToLocalStorage();
    }
    
    markNotificationAsRead(id) {
        const notification = this.state.notifications.find(n => n.id === id);
        if (notification) {
            notification.read = true;
            this.saveToLocalStorage();
        }
    }
    
    clearNotifications() {
        this.state.notifications = [];
        this.saveToLocalStorage();
    }
    
    // === GESTION DU MENU MOBILE ===
    toggleMobileMenu() {
        this.state.mobileMenuOpen = !this.state.mobileMenuOpen;
        this.updateMobileMenuUI();
    }
    
    closeMobileMenu() {
        this.state.mobileMenuOpen = false;
        this.updateMobileMenuUI();
    }
    
    updateMobileMenuUI() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('mobile-overlay');
        
        if (!sidebar || !overlay) return;
        
        if (this.state.mobileMenuOpen) {
            sidebar.classList.add('active');
            overlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        } else {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    }
    
    // === GESTION AUTO-FETCH ===
    setAutoFetch(enabled) {
        this.state.autoFetchEnabled = enabled;
        
        if (enabled && !this.state.autoFetchInterval) {
            this.startAutoFetch();
        } else if (!enabled && this.state.autoFetchInterval) {
            this.stopAutoFetch();
        }
        
        this.saveToLocalStorage();
    }
    
    startAutoFetch() {
        const interval = parseInt(document.getElementById('fetch-interval')?.value || 5) * 60000;
        
        this.state.autoFetchInterval = setInterval(() => {
            if (typeof ownerManager !== 'undefined' && this.state.autoFetchEnabled) {
                ownerManager.fetchNow();
            }
        }, interval);
    }
    
    stopAutoFetch() {
        if (this.state.autoFetchInterval) {
            clearInterval(this.state.autoFetchInterval);
            this.state.autoFetchInterval = null;
        }
    }
    
    // === CACHE LOCAL ===
    cacheData(key, data, ttl = 300000) { // 5 minutes par défaut
        const cacheItem = {
            data,
            timestamp: Date.now(),
            ttl,
            version: '1.0'
        };
        
        try {
            localStorage.setItem(`lotato_cache_${key}`, JSON.stringify(cacheItem));
        } catch (error) {
            console.error('Erreur cache:', error);
            this.clearOldCache();
        }
    }
    
    getCachedData(key) {
        try {
            const cacheItem = localStorage.getItem(`lotato_cache_${key}`);
            if (cacheItem) {
                const { data, timestamp, ttl } = JSON.parse(cacheItem);
                
                if (Date.now() - timestamp < ttl) {
                    return data;
                } else {
                    // Cache expiré
                    localStorage.removeItem(`lotato_cache_${key}`);
                }
            }
        } catch (error) {
            console.error('Erreur récupération cache:', error);
        }
        return null;
    }
    
    clearOldCache() {
        const now = Date.now();
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('lotato_cache_')) {
                try {
                    const item = JSON.parse(localStorage.getItem(key));
                    if (now - item.timestamp > item.ttl) {
                        localStorage.removeItem(key);
                    }
                } catch {
                    localStorage.removeItem(key);
                }
            }
        });
    }
    
    clearCache() {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('lotato_cache_')) {
                localStorage.removeItem(key);
            }
        });
    }
    
    // === LOCALSTORAGE ===
    saveToLocalStorage() {
        try {
            const stateToSave = {
                currentView: this.state.currentView,
                currentNumbersTab: this.state.currentNumbersTab,
                currentPublishTab: this.state.currentPublishTab,
                currentReportsTab: this.state.currentReportsTab,
                filters: this.state.filters,
                notifications: this.state.notifications,
                lastUpdate: this.state.lastUpdate
            };
            
            localStorage.setItem('lotato_state', JSON.stringify(stateToSave));
        } catch (error) {
            console.error('Erreur sauvegarde localStorage:', error);
        }
    }
    
    loadFromLocalStorage() {
        try {
            const savedState = localStorage.getItem('lotato_state');
            if (savedState) {
                const parsedState = JSON.parse(savedState);
                
                // Restaurer l'état
                this.state.currentView = parsedState.currentView || 'dashboard';
                this.state.currentNumbersTab = parsedState.currentNumbersTab || 'blocks';
                this.state.currentPublishTab = parsedState.currentPublishTab || 'manual';
                this.state.currentReportsTab = parsedState.currentReportsTab || 'sales';
                this.state.filters = parsedState.filters || this.state.filters;
                this.state.notifications = parsedState.notifications || [];
                this.state.lastUpdate = parsedState.lastUpdate;
                
                return true;
            }
        } catch (error) {
            console.error('Erreur chargement localStorage:', error);
        }
        return false;
    }
    
    // === MISE À JOUR UI ===
    updateUIStats(stats) {
        const updateElement = (id, value) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        };
        
        if (stats.totalUsers !== undefined) {
            updateElement('dashboard-users', stats.totalUsers);
            updateElement('total-users', stats.totalUsers);
        }
        
        if (stats.totalSales !== undefined) {
            updateElement('dashboard-sales', `${stats.totalSales.toLocaleString()} Gdes`);
            updateElement('total-sales', `${(stats.totalSales/1000).toFixed(1)}K`);
        }
        
        if (stats.onlineUsers !== undefined) {
            updateElement('online-users', stats.onlineUsers);
        }
        
        if (stats.totalTickets !== undefined) {
            updateElement('dashboard-tickets', stats.totalTickets);
        }
        
        if (stats.totalWins !== undefined) {
            updateElement('dashboard-wins', `${stats.totalWins.toLocaleString()} Gdes`);
        }
        
        if (stats.totalBlocks !== undefined) {
            updateElement('dashboard-blocks', stats.totalBlocks);
        }
        
        if (stats.totalDraws !== undefined) {
            updateElement('dashboard-draws', stats.totalDraws);
        }
    }
    
    // === UTILITAIRES ===
    formatNumber(num, decimals = 0) {
        return num.toLocaleString('fr-FR', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    }
    
    formatCurrency(amount, currency = 'Gdes') {
        return `${this.formatNumber(amount)} ${currency}`;
    }
    
    formatDate(date, format = 'full') {
        const d = new Date(date);
        
        switch (format) {
            case 'short':
                return d.toLocaleDateString('fr-FR');
            case 'time':
                return d.toLocaleTimeString('fr-FR');
            case 'datetime':
                return d.toLocaleString('fr-FR');
            default:
                return d.toLocaleDateString('fr-FR', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
        }
    }
    
    // === RÉINITIALISATION ===
    reset() {
        this.state = {
            currentView: 'dashboard',
            currentNumbersTab: 'blocks',
            currentPublishTab: 'manual',
            currentReportsTab: 'sales',
            autoFetchEnabled: false,
            autoFetchInterval: null,
            mobileMenuOpen: false,
            data: {
                dashboard: {
                    totalUsers: 0,
                    totalSales: 0,
                    onlineUsers: 0,
                    totalTickets: 0,
                    totalWins: 0,
                    totalBlocks: 0,
                    totalDraws: 0,
                    recentActivity: [],
                    alerts: []
                },
                users: {
                    supervisors: [],
                    agents: []
                },
                draws: [],
                numbers: {
                    blocked: [],
                    limits: {},
                    stats: {}
                },
                activity: [],
                rules: {},
                reports: {},
                settings: {},
                limits: {
                    users: [],
                    zones: [],
                    temporary: []
                }
            },
            filters: {
                activity: {
                    period: 'today',
                    type: 'all'
                }
            },
            notifications: [],
            lastUpdate: null,
            isOnline: navigator.onLine
        };
        
        localStorage.removeItem('lotato_state');
        this.clearCache();
    }
    
    // === EXPORT ===
    exportState(format = 'json') {
        const data = {
            state: this.state,
            timestamp: new Date().toISOString(),
            version: '1.0'
        };
        
        if (format === 'json') {
            return JSON.stringify(data, null, 2);
        } else if (format === 'csv') {
            // Convertir en CSV simplifié
            let csv = 'Type,Valeur\n';
            csv += `Total Utilisateurs,${this.state.data.dashboard.totalUsers}\n`;
            csv += `Ventes Totales,${this.state.data.dashboard.totalSales}\n`;
            csv += `Utilisateurs en Ligne,${this.state.data.dashboard.onlineUsers}\n`;
            return csv;
        }
        
        return data;
    }
}

// Exporter pour usage global
window.StateManager = StateManager;