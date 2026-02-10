// Gestionnaire d'interface utilisateur
class UIManager {
    constructor() {
        this.notificationContainer = document.getElementById('notification-container');
        this.initEventListeners();
        this.initMobileMenu();
    }

    // Initialisation des écouteurs d'événements
    initEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            if (!item.classList.contains('logout-btn')) {
                item.addEventListener('click', (e) => {
                    const view = item.getAttribute('data-view');
                    if (view && EVENT_HANDLERS.onViewChange) {
                        EVENT_HANDLERS.onViewChange(view, item);
                    }
                    // Fermer le menu mobile après clic
                    this.closeMobileMenu();
                });
            }
        });

        // Déconnexion
        document.querySelector('.logout-btn')?.addEventListener('click', () => {
            if (EVENT_HANDLERS.onLogout) {
                EVENT_HANDLERS.onLogout();
            }
        });

        // Boutons d'action
        document.getElementById('refresh-data')?.addEventListener('click', () => {
            if (EVENT_HANDLERS.onDataRefresh) {
                EVENT_HANDLERS.onDataRefresh();
            }
        });

        document.getElementById('refresh-agents')?.addEventListener('click', () => {
            if (EVENT_HANDLERS.onAgentsRefresh) {
                EVENT_HANDLERS.onAgentsRefresh();
            }
        });

        document.getElementById('export-agents')?.addEventListener('click', () => {
            if (EVENT_HANDLERS.onExportAgents) {
                EVENT_HANDLERS.onExportAgents();
            }
        });

        // Recherche et filtres
        const searchInput = document.getElementById('search-agent');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                if (EVENT_HANDLERS.onSearchAgent) {
                    EVENT_HANDLERS.onSearchAgent(e.target.value);
                }
            });
        }

        document.getElementById('filter-status')?.addEventListener('change', (e) => {
            if (EVENT_HANDLERS.onFilterChange) {
                EVENT_HANDLERS.onFilterChange(e.target.value);
            }
        });

        // Période de rapport
        document.getElementById('report-period')?.addEventListener('change', (e) => {
            if (EVENT_HANDLERS.onReportPeriodChange) {
                EVENT_HANDLERS.onReportPeriodChange(e.target.value);
            }
        });

        // Menu burger mobile
        document.getElementById('mobile-menu-toggle')?.addEventListener('click', () => {
            this.toggleMobileMenu();
        });

        // Fermer le menu en cliquant en dehors
        document.addEventListener('click', (e) => {
            const sidebar = document.querySelector('.supervisor-sidebar');
            const menuToggle = document.getElementById('mobile-menu-toggle');
            
            if (SUPERVISOR_STATE.mobileMenuOpen && 
                !sidebar.contains(e.target) && 
                !menuToggle.contains(e.target)) {
                this.closeMobileMenu();
            }
        });
    }

    // Initialiser le menu mobile
    initMobileMenu() {
        // Créer le bouton menu burger pour mobile
        const headerLeft = document.querySelector('.header-left');
        if (headerLeft && !document.getElementById('mobile-menu-toggle')) {
            const menuToggle = document.createElement('button');
            menuToggle.id = 'mobile-menu-toggle';
            menuToggle.className = 'mobile-menu-toggle';
            menuToggle.innerHTML = '<i class="fas fa-bars"></i>';
            headerLeft.appendChild(menuToggle);
        }
    }

    // Basculer le menu mobile
    toggleMobileMenu() {
        const sidebar = document.querySelector('.supervisor-sidebar');
        const overlay = document.getElementById('mobile-overlay') || this.createMobileOverlay();
        
        if (SUPERVISOR_STATE.mobileMenuOpen) {
            sidebar.classList.remove('mobile-open');
            overlay.classList.remove('active');
            SUPERVISOR_STATE.mobileMenuOpen = false;
        } else {
            sidebar.classList.add('mobile-open');
            overlay.classList.add('active');
            SUPERVISOR_STATE.mobileMenuOpen = true;
        }
    }

    // Fermer le menu mobile
    closeMobileMenu() {
        const sidebar = document.querySelector('.supervisor-sidebar');
        const overlay = document.getElementById('mobile-overlay');
        
        if (sidebar) {
            sidebar.classList.remove('mobile-open');
        }
        if (overlay) {
            overlay.classList.remove('active');
        }
        SUPERVISOR_STATE.mobileMenuOpen = false;
    }

    // Créer l'overlay pour mobile
    createMobileOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'mobile-overlay';
        overlay.className = 'mobile-overlay';
        document.body.appendChild(overlay);
        
        overlay.addEventListener('click', () => {
            this.closeMobileMenu();
        });
        
        return overlay;
    }

    // Afficher une notification
    showNotification(message, type = 'info', duration = 3000) {
        // Créer le conteneur s'il n'existe pas
        if (!this.notificationContainer) {
            this.notificationContainer = document.createElement('div');
            this.notificationContainer.id = 'notification-container';
            document.body.appendChild(this.notificationContainer);
        }
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        let icon = 'info-circle';
        switch(type) {
            case 'success': icon = 'check-circle'; break;
            case 'error': icon = 'exclamation-circle'; break;
            case 'warning': icon = 'exclamation-triangle'; break;
        }
        
        notification.innerHTML = `
            <i class="fas fa-${icon}"></i>
            <span>${message}</span>
            <button class="notification-close"><i class="fas fa-times"></i></button>
        `;
        
        this.notificationContainer.appendChild(notification);
        
        // Animation d'entrée
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        // Fermer la notification
        notification.querySelector('.notification-close').addEventListener('click', () => {
            this.removeNotification(notification);
        });
        
        // Suppression automatique
        if (duration > 0) {
            setTimeout(() => {
                this.removeNotification(notification);
            }, duration);
        }
        
        return notification;
    }

    // Supprimer une notification
    removeNotification(notification) {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }

    // Afficher une erreur
    showError(message, duration = 4000) {
        return this.showNotification(message, 'error', duration);
    }

    // Afficher un succès
    showSuccess(message, duration = 3000) {
        return this.showNotification(message, 'success', duration);
    }

    // Afficher un avertissement
    showWarning(message, duration = 3000) {
        return this.showNotification(message, 'warning', duration);
    }

    // Afficher une boîte de dialogue de confirmation
    showConfirm(message, title = 'Confirmation') {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal confirm-modal';
            modal.style.display = 'flex';
            
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 400px;">
                    <div class="modal-header">
                        <h3>${title}</h3>
                        <button class="close-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p>${message}</p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="confirm-cancel">Annuler</button>
                        <button class="btn btn-danger" id="confirm-ok">Confirmer</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Gestion des boutons
            const closeModal = () => {
                document.body.removeChild(modal);
                resolve(false);
            };
            
            modal.querySelector('.close-modal').addEventListener('click', closeModal);
            modal.querySelector('#confirm-cancel').addEventListener('click', closeModal);
            
            modal.querySelector('#confirm-ok').addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve(true);
            });
            
            // Fermer en cliquant en dehors
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeModal();
                }
            });
            
            // Fermer avec la touche Échap
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    closeModal();
                    document.removeEventListener('keydown', handleEscape);
                }
            };
            document.addEventListener('keydown', handleEscape);
        });
    }

    // Afficher une boîte de dialogue d'informations
    showInfo(message, title = 'Information') {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal info-modal';
            modal.style.display = 'flex';
            
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 400px;">
                    <div class="modal-header">
                        <h3>${title}</h3>
                        <button class="close-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p>${message}</p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-primary" id="info-ok">OK</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            const closeModal = () => {
                document.body.removeChild(modal);
                resolve();
            };
            
            modal.querySelector('.close-modal').addEventListener('click', closeModal);
            modal.querySelector('#info-ok').addEventListener('click', closeModal);
            
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeModal();
                }
            });
        });
    }

    // Afficher le modal de détails d'agent
    showAgentModal(agentName) {
        const modal = document.getElementById('agent-details-modal');
        const title = document.getElementById('modal-agent-name');
        
        title.textContent = `Détails: ${agentName}`;
        modal.style.display = 'flex';
        
        // Écouteurs pour les onglets
        modal.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const tabName = this.getAttribute('data-tab');
                if (EVENT_HANDLERS.onAgentTabChange) {
                    EVENT_HANDLERS.onAgentTabChange(tabName, this);
                }
            });
        });
        
        // Écouteurs pour les boutons du modal
        modal.querySelector('#delete-recent-tickets').addEventListener('click', () => {
            if (EVENT_HANDLERS.onDeleteRecentTickets) {
                EVENT_HANDLERS.onDeleteRecentTickets();
            }
        });
        
        modal.querySelector('#toggle-agent-block').addEventListener('click', () => {
            if (EVENT_HANDLERS.onToggleAgentBlock) {
                EVENT_HANDLERS.onToggleAgentBlock();
            }
        });
        
        modal.querySelector('#close-modal').addEventListener('click', () => {
            if (EVENT_HANDLERS.onCloseModal) {
                EVENT_HANDLERS.onCloseModal();
            }
        });
        
        modal.querySelector('.close-modal').addEventListener('click', () => {
            if (EVENT_HANDLERS.onCloseModal) {
                EVENT_HANDLERS.onCloseModal();
            }
        });
        
        // Fermer avec la touche Échap
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                if (EVENT_HANDLERS.onCloseModal) {
                    EVENT_HANDLERS.onCloseModal();
                }
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
        
        // Fermer en cliquant en dehors
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                if (EVENT_HANDLERS.onCloseModal) {
                    EVENT_HANDLERS.onCloseModal();
                }
            }
        });
        
        return modal;
    }

    // Fermer le modal
    closeAgentModal() {
        const modal = document.getElementById('agent-details-modal');
        modal.style.display = 'none';
    }

    // Changer d'onglet dans le modal
    switchAgentTab(tabName, button) {
        // Mettre à jour les boutons actifs
        document.querySelectorAll('#agent-details-modal .tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Cacher tous les contenus
        document.querySelectorAll('#agent-details-modal .tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        // Activer le bouton et le contenu sélectionnés
        button.classList.add('active');
        document.getElementById(`agent-${tabName}-tab`).classList.add('active');
    }

    // Basculer l'état de chargement
    toggleLoading(show, elementId = null) {
        if (elementId) {
            const element = document.getElementById(elementId);
            if (element) {
                if (show) {
                    element.innerHTML = `
                        <div class="loading-spinner">
                            <i class="fas fa-spinner fa-spin"></i>
                            <p>Chargement...</p>
                        </div>
                    `;
                }
            }
        }
        
        SUPERVISOR_STATE.isLoading = show;
    }

    // Mettre à jour les statistiques du header
    updateHeaderStats(onlineCount, totalSales, totalWins) {
        const onlineElement = document.getElementById('online-count');
        const salesElement = document.getElementById('total-sales');
        const winsElement = document.getElementById('total-wins');
        
        if (onlineElement) onlineElement.textContent = onlineCount;
        if (salesElement) salesElement.textContent = totalSales;
        if (winsElement) winsElement.textContent = totalWins;
    }

    // Mettre à jour les informations du superviseur
    updateSupervisorInfo(name, email = '', phone = '') {
        const supervisorElement = document.getElementById('current-supervisor');
        const infoElement = document.getElementById('supervisor-info');
        
        if (supervisorElement) supervisorElement.textContent = name;
        if (infoElement) {
            infoElement.textContent = `Superviseur: ${name}${email ? ` • ${email}` : ''}${phone ? ` • ${phone}` : ''}`;
        }
    }

    // Changer de vue
    switchView(viewName) {
        // Mettre à jour la navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const navItem = document.querySelector(`.nav-item[data-view="${viewName}"]`);
        if (navItem) {
            navItem.classList.add('active');
        }
        
        // Cacher toutes les vues
        document.querySelectorAll('.view-content').forEach(view => {
            view.style.display = 'none';
        });
        
        // Afficher la vue sélectionnée
        const targetView = document.getElementById(`${viewName}-view`);
        if (targetView) {
            targetView.style.display = 'block';
        }
        
        // Fermer le menu mobile si ouvert
        this.closeMobileMenu();
        
        SUPERVISOR_STATE.currentView = viewName;
    }

    // Rendre un élément vide
    setEmptyState(elementId, message = 'Aucune donnée disponible') {
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = `<p class="empty-state">${message}</p>`;
        }
    }

    // Ajouter un indicateur de chargement
    addLoadingSpinner(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = `
                <div class="loading-spinner">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Chargement...</p>
                </div>
            `;
        }
    }

    // Vérifier la connexion Internet
    checkInternetConnection() {
        if (!navigator.onLine) {
            this.showError(MESSAGES.ERROR.NETWORK_ERROR, 5000);
            return false;
        }
        return true;
    }

    // Gérer les erreurs de connexion
    handleConnectionError(error) {
        if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
            this.showError(MESSAGES.ERROR.NETWORK_ERROR, 5000);
            return true;
        }
        return false;
    }

    // Afficher le formulaire de paramètres
    showSettingsForm(settings) {
        const container = document.getElementById('settings-container');
        if (!container) return;
        
        container.innerHTML = `
            <div class="settings-form">
                <div class="settings-section">
                    <h4><i class="fas fa-bell"></i> Notifications</h4>
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="notif-sales" ${settings.notifySales ? 'checked' : ''}>
                            <span>Alertes de ventes importantes</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="notif-wins" ${settings.notifyWins ? 'checked' : ''}>
                            <span>Alertes de gros gains</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="notif-agent" ${settings.notifyAgentActivity ? 'checked' : ''}>
                            <span>Activité des agents</span>
                        </label>
                    </div>
                </div>
                
                <div class="settings-section">
                    <h4><i class="fas fa-chart-line"></i> Rapports</h4>
                    <div class="form-group">
                        <label>Format d'export par défaut</label>
                        <select id="report-format" class="form-control">
                            <option value="pdf" ${settings.defaultReportFormat === 'pdf' ? 'selected' : ''}>PDF</option>
                            <option value="excel" ${settings.defaultReportFormat === 'excel' ? 'selected' : ''}>Excel</option>
                            <option value="csv" ${settings.defaultReportFormat === 'csv' ? 'selected' : ''}>CSV</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Période de rapport par défaut</label>
                        <select id="default-period" class="form-control">
                            <option value="today" ${settings.defaultPeriod === 'today' ? 'selected' : ''}>Aujourd'hui</option>
                            <option value="week" ${settings.defaultPeriod === 'week' ? 'selected' : ''}>Cette semaine</option>
                            <option value="month" ${settings.defaultPeriod === 'month' ? 'selected' : ''}>Ce mois</option>
                        </select>
                    </div>
                </div>
                
                <div class="settings-section">
                    <h4><i class="fas fa-shield-alt"></i> Sécurité</h4>
                    <div class="form-group">
                        <label>Délai de déconnexion automatique (minutes)</label>
                        <input type="number" id="auto-logout" class="form-control" 
                               value="${settings.autoLogoutMinutes || 30}" min="5" max="240">
                    </div>
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="require-pin" ${settings.requirePinForActions ? 'checked' : ''}>
                            <span>Demander PIN pour actions critiques</span>
                        </label>
                    </div>
                </div>
                
                <div class="settings-section">
                    <h4><i class="fas fa-palette"></i> Interface</h4>
                    <div class="form-group">
                        <label>Thème</label>
                        <select id="theme" class="form-control">
                            <option value="light" ${settings.theme === 'light' ? 'selected' : ''}>Clair</option>
                            <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>Sombre</option>
                            <option value="auto" ${settings.theme === 'auto' ? 'selected' : ''}>Auto</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Taille de texte</label>
                        <select id="font-size" class="form-control">
                            <option value="small" ${settings.fontSize === 'small' ? 'selected' : ''}>Petit</option>
                            <option value="normal" ${settings.fontSize === 'normal' ? 'selected' : ''}>Normal</option>
                            <option value="large" ${settings.fontSize === 'large' ? 'selected' : ''}>Grand</option>
                        </select>
                    </div>
                </div>
                
                <div class="settings-actions">
                    <button class="btn btn-primary" id="save-settings">
                        <i class="fas fa-save"></i> Enregistrer les paramètres
                    </button>
                    <button class="btn btn-secondary" id="reset-settings">
                        <i class="fas fa-undo"></i> Rétablir les valeurs par défaut
                    </button>
                </div>
            </div>
        `;
        
        // Ajouter les écouteurs d'événements
        document.getElementById('save-settings').addEventListener('click', () => {
            this.saveSettings();
        });
        
        document.getElementById('reset-settings').addEventListener('click', () => {
            if (confirm('Rétablir les valeurs par défaut?')) {
                this.resetSettings();
            }
        });
    }

    // Enregistrer les paramètres
    async saveSettings() {
        const settings = {
            notifySales: document.getElementById('notif-sales').checked,
            notifyWins: document.getElementById('notif-wins').checked,
            notifyAgentActivity: document.getElementById('notif-agent').checked,
            defaultReportFormat: document.getElementById('report-format').value,
            defaultPeriod: document.getElementById('default-period').value,
            autoLogoutMinutes: parseInt(document.getElementById('auto-logout').value),
            requirePinForActions: document.getElementById('require-pin').checked,
            theme: document.getElementById('theme').value,
            fontSize: document.getElementById('font-size').value
        };
        
        try {
            const result = await apiService.updateSettings(settings);
            if (result.success) {
                this.showSuccess('Paramètres enregistrés avec succès');
                // Appliquer le thème immédiatement
                this.applyTheme(settings.theme);
            }
        } catch (error) {
            this.showError('Erreur lors de l\'enregistrement des paramètres');
        }
    }

    // Réinitialiser les paramètres
    async resetSettings() {
        const defaultSettings = {
            notifySales: true,
            notifyWins: true,
            notifyAgentActivity: true,
            defaultReportFormat: 'pdf',
            defaultPeriod: 'today',
            autoLogoutMinutes: 30,
            requirePinForActions: true,
            theme: 'auto',
            fontSize: 'normal'
        };
        
        this.showSettingsForm(defaultSettings);
    }

    // Appliquer le thème
    applyTheme(theme) {
        if (theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }
    }
}

// Instance unique de l'UI Manager
const uiManager = new UIManager();