// Gestionnaire des numéros
class NumberManager {
    constructor(uiManager, stateManager) {
        this.uiManager = uiManager;
        this.stateManager = stateManager;
    }

    // Charger l'onglet des blocages
    loadBlocksTab() {
        this.renderBlocksGrid();
        this.renderBlockedNumbersList();
    }

    // Rendre la grille des blocages
    renderBlocksGrid() {
        const container = document.getElementById('blocks-numbers-grid');
        if (!container) return;
        
        const numbersData = this.stateManager.getData('numbers');
        const blockedNumbers = numbersData?.blocked || [];
        
        let numbersHTML = '';
        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            const isBlocked = blockedNumbers.includes(num);
            
            let className = 'number-item normal';
            let title = `Boule ${num}`;
            
            if (isBlocked) {
                className = 'number-item blocked';
                title += ' (BLOQUÉ)';
            }
            
            numbersHTML += `
                <div class="${className}" title="${title}" onclick="ownerManager.toggleNumberBlock('${num}')">
                    ${num}
                </div>
            `;
        }
        
        container.innerHTML = numbersHTML;
    }

    // Rendre la liste des numéros bloqués
    renderBlockedNumbersList() {
        const container = document.getElementById('blocked-numbers-list');
        if (!container) return;
        
        const numbersData = this.stateManager.getData('numbers');
        const blockedNumbers = numbersData?.blocked || [];
        
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

    // Bloquer un numéro
    async blockNumber() {
        const input = document.getElementById('block-number-input');
        const number = input.value.trim().padStart(2, '0');
        
        if (!/^\d{2}$/.test(number)) {
            this.uiManager.showNotification('Veuillez entrer un nombre valide (2 chiffres)', 'error');
            return;
        }
        
        const num = parseInt(number);
        if (num < 0 || num > 99) {
            this.uiManager.showNotification('Le numéro doit être entre 00 et 99', 'error');
            return;
        }
        
        try {
            await ApiService.blockNumber(number);
            
            const numbersData = this.stateManager.getData('numbers') || { blocked: [], limits: {} };
            if (!numbersData.blocked) numbersData.blocked = [];
            
            if (!numbersData.blocked.includes(number)) {
                numbersData.blocked.push(number);
                this.stateManager.setData('numbers', numbersData);
            }
            
            this.renderBlocksGrid();
            this.renderBlockedNumbersList();
            this.uiManager.showNotification(`Boule ${number} bloqué avec succès`, 'success');
            input.value = '';
            
        } catch (error) {
            console.error('Erreur blocage boule:', error);
            this.uiManager.showNotification(error.message || 'Erreur lors du blocage', 'error');
        }
    }

    // Basculer le blocage d'un numéro
    async toggleNumberBlock(number) {
        const numbersData = this.stateManager.getData('numbers') || { blocked: [], limits: {} };
        const blockedNumbers = numbersData.blocked || [];
        const isBlocked = blockedNumbers.includes(number);
        
        try {
            if (isBlocked) {
                await ApiService.unblockNumber(number);
                numbersData.blocked = blockedNumbers.filter(n => n !== number);
                this.uiManager.showNotification(`Boule ${number} débloqué`, 'success');
            } else {
                await ApiService.blockNumber(number);
                if (!numbersData.blocked) numbersData.blocked = [];
                numbersData.blocked.push(number);
                this.uiManager.showNotification(`Boule ${number} bloqué`, 'success');
            }
            
            this.stateManager.setData('numbers', numbersData);
            this.renderBlocksGrid();
            this.renderBlockedNumbersList();
            
        } catch (error) {
            console.error('Erreur opération boule:', error);
            this.uiManager.showNotification(error.message || 'Erreur lors de l\'opération', 'error');
        }
    }

    // Débloquer les numéros sélectionnés
    async unblockSelected() {
        const checkboxes = document.querySelectorAll('#blocked-numbers-list input[type="checkbox"]:checked');
        const numbersToUnblock = Array.from(checkboxes).map(cb => cb.value);
        
        if (numbersToUnblock.length === 0) {
            this.uiManager.showNotification('Veuillez sélectionner au moins un boule à débloquer', 'warning');
            return;
        }
        
        try {
            await ApiService.unblockNumbers(numbersToUnblock);
            
            const numbersData = this.stateManager.getData('numbers') || { blocked: [], limits: {} };
            numbersData.blocked = numbersData.blocked.filter(
                n => !numbersToUnblock.includes(n)
            );
            
            this.stateManager.setData('numbers', numbersData);
            this.renderBlocksGrid();
            this.renderBlockedNumbersList();
            
            this.uiManager.showNotification(`${numbersToUnblock.length} boule(s) débloqué(s)`, 'success');
            
        } catch (error) {
            console.error('Erreur déblocage multiple:', error);
            this.uiManager.showNotification(error.message || 'Erreur lors du déblocage', 'error');
        }
    }

    // Configurer le blocage automatique
    async configureAutoBlock() {
        const threshold = parseInt(document.getElementById('auto-block-threshold').value);
        const action = document.getElementById('auto-block-action').value;
        
        if (isNaN(threshold) || threshold <= 0) {
            this.uiManager.showNotification('Veuillez entrer un seuil valide', 'error');
            return;
        }
        
        try {
            // Enregistrer dans les paramètres système
            const settings = this.stateManager.getData('settings') || {};
            settings.autoBlockThreshold = threshold;
            settings.autoBlockAction = action;
            
            await ApiService.updateSettings({ settings: settings });
            
            this.uiManager.showNotification(
                `Blocage automatique configuré: seuil à ${threshold} Gdes, action: ${action}`,
                'success'
            );
            
        } catch (error) {
            console.error('Erreur configuration auto-blocage:', error);
            this.uiManager.showNotification(error.message || 'Erreur lors de la configuration', 'error');
        }
    }

    // Charger l'onglet des limites
    async loadLimitsTab() {
        await this.loadNumberLimits();
    }

    // Charger les limites des numéros
    async loadNumberLimits() {
        try {
            const limitsData = await ApiService.getNumberLimits();
            const numbersData = this.stateManager.getData('numbers') || { blocked: [], limits: {} };
            numbersData.limits = limitsData;
            
            this.stateManager.setData('numbers', numbersData);
            this.renderLimitsList();
            
        } catch (error) {
            console.error('Erreur chargement limites:', error);
            this.uiManager.showNotification('Erreur de chargement des limites', 'error');
        }
    }

    // Rendre la liste des limites
    renderLimitsList() {
        const container = document.getElementById('limits-list');
        if (!container) return;
        
        const numbersData = this.stateManager.getData('numbers') || { blocked: [], limits: {} };
        const limits = numbersData.limits || {};
        const limitedNumbers = Object.keys(limits);
        
        if (limitedNumbers.length === 0) {
            container.innerHTML = '<p class="no-data">Aucune limite définie</p>';
            return;
        }
        
        container.innerHTML = limitedNumbers.map(number => `
            <div class="limit-item" style="display: flex; justify-content: space-between; align-items: center; 
                 padding: 10px; background: #f8f9fa; border-radius: 8px; margin-bottom: 8px;">
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

    // Ajouter une limite
    async addNumberLimit() {
        const numberInput = document.getElementById('limit-number');
        const amountInput = document.getElementById('limit-amount');
        
        const number = numberInput.value.trim().padStart(2, '0');
        const amount = parseInt(amountInput.value);
        
        if (!/^\d{2}$/.test(number)) {
            this.uiManager.showNotification('Veuillez entrer un numéro valide (2 chiffres)', 'error');
            return;
        }
        
        if (isNaN(amount) || amount <= 0) {
            this.uiManager.showNotification('Veuillez entrer un montant valide', 'error');
            return;
        }
        
        const num = parseInt(number);
        if (num < 0 || num > 99) {
            this.uiManager.showNotification('Le numéro doit être entre 00 et 99', 'error');
            return;
        }
        
        try {
            await ApiService.setNumberLimit(number, amount);
            
            const numbersData = this.stateManager.getData('numbers') || { blocked: [], limits: {} };
            if (!numbersData.limits) numbersData.limits = {};
            numbersData.limits[number] = amount;
            
            this.stateManager.setData('numbers', numbersData);
            this.renderLimitsList();
            
            this.uiManager.showNotification(`Limite définie pour le boule ${number}: ${amount.toLocaleString()} Gdes`, 'success');
            
            numberInput.value = '';
            amountInput.value = '';
            
        } catch (error) {
            console.error('Erreur ajout limite:', error);
            this.uiManager.showNotification(error.message || 'Erreur lors de l\'ajout de la limite', 'error');
        }
    }

    // Éditer une limite
    async editNumberLimit(number) {
        const numbersData = this.stateManager.getData('numbers') || { blocked: [], limits: {} };
        const limits = numbersData.limits || {};
        const currentLimit = limits[number] || 0;
        
        const modal = document.getElementById('advanced-modal');
        const title = document.getElementById('advanced-modal-title');
        const content = document.getElementById('advanced-modal-content');
        
        title.textContent = `Éditer limite: Boule ${number}`;
        
        content.innerHTML = `
            <form id="edit-limit-form" onsubmit="ownerManager.updateNumberLimit('${number}', event)">
                <div class="form-group">
                    <label>Nouvelle limite (Gdes):</label>
                    <input type="number" class="form-control" name="limit" 
                           value="${currentLimit}" min="0" step="100" required>
                </div>
                
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button type="button" class="btn btn-secondary" onclick="ownerManager.closeModal('advanced-modal')">
                        Annuler
                    </button>
                    <button type="submit" class="btn btn-success">
                        Mettre à jour
                    </button>
                </div>
            </form>
        `;
        
        this.uiManager.showModal('advanced-modal');
    }

    async updateNumberLimit(number, event) {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);
        
        const newLimit = parseInt(formData.get('limit'));
        
        if (isNaN(newLimit) || newLimit < 0) {
            this.uiManager.showNotification('Veuillez entrer une limite valide', 'error');
            return;
        }
        
        try {
            await ApiService.setNumberLimit(number, newLimit);
            
            const numbersData = this.stateManager.getData('numbers') || { blocked: [], limits: {} };
            if (!numbersData.limits) numbersData.limits = {};
            numbersData.limits[number] = newLimit;
            
            this.stateManager.setData('numbers', numbersData);
            this.renderLimitsList();
            
            this.uiManager.showNotification(
                `Limite mise à jour pour le boule ${number}: ${newLimit.toLocaleString()} Gdes`,
                'success'
            );
            
            this.uiManager.closeModal('advanced-modal');
            
        } catch (error) {
            console.error('Erreur mise à jour limite:', error);
            this.uiManager.showNotification(error.message || 'Erreur lors de la mise à jour', 'error');
        }
    }

    // Supprimer une limite
    async removeNumberLimit(number) {
        if (!confirm(`Supprimer la limite pour le boule ${number}?`)) {
            return;
        }
        
        try {
            await ApiService.setNumberLimit(number, 0);
            
            const numbersData = this.stateManager.getData('numbers') || { blocked: [], limits: {} };
            if (numbersData.limits && numbersData.limits[number]) {
                delete numbersData.limits[number];
            }
            
            this.stateManager.setData('numbers', numbersData);
            this.renderLimitsList();
            
            this.uiManager.showNotification(`Limite supprimée pour le boule ${number}`, 'success');
            
        } catch (error) {
            console.error('Erreur suppression limite:', error);
            this.uiManager.showNotification(error.message || 'Erreur lors de la suppression', 'error');
        }
    }

    // Ajuster toutes les limites
    async adjustAllLimits(direction) {
        const adjustment = parseInt(document.getElementById('limit-adjustment').value);
        
        if (isNaN(adjustment) || adjustment <= 0) {
            this.uiManager.showNotification('Veuillez définir un pourcentage valide', 'error');
            return;
        }
        
        const confirmMessage = direction === 'increase' 
            ? `Augmenter toutes les limites de ${adjustment}%?`
            : `Réduire toutes les limites de ${adjustment}%?`;
        
        if (!confirm(confirmMessage)) {
            return;
        }
        
        try {
            const numbersData = this.stateManager.getData('numbers') || { blocked: [], limits: {} };
            const limits = numbersData.limits || {};
            
            const updatedLimits = {};
            Object.keys(limits).forEach(number => {
                let newLimit = limits[number];
                
                if (direction === 'increase') {
                    newLimit = Math.round(newLimit * (1 + adjustment / 100));
                } else {
                    newLimit = Math.round(newLimit * (1 - adjustment / 100));
                    // Ne pas descendre en dessous de 0
                    if (newLimit < 0) newLimit = 0;
                }
                
                updatedLimits[number] = newLimit;
            });
            
            await ApiService.updateNumberLimits(updatedLimits);
            
            numbersData.limits = updatedLimits;
            this.stateManager.setData('numbers', numbersData);
            this.renderLimitsList();
            
            this.uiManager.showNotification(
                `Toutes les limites ont été ${direction === 'increase' ? 'augmentées' : 'réduites'} de ${adjustment}%`,
                'success'
            );
            
        } catch (error) {
            console.error('Erreur ajustement limites:', error);
            this.uiManager.showNotification(error.message || 'Erreur lors de l\'ajustement', 'error');
        }
    }

    // Réinitialiser toutes les limites
    async resetAllLimits() {
        if (!confirm('Réinitialiser toutes les limites à leurs valeurs par défaut?')) {
            return;
        }
        
        try {
            // Récupérer les limites par défaut depuis l'API
            const defaultLimits = {};
            for (let i = 0; i < 100; i++) {
                const num = i.toString().padStart(2, '0');
                defaultLimits[num] = 100;
            }
            
            await ApiService.updateNumberLimits(defaultLimits);
            
            const numbersData = this.stateManager.getData('numbers') || { blocked: [], limits: {} };
            numbersData.limits = defaultLimits;
            this.stateManager.setData('numbers', numbersData);
            this.renderLimitsList();
            
            this.uiManager.showNotification('Toutes les limites ont été réinitialisées', 'success');
            
        } catch (error) {
            console.error('Erreur réinitialisation limites:', error);
            this.uiManager.showNotification(error.message || 'Erreur lors de la réinitialisation', 'error');
        }
    }

    // Charger les statistiques des numéros
    async loadNumbersStats() {
        try {
            const stats = await ApiService.getNumberStats();
            const numbersData = this.stateManager.getData('numbers') || { blocked: [], limits: {}, stats: {} };
            numbersData.stats = stats;
            
            this.stateManager.setData('numbers', numbersData);
            this.renderNumbersStats();
            
        } catch (error) {
            console.error('Erreur chargement statistiques:', error);
            this.uiManager.showNotification('Erreur de chargement des statistiques', 'error');
        }
    }

    // Rendre les statistiques des numéros
    renderNumbersStats() {
        const container = document.getElementById('numbers-stats-tab');
        if (!container) return;
        
        const numbersData = this.stateManager.getData('numbers') || { blocked: [], limits: {}, stats: {} };
        const stats = numbersData.stats || {};
        
        if (!stats || Object.keys(stats).length === 0) {
            container.innerHTML = `
                <div class="stats-container">
                    <h4>Statistiques des Boules</h4>
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-chart-bar" style="font-size: 48px; color: var(--text-dim); margin-bottom: 20px;"></i>
                        <p style="color: var(--text-dim);">Aucune statistique disponible</p>
                        <button class="btn btn-primary" onclick="ownerManager.loadNumbersStats()">
                            <i class="fas fa-sync"></i> Charger les statistiques
                        </button>
                    </div>
                </div>
            `;
            return;
        }
        
        // Trier les numéros par fréquence
        const sortedNumbers = Object.keys(stats).sort((a, b) => {
            return (stats[b].frequency || 0) - (stats[a].frequency || 0);
        });
        
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
                    ${sortedNumbers.slice(0, 10).map((number, index) => {
                        const stat = stats[number];
                        return `
                            <div class="top-number-item" style="display: flex; justify-content: space-between; align-items: center; 
                                 padding: 12px 15px; background: white; border-radius: 10px; margin-bottom: 8px; 
                                 border-left: 4px solid ${index < 3 ? 'var(--primary)' : 'var(--border)'};">
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
                
                <div style="margin-top: 30px;">
                    <h4 style="margin-bottom: 15px;">Distribution des boules</h4>
                    <div id="bet-distribution-chart" style="height: 300px; background: #f8f9fa; border-radius: 15px; padding: 20px; display: flex; align-items: flex-end; gap: 2px;">
                        ${Array.from({length: 10}, (_, col) => {
                            const columnNumbers = Array.from({length: 10}, (_, row) => {
                                const num = (col * 10 + row).toString().padStart(2, '0');
                                const stat = stats[num] || {};
                                const height = Math.min(100, (stat.frequency || 0) * 10);
                                const isBlocked = numbersData.blocked?.includes(num);
                                const hasLimit = numbersData.limits?.[num];
                                
                                return `
                                    <div style="position: relative; flex: 1; display: flex; flex-direction: column; align-items: center;">
                                        <div style="width: 20px; height: ${height}px; background: ${isBlocked ? 'var(--danger)' : hasLimit ? 'var(--warning)' : 'var(--primary)'}; 
                                             border-radius: 3px; margin-bottom: 5px;"></div>
                                        <div style="font-size: 10px; color: ${isBlocked ? 'var(--danger)' : 'var(--text)'};">
                                            ${num}
                                        </div>
                                    </div>
                                `;
                            }).join('');
                            
                            return `<div style="flex: 1; display: flex; flex-direction: column;">${columnNumbers}</div>`;
                        }).join('')}
                    </div>
                    <div style="display: flex; justify-content: center; gap: 20px; margin-top: 20px;">
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <div style="width: 15px; height: 15px; background: var(--primary); border-radius: 3px;"></div>
                            <span style="font-size: 12px;">Normal</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <div style="width: 15px; height: 15px; background: var(--warning); border-radius: 3px;"></div>
                            <span style="font-size: 12px;">Limité</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <div style="width: 15px; height: 15px; background: var(--danger); border-radius: 3px;"></div>
                            <span style="font-size: 12px;">Bloqué</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Voir l'historique d'un numéro
    async viewNumberHistory(number) {
        try {
            const history = await ApiService.getNumberHistory(number, 30);
            
            const modal = document.getElementById('advanced-modal');
            const title = document.getElementById('advanced-modal-title');
            const content = document.getElementById('advanced-modal-content');
            
            title.textContent = `Historique: Boule ${number}`;
            
            if (!history || history.length === 0) {
                content.innerHTML = '<p class="no-data">Aucun historique disponible pour ce numéro</p>';
            } else {
                const totalBets = history.reduce((sum, item) => sum + (item.betAmount || 0), 0);
                const totalWins = history.reduce((sum, item) => sum + (item.winAmount || 0), 0);
                const winRate = (history.filter(item => item.won).length / history.length * 100).toFixed(1);
                
                content.innerHTML = `
                    <div class="number-history">
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px;">
                            <div style="text-align: center; padding: 15px; background: #f8f9fa; border-radius: 10px;">
                                <div style="font-size: 12px; color: var(--text-dim);">Total mises</div>
                                <div style="font-size: 20px; font-weight: bold; color: var(--primary);">
                                    ${totalBets.toLocaleString()} Gdes
                                </div>
                            </div>
                            <div style="text-align: center; padding: 15px; background: #f8f9fa; border-radius: 10px;">
                                <div style="font-size: 12px; color: var(--text-dim);">Taux de gain</div>
                                <div style="font-size: 20px; font-weight: bold; color: ${winRate > 0 ? 'var(--success)' : 'var(--text-dim)'};">
                                    ${winRate}%
                                </div>
                            </div>
                            <div style="text-align: center; padding: 15px; background: #f8f9fa; border-radius: 10px;">
                                <div style="font-size: 12px; color: var(--text-dim);">Bénéfice</div>
                                <div style="font-size: 20px; font-weight: bold; color: ${(totalBets - totalWins) > 0 ? 'var(--success)' : 'var(--danger)'};">
                                    ${(totalBets - totalWins).toLocaleString()} Gdes
                                </div>
                            </div>
                        </div>
                        
                        <h4 style="margin-bottom: 10px;">Dernières occurrences (${history.length} total)</h4>
                        <div class="history-list" style="max-height: 400px; overflow-y: auto;">
                            ${history.map(item => `
                                <div class="history-item" style="padding: 10px 15px; border-bottom: 1px solid var(--border);">
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <div>
                                            <div style="font-weight: 500;">${item.drawName || 'Tirage'}</div>
                                            <div style="font-size: 12px; color: var(--text-dim); margin-top: 2px;">
                                                ${new Date(item.timestamp).toLocaleString()}
                                            </div>
                                        </div>
                                        <div style="text-align: right;">
                                            <div style="font-weight: bold; color: var(--primary);">
                                                ${item.betAmount?.toLocaleString() || 0} Gdes
                                            </div>
                                            <div style="font-size: 12px; color: ${item.won ? 'var(--success)' : 'var(--danger)'};">
                                                ${item.won ? `Gagnant: +${item.winAmount?.toLocaleString() || 0} Gdes` : 'Perdant'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
            
            this.uiManager.showModal('advanced-modal');
            
        } catch (error) {
            console.error('Erreur chargement historique numéro:', error);
            this.uiManager.showNotification('Erreur lors du chargement de l\'historique', 'error');
        }
    }
}