// Gestionnaire d'interface utilisateur - COMPLÉTÉ
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
        const form = document.getElementById('manual-publish-form');
        if (form) {
            form.querySelectorAll('input[type="number"]').forEach(input => {
                input.addEventListener('input', () => this.updateResultPreview());
            });
        }

        window.addEventListener('resize', () => this.handleResize());
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });
    }

    initResponsiveHandlers() {
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                this.adjustUIForScreenSize();
            }, 100);
        });
    }

    initNotifications() {
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
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const clickedItem = event?.target?.closest('.nav-item');
        if (clickedItem) {
            clickedItem.classList.add('active');
        }
        
        document.querySelectorAll('.view-content').forEach(view => {
            view.style.display = 'none';
        });
        
        const viewElement = document.getElementById(`${viewName}-view`);
        if (viewElement) {
            viewElement.style.display = 'block';
            this.stateManager.setCurrentView(viewName);
            
            if (window.innerWidth <= 768) {
                this.stateManager.closeMobileMenu();
            }
            
            this.loadViewData(viewName);
        }
    }

    switchPublishTab(tabName) {
        document.querySelectorAll('#publish-view .tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        if (event?.target) {
            event.target.classList.add('active');
        } else {
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
        
        if (event?.target) {
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
        
        if (event?.target) {
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
            const data = await ApiService.getDashboardData();
            this.stateManager.updateDashboardStats(data);
            this.renderRecentActivity();
            await this.loadAlerts();
            
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
        try {
            const data = await ApiService.getSettings();
            this.stateManager.setData('settings', data);
            this.renderLimitsView();
        } catch (error) {
            console.error('Erreur chargement limites:', error);
            this.showNotification('Erreur de chargement des limites', 'error');
        }
    }

    async loadReportsData() {
        const tabName = this.stateManager.state.currentReportsTab;
        await this.loadReport(tabName);
    }

    // NOUVELLES MÉTHODES AJOUTÉES

    async loadBlocksTab() {
        if (typeof ownerManager !== 'undefined' && ownerManager.loadBlocksTab) {
            await ownerManager.loadBlocksTab();
        }
    }

    async loadLimitsTab() {
        if (typeof ownerManager !== 'undefined' && ownerManager.loadLimitsTab) {
            await ownerManager.loadLimitsTab();
        }
    }

    async loadNumbersStats() {
        if (typeof ownerManager !== 'undefined' && ownerManager.loadNumbersStats) {
            await ownerManager.loadNumbersStats();
        }
    }

    async loadPublishHistory() {
        if (typeof ownerManager !== 'undefined' && ownerManager.loadPublishHistory) {
            await ownerManager.loadPublishHistory();
        }
    }

    async loadFetchLog() {
        if (typeof ownerManager !== 'undefined' && ownerManager.drawManager && ownerManager.drawManager.loadFetchLog) {
            await ownerManager.drawManager.loadFetchLog();
        }
    }

    renderDrawsView() {
        if (typeof ownerManager !== 'undefined' && ownerManager.renderDrawsView) {
            ownerManager.renderDrawsView();
        }
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
                    <i class="fas fa-${this.getActivityIcon(activity.action)}"></i>
                </div>
                <div class="activity-content">
                    <div class="activity-message">${activity.details || activity.action}</div>
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
        const usersData = this.stateManager.getData('users');
        const supervisors = usersData?.supervisors || [];
        
        if (supervisors.length === 0) {
            container.innerHTML = '<p class="no-data">Aucun superviseur trouvé</p>';
            return;
        }
        
        container.innerHTML = supervisors.map(supervisor => this.createUserCard(supervisor, 'supervisor')).join('');
    }

    renderAgents() {
        const container = document.getElementById('agents-container');
        const usersData = this.stateManager.getData('users');
        const agents = usersData?.agents || [];
        
        if (agents.length === 0) {
            container.innerHTML = '<p class="no-data">Aucun agent trouvé</p>';
            return;
        }
        
        container.innerHTML = agents.map(agent => this.createUserCard(agent, 'agent')).join('');
    }

    createUserCard(user, type) {
        const isBlocked = user.blocked || !user.active;
        const supervisorName = type === 'agent' ? (user.supervisorName || 'Non assigné') : null;
        
        return `
            <div class="user-card ${isBlocked ? 'blocked' : ''}">
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
                            `<p><strong>Superviseur:</strong> ${supervisorName}</p>
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
                        <div class="stat-value">${user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</div>
                    </div>
                </div>
                <div class="user-actions">
                    <button class="btn ${isBlocked ? 'btn-success' : 'btn-danger'} btn-small" 
                            onclick="ownerManager.toggleUserBlock('${user.id}', ${!isBlocked})">
                        ${isBlocked ? 'Débloquer' : 'Bloquer'}
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
        const notification = this.stateManager.addNotification(message, type, duration);
        
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
            
            document.body.style.overflow = 'hidden';
        }
    }

    closeModal(modalId = 'create-user-modal') {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
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
        
        if (window.innerWidth > 768 && this.stateManager.state.mobileMenuOpen) {
            this.stateManager.closeMobileMenu();
        }
    }

    adjustUIForScreenSize() {
        const width = window.innerWidth;
        const isMobile = width <= 768;
        const isTablet = width > 768 && width <= 1024;
        
        this.adjustGridLayouts(isMobile, isTablet);
        this.adjustFontSizes(isMobile, isTablet);
        this.adjustSpacing(isMobile, isTablet);
    }

    adjustGridLayouts(isMobile, isTablet) {
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
            const currentView = this.stateManager.getCurrentView();
            if (currentView && currentView !== 'dashboard') {
                this.switchView(currentView);
            }
            
            this.restoreActiveTabs();
        }
    }

    restoreActiveTabs() {
        const state = this.stateManager.state;
        
        if (state.currentPublishTab && state.currentPublishTab !== 'manual') {
            this.switchPublishTab(state.currentPublishTab);
        }
        
        if (state.currentNumbersTab && state.currentNumbersTab !== 'blocks') {
            this.switchNumbersTab(state.currentNumbersTab);
        }
        
        if (state.currentReportsTab && state.currentReportsTab !== 'sales') {
            this.switchReportsTab(state.currentReportsTab);
        }
    }

    // Règles de jeu
    async loadRulesView() {
        try {
            const rules = await ApiService.getRules();
            this.renderRulesView(rules);
        } catch (error) {
            console.error('Erreur chargement règles:', error);
            this.showNotification('Erreur de chargement des règles', 'error');
        }
    }

    renderRulesView(rulesData) {
        const financialContainer = document.getElementById('financial-rules');
        const timeContainer = document.getElementById('time-rules');
        const commissionContainer = document.getElementById('commission-rules');
        
        if (!financialContainer || !timeContainer || !commissionContainer) return;
        
        const rules = rulesData || {};
        
        financialContainer.innerHTML = `
            <div class="rule-item">
                <label>Mise minimale:</label>
                <input type="number" class="form-control rule-input" data-key="min_bet" 
                       value="${rules.min_bet?.value || 1}" placeholder="1">
                <div class="rule-description">${rules.min_bet?.description || 'Mise minimale par boule'}</div>
            </div>
            <div class="rule-item">
                <label>Mise maximale:</label>
                <input type="number" class="form-control rule-input" data-key="max_bet" 
                       value="${rules.max_bet?.value || 1000}" placeholder="1000">
                <div class="rule-description">${rules.max_bet?.description || 'Mise maximale par boule'}</div>
            </div>
            <div class="rule-item">
                <label>Multiplicateur gain:</label>
                <input type="number" class="form-control rule-input" data-key="win_multiplier" 
                       value="${rules.win_multiplier?.value || 70}" placeholder="70">
                <div class="rule-description">${rules.win_multiplier?.description || 'Multiplicateur pour les gains'}</div>
            </div>
        `;
        
        timeContainer.innerHTML = `
            <div class="rule-item">
                <label>Heure ouverture:</label>
                <input type="time" class="form-control rule-input" data-key="open_time" 
                       value="${rules.open_time?.value || '06:00'}">
                <div class="rule-description">${rules.open_time?.description || 'Heure d\'ouverture des paris'}</div>
            </div>
            <div class="rule-item">
                <label>Heure fermeture:</label>
                <input type="time" class="form-control rule-input" data-key="close_time" 
                       value="${rules.close_time?.value || '22:00'}">
                <div class="rule-description">${rules.close_time?.description || 'Heure de fermeture des paris'}</div>
            </div>
            <div class="rule-item">
                <label>Délai annulation:</label>
                <input type="number" class="form-control rule-input" data-key="cancel_timeout" 
                       value="${rules.cancel_timeout?.value || 10}" placeholder="10">
                <div class="rule-description">${rules.cancel_timeout?.description || 'Délai d\'annulation en minutes'}</div>
            </div>
        `;
        
        commissionContainer.innerHTML = `
            <div class="rule-item">
                <label>Commission agent:</label>
                <input type="number" class="form-control rule-input" data-key="agent_commission" 
                       value="${rules.agent_commission?.value || 5}" placeholder="5">
                <div class="rule-description">${rules.agent_commission?.description || 'Commission des agents (%)'}</div>
            </div>
            <div class="rule-item">
                <label>Commission superviseur:</label>
                <input type="number" class="form-control rule-input" data-key="supervisor_commission" 
                       value="${rules.supervisor_commission?.value || 2}" placeholder="2">
                <div class="rule-description">${rules.supervisor_commission?.description || 'Commission des superviseurs (%)'}</div>
            </div>
            <div class="rule-item">
                <label>Taxe jeu:</label>
                <input type="number" class="form-control rule-input" data-key="game_tax" 
                       value="${rules.game_tax?.value || 15}" placeholder="15">
                <div class="rule-description">${rules.game_tax?.description || 'Taxe sur les jeux (%)'}</div>
            </div>
        `;
        
        document.querySelectorAll('.rule-input').forEach(input => {
            input.addEventListener('change', () => this.updateRule(input));
        });
    }

    async updateRule(input) {
        const key = input.dataset.key;
        const value = input.value;
        
        try {
            const rules = this.stateManager.getData('rules') || {};
            if (!rules[key]) {
                rules[key] = { value: '', description: '' };
            }
            rules[key].value = value;
            
            await ApiService.updateRules(rules);
            this.showNotification('Règle mise à jour', 'success');
            
        } catch (error) {
            console.error('Erreur mise à jour règle:', error);
            this.showNotification('Erreur lors de la mise à jour', 'error');
        }
    }

    async saveRules() {
        try {
            const rules = {};
            
            document.querySelectorAll('.rule-input').forEach(input => {
                const key = input.dataset.key;
                rules[key] = {
                    value: input.value,
                    description: input.parentElement.querySelector('.rule-description')?.textContent || ''
                };
            });
            
            await ApiService.updateRules(rules);
            this.showNotification('Toutes les règles ont été sauvegardées', 'success');
            
        } catch (error) {
            console.error('Erreur sauvegarde règles:', error);
            this.showNotification('Erreur lors de la sauvegarde', 'error');
        }
    }

    async resetRules() {
        if (!confirm('Restaurer toutes les règles aux valeurs par défaut?')) {
            return;
        }
        
        try {
            const defaultRules = {
                min_bet: { value: '1', description: 'Mise minimale par boule' },
                max_bet: { value: '1000', description: 'Mise maximale par boule' },
                win_multiplier: { value: '70', description: 'Multiplicateur pour les gains' },
                open_time: { value: '06:00', description: 'Heure d\'ouverture des paris' },
                close_time: { value: '22:00', description: 'Heure de fermeture des paris' },
                cancel_timeout: { value: '10', description: 'Délai d\'annulation en minutes' },
                agent_commission: { value: '5', description: 'Commission des agents (%)' },
                supervisor_commission: { value: '2', description: 'Commission des superviseurs (%)' },
                game_tax: { value: '15', description: 'Taxe sur les jeux (%)' }
            };
            
            await ApiService.updateRules(defaultRules);
            this.showNotification('Règles restaurées avec succès', 'success');
            this.loadRulesData();
            
        } catch (error) {
            console.error('Erreur réinitialisation règles:', error);
            this.showNotification('Erreur lors de la réinitialisation', 'error');
        }
    }

    // Rapports
    async loadReport(reportType) {
        try {
            let reportData;
            let containerId;
            
            switch(reportType) {
                case 'sales':
                    reportData = await ApiService.getSalesReport();
                    containerId = 'sales-report';
                    this.renderSalesReport(reportData, containerId);
                    break;
                case 'users':
                    reportData = await ApiService.getUserStats();
                    containerId = 'users-report';
                    this.renderUsersReport(reportData, containerId);
                    break;
                case 'draws':
                    reportData = await ApiService.getDrawStats();
                    containerId = 'draws-report';
                    this.renderDrawsReport(reportData, containerId);
                    break;
                case 'financial':
                    reportData = await ApiService.getFinancialReport();
                    containerId = 'financial-report';
                    this.renderFinancialReport(reportData, containerId);
                    break;
            }
            
        } catch (error) {
            console.error(`Erreur chargement rapport ${reportType}:`, error);
            this.showNotification(`Erreur de chargement du rapport ${reportType}`, 'error');
        }
    }

    renderSalesReport(data, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const summary = data?.summary || {};
        const daily = data?.daily || [];
        
        container.innerHTML = `
            <div class="report-container">
                <h4>Résumé des Ventes</h4>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px;">
                    <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                        <div style="font-size: 12px; color: var(--text-dim);">Tickets Vendus</div>
                        <div style="font-size: 24px; font-weight: bold; color: var(--primary);">
                            ${summary.totalTickets || 0}
                        </div>
                    </div>
                    <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                        <div style="font-size: 12px; color: var(--text-dim);">Ventes Totales</div>
                        <div style="font-size: 24px; font-weight: bold; color: var(--success);">
                            ${(summary.totalSales || 0).toLocaleString()} Gdes
                        </div>
                    </div>
                    <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                        <div style="font-size: 12px; color: var(--text-dim);">Gains Distribués</div>
                        <div style="font-size: 24px; font-weight: bold; color: var(--warning);">
                            ${(summary.totalWins || 0).toLocaleString()} Gdes
                        </div>
                    </div>
                    <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                        <div style="font-size: 12px; color: var(--text-dim);">Bénéfice Net</div>
                        <div style="font-size: 24px; font-weight: bold; color: ${(summary.totalLoss || 0) > 0 ? 'var(--success)' : 'var(--danger)'};">
                            ${(summary.totalLoss || 0).toLocaleString()} Gdes
                        </div>
                    </div>
                </div>
                
                <h4>Ventes Quotidiennes</h4>
                <div style="max-height: 400px; overflow-y: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f8f9fa;">
                                <th style="padding: 10px; text-align: left;">Date</th>
                                <th style="padding: 10px; text-align: right;">Tickets</th>
                                <th style="padding: 10px; text-align: right;">Ventes</th>
                                <th style="padding: 10px; text-align: right;">Gains</th>
                                <th style="padding: 10px; text-align: right;">Bénéfice</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${daily.map(day => `
                                <tr style="border-bottom: 1px solid var(--border);">
                                    <td style="padding: 10px;">${new Date(day.day).toLocaleDateString()}</td>
                                    <td style="padding: 10px; text-align: right;">${day.tickets || 0}</td>
                                    <td style="padding: 10px; text-align: right;">${(day.sales || 0).toLocaleString()} Gdes</td>
                                    <td style="padding: 10px; text-align: right;">${(day.wins || 0).toLocaleString()} Gdes</td>
                                    <td style="padding: 10px; text-align: right; color: ${(day.loss || 0) > 0 ? 'var(--success)' : 'var(--danger)'};">
                                        ${(day.loss || 0).toLocaleString()} Gdes
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                
                <div style="margin-top: 20px; text-align: right;">
                    <button class="btn btn-primary" onclick="ApiService.exportReport('sales', 'csv')">
                        <i class="fas fa-download"></i> Exporter en CSV
                    </button>
                </div>
            </div>
        `;
    }

    renderUsersReport(data, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = `
            <div class="report-container">
                <h4>Statistiques des Utilisateurs</h4>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 30px;">
                    <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                        <div style="font-size: 12px; color: var(--text-dim);">Agents Actifs</div>
                        <div style="font-size: 24px; font-weight: bold; color: var(--primary);">
                            ${data.totalAgents || 0}
                        </div>
                    </div>
                    <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                        <div style="font-size: 12px; color: var(--text-dim);">Superviseurs</div>
                        <div style="font-size: 24px; font-weight: bold; color: var(--success);">
                            ${data.totalSupervisors || 0}
                        </div>
                    </div>
                    <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                        <div style="font-size: 12px; color: var(--text-dim);">Nouveaux Aujourd'hui</div>
                        <div style="font-size: 24px; font-weight: bold; color: var(--warning);">
                            ${data.newToday || 0}
                        </div>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 30px;">
                    <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                        <div style="font-size: 12px; color: var(--text-dim);">Utilisateurs Bloqués</div>
                        <div style="font-size: 24px; font-weight: bold; color: var(--danger);">
                            ${(data.blockedAgents || 0) + (data.blockedSupervisors || 0)}
                        </div>
                    </div>
                    <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                        <div style="font-size: 12px; color: var(--text-dim);">Utilisateurs En Ligne</div>
                        <div style="font-size: 24px; font-weight: bold; color: var(--info);">
                            ${data.onlineUsers || 0}
                        </div>
                    </div>
                </div>
                
                <div style="text-align: right;">
                    <button class="btn btn-primary" onclick="ApiService.exportReport('users', 'csv')">
                        <i class="fas fa-download"></i> Exporter en CSV
                    </button>
                </div>
            </div>
        `;
    }

    renderDrawsReport(data, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const popularDraws = data?.popularDraws || [];
        
        container.innerHTML = `
            <div class="report-container">
                <h4>Statistiques des Tirages</h4>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 30px;">
                    <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                        <div style="font-size: 12px; color: var(--text-dim);">Total Tirages</div>
                        <div style="font-size: 24px; font-weight: bold; color: var(--primary);">
                            ${data.totalDraws || 0}
                        </div>
                    </div>
                    <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                        <div style="font-size: 12px; color: var(--text-dim);">Tirages Actifs</div>
                        <div style="font-size: 24px; font-weight: bold; color: var(--success);">
                            ${data.activeDraws || 0}
                        </div>
                    </div>
                    <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                        <div style="font-size: 12px; color: var(--text-dim);">Publiés Aujourd'hui</div>
                        <div style="font-size: 24px; font-weight: bold; color: var(--warning);">
                            ${data.publishedToday || 0}
                        </div>
                    </div>
                </div>
                
                <h4>Tirages les Plus Populaires</h4>
                <div style="max-height: 300px; overflow-y: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f8f9fa;">
                                <th style="padding: 10px; text-align: left;">Tirage</th>
                                <th style="padding: 10px; text-align: right;">Tickets</th>
                                <th style="padding: 10px; text-align: right;">Ventes</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${popularDraws.map(draw => `
                                <tr style="border-bottom: 1px solid var(--border);">
                                    <td style="padding: 10px;">${draw.name}</td>
                                    <td style="padding: 10px; text-align: right;">${draw.ticketCount || 0}</td>
                                    <td style="padding: 10px; text-align: right;">${(draw.totalSales || 0).toLocaleString()} Gdes</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                
                <div style="margin-top: 20px; text-align: right;">
                    <button class="btn btn-primary" onclick="ApiService.exportReport('draws', 'csv')">
                        <i class="fas fa-download"></i> Exporter en CSV
                    </button>
                </div>
            </div>
        `;
    }

    renderFinancialReport(data, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const summary = data?.summary || {};
        const daily = data?.daily || [];
        
        container.innerHTML = `
            <div class="report-container">
                <h4>Rapport Financier - ${data.period || 'Mois'}</h4>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 30px;">
                    <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                        <div style="font-size: 12px; color: var(--text-dim);">Ventes Totales</div>
                        <div style="font-size: 24px; font-weight: bold; color: var(--success);">
                            ${(summary.totalSales || 0).toLocaleString()} Gdes
                        </div>
                    </div>
                    <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                        <div style="font-size: 12px; color: var(--text-dim);">Bénéfice Net</div>
                        <div style="font-size: 24px; font-weight: bold; color: ${(summary.profit || 0) > 0 ? 'var(--success)' : 'var(--danger)'};">
                            ${(summary.profit || 0).toLocaleString()} Gdes
                        </div>
                    </div>
                    <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                        <div style="font-size: 12px; color: var(--text-dim);">Taux de Gain</div>
                        <div style="font-size: 24px; font-weight: bold; color: var(--warning);">
                            ${(summary.winRate || 0).toFixed(1)}%
                        </div>
                    </div>
                </div>
                
                <h4>Évolution Quotidienne</h4>
                <div style="max-height: 400px; overflow-y: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f8f9fa;">
                                <th style="padding: 10px; text-align: left;">Date</th>
                                <th style="padding: 10px; text-align: right;">Ventes</th>
                                <th style="padding: 10px; text-align: right;">Gains</th>
                                <th style="padding: 10px; text-align: right;">Bénéfice</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${daily.map(day => `
                                <tr style="border-bottom: 1px solid var(--border);">
                                    <td style="padding: 10px;">${new Date(day.day).toLocaleDateString()}</td>
                                    <td style="padding: 10px; text-align: right;">${(day.sales || 0).toLocaleString()} Gdes</td>
                                    <td style="padding: 10px; text-align: right;">${(day.wins || 0).toLocaleString()} Gdes</td>
                                    <td style="padding: 10px; text-align: right; color: ${(day.profit || 0) > 0 ? 'var(--success)' : 'var(--danger)'};">
                                        ${(day.profit || 0).toLocaleString()} Gdes
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                
                <div style="margin-top: 20px; text-align: right;">
                    <button class="btn btn-primary" onclick="ApiService.exportReport('financial', 'csv')">
                        <i class="fas fa-download"></i> Exporter en CSV
                    </button>
                </div>
            </div>
        `;
    }

    // Alertes
    async loadAlerts() {
        try {
            const alerts = await ApiService.getAlerts();
            this.renderAlerts(alerts);
        } catch (error) {
            console.error('Erreur chargement alertes:', error);
        }
    }

    renderAlerts(alerts) {
        const container = document.getElementById('alerts-container');
        if (!container) return;
        
        const activeAlerts = alerts.filter(alert => alert.active).slice(0, 3);
        
        if (activeAlerts.length === 0) {
            container.innerHTML = '<p style="color: var(--text-dim); text-align: center; padding: 20px;">Aucune alerte active</p>';
            return;
        }
        
        container.innerHTML = activeAlerts.map(alert => `
            <div class="alert-item" style="background: ${this.getAlertColor(alert.type)}; color: white; 
                 padding: 15px; border-radius: 10px; margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <strong>${alert.title}</strong>
                        <div style="font-size: 13px; margin-top: 5px;">${alert.message}</div>
                    </div>
                    <span class="badge" style="background: rgba(255,255,255,0.2); padding: 3px 8px; border-radius: 12px; font-size: 11px;">
                        ${alert.priority}
                    </span>
                </div>
            </div>
        `).join('');
    }

    getAlertColor(type) {
        const colors = {
            'info': 'var(--primary)',
            'warning': 'var(--warning)',
            'danger': 'var(--danger)',
            'success': 'var(--success)'
        };
        return colors[type] || 'var(--primary)';
    }

    // Activité
    renderActivityView() {
        const container = document.getElementById('full-activity-log');
        const activities = this.stateManager.getData('activity') || [];
        
        if (activities.length === 0) {
            container.innerHTML = '<p class="no-data">Aucune activité enregistrée</p>';
            return;
        }
        
        container.innerHTML = activities.map(activity => `
            <div class="activity-log-item" style="padding: 15px; border-bottom: 1px solid var(--border);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <div style="font-weight: 500; color: var(--dark);">${activity.details || activity.action}</div>
                        <div style="font-size: 12px; color: var(--text-dim); margin-top: 5px;">
                            <span>${new Date(activity.timestamp).toLocaleString()}</span>
                            <span> • </span>
                            <span>${activity.user || 'Système'}</span>
                            <span> • </span>
                            <span class="badge" style="background: #f0f0f0; color: var(--text); padding: 2px 8px; border-radius: 10px; font-size: 11px;">
                                ${activity.type || 'système'}
                            </span>
                        </div>
                    </div>
                    <div>
                        <i class="fas fa-${this.getActivityIcon(activity.action)}" style="color: var(--text-dim);"></i>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // Limites
    renderLimitsView() {
        const container = document.getElementById('user-limits-container');
        const settings = this.stateManager.getData('settings') || {};
        
        container.innerHTML = `
            <div class="limits-section">
                <h4 style="margin-bottom: 15px;">Configuration des Limites</h4>
                <div class="form-group">
                    <label>Limite quotidienne par défaut (Gdes):</label>
                    <input type="number" class="form-control" id="default-daily-limit" value="${settings.default_daily_limit || 5000}">
                </div>
                <div class="form-group">
                    <label>Limite par ticket par défaut (Gdes):</label>
                    <input type="number" class="form-control" id="default-ticket-limit" value="${settings.default_ticket_limit || 500}">
                </div>
                <div class="form-group">
                    <label>Commission maximale (%):</label>
                    <input type="number" class="form-control" id="max-commission" value="${settings.max_commission || 20}">
                </div>
                <button class="btn btn-primary" onclick="ownerManager.saveLimitsConfig()">
                    <i class="fas fa-save"></i> Sauvegarder
                </button>
            </div>
        `;
    }

    async saveLimitsConfig() {
        try {
            const settings = {
                default_daily_limit: document.getElementById('default-daily-limit').value,
                default_ticket_limit: document.getElementById('default-ticket-limit').value,
                max_commission: document.getElementById('max-commission').value
            };
            
            await ApiService.updateSettings(settings);
            this.showNotification('Configuration des limites sauvegardée', 'success');
            
        } catch (error) {
            console.error('Erreur sauvegarde limites:', error);
            this.showNotification('Erreur lors de la sauvegarde', 'error');
        }
    }

    // Utilitaires
    getActivityIcon(action) {
        const icons = {
            'create_user': 'user-plus',
            'update_user': 'user-edit',
            'block_user': 'user-lock',
            'create_draw': 'calendar-plus',
            'publish_draw': 'calendar-check',
            'block_draw': 'calendar-times',
            'block_number': 'ban',
            'update_settings': 'cog',
            'login': 'sign-in-alt',
            'logout': 'sign-out-alt'
        };
        return icons[action] || 'info-circle';
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
}