// Application principale du superviseur
class SupervisorApp {
    constructor() {
        this.apiService = apiService;
        this.uiManager = uiManager;
        this.agentManager = agentManager;
        this.reportManager = reportManager;
        this.initApp();
    }

    // Initialisation de l'application
    async initApp() {
        try {
            console.log('🚀 Initialisation de l\'application superviseur...');
            
            // Vérifier la connexion Internet
            if (!this.uiManager.checkInternetConnection()) {
                this.uiManager.showError('Connexion Internet requise', 0);
                return;
            }
            
            // Vérifier l'authentification
            await this.verifyAuthentication();
            
            // Charger les données initiales
            await this.loadInitialData();
            
            // Initialiser les écouteurs d'événements globaux
            this.initGlobalEventHandlers();
            
            // Mettre à jour l'interface
            this.updateUI();
            
            console.log('✅ Application initialisée avec succès');
            this.uiManager.showSuccess('Tableau de bord chargé', 2000);
            
        } catch (error) {
            console.error('❌ Erreur initialisation application:', error);
            this.handleInitError(error);
        }
    }

    // Vérifier l'authentification
    async verifyAuthentication() {
        try {
            const userData = await this.apiService.verifyToken();
            
            if (!userData || !userData.user || userData.user.role !== 'supervisor') {
                throw new Error('Accès non autorisé');
            }
            
            // Configurer le superviseur
            SUPERVISOR_CONFIG.SUPERVISOR_ID = userData.user.id.replace('supervisor-', '');
            SUPERVISOR_CONFIG.SUPERVISOR_NAME = userData.user.name;
            
            // Récupérer les informations détaillées
            const supervisorInfo = await this.apiService.getSupervisorInfo();
            if (supervisorInfo) {
                SUPERVISOR_CONFIG.SUPERVISOR_EMAIL = supervisorInfo.email || '';
                SUPERVISOR_CONFIG.SUPERVISOR_PHONE = supervisorInfo.phone || '';
            }
            
        } catch (error) {
            console.error('Erreur authentification:', error);
            this.uiManager.showError(MESSAGES.ERROR.AUTH_FAILED);
            setTimeout(() => {
                this.logout();
            }, 2000);
            throw error;
        }
    }

    // Charger les données initiales
    async loadInitialData() {
        try {
            this.uiManager.toggleLoading(true, 'agents-dashboard-container');
            
            // Charger les agents
            await this.agentManager.loadSupervisorAgents();
            
            // Charger les rapports
            await this.reportManager.loadReports();
            
            // Charger les paramètres
            await this.loadSettings();
            
            // Mettre à jour les statistiques
            await this.updateDashboardStats();
            
        } catch (error) {
            console.error('Erreur chargement données:', error);
            throw error;
        }
    }

    // Charger les paramètres
    async loadSettings() {
        try {
            const settings = await this.apiService.getSupervisorSettings();
            this.uiManager.showSettingsForm(settings);
            this.uiManager.applyTheme(settings.theme);
        } catch (error) {
            console.error('Erreur chargement paramètres:', error);
            // Charger les paramètres par défaut
            this.uiManager.resetSettings();
        }
    }

    // Initialiser les gestionnaires d'événements globaux
    initGlobalEventHandlers() {
        // Changement de vue
        EVENT_HANDLERS.onViewChange = (viewName, element) => {
            this.switchView(viewName);
        };
        
        // Actualisation des données
        EVENT_HANDLERS.onDataRefresh = () => {
            this.refreshAllData();
        };
        
        // Déconnexion
        EVENT_HANDLERS.onLogout = () => {
            this.logout();
        };
        
        // Gestion des erreurs globales
        window.addEventListener('error', (event) => {
            console.error('Erreur globale:', event.error);
            this.uiManager.showError('Une erreur est survenue');
        });
        
        // Gestion des promesses non capturées
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Promesse non capturée:', event.reason);
            this.uiManager.showError('Erreur de traitement');
        });
        
        // Gestion de la connexion/réseau
        window.addEventListener('online', () => {
            this.uiManager.showSuccess('Connexion rétablie');
            this.refreshAllData();
        });
        
        window.addEventListener('offline', () => {
            this.uiManager.showError('Connexion perdue', 0);
        });
        
        // Prévention de la fermeture avec des données non sauvegardées
        window.addEventListener('beforeunload', (event) => {
            if (SUPERVISOR_STATE.isLoading) {
                event.preventDefault();
                event.returnValue = 'Des données sont en cours de chargement. Quitter quand même?';
            }
        });
    }

    // Mettre à jour le tableau de bord
    async updateDashboardStats() {
        try {
            const reports = await this.apiService.getSupervisorReports();
            const activeAgents = SUPERVISOR_STATE.agents.filter(a => a.active).length;
            const totalTickets = reports.totalTickets || 0;
            const todaySales = reports.totalSales || 0;
            const totalCommission = DATA_FORMATTERS.calculateCommission(todaySales, 0.05);
            
            // Mettre à jour les statistiques principales
            const activeAgentsElement = document.getElementById('active-agents');
            const todaySalesElement = document.getElementById('today-sales');
            const totalTicketsElement = document.getElementById('total-tickets');
            const totalCommissionElement = document.getElementById('total-commission');
            
            if (activeAgentsElement) activeAgentsElement.textContent = activeAgents;
            if (todaySalesElement) todaySalesElement.textContent = DATA_FORMATTERS.formatCurrency(todaySales);
            if (totalTicketsElement) totalTicketsElement.textContent = totalTickets;
            if (totalCommissionElement) totalCommissionElement.textContent = DATA_FORMATTERS.formatCurrency(totalCommission);
            
            // Mettre à jour l'en-tête
            this.uiManager.updateHeaderStats(
                activeAgents,
                `${(todaySales/1000).toFixed(1)}K`,
                `${((reports.totalWins || 0)/1000).toFixed(1)}K`
            );
            
            // Mettre à jour les informations du superviseur
            this.uiManager.updateSupervisorInfo(
                SUPERVISOR_CONFIG.SUPERVISOR_NAME,
                SUPERVISOR_CONFIG.SUPERVISOR_EMAIL,
                SUPERVISOR_CONFIG.SUPERVISOR_PHONE
            );
            
        } catch (error) {
            console.error('Erreur mise à jour statistiques:', error);
        }
    }

    // Changer de vue
    switchView(viewName) {
        this.uiManager.switchView(viewName);
        
        // Charger les données spécifiques à la vue
        switch(viewName) {
            case 'agents':
                this.agentManager.renderFullAgentList();
                break;
            case 'reports':
                this.reportManager.loadReports();
                break;
            case 'winners':
                // À implémenter
                break;
            case 'settings':
                this.loadSettings();
                break;
        }
    }

    // Actualiser toutes les données
    async refreshAllData() {
        if (!this.uiManager.checkInternetConnection()) return;
        
        try {
            this.uiManager.toggleLoading(true, 'agents-dashboard-container');
            
            // Recharger les agents
            await this.agentManager.loadSupervisorAgents();
            
            // Recharger les rapports si on est sur la vue des rapports
            if (SUPERVISOR_STATE.currentView === 'reports') {
                await this.reportManager.loadReports();
            }
            
            // Mettre à jour les statistiques
            await this.updateDashboardStats();
            
            this.uiManager.showSuccess('Données actualisées');
            
        } catch (error) {
            console.error('Erreur actualisation données:', error);
            this.uiManager.showError('Erreur lors de l\'actualisation');
        }
    }

    // Mettre à jour l'interface
    updateUI() {
        // Rien pour le moment, mais peut être utilisé pour des mises à jour UI supplémentaires
    }

    // Gérer les erreurs d'initialisation
    handleInitError(error) {
        if (error.message.includes('Accès non autorisé') || 
            error.message.includes('Authentification échouée')) {
            this.uiManager.showError('Session expirée. Redirection...');
            setTimeout(() => {
                this.logout();
            }, 2000);
        } else {
            this.uiManager.showError('Erreur d\'initialisation');
        }
    }

    // Déconnexion
    async logout() {
        const confirmed = await this.uiManager.showConfirm(
            MESSAGES.CONFIRM.LOGOUT,
            'Déconnexion'
        );
        
        if (!confirmed) return;
        
        try {
            await this.apiService.logout();
            
            // Nettoyer le stockage local
            STORAGE.clear();
            
            // Rediriger vers la page de connexion
            window.location.href = 'index.html';
            
        } catch (error) {
            console.error('Erreur déconnexion:', error);
            this.uiManager.showError('Erreur lors de la déconnexion');
            
            // Forcer la redirection en cas d'erreur
            setTimeout(() => {
                STORAGE.clear();
                window.location.href = 'index.html';
            }, 1000);
        }
    }

    // Gestion des erreurs d'API
    handleApiError(error) {
        if (error.message.includes('401') || error.message.includes('403')) {
            this.uiManager.showError('Session expirée. Redirection...');
            setTimeout(() => {
                this.logout();
            }, 2000);
            return true;
        }
        return false;
    }
}

// Initialiser l'application lorsque le DOM est chargé
document.addEventListener('DOMContentLoaded', () => {
    // Créer l'instance de l'application
    window.supervisorApp = new SupervisorApp();
});

// Service Worker pour le mode hors ligne (optionnel)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(error => {
            console.log('Service Worker registration failed:', error);
        });
    });
}