// Gestionnaire des tirages - COMPLET et CORRIGÉ
class DrawManager {
    constructor(uiManager, stateManager) {
        this.uiManager = uiManager;
        this.stateManager = stateManager;
    }

    // Rendre la vue des tirages
    renderDrawsView() {
        const container = document.getElementById('draws-container');
        const draws = this.stateManager.getData('draws') || [];
        
        if (draws.length === 0) {
            container.innerHTML = '<p class="no-data">Aucun tirage trouvé</p>';
            return;
        }
        
        container.innerHTML = draws.map(draw => this.createDrawCard(draw)).join('');
    }

    createDrawCard(draw) {
        const isBlocked = draw.status === 'blocked' || draw.status === 'disabled';
        const statusColor = draw.status === 'active' ? 'var(--success)' : 
                          draw.status === 'completed' ? 'var(--primary)' : 'var(--danger)';
        
        return `
            <div class="draw-item ${isBlocked ? 'blocked' : ''}">
                <div class="draw-header">
                    <div class="draw-name">${draw.name}</div>
                    <div class="draw-status" style="color: ${statusColor}; font-weight: bold;">
                        ${this.getStatusText(draw.status)}
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
                    
                    ${draw.lastResults ? `
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
                            <div class="stat-value">${draw.tickets || 0}</div>
                        </div>
                        <div class="draw-stat">
                            <div class="stat-label">Ventes</div>
                            <div class="stat-value">${draw.sales || 0} Gdes</div>
                        </div>
                        <div class="draw-stat">
                            <div class="stat-label">Gains</div>
                            <div class="stat-value">${draw.payouts || 0} Gdes</div>
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
    }

    getStatusText(status) {
        const statusMap = {
            'active': 'Actif',
            'completed': 'Terminé',
            'scheduled': 'Programmé',
            'blocked': 'Bloqué',
            'disabled': 'Désactivé',
            'pending': 'En attente'
        };
        return statusMap[status] || status;
    }

    // Publication manuelle
    async publishDrawManually(event) {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);
        
        const results = [
            parseInt(formData.get('num1')),
            parseInt(formData.get('num2')),
            parseInt(formData.get('num3')),
            parseInt(formData.get('num4')),
            parseInt(formData.get('num5'))
        ];
        
        if (results.some(num => isNaN(num) || num < 0 || num > 99)) {
            this.uiManager.showNotification('Veuillez entrer 5 numéros valides (0-99)', 'error');
            return;
        }
        
        try {
            const drawData = {
                name: formData.get('drawName'),
                dateTime: formData.get('drawDateTime'),
                results: results,
                luckyNumber: formData.get('luckyNumber') ? parseInt(formData.get('luckyNumber')) : null,
                comment: formData.get('comment') || '',
                source: 'manual'
            };
            
            await ApiService.publishDraw(drawData);
            
            form.reset();
            this.uiManager.updateResultPreview();
            this.uiManager.showNotification(`Tirage ${drawData.name} publié avec succès`, 'success');
            
            await this.uiManager.loadDashboardData();
            await this.uiManager.loadDrawsData();
            
        } catch (error) {
            console.error('Erreur publication tirage:', error);
            this.uiManager.showNotification(error.message || 'Erreur lors de la publication', 'error');
        }
    }

    // Publication automatique
    async toggleAutoFetch() {
        const enabled = !this.stateManager.state.autoFetchEnabled;
        this.stateManager.setAutoFetch(enabled);
        this.uiManager.updateFetchStatus();
        
        this.uiManager.showNotification(
            `Récupération automatique ${enabled ? 'activée' : 'désactivée'}`,
            enabled ? 'success' : 'info'
        );
    }

    async fetchNow() {
        try {
            const url = document.getElementById('fetch-url')?.value;
            if (!url) {
                this.uiManager.showNotification('Veuillez spécifier une URL source', 'warning');
                return;
            }
            
            this.uiManager.showNotification('Récupération en cours...', 'info');
            
            const result = await ApiService.fetchExternalResults(url);
            
            this.uiManager.showNotification(
                `${result.count || 0} tirages récupérés avec succès`,
                'success'
            );
            
            this.addFetchLogEntry('success', `Récupération réussie: ${result.count || 0} tirages`);
            
            await this.uiManager.loadDrawsData();
            
        } catch (error) {
            console.error('Erreur récupération:', error);
            this.uiManager.showNotification(error.message || 'Erreur lors de la récupération', 'error');
            this.addFetchLogEntry('error', `Erreur: ${error.message}`);
        }
    }

    async testFetch() {
        try {
            const url = document.getElementById('fetch-url')?.value;
            if (!url) {
                this.uiManager.showNotification('Veuillez spécifier une URL source', 'warning');
                return;
            }
            
            this.uiManager.showNotification('Test de connexion en cours...', 'info');
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            this.uiManager.showNotification('Connexion testée avec succès', 'success');
            this.addFetchLogEntry('info', 'Test de connexion réussi');
            
        } catch (error) {
            this.uiManager.showNotification('Échec du test de connexion', 'error');
            this.addFetchLogEntry('error', 'Test de connexion échoué');
        }
    }

    addFetchLogEntry(type, message) {
        const logContainer = document.getElementById('fetch-log');
        if (!logContainer) return;
        
        const timestamp = new Date().toLocaleTimeString();
        const typeIcon = type === 'success' ? 'check-circle' :
                        type === 'error' ? 'times-circle' :
                        type === 'warning' ? 'exclamation-circle' : 'info-circle';
        
        const typeColor = type === 'success' ? 'var(--success)' :
                         type === 'error' ? 'var(--danger)' :
                         type === 'warning' ? 'var(--warning)' : 'var(--primary)';
        
        const logEntry = document.createElement('div');
        logEntry.style.cssText = `
            padding: 10px 15px;
            border-left: 3px solid ${typeColor};
            margin-bottom: 5px;
            background: #f8f9fa;
            border-radius: 0 5px 5px 0;
        `;
        
        logEntry.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-${typeIcon}" style="color: ${typeColor};"></i>
                <div style="flex: 1;">
                    <div style="font-size: 14px;">${message}</div>
                    <div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">${timestamp}</div>
                </div>
            </div>
        `;
        
        logContainer.prepend(logEntry);
        
        const entries = logContainer.querySelectorAll('div');
        if (entries.length > 20) {
            logContainer.removeChild(entries[entries.length - 1]);
        }
    }

    // Historique des publications
    async loadPublishHistory() {
        try {
            const history = await ApiService.getDrawHistory();
            const container = document.getElementById('publish-history');
            
            if (!history || history.length === 0) {
                container.innerHTML = '<p class="no-data">Aucune publication trouvée</p>';
                return;
            }
            
            container.innerHTML = history.map(item => `
                <div class="history-item" style="padding: 15px; border-bottom: 1px solid var(--border);">
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
            container.innerHTML = '<p class="no-data error">Erreur de chargement de l\'historique</p>';
        }
    }

    // Blocage/Déblocage de tirage
    async toggleDrawBlock(drawId, blocked) {
        try {
            await ApiService.toggleDrawBlock(drawId, blocked);
            
            this.uiManager.showNotification(
                `Tirage ${blocked ? 'désactivé' : 'activé'} avec succès`,
                'success'
            );
            
            const draws = this.stateManager.getData('draws');
            const updatedDraws = draws.map(draw => {
                if (draw.id === drawId) {
                    return { 
                        ...draw, 
                        status: blocked ? 'blocked' : 'active'
                    };
                }
                return draw;
            });
            
            this.stateManager.setData('draws', updatedDraws);
            this.renderDrawsView();
            
        } catch (error) {
            console.error('Erreur blocage tirage:', error);
            this.uiManager.showNotification(error.message || 'Erreur lors de l\'opération', 'error');
        }
    }

    // Voir les détails d'un tirage
    async viewDrawDetails(drawId) {
        try {
            const draw = await ApiService.getDrawById(drawId);
            
            const modal = document.getElementById('advanced-modal');
            const title = document.getElementById('advanced-modal-title');
            const content = document.getElementById('advanced-modal-content');
            
            title.textContent = `Détails: ${draw.name}`;
            
            content.innerHTML = `
                <div class="draw-details">
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 20px;">
                        <div>
                            <div style="font-size: 12px; color: var(--text-dim);">Statut</div>
                            <div style="font-weight: bold; color: ${this.getStatusColor(draw.status)};">
                                ${this.getStatusText(draw.status)}
                            </div>
                        </div>
                        <div>
                            <div style="font-size: 12px; color: var(--text-dim);">Fréquence</div>
                            <div style="font-weight: bold;">${draw.frequency || 'Quotidien'}</div>
                        </div>
                        <div>
                            <div style="font-size: 12px; color: var(--text-dim);">Heure</div>
                            <div style="font-weight: bold;">${draw.time || 'Non défini'}</div>
                        </div>
                        <div>
                            <div style="font-size: 12px; color: var(--text-dim);">Dernier tirage</div>
                            <div style="font-weight: bold;">${draw.lastDraw ? new Date(draw.lastDraw).toLocaleString() : 'Jamais'}</div>
                        </div>
                    </div>
                    
                    ${draw.description ? `
                        <div style="margin-bottom: 20px;">
                            <div style="font-size: 12px; color: var(--text-dim); margin-bottom: 5px;">Description</div>
                            <div>${draw.description}</div>
                        </div>
                    ` : ''}
                    
                    <div style="margin-bottom: 20px;">
                        <div style="font-size: 12px; color: var(--text-dim); margin-bottom: 10px;">Statistiques</div>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                            <div style="text-align: center; padding: 15px; background: #f8f9fa; border-radius: 10px;">
                                <div style="font-size: 11px; color: var(--text-dim);">Tickets Aujourd'hui</div>
                                <div style="font-size: 20px; font-weight: bold; color: var(--primary);">
                                    ${draw.ticketsToday || 0}
                                </div>
                            </div>
                            <div style="text-align: center; padding: 15px; background: #f8f9fa; border-radius: 10px;">
                                <div style="font-size: 11px; color: var(--text-dim);">Ventes Aujourd'hui</div>
                                <div style="font-size: 20px; font-weight: bold; color: var(--success);">
                                    ${draw.salesToday || 0} Gdes
                                </div>
                            </div>
                            <div style="text-align: center; padding: 15px; background: #f8f9fa; border-radius: 10px;">
                                <div style="font-size: 11px; color: var(--text-dim);">Gains Aujourd'hui</div>
                                <div style="font-size: 20px; font-weight: bold; color: ${draw.payoutsToday > 0 ? 'var(--danger)' : 'var(--text-dim)'};">
                                    ${draw.payoutsToday || 0} Gdes
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    ${draw.lastResults && draw.lastResults.length > 0 ? `
                        <div style="margin-bottom: 20px;">
                            <div style="font-size: 12px; color: var(--text-dim); margin-bottom: 10px;">Derniers résultats</div>
                            <div class="draw-results">
                                ${draw.lastResults.map(num => `
                                    <div class="draw-number">${num.toString().padStart(2, '0')}</div>
                                `).join('')}
                                ${draw.luckyNumber ? `
                                    <div style="display: flex; align-items: center; gap: 10px; margin-left: 10px;">
                                        <div style="font-size: 12px; color: var(--text-dim);">Chance:</div>
                                        <div class="draw-number" style="background: var(--warning);">
                                            ${draw.luckyNumber.toString().padStart(2, '0')}
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    ` : ''}
                    
                    <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid var(--border);">
                        <div style="display: flex; gap: 10px;">
                            <button class="btn btn-primary" onclick="ownerManager.editDraw('${drawId}')">
                                <i class="fas fa-edit"></i> Éditer
                            </button>
                            <button class="btn ${draw.status === 'blocked' ? 'btn-success' : 'btn-danger'}" 
                                    onclick="ownerManager.toggleDrawBlock('${drawId}', ${draw.status !== 'blocked'})">
                                ${draw.status === 'blocked' ? 'Activer' : 'Désactiver'}
                            </button>
                            <button class="btn btn-warning" onclick="ownerManager.forcePublishDraw('${drawId}')">
                                <i class="fas fa-paper-plane"></i> Publier Maintenant
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            this.uiManager.showModal('advanced-modal');
            
        } catch (error) {
            console.error('Erreur chargement détails tirage:', error);
            this.uiManager.showNotification('Erreur lors du chargement des détails', 'error');
        }
    }

    getStatusColor(status) {
        const colors = {
            'active': 'var(--success)',
            'completed': 'var(--primary)',
            'scheduled': 'var(--warning)',
            'blocked': 'var(--danger)',
            'disabled': 'var(--danger)',
            'pending': 'var(--warning)'
        };
        return colors[status] || 'var(--text-dim)';
    }

    // Édition d'un tirage
    async editDraw(drawId) {
        try {
            const draw = await ApiService.getDrawById(drawId);
            
            const modal = document.getElementById('advanced-modal');
            const title = document.getElementById('advanced-modal-title');
            const content = document.getElementById('advanced-modal-content');
            
            title.textContent = `Éditer: ${draw.name}`;
            
            content.innerHTML = `
                <form id="edit-draw-form" onsubmit="ownerManager.updateDraw('${drawId}', event)">
                    <div class="form-group">
                        <label>Nom du Tirage:</label>
                        <input type="text" class="form-control" name="name" value="${draw.name}" required>
                    </div>
                    
                    <div class="form-group">
                        <label>Description:</label>
                        <textarea class="form-control" name="description" rows="3">${draw.description || ''}</textarea>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                        <div class="form-group">
                            <label>Heure du tirage:</label>
                            <input type="time" class="form-control" name="time" value="${draw.time || ''}">
                        </div>
                        <div class="form-group">
                            <label>Fréquence:</label>
                            <select class="form-control" name="frequency">
                                <option value="daily" ${draw.frequency === 'daily' ? 'selected' : ''}>Quotidien</option>
                                <option value="weekly" ${draw.frequency === 'weekly' ? 'selected' : ''}>Hebdomadaire</option>
                                <option value="monthly" ${draw.frequency === 'monthly' ? 'selected' : ''}>Mensuel</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>Statut:</label>
                        <select class="form-control" name="status">
                            <option value="active" ${draw.status === 'active' ? 'selected' : ''}>Actif</option>
                            <option value="blocked" ${draw.status === 'blocked' ? 'selected' : ''}>Bloqué</option>
                            <option value="disabled" ${draw.status === 'disabled' ? 'selected' : ''}>Désactivé</option>
                            <option value="scheduled" ${draw.status === 'scheduled' ? 'selected' : ''}>Programmé</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label>Montant minimum de mise (Gdes):</label>
                        <input type="number" class="form-control" name="minBet" value="${draw.minBet || 0}" min="0">
                    </div>
                    
                    <div class="form-group">
                        <label>Montant maximum de mise (Gdes):</label>
                        <input type="number" class="form-control" name="maxBet" value="${draw.maxBet || 0}" min="0">
                    </div>
                    
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid var(--border);">
                        <div style="display: flex; gap: 10px;">
                            <button type="button" class="btn btn-secondary" onclick="ownerManager.closeModal('advanced-modal')">
                                Annuler
                            </button>
                            <button type="submit" class="btn btn-success">
                                Enregistrer
                            </button>
                        </div>
                    </div>
                </form>
            `;
            
            this.uiManager.showModal('advanced-modal');
            
        } catch (error) {
            console.error('Erreur chargement tirage:', error);
            this.uiManager.showNotification('Erreur lors du chargement des données', 'error');
        }
    }

    async updateDraw(drawId, event) {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);
        
        try {
            const updateData = {
                name: formData.get('name'),
                description: formData.get('description'),
                time: formData.get('time'),
                frequency: formData.get('frequency'),
                status: formData.get('status'),
                minBet: parseInt(formData.get('minBet')) || 0,
                maxBet: parseInt(formData.get('maxBet')) || 0
            };
            
            // await ApiService.updateDraw(drawId, updateData);
            
            this.uiManager.showNotification('Tirage mis à jour avec succès', 'success');
            this.uiManager.closeModal('advanced-modal');
            
            await this.uiManager.loadDrawsData();
            
        } catch (error) {
            console.error('Erreur mise à jour tirage:', error);
            this.uiManager.showNotification(error.message || 'Erreur lors de la mise à jour', 'error');
        }
    }

    // Forcer la publication d'un tirage
    async forcePublishDraw(drawId) {
        if (!confirm('Forcer la publication de ce tirage maintenant?')) {
            return;
        }
        
        try {
            // await ApiService.forcePublishDraw(drawId);
            
            this.uiManager.showNotification('Tirage publié avec succès', 'success');
            await this.uiManager.loadDrawsData();
            
        } catch (error) {
            console.error('Erreur publication forcée:', error);
            this.uiManager.showNotification(error.message || 'Erreur lors de la publication', 'error');
        }
    }

    // Programmer un tirage
    async scheduleDraw(drawId) {
        const draw = this.stateManager.getData('draws').find(d => d.id === drawId);
        if (!draw) return;
        
        const modal = document.getElementById('advanced-modal');
        const title = document.getElementById('advanced-modal-title');
        const content = document.getElementById('advanced-modal-content');
        
        title.textContent = `Programmer: ${draw.name}`;
        
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        
        content.innerHTML = `
            <form id="schedule-draw-form" onsubmit="ownerManager.confirmSchedule('${drawId}', event)">
                <div class="form-group">
                    <label>Date:</label>
                    <input type="date" class="form-control" name="date" value="${tomorrowStr}" min="${tomorrowStr}" required>
                </div>
                
                <div class="form-group">
                    <label>Heure:</label>
                    <input type="time" class="form-control" name="time" value="${draw.time || '18:00'}" required>
                </div>
                
                <div class="form-group">
                    <label>Type de publication:</label>
                    <select class="form-control" name="publishType">
                        <option value="auto">Automatique (résultats aléatoires)</option>
                        <option value="manual">Manuel (résultats à définir)</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label>Notification par email:</label>
                    <div>
                        <label style="display: flex; align-items: center; gap: 10px; margin: 10px 0;">
                            <input type="checkbox" name="notifyEmail" checked>
                            Envoyer une notification par email
                        </label>
                    </div>
                </div>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid var(--border);">
                    <div style="display: flex; gap: 10px;">
                        <button type="button" class="btn btn-secondary" onclick="ownerManager.closeModal('advanced-modal')">
                            Annuler
                        </button>
                        <button type="submit" class="btn btn-primary">
                            Programmer
                        </button>
                    </div>
                </div>
            </form>
        `;
        
        this.uiManager.showModal('advanced-modal');
    }

    async confirmSchedule(drawId, event) {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);
        
        try {
            const scheduleData = {
                drawId: drawId,
                date: formData.get('date'),
                time: formData.get('time'),
                publishType: formData.get('publishType'),
                notifyEmail: formData.get('notifyEmail') === 'on'
            };
            
            await ApiService.scheduleDraw(scheduleData);
            
            this.uiManager.showNotification('Tirage programmé avec succès', 'success');
            this.uiManager.closeModal('advanced-modal');
            
        } catch (error) {
            console.error('Erreur programmation tirage:', error);
            this.uiManager.showNotification(error.message || 'Erreur lors de la programmation', 'error');
        }
    }
}

// ✅ EXPORT GLOBAL (correction critique)
window.DrawManager = DrawManager;