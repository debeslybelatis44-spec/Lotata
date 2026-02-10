// Gestionnaire des utilisateurs
class UserManager {
    constructor(uiManager, stateManager) {
        this.uiManager = uiManager;
        this.stateManager = stateManager;
    }

    // Afficher le modal de création d'utilisateur
    showCreateUserModal(type) {
        const modal = document.getElementById('create-user-modal');
        const title = document.getElementById('modal-user-title');
        const form = document.getElementById('create-user-form');
        
        if (type === 'supervisor') {
            title.textContent = 'Créer un Nouveau Superviseur';
            form.innerHTML = `
                <div class="form-group">
                    <label>Nom Complet:</label>
                    <input type="text" class="form-control" name="name" required>
                </div>
                <div class="form-group">
                    <label>Email:</label>
                    <input type="email" class="form-control" name="email" required>
                </div>
                <div class="form-group">
                    <label>Téléphone:</label>
                    <input type="tel" class="form-control" name="phone" required>
                </div>
                <div class="form-group">
                    <label>Mot de passe:</label>
                    <div class="password-input-group">
                        <input type="password" class="form-control" name="password" id="password-input" required>
                        <button type="button" class="btn btn-secondary btn-small" 
                                onclick="this.querySelector('i').classList.toggle('fa-eye');
                                         this.querySelector('i').classList.toggle('fa-eye-slash');
                                         const input = document.getElementById('password-input');
                                         input.type = input.type === 'password' ? 'text' : 'password'">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
                <div class="form-group">
                    <label>Commission par défaut (%):</label>
                    <input type="number" class="form-control" name="defaultCommission" value="10" min="1" max="30">
                </div>
                <div class="form-group">
                    <label>Limite de vente quotidienne (Gdes):</label>
                    <input type="number" class="form-control" name="dailyLimit" value="10000" min="0">
                </div>
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button type="button" class="btn btn-secondary" onclick="ownerManager.closeModal()">Annuler</button>
                    <button type="submit" class="btn btn-success">Créer le Superviseur</button>
                </div>
                <input type="hidden" name="type" value="supervisor">
            `;
        } else {
            title.textContent = 'Créer un Nouvel Agent';
            const supervisors = this.stateManager.getData('users').supervisors || [];
            const supervisorsOptions = supervisors
                .map(s => `<option value="${s.id}">${s.name} (${s.id})</option>`)
                .join('');
            
            form.innerHTML = `
                <div class="form-group">
                    <label>Nom Complet:</label>
                    <input type="text" class="form-control" name="name" required>
                </div>
                <div class="form-group">
                    <label>Email:</label>
                    <input type="email" class="form-control" name="email" required>
                </div>
                <div class="form-group">
                    <label>Téléphone:</label>
                    <input type="tel" class="form-control" name="phone" required>
                </div>
                <div class="form-group">
                    <label>Superviseur Assigné:</label>
                    <select class="form-control" name="supervisorId" ${supervisors.length ? '' : 'disabled'}>
                        <option value="">Sélectionner un superviseur</option>
                        ${supervisorsOptions}
                    </select>
                    ${!supervisors.length ? '<p class="form-help">Aucun superviseur disponible</p>' : ''}
                </div>
                <div class="form-group">
                    <label>Localisation:</label>
                    <input type="text" class="form-control" name="location" placeholder="Ex: Port-au-Prince" required>
                </div>
                <div class="form-group">
                    <label>Commission (%):</label>
                    <input type="number" class="form-control" name="commission" value="5" min="1" max="20" required>
                </div>
                <div class="form-group">
                    <label>Limite de vente quotidienne (Gdes):</label>
                    <input type="number" class="form-control" name="dailyLimit" value="5000" min="0">
                </div>
                <div class="form-group">
                    <label>Mot de passe:</label>
                    <div class="password-input-group">
                        <input type="password" class="form-control" name="password" id="agent-password-input" required>
                        <button type="button" class="btn btn-secondary btn-small" 
                                onclick="this.querySelector('i').classList.toggle('fa-eye');
                                         this.querySelector('i').classList.toggle('fa-eye-slash');
                                         const input = document.getElementById('agent-password-input');
                                         input.type = input.type === 'password' ? 'text' : 'password'">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button type="button" class="btn btn-secondary" onclick="ownerManager.closeModal()">Annuler</button>
                    <button type="submit" class="btn btn-success">Créer l'Agent</button>
                </div>
                <input type="hidden" name="type" value="agent">
            `;
        }
        
        this.uiManager.showModal('create-user-modal');
    }

    // Créer un utilisateur
    async createUser(event) {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);
        const type = formData.get('type');
        
        try {
            const userData = {
                name: formData.get('name'),
                email: formData.get('email'),
                phone: formData.get('phone'),
                password: formData.get('password'),
                role: type,
                dailyLimit: parseInt(formData.get('dailyLimit')) || 0
            };
            
            if (type === 'supervisor') {
                userData.defaultCommission = parseInt(formData.get('defaultCommission')) || 10;
            } else {
                userData.supervisorId = formData.get('supervisorId');
                userData.location = formData.get('location');
                userData.commission = parseInt(formData.get('commission')) || 5;
            }
            
            const result = await ApiService.createUser(userData);
            
            this.uiManager.showNotification(
                `${type === 'agent' ? 'Agent' : 'Superviseur'} créé avec succès`,
                'success'
            );
            
            this.uiManager.closeModal();
            
            // Recharger les données
            await this.uiManager.loadUsersData();
            await this.uiManager.loadDashboardData();
            
        } catch (error) {
            console.error('Erreur création utilisateur:', error);
            this.uiManager.showNotification(
                error.message || 'Erreur lors de la création',
                'error'
            );
        }
    }

    // Blocage/Déblocage d'utilisateur
    async toggleUserBlock(userId, blocked) {
        try {
            await ApiService.toggleUserBlock(userId, blocked);
            
            this.uiManager.showNotification(
                `Utilisateur ${blocked ? 'bloqué' : 'débloqué'} avec succès`,
                'success'
            );
            
            // Mettre à jour l'état local
            const users = this.stateManager.getData('users');
            
            // Trouver et mettre à jour l'utilisateur
            const updateUserInList = (list) => {
                return list.map(user => {
                    if (user.id === userId) {
                        return { ...user, blocked };
                    }
                    return user;
                });
            };
            
            users.supervisors = updateUserInList(users.supervisors);
            users.agents = updateUserInList(users.agents);
            
            this.stateManager.setData('users', users);
            
            // Re-rendre la vue
            this.uiManager.renderUsersView();
            
        } catch (error) {
            console.error('Erreur blocage utilisateur:', error);
            this.uiManager.showNotification(
                error.message || 'Erreur lors de l\'opération',
                'error'
            );
        }
    }

    // Édition d'utilisateur
    async editUser(userId) {
        try {
            const user = await ApiService.getUserById(userId);
            
            // Ouvrir un modal d'édition
            const modal = document.getElementById('advanced-modal');
            const title = document.getElementById('advanced-modal-title');
            const content = document.getElementById('advanced-modal-content');
            
            title.textContent = `Éditer ${user.name}`;
            
            content.innerHTML = `
                <form id="edit-user-form" onsubmit="ownerManager.updateUser('${userId}', event)">
                    <div class="form-group">
                        <label>Nom Complet:</label>
                        <input type="text" class="form-control" name="name" value="${user.name}" required>
                    </div>
                    <div class="form-group">
                        <label>Email:</label>
                        <input type="email" class="form-control" name="email" value="${user.email}" required>
                    </div>
                    <div class="form-group">
                        <label>Téléphone:</label>
                        <input type="tel" class="form-control" name="phone" value="${user.phone}" required>
                    </div>
                    ${user.role === 'agent' ? `
                        <div class="form-group">
                            <label>Commission (%):</label>
                            <input type="number" class="form-control" name="commission" value="${user.commission || 5}" min="1" max="20" required>
                        </div>
                        <div class="form-group">
                            <label>Localisation:</label>
                            <input type="text" class="form-control" name="location" value="${user.location || ''}" required>
                        </div>
                    ` : ''}
                    <div class="form-group">
                        <label>Limite de vente quotidienne (Gdes):</label>
                        <input type="number" class="form-control" name="dailyLimit" value="${user.dailyLimit || 0}" min="0">
                    </div>
                    <div class="form-group">
                        <label>Nouveau mot de passe (laisser vide pour ne pas changer):</label>
                        <input type="password" class="form-control" name="newPassword">
                    </div>
                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button type="button" class="btn btn-secondary" onclick="ownerManager.closeModal('advanced-modal')">Annuler</button>
                        <button type="submit" class="btn btn-success">Enregistrer</button>
                    </div>
                </form>
            `;
            
            this.uiManager.showModal('advanced-modal');
            
        } catch (error) {
            console.error('Erreur récupération utilisateur:', error);
            this.uiManager.showNotification('Erreur lors du chargement des données', 'error');
        }
    }

    // Mettre à jour un utilisateur
    async updateUser(userId, event) {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);
        
        try {
            const updateData = {
                name: formData.get('name'),
                email: formData.get('email'),
                phone: formData.get('phone'),
                dailyLimit: parseInt(formData.get('dailyLimit')) || 0
            };
            
            const newPassword = formData.get('newPassword');
            if (newPassword) {
                updateData.password = newPassword;
            }
            
            // Ajouter les champs spécifiques aux agents
            const commission = formData.get('commission');
            const location = formData.get('location');
            
            if (commission !== null) {
                updateData.commission = parseInt(commission);
            }
            
            if (location !== null) {
                updateData.location = location;
            }
            
            await ApiService.updateUser(userId, updateData);
            
            this.uiManager.showNotification('Utilisateur mis à jour avec succès', 'success');
            this.uiManager.closeModal('advanced-modal');
            
            // Recharger les données
            await this.uiManager.loadUsersData();
            
        } catch (error) {
            console.error('Erreur mise à jour utilisateur:', error);
            this.uiManager.showNotification(error.message || 'Erreur lors de la mise à jour', 'error');
        }
    }

    // Transférer un agent
    async transferAgent(agentId) {
        const supervisors = this.stateManager.getData('users').supervisors || [];
        
        if (supervisors.length < 2) {
            this.uiManager.showNotification('Pas assez de superviseurs pour transférer', 'warning');
            return;
        }
        
        const modal = document.getElementById('advanced-modal');
        const title = document.getElementById('advanced-modal-title');
        const content = document.getElementById('advanced-modal-content');
        
        title.textContent = 'Transférer l\'agent';
        
        const supervisorsOptions = supervisors
            .map(s => `<option value="${s.id}">${s.name}</option>`)
            .join('');
        
        content.innerHTML = `
            <form id="transfer-agent-form" onsubmit="ownerManager.confirmTransfer('${agentId}', event)">
                <div class="form-group">
                    <label>Sélectionner le nouveau superviseur:</label>
                    <select class="form-control" name="newSupervisorId" required>
                        <option value="">Choisir un superviseur</option>
                        ${supervisorsOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label>Conserver les paramètres actuels:</label>
                    <div>
                        <label style="display: flex; align-items: center; gap: 10px; margin: 10px 0;">
                            <input type="checkbox" name="keepCommission" checked>
                            Conserver la commission
                        </label>
                        <label style="display: flex; align-items: center; gap: 10px; margin: 10px 0;">
                            <input type="checkbox" name="keepLimits" checked>
                            Conserver les limites
                        </label>
                    </div>
                </div>
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button type="button" class="btn btn-secondary" onclick="ownerManager.closeModal('advanced-modal')">Annuler</button>
                    <button type="submit" class="btn btn-primary">Transférer</button>
                </div>
            </form>
        `;
        
        this.uiManager.showModal('advanced-modal');
    }

    async confirmTransfer(agentId, event) {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);
        
        try {
            const transferData = {
                newSupervisorId: formData.get('newSupervisorId'),
                keepCommission: formData.get('keepCommission') === 'on',
                keepLimits: formData.get('keepLimits') === 'on'
            };
            
            // Ici, vous implémenteriez l'appel API pour transférer l'agent
            // await ApiService.transferAgent(agentId, transferData);
            
            this.uiManager.showNotification('Agent transféré avec succès', 'success');
            this.uiManager.closeModal('advanced-modal');
            
            // Recharger les données
            await this.uiManager.loadUsersData();
            
        } catch (error) {
            console.error('Erreur transfert agent:', error);
            this.uiManager.showNotification(error.message || 'Erreur lors du transfert', 'error');
        }
    }

    // Voir les agents d'un superviseur
    async viewSupervisorAgents(supervisorId) {
        try {
            // Récupérer les agents du superviseur
            const users = this.stateManager.getData('users');
            const supervisorAgents = users.agents.filter(agent => agent.supervisorId === supervisorId);
            const supervisor = users.supervisors.find(s => s.id === supervisorId);
            
            const modal = document.getElementById('advanced-modal');
            const title = document.getElementById('advanced-modal-title');
            const content = document.getElementById('advanced-modal-content');
            
            title.textContent = `Agents de ${supervisor?.name || 'Superviseur'}`;
            
            if (supervisorAgents.length === 0) {
                content.innerHTML = '<p class="no-data">Aucun agent assigné à ce superviseur</p>';
            } else {
                content.innerHTML = `
                    <div class="agents-list">
                        ${supervisorAgents.map(agent => `
                            <div class="agent-item" style="padding: 15px; border-bottom: 1px solid var(--border);">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <strong>${agent.name}</strong>
                                        <div style="font-size: 12px; color: var(--text-dim); margin-top: 5px;">
                                            ${agent.email} • ${agent.phone}
                                        </div>
                                    </div>
                                    <div>
                                        <span class="badge" style="background: var(--primary); color: white; padding: 5px 10px; border-radius: 12px;">
                                            ${agent.commission || 5}% commission
                                        </span>
                                    </div>
                                </div>
                                <div style="display: flex; gap: 10px; margin-top: 10px;">
                                    <button class="btn btn-small btn-warning" onclick="ownerManager.editUser('${agent.id}')">
                                        Éditer
                                    </button>
                                    <button class="btn btn-small ${agent.blocked ? 'btn-success' : 'btn-danger'}" 
                                            onclick="ownerManager.toggleUserBlock('${agent.id}', ${!agent.blocked})">
                                        ${agent.blocked ? 'Débloquer' : 'Bloquer'}
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid var(--border);">
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                            <div style="text-align: center;">
                                <div style="font-size: 12px; color: var(--text-dim);">Total Agents</div>
                                <div style="font-size: 24px; font-weight: bold; color: var(--primary);">
                                    ${supervisorAgents.length}
                                </div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-size: 12px; color: var(--text-dim);">Ventes Total</div>
                                <div style="font-size: 24px; font-weight: bold; color: var(--success);">
                                    ${supervisorAgents.reduce((sum, agent) => sum + (agent.sales || 0), 0).toLocaleString()} Gdes
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
            
            this.uiManager.showModal('advanced-modal');
            
        } catch (error) {
            console.error('Erreur chargement agents superviseur:', error);
            this.uiManager.showNotification('Erreur lors du chargement des agents', 'error');
        }
    }

    // Exporter les données utilisateurs
    async exportUsersData() {
        try {
            await ApiService.exportUsers('csv');
            
            this.uiManager.showNotification('Données exportées avec succès', 'success');
        } catch (error) {
            console.error('Erreur export données:', error);
            this.uiManager.showNotification(error.message || 'Erreur lors de l\'export', 'error');
        }
    }

    // Activité utilisateur
    async getUserActivity(userId) {
        try {
            const activity = await ApiService.getUserActivity(userId);
            
            const modal = document.getElementById('advanced-modal');
            const title = document.getElementById('advanced-modal-title');
            const content = document.getElementById('advanced-modal-content');
            
            // Trouver l'utilisateur
            const users = this.stateManager.getData('users');
            let userName = 'Utilisateur';
            
            const allUsers = [...users.supervisors, ...users.agents];
            const user = allUsers.find(u => u.id === userId);
            if (user) {
                userName = user.name;
            }
            
            title.textContent = `Activité de ${userName}`;
            
            if (activity.length === 0) {
                content.innerHTML = '<p class="no-data">Aucune activité enregistrée</p>';
            } else {
                content.innerHTML = `
                    <div class="activity-log" style="max-height: 400px; overflow-y: auto;">
                        ${activity.map(item => `
                            <div class="log-entry">
                                <div class="log-time">${new Date(item.timestamp).toLocaleString()}</div>
                                <div class="log-message">${item.message}</div>
                                <div class="log-type" style="font-size: 12px; color: var(--text-dim); margin-top: 5px;">
                                    Type: ${item.type || 'N/A'}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
            
            this.uiManager.showModal('advanced-modal');
            
        } catch (error) {
            console.error('Erreur chargement activité utilisateur:', error);
            this.uiManager.showNotification('Erreur lors du chargement de l\'activité', 'error');
        }
    }

    // Gestion des limites utilisateur
    async updateUserLimits(userId) {
        const users = this.stateManager.getData('users');
        const allUsers = [...users.supervisors, ...users.agents];
        const user = allUsers.find(u => u.id === userId);
        
        if (!user) return;
        
        const modal = document.getElementById('advanced-modal');
        const title = document.getElementById('advanced-modal-title');
        const content = document.getElementById('advanced-modal-content');
        
        title.textContent = `Limites de ${user.name}`;
        
        content.innerHTML = `
            <form id="user-limits-form" onsubmit="ownerManager.saveUserLimits('${userId}', event)">
                <div class="form-group">
                    <label>Limite de vente quotidienne (Gdes):</label>
                    <input type="number" class="form-control" name="dailyLimit" 
                           value="${user.dailyLimit || 0}" min="0" step="100">
                </div>
                <div class="form-group">
                    <label>Limite de vente hebdomadaire (Gdes):</label>
                    <input type="number" class="form-control" name="weeklyLimit" 
                           value="${user.weeklyLimit || 0}" min="0" step="500">
                </div>
                <div class="form-group">
                    <label>Limite de vente mensuelle (Gdes):</label>
                    <input type="number" class="form-control" name="monthlyLimit" 
                           value="${user.monthlyLimit || 0}" min="0" step="1000">
                </div>
                <div class="form-group">
                    <label>Limite par ticket (Gdes):</label>
                    <input type="number" class="form-control" name="perTicketLimit" 
                           value="${user.perTicketLimit || 0}" min="0" step="10">
                </div>
                <div class="form-group">
                    <label>Limite de commission maximale (%):</label>
                    <input type="number" class="form-control" name="maxCommission" 
                           value="${user.maxCommission || 20}" min="1" max="50" step="0.5">
                </div>
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button type="button" class="btn btn-secondary" onclick="ownerManager.closeModal('advanced-modal')">Annuler</button>
                    <button type="submit" class="btn btn-success">Enregistrer</button>
                </div>
            </form>
        `;
        
        this.uiManager.showModal('advanced-modal');
    }

    async saveUserLimits(userId, event) {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);
        
        try {
            const limits = {
                dailyLimit: parseInt(formData.get('dailyLimit')) || 0,
                weeklyLimit: parseInt(formData.get('weeklyLimit')) || 0,
                monthlyLimit: parseInt(formData.get('monthlyLimit')) || 0,
                perTicketLimit: parseInt(formData.get('perTicketLimit')) || 0,
                maxCommission: parseFloat(formData.get('maxCommission')) || 20
            };
            
            await ApiService.updateUserLimits(userId, limits);
            
            this.uiManager.showNotification('Limites mises à jour avec succès', 'success');
            this.uiManager.closeModal('advanced-modal');
            
            // Recharger les données
            await this.uiManager.loadUsersData();
            
        } catch (error) {
            console.error('Erreur mise à jour limites:', error);
            this.uiManager.showNotification(error.message || 'Erreur lors de la mise à jour', 'error');
        }
    }
}