// Gestion de l'interface utilisateur
class UI {
    static showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(notification);
        
        // Animation d'entrée
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        // Supprimer après 3 secondes
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    static formatTime(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return 'À l\'instant';
        if (diffMins < 60) return `Il y a ${diffMins} min`;
        if (diffMins < 1440) return `Il y a ${Math.floor(diffMins / 60)} h`;
        return date.toLocaleDateString();
    }

    static formatCurrency(amount) {
        return `${parseFloat(amount).toLocaleString('fr-FR')} Gdes`;
    }

    static toggleMobileMode() {
        MOBILE_MODE = !MOBILE_MODE;
        
        if (MOBILE_MODE) {
            document.body.classList.add('mobile-mode');
            document.querySelector('.supervisor-sidebar').classList.remove('active');
            document.querySelector('.mobile-toggle i').className = 'fas fa-desktop';
            document.querySelector('.mobile-toggle').title = 'Mode PC';
        } else {
            document.body.classList.remove('mobile-mode');
            document.querySelector('.mobile-toggle i').className = 'fas fa-mobile-alt';
            document.querySelector('.mobile-toggle').title = 'Mode Mobile';
        }
        
        // Sauvegarder le préférence
        localStorage.setItem('mobile_mode', MOBILE_MODE);
    }

    static toggleSidebar() {
        const sidebar = document.querySelector('.supervisor-sidebar');
        sidebar.classList.toggle('active');
    }

    static initEventListeners() {
        // Recherche d'agents
        const searchInput = document.getElementById('search-agent');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const agentCards = document.querySelectorAll('.agent-card');
                
                agentCards.forEach(card => {
                    const agentName = card.querySelector('.agent-name').textContent.toLowerCase();
                    const agentId = card.querySelector('.agent-id').textContent.toLowerCase();
                    
                    if (agentName.includes(searchTerm) || agentId.includes(searchTerm)) {
                        card.style.display = 'block';
                    } else {
                        card.style.display = 'none';
                    }
                });
            });
        }

        // Filtre par statut
        const filterSelect = document.getElementById('filter-status');
        if (filterSelect) {
            filterSelect.addEventListener('change', (e) => {
                const filterValue = e.target.value;
                const agentCards = document.querySelectorAll('.agent-card');
                
                agentCards.forEach(card => {
                    const isOnline = card.querySelector('.status-dot').classList.contains('online');
                    const isBlocked = card.classList.contains('blocked');
                    
                    let shouldShow = false;
                    
                    switch(filterValue) {
                        case 'all':
                            shouldShow = true;
                            break;
                        case 'online':
                            shouldShow = isOnline && !isBlocked;
                            break;
                        case 'offline':
                            shouldShow = !isOnline && !isBlocked;
                            break;
                        case 'blocked':
                            shouldShow = isBlocked;
                            break;
                    }
                    
                    card.style.display = shouldShow ? 'block' : 'none';
                });
            });
        }

        // Période des rapports
        const reportPeriod = document.getElementById('report-period');
        if (reportPeriod) {
            reportPeriod.addEventListener('change', () => {
                supervisorManager.loadReports();
            });
        }

        // Fermer le modal en cliquant en dehors
        document.addEventListener('click', (e) => {
            const modal = document.getElementById('agent-details-modal');
            if (e.target === modal) {
                supervisorManager.closeModal();
            }
        });

        // Touche Échap pour fermer le modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                supervisorManager.closeModal();
            }
        });

        // Bouton de basculement de la sidebar sur mobile
        const sidebarToggle = document.querySelector('.sidebar-toggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', UI.toggleSidebar);
        }
    }

    static addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 20px;
                border-radius: 10px;
                box-shadow: 0 5px 15px rgba(0,0,0,0.2);
                z-index: 10000;
                transform: translateX(150%);
                transition: transform 0.3s ease;
                display: flex;
                align-items: center;
                gap: 10px;
                max-width: 400px;
            }
            
            .notification.show {
                transform: translateX(0);
            }
            
            .notification-success {
                background: var(--success);
                color: white;
            }
            
            .notification-error {
                background: var(--danger);
                color: white;
            }
            
            .notification-info {
                background: var(--primary);
                color: white;
            }
            
            .notification-warning {
                background: var(--warning);
                color: var(--dark);
            }
            
            .no-data {
                text-align: center;
                color: var(--text-dim);
                padding: 40px 20px;
                grid-column: 1/-1;
                background: #f8f9fa;
                border-radius: 10px;
                margin: 20px 0;
            }
            
            .stats-grid-small {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 15px;
            }
            
            .stat-card-small {
                background: #f8f9fa;
                padding: 15px;
                border-radius: 10px;
                text-align: center;
            }
            
            .stat-card-small h5 {
                margin-bottom: 10px;
                color: var(--text-dim);
                font-size: 14px;
            }
            
            .stat-value-large {
                font-size: 24px;
                font-weight: bold;
                color: var(--primary);
                margin: 0;
            }
            
            .success-text {
                color: var(--success);
            }
            
            .warning-text {
                color: var(--warning);
            }
            
            .blocked-text {
                color: var(--danger);
            }
            
            .expired-text {
                color: var(--text-dim);
                font-size: 12px;
            }
            
            .win-card {
                background: linear-gradient(135deg, #28a745, #20c997);
                color: white;
                padding: 15px;
                border-radius: 10px;
                margin-bottom: 10px;
            }
            
            .win-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }
            
            .win-amount {
                font-size: 20px;
                font-weight: bold;
            }
            
            .win-details {
                font-size: 14px;
                opacity: 0.9;
            }
            
            .detailed-report {
                background: white;
                border-radius: 10px;
                padding: 20px;
                box-shadow: 0 5px 15px rgba(0,0,0,0.05);
            }
            
            .report-stats {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 15px;
                margin-bottom: 20px;
            }
            
            .report-stat {
                text-align: center;
            }
            
            .detailed-stats {
                margin-top: 20px;
            }
            
            .stats-list {
                color: var(--text-dim);
                list-style: none;
                padding: 0;
            }
            
            .stats-list li {
                padding: 5px 0;
                border-bottom: 1px solid var(--border);
            }
            
            .reports-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 20px;
            }
            
            .report-card {
                background: white;
                border-radius: 15px;
                padding: 20px;
                box-shadow: 0 5px 15px rgba(0,0,0,0.05);
            }
            
            .report-summary {
                height: 200px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
            }
            
            .summary-value {
                font-size: 48px;
                color: var(--primary);
                font-weight: bold;
            }
            
            .summary-label {
                color: var(--text-dim);
                font-size: 18px;
            }
            
            .key-stats {
                display: grid;
                gap: 15px;
            }
            
            .key-stat {
                display: flex;
                justify-content: space-between;
                padding: 10px;
                background: #f8f9fa;
                border-radius: 8px;
            }
            
            .winner-card {
                background: white;
                border-radius: 10px;
                padding: 20px;
                margin-bottom: 15px;
                box-shadow: 0 5px 15px rgba(0,0,0,0.05);
                border-left: 4px solid var(--success);
            }
            
            .winner-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 15px;
            }
            
            .winner-amount {
                text-align: right;
            }
            
            .winner-amount .amount {
                font-size: 24px;
                font-weight: bold;
                color: var(--success);
                display: block;
            }
            
            .winner-amount .status {
                font-size: 12px;
                padding: 3px 8px;
                border-radius: 12px;
                display: inline-block;
            }
            
            .winner-amount .status.paid {
                background: #d4edda;
                color: #155724;
            }
            
            .winner-amount .status.pending {
                background: #fff3cd;
                color: #856404;
            }
            
            .settings-card {
                background: white;
                border-radius: 10px;
                padding: 20px;
                box-shadow: 0 5px 15px rgba(0,0,0,0.05);
            }
            
            .settings-form {
                max-width: 500px;
            }
            
            .form-group {
                margin-bottom: 20px;
            }
            
            .form-group label {
                display: block;
                margin-bottom: 5px;
                color: var(--text);
                font-weight: 500;
            }
            
            .sidebar-toggle {
                display: none;
            }
            
            @media (max-width: 992px) {
                .sidebar-toggle {
                    display: flex;
                }
                
                .reports-grid {
                    grid-template-columns: 1fr;
                }
                
                .stats-grid-small {
                    grid-template-columns: 1fr;
                }
                
                .report-stats {
                    grid-template-columns: 1fr;
                }
            }
            
            @media (max-width: 768px) {
                .notification {
                    left: 20px;
                    right: 20px;
                    max-width: none;
                }
            }
        `;
        
        document.head.appendChild(style);
    }
}

// Fonction globale pour basculer le mode mobile
function toggleMobileMode() {
    UI.toggleMobileMode();
}