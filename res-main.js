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
            
            // Mettre à jour les statistiques
            await this.updateDashboardStats();
            
        } catch (error) {
            console.error('Erreur chargement données:', error);
            throw error;
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
            document.getElementById('active-agents').textContent = activeAgents;
            document.getElementById('today-sales').textContent = DATA_FORMATTERS.formatCurrency(todaySales);
            document.getElementById('total-tickets').textContent = totalTickets;
            document.getElementById('total-commission').textContent = DATA_FORMATTERS.formatCurrency(totalCommission);
            
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
                // À implémenter
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
    
    // Ajouter des styles supplémentaires dynamiquement
    const additionalStyles = `
        .performance-excellent { color: var(--success) !important; }
        .performance-good { color: #28a745 !important; }
        .performance-average { color: var(--warning) !important; }
        .performance-poor { color: var(--danger) !important; }
        
        .sales-stats-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
        }
        
        .sales-stat-card {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 10px;
            text-align: center;
        }
        
        .sales-stat-value {
            font-size: 20px;
            font-weight: bold;
            color: var(--primary);
            margin-top: 5px;
        }
        
        .sales-stat-value.success {
            color: var(--success);
        }
        
        .win-card {
            background: linear-gradient(135deg, #28a745, #20c997);
            color: white;
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 10px;
        }
        
        .win-card.pending {
            background: linear-gradient(135deg, #ffc107, #fd7e14);
        }
        
        .win-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        
        .win-amount {
            font-size: 18px;
            font-weight: bold;
        }
        
        .detailed-report {
            background: white;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.05);
        }
        
        .report-summary {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin-bottom: 20px;
        }
        
        .summary-item {
            display: flex;
            justify-content: space-between;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 8px;
        }
        
        .reports-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 20px;
        }
        
        .report-card {
            background: white;
            border-radius: 15px;
            padding: 20px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.05);
        }
        
        @media (min-width: 768px) {
            .reports-grid {
                grid-template-columns: repeat(2, 1fr);
            }
            
            .report-card.summary-card {
                grid-column: 1 / -1;
            }
        }
        
        @media (min-width: 992px) {
            .reports-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }
    `;
    
    const styleSheet = document.createElement('style');
    styleSheet.textContent = additionalStyles;
    document.head.appendChild(styleSheet);
});

// Service Worker pour le mode hors ligne (optionnel)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(error => {
            console.log('Service Worker registration failed:', error);
        });
    });
}