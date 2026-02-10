// Gestionnaire principal de l'application - COMPLÉTÉ
class OwnerManager {
    constructor() {
        this.stateManager = new StateManager();
        this.uiManager = new UIManager(this.stateManager);
        this.userManager = new UserManager(this.uiManager, this.stateManager);
        this.drawManager = new DrawManager(this.uiManager, this.stateManager);
        this.numberManager = new NumberManager(this.uiManager, this.stateManager);
        
        this.init();
    }

    async init() {
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) {
                window.location.href = '/login.html';
                return;
            }

            try {
                await ApiService.verifyToken();
            } catch (error) {
                console.error('Token invalide:', error);
                localStorage.removeItem('auth_token');
                localStorage.removeItem('refresh_token');
                window.location.href = '/login.html';
                return;
            }

            document.getElementById('admin-name').textContent = 'ADMIN PROPRIÉTAIRE';
            this.uiManager.init();
            await this.loadInitialData();
            
            console.log('Panneau propriétaire LOTATO initialisé');
            
        } catch (error) {
            console.error('Erreur lors de l\'initialisation:', error);
            this.uiManager.showNotification('Erreur de chargement des données', 'error');
            this.showFallbackUI();
        }
    }

    async loadInitialData() {
        try {
            const [dashboardData, usersData, drawsData, numbersData, activityData] = await Promise.all([
                ApiService.getDashboardData().catch(() => ({})),
                ApiService.getUsers().catch(() => ({ supervisors: [], agents: [] })),
                ApiService.getDraws().catch(() => []),
                ApiService.getNumbers().catch(() => ({ blocked: [], limits: {} })),
                ApiService.getActivityLog().catch(() => [])
            ]);

            this.stateManager.setData('dashboard', dashboardData);
            this.stateManager.setData('users', usersData);
            this.stateManager.setData('draws', drawsData);
            this.stateManager.setData('numbers', numbersData);
            this.stateManager.setData('activity', activityData);

            this.stateManager.updateUIStats(dashboardData);
            this.uiManager.renderRecentActivity();
            this.uiManager.loadAlerts();

            this.stateManager.cacheData('dashboard', dashboardData);
            this.stateManager.cacheData('users', usersData);
            
        } catch (error) {
            console.error('Erreur chargement données initiales:', error);
            throw error;
        }
    }

    showFallbackUI() {
        const dashboardView = document.getElementById('dashboard-view');
        if (dashboardView) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.style.cssText = `
                background: #fff5f5;
                border: 2px solid var(--danger);
                border-radius: 15px;
                padding: 20px;
                margin: 20px 0;
                text-align: center;
            `;
            errorDiv.innerHTML = `
                <h3 style="color: var(--danger); margin-bottom: 10px;">
                    <i class="fas fa-exclamation-triangle"></i> Connexion limitée
                </h3>
                <p>Impossible de se connecter au serveur. Certaines fonctionnalités peuvent être limitées.</p>
                <button class="btn btn-primary" onclick="location.reload()" style="margin-top: 10px;">
                    <i class="fas fa-sync"></i> Réessayer
                </button>
            `;
            dashboardView.appendChild(errorDiv);
        }
    }

    // Méthodes de navigation
    switchView(viewName) {
        this.uiManager.switchView(viewName);
    }

    switchPublishTab(tabName) {
        this.uiManager.switchPublishTab(tabName);
    }

    switchNumbersTab(tabName) {
        this.uiManager.switchNumbersTab(tabName);
    }

    switchReportsTab(tabName) {
        this.uiManager.switchReportsTab(tabName);
    }

    // Méthodes pour le menu mobile
    toggleMobileMenu() {
        this.stateManager.toggleMobileMenu();
    }

    closeMobileMenu() {
        this.stateManager.closeMobileMenu();
    }

    // Méthodes pour les modals
    showCreateUserModal(type) {
        this.userManager.showCreateUserModal(type);
    }

    closeModal(modalId = 'create-user-modal') {
        this.uiManager.closeModal(modalId);
    }

    // Méthodes pour les utilisateurs
    async createUser(event) {
        await this.userManager.createUser(event);
    }

    async toggleUserBlock(userId, blocked) {
        await this.userManager.toggleUserBlock(userId, blocked);
    }

    async editUser(userId) {
        await this.userManager.editUser(userId);
    }

    async updateUser(userId, event) {
        await this.userManager.updateUser(userId, event);
    }

    async transferAgent(agentId) {
        await this.userManager.transferAgent(agentId);
    }

    async confirmTransfer(agentId, event) {
        await this.userManager.confirmTransfer(agentId, event);
    }

    async viewSupervisorAgents(supervisorId) {
        await this.userManager.viewSupervisorAgents(supervisorId);
    }

    async exportUsersData() {
        await this.userManager.exportUsersData();
    }

    // Méthodes pour les tirages
    async publishDrawManually(event) {
        await this.drawManager.publishDrawManually(event);
    }

    updateResultPreview() {
        this.uiManager.updateResultPreview();
    }

    generateRandomResults() {
        this.uiManager.generateRandomResults();
    }

    async toggleAutoFetch() {
        await this.drawManager.toggleAutoFetch();
    }

    async fetchNow() {
        await this.drawManager.fetchNow();
    }

    async testFetch() {
        await this.drawManager.testFetch();
    }

    async toggleDrawBlock(drawId, blocked) {
        await this.drawManager.toggleDrawBlock(drawId, blocked);
    }

    async viewDrawDetails(drawId) {
        await this.drawManager.viewDrawDetails(drawId);
    }

    async editDraw(drawId) {
        await this.drawManager.editDraw(drawId);
    }

    async updateDraw(drawId, event) {
        await this.drawManager.updateDraw(drawId, event);
    }

    async forcePublishDraw(drawId) {
        await this.drawManager.forcePublishDraw(drawId);
    }

    async scheduleDraw(drawId) {
        await this.drawManager.scheduleDraw(drawId);
    }

    async confirmSchedule(drawId, event) {
        await this.drawManager.confirmSchedule(drawId, event);
    }

    // Méthodes pour les numéros
    async blockNumber() {
        await this.numberManager.blockNumber();
    }

    async toggleNumberBlock(number) {
        await this.numberManager.toggleNumberBlock(number);
    }

    async unblockSelected() {
        await this.numberManager.unblockSelected();
    }

    async configureAutoBlock() {
        await this.numberManager.configureAutoBlock();
    }

    async addNumberLimit() {
        await this.numberManager.addNumberLimit();
    }

    async editNumberLimit(number) {
        await this.numberManager.editNumberLimit(number);
    }

    async updateNumberLimit(number, event) {
        await this.numberManager.updateNumberLimit(number, event);
    }

    async removeNumberLimit(number) {
        await this.numberManager.removeNumberLimit(number);
    }

    async adjustAllLimits(direction) {
        await this.numberManager.adjustAllLimits(direction);
    }

    async resetAllLimits() {
        await this.numberManager.resetAllLimits();
    }

    async viewNumberHistory(number) {
        await this.numberManager.viewNumberHistory(number);
    }

    // NOUVELLES MÉTHODES AJOUTÉES

    async loadLimitsTab() {
        await this.numberManager.loadLimitsTab();
    }

    async loadBlocksTab() {
        await this.numberManager.loadBlocksTab();
    }

    async loadNumbersStats() {
        await this.numberManager.loadNumbersStats();
    }

    async loadPublishHistory() {
        await this.drawManager.loadPublishHistory();
    }

    async saveLimitsConfig() {
        try {
            await this.uiManager.saveLimitsConfig();
        } catch (error) {
            console.error('Erreur sauvegarde limites:', error);
            this.uiManager.showNotification('Erreur lors de la sauvegarde des limites', 'error');
        }
    }

    // Méthodes utilitaires
    showNotification(message, type = 'success') {
        this.uiManager.showNotification(message, type);
    }

    async logout() {
        if (confirm('Déconnexion du panneau propriétaire?')) {
            try {
                await ApiService.logout();
            } catch (error) {
                console.error('Erreur déconnexion:', error);
            } finally {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('refresh_token');
                this.stateManager.reset();
                window.location.href = '/login.html';
            }
        }
    }

    // Méthodes de filtrage
    filterActivity() {
        const period = document.getElementById('activity-period').value;
        const type = document.getElementById('activity-type').value;
        
        this.stateManager.setFilter('activity', { period, type });
        this.uiManager.loadActivityData();
    }

    async exportActivity() {
        try {
            const format = 'csv';
            await ApiService.exportActivity(format);
            
            this.uiManager.showNotification('Journal exporté avec succès', 'success');
        } catch (error) {
            console.error('Erreur export journal:', error);
            this.uiManager.showNotification(error.message || 'Erreur lors de l\'export', 'error');
        }
    }

    // Méthodes pour les règles
    async saveRules() {
        try {
            await this.uiManager.saveRules();
        } catch (error) {
            console.error('Erreur sauvegarde règles:', error);
            this.uiManager.showNotification('Erreur lors de la sauvegarde des règles', 'error');
        }
    }

    async resetRules() {
        await this.uiManager.resetRules();
    }

    // Méthodes pour les rapports
    async loadReport(reportType) {
        await this.uiManager.loadReport(reportType);
    }

    // Méthodes pour charger les vues
    renderDrawsView() {
        this.drawManager.renderDrawsView();
    }
}

// Initialiser l'application
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    
    window.ownerManager = new OwnerManager();
});

// Gestionnaire d'erreurs global
window.addEventListener('error', (event) => {
    console.error('Erreur globale:', event.error);
    
    if (typeof ownerManager !== 'undefined' && ownerManager.showNotification) {
        ownerManager.showNotification(
            'Une erreur est survenue dans l\'application',
            'error'
        );
    }
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Promesse non gérée:', event.reason);
    
    if (typeof ownerManager !== 'undefined' && ownerManager.showNotification) {
        ownerManager.showNotification(
            'Une erreur asynchrone est survenue',
            'error'
        );
    }
});

// Gestion du mode hors ligne
window.addEventListener('online', () => {
    if (typeof ownerManager !== 'undefined') {
        ownerManager.showNotification('Connexion rétablie', 'success');
        setTimeout(() => {
            if (ownerManager.loadInitialData) {
                ownerManager.loadInitialData().catch(() => {});
            }
        }, 1000);
    }
});

window.addEventListener('offline', () => {
    if (typeof ownerManager !== 'undefined') {
        ownerManager.showNotification('Vous êtes hors ligne', 'warning');
    }
});