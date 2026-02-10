// Gestionnaire des rapports
class ReportManager {
    constructor(apiService, uiManager) {
        this.apiService = apiService;
        this.uiManager = uiManager;
        this.charts = {};
        this.initEventHandlers();
    }

    // Initialisation des gestionnaires d'événements
    initEventHandlers() {
        EVENT_HANDLERS.onReportPeriodChange = (period) => this.loadReports(period);
    }

    // Charger les rapports
    async loadReports(period = 'today') {
        try {
            this.uiManager.toggleLoading(true, 'reports-container');
            
            const reports = await this.apiService.getSupervisorReports(period);
            SUPERVISOR_STATE.reports = reports;
            
            this.renderReports(reports, period);
            this.uiManager.showSuccess('Rapports chargés', 2000);
            
        } catch (error) {
            console.error('❌ Erreur chargement rapports:', error);
            this.uiManager.showError(MESSAGES.ERROR.LOAD_FAILED);
            this.uiManager.setEmptyState('reports-container', 'Erreur de chargement');
        }
    }

    // Afficher les rapports
    renderReports(reportData, period) {
        const container = document.getElementById('reports-container');
        
        const periodLabel = this.getPeriodLabel(period);
        const activeAgents = SUPERVISOR_STATE.agents.filter(a => a.active).length;
        const totalAgents = SUPERVISOR_STATE.agents.length;
        const commission = DATA_FORMATTERS.calculateCommission(reportData.totalSales, 0.05);
        
        container.innerHTML = `
            <div class="reports-grid">
                <!-- Carte de résumé principal -->
                <div class="report-card summary-card">
                    <h4><i class="fas fa-chart-pie"></i> Résumé des Performances</h4>
                    <div class="summary-stats">
                        <div class="summary-stat">
                            <div class="stat-icon sales">
                                <i class="fas fa-shopping-cart"></i>
                            </div>
                            <div class="stat-details">
                                <span class="stat-label">Ventes Total</span>
                                <span class="stat-value">${DATA_FORMATTERS.formatCurrency(reportData.totalSales)}</span>
                            </div>
                        </div>
                        <div class="summary-stat">
                            <div class="stat-icon tickets">
                                <i class="fas fa-ticket-alt"></i>
                            </div>
                            <div class="stat-details">
                                <span class="stat-label">Tickets Émis</span>
                                <span class="stat-value">${reportData.totalTickets}</span>
                            </div>
                        </div>
                        <div class="summary-stat">
                            <div class="stat-icon wins">
                                <i class="fas fa-trophy"></i>
                            </div>
                            <div class="stat-details">
                                <span class="stat-label">Gains Distribués</span>
                                <span class="stat-value success">${DATA_FORMATTERS.formatCurrency(reportData.totalWins)}</span>
                            </div>
                        </div>
                        <div class="summary-stat">
                            <div class="stat-icon commission">
                                <i class="fas fa-money-bill-wave"></i>
                            </div>
                            <div class="stat-details">
                                <span class="stat-label">Commission</span>
                                <span class="stat-value warning">${DATA_FORMATTERS.formatCurrency(commission)}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Carte des statistiques des agents -->
                <div class="report-card agents-card">
                    <h4><i class="fas fa-users"></i> Statistiques Agents</h4>
                    <div class="agents-stats">
                        <div class="agent-stat-item">
                            <div class="stat-progress">
                                <div class="progress-bar" style="width: ${(activeAgents/totalAgents)*100}%"></div>
                            </div>
                            <div class="stat-info">
                                <span>Agents Actifs</span>
                                <strong>${activeAgents}/${totalAgents}</strong>
                            </div>
                        </div>
                        <div class="agent-stat-item">
                            <div class="stat-info">
                                <span>Agents en Ligne</span>
                                <strong>${SUPERVISOR_STATE.agents.filter(a => a.online).length}</strong>
                            </div>
                        </div>
                        <div class="agent-stat-item">
                            <div class="stat-info">
                                <span>Agents Bloqués</span>
                                <strong>${SUPERVISOR_STATE.agents.filter(a => !a.active).length}</strong>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Carte des détails de la période -->
                <div class="report-card period-card">
                    <h4><i class="fas fa-calendar-alt"></i> Détails Période</h4>
                    <div class="period-details">
                        <div class="period-item">
                            <span>Période:</span>
                            <strong>${periodLabel}</strong>
                        </div>
                        <div class="period-item">
                            <span>Moyenne Ventes/Jour:</span>
                            <strong>${DATA_FORMATTERS.formatCurrency(reportData.totalSales)}</strong>
                        </div>
                        <div class="period-item">
                            <span>Taux de Gain:</span>
                            <strong>${reportData.totalTickets > 0 ? ((reportData.totalWins / reportData.totalSales) * 100).toFixed(2) : 0}%</strong>
                        </div>
                        <div class="period-item">
                            <span>Performance:</span>
                            <strong class="${this.getPerformanceClass(reportData)}">
                                ${this.getPerformanceText(reportData)}
                            </strong>
                        </div>
                    </div>
                </div>
                
                <!-- Carte des tops agents -->
                <div class="report-card top-agents-card">
                    <h4><i class="fas fa-crown"></i> Top Agents</h4>
                    <div class="top-agents-list" id="top-agents-list">
                        ${this.renderTopAgents()}
                    </div>
                </div>
            </div>
        `;
        
        // Initialiser les graphiques
        this.initCharts(reportData);
    }

    // Afficher les top agents
    renderTopAgents() {
        if (SUPERVISOR_STATE.agents.length === 0) {
            return '<p class="empty-state small">Aucun agent disponible</p>';
        }
        
        // Trier les agents par ventes (simulation)
        const sortedAgents = [...SUPERVISOR_STATE.agents]
            .sort((a, b) => {
                // Pour l'exemple, on utilise un ordre aléatoire
                // Dans la vraie application, vous utiliseriez les vraies statistiques
                return Math.random() - 0.5;
            })
            .slice(0, 3);
        
        return sortedAgents.map((agent, index) => {
            const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : 'bronze';
            const rankIcon = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
            
            return `
                <div class="top-agent-item ${rankClass}">
                    <div class="agent-rank">
                        <span class="rank-icon">${rankIcon}</span>
                        <span class="rank-number">${index + 1}</span>
                    </div>
                    <div class="agent-info">
                        <span class="agent-name">${agent.name}</span>
                        <span class="agent-sales">${DATA_FORMATTERS.formatCurrency(Math.floor(Math.random() * 10000))}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Initialiser les graphiques
    initCharts(reportData) {
        // Détruire les graphiques existants
        Object.values(this.charts).forEach(chart => {
            if (chart) chart.destroy();
        });
        this.charts = {};
        
        // Graphique des ventes (exemple)
        this.initSalesChart(reportData);
    }

    // Graphique des ventes
    initSalesChart(reportData) {
        const ctx = document.createElement('canvas');
        ctx.id = 'sales-chart';
        
        // Trouver un endroit pour placer le graphique
        const container = document.querySelector('.summary-card');
        if (container) {
            container.appendChild(ctx);
            
            this.charts.sales = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
                    datasets: [{
                        label: 'Ventes (Gdes)',
                        data: [
                            reportData.totalSales * 0.8,
                            reportData.totalSales * 1.2,
                            reportData.totalSales * 0.9,
                            reportData.totalSales * 1.1,
                            reportData.totalSales,
                            reportData.totalSales * 0.7,
                            reportData.totalSales * 0.5
                        ],
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        title: {
                            display: true,
                            text: 'Ventes Hebdomadaires'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return value.toLocaleString() + ' Gdes';
                                }
                            }
                        }
                    }
                }
            });
        }
    }

    // Obtenir le label de la période
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

    // Classe de performance
    getPerformanceClass(reportData) {
        if (reportData.totalSales > 10000) return 'performance-excellent';
        if (reportData.totalSales > 5000) return 'performance-good';
        if (reportData.totalSales > 1000) return 'performance-average';
        return 'performance-poor';
    }

    // Texte de performance
    getPerformanceText(reportData) {
        if (reportData.totalSales > 10000) return 'Excellent';
        if (reportData.totalSales > 5000) return 'Bon';
        if (reportData.totalSales > 1000) return 'Moyen';
        return 'Faible';
    }

    // Générer un rapport détaillé
    async generateDetailedReport(params) {
        try {
            this.uiManager.toggleLoading(true, 'reports-container');
            
            const report = await this.apiService.generateReport(params);
            
            // Traiter le rapport généré
            this.renderDetailedReport(report);
            
            this.uiManager.showSuccess('Rapport généré avec succès');
            
        } catch (error) {
            console.error('Erreur génération rapport:', error);
            this.uiManager.showError('Erreur lors de la génération du rapport');
        }
    }

    // Afficher un rapport détaillé
    renderDetailedReport(report) {
        // Implémentation spécifique selon la structure du rapport
        console.log('Rapport détaillé:', report);
    }

    // Exporter les rapports
    exportReports(format = 'pdf') {
        // Implémentation de l'export selon le format
        this.uiManager.showInfo('Export des rapports - Fonctionnalité à venir', 'Export');
    }
}

// Instance unique du gestionnaire de rapports
const reportManager = new ReportManager(apiService, uiManager);