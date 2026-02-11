// Gestionnaire d'interface utilisateur - COMPLET
class UIManager {
    constructor(stateManager) {
        this.stateManager = stateManager;
        this.notificationContainer = null;
        this.currentModal = null;
        this.isInitialized = false;
        this.init();
    }
    
    // === INITIALISATION ===
    init() {
        if (this.isInitialized) return;
        
        this.initNotifications();
        this.initEventListeners();
        this.initResponsive();
        this.restoreUIState();
        
        this.isInitialized = true;
    }
    
    initEventListeners() {
        // Formulaire publication
        const form = document.getElementById('manual-publish-form');
        if (form) {
            form.querySelectorAll('input[type="number"]').forEach(input => {
                input.addEventListener('input', () => this.updateResultPreview());
            });
            
            // Validation des numéros
            form.querySelectorAll('input[name^="num"]').forEach(input => {
                input.addEventListener('change', (e) => {
                    const value = parseInt(e.target.value);
                    if (value < 0) e.target.value = 0;
                    if (value > 99) e.target.value = 99;
                });
            });
        }
        
        // Redimensionnement
        window.addEventListener('resize', () => this.handleResize());
        
        // Touches clavier
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
                this.stateManager.closeMobileMenu();
            }
        });
        
        // Clic overlay
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('mobile-menu-overlay')) {
                this.stateManager.closeMobileMenu();
            }
            if (e.target.classList.contains('modal')) {
                this.closeModal(e.target.id);
            }
        });
    }
    
    initResponsive() {
        // Orientation
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.adjustUIForScreenSize(), 100);
        });
        
        // Touche de menu mobile
        const menuToggle = document.querySelector('.mobile-menu-toggle');
        if (menuToggle) {
            menuToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.stateManager.toggleMobileMenu();
            });
        }
        
        // Fermeture sidebar mobile
        const sidebarClose = document.querySelector('.sidebar-close');
        if (sidebarClose) {
            sidebarClose.addEventListener('click', () => {
                this.stateManager.closeMobileMenu();
            });
        }
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
    
    // === GESTION DES VUES ===
    switchView(viewName) {
        // Mettre à jour navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const navItem = document.querySelector(`.nav-item[onclick*="${viewName}"]`);
        if (navItem) {
            navItem.classList.add('active');
        }
        
        // Masquer toutes les vues
        document.querySelectorAll('.view-content').forEach(view => {
            view.style.display = 'none';
        });
        
        // Afficher vue sélectionnée
        const viewElement = document.getElementById(`${viewName}-view`);
        if (viewElement) {
            viewElement.style.display = 'block';
            this.stateManager.setCurrentView(viewName);
            
            // Fermer menu mobile sur petits écrans
            if (window.innerWidth <= 768) {
                this.stateManager.closeMobileMenu();
            }
            
            // Charger données
            this.loadViewData(viewName);
            
            // Animation
            viewElement.style.animation = 'fadeIn 0.3s';
        }
    }
    
    switchPublishTab(tabName) {
        this.switchTab('publish-view', tabName, 'publish');
        this.stateManager.state.currentPublishTab = tabName;
        
        if (tabName === 'history') {
            this.loadPublishHistory();
        } else if (tabName === 'auto') {
            this.updateFetchStatus();
        }
    }
    
    switchNumbersTab(tabName) {
        this.switchTab('numbers-view', tabName, 'tab');
        this.stateManager.state.currentNumbersTab = tabName;
        
        // Charger données spécifiques
        setTimeout(() => {
            if (tabName === 'blocks') {
                this.loadBlocksTab();
            } else if (tabName === 'limits') {
                this.loadLimitsTab();
            } else if (tabName === 'stats') {
                this.loadNumbersStats();
            }
        }, 100);
    }
    
    switchReportsTab(tabName) {
        this.switchTab('reports-view', tabName, 'reports-tab');
        this.stateManager.state.currentReportsTab = tabName;
        this.loadReport(tabName);
    }
    
    switchTab(containerId, tabName, suffix = 'tab') {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // Mettre à jour onglets
        container.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        const activeTab = container.querySelector(`.tab[onclick*="${tabName}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }
        
        // Masquer contenus
        container.querySelectorAll(`.${suffix}`).forEach(content => {
            content.classList.remove('active');
            content.style.display = 'none';
        });
        
        // Afficher contenu sélectionné
        const contentId = tabName === 'reports' ? `${tabName}-${suffix}` : `${tabName}-${suffix}`;
        const content = document.getElementById(contentId);
        if (content) {
            content.classList.add('active');
            content.style.display = 'block';
        }
    }
    
    // === CHARGEMENT DES DONNÉES ===
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
            this.stateManager.updateUIStats(data);
            
            // Activité récente
            if (data.recentActivity) {
                this.stateManager.setData('dashboard.recentActivity', data.recentActivity);
                this.renderRecentActivity();
            }
            
            // Alertes
            if (data.alerts) {
                this.stateManager.setData('dashboard.alerts', data.alerts);
                this.renderAlerts();
            }
            
            // Cache
            this.stateManager.cacheData('dashboard', data);
            
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
            
            // Cache
            this.stateManager.cacheData('users', data);
            
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
            
            // Cache
            this.stateManager.cacheData('draws', data);
            
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
            
            // Charger onglet actuel
            const currentTab = this.stateManager.state.currentNumbersTab;
            if (currentTab === 'blocks') {
                await this.loadBlocksTab();
            } else if (currentTab === 'limits') {
                await this.loadLimitsTab();
            } else if (currentTab === 'stats') {
                await this.loadNumbersStats();
            }
            
            // Cache
            this.stateManager.cacheData('numbers', data);
            
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
            const [userLimits, zoneLimits, tempBlocks] = await Promise.all([
                ApiService.getUserLimits(),
                ApiService.getZoneLimits(),
                ApiService.getTemporaryBlocks()
            ]);
            
            this.stateManager.setData('limits', {
                users: userLimits,
                zones: zoneLimits,
                temporary: tempBlocks
            });
            
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
    
    // === RENDU DES VUES ===
    renderUsersView() {
        const users = this.stateManager.getData('users');
        const supervisorsContainer = document.getElementById('supervisors-container');
        const agentsContainer = document.getElementById('agents-container');
        
        if (!users || !supervisorsContainer || !agentsContainer) return;
        
        // Superviseurs
        if (users.supervisors && users.supervisors.length > 0) {
            supervisorsContainer.innerHTML = users.supervisors.map(supervisor => `
                <div class="user-card ${supervisor.blocked ? 'blocked' : ''}">
                    <div class="user-header">
                        <span class="user-type type-supervisor">Superviseur</span>
                        <div class="user-status">
                            <div class="status-dot ${supervisor.online ? 'online' : 'offline'}"></div>
                            <span>${supervisor.online ? 'En ligne' : 'Hors ligne'}</span>
                        </div>
                    </div>
                    
                    <div class="user-info">
                        <h4>${supervisor.name}</h4>
                        <div class="user-details">
                            <p><strong>Email:</strong> ${supervisor.email || 'N/A'}</p>
                            <p><strong>Téléphone:</strong> ${supervisor.phone || 'N/A'}</p>
                            <p><strong>ID:</strong> ${supervisor.id || 'N/A'}</p>
                        </div>
                        
                        <div class="user-stats">
                            <div class="user-stat">
                                <div class="stat-label">Agents</div>
                                <div class="stat-value">${supervisor.agentsCount || 0}</div>
                            </div>
                            <div class="user-stat">
                                <div class="stat-label">Ventes</div>
                                <div class="stat-value">${(supervisor.sales || 0).toLocaleString()}</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="user-actions">
                        <button class="btn btn-primary btn-small" onclick="ownerManager.viewSupervisorAgents('${supervisor.id}')">
                            <i class="fas fa-users"></i> Agents
                        </button>
                        <button class="btn btn-warning btn-small" onclick="ownerManager.editUser('${supervisor.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn ${supervisor.blocked ? 'btn-success' : 'btn-danger'} btn-small" 
                                onclick="ownerManager.toggleUserBlock('${supervisor.id}', ${!supervisor.blocked})">
                            ${supervisor.blocked ? 'Débloquer' : 'Bloquer'}
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            supervisorsContainer.innerHTML = '<p class="no-data">Aucun superviseur</p>';
        }
        
        // Agents
        if (users.agents && users.agents.length > 0) {
            agentsContainer.innerHTML = users.agents.map(agent => `
                <div class="user-card ${agent.blocked ? 'blocked' : ''}">
                    <div class="user-header">
                        <span class="user-type type-agent">Agent</span>
                        <div class="user-status">
                            <div class="status-dot ${agent.online ? 'online' : 'offline'}"></div>
                            <span>${agent.online ? 'En ligne' : 'Hors ligne'}</span>
                        </div>
                    </div>
                    
                    <div class="user-info">
                        <h4>${agent.name}</h4>
                        <div class="user-details">
                            <p><strong>Email:</strong> ${agent.email || 'N/A'}</p>
                            <p><strong>Téléphone:</strong> ${agent.phone || 'N/A'}</p>
                            <p><strong>Localisation:</strong> ${agent.location || 'N/A'}</p>
                        </div>
                        
                        <div class="user-stats">
                            <div class="user-stat">
                                <div class="stat-label">Commission</div>
                                <div class="stat-value">${agent.commission || 0}%</div>
                            </div>
                            <div class="user-stat">
                                <div class="stat-label">Ventes</div>
                                <div class="stat-value">${(agent.sales || 0).toLocaleString()}</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="user-actions">
                        <button class="btn btn-warning btn-small" onclick="ownerManager.editUser('${agent.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn ${agent.blocked ? 'btn-success' : 'btn-danger'} btn-small" 
                                onclick="ownerManager.toggleUserBlock('${agent.id}', ${!agent.blocked})">
                            ${agent.blocked ? 'Débloquer' : 'Bloquer'}
                        </button>
                        <button class="btn btn-info btn-small" onclick="ownerManager.transferAgent('${agent.id}')">
                            <i class="fas fa-exchange-alt"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            agentsContainer.innerHTML = '<p class="no-data">Aucun agent</p>';
        }
    }
    
    renderDrawsView() {
        const container = document.getElementById('draws-container');
        const draws = this.stateManager.getData('draws') || [];
        
        if (!container) return;
        
        if (draws.length === 0) {
            container.innerHTML = '<p class="no-data">Aucun tirage trouvé</p>';
            return;
        }
        
        container.innerHTML = draws.map(draw => {
            const isBlocked = draw.status === 'blocked' || !draw.active;
            const statusColor = draw.active ? 'var(--success)' : 'var(--danger)';
            
            return `
                <div class="draw-item ${isBlocked ? 'blocked' : ''}">
                    <div class="draw-header">
                        <div class="draw-name">${draw.name}</div>
                        <div class="draw-status" style="color: ${statusColor}; font-weight: bold;">
                            ${draw.active ? 'ACTIF' : 'BLOQUÉ'}
                        </div>
                    </div>
                    
                    <div class="draw-info">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                            <div>
                                <div style="font-size: 12px; color: var(--text-dim);">Heure</div>
                                <div>${draw.time || 'Non défini'}</div>
                            </div>
                            <div>
                                <div style="font-size: 12px; color: var(--text-dim);">Fréquence</div>
                                <div>${draw.frequency || 'Quotidien'}</div>
                            </div>
                            <div>
                                <div style="font-size: 12px; color: var(--text-dim);">Dernier tirage</div>
                                <div>${draw.lastDraw ? new Date(draw.lastDraw).toLocaleDateString() : 'Jamais'}</div>
                            </div>
                        </div>
                        
                        ${draw.lastResults && draw.lastResults.length > 0 ? `
                            <div style="margin: 15px 0;">
                                <div style="font-size: 12px; color: var(--text-dim); margin-bottom: 5px;">Derniers résultats</div>
                                <div class="draw-results">
                                    ${draw.lastResults.map(num => `
                                        <div class="draw-number">${num.toString().padStart(2, '0')}</div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                        
                        <div class="draw-stats">
                            <div class="draw-stat">
                                <div class="stat-label">Tickets</div>
                                <div class="stat-value">${draw.ticketsToday || 0}</div>
                            </div>
                            <div class="draw-stat">
                                <div class="stat-label">Ventes</div>
                                <div class="stat-value">${draw.salesToday || 0} Gdes</div>
                            </div>
                            <div class="draw-stat">
                                <div class="stat-label">Gains</div>
                                <div class="stat-value">${draw.payoutsToday || 0} Gdes</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="draw-actions" style="display: flex; gap: 10px; margin-top: 15px;">
                        <button class="btn ${isBlocked ? 'btn-success' : 'btn-danger'} btn-small" 
                                onclick="ownerManager.toggleDrawBlock('${draw.id}', ${!isBlocked})">
                            ${isBlocked ? 'Activer' : 'Désactiver'}
                        </button>
                        <button class="btn btn-primary btn-small" onclick="ownerManager.viewDrawDetails('${draw.id}')">
                            Détails
                        </button>
                        <button class="btn btn-warning btn-small" onclick="ownerManager.editDraw('${draw.id}')">
                            Éditer
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    renderRecentActivity() {
        const container = document.getElementById('recent-activity');
        const activity = this.stateManager.getData('dashboard.recentActivity') || [];
        
        if (!container) return;
        
        if (activity.length === 0) {
            container.innerHTML = '<p class="no-data">Aucune activité récente</p>';
            return;
        }
        
        container.innerHTML = activity.slice(0, 10).map(item => `
            <div class="activity-item">
                <div class="activity-icon">
                    <i class="fas fa-${this.getActivityIcon(item.type)}"></i>
                </div>
                <div class="activity-content">
                    <div class="activity-message">${item.message}</div>
                    <div class="activity-meta">
                        <span>${new Date(item.timestamp).toLocaleTimeString()}</span>
                        <span class="activity-user">${item.user || 'Système'}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    renderAlerts() {
        const container = document.getElementById('alerts-container');
        const alerts = this.stateManager.getData('dashboard.alerts') || [];
        
        if (!container) return;
        
        if (alerts.length === 0) {
            container.innerHTML = '<p class="no-data">Aucune alerte</p>';
            return;
        }
        
        container.innerHTML = alerts.map(alert => `
            <div class="alert-item ${alert.type || 'info'}">
                <div class="alert-header">
                    <i class="fas fa-${alert.icon || 'exclamation-circle'}"></i>
                    <strong>${alert.title}</strong>
                </div>
                <div class="alert-message">${alert.message}</div>
                <div style="font-size: 12px; color: var(--text-dim); margin-top: 5px;">
                    ${new Date(alert.timestamp).toLocaleString()}
                </div>
            </div>
        `).join('');
    }
    
    renderActivityView() {
        const container = document.getElementById('full-activity-log');
        const activity = this.stateManager.getData('activity') || [];
        
        if (!container) return;
        
        if (activity.length === 0) {
            container.innerHTML = '<p class="no-data">Aucune activité</p>';
            return;
        }
        
        container.innerHTML = activity.map(item => `
            <div class="log-entry">
                <div class="log-time">
                    <i class="fas fa-clock"></i>
                    ${new Date(item.timestamp).toLocaleString()}
                </div>
                <div class="log-message">${item.message}</div>
                <div class="log-user">
                    <i class="fas fa-user"></i> ${item.user || 'Système'} • 
                    <span style="color: var(--text-dim);">Type: ${item.type || 'N/A'}</span>
                </div>
            </div>
        `).join('');
    }
    
    // === GESTION DES NUMÉROS ===
    async loadBlocksTab() {
        const numbersData = this.stateManager.getData('numbers');
        if (!numbersData) {
            await this.loadNumbersData();
        }
        this.renderBlocksGrid();
        this.renderBlockedNumbersList();
    }
    
    renderBlocksGrid() {
        const container = document.getElementById('blocks-numbers-grid');
        const numbersData = this.stateManager.getData('numbers');
        const blockedNumbers = numbersData?.blocked || [];
        
        if (!container) return;
        
        let html = '';
        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            const isBlocked = blockedNumbers.includes(num);
            
            const className = isBlocked ? 'number-item blocked' : 'number-item normal';
            const title = `Boule ${num}${isBlocked ? ' (BLOQUÉ)' : ''}`;
            
            html += `
                <div class="${className}" title="${title}" onclick="ownerManager.toggleNumberBlock('${num}')">
                    ${num}
                </div>
            `;
        }
        
        container.innerHTML = html;
    }
    
    renderBlockedNumbersList() {
        const container = document.getElementById('blocked-numbers-list');
        const numbersData = this.stateManager.getData('numbers');
        const blockedNumbers = numbersData?.blocked || [];
        
        if (!container) return;
        
        if (blockedNumbers.length === 0) {
            container.innerHTML = '<p class="no-data">Aucun boule bloqué</p>';
            return;
        }
        
        container.innerHTML = blockedNumbers.map(num => `
            <div class="blocked-number-item">
                <label class="blocked-number-label">
                    <input type="checkbox" id="unblock-${num}" value="${num}">
                    <span class="blocked-number-info">
                        <strong>Boule ${num}</strong>
                        <span class="blocked-badge">
                            <i class="fas fa-ban"></i> Bloqué
                        </span>
                    </span>
                </label>
            </div>
        `).join('');
    }
    
    async loadLimitsTab() {
        try {
            const limitsData = await ApiService.getNumberLimits();
            const numbersData = this.stateManager.getData('numbers') || { blocked: [], limits: {} };
            numbersData.limits = limitsData;
            
            this.stateManager.setData('numbers', numbersData);
            this.renderLimitsList();
            
        } catch (error) {
            console.error('Erreur chargement limites:', error);
            this.showNotification('Erreur de chargement des limites', 'error');
        }
    }
    
    renderLimitsList() {
        const container = document.getElementById('limits-list');
        const numbersData = this.stateManager.getData('numbers') || { blocked: [], limits: {} };
        const limits = numbersData.limits || {};
        const limitedNumbers = Object.keys(limits);
        
        if (!container) return;
        
        if (limitedNumbers.length === 0) {
            container.innerHTML = '<p class="no-data">Aucune limite définie</p>';
            return;
        }
        
        container.innerHTML = limitedNumbers.map(number => `
            <div class="limit-item">
                <div>
                    <strong>Boule ${number}</strong>
                    <div style="font-size: 12px; color: var(--text-dim);">
                        Limite: ${limits[number].toLocaleString()} Gdes
                    </div>
                </div>
                <div style="display: flex; gap: 5px;">
                    <button class="btn btn-small btn-warning" onclick="ownerManager.editNumberLimit('${number}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-small btn-danger" onclick="ownerManager.removeNumberLimit('${number}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }
    
    async loadNumbersStats() {
        try {
            const stats = await ApiService.getNumberStats();
            const numbersData = this.stateManager.getData('numbers') || { blocked: [], limits: {}, stats: {} };
            numbersData.stats = stats;
            
            this.stateManager.setData('numbers', numbersData);
            this.renderNumbersStats();
            
        } catch (error) {
            console.error('Erreur chargement statistiques:', error);
            this.showNotification('Erreur de chargement des statistiques', 'error');
        }
    }
    
    renderNumbersStats() {
        const container = document.getElementById('stats-tab');
        const numbersData = this.stateManager.getData('numbers') || { blocked: [], limits: {}, stats: {} };
        const stats = numbersData.stats || {};
        
        if (!container) return;
        
        if (!stats || Object.keys(stats).length === 0) {
            container.innerHTML = `
                <div class="stats-container">
                    <h4>Statistiques des Boules</h4>
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-chart-bar" style="font-size: 48px; color: var(--text-dim); margin-bottom: 20px;"></i>
                        <p style="color: var(--text-dim);">Aucune statistique disponible</p>
                        <button class="btn btn-primary" onclick="ownerManager.loadNumbersStats()">
                            <i class="fas fa-sync"></i> Actualiser
                        </button>
                    </div>
                </div>
            `;
            return;
        }
        
        // Trier par fréquence
        const sortedNumbers = Object.keys(stats).sort((a, b) => {
            return (stats[b].frequency || 0) - (stats[a].frequency || 0);
        }).slice(0, 10);
        
        container.innerHTML = `
            <div class="stats-summary">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px;">
                    <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 15px;">
                        <div style="font-size: 12px; color: var(--text-dim);">Boules bloquées</div>
                        <div style="font-size: 32px; font-weight: bold; color: var(--primary); margin: 10px 0;">
                            ${numbersData.blocked?.length || 0}
                        </div>
                        <div style="font-size: 14px; color: var(--text);">
                            sur 100 boules
                        </div>
                    </div>
                    
                    <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 15px;">
                        <div style="font-size: 12px; color: var(--text-dim);">Boules avec limites</div>
                        <div style="font-size: 32px; font-weight: bold; color: var(--success); margin: 10px 0;">
                            ${Object.keys(numbersData.limits || {}).length}
                        </div>
                        <div style="font-size: 14px; color: var(--text);">
                            boules limitées
                        </div>
                    </div>
                    
                    <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 15px;">
                        <div style="font-size: 12px; color: var(--text-dim);">Moyenne par boule</div>
                        <div style="font-size: 32px; font-weight: bold; color: var(--warning); margin: 10px 0;">
                            ${Object.keys(stats).length > 0 ? 
                                Math.round(Object.values(stats).reduce((sum, stat) => sum + (stat.averageBet || 0), 0) / Object.keys(stats).length).toLocaleString() 
                                : '0'} Gdes
                        </div>
                        <div style="font-size: 14px; color: var(--text);">
                            Mise moyenne
                        </div>
                    </div>
                </div>
                
                <h4 style="margin-bottom: 15px;">Top 10 des boules les plus jouées</h4>
                <div class="top-numbers-list">
                    ${sortedNumbers.map((number, index) => {
                        const stat = stats[number];
                        return `
                            <div class="top-number-item">
                                <div style="display: flex; align-items: center; gap: 15px;">
                                    <div style="font-size: 14px; color: var(--text-dim); min-width: 30px;">
                                        #${index + 1}
                                    </div>
                                    <div style="font-size: 18px; font-weight: bold; color: var(--dark);">
                                        ${number}
                                    </div>
                                    <button class="btn btn-small btn-info" onclick="ownerManager.viewNumberHistory('${number}')" style="padding: 2px 8px; font-size: 11px;">
                                        <i class="fas fa-history"></i> Historique
                                    </button>
                                </div>
                                <div style="text-align: right;">
                                    <div style="font-size: 16px; font-weight: bold; color: var(--primary);">
                                        ${stat.frequency || 0} fois
                                    </div>
                                    <div style="font-size: 12px; color: var(--text-dim);">
                                        ${stat.totalBets ? stat.totalBets.toLocaleString() + ' Gdes' : '0 Gdes'} total
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }
    
    // === GESTION PUBLICATION ===
    async loadPublishHistory() {
        try {
            const history = await ApiService.getDrawHistory();
            const container = document.getElementById('publish-history');
            
            if (!container) return;
            
            if (!history || history.length === 0) {
                container.innerHTML = '<p class="no-data">Aucune publication trouvée</p>';
                return;
            }
            
            container.innerHTML = history.map(item => `
                <div class="history-item">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <strong>${item.drawName}</strong>
                            <div style="font-size: 12px; color: var(--text-dim); margin-top: 5px;">
                                Publié le ${new Date(item.publishDate).toLocaleString()}
                            </div>
                        </div>
                        <div>
                            <span class="badge" style="background: ${item.source === 'manual' ? 'var(--primary)' : 'var(--success)'}; 
                                  color: white; padding: 5px 10px; border-radius: 12px; font-size: 11px;">
                                ${item.source === 'manual' ? 'Manuel' : 'Auto'}
                            </span>
                        </div>
                    </div>
                    
                    ${item.results ? `
                        <div style="margin-top: 10px;">
                            <div style="font-size: 12px; color: var(--text-dim); margin-bottom: 5px;">Résultats:</div>
                            <div style="display: flex; gap: 5px;">
                                ${item.results.map(num => `
                                    <div style="width: 30px; height: 30px; border-radius: 50%; background: var(--primary); 
                                         color: white; display: flex; align-items: center; justify-content: center; 
                                         font-size: 12px; font-weight: bold;">
                                        ${num.toString().padStart(2, '0')}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    ${item.comment ? `
                        <div style="margin-top: 10px; font-size: 13px; color: var(--text);">
                            <i class="fas fa-comment"></i> ${item.comment}
                        </div>
                    ` : ''}
                </div>
            `).join('');
            
        } catch (error) {
            console.error('Erreur chargement historique:', error);
            const container = document.getElementById('publish-history');
            if (container) {
                container.innerHTML = '<p class="no-data error">Erreur de chargement de l\'historique</p>';
            }
        }
    }
    
    updateResultPreview() {
        const form = document.getElementById('manual-publish-form');
        const preview = document.getElementById('result-preview');
        
        if (!form || !preview) return;
        
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
        
        // Générer 5 numéros uniques
        const numbers = new Set();
        while (numbers.size < 5) {
            numbers.add(Math.floor(Math.random() * 100));
        }
        
        const inputs = form.querySelectorAll('input[name^="num"]');
        const numberArray = Array.from(numbers);
        
        inputs.forEach((input, index) => {
            if (index < 5) {
                input.value = numberArray[index];
            }
        });
        
        this.updateResultPreview();
        this.showNotification('Numéros aléatoires générés', 'info');
    }
    
    updateFetchStatus() {
        const indicator = document.getElementById('fetch-status-indicator');
        const statusText = document.getElementById('fetch-status-text');
        
        if (!indicator || !statusText) return;
        
        if (this.stateManager.state.autoFetchEnabled) {
            indicator.className = 'status-indicator status-active';
            statusText.textContent = 'Récupération automatique activée';
        } else {
            indicator.className = 'status-indicator status-inactive';
            statusText.textContent = 'Récupération automatique désactivée';
        }
    }
    
    // === MODALS ===
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            this.currentModal = modalId;
            modal.style.display = 'flex';
            setTimeout(() => {
                modal.classList.add('active');
            }, 10);
            
            // Focus sur le premier champ
            setTimeout(() => {
                const input = modal.querySelector('input, select, textarea');
                if (input) input.focus();
            }, 50);
        }
    }
    
    closeModal(modalId = null) {
        const id = modalId || this.currentModal;
        if (!id) return;
        
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.style.display = 'none';
                this.currentModal = null;
            }, 300);
        }
    }
    
    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
            modal.style.display = 'none';
        });
        this.currentModal = null;
    }
    
    // === NOTIFICATIONS ===
    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas fa-${this.getNotificationIcon(type)}"></i>
            <span>${message}</span>
            <button class="notification-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        this.notificationContainer.appendChild(notification);
        
        // Auto-suppression
        setTimeout(() => {
            if (notification.parentElement) {
                notification.style.animation = 'fadeOut 0.3s';
                setTimeout(() => {
                    if (notification.parentElement) {
                        notification.remove();
                    }
                }, 300);
            }
        }, 5000);
    }
    
    // === UTILITAIRES ===
    getActivityIcon(type) {
        const icons = {
            'user': 'user',
            'draw': 'calendar-alt',
            'system': 'cog',
            'security': 'shield-alt',
            'sale': 'money-bill-wave',
            'login': 'sign-in-alt',
            'logout': 'sign-out-alt',
            'create': 'plus',
            'update': 'edit',
            'delete': 'trash',
            'block': 'ban',
            'unblock': 'check-circle'
        };
        return icons[type] || 'info-circle';
    }
    
    getNotificationIcon(type) {
        const icons = {
            'success': 'check-circle',
            'error': 'exclamation-circle',
            'warning': 'exclamation-triangle',
            'info': 'info-circle'
        };
        return icons[type] || 'info-circle';
    }
    
    restoreUIState() {
        this.stateManager.loadFromLocalStorage();
        
        // Restaurer vue active
        const activeView = this.stateManager.getCurrentView();
        if (activeView) {
            this.switchView(activeView);
        }
        
        // Restaurer onglets actifs
        const publishTab = this.stateManager.state.currentPublishTab;
        if (publishTab) {
            this.switchPublishTab(publishTab);
        }
        
        const numbersTab = this.stateManager.state.currentNumbersTab;
        if (numbersTab) {
            this.switchNumbersTab(numbersTab);
        }
        
        const reportsTab = this.stateManager.state.currentReportsTab;
        if (reportsTab) {
            this.switchReportsTab(reportsTab);
        }
    }
    
    adjustUIForScreenSize() {
        if (window.innerWidth <= 768) {
            this.stateManager.closeMobileMenu();
        }
    }
    
    handleResize() {
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = setTimeout(() => {
            this.adjustUIForScreenSize();
        }, 250);
    }
    
    // === RAPPORTS ===
    async loadReport(reportType) {
        try {
            let data;
            switch(reportType) {
                case 'sales':
                    data = await ApiService.getSalesReport();
                    break;
                case 'financial':
                    data = await ApiService.getFinancialReport();
                    break;
                case 'users':
                    data = await ApiService.getUserStats();
                    break;
                case 'draws':
                    data = await ApiService.getDrawStats();
                    break;
            }
            
            this.renderReport(reportType, data);
            
        } catch (error) {
            console.error(`Erreur chargement rapport ${reportType}:`, error);
            this.showNotification(`Erreur de chargement du rapport ${reportType}`, 'error');
        }
    }
    
    renderReport(type, data) {
        const container = document.getElementById(`${type}-report`);
        if (!container) return;
        
        container.innerHTML = `
            <div class="report-content">
                <h4>Rapport ${type} - ${new Date().toLocaleDateString()}</h4>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; overflow: auto;">
                    <pre style="margin: 0; font-family: monospace; font-size: 12px;">
${JSON.stringify(data, null, 2)}
                    </pre>
                </div>
            </div>
        `;
    }
    
    // === RÈGLES ===
    renderRulesView() {
        // À implémenter selon la structure des règles
    }
    
    async saveRules() {
        try {
            const rules = this.collectRulesData();
            await ApiService.updateRules(rules);
            this.showNotification('Règles sauvegardées avec succès', 'success');
        } catch (error) {
            console.error('Erreur sauvegarde règles:', error);
            this.showNotification('Erreur lors de la sauvegarde des règles', 'error');
        }
    }
    
    collectRulesData() {
        // À implémenter selon la structure des règles
        return {};
    }
    
    async resetRules() {
        if (confirm('Restaurer les valeurs par défaut?')) {
            try {
                await ApiService.resetRules();
                this.showNotification('Règles réinitialisées', 'success');
                await this.loadRulesData();
            } catch (error) {
                console.error('Erreur réinitialisation règles:', error);
                this.showNotification('Erreur lors de la réinitialisation', 'error');
            }
        }
    }
    
    // === LIMITES ===
    renderLimitsView() {
        // À implémenter selon la structure des limites
    }
}

// Exporter pour usage global
window.UIManager = UIManager;