const APIService = {
    async saveTicket(ticket) {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SAVE_TICKET}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...ticket,
                    agentId: APP_STATE.agentId,
                    agentName: APP_STATE.agentName,
                    date: new Date().toISOString()
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Erreur serveur: ${response.status} - ${errorText}`);
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Erreur sauvegarde ticket:', error);
            throw error;
        }
    },

    // Nouvelle méthode pour mettre à jour un ticket existant
    async updateTicket(ticketId, ticketData) {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.UPDATE_TICKET}/${ticketId}`, {
                method: 'PUT',  // ou POST selon votre API
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...ticketData,
                    agentId: APP_STATE.agentId,
                    agentName: APP_STATE.agentName,
                    updatedAt: new Date().toISOString()
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Erreur serveur: ${response.status} - ${errorText}`);
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Erreur mise à jour ticket:', error);
            throw error;
        }
    },

    async getTickets() {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_TICKETS}?agentId=${APP_STATE.agentId}`);
            
            if (!response.ok) throw new Error('Erreur réseau');
            
            const data = await response.json();
            APP_STATE.ticketsHistory = data.tickets || [];
            return data;
        } catch (error) {
            console.error('Erreur récupération tickets:', error);
            return { tickets: [] };
        }
    },

    async getReports() {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_REPORTS}?agentId=${APP_STATE.agentId}`);
            
            if (!response.ok) throw new Error('Erreur réseau');
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Erreur récupération rapports:', error);
            return { totalTickets: 0, totalBets: 0, totalWins: 0, totalLoss: 0, balance: 0 };
        }
    },

    async getDrawReport(drawId) {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_DRAW_REPORT}?agentId=${APP_STATE.agentId}&drawId=${drawId}`);
            
            if (!response.ok) throw new Error('Erreur réseau');
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Erreur récupération rapport tirage:', error);
            return { totalTickets: 0, totalBets: 0, totalWins: 0, totalLoss: 0, balance: 0 };
        }
    },

    async getWinningTickets() {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_WINNERS}?agentId=${APP_STATE.agentId}`);
            
            if (!response.ok) throw new Error('Erreur réseau');
            
            const data = await response.json();
            APP_STATE.winningTickets = data.winners || [];
            return data;
        } catch (error) {
            console.error('Erreur récupération gagnants:', error);
            return { winners: [] };
        }
    },

    async getWinningResults() {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_WINNING_RESULTS}?agentId=${APP_STATE.agentId}`);
            
            if (!response.ok) throw new Error('Erreur réseau');
            
            const data = await response.json();
            APP_STATE.winningResults = data.results || [];
            return data;
        } catch (error) {
            console.error('Erreur récupération résultats gagnants:', error);
            return { results: [] };
        }
    },

    async deleteTicket(ticketId) {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.DELETE_TICKET}/${ticketId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Erreur serveur: ${response.status} - ${errorText}`);
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Erreur suppression ticket:', error);
            throw error;
        }
    },

    async getLotteryConfig() {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_LOTTERY_CONFIG}`);
            
            if (!response.ok) throw new Error('Erreur réseau');
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Erreur récupération configuration:', error);
            return null;
        }
    },

    async checkWinningTickets() {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.CHECK_WINNING_TICKETS}?agentId=${APP_STATE.agentId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (!response.ok) throw new Error('Erreur réseau');
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Erreur vérification tickets gagnants:', error);
            throw error;
        }
    }
};