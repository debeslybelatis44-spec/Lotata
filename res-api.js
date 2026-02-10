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
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`HTTP ${response.status}: ${error}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        }
        
        return await response.text();
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
            console.error('Erreur vérification token:', error);
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
            return null;
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
            return data || [];
        } catch (error) {
            console.error('Erreur récupération agents:', error);
            return [];
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
            return data.tickets || [];
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
            return data.winners || [];
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
                totalBets: data.totalBets || 0,
                totalTickets: data.totalTickets || 0,
                totalWins: data.totalWins || 0,
                todaySales: data.todaySales || 0,
                activeDays: data.activeDays || 0
            };
        } catch (error) {
            console.error('Erreur récupération statistiques:', error);
            return { totalBets: 0, totalTickets: 0, totalWins: 0, todaySales: 0, activeDays: 0 };
        }
    }

    // Rapports du superviseur
    async getSupervisorReports(period = 'today') {
        try {
            let url = `${this.baseUrl}/reports/dashboard`;
            if (period !== 'today') {
                url += `?period=${period}`;
            }
            
            const response = await fetch(url, {
                method: 'GET',
                headers: await this.getHeaders()
            });
            
            const data = await this.handleResponse(response);
            return {
                totalSales: data.totalSales || 0,
                totalTickets: data.totalTickets || 0,
                totalWins: data.totalWins || 0,
                activeAgents: data.activeAgents || 0,
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
            const response = await fetch(`${this.baseUrl}/tickets/delete/${ticketId}`, {
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
            const response = await fetch(`${this.baseUrl}/users/${agentId}/block`, {
                method: 'PATCH',
                headers: await this.getHeaders(),
                body: JSON.stringify({ blocked: blockStatus })
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
}

// Instance unique du service API
const apiService = new SupervisorAPIService();