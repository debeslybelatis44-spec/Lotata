async function initApp() {
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

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
        .then(reg => console.log('PWA: Service Worker actif'))
        .catch(err => console.error('PWA: Erreur', err));
}