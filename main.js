async function initApp() {
    // Vérifier si l'utilisateur est connecté
    const token = localStorage.getItem('auth_token');
    const userRole = localStorage.getItem('user_role');
    
    if (!token || userRole !== 'agent') {
        console.log('⚠️ Non connecté ou mauvais rôle, redirection vers login...');
        window.location.href = 'index.html';
        return;
    }
    
    console.log('✅ Utilisateur connecté:', localStorage.getItem('user_name'));
    
    // Initialiser les infos de l'agent
    APP_STATE.agentId = localStorage.getItem('agent_id') || 'agent-01';
    APP_STATE.agentName = localStorage.getItem('agent_name') || 'Agent';
    
    await loadLotteryConfig();
    
    await APIService.getTickets();
    
    await APIService.getWinningTickets();
    
    await APIService.getWinningResults();
    
    renderDraws();
    updateClock();
    
    checkSelectedDrawStatus();
    
    console.log("LOTATO PRO Ready - MongoDB Mode");

    setupInputAutoMove();
    
    document.getElementById('add-bet-btn').addEventListener('click', () => CartManager.addBet());
    
    updateGameSelector();
    
    updateSyncStatus();
}

document.addEventListener('DOMContentLoaded', initApp);
setInterval(updateClock, 1000);
setInterval(checkSelectedDrawStatus, 30000);
setInterval(updateSyncStatus, 10000);

// Service Worker (PWA)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
        .then(reg => console.log('PWA: Service Worker actif'))
        .catch(err => console.error('PWA: Erreur', err));
}

// Gestion du logout
window.logout = function() {
    if (confirm('Èske ou vwe kite sesyon an?')) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_role');
        localStorage.removeItem('user_name');
        localStorage.removeItem('agent_id');
        localStorage.removeItem('agent_name');
        window.location.href = 'index.html';
    }
};