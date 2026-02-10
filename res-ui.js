// Gestionnaire d'interface utilisateur
class UIManager {
    constructor() {
        this.notificationContainer = document.getElementById('notification-container');
        this.initEventListeners();
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
    }

    // Afficher une notification
    showNotification(message, type = 'info', duration = 3000) {
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
        `;
        
        this.notificationContainer.appendChild(notification);
        
        // Animation d'entrée
        setTimeout(() => {
            notification.style.animation = 'slideIn 0.3s';
        }, 10);
        
        // Suppression automatique
        setTimeout(() => {
            notification.style.animation = 'slideIn 0.3s reverse';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, duration);
        
        return notification;
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
            modal.querySelector('.close-modal').addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve(false);
            });
            
            modal.querySelector('#confirm-cancel').addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve(false);
            });
            
            modal.querySelector('#confirm-ok').addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve(true);
            });
            
            // Fermer en cliquant en dehors
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    document.body.removeChild(modal);
                    resolve(false);
                }
            });
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
            
            modal.querySelector('.close-modal').addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve();
            });
            
            modal.querySelector('#info-ok').addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve();
            });
            
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    document.body.removeChild(modal);
                    resolve();
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
        
        // Nettoyer les écouteurs
        modal.querySelectorAll('.tab-btn').forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
        });
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
        document.getElementById('online-count').textContent = onlineCount;
        document.getElementById('total-sales').textContent = totalSales;
        document.getElementById('total-wins').textContent = totalWins;
    }

    // Mettre à jour les informations du superviseur
    updateSupervisorInfo(name, email = '', phone = '') {
        document.getElementById('current-supervisor').textContent = name;
        document.getElementById('supervisor-info').textContent = 
            `Superviseur: ${name}${email ? ` • ${email}` : ''}${phone ? ` • ${phone}` : ''}`;
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
        
        SUPERVISOR_STATE.currentView = viewName;
    }

    // Afficher le menu latéral sur mobile
    toggleSidebar() {
        const sidebar = document.querySelector('.supervisor-sidebar');
        sidebar.classList.toggle('mobile-open');
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
}

// Instance unique de l'UI Manager
const uiManager = new UIManager();