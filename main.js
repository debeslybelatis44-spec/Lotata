async function initApp() {
    // Vérifier si l'utilisateur est connecté
    const token = localStorage.getItem('auth_token');
    const agentId = localStorage.getItem('agent_id');
    const agentName = localStorage.getItem('agent_name');

    if (!token || !agentId) {
        // Rediriger vers la page de connexion
        window.location.href = 'index.html';
        return;
    }

    // Mettre à jour APP_STATE avec les valeurs du localStorage
    APP_STATE.agentId = agentId;
    APP_STATE.agentName = agentName;

    await loadLotteryConfig();
    await loadDrawsFromServer();
    await loadBlockedNumbers();
    await loadNumberLimits(); // NOUVEAU : charger les limites
    await APIService.getTickets();
    await APIService.getWinningTickets();
    await APIService.getWinningResults();
    
    renderDraws();
    updateClock();
    checkSelectedDrawStatus();
    setupInputAutoMove();
    
    document.getElementById('add-bet-btn').addEventListener('click', () => CartManager.addBet());
    updateGameSelector();
    updateSyncStatus();
    
    console.log("LOTATO PRO Ready - Authentification OK");
}

// NOUVEAU : charger les limites de mise pour chaque tirage
async function loadNumberLimits() {
    try {
        const draws = APP_STATE.draws || CONFIG.DRAWS;
        APP_STATE.numberLimits = {}; // dictionnaire : drawId -> Map(numéro -> limite)
        for (const draw of draws) {
            // Note : cette route doit être ajoutée dans server.js (ownerRouter) pour fonctionner
            const res = await fetch(`${API_CONFIG.BASE_URL}/owner/number-limit?drawId=${draw.id}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });
            if (res.ok) {
                const data = await res.json();
                APP_STATE.numberLimits[draw.id] = new Map(data.limits.map(l => [l.number, l.limit_amount]));
            } else {
                APP_STATE.numberLimits[draw.id] = new Map();
            }
        }
        console.log('✅ Limites chargées:', APP_STATE.numberLimits);
    } catch (error) {
        console.error('❌ Erreur chargement limites:', error);
        APP_STATE.numberLimits = {};
    }
}

document.addEventListener('DOMContentLoaded', initApp);
setInterval(updateClock, 1000);
setInterval(checkSelectedDrawStatus, 30000);
setInterval(updateSyncStatus, 10000);

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
        .then(reg => console.log('PWA: Service Worker actif'))
        .catch(err => console.error('PWA: Erreur', err));
}