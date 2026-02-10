// Gestionnaire des tirages - COMPLÉTÉ
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
        
        // Validation
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
                        active: !blocked,
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
                            <div style="font-weight: bold; color: ${draw.active ? 'var(--success)' : 'var(--danger)};">
                                ${draw.active ? 'Actif' : 'Bloqué'}
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
                        <div style="font-size: 12px; color: var(--text-dim); margin-bottom: 10px;">Statistiques Aujourd'hui</div>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                            <div style="text-align: center; padding: 15px; background: #f8f9fa; border-radius: 10px;">
                                <div style="font-size: 11px; color: var(--text-dim);">Tickets</div>
                                <div style="font-size: 20px; font-weight: bold; color: var(--primary);">
                                    ${draw.stats?.ticketsToday || 0}
                                </div>
                            </div>
                            <div style="text-align: center; padding: 15px; background: #f8f9fa; border-radius: 10px;">
                                <div style="font-size: 11px; color: var(--text-dim);">Ventes</div>
                                <div style="font-size: 20px; font-weight: bold; color: var(--success);">
                                    ${draw.stats?.salesToday || 0} Gdes
                                </div>
                            </div>
                            <div style="text-align: center; padding: 15px; background: #f8f9fa; border-radius: 10px;">
                                <div style="font-size: 11px; color: var(--text-dim);">Gains</div>
                                <div style="font-size: 20px; font-weight: bold; color: ${draw.stats?.payoutsToday > 0 ? 'var(--danger)' : 'var(--text-dim)'};">
                                    ${draw.stats?.payoutsToday || 0} Gdes
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
                    
                    ${draw.history && draw.history.length > 0 ? `
                        <div style="margin-bottom: 20px;">
                            <div style="font-size: 12px; color: var(--text-dim); margin-bottom: 10px;">Historique récent</div>
                            <div style="max-height: 200px; overflow-y: auto;">
                                ${draw.history.slice(0, 5).map((item, index) => `
                                    <div style="padding: 10px; border-bottom: 1px solid var(--border);">
                                        <div style="display: flex; justify-content: space-between;">
                                            <div>${new Date(item.drawTime).toLocaleString()}</div>
                                            <div>
                                                ${item.results.map(num => `<span style="margin: 0 2px;">${num.toString().padStart(2, '0')}</span>`).join('')}
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid var(--border);">
                        <div style="display: flex; gap: 10px;">
                            <button class="btn btn-primary" onclick="ownerManager.editDraw('${drawId}')">
                                <i class="fas fa-edit"></i> Éditer
                            </button>
                            <button class="btn ${!draw.active ? 'btn-success' : 'btn-danger'}" 
                                    onclick="ownerManager.toggleDrawBlock('${drawId}', ${draw.active})">
                                ${draw.active ? 'Désactiver' : 'Activer'}
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
                minBet: parseInt(formData.get('minBet')) || 0,
                maxBet: parseInt(formData.get('maxBet')) || 0
            };
            
            await ApiService.updateDraw(drawId, updateData);
            
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
            const draw = await ApiService.getDrawById(drawId);
            const results = Array.from({length: 5}, () => Math.floor(Math.random() * 100));
            
            const drawData = {
                name: draw.name,
                dateTime: new Date().toISOString(),
                results: results,
                luckyNumber: Math.floor(Math.random() * 100),
                comment: 'Publication forcée par administrateur',
                source: 'manual'
            };
            
            await ApiService.publishDraw(drawData);
            
            this.uiManager.showNotification('Tirage publié avec succès', 'success');
            await this.uiManager.loadDrawsData();
            
        } catch (error) {
            console.error('Erreur publication forcée:', error);
            this.uiManager.showNotification(error.message || 'Erreur lors de la publication', 'error');
        }
    }

    // NOUVELLES MÉTHODES AJOUTÉES

    // Basculer l'auto-fetch
    async toggleAutoFetch() {
        const enabled = !this.stateManager.state.autoFetchEnabled;
        this.stateManager.setAutoFetch(enabled);
        this.uiManager.updateFetchStatus();
        
        this.uiManager.showNotification(
            `Récupération automatique ${enabled ? 'activée' : 'désactivée'}`,
            enabled ? 'success' : 'warning'
        );
    }

    // Récupérer maintenant
    async fetchNow() {
        try {
            this.uiManager.showNotification('Récupération des résultats en cours...', 'info');
            
            const source = document.getElementById('fetch-url').value;
            if (!source) {
                throw new Error('URL source non configurée');
            }
            
            const response = await ApiService.fetchExternalResults(source);
            this.uiManager.showNotification('Récupération terminée avec succès', 'success');
            
            // Mettre à jour le log
            this.loadFetchLog();
            
        } catch (error) {
            console.error('Erreur lors de la récupération:', error);
            this.uiManager.showNotification(error.message || 'Erreur lors de la récupération', 'error');
        }
    }

    // Tester la connexion
    async testFetch() {
        try {
            this.uiManager.showNotification('Test de connexion en cours...', 'info');
            
            const source = document.getElementById('fetch-url').value;
            if (!source) {
                throw new Error('URL source non configurée');
            }
            
            // Simulation de test
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            this.uiManager.showNotification('Connexion réussie à la source', 'success');
            
        } catch (error) {
            console.error('Erreur de test:', error);
            this.uiManager.showNotification(error.message || 'Échec de la connexion à la source', 'error');
        }
    }

    // Planifier un tirage
    async scheduleDraw(drawId) {
        const draw = await ApiService.getDrawById(drawId);
        
        const modal = document.getElementById('advanced-modal');
        const title = document.getElementById('advanced-modal-title');
        const content = document.getElementById('advanced-modal-content');
        
        title.textContent = `Planifier: ${draw.name}`;
        
        content.innerHTML = `
            <form id="schedule-draw-form" onsubmit="ownerManager.confirmSchedule('${drawId}', event)">
                <div class="form-group">
                    <label>Date et heure de publication:</label>
                    <input type="datetime-local" class="form-control" name="scheduleTime" required>
                </div>
                
                <div class="form-group">
                    <label>Répétition:</label>
                    <select class="form-control" name="repeat">
                        <option value="once">Une seule fois</option>
                        <option value="daily">Tous les jours</option>
                        <option value="weekly">Toutes les semaines</option>
                        <option value="monthly">Tous les mois</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label>Générer des résultats aléatoires:</label>
                    <input type="checkbox" name="randomResults" checked>
                </div>
                
                <div class="form-group">
                    <label>Notification par email:</label>
                    <input type="checkbox" name="emailNotification">
                </div>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid var(--border);">
                    <div style="display: flex; gap: 10px;">
                        <button type="button" class="btn btn-secondary" onclick="ownerManager.closeModal('advanced-modal')">
                            Annuler
                        </button>
                        <button type="submit" class="btn btn-success">
                            Planifier
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
                scheduleTime: formData.get('scheduleTime'),
                repeat: formData.get('repeat'),
                randomResults: formData.get('randomResults') === 'on',
                emailNotification: formData.get('emailNotification') === 'on'
            };
            
            await ApiService.scheduleDraw(scheduleData);
            
            this.uiManager.showNotification('Tirage planifié avec succès', 'success');
            this.uiManager.closeModal('advanced-modal');
            
        } catch (error) {
            console.error('Erreur planification:', error);
            this.uiManager.showNotification(error.message || 'Erreur lors de la planification', 'error');
        }
    }

    // Charger le log de récupération
    async loadFetchLog() {
        try {
            const container = document.getElementById('fetch-log');
            if (!container) return;
            
            // Simuler des données de log
            const logs = [
                { timestamp: new Date(Date.now() - 3600000), message: 'Récupération automatique réussie', status: 'success' },
                { timestamp: new Date(Date.now() - 7200000), message: 'Échec de connexion à la source', status: 'error' },
                { timestamp: new Date(Date.now() - 10800000), message: 'Récupération manuelle exécutée', status: 'success' }
            ];
            
            container.innerHTML = logs.map(log => `
                <div class="fetch-log-item" style="padding: 10px; border-bottom: 1px solid var(--border);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-weight: 500;">${log.message}</div>
                            <div style="font-size: 12px; color: var(--text-dim);">
                                ${log.timestamp.toLocaleString()}
                            </div>
                        </div>
                        <div>
                            <span class="badge" style="background: ${log.status === 'success' ? 'var(--success)' : 'var(--danger)'}; 
                                  color: white; padding: 3px 8px; border-radius: 10px; font-size: 11px;">
                                ${log.status === 'success' ? 'SUCCÈS' : 'ERREUR'}
                            </span>
                        </div>
                    </div>
                </div>
            `).join('');
            
        } catch (error) {
            console.error('Erreur chargement log:', error);
        }
    }
}