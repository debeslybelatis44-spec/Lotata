// Classe pour gérer les appels API
class SupervisorAPI {
    // URL de base corrigée
    static API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:10000/api' : '/api';

    static async getHeaders() {
        const token = localStorage.getItem('auth_token');
        return {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
        };
    }

    static async verifyToken() {
        try {
            const response = await fetch(`${this.API_BASE_URL}/auth/verify`, {
                method: 'GET',
                headers: await this.getHeaders()
            });

            if (!response.ok) {
                throw new Error('Authentification échouée');
            }

            return await response.json();
        } catch (error) {
            console.error('Erreur vérification token:', error);
            throw error;
        }
    }

    static async getSupervisorInfo() {
        try {
            const response = await fetch(`${this.API_BASE_URL}/supervisor/auth/verify`, {
                method: 'GET',
                headers: await this.getHeaders()
            });

            if (!response.ok) {
                throw new Error('Erreur de récupération des informations superviseur');
            }

            return await response.json();
        } catch (error) {
            console.error('Erreur récupération info superviseur:', error);
            return null;
        }
    }

    static async getSupervisorAgents() {
        try {
            const response = await fetch(`${this.API_BASE_URL}/supervisor/agents`, {
                method: 'GET',
                headers: await this.getHeaders()
            });

            if (!response.ok) {
                throw new Error('Erreur de récupération des agents');
            }

            const data = await response.json();
            return data.agents || data || [];
        } catch (error) {
            console.error('Erreur récupération agents:', error);
            return [];
        }
    }

    static async getAgentTickets(agentId) {
        try {
            const response = await fetch(`${this.API_BASE_URL}/tickets/agent/${agentId}`, {
                method: 'GET',
                headers: await this.getHeaders()
            });

            if (!response.ok) {
                throw new Error('Erreur de récupération des tickets');
            }

            const data = await response.json();
            return data.tickets || data || [];
        } catch (error) {
            console.error('Erreur récupération tickets:', error);
            return [];
        }
    }

    static async getAgentWins(agentId) {
        try {
            const response = await fetch(`${this.API_BASE_URL}/winners/agent/${agentId}`, {
                method: 'GET',
                headers: await this.getHeaders()
            });

            if (!response.ok) {
                throw new Error('Erreur de récupération des gains');
            }

            const data = await response.json();
            return data.winners || data || [];
        } catch (error) {
            console.error('Erreur récupération gains:', error);
            return [];
        }
    }

    static async deleteTicket(ticketId) {
        try {
            const response = await fetch(`${this.API_BASE_URL}/tickets/delete/${ticketId}`, {
                method: 'DELETE',
                headers: await this.getHeaders()
            });

            if (!response.ok) {
                throw new Error('Erreur de suppression du ticket');
            }

            return await response.json();
        } catch (error) {
            console.error('Erreur suppression ticket:', error);
            throw error;
        }
    }

    static async blockAgent(agentId, blockStatus) {
        try {
            const response = await fetch(`${this.API_BASE_URL}/users/${agentId}/block`, {
                method: 'PATCH',
                headers: await this.getHeaders(),
                body: JSON.stringify({ blocked: blockStatus })
            });

            if (!response.ok) {
                throw new Error('Erreur de blocage/déblocage agent');
            }

            return await response.json();
        } catch (error) {
            console.error('Erreur blocage agent:', error);
            throw error;
        }
    }

    static async getAgentStats(agentId) {
        try {
            const response = await fetch(`${this.API_BASE_URL}/reports/agent/${agentId}`, {
                method: 'GET',
                headers: await this.getHeaders()
            });

            if (!response.ok) {
                throw new Error('Erreur de récupération des statistiques');
            }

            const data = await response.json();
            return data.stats || data || { totalBets: 0, totalTickets: 0, totalWins: 0 };
        } catch (error) {
            console.error('Erreur récupération statistiques:', error);
            return { totalBets: 0, totalTickets: 0, totalWins: 0 };
        }
    }

    static async getSupervisorReports(period = 'today') {
        try {
            const response = await fetch(`${this.API_BASE_URL}/reports/supervisor?period=${period}`, {
                method: 'GET',
                headers: await this.getHeaders()
            });

            if (!response.ok) {
                throw new Error('Erreur de récupération des rapports');
            }

            const data = await response.json();
            return data.report || data || { totalSales: 0, totalTickets: 0, totalWins: 0, activeAgents: 0 };
        } catch (error) {
            console.error('Erreur récupération rapports:', error);
            return { totalSales: 0, totalTickets: 0, totalWins: 0, activeAgents: 0 };
        }
    }

    static async getSupervisorWinners() {
        try {
            const response = await fetch(`${this.API_BASE_URL}/winners/supervisor`, {
                method: 'GET',
                headers: await this.getHeaders()
            });

            if (!response.ok) {
                throw new Error('Erreur de récupération des gagnants');
            }

            const data = await response.json();
            return data.winners || data || [];
        } catch (error) {
            console.error('Erreur récupération gagnants:', error);
            return [];
        }
    }

    static async logout() {
        try {
            const response = await fetch(`${this.API_BASE_URL}/auth/logout`, {
                method: 'POST',
                headers: await this.getHeaders()
            });

            return await response.json();
        } catch (error) {
            console.error('Erreur déconnexion:', error);
            return { success: false };
        }
    }

    static async getSupervisorSettings() {
        try {
            const response = await fetch(`${this.API_BASE_URL}/supervisor/settings`, {
                method: 'GET',
                headers: await this.getHeaders()
            });

            if (!response.ok) {
                throw new Error('Erreur de récupération des paramètres');
            }

            return await response.json();
        } catch (error) {
            console.error('Erreur récupération paramètres:', error);
            return {};
        }
    }

    static async updateSupervisorSettings(settings) {
        try {
            const response = await fetch(`${this.API_BASE_URL}/supervisor/settings`, {
                method: 'PUT',
                headers: await this.getHeaders(),
                body: JSON.stringify(settings)
            });

            if (!response.ok) {
                throw new Error('Erreur de mise à jour des paramètres');
            }

            return await response.json();
        } catch (error) {
            console.error('Erreur mise à jour paramètres:', error);
            throw error;
        }
    }
}