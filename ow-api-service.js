// Service API pour communiquer avec le backend - COMPLET
class ApiService {
    
    // Requête générique
    static async request(endpoint, method = 'GET', data = null) {
        try {
            return await API_CONFIG.request(endpoint, method, data);
        } catch (error) {
            console.error(`Erreur API ${method} ${endpoint}:`, error);
            
            // Si erreur 401, essayer de rafraîchir le token
            if (error.message.includes('Session expirée') || error.message.includes('401')) {
                const refreshed = await API_CONFIG.refreshToken();
                if (refreshed) {
                    // Réessayer la requête originale
                    return await API_CONFIG.request(endpoint, method, data);
                }
            }
            
            // Propager l'erreur
            throw error;
        }
    }
    
    // Méthodes HTTP simplifiées
    static async get(endpoint, params = null) {
        return await API_CONFIG.get(endpoint, params);
    }
    
    static async post(endpoint, data) {
        return await API_CONFIG.post(endpoint, data);
    }
    
    static async put(endpoint, data) {
        return await API_CONFIG.put(endpoint, data);
    }
    
    static async patch(endpoint, data) {
        return await API_CONFIG.patch(endpoint, data);
    }
    
    static async delete(endpoint) {
        return await API_CONFIG.delete(endpoint);
    }
    
    // === AUTHENTIFICATION ===
    static async login(credentials) {
        const response = await this.post(API_CONFIG.ENDPOINTS.AUTH.LOGIN, credentials);
        if (response.token) {
            localStorage.setItem('auth_token', response.token);
            if (response.refresh_token) {
                localStorage.setItem('refresh_token', response.refresh_token);
            }
        }
        return response;
    }
    
    static async verifyToken() {
        return await this.get(API_CONFIG.ENDPOINTS.AUTH.VERIFY);
    }
    
    static async logout() {
        try {
            await this.post(API_CONFIG.ENDPOINTS.AUTH.LOGOUT);
        } finally {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('refresh_token');
        }
    }
    
    // === DASHBOARD ===
    static async getDashboardData() {
        return await this.get(API_CONFIG.ENDPOINTS.REPORTS.DASHBOARD);
    }
    
    static async getRealTimeStats() {
        return await this.get(API_CONFIG.ENDPOINTS.REPORTS.DASHBOARD + '/realtime');
    }
    
    // === UTILISATEURS ===
    static async getUsers() {
        return await this.get(API_CONFIG.ENDPOINTS.USERS.LIST);
    }
    
    static async getUserById(id) {
        return await this.get(API_CONFIG.ENDPOINTS.USERS.GET(id));
    }
    
    static async createUser(userData) {
        return await this.post(API_CONFIG.ENDPOINTS.USERS.CREATE, userData);
    }
    
    static async updateUser(id, userData) {
        return await this.put(API_CONFIG.ENDPOINTS.USERS.UPDATE(id), userData);
    }
    
    static async deleteUser(id) {
        return await this.delete(API_CONFIG.ENDPOINTS.USERS.DELETE(id));
    }
    
    static async toggleUserBlock(id, blocked) {
        return await this.patch(API_CONFIG.ENDPOINTS.USERS.BLOCK(id), { blocked });
    }
    
    static async updateUserLimits(userId, limits) {
        return await this.put(API_CONFIG.ENDPOINTS.USERS.LIMITS(userId), limits);
    }
    
    static async getUserActivity(userId, limit = 50) {
        return await this.get(API_CONFIG.ENDPOINTS.USERS.ACTIVITY(userId), { limit });
    }
    
    static async getUserStats() {
        return await this.get(API_CONFIG.ENDPOINTS.USERS.STATS);
    }
    
    static async exportUsers(format = 'json') {
        return await this.get(API_CONFIG.ENDPOINTS.USERS.EXPORT, { format });
    }
    
    // === TIRAGES ===
    static async getDraws(status = 'all') {
        return await this.get(API_CONFIG.ENDPOINTS.DRAWS.LIST, { status });
    }
    
    static async getDrawById(id) {
        return await this.get(API_CONFIG.ENDPOINTS.DRAWS.GET(id));
    }
    
    static async createDraw(drawData) {
        return await this.post(API_CONFIG.ENDPOINTS.DRAWS.CREATE, drawData);
    }
    
    static async updateDraw(id, drawData) {
        return await this.put(API_CONFIG.ENDPOINTS.DRAWS.UPDATE(id), drawData);
    }
    
    static async deleteDraw(id) {
        return await this.delete(API_CONFIG.ENDPOINTS.DRAWS.DELETE(id));
    }
    
    static async publishDraw(drawData) {
        return await this.post(API_CONFIG.ENDPOINTS.DRAWS.PUBLISH, drawData);
    }
    
    static async scheduleDraw(scheduleData) {
        return await this.post(API_CONFIG.ENDPOINTS.DRAWS.SCHEDULE, scheduleData);
    }
    
    static async toggleDrawBlock(id, blocked) {
        return await this.patch(API_CONFIG.ENDPOINTS.DRAWS.BLOCK(id), { blocked });
    }
    
    static async forcePublishDraw(id) {
        return await this.post(API_CONFIG.ENDPOINTS.DRAWS.FORCE_PUBLISH(id));
    }
    
    static async getDrawResults(id) {
        return await this.get(API_CONFIG.ENDPOINTS.DRAWS.RESULTS(id));
    }
    
    static async getDrawHistory(startDate, endDate) {
        return await this.get(API_CONFIG.ENDPOINTS.DRAWS.HISTORY, { startDate, endDate });
    }
    
    static async getDrawStats() {
        return await this.get(API_CONFIG.ENDPOINTS.DRAWS.STATS);
    }
    
    static async fetchExternalResults(source) {
        return await this.post(API_CONFIG.ENDPOINTS.DRAWS.FETCH_EXTERNAL, { source });
    }
    
    // === NUMÉROS ===
    static async getNumbers() {
        return await this.get(API_CONFIG.ENDPOINTS.NUMBERS.LIST);
    }
    
    static async blockNumber(number) {
        return await this.post(API_CONFIG.ENDPOINTS.NUMBERS.BLOCK, { number });
    }
    
    static async unblockNumber(number) {
        return await this.post(API_CONFIG.ENDPOINTS.NUMBERS.UNBLOCK, { number });
    }
    
    static async unblockNumbers(numbers) {
        return await this.post(API_CONFIG.ENDPOINTS.NUMBERS.UNBLOCK_MULTIPLE, { numbers });
    }
    
    static async getNumberLimits() {
        return await this.get(API_CONFIG.ENDPOINTS.NUMBERS.LIMITS);
    }
    
    static async setNumberLimit(number, limit) {
        return await this.post(API_CONFIG.ENDPOINTS.NUMBERS.LIMITS, { number, limit });
    }
    
    static async updateNumberLimits(limits) {
        return await this.post(API_CONFIG.ENDPOINTS.NUMBERS.LIMIT_UPDATE, { limits });
    }
    
    static async getNumberStats() {
        return await this.get(API_CONFIG.ENDPOINTS.NUMBERS.STATS);
    }
    
    static async getNumberHistory(number, days = 30) {
        return await this.get(API_CONFIG.ENDPOINTS.NUMBERS.HISTORY(number), { days });
    }
    
    static async configureAutoBlock(config) {
        return await this.post(API_CONFIG.ENDPOINTS.NUMBERS.AUTO_BLOCK_CONFIG, config);
    }
    
    // === RÈGLES ===
    static async getRules() {
        return await this.get(API_CONFIG.ENDPOINTS.RULES.GET);
    }
    
    static async updateRules(rules) {
        return await this.put(API_CONFIG.ENDPOINTS.RULES.UPDATE, rules);
    }
    
    static async resetRules() {
        return await this.post(API_CONFIG.ENDPOINTS.RULES.RESET);
    }
    
    static async validateRules(rules) {
        return await this.post(API_CONFIG.ENDPOINTS.RULES.VALIDATE, rules);
    }
    
    // === RAPPORTS ===
    static async getSalesReport(startDate, endDate) {
        return await this.get(API_CONFIG.ENDPOINTS.REPORTS.SALES, { startDate, endDate });
    }
    
    static async getFinancialReport(period = 'month') {
        return await this.get(API_CONFIG.ENDPOINTS.REPORTS.FINANCIAL, { period });
    }
    
    static async getPerformanceReport() {
        return await this.get(API_CONFIG.ENDPOINTS.REPORTS.PERFORMANCE);
    }
    
    static async getActivityLog(filters = {}) {
        return await this.get(API_CONFIG.ENDPOINTS.REPORTS.ACTIVITY, filters);
    }
    
    static async exportReport(type, format = 'csv') {
        return await this.get(API_CONFIG.ENDPOINTS.REPORTS.EXPORT(type), { format });
    }
    
    // === ALERTES ===
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
    
    static async markAlertAsRead(id) {
        return await this.patch(API_CONFIG.ENDPOINTS.ALERTS.MARK_READ(id));
    }
    
    // === PARAMÈTRES ===
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
    
    // === LIMITES ===
    static async getUserLimits() {
        return await this.get(API_CONFIG.ENDPOINTS.LIMITS.USER);
    }
    
    static async getZoneLimits() {
        return await this.get(API_CONFIG.ENDPOINTS.LIMITS.ZONE);
    }
    
    static async getTemporaryBlocks() {
        return await this.get(API_CONFIG.ENDPOINTS.LIMITS.TEMPORARY);
    }
    
    // === UTILITAIRES ===
    static async uploadFile(endpoint, file, fieldName = 'file') {
        return await API_CONFIG.upload(endpoint, file, fieldName);
    }
    
    static async downloadFile(endpoint, filename) {
        return await API_CONFIG.download(endpoint, filename);
    }
    
    static async testConnection() {
        return await API_CONFIG.testConnection();
    }
    
    // === MÉTHODES DE TRANSFERT ===
    static async transferAgent(agentId, supervisorId) {
        return await this.post(`/agents/${agentId}/transfer`, { supervisorId });
    }
    
    // === STATISTIQUES GÉNÉRALES ===
    static async getSystemStats() {
        return await this.get('/stats/system');
    }
    
    static async getDailyStats(date = null) {
        return await this.get('/stats/daily', date ? { date } : null);
    }
}

// Exporter pour usage global
window.ApiService = ApiService;