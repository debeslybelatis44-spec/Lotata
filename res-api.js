// Service API pour les communications avec le backend
class SupervisorAPIService {
    constructor() {
        this.baseUrl = API_CONFIG.getBaseUrl();
        this.authToken = STORAGE.get('auth_token');
    }

    // En-têtes HTTP communs
    async getHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };

        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }

        return headers;
    }

    // Gestionnaire d'erreurs HTTP
    async handleResponse(response) {
        if (response.status === 401) {
            STORAGE.remove('auth_token');
            window.location.href = 'index.html';
            throw new Error('Session expirée');
        }
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Erreur serveur' }));
            throw new Error(`HTTP ${response.status}: ${error.message}`);
        }
        
        return await response.json();
    }

    // Vérification du token
    async verifyToken() {
        try {
            const response = await fetch(`${this.baseUrl}/auth/verify`, {
                method: 'GET',
                headers: await this.getHeaders()
            });
            
            return await this.handleResponse(response);
        } catch (error) {
            throw error;
        }
    }

    // Informations du superviseur
    async getSupervisorInfo() {
        try {
            const response = await fetch(`${this.baseUrl}/supervisor/auth/verify`, {
                method: 'GET',
                headers: await this.getHeaders()
            });
            
            return await this.handleResponse(response);
        } catch (error) {
            console.error('Erreur récupération info superviseur:', error);
            throw error;
        }
    }

    // Liste des agents
    async getSupervisorAgents() {
        try {
            const response = await fetch(`${this.baseUrl}/supervisor/agents`, {
                method: 'GET',
                headers: await this.getHeaders()
            });
            
            const data = await this.handleResponse(response);
            return Array.isArray(data) ? data : (data.agents || data.data || []);
        } catch (error) {
            console.error('Erreur récupération agents:', error);
            throw error;
        }
    }

    // Tickets d'un agent
    async getAgentTickets(agentId) {
        try {
            const response = await fetch(`${this.baseUrl}/tickets/agent/${agentId}`, {
                method: 'GET',
                headers: await this.getHeaders()
            });
            
            const data = await this.handleResponse(response);
            return data.tickets || data.data || [];
        } catch (error) {
            console.error('Erreur récupération tickets:', error);
            return [];
        }
    }

    // Gains d'un agent
    async getAgentWins(agentId) {
        try {
            const response = await fetch(`${this.baseUrl}/winners/agent/${agentId}`, {
                method: 'GET',
                headers: await this.getHeaders()
            });
            
            const data = await this.handleResponse(response);
            return data.winners || data.data || [];
        } catch (error) {
            console.error('Erreur récupération gains:', error);
            return [];
        }
    }

    // Statistiques d'un agent
    async getAgentStats(agentId) {
        try {
            const response = await fetch(`${this.baseUrl}/reports?agentId=${agentId}`, {
                method: 'GET',
                headers: await this.getHeaders()
            });
            
            const data = await this.handleResponse(response);
            return {
                totalBets: data.totalBets || data.total_sales || 0,
                totalTickets: data.totalTickets || data.total_tickets || 0,
                totalWins: data.totalWins || data.total_wins || 0,
                todaySales: data.todaySales || data.today_sales || 0,
                activeDays: data.activeDays || data.active_days || 0
            };
        } catch (error) {
            console.error('Erreur récupération statistiques:', error);
            return { totalBets: 0, totalTickets: 0, totalWins: 0, todaySales: 0, activeDays: 0 };
        }
    }

    // Rapports du superviseur
    async getSupervisorReports(period = 'today') {
        try {
            const url = `${this.baseUrl}/reports/dashboard?period=${period}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: await this.getHeaders()
            });
            
            const data = await this.handleResponse(response);
            return {
                totalSales: data.totalSales || data.total_sales || 0,
                totalTickets: data.totalTickets || data.total_tickets || 0,
                totalWins: data.totalWins || data.total_wins || 0,
                activeAgents: data.activeAgents || data.active_agents || 0,
                period: period
            };
        } catch (error) {
            console.error('Erreur récupération rapports:', error);
            return { totalSales: 0, totalTickets: 0, totalWins: 0, activeAgents: 0, period };
        }
    }

    // Suppression d'un ticket
    async deleteTicket(ticketId) {
        try {
            const response = await fetch(`${this.baseUrl}/tickets/${ticketId}`, {
                method: 'DELETE',
                headers: await this.getHeaders()
            });
            
            return await this.handleResponse(response);
        } catch (error) {
            console.error('Erreur suppression ticket:', error);
            throw error;
        }
    }

    // Blocage/déblocage d'un agent
    async blockAgent(agentId, blockStatus) {
        try {
            const response = await fetch(`${this.baseUrl}/agents/${agentId}/status`, {
                method: 'PUT',
                headers: await this.getHeaders(),
                body: JSON.stringify({ active: !blockStatus })
            });
            
            return await this.handleResponse(response);
        } catch (error) {
            console.error('Erreur blocage agent:', error);
            throw error;
        }
    }

    // Déconnexion
    async logout() {
        try {
            const response = await fetch(`${this.baseUrl}/auth/logout`, {
                method: 'POST',
                headers: await this.getHeaders()
            });
            
            return await this.handleResponse(response);
        } catch (error) {
            console.error('Erreur déconnexion:', error);
            return { success: false };
        }
    }

    // Mise à jour du profil
    async updateProfile(profileData) {
        try {
            const response = await fetch(`${this.baseUrl}/supervisor/profile`, {
                method: 'PUT',
                headers: await this.getHeaders(),
                body: JSON.stringify(profileData)
            });
            
            return await this.handleResponse(response);
        } catch (error) {
            console.error('Erreur mise à jour profil:', error);
            throw error;
        }
    }

    // Génération de rapport
    async generateReport(params) {
        try {
            const queryString = new URLSearchParams(params).toString();
            const response = await fetch(`${this.baseUrl}/reports/generate?${queryString}`, {
                method: 'GET',
                headers: await this.getHeaders()
            });
            
            return await this.handleResponse(response);
        } catch (error) {
            console.error('Erreur génération rapport:', error);
            throw error;
        }
    }

    // Récupérer les paramètres du superviseur
    async getSupervisorSettings() {
        try {
            const response = await fetch(`${this.baseUrl}/supervisor/settings`, {
                method: 'GET',
                headers: await this.getHeaders()
            });
            
            return await this.handleResponse(response);
        } catch (error) {
            console.error('Erreur récupération paramètres:', error);
            throw error;
        }
    }

    // Mettre à jour les paramètres
    async updateSettings(settings) {
        try {
            const response = await fetch(`${this.baseUrl}/supervisor/settings`, {
                method: 'PUT',
                headers: await this.getHeaders(),
                body: JSON.stringify(settings)
            });
            
            return await this.handleResponse(response);
        } catch (error) {
            console.error('Erreur mise à jour paramètres:', error);
            throw error;
        }
    }
}

// Instance unique du service API
const apiService = new SupervisorAPIService();