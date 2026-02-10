// Gestionnaire des agents
class AgentManager {
    constructor(apiService, uiManager) {
        this.apiService = apiService;
        this.uiManager = uiManager;
        this.initEventHandlers();
    }

    // Initialisation des gestionnaires d'événements
    initEventHandlers() {
        EVENT_HANDLERS.onAgentsRefresh = () => this.refreshAgents();
        EVENT_HANDLERS.onExportAgents = () => this.exportAgentsData();
        EVENT_HANDLERS.onSearchAgent = (query) => this.searchAgents(query);
        EVENT_HANDLERS.onFilterChange = (filter) => this.filterAgents(filter);
        EVENT_HANDLERS.onAgentTabChange = (tabName, button) => this.switchAgentTab(tabName, button);
        EVENT_HANDLERS.onDeleteRecentTickets = () => this.deleteRecentTickets();
        EVENT_HANDLERS.onToggleAgentBlock = () => this.toggleAgentBlock();
        EVENT_HANDLERS.onCloseModal = () => this.closeAgentModal();
    }

    // Charger les agents du superviseur
    async loadSupervisorAgents() {
        try {
            this.uiManager.toggleLoading(true, 'agents-container');
            
            const agents = await this.apiService.getSupervisorAgents();
            SUPERVISOR_STATE.agents = agents;
            
            this.renderAgentDashboard();
            this.renderFullAgentList();
            
            this.uiManager.showSuccess(`${agents.length} agents chargés`, 2000);
            return agents;
        } catch (error) {
            console.error('❌ Erreur chargement agents:', error);
            this.uiManager.showError(MESSAGES.ERROR.LOAD_FAILED);
            this.uiManager.setEmptyState('agents-container', 'Erreur de chargement');
            return [];
        }
    }

    // Afficher le tableau de bord des agents
    async renderAgentDashboard() {
        const container = document.getElementById('agents-dashboard-container');
        if (!container) return;

        if (SUPERVISOR_STATE.agents.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users-slash"></i>
                    <p>Aucun agent disponible</p>
                </div>
            `;
            return;
        }

        // Prendre les 4 premiers agents
        const agentsToShow = SUPERVISOR_STATE.agents.slice(0, 4);
        let html = '';

        for (const agent of agentsToShow) {
            try {
                const stats = await this.apiService.getAgentStats(agent.id);
                
                html += `
                    <div class="agent-card ${!agent.active ? 'blocked' : ''}">
                        <div class="agent-header">
                            <div class="agent-status">
                                <span class="status-dot ${agent.online ? 'online' : 'offline'}"></span>
                                ${agent.active ? 'Actif' : 'Bloqué'}
                            </div>
                            <span class="agent-location">${agent.location || 'Non spécifié'}</span>
                        </div>
                        <div class="agent-info">
                            <div class="agent-name">${agent.name}</div>
                            <div class="agent-id">${agent.id}</div>
                        </div>
                        <div class="agent-stats">
                            <div class="stat-item">
                                <span class="stat-label">Ventes</span>
                                <span class="stat-value">${DATA_FORMATTERS.formatCurrency(stats.totalBets)}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Tickets</span>
                                <span class="stat-value">${stats.totalTickets}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Gains</span>
                                <span class="stat-value">${DATA_FORMATTERS.formatCurrency(stats.totalWins)}</span>
                            </div>
                        </div>
                        <div class="agent-actions">
                            <button class="btn-small btn-warning view-agent-btn" data-agent-id="${agent.id}">
                                <i class="fas fa-eye"></i> Voir
                            </button>
                        </div>
                    </div>
                `;
            } catch (error) {
                console.error(`Erreur stats agent ${agent.id}:`, error);
            }
        }

        container.innerHTML = html;
        
        // Ajouter les écouteurs d'événements aux boutons
        container.querySelectorAll('.view-agent-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const agentId = e.currentTarget.getAttribute('data-agent-id');
                this.viewAgentDetails(agentId);
            });
        });
    }

    // Afficher la liste complète des agents
    async renderFullAgentList() {
        const container = document.getElementById('agents-container');
        if (!container) return;

        if (SUPERVISOR_STATE.agents.length === 0) {
            this.uiManager.setEmptyState('agents-container', 'Aucun agent disponible');
            return;
        }

        let html = '';

        for (const agent of SUPERVISOR_STATE.agents) {
            try {
                const stats = await this.apiService.getAgentStats(agent.id);
                
                html += `
                    <div class="agent-card ${!agent.active ? 'blocked' : ''}">
                        <div class="agent-header">
                            <div class="agent-status">
                                <span class="status-dot ${agent.online ? 'online' : 'offline'}"></span>
                                ${agent.active ? 'Actif' : 'Bloqué'}
                                ${!agent.active ? ' <span class="blocked-label">(Bloqué)</span>' : ''}
                            </div>
                            <div class="agent-header-actions">
                                <button class="btn-small ${!agent.active ? 'btn-success' : 'btn-danger'} block-agent-btn" 
                                        data-agent-id="${agent.id}" data-current-status="${agent.active}">
                                    ${!agent.active ? 'Débloquer' : 'Bloquer'}
                                </button>
                                <button class="btn-small btn-warning view-agent-btn" data-agent-id="${agent.id}">
                                    Détails
                                </button>
                            </div>
                        </div>
                        <div class="agent-info">
                            <div class="agent-name">${agent.name}</div>
                            <div class="agent-details">
                                <p><i class="fas fa-id-card"></i> <strong>ID:</strong> ${agent.id}</p>
                                ${agent.email ? `<p><i class="fas fa-envelope"></i> <strong>Email:</strong> ${agent.email}</p>` : ''}
                                ${agent.phone ? `<p><i class="fas fa-phone"></i> <strong>Téléphone:</strong> ${agent.phone}</p>` : ''}
                                ${agent.location ? `<p><i class="fas fa-map-marker-alt"></i> <strong>Localisation:</strong> ${agent.location}</p>` : ''}
                                <p><i class="fas fa-percentage"></i> <strong>Commission:</strong> ${agent.commission || 5}%</p>
                            </div>
                        </div>
                        <div class="agent-stats">
                            <div class="stat-item">
                                <span class="stat-label">Ventes Aujourd'hui</span>
                                <span class="stat-value">${DATA_FORMATTERS.formatCurrency(stats.todaySales)}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Tickets</span>
                                <span class="stat-value">${stats.totalTickets}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Gains</span>
                                <span class="stat-value">${DATA_FORMATTERS.formatCurrency(stats.totalWins)}</span>
                            </div>
                        </div>
                    </div>
                `;
            } catch (error) {
                console.error(`Erreur stats agent ${agent.id}:`, error);
            }
        }

        container.innerHTML = html;
        
        // Ajouter les écouteurs d'événements
        container.querySelectorAll('.view-agent-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const agentId = e.currentTarget.getAttribute('data-agent-id');
                this.viewAgentDetails(agentId);
            });
        });

        container.querySelectorAll('.block-agent-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const agentId = e.currentTarget.getAttribute('data-agent-id');
                const currentStatus = e.currentTarget.getAttribute('data-current-status') === 'true';
                await this.blockAgent(agentId, currentStatus);
            });
        });
    }

    // Voir les détails d'un agent
    async viewAgentDetails(agentId) {
        try {
            const agent = SUPERVISOR_STATE.agents.find(a => a.id == agentId);
            if (!agent) {
                this.uiManager.showError('Agent non trouvé');
                return;
            }

            SUPERVISOR_STATE.selectedAgent = agent;
            const modal = this.uiManager.showAgentModal(agent.name);

            // Charger les données en parallèle
            const [tickets, wins, stats] = await Promise.all([
                this.apiService.getAgentTickets(agentId),
                this.apiService.getAgentWins(agentId),
                this.apiService.getAgentStats(agentId)
            ]);

            this.renderAgentTickets(tickets);
            this.renderAgentSales(stats);
            this.renderAgentWins(wins);
            this.renderAgentReport(agent, tickets, wins, stats);

        } catch (error) {
            console.error('Erreur chargement détails agent:', error);
            this.uiManager.showError('Impossible de charger les détails');
        }
    }

    // Afficher les tickets d'un agent
    renderAgentTickets(tickets) {
        const container = document.getElementById('agent-tickets-list');
        
        if (!tickets || tickets.length === 0) {
            container.innerHTML = '<p class="empty-state small">Aucun ticket trouvé</p>';
            return;
        }
        
        container.innerHTML = tickets.map(ticket => {
            const canDelete = VALIDATORS.isRecentTicket(ticket.timestamp || ticket.date || ticket.created_at);
            const formattedTime = DATA_FORMATTERS.formatTimeAgo(ticket.timestamp || ticket.date || ticket.created_at);
            const amount = ticket.total || ticket.total_amount || ticket.amount || 0;
            const betsCount = ticket.betsCount || ticket.bets?.length || 1;
            
            return `
                <div class="ticket-item">
                    <div class="ticket-info">
                        <div class="ticket-header">
                            <strong>#${ticket.ticketId || ticket.ticket_id || ticket.id}</strong>
                            <span> - ${ticket.drawName || ticket.draw_name || 'Tirage'}</span>
                        </div>
                        <div class="ticket-details">
                            <span>${betsCount} pari(s) - ${DATA_FORMATTERS.formatCurrency(amount)}</span>
                            <span class="ticket-time">${formattedTime}</span>
                        </div>
                    </div>
                    ${canDelete ? 
                        `<button class="btn-delete-ticket delete-ticket-btn" data-ticket-id="${ticket.id}">
                            <i class="fas fa-trash"></i>
                        </button>` : 
                        '<span class="ticket-expired">Expiré</span>'
                    }
                </div>
            `;
        }).join('');
        
        // Ajouter les écouteurs pour la suppression
        container.querySelectorAll('.delete-ticket-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const ticketId = e.currentTarget.getAttribute('data-ticket-id');
                await this.deleteTicket(ticketId);
            });
        });
    }

    // Afficher les statistiques de ventes
    renderAgentSales(stats) {
        const container = document.getElementById('agent-sales-stats');
        const commission = DATA_FORMATTERS.calculateCommission(stats.totalBets, 0.05);
        const avgTicket = stats.totalTickets > 0 ? Math.round(stats.totalBets / stats.totalTickets) : 0;
        
        container.innerHTML = `
            <div class="sales-stats-grid">
                <div class="sales-stat-card">
                    <h5>Ventes Aujourd'hui</h5>
                    <p class="sales-stat-value">${DATA_FORMATTERS.formatCurrency(stats.todaySales)}</p>
                </div>
                <div class="sales-stat-card">
                    <h5>Tickets Émis</h5>
                    <p class="sales-stat-value">${stats.totalTickets}</p>
                </div>
                <div class="sales-stat-card">
                    <h5>Moyenne par Ticket</h5>
                    <p class="sales-stat-value">${DATA_FORMATTERS.formatCurrency(avgTicket)}</p>
                </div>
                <div class="sales-stat-card">
                    <h5>Commission (5%)</h5>
                    <p class="sales-stat-value success">${DATA_FORMATTERS.formatCurrency(commission)}</p>
                </div>
            </div>
        `;
    }

    // Afficher les gains
    renderAgentWins(wins) {
        const container = document.getElementById('agent-wins-list');
        
        if (!wins || wins.length === 0) {
            container.innerHTML = '<p class="empty-state small">Aucun gain récent</p>';
            return;
        }
        
        container.innerHTML = wins.map(win => {
            const amount = win.win_amount || win.amount || win.winAmount || 0;
            const status = win.paid ? 'Payé' : 'En attente';
            const statusClass = win.paid ? 'paid' : 'pending';
            const formattedDate = DATA_FORMATTERS.formatDate(win.date || win.created_at || win.timestamp);
            
            return `
                <div class="win-card ${statusClass}">
                    <div class="win-header">
                        <span class="win-ticket">Ticket #${win.ticket_id || win.ticketId || win.id}</span>
                        <span class="win-amount">${DATA_FORMATTERS.formatCurrency(amount)}</span>
                    </div>
                    <div class="win-details">
                        <p><i class="fas fa-calendar-alt"></i> Tirage: ${win.draw_name || win.drawName || 'Non spécifié'}</p>
                        <p><i class="fas fa-clock"></i> Date: ${formattedDate}</p>
                        <p><i class="fas fa-circle ${statusClass}"></i> Statut: ${status}</p>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Afficher le rapport détaillé
    renderAgentReport(agent, tickets, wins, stats) {
        const container = document.getElementById('agent-detailed-report');
        const totalSales = stats.totalBets || 0;
        const totalWins = stats.totalWins || 0;
        const successRate = DATA_FORMATTERS.calculateSuccessRate(tickets.length, wins.length);
        const commission = DATA_FORMATTERS.calculateCommission(totalSales, agent.commission || 0.05);
        const avgTicket = tickets.length > 0 ? Math.round(totalSales / tickets.length) : 0;
        
        container.innerHTML = `
            <div class="detailed-report">
                <h5>Rapport de Performance - ${agent.name}</h5>
                
                <div class="report-summary">
                    <div class="summary-item">
                        <span class="summary-label">Ventes Totales</span>
                        <span class="summary-value">${DATA_FORMATTERS.formatCurrency(totalSales)}</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-label">Gains Distribués</span>
                        <span class="summary-value success">${DATA_FORMATTERS.formatCurrency(totalWins)}</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-label">Taux de Réussite</span>
                        <span class="summary-value">${successRate}%</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-label">Commission (${agent.commission || 5}%)</span>
                        <span class="summary-value warning">${DATA_FORMATTERS.formatCurrency(commission)}</span>
                    </div>
                </div>
                
                <div class="report-details">
                    <h6>Statistiques Détailées</h6>
                    <ul class="details-list">
                        <li><i class="fas fa-ticket-alt"></i> Nombre total de tickets: ${tickets.length}</li>
                        <li><i class="fas fa-trophy"></i> Nombre de tickets gagnants: ${wins.length}</li>
                        <li><i class="fas fa-chart-bar"></i> Valeur moyenne des tickets: ${DATA_FORMATTERS.formatCurrency(avgTicket)}</li>
                        <li><i class="fas fa-user-check"></i> Statut: ${agent.active ? 'Actif' : 'Bloqué'}</li>
                        <li><i class="fas fa-map-marker-alt"></i> Localisation: ${agent.location || 'Non spécifié'}</li>
                        <li><i class="fas fa-calendar-check"></i> Jours actifs: ${stats.activeDays || 0}</li>
                    </ul>
                </div>
            </div>
        `;
    }

    // Supprimer un ticket
    async deleteTicket(ticketId) {
        const confirmed = await this.uiManager.showConfirm(
            MESSAGES.CONFIRM.DELETE_TICKET,
            'Supprimer Ticket'
        );
        
        if (!confirmed) return;
        
        try {
            const result = await this.apiService.deleteTicket(ticketId);
            
            if (result.success) {
                this.uiManager.showSuccess(MESSAGES.SUCCESS.DELETE_SUCCESS);
                
                // Recharger les tickets si un agent est sélectionné
                if (SUPERVISOR_STATE.selectedAgent) {
                    const tickets = await this.apiService.getAgentTickets(SUPERVISOR_STATE.selectedAgent.id);
                    this.renderAgentTickets(tickets);
                }
            } else {
                this.uiManager.showError(MESSAGES.ERROR.DELETE_FAILED);
            }
        } catch (error) {
            console.error('Erreur suppression ticket:', error);
            if (!this.uiManager.handleConnectionError(error)) {
                this.uiManager.showError(MESSAGES.ERROR.DELETE_FAILED);
            }
        }
    }

    // Supprimer les tickets récents
    async deleteRecentTickets() {
        if (!SUPERVISOR_STATE.selectedAgent) return;
        
        const confirmed = await this.uiManager.showConfirm(
            MESSAGES.CONFIRM.DELETE_RECENT_TICKETS,
            'Supprimer Tickets Récents'
        );
        
        if (!confirmed) return;
        
        try {
            const tickets = await this.apiService.getAgentTickets(SUPERVISOR_STATE.selectedAgent.id);
            const now = new Date();
            
            // Filtrer les tickets récents
            const recentTickets = tickets.filter(ticket => {
                return VALIDATORS.isRecentTicket(ticket.timestamp || ticket.date || ticket.created_at);
            });
            
            // Supprimer chaque ticket récent
            const deletePromises = recentTickets.map(ticket => 
                this.apiService.deleteTicket(ticket.id)
            );
            
            await Promise.all(deletePromises);
            
            this.uiManager.showSuccess(`${recentTickets.length} tickets récents supprimés`);
            
            // Recharger les données
            if (SUPERVISOR_STATE.selectedAgent) {
                const updatedTickets = await this.apiService.getAgentTickets(SUPERVISOR_STATE.selectedAgent.id);
                this.renderAgentTickets(updatedTickets);
            }
            
        } catch (error) {
            console.error('Erreur suppression tickets récents:', error);
            this.uiManager.showError('Erreur lors de la suppression');
        }
    }

    // Bloquer/débloquer un agent
    async blockAgent(agentId, currentStatus) {
        const message = currentStatus ? MESSAGES.CONFIRM.BLOCK_AGENT : MESSAGES.CONFIRM.UNBLOCK_AGENT;
        const title = currentStatus ? 'Bloquer Agent' : 'Débloquer Agent';
        
        const confirmed = await this.uiManager.showConfirm(message, title);
        if (!confirmed) return;
        
        try {
            const result = await this.apiService.blockAgent(agentId, currentStatus);
            
            if (result.success) {
                // Mettre à jour l'état local
                const agent = SUPERVISOR_STATE.agents.find(a => a.id == agentId);
                if (agent) {
                    agent.active = !currentStatus;
                }
                
                // Re-rendre les listes
                this.renderFullAgentList();
                this.renderAgentDashboard();
                
                this.uiManager.showSuccess(MESSAGES.SUCCESS.BLOCK_SUCCESS);
            } else {
                this.uiManager.showError(MESSAGES.ERROR.BLOCK_FAILED);
            }
        } catch (error) {
            console.error('Erreur blocage agent:', error);
            this.uiManager.showError(MESSAGES.ERROR.BLOCK_FAILED);
        }
    }

    // Basculer le blocage de l'agent sélectionné
    async toggleAgentBlock() {
        if (!SUPERVISOR_STATE.selectedAgent) return;
        await this.blockAgent(SUPERVISOR_STATE.selectedAgent.id, SUPERVISOR_STATE.selectedAgent.active);
    }

    // Changer d'onglet dans le modal
    switchAgentTab(tabName, button) {
        this.uiManager.switchAgentTab(tabName, button);
    }

    // Fermer le modal
    closeAgentModal() {
        this.uiManager.closeAgentModal();
        SUPERVISOR_STATE.selectedAgent = null;
    }

    // Actualiser les agents
    async refreshAgents() {
        if (!this.uiManager.checkInternetConnection()) return;
        
        try {
            this.uiManager.toggleLoading(true, 'agents-container');
            await this.loadSupervisorAgents();
            this.uiManager.showSuccess(MESSAGES.SUCCESS.REFRESH_SUCCESS);
        } catch (error) {
            console.error('Erreur actualisation agents:', error);
        }
    }

    // Rechercher des agents
    searchAgents(query) {
        if (!query.trim()) {
            this.renderFullAgentList();
            return;
        }
        
        const filteredAgents = SUPERVISOR_STATE.agents.filter(agent => {
            const searchText = query.toLowerCase();
            return (
                agent.name.toLowerCase().includes(searchText) ||
                agent.id.toLowerCase().includes(searchText) ||
                (agent.email && agent.email.toLowerCase().includes(searchText)) ||
                (agent.phone && agent.phone.toLowerCase().includes(searchText)) ||
                (agent.location && agent.location.toLowerCase().includes(searchText))
            );
        });
        
        this.renderFilteredAgents(filteredAgents);
    }

    // Filtrer les agents
    async filterAgents(filter) {
        if (filter === 'all') {
            this.renderFullAgentList();
            return;
        }
        
        const filteredAgents = SUPERVISOR_STATE.agents.filter(agent => {
            switch(filter) {
                case 'online':
                    return agent.online && agent.active;
                case 'offline':
                    return !agent.online && agent.active;
                case 'blocked':
                    return !agent.active;
                default:
                    return true;
            }
        });
        
        this.renderFilteredAgents(filteredAgents);
    }

    // Afficher les agents filtrés
    async renderFilteredAgents(agents) {
        const container = document.getElementById('agents-container');
        
        if (agents.length === 0) {
            container.innerHTML = '<p class="empty-state">Aucun agent trouvé</p>';
            return;
        }
        
        let html = '';
        
        for (const agent of agents) {
            try {
                const stats = await this.apiService.getAgentStats(agent.id);
                
                html += `
                    <div class="agent-card ${!agent.active ? 'blocked' : ''}">
                        <div class="agent-header">
                            <div class="agent-status">
                                <span class="status-dot ${agent.online ? 'online' : 'offline'}"></span>
                                ${agent.active ? 'Actif' : 'Bloqué'}
                            </div>
                            <div class="agent-header-actions">
                                <button class="btn-small ${!agent.active ? 'btn-success' : 'btn-danger'} block-agent-btn" 
                                        data-agent-id="${agent.id}" data-current-status="${agent.active}">
                                    ${!agent.active ? 'Débloquer' : 'Bloquer'}
                                </button>
                                <button class="btn-small btn-warning view-agent-btn" data-agent-id="${agent.id}">
                                    Détails
                                </button>
                            </div>
                        </div>
                        <div class="agent-info">
                            <div class="agent-name">${agent.name}</div>
                            <div class="agent-details">
                                <p><strong>ID:</strong> ${agent.id}</p>
                                ${agent.email ? `<p><strong>Email:</strong> ${agent.email}</p>` : ''}
                            </div>
                        </div>
                        <div class="agent-stats">
                            <div class="stat-item">
                                <span class="stat-label">Ventes</span>
                                <span class="stat-value">${DATA_FORMATTERS.formatCurrency(stats.todaySales)}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Tickets</span>
                                <span class="stat-value">${stats.totalTickets}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Gains</span>
                                <span class="stat-value">${DATA_FORMATTERS.formatCurrency(stats.totalWins)}</span>
                            </div>
                        </div>
                    </div>
                `;
            } catch (error) {
                console.error(`Erreur stats agent ${agent.id}:`, error);
            }
        }
        
        container.innerHTML = html;
        
        // Réattacher les écouteurs
        container.querySelectorAll('.view-agent-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const agentId = e.currentTarget.getAttribute('data-agent-id');
                this.viewAgentDetails(agentId);
            });
        });

        container.querySelectorAll('.block-agent-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const agentId = e.currentTarget.getAttribute('data-agent-id');
                const currentStatus = e.currentTarget.getAttribute('data-current-status') === 'true';
                await this.blockAgent(agentId, currentStatus);
            });
        });
    }

    // Exporter les données des agents
    exportAgentsData() {
        if (SUPERVISOR_STATE.agents.length === 0) {
            this.uiManager.showWarning('Aucune donnée à exporter');
            return;
        }
        
        try {
            const exportData = SUPERVISOR_STATE.agents.map(agent => ({
                id: agent.id,
                name: agent.name,
                email: agent.email || '',
                phone: agent.phone || '',
                location: agent.location || '',
                active: agent.active,
                online: agent.online,
                commission: agent.commission || 5,
                createdAt: agent.created_at || new Date().toISOString()
            }));
            
            const dataStr = JSON.stringify(exportData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const dataUrl = URL.createObjectURL(dataBlob);
            
            const dateStr = new Date().toISOString().split('T')[0];
            const fileName = `agents_lotato_${dateStr}.json`;
            
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(dataUrl);
            
            this.uiManager.showSuccess(MESSAGES.SUCCESS.EXPORT_SUCCESS);
        } catch (error) {
            console.error('Erreur export données:', error);
            this.uiManager.showError('Erreur lors de l\'export');
        }
    }
}

// Instance unique du gestionnaire d'agents
const agentManager = new AgentManager(apiService, uiManager);