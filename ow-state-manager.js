// État de l'application - CORRIGÉ
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
                dashboard: null,
                users: { supervisors: [], agents: [] },
                draws: [],
                numbers: { blocked: [], limits: {}, stats: {} },
                activity: [],
                rules: {},
                reports: {},
                alerts: [],
                settings: {}
            },
            filters: {
                activity: {
                    period: 'today',
                    type: 'all'
                }
            },
            notifications: []
        };
    }

    // Getters
    getCurrentView() {
        return this.state.currentView;
    }

    getData(key) {
        return key ? this.state.data[key] : this.state.data;
    }

    getFilter(key) {
        return this.state.filters[key];
    }

    // Setters
    setCurrentView(view) {
        this.state.currentView = view;
        this.saveToLocalStorage();
    }

    setData(key, value) {
        this.state.data[key] = value;
        this.saveToLocalStorage();
    }

    setFilter(filterKey, value) {
        this.state.filters[filterKey] = value;
        this.saveToLocalStorage();
    }

    // Gestion des notifications
    addNotification(message, type = 'info', duration = 5000) {
        const notification = {
            id: Date.now(),
            message,
            type,
            timestamp: new Date(),
            duration
        };
        
        this.state.notifications.push(notification);
        
        // Limiter à 50 notifications maximum
        if (this.state.notifications.length > 50) {
            this.state.notifications.shift();
        }
        
        this.saveToLocalStorage();
        return notification;
    }

    removeNotification(id) {
        this.state.notifications = this.state.notifications.filter(n => n.id !== id);
        this.saveToLocalStorage();
    }

    clearNotifications() {
        this.state.notifications = [];
        this.saveToLocalStorage();
    }

    // Gestion du mobile menu
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
        
        if (sidebar) {
            if (this.state.mobileMenuOpen) {
                sidebar.classList.add('active');
                if (overlay) overlay.classList.add('active');
            } else {
                sidebar.classList.remove('active');
                if (overlay) overlay.classList.remove('active');
            }
        }
    }

    // Gestion du localStorage
    saveToLocalStorage() {
        try {
            const stateToSave = {
                currentView: this.state.currentView,
                currentNumbersTab: this.state.currentNumbersTab,
                currentPublishTab: this.state.currentPublishTab,
                currentReportsTab: this.state.currentReportsTab,
                filters: this.state.filters,
                notifications: this.state.notifications
            };
            
            localStorage.setItem('lotato_owner_state', JSON.stringify(stateToSave));
        } catch (error) {
            console.error('Erreur lors de la sauvegarde dans localStorage:', error);
        }
    }

    loadFromLocalStorage() {
        try {
            const savedState = localStorage.getItem('lotato_owner_state');
            if (savedState) {
                const parsedState = JSON.parse(savedState);
                
                // Restaurer l'état
                this.state.currentView = parsedState.currentView || 'dashboard';
                this.state.currentNumbersTab = parsedState.currentNumbersTab || 'blocks';
                this.state.currentPublishTab = parsedState.currentPublishTab || 'manual';
                this.state.currentReportsTab = parsedState.currentReportsTab || 'sales';
                this.state.filters = parsedState.filters || this.state.filters;
                this.state.notifications = parsedState.notifications || [];
                
                return true;
            }
        } catch (error) {
            console.error('Erreur lors du chargement depuis localStorage:', error);
        }
        return false;
    }

    // Gestion de l'auto-fetch
    setAutoFetch(enabled) {
        this.state.autoFetchEnabled = enabled;
        
        if (enabled && !this.state.autoFetchInterval) {
            this.startAutoFetch();
        } else if (!enabled && this.state.autoFetchInterval) {
            this.stopAutoFetch();
        }
    }

    startAutoFetch() {
        const interval = parseInt(document.getElementById('fetch-interval')?.value || 5) * 60000;
        
        this.state.autoFetchInterval = setInterval(() => {
            if (typeof ownerManager !== 'undefined' && ownerManager.fetchNow) {
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

    // Gestion des données temporaires
    cacheData(key, data, ttl = 300000) {
        const cacheItem = {
            data,
            timestamp: Date.now(),
            ttl
        };
        
        localStorage.setItem(`lotato_cache_${key}`, JSON.stringify(cacheItem));
    }

    getCachedData(key) {
        try {
            const cacheItem = localStorage.getItem(`lotato_cache_${key}`);
            if (cacheItem) {
                const { data, timestamp, ttl } = JSON.parse(cacheItem);
                
                if (Date.now() - timestamp < ttl) {
                    return data;
                } else {
                    localStorage.removeItem(`lotato_cache_${key}`);
                }
            }
        } catch (error) {
            console.error('Erreur lors de la récupération du cache:', error);
        }
        return null;
    }

    clearCache() {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('lotato_cache_')) {
                localStorage.removeItem(key);
            }
        });
    }

    // Méthodes utilitaires
    updateDashboardStats(stats) {
        if (stats) {
            this.state.data.dashboard = { ...this.state.data.dashboard, ...stats };
            this.updateUIStats(stats);
        }
    }

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

    // Réinitialisation
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
                dashboard: null,
                users: { supervisors: [], agents: [] },
                draws: [],
                numbers: { blocked: [], limits: {}, stats: {} },
                activity: [],
                rules: {},
                reports: {},
                alerts: [],
                settings: {}
            },
            filters: {
                activity: {
                    period: 'today',
                    type: 'all'
                }
            },
            notifications: []
        };
        
        localStorage.removeItem('lotato_owner_state');
        this.clearCache();
    }
}