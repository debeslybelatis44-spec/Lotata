// Classe principale de gestion du superviseur
class SupervisorManager {
    constructor() {
        this.initSupervisor();
    }

    async initSupervisor() {
        try {
            console.log('🔐 Initialisation du superviseur...');
            
            // Vérifier l'authentification
            const userData = await SupervisorAPI.verifyToken();
            
            if (userData.user.role !== 'supervisor') {
                throw new Error('Accès réservé aux superviseurs');
            }

            SUPERVISOR_CONFIG.SUPERVISOR_ID = userData.user.id.replace('supervisor-', '');
            SUPERVISOR_CONFIG.SUPERVISOR_NAME = userData.user.name;
            
            // Récupérer les informations détaillées du superviseur
            const supervisorInfo = await SupervisorAPI.getSupervisorInfo();
            if (supervisorInfo) {
                SUPERVISOR_CONFIG.SUPERVISOR_EMAIL = supervisorInfo.email || '';
                SUPERVISOR_CONFIG.SUPERVISOR_PHONE = supervisorInfo.phone || '';
            }
            
            // Mettre à jour l'interface
            document.getElementById('current-supervisor').textContent = SUPERVISOR_CONFIG.SUPERVISOR_NAME;
            document.getElementById('supervisor-info').textContent = 
                `Superviseur: ${SUPERVISOR_CONFIG.SUPERVISOR_NAME}`;
            
            await this.loadSupervisorAgents();
            await this.updateDashboardStats();
            
            console.log('✅ Superviseur initialisé:', SUPERVISOR_CONFIG.SUPERVISOR_NAME);
            
            // Afficher notification de succès
            this.showNotification('Connexion réussie', 'success');
            
        } catch (error) {
            console.error('❌ Erreur d\'authentification:', error);
            this.showError('Échec de l\'authentification. Redirection...');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 2000);
        }
    }

    async loadSupervisorAgents() {
        try {
            console.log('📋 Chargement des agents...');
            const agents = await SupervisorAPI.getSupervisorAgents();
            
            SUPERVISOR_STATE.agents = agents;
            this.renderAgentDashboard();
            
            console.log(`✅ ${agents.length} agents chargés`);
        } catch (error) {
            console.error('❌ Erreur chargement agents:', error);
            this.showError('Impossible de charger les agents');
        }
    }

    async renderAgentDashboard() {
        const container = document.getElementById('agents-dashboard-container');
        const agentsList = SUPERVISOR_STATE.agents.slice(0, 4);
        
        let html = '';
        
        if (agentsList.length === 0) {
            html = '<p class="no-data">Aucun agent disponible</p>';
            container.innerHTML = html;
            return;
        }
        
        for (const agent of agentsList) {
            // Récupérer les statistiques réelles depuis l'API
            const stats = await SupervisorAPI.getAgentStats(agent.id);
            
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
                            <span class="stat-value">${stats.totalBets || 0} Gdes</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Tickets</span>
                            <span class="stat-value">${stats.totalTickets || 0}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Gains</span>
                            <span class="stat-value">${stats.totalWins || 0} Gdes</span>
                        </div>
                    </div>
                    <div class="agent-actions">
                        <button class="btn-small btn-warning" onclick="supervisorManager.viewAgentDetails('${agent.id}')">
                            <i class="fas fa-eye"></i> Voir
                        </button>
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
        this.renderFullAgentList();
    }

    async renderFullAgentList() {
        const container = document.getElementById('agents-container');
        if (!container) return;
        
        let html = '';
        
        if (SUPERVISOR_STATE.agents.length === 0) {
            html = '<p class="no-data">Aucun agent disponible</p>';
            container.innerHTML = html;
            return;
        }
        
        for (const agent of SUPERVISOR_STATE.agents) {
            // Récupérer les statistiques réelles depuis l'API
            const stats = await SupervisorAPI.getAgentStats(agent.id);
            
            html += `
                <div class="agent-card ${!agent.active ? 'blocked' : ''}">
                    <div class="agent-header">
                        <div class="agent-status">
                            <span class="status-dot ${agent.online ? 'online' : 'offline'}"></span>
                            ${agent.active ? 'Actif' : 'Bloqué'}
                            ${!agent.active ? ' • <span class="blocked-text">Bloqué</span>' : ''}
                        </div>
                        <div class="agent-actions">
                            <button class="btn-small ${!agent.active ? 'btn-success' : 'btn-danger'}" 
                                    onclick="supervisorManager.blockAgent('${agent.id}', ${!agent.active})">
                                ${!agent.active ? 'Débloquer' : 'Bloquer'}
                            </button>
                            <button class="btn-small btn-warning" onclick="supervisorManager.viewAgentDetails('${agent.id}')">
                                Détails
                            </button>
                        </div>
                    </div>
                    <div class="agent-info">
                        <h4>${agent.name}</h4>
                        <p><strong>ID:</strong> ${agent.id}</p>
                        <p><strong>Email:</strong> ${agent.email || 'Non spécifié'}</p>
                        <p><strong>Téléphone:</strong> ${agent.phone || 'Non spécifié'}</p>
                        <p><strong>Localisation:</strong> ${agent.location || 'Non spécifié'}</p>
                        <p><strong>Commission:</strong> ${agent.commission || 5}%</p>
                    </div>
                    <div class="agent-stats">
                        <div class="stat-item">
                            <span class="stat-label">Ventes Aujourd'hui</span>
                            <span class="stat-value">${stats.totalBets || 0} Gdes</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Tickets</span>
                            <span class="stat-value">${stats.totalTickets || 0}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Gains</span>
                            <span class="stat-value">${stats.totalWins || 0} Gdes</span>
                        </div>
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
    }

    async updateDashboardStats() {
        try {
            const reports = await SupervisorAPI.getSupervisorReports('today');
            
            const activeAgents = SUPERVISOR_STATE.agents.filter(a => a.active).length;
            const totalTickets = reports.totalTickets || 0;
            const todaySales = reports.totalSales || 0;
            const totalWins = reports.totalWins || 0;
            const totalCommission = (todaySales * 0.05).toFixed(2); // Commission de 5%
            
            document.getElementById('active-agents').textContent = activeAgents;
            document.getElementById('today-sales').textContent = `${todaySales.toLocaleString()} Gdes`;
            document.getElementById('total-tickets').textContent = totalTickets.toLocaleString();
            document.getElementById('total-commission').textContent = `${totalCommission} Gdes`;
            document.getElementById('online-count').textContent = SUPERVISOR_STATE.agents.filter(a => a.online && a.active).length;
            document.getElementById('total-sales').textContent = `${(todaySales/1000).toFixed(1)}K`;
            document.getElementById('total-wins').textContent = `${(totalWins/1000).toFixed(1)}K`;
            
        } catch (error) {
            console.error('Erreur mise à jour statistiques:', error);
            // Utiliser des données par défaut si l'API échoue
            document.getElementById('active-agents').textContent = '0';
            document.getElementById('today-sales').textContent = '0 Gdes';
            document.getElementById('total-tickets').textContent = '0';
            document.getElementById('total-commission').textContent = '0 Gdes';
        }
    }

    async viewAgentDetails(agentId) {
        try {
            const agent = SUPERVISOR_STATE.agents.find(a => a.id == agentId);
            if (!agent) {
                this.showError('Agent non trouvé');
                return;
            }

            SUPERVISOR_STATE.selectedAgent = agent;
            
            document.getElementById('modal-agent-name').textContent = `Détails: ${agent.name}`;
            
            const [tickets, wins, stats] = await Promise.all([
                SupervisorAPI.getAgentTickets(agentId),
                SupervisorAPI.getAgentWins(agentId),
                SupervisorAPI.getAgentStats(agentId)
            ]);
            
            this.renderAgentTickets(tickets);
            this.renderAgentSales(stats);
            this.renderAgentWins(wins);
            this.renderAgentReport(agent, tickets, wins, stats);
            
            document.getElementById('agent-details-modal').style.display = 'flex';
        } catch (error) {
            console.error('Erreur chargement détails agent:', error);
            this.showError('Impossible de charger les détails de l\'agent');
        }
    }

    renderAgentTickets(tickets) {
        const container = document.getElementById('agent-tickets-list');
        
        if (!tickets || tickets.length === 0) {
            container.innerHTML = '<p class="no-data">Aucun ticket trouvé</p>';
            return;
        }
        
        container.innerHTML = tickets.map(ticket => {
            const ticketTime = new Date(ticket.timestamp || ticket.date || ticket.created_at);
            const now = new Date();
            const diffMinutes = (now - ticketTime) / (1000 * 60);
            const canDelete = diffMinutes <= SUPERVISOR_CONFIG.PERMISSIONS.MAX_DELETE_TIME;

            return `
                <div class="ticket-item">
                    <div class="ticket-info">
                        <span><strong>#${ticket.ticketId || ticket.ticket_id || ticket.id}</strong> - ${ticket.drawName || ticket.draw_name || 'Tirage'}</span>
                        <span class="ticket-time">${ticketTime.toLocaleString()}</span>
                    </div>
                    <div class="ticket-details">
                        <span>${ticket.betsCount || (ticket.bets ? ticket.bets.length : 1)} paris - ${ticket.total || ticket.total_amount || ticket.amount || 0} Gdes</span>
                        ${canDelete ? 
                            `<button class="btn-delete-ticket" onclick="supervisorManager.deleteTicket('${ticket.id}')">
                                <i class="fas fa-trash"></i>
                            </button>` : 
                            '<span class="expired-text">Expiré</span>'
                        }
                    </div>
                </div>
            `;
        }).join('');
    }

    renderAgentSales(stats) {
        const container = document.getElementById('agent-sales-stats');
        const totalBets = stats.totalBets || 0;
        const totalTickets = stats.totalTickets || 0;
        const avgPerTicket = totalTickets > 0 ? Math.round(totalBets / totalTickets) : 0;
        const commission = (totalBets * 0.05).toFixed(2);
        
        container.innerHTML = `
            <div class="stats-grid-small">
                <div class="stat-card-small">
                    <h5>Ventes Aujourd'hui</h5>
                    <p class="stat-value-large">${totalBets.toLocaleString()} Gdes</p>
                </div>
                <div class="stat-card-small">
                    <h5>Tickets Émis</h5>
                    <p class="stat-value-large">${totalTickets.toLocaleString()}</p>
                </div>
                <div class="stat-card-small">
                    <h5>Moyenne par Ticket</h5>
                    <p class="stat-value-large">${avgPerTicket.toLocaleString()} Gdes</p>
                </div>
                <div class="stat-card-small">
                    <h5>Commission (5%)</h5>
                    <p class="stat-value-large success-text">${commission} Gdes</p>
                </div>
            </div>
        `;
    }

    renderAgentWins(wins) {
        const container = document.getElementById('agent-wins-list');
        if (!wins || wins.length === 0) {
            container.innerHTML = '<p class="no-data">Aucun gain récent</p>';
            return;
        }
        
        container.innerHTML = wins.map(win => {
            const winAmount = win.win_amount || win.amount || 0;
            const isPaid = win.paid || win.status === 'paid';
            
            return `
                <div class="win-card">
                    <div class="win-header">
                        <span><strong>Ticket #${win.ticket_id || win.id}</strong></span>
                        <span class="win-amount">${winAmount.toLocaleString()} Gdes</span>
                    </div>
                    <div class="win-details">
                        <p>Tirage: ${win.draw_name || 'Non spécifié'}</p>
                        <p>Date: ${new Date(win.date || win.created_at).toLocaleString()}</p>
                        <p>Statut: ${isPaid ? 'Payé' : 'En attente'}</p>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderAgentReport(agent, tickets, wins, stats) {
        const totalSales = stats.totalBets || 0;
        const totalWins = stats.totalWins || 0;
        const successRate = tickets && tickets.length > 0 ? ((wins.length / tickets.length) * 100).toFixed(2) : 0;
        const avgTicketValue = tickets && tickets.length > 0 ? Math.round(totalSales / tickets.length) : 0;
        
        const container = document.getElementById('agent-detailed-report');
        container.innerHTML = `
            <div class="detailed-report">
                <h5>Rapport de Performance - ${agent.name}</h5>
                
                <div class="report-stats">
                    <div class="report-stat">
                        <p class="stat-label">Ventes Totales</p>
                        <p class="stat-value-large">${totalSales.toLocaleString()} Gdes</p>
                    </div>
                    <div class="report-stat">
                        <p class="stat-label">Gains Distribués</p>
                        <p class="stat-value-large success-text">${totalWins.toLocaleString()} Gdes</p>
                    </div>
                    <div class="report-stat">
                        <p class="stat-label">Taux de Réussite</p>
                        <p class="stat-value-large">${successRate}%</p>
                    </div>
                    <div class="report-stat">
                        <p class="stat-label">Commission</p>
                        <p class="stat-value-large warning-text">${(totalSales * 0.05).toFixed(2)} Gdes</p>
                    </div>
                </div>
                
                <div class="detailed-stats">
                    <h6>Statistiques Détailées</h6>
                    <ul class="stats-list">
                        <li>Nombre total de tickets: ${tickets ? tickets.length : 0}</li>
                        <li>Nombre de tickets gagnants: ${wins.length}</li>
                        <li>Valeur moyenne des tickets: ${avgTicketValue.toLocaleString()} Gdes</li>
                        <li>Statut: ${agent.active ? 'Actif' : 'Bloqué'}</li>
                        <li>Commission: ${agent.commission || 5}%</li>
                        <li>Localisation: ${agent.location || 'Non spécifié'}</li>
                    </ul>
                </div>
            </div>
        `;
    }

    async deleteTicket(ticketId) {
        if (!confirm('Supprimer ce ticket? Cette action est irréversible.')) return;
        
        try {
            const result = await SupervisorAPI.deleteTicket(ticketId);
            
            if (result.success) {
                this.showNotification('Ticket supprimé avec succès', 'success');
                
                if (SUPERVISOR_STATE.selectedAgent) {
                    await this.viewAgentDetails(SUPERVISOR_STATE.selectedAgent.id);
                }
            } else {
                this.showError('Échec de la suppression du ticket');
            }
        } catch (error) {
            console.error('Erreur suppression ticket:', error);
            this.showError('Erreur lors de la suppression');
        }
    }

    async deleteRecentTickets() {
        if (!SUPERVISOR_STATE.selectedAgent) return;
        
        if (!confirm('Supprimer tous les tickets de moins de 10 minutes?')) return;
        
        try {
            // Récupérer les tickets de l'agent
            const tickets = await SupervisorAPI.getAgentTickets(SUPERVISOR_STATE.selectedAgent.id);
            const now = new Date();
            
            // Filtrer les tickets de moins de 10 minutes
            const recentTickets = tickets.filter(ticket => {
                const ticketTime = new Date(ticket.timestamp || ticket.date || ticket.created_at);
                const diffMinutes = (now - ticketTime) / (1000 * 60);
                return diffMinutes <= SUPERVISOR_CONFIG.PERMISSIONS.MAX_DELETE_TIME;
            });
            
            // Supprimer chaque ticket récent
            let deletedCount = 0;
            for (const ticket of recentTickets) {
                try {
                    await SupervisorAPI.deleteTicket(ticket.id);
                    deletedCount++;
                } catch (error) {
                    console.error(`Erreur suppression ticket ${ticket.id}:`, error);
                }
            }
            
            this.showNotification(`${deletedCount} tickets récents supprimés`, 'success');
            
            if (SUPERVISOR_STATE.selectedAgent) {
                await this.viewAgentDetails(SUPERVISOR_STATE.selectedAgent.id);
            }
            
        } catch (error) {
            console.error('Erreur suppression tickets récents:', error);
            this.showError('Erreur lors de la suppression');
        }
    }

    async blockAgent(agentId, blockStatus) {
        const action = blockStatus ? 'débloquer' : 'bloquer';
        if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} cet agent?`)) return;
        
        try {
            const result = await SupervisorAPI.blockAgent(agentId, !blockStatus);
            
            if (result.success) {
                // Mettre à jour l'état local
                const agent = SUPERVISOR_STATE.agents.find(a => a.id == agentId);
                if (agent) {
                    agent.active = !blockStatus;
                }
                
                this.renderFullAgentList();
                this.renderAgentDashboard();
                this.updateDashboardStats();
                
                this.showNotification(`Agent ${action} avec succès`, 'success');
            } else {
                this.showError(`Échec du ${action} de l'agent`);
            }
        } catch (error) {
            console.error(`Erreur ${action} agent:`, error);
            this.showError(`Erreur lors du ${action} de l'agent`);
        }
    }

    async toggleAgentBlock() {
        if (!SUPERVISOR_STATE.selectedAgent) return;
        await this.blockAgent(SUPERVISOR_STATE.selectedAgent.id, SUPERVISOR_STATE.selectedAgent.active);
    }

    switchAgentTab(tabName) {
        // Désactiver tous les onglets
        document.querySelectorAll('#agent-details-modal .tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelectorAll('#agent-details-modal .tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Activer l'onglet sélectionné
        document.getElementById(`agent-${tabName}-tab`).classList.add('active');
        event.target.classList.add('active');
    }

    closeModal() {
        document.getElementById('agent-details-modal').style.display = 'none';
        SUPERVISOR_STATE.selectedAgent = null;
    }

    switchView(viewName) {
        // Mettre à jour la navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        event.target.closest('.nav-item').classList.add('active');
        
        // Cacher tous les vues
        document.querySelectorAll('.view-content').forEach(view => {
            view.style.display = 'none';
        });
        
        // Afficher la vue sélectionnée
        const viewElement = document.getElementById(`${viewName}-view`);
        if (viewElement) {
            viewElement.style.display = 'block';
            viewElement.classList.add('active');
        }
        
        SUPERVISOR_STATE.currentView = viewName;
        
        // Charger les données spécifiques à la vue
        switch(viewName) {
            case 'agents':
                this.renderFullAgentList();
                break;
            case 'reports':
                this.loadReports();
                break;
            case 'winners':
                this.loadWinners();
                break;
            case 'settings':
                this.loadSettings();
                break;
        }
    }

    async loadReports() {
        try {
            const period = document.getElementById('report-period').value;
            const reports = await SupervisorAPI.getSupervisorReports(period);
            
            this.renderReports(reports, period);
        } catch (error) {
            console.error('Erreur chargement rapports:', error);
            this.showError('Impossible de charger les rapports');
        }
    }

    renderReports(reportData, period) {
        const container = document.getElementById('reports-container');
        const totalSales = reportData.totalSales || 0;
        const totalTickets = reportData.totalTickets || 0;
        const totalWins = reportData.totalWins || 0;
        const activeAgents = reportData.activeAgents || SUPERVISOR_STATE.agents.filter(a => a.active).length;
        
        container.innerHTML = `
            <div class="reports-grid">
                <div class="report-card">
                    <h4>Résumé des Ventes</h4>
                    <div class="report-summary">
                        <div class="summary-value">${totalSales.toLocaleString()}</div>
                        <div class="summary-label">Gourdes</div>
                    </div>
                </div>
                
                <div class="report-card">
                    <h4>Statistiques Clés</h4>
                    <div class="key-stats">
                        <div class="key-stat">
                            <span>Ventes totales:</span>
                            <strong>${totalSales.toLocaleString()} Gdes</strong>
                        </div>
                        <div class="key-stat">
                            <span>Total tickets:</span>
                            <strong>${totalTickets.toLocaleString()}</strong>
                        </div>
                        <div class="key-stat">
                            <span>Gains distribués:</span>
                            <strong class="success-text">${totalWins.toLocaleString()} Gdes</strong>
                        </div>
                        <div class="key-stat">
                            <span>Agents actifs:</span>
                            <strong>${activeAgents}</strong>
                        </div>
                        <div class="key-stat">
                            <span>Période:</span>
                            <strong>${this.getPeriodLabel(period)}</strong>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async loadWinners() {
        try {
            const winners = await SupervisorAPI.getSupervisorWinners();
            this.renderWinners(winners);
        } catch (error) {
            console.error('Erreur chargement gagnants:', error);
            this.showError('Impossible de charger les gagnants');
        }
    }

    renderWinners(winners) {
        const container = document.getElementById('winners-container');
        
        if (!winners || winners.length === 0) {
            container.innerHTML = '<p class="no-data">Aucun gagnant récent</p>';
            return;
        }
        
        container.innerHTML = winners.map(winner => {
            const winAmount = winner.win_amount || winner.amount || 0;
            const agentName = winner.agent_name || 'Agent inconnu';
            const drawName = winner.draw_name || 'Tirage';
            const isPaid = winner.paid || winner.status === 'paid';
            
            return `
                <div class="winner-card">
                    <div class="winner-header">
                        <div class="winner-info">
                            <h4>${winner.player_name || 'Joueur'}</h4>
                            <p>Agent: ${agentName}</p>
                            <p>Tirage: ${drawName}</p>
                        </div>
                        <div class="winner-amount">
                            <span class="amount">${winAmount.toLocaleString()} Gdes</span>
                            <span class="status ${isPaid ? 'paid' : 'pending'}">
                                ${isPaid ? 'Payé' : 'En attente'}
                            </span>
                        </div>
                    </div>
                    <div class="winner-details">
                        <p><strong>Ticket #${winner.ticket_id || winner.id}</strong></p>
                        <p>Date: ${new Date(winner.date || winner.created_at).toLocaleString()}</p>
                    </div>
                </div>
            `;
        }).join('');
    }

    async loadSettings() {
        try {
            const settings = await SupervisorAPI.getSupervisorSettings();
            this.renderSettings(settings);
        } catch (error) {
            console.error('Erreur chargement paramètres:', error);
            this.showError('Impossible de charger les paramètres');
        }
    }

    renderSettings(settings) {
        const container = document.getElementById('settings-container');
        
        container.innerHTML = `
            <div class="settings-card">
                <h4>Informations du Superviseur</h4>
                <div class="settings-form">
                    <div class="form-group">
                        <label>Nom:</label>
                        <input type="text" class="form-control" value="${SUPERVISOR_CONFIG.SUPERVISOR_NAME}" readonly>
                    </div>
                    <div class="form-group">
                        <label>Email:</label>
                        <input type="email" class="form-control" value="${SUPERVISOR_CONFIG.SUPERVISOR_EMAIL || ''}">
                    </div>
                    <div class="form-group">
                        <label>Téléphone:</label>
                        <input type="tel" class="form-control" value="${SUPERVISOR_CONFIG.SUPERVISOR_PHONE || ''}">
                    </div>
                    <div class="form-group">
                        <label>Notifications par email:</label>
                        <select class="form-control">
                            <option value="all" ${settings.email_notifications === 'all' ? 'selected' : ''}>Toutes</option>
                            <option value="important" ${settings.email_notifications === 'important' ? 'selected' : ''}>Importantes seulement</option>
                            <option value="none" ${settings.email_notifications === 'none' ? 'selected' : ''}>Aucune</option>
                        </select>
                    </div>
                    <button class="btn btn-primary" onclick="supervisorManager.saveSettings()">
                        <i class="fas fa-save"></i> Enregistrer
                    </button>
                </div>
            </div>
        `;
    }

    async saveSettings() {
        try {
            const email = document.querySelector('#settings-container input[type="email"]').value;
            const phone = document.querySelector('#settings-container input[type="tel"]').value;
            const notifications = document.querySelector('#settings-container select').value;
            
            const settings = {
                email: email,
                phone: phone,
                email_notifications: notifications
            };
            
            const result = await SupervisorAPI.updateSupervisorSettings(settings);
            
            if (result.success) {
                SUPERVISOR_CONFIG.SUPERVISOR_EMAIL = email;
                SUPERVISOR_CONFIG.SUPERVISOR_PHONE = phone;
                this.showNotification('Paramètres enregistrés avec succès', 'success');
            } else {
                this.showError('Échec de l\'enregistrement des paramètres');
            }
        } catch (error) {
            console.error('Erreur enregistrement paramètres:', error);
            this.showError('Erreur lors de l\'enregistrement');
        }
    }

    getPeriodLabel(period) {
        const labels = {
            'today': 'Aujourd\'hui',
            'yesterday': 'Hier',
            'week': 'Cette semaine',
            'month': 'Ce mois',
            'custom': 'Personnalisé'
        };
        return labels[period] || period;
    }

    async refreshData() {
        await this.loadSupervisorAgents();
        await this.updateDashboardStats();
        this.showNotification('Données actualisées', 'success');
    }

    async refreshAgents() {
        await this.loadSupervisorAgents();
        this.showNotification('Liste des agents actualisée', 'success');
    }

    async refreshWinners() {
        await this.loadWinners();
        this.showNotification('Liste des gagnants actualisée', 'success');
    }

    exportAgentsData() {
        const exportData = SUPERVISOR_STATE.agents.map(agent => ({
            id: agent.id,
            name: agent.name,
            email: agent.email,
            phone: agent.phone,
            location: agent.location,
            commission: agent.commission,
            active: agent.active,
            online: agent.online,
            created_at: agent.created_at
        }));
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `agents_${new Date().toISOString().split('T')[0]}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        
        this.showNotification('Données exportées avec succès', 'success');
    }

    async logout() {
        if (confirm('Êtes-vous sûr de vouloir vous déconnecter?')) {
            try {
                await SupervisorAPI.logout();
                localStorage.removeItem('auth_token');
                localStorage.removeItem('user_role');
                localStorage.removeItem('user_name');
                localStorage.removeItem('supervisor_id');
                window.location.href = 'index.html';
            } catch (error) {
                console.error('Erreur déconnexion:', error);
                this.showError('Erreur lors de la déconnexion');
            }
        }
    }

    // Ces méthodes seront implémentées dans res-ui.js
    showNotification(message, type = 'info') {
        UI.showNotification(message, type);
    }

    showError(message) {
        UI.showNotification(message, 'error');
    }
}