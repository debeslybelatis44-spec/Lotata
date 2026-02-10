// Service API pour communiquer avec le backend
class ApiService {
    static async request(endpoint, method = 'GET', data = null, options = {}) {
        const url = API_CONFIG.BASE_URL + endpoint;
        const requestOptions = {
            method: method,
            headers: API_CONFIG.getHeaders(),
            ...options
        };

        if (data) {
            requestOptions.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url, requestOptions);
            return await API_CONFIG.handleResponse(response);
        } catch (error) {
            console.error(`Erreur API ${method} ${endpoint}:`, error);
            
            // Notification d'erreur utilisateur
            if (typeof ownerManager !== 'undefined' && ownerManager.showNotification) {
                ownerManager.showNotification(
                    error.message || 'Erreur de connexion au serveur',
                    'error'
                );
            }
            
            throw error;
        }
    }

    static async get(endpoint, options = {}) {
        return await this.request(endpoint, 'GET', null, options);
    }

    static async post(endpoint, data, options = {}) {
        return await this.request(endpoint, 'POST', data, options);
    }

    static async put(endpoint, data, options = {}) {
        return await this.request(endpoint, 'PUT', data, options);
    }

    static async patch(endpoint, data, options = {}) {
        return await this.request(endpoint, 'PATCH', data, options);
    }

    static async delete(endpoint, options = {}) {
        return await this.request(endpoint, 'DELETE', null, options);
    }

    // Méthodes spécifiques pour l'application LOTATO
    
    // Authentification
    static async verifyToken() {
        return await this.get(API_CONFIG.ENDPOINTS.AUTH.VERIFY);
    }
    
    static async logout() {
        return await this.post(API_CONFIG.ENDPOINTS.AUTH.LOGOUT);
    }
    
    // Dashboard
    static async getDashboardData() {
        return await this.get(API_CONFIG.ENDPOINTS.REPORTS.DASHBOARD);
    }
    
    static async getRealTimeStats() {
        return await this.get(API_CONFIG.ENDPOINTS.REPORTS.REALTIME);
    }

    // Utilisateurs
    static async getUsers(type = null) {
        const endpoint = type ? `${API_CONFIG.ENDPOINTS.USERS.LIST}?type=${type}` : API_CONFIG.ENDPOINTS.USERS.LIST;
        return await this.get(endpoint);
    }
    
    static async getUserById(id) {
        return await this.get(`${API_CONFIG.ENDPOINTS.USERS.LIST}/${id}`);
    }

    static async createUser(userData) {
        return await this.post(API_CONFIG.ENDPOINTS.USERS.CREATE, userData);
    }

    static async updateUser(id, userData) {
        return await this.put(API_CONFIG.ENDPOINTS.USERS.UPDATE(id), userData);
    }

    static async toggleUserBlock(id, blocked) {
        return await this.patch(API_CONFIG.ENDPOINTS.USERS.BLOCK(id), { blocked });
    }
    
    static async deleteUser(id) {
        return await this.delete(API_CONFIG.ENDPOINTS.USERS.DELETE(id));
    }
    
    static async exportUsers(format = 'json') {
        return await this.get(`${API_CONFIG.ENDPOINTS.USERS.EXPORT}?format=${format}`);
    }
    
    static async getUserStats() {
        return await this.get(API_CONFIG.ENDPOINTS.USERS.STATS);
    }
    
    static async getUserActivity(userId, limit = 50) {
        return await this.get(`${API_CONFIG.ENDPOINTS.USERS.ACTIVITY}?userId=${userId}&limit=${limit}`);
    }
    
    static async updateUserLimits(userId, limits) {
        return await this.post(API_CONFIG.ENDPOINTS.USERS.LIMITS, { userId, ...limits });
    }

    // Tirages
    static async getDraws(status = 'all') {
        return await this.get(`${API_CONFIG.ENDPOINTS.DRAWS.LIST}?status=${status}`);
    }
    
    static async getDrawById(id) {
        return await this.get(API_CONFIG.ENDPOINTS.DRAWS.GET(id));
    }

    static async publishDraw(drawData) {
        return await this.post(API_CONFIG.ENDPOINTS.DRAWS.PUBLISH, drawData);
    }
    
    static async scheduleDraw(drawData) {
        return await this.post(API_CONFIG.ENDPOINTS.DRAWS.SCHEDULE, drawData);
    }

    static async toggleDrawBlock(id, blocked) {
        return await this.patch(API_CONFIG.ENDPOINTS.DRAWS.BLOCK(id), { blocked });
    }
    
    static async deleteDraw(id) {
        return await this.delete(`${API_CONFIG.ENDPOINTS.DRAWS.LIST}/${id}`);
    }

    static async getDrawHistory(startDate, endDate) {
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        
        return await this.get(`${API_CONFIG.ENDPOINTS.DRAWS.HISTORY}?${params.toString()}`);
    }
    
    static async getDrawResults(drawId) {
        return await this.get(API_CONFIG.ENDPOINTS.DRAWS.RESULTS(drawId));
    }
    
    static async fetchExternalResults(source) {
        return await this.post(API_CONFIG.ENDPOINTS.DRAWS.FETCH, { source });
    }
    
    static async getDrawStats() {
        return await this.get(API_CONFIG.ENDPOINTS.DRAWS.STATS);
    }

    // Numéros
    static async getNumbers() {
        return await this.get(API_CONFIG.ENDPOINTS.NUMBERS.LIST);
    }
    
    static async getNumberStats(number) {
        return await this.get(`${API_CONFIG.ENDPOINTS.NUMBERS.STATS}?number=${number}`);
    }

    static async blockNumber(number) {
        return await this.post(API_CONFIG.ENDPOINTS.NUMBERS.BLOCK, { number });
    }

    static async unblockNumber(number) {
        return await this.post(API_CONFIG.ENDPOINTS.NUMBERS.UNBLOCK, { number });
    }

    static async unblockNumbers(numbers) {
        return await this.post(API_CONFIG.ENDPOINTS.NUMBERS.UNBLOCK, { numbers });
    }

    static async getNumberLimits() {
        return await this.get(API_CONFIG.ENDPOINTS.NUMBERS.LIMITS);
    }

    static async setNumberLimit(number, limit) {
        return await this.post(API_CONFIG.ENDPOINTS.NUMBERS.LIMITS, { number, limit });
    }

    static async updateNumberLimits(limits) {
        return await this.put(API_CONFIG.ENDPOINTS.NUMBERS.LIMITS, { limits });
    }
    
    static async getNumberHistory(number, days = 30) {
        return await this.get(`${API_CONFIG.ENDPOINTS.NUMBERS.HISTORY}?number=${number}&days=${days}`);
    }

    // Journal d'activité
    static async getActivityLog(filters = {}) {
        const params = new URLSearchParams();
        Object.keys(filters).forEach(key => {
            if (filters[key]) params.append(key, filters[key]);
        });
        
        return await this.get(`${API_CONFIG.ENDPOINTS.REPORTS.ACTIVITY}?${params.toString()}`);
    }
    
    static async exportActivity(format = 'csv') {
        return await this.get(`${API_CONFIG.ENDPOINTS.REPORTS.EXPORT('activity')}?format=${format}`);
    }

    // Règles
    static async getRules() {
        return await this.get(API_CONFIG.ENDPOINTS.RULES.GET);
    }
    
    static async updateRules(rules) {
        return await this.put(API_CONFIG.ENDPOINTS.RULES.UPDATE, rules);
    }
    
    static async validateRules(rules) {
        return await this.post(API_CONFIG.ENDPOINTS.RULES.VALIDATE, rules);
    }

    // Rapports
    static async getSalesReport(startDate, endDate) {
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        
        return await this.get(`${API_CONFIG.ENDPOINTS.REPORTS.SALES}?${params.toString()}`);
    }
    
    static async getFinancialReport(period = 'month') {
        return await this.get(`${API_CONFIG.ENDPOINTS.REPORTS.FINANCIAL}?period=${period}`);
    }
    
    static async getPerformanceReport() {
        return await this.get(API_CONFIG.ENDPOINTS.REPORTS.PERFORMANCE);
    }
    
    static async exportReport(type, format = 'csv') {
        return await this.get(`${API_CONFIG.ENDPOINTS.REPORTS.EXPORT(type)}?format=${format}`);
    }

    // Paramètres
    static async getSettings() {
        return await this.get(API_CONFIG.ENDPOINTS.SETTINGS.GET);
    }
    
    static async updateSettings(settings) {
        return await this.put(API_CONFIG.ENDPOINTS.SETTINGS.UPDATE, settings);
    }
    
    static async backupSettings() {
        return await this.post(API_CONFIG.ENDPOINTS.SETTINGS.BACKUP);
    }
    
    static async restoreSettings(backupId) {
        return await this.post(API_CONFIG.ENDPOINTS.SETTINGS.RESTORE, { backupId });
    }

    // Alertes
    static async getAlerts() {
        return await this.get(API_CONFIG.ENDPOINTS.ALERTS.LIST);
    }
    
    static async createAlert(alertData) {
        return await this.post(API_CONFIG.ENDPOINTS.ALERTS.CREATE, alertData);
    }
    
    static async updateAlert(id, alertData) {
        return await this.put(API_CONFIG.ENDPOINTS.ALERTS.UPDATE(id), alertData);
    }
    
    static async deleteAlert(id) {
        return await this.delete(API_CONFIG.ENDPOINTS.ALERTS.DELETE(id));
    }
    
    // Tickets
    static async getTickets(agentId) {
        const endpoint = agentId ? `${API_CONFIG.ENDPOINTS.TICKETS.LIST}?agentId=${agentId}` : API_CONFIG.ENDPOINTS.TICKETS.LIST;
        return await this.get(endpoint);
    }
    
    static async saveTicket(ticketData) {
        return await this.post(API_CONFIG.ENDPOINTS.TICKETS.SAVE, ticketData);
    }
    
    static async checkWinners(agentId) {
        const endpoint = agentId ? `${API_CONFIG.ENDPOINTS.TICKETS.CHECK_WINNERS}?agentId=${agentId}` : API_CONFIG.ENDPOINTS.TICKETS.CHECK_WINNERS;
        return await this.post(endpoint);
    }
    
    static async deleteTicket(ticketId) {
        return await this.delete(API_CONFIG.ENDPOINTS.TICKETS.DELETE(ticketId));
    }
    
    // Gagnants
    static async getWinners(agentId) {
        const endpoint = agentId ? `${API_CONFIG.ENDPOINTS.WINNERS.LIST}?agentId=${agentId}` : API_CONFIG.ENDPOINTS.WINNERS.LIST;
        return await this.get(endpoint);
    }
    
    static async getWinnersResults() {
        return await this.get(API_CONFIG.ENDPOINTS.WINNERS.RESULTS);
    }
    
    // Configuration loterie
    static async getLotteryConfig() {
        return await this.get(API_CONFIG.ENDPOINTS.LOTTERY_CONFIG);
    }
    
    static async updateLotteryConfig(configData) {
        return await this.post(API_CONFIG.ENDPOINTS.LOTTERY_CONFIG, configData);
    }
    
    // Numéros bloqués
    static async getBlockedNumbers() {
        return await this.get(API_CONFIG.ENDPOINTS.BLOCKED_NUMBERS);
    }
    
    // Superviseurs
    static async getSupervisors() {
        return await this.get(API_CONFIG.ENDPOINTS.SUPERVISORS);
    }
    
    // Agents
    static async getAgents() {
        return await this.get(API_CONFIG.ENDPOINTS.AGENTS);
    }
    
    // Méthodes utilitaires
    static async uploadFile(endpoint, file, fieldName = 'file') {
        const formData = new FormData();
        formData.append(fieldName, file);
        
        const url = API_CONFIG.BASE_URL + endpoint;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: formData
        });
        
        return await API_CONFIG.handleResponse(response);
    }
    
    static async downloadFile(endpoint, filename) {
        const url = API_CONFIG.BASE_URL + endpoint;
        const response = await fetch(url, {
            method: 'GET',
            headers: API_CONFIG.getHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`Erreur de téléchargement: ${response.status}`);
        }
        
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
    }
}