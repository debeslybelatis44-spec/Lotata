// Fonction pour récupérer le token du localStorage
function getAuthToken() {
    return localStorage.getItem('auth_token');
}

// Fonction pour ajouter les headers d'authentification
function getAuthHeaders() {
    const token = getAuthToken();
    const headers = {
        'Content-Type': 'application/json'
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
}

const APIService = {
    async saveTicket(ticket) {
        try {
            console.log('📤 Sauvegarde ticket vers API...');
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SAVE_TICKET}`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    ...ticket,
                    agentId: APP_STATE.agentId,
                    agentName: APP_STATE.agentName,
                    date: new Date().toISOString()
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Erreur sauvegarde ticket:', response.status, errorText);
                throw new Error(`Erreur serveur: ${response.status} - ${errorText}`);
            }
            
            const data = await response.json();
            console.log('✅ Ticket sauvegardé:', data);
            return data;
        } catch (error) {
            console.error('❌ Erreur sauvegarde ticket:', error);
            throw error;
        }
    },

    async getTickets() {
        try {
            console.log('📋 Récupération tickets depuis API...');
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_TICKETS}?agentId=${APP_STATE.agentId}`, {
                headers: getAuthHeaders()
            });
            
            if (!response.ok) {
                console.error('❌ Erreur récupération tickets:', response.status);
                throw new Error('Erreur réseau');
            }
            
            const data = await response.json();
            console.log(`✅ ${data.tickets?.length || 0} tickets récupérés`);
            APP_STATE.ticketsHistory = data.tickets || [];
            return data;
        } catch (error) {
            console.error('❌ Erreur récupération tickets:', error);
            return { tickets: [] };
        }
    },

    async getReports() {
        try {
            console.log('📊 Récupération rapports depuis API...');
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_REPORTS}?agentId=${APP_STATE.agentId}`, {
                headers: getAuthHeaders()
            });
            
            if (!response.ok) throw new Error('Erreur réseau');
            
            const data = await response.json();
            console.log('✅ Rapports récupérés:', data);
            return data;
        } catch (error) {
            console.error('❌ Erreur récupération rapports:', error);
            return { totalTickets: 0, totalBets: 0, totalWins: 0, totalLoss: 0, balance: 0 };
        }
    },

    async getDrawReport(drawId) {
        try {
            console.log(`📈 Récupération rapport tirage ${drawId}...`);
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_DRAW_REPORT}?agentId=${APP_STATE.agentId}&drawId=${drawId}`, {
                headers: getAuthHeaders()
            });
            
            if (!response.ok) throw new Error('Erreur réseau');
            
            const data = await response.json();
            console.log('✅ Rapport tirage récupéré:', data);
            return data;
        } catch (error) {
            console.error('❌ Erreur récupération rapport tirage:', error);
            return { totalTickets: 0, totalBets: 0, totalWins: 0, totalLoss: 0, balance: 0 };
        }
    },

    async getWinningTickets() {
        try {
            console.log('🏆 Récupération tickets gagnants...');
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_WINNERS}?agentId=${APP_STATE.agentId}`, {
                headers: getAuthHeaders()
            });
            
            if (!response.ok) throw new Error('Erreur réseau');
            
            const data = await response.json();
            console.log(`✅ ${data.winners?.length || 0} tickets gagnants récupérés`);
            APP_STATE.winningTickets = data.winners || [];
            return data;
        } catch (error) {
            console.error('❌ Erreur récupération gagnants:', error);
            return { winners: [] };
        }
    },

    async getWinningResults() {
        try {
            console.log('🎰 Récupération résultats gagnants...');
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_WINNING_RESULTS}?agentId=${APP_STATE.agentId}`, {
                headers: getAuthHeaders()
            });
            
            if (!response.ok) throw new Error('Erreur réseau');
            
            const data = await response.json();
            console.log(`✅ ${data.results?.length || 0} résultats récupérés`);
            APP_STATE.winningResults = data.results || [];
            return data;
        } catch (error) {
            console.error('❌ Erreur récupération résultats gagnants:', error);
            return { results: [] };
        }
    },

    async deleteTicket(ticketId) {
        try {
            console.log(`🗑️ Suppression ticket ${ticketId}...`);
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.DELETE_TICKET}/${ticketId}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Erreur suppression ticket:', response.status, errorText);
                throw new Error(`Erreur serveur: ${response.status} - ${errorText}`);
            }
            
            const data = await response.json();
            console.log('✅ Ticket supprimé:', data);
            return data;
        } catch (error) {
            console.error('❌ Erreur suppression ticket:', error);
            throw error;
        }
    },

    async getLotteryConfig() {
        try {
            console.log('⚙️ Récupération configuration loterie...');
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_LOTTERY_CONFIG}`, {
                headers: getAuthHeaders()
            });
            
            if (!response.ok) throw new Error('Erreur réseau');
            
            const data = await response.json();
            console.log('✅ Configuration récupérée:', data);
            return data;
        } catch (error) {
            console.error('❌ Erreur récupération configuration:', error);
            return null;
        }
    },

    async checkWinningTickets() {
        try {
            console.log('🔍 Vérification tickets gagnants...');
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.CHECK_WINNING_TICKETS}?agentId=${APP_STATE.agentId}`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            
            if (!response.ok) throw new Error('Erreur réseau');
            
            const data = await response.json();
            console.log(`✅ ${data.count || 0} tickets gagnants vérifiés`);
            return data;
        } catch (error) {
            console.error('❌ Erreur vérification tickets gagnants:', error);
            throw error;
        }
    },

    // Nouvelle fonction pour vérifier le statut d'authentification
    async checkAuth() {
        try {
            const token = getAuthToken();
            if (!token) {
                console.log('⚠️ Aucun token trouvé');
                return { valid: false };
            }
            
            console.log('🔍 Vérification token...');
            const response = await fetch(`${API_CONFIG.BASE_URL}/auth/verify`, {
                headers: getAuthHeaders()
            });
            
            if (!response.ok) {
                console.log('❌ Token invalide');
                return { valid: false };
            }
            
            const data = await response.json();
            console.log('✅ Token valide:', data);
            return data;
        } catch (error) {
            console.error('❌ Erreur vérification auth:', error);
            return { valid: false };
        }
    }
};

// Fonctions globales pour l'interface
window.APIService = APIService;
window.getAuthToken = getAuthToken;
window.getAuthHeaders = getAuthHeaders;