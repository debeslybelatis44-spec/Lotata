// Gestionnaire d'interface utilisateur
class UIManager {
    constructor(stateManager) {
        this.stateManager = stateManager;
        this.notificationContainer = null;
        this.initNotifications();
    }

    // Initialisation
    init() {
        this.initEventListeners();
        this.initResponsiveHandlers();
        this.restoreUIState();
    }

    initEventListeners() {
        // Écouteur pour la prévisualisation des résultats
        const form = document.getElementById('manual-publish-form');
        if (form) {
            form.querySelectorAll('input[type="number"]').forEach(input => {
                input.addEventListener('input', () => this.updateResultPreview());
            });
        }

        // Écouteur pour les changements de vue sur mobile
        window.addEventListener('resize', () => this.handleResize());
        
        // Écouteur pour fermer les modals avec ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });
        
        // Écouteur pour les clics en dehors des modals
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModal(e.target.id);
            }
        });
    }

    initResponsiveHandlers() {
        // Détecter l'orientation et ajuster l'UI
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                this.adjustUIForScreenSize();
            }, 100);
        });
    }

    initNotifications() {
        // Créer le conteneur de notifications s'il n'existe pas
        if (!document.getElementById('notifications-container')) {
            this.notificationContainer = document.createElement('div');
            this.notificationContainer.id = 'notifications-container';
            this.notificationContainer.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                display: flex;
                flex-direction: column;
                gap: 10px;
                max-width: 400px;
            `;
            document.body.appendChild(this.notificationContainer);
        } else {
            this.notificationContainer = document.getElementById('notifications-container');
        }
    }

    // Gestion des vues
    switchView(viewName) {
        // Mettre à jour les éléments de navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const clickedItem = event.target.closest('.nav-item');
        if (clickedItem) {
            clickedItem.classList.add('active');
        }
        
        // Cacher toutes les vues
        document.querySelectorAll('.view-content').forEach(view => {
            view.style.display = 'none';
        });
        
        // Afficher la vue sélectionnée
        const viewElement = document.getElementById(`${viewName}-view`);
        if (viewElement) {
            viewElement.style.display = 'block';
            this.stateManager.setCurrentView(viewName);
            
            // Fermer le menu mobile si ouvert
            if (window.innerWidth <= 768) {
                this.stateManager.closeMobileMenu();
            }
            
            // Charger les données spécifiques à la vue
            this.loadViewData(viewName);
        }
    }

    switchPublishTab(tabName) {
        document.querySelectorAll('#publish-view .tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        if (event.target) {
            event.target.classList.add('active');
        } else {
            // Si appelé programmatiquement, trouver le bon tab
            const tab = document.querySelector(`#publish-view .tab[onclick*="${tabName}"]`);
            if (tab) tab.classList.add('active');
        }
        
        document.querySelectorAll('#publish-view .tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        const tabElement = document.getElementById(`${tabName}-publish-tab`);
        if (tabElement) {
            tabElement.classList.add('active');
            this.stateManager.state.currentPublishTab = tabName;
            
            if (tabName === 'history') {
                this.loadPublishHistory();
            } else if (tabName === 'auto') {
                this.updateFetchStatus();
                this.loadFetchLog();
            }
        }
    }

    switchNumbersTab(tabName) {
        document.querySelectorAll('#numbers-view .tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        if (event.target) {
            event.target.classList.add('active');
        }
        
        document.querySelectorAll('#numbers-view .tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        const tabElement = document.getElementById(`${tabName}-tab`);
        if (tabElement) {
            tabElement.classList.add('active');
            this.stateManager.state.currentNumbersTab = tabName;
            
            if (tabName === 'blocks') {
                this.loadBlocksTab();
            } else if (tabName === 'limits') {
                this.loadLimitsTab();
            } else if (tabName === 'stats') {
                this.loadNumbersStats();
            }
        }
    }

    switchReportsTab(tabName) {
        document.querySelectorAll('#reports-view .tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        if (event.target) {
            event.target.classList.add('active');
        }
        
        document.querySelectorAll('#reports-view .tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        const tabElement = document.getElementById(`${tabName}-reports-tab`);
        if (tabElement) {
            tabElement.classList.add('active');
            this.stateManager.state.currentReportsTab = tabName;
            this.loadReport(tabName);
        }
    }

    // Chargement des données de vue
    loadViewData(viewName) {
        switch(viewName) {
            case 'dashboard':
                this.loadDashboardData();
                break;
            case 'users':
                this.loadUsersData();
                break;
            case 'draws':
                this.loadDrawsData();
                break;
            case 'publish':
                this.loadPublishData();
                break;
            case 'numbers':
                this.loadNumbersData();
                break;
            case 'activity':
                this.loadActivityData();
                break;
            case 'rules':
                this.loadRulesData();
                break;
            case 'limits':
                this.loadLimitsData();
                break;
            case 'reports':
                this.loadReportsData();
                break;
        }
    }

    async loadDashboardData() {
        try {
            const cachedData = this.stateManager.getCachedData('dashboard');
            if (cachedData) {
                this.stateManager.updateDashboardStats(cachedData);
                this.renderRecentActivity();
                return;
            }
            
            const data = await ApiService.getDashboardData();
            this.stateManager.cacheData('dashboard', data);
            this.stateManager.updateDashboardStats(data);
            this.renderRecentActivity();
            
            // Charger les alertes
            this.loadAlerts();
            
        } catch (error) {
            console.error('Erreur chargement dashboard:', error);
            this.showNotification('Erreur de chargement du tableau de bord', 'error');
        }
    }

    async loadUsersData() {
        try {
            const data = await ApiService.getUsers();
            this.stateManager.setData('users', data);
            this.renderUsersView();
        } catch (error) {
            console.error('Erreur chargement utilisateurs:', error);
            this.showNotification('Erreur de chargement des utilisateurs', 'error');
        }
    }

    async loadDrawsData() {
        try {
            const data = await ApiService.getDraws();
            this.stateManager.setData('draws', data);
            this.renderDrawsView();
        } catch (error) {
            console.error('Erreur chargement tirages:', error);
            this.showNotification('Erreur de chargement des tirages', 'error');
        }
    }

    loadPublishData() {
        this.updateResultPreview();
        this.updateFetchStatus();
        this.loadFetchLog();
    }

    async loadNumbersData() {
        try {
            const data = await ApiService.getNumbers();
            this.stateManager.setData('numbers', data);
            
            if (this.stateManager.state.currentNumbersTab === 'blocks') {
                this.loadBlocksTab();
            } else if (this.stateManager.state.currentNumbersTab === 'limits') {
                this.loadLimitsTab();
            }
        } catch (error) {
            console.error('Erreur chargement numéros:', error);
            this.showNotification('Erreur de chargement des numéros', 'error');
        }
    }

    async loadActivityData() {
        try {
            const filters = this.stateManager.getFilter('activity');
            const data = await ApiService.getActivityLog(filters);
            this.stateManager.setData('activity', data);
            this.renderActivityView();
        } catch (error) {
            console.error('Erreur chargement activité:', error);
            this.showNotification('Erreur de chargement du journal', 'error');
        }
    }

    async loadRulesData() {
        try {
            const data = await ApiService.getRules();
            this.stateManager.setData('rules', data);
            this.renderRulesView();
        } catch (error) {
            console.error('Erreur chargement règles:', error);
            this.showNotification('Erreur de chargement des règles', 'error');
        }
    }

    async loadLimitsData() {
        // Implémentation spécifique pour les limites
        this.renderLimitsView();
    }

    async loadReportsData() {
        const tabName = this.stateManager.state.currentReportsTab;
        this.loadReport(tabName);
    }

    // Rendu des vues
    renderRecentActivity() {
        const container = document.getElementById('recent-activity');
        const activities = this.stateManager.getData('activity') || [];
        
        if (activities.length === 0) {
            container.innerHTML = '<p style="color: var(--text-dim); text-align: center; padding: 20px;">Aucune activité récente</p>';
            return;
        }
        
        const recentActivities = activities.slice(0, 5);
        container.innerHTML = recentActivities.map(activity => `
            <div class="activity-item">
                <div class="activity-icon">
                    <i class="fas fa-${this.getActivityIcon(activity.type)}"></i>
                </div>
                <div class="activity-content">
                    <div class="activity-message">${activity.message}</div>
                    <div class="activity-meta">
                        <span class="activity-time">${this.formatTime(new Date(activity.timestamp))}</span>
                        <span class="activity-user">• Par ${activity.user || 'Système'}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    renderUsersView() {
        this.renderSupervisors();
        this.renderAgents();
    }

    renderSupervisors() {
        const container = document.getElementById('supervisors-container');
        const supervisors = this.stateManager.getData('users').supervisors || [];
        
        if (supervisors.length === 0) {
            container.innerHTML = '<p class="no-data">Aucun superviseur trouvé</p>';
            return;
        }
        
        container.innerHTML = supervisors.map(supervisor => this.createUserCard(supervisor, 'supervisor')).join('');
    }

    renderAgents() {
        const container = document.getElementById('agents-container');
        const agents = this.stateManager.getData('users').agents || [];
        
        if (agents.length === 0) {
            container.innerHTML = '<p class="no-data">Aucun agent trouvé</p>';
            return;
        }
        
        container.innerHTML = agents.map(agent => this.createUserCard(agent, 'agent')).join('');
    }

    createUserCard(user, type) {
        return `
            <div class="user-card ${user.blocked ? 'blocked' : ''}">
                <div class="user-header">
                    <div class="user-type type-${type}">${type === 'agent' ? 'AGENT' : 'SUPERVISEUR'}</div>
                    <div class="user-status">
                        <span class="status-dot ${user.online ? 'online' : 'offline'}"></span>
                        ${user.online ? 'En ligne' : 'Hors ligne'}
                    </div>
                </div>
                <div class="user-info">
                    <h4>${user.name}</h4>
                    <div class="user-details">
                        <p><strong>ID:</strong> ${user.id}</p>
                        <p><strong>Email:</strong> ${user.email}</p>
                        <p><strong>Téléphone:</strong> ${user.phone}</p>
                        ${type === 'agent' ? 
                            `<p><strong>Superviseur:</strong> ${user.supervisorName || 'Non assigné'}</p>
                             <p><strong>Commission:</strong> ${user.commission || 5}%</p>` :
                            `<p><strong>Agents:</strong> ${user.agentsCount || 0}</p>`
                        }
                    </div>
                </div>
                <div class="user-stats">
                    <div class="user-stat">
                        <div class="stat-label">Ventes</div>
                        <div class="stat-value">${user.sales || 0} Gdes</div>
                    </div>
                    <div class="user-stat">
                        <div class="stat-label">Depuis</div>
                        <div class="stat-value">${new Date(user.createdAt).toLocaleDateString()}</div>
                    </div>
                </div>
                <div class="user-actions">
                    <button class="btn ${user.blocked ? 'btn-success' : 'btn-danger'} btn-small" 
                            onclick="ownerManager.toggleUserBlock('${user.id}', ${!user.blocked})">
                        ${user.blocked ? 'Débloquer' : 'Bloquer'}
                    </button>
                    <button class="btn btn-warning btn-small" onclick="ownerManager.editUser('${user.id}')">
                        Éditer
                    </button>
                    ${type === 'agent' ? 
                        `<button class="btn btn-secondary btn-small" onclick="ownerManager.transferAgent('${user.id}')">
                            Transférer
                        </button>` :
                        `<button class="btn btn-secondary btn-small" onclick="ownerManager.viewSupervisorAgents('${user.id}')">
                            Voir Agents
                        </button>`
                    }
                </div>
            </div>
        `;
    }

    // Publications
    updateResultPreview() {
        const form = document.getElementById('manual-publish-form');
        if (!form) return;
        
        const preview = document.getElementById('result-preview');
        const inputs = form.querySelectorAll('input[type="number"]');
        const numbers = Array.from(inputs)
            .filter(input => !input.name.includes('luckyNumber'))
            .map(input => input.value || '00');
        
        preview.innerHTML = numbers.map(num => 
            `<div class="preview-number">${num.toString().padStart(2, '0')}</div>`
        ).join('');
    }

    generateRandomResults() {
        const form = document.getElementById('manual-publish-form');
        if (!form) return;
        
        const inputs = form.querySelectorAll('input[type="number"]');
        inputs.forEach(input => {
            if (!input.name.includes('luckyNumber')) {
                input.value = Math.floor(Math.random() * 100);
            }
        });
        
        this.updateResultPreview();
        this.showNotification('Numéros aléatoires générés', 'info');
    }

    updateFetchStatus() {
        const indicator = document.getElementById('fetch-status-indicator');
        const statusText = document.getElementById('fetch-status-text');
        
        if (this.stateManager.state.autoFetchEnabled) {
            indicator.className = 'status-indicator status-active';
            statusText.textContent = 'Récupération automatique activée';
        } else {
            indicator.className = 'status-indicator status-inactive';
            statusText.textContent = 'Récupération automatique désactivée';
        }
    }

    // Gestion des notifications
    showNotification(message, type = 'success', duration = 5000) {
        // Ajouter à l'état
        const notification = this.stateManager.addNotification(message, type, duration);
        
        // Créer l'élément UI
        const notificationElement = document.createElement('div');
        notificationElement.className = `notification notification-${type}`;
        notificationElement.style.cssText = `
            background: ${type === 'success' ? 'var(--success)' : 
                        type === 'error' ? 'var(--danger)' : 
                        type === 'warning' ? 'var(--warning)' : 'var(--primary)'};
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            animation: slideIn 0.3s;
            display: flex;
            align-items: center;
            gap: 10px;
            position: relative;
            min-width: 250px;
            max-width: 400px;
            word-break: break-word;
        `;
        
        notificationElement.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 
                            type === 'error' ? 'exclamation-triangle' : 
                            type === 'warning' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
            <button class="notification-close" onclick="this.parentElement.remove()" 
                    style="margin-left: auto; background: none; border: none; color: white; cursor: pointer;">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        this.notificationContainer.appendChild(notificationElement);
        
        // Auto-suppression
        setTimeout(() => {
            if (notificationElement.parentNode) {
                notificationElement.style.animation = 'slideOut 0.3s';
                setTimeout(() => {
                    if (notificationElement.parentNode) {
                        notificationElement.remove();
                    }
                }, 300);
            }
            this.stateManager.removeNotification(notification.id);
        }, duration);
        
        return notificationElement;
    }

    // Gestion des modals
    showModal(modalId, title = '') {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
            
            if (title && modal.querySelector('h3')) {
                modal.querySelector('h3').textContent = title;
            }
            
            // Empêcher le défilement du body
            document.body.style.overflow = 'hidden';
        }
    }

    closeModal(modalId = 'create-user-modal') {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            
            // Restaurer le défilement du body
            document.body.style.overflow = '';
        }
    }

    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
        document.body.style.overflow = '';
    }

    // Gestion responsive
    handleResize() {
        this.adjustUIForScreenSize();
        
        // Fermer le menu mobile si on passe en desktop
        if (window.innerWidth > 768 && this.stateManager.state.mobileMenuOpen) {
            this.stateManager.closeMobileMenu();
        }
    }

    adjustUIForScreenSize() {
        const width = window.innerWidth;
        const isMobile = width <= 768;
        const isTablet = width > 768 && width <= 1024;
        
        // Ajuster les grilles
        this.adjustGridLayouts(isMobile, isTablet);
        
        // Ajuster les tailles de police
        this.adjustFontSizes(isMobile, isTablet);
        
        // Ajuster les padding/margin
        this.adjustSpacing(isMobile, isTablet);
    }

    adjustGridLayouts(isMobile, isTablet) {
        // Ajuster la grille du dashboard
        const dashboardGrid = document.querySelector('.dashboard-grid');
        if (dashboardGrid) {
            if (isMobile) {
                dashboardGrid.style.gridTemplateColumns = '1fr';
            } else if (isTablet) {
                dashboardGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
            } else {
                dashboardGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
            }
        }
        
        // Ajuster la grille des utilisateurs
        const usersGrid = document.querySelector('.users-grid');
        if (usersGrid) {
            if (isMobile) {
                usersGrid.style.gridTemplateColumns = '1fr';
            } else if (isTablet) {
                usersGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
            } else {
                usersGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(300px, 1fr))';
            }
        }
    }

    adjustFontSizes(isMobile, isTablet) {
        const elementsToAdjust = [
            { selector: '.view-header h2', mobile: '22px', tablet: '26px', desktop: '32px' },
            { selector: '.card-value', mobile: '28px', tablet: '32px', desktop: '36px' },
            { selector: '.stat-number', mobile: '20px', tablet: '24px', desktop: '28px' }
        ];
        
        elementsToAdjust.forEach(item => {
            const elements = document.querySelectorAll(item.selector);
            elements.forEach(el => {
                if (isMobile) {
                    el.style.fontSize = item.mobile;
                } else if (isTablet) {
                    el.style.fontSize = item.tablet;
                } else {
                    el.style.fontSize = item.desktop;
                }
            });
        });
    }

    adjustSpacing(isMobile, isTablet) {
        const containers = document.querySelectorAll('.owner-content, .dashboard-card, .control-section');
        containers.forEach(container => {
            if (isMobile) {
                container.style.padding = '15px';
            } else if (isTablet) {
                container.style.padding = '20px';
            } else {
                container.style.padding = '';
            }
        });
    }

    // Restauration de l'état UI
    restoreUIState() {
        const loaded = this.stateManager.loadFromLocalStorage();
        
        if (loaded) {
            // Restaurer la vue courante
            const currentView = this.stateManager.getCurrentView();
            if (currentView && currentView !== 'dashboard') {
                this.switchView(currentView);
            }
            
            // Restaurer les onglets actifs
            this.restoreActiveTabs();
        }
    }

    restoreActiveTabs() {
        const state = this.stateManager.state;
        
        // Restaurer les onglets de publication
        if (state.currentPublishTab && state.currentPublishTab !== 'manual') {
            this.switchPublishTab(state.currentPublishTab);
        }
        
        // Restaurer les onglets de numéros
        if (state.currentNumbersTab && state.currentNumbersTab !== 'blocks') {
            this.switchNumbersTab(state.currentNumbersTab);
        }
        
        // Restaurer les onglets de rapports
        if (state.currentReportsTab && state.currentReportsTab !== 'sales') {
            this.switchReportsTab(state.currentReportsTab);
        }
    }

    // Utilitaires
    getActivityIcon(type) {
        const icons = {
            user: 'user',
            draw: 'calendar-alt',
            system: 'cog',
            security: 'shield-alt',
            financial: 'money-bill-wave',
            warning: 'exclamation-triangle',
            success: 'check-circle',
            error: 'times-circle'
        };
        return icons[type] || 'info-circle';
    }

    formatTime(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'À l\'instant';
        if (diffMins < 60) return `Il y a ${diffMins} min`;
        if (diffHours < 24) return `Il y a ${diffHours} h`;
        if (diffDays === 1) return 'Hier';
        if (diffDays < 7) return `Il y a ${diffDays} jours`;
        return date.toLocaleDateString();
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('fr-HT', {
            style: 'currency',
            currency: 'HTG',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    }

    // Méthodes à compléter par les autres gestionnaires
    loadBlocksTab() {}
    loadLimitsTab() {}
    loadNumbersStats() {}
    loadPublishHistory() {}
    loadFetchLog() {}
    loadReport(reportType) {}
    renderDrawsView() {}
    renderActivityView() {}
    renderRulesView() {}
    renderLimitsView() {}
    loadAlerts() {}
}