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
    // Charger les tirages et les numéros bloqués depuis le serveur
    await loadDrawsFromServer();
    await loadBlockedNumbers();
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

    // ✅ Afficher le nom de l'agent connecté
    document.getElementById('agent-name').textContent = agentName;
    
    console.log("LOTATO PRO Ready - Authentification OK");
}

// Charger les tirages depuis le serveur
async function loadDrawsFromServer() {
    try {
        const response = await fetch(`${API_CONFIG.BASE_URL}/draws`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        });
        if (!response.ok) throw new Error('Erreur chargement tirages');
        const data = await response.json();
        APP_STATE.draws = data.draws;
    } catch (error) {
        console.error('❌ Erreur chargement tirages, utilisation des tirages par défaut:', error);
        // Fallback : utiliser CONFIG.DRAWS avec active = true par défaut
        APP_STATE.draws = CONFIG.DRAWS.map(d => ({ ...d, active: true }));
    }
}

// Charger les numéros bloqués (global et par tirage)
async function loadBlockedNumbers() {
    try {
        // Numéros globaux
        const globalRes = await fetch(`${API_CONFIG.BASE_URL}/blocked-numbers/global`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        });
        if (globalRes.ok) {
            const globalData = await globalRes.json();
            APP_STATE.globalBlockedNumbers = globalData.blockedNumbers || [];
        } else {
            APP_STATE.globalBlockedNumbers = [];
        }

        // Pour chaque tirage, charger ses numéros bloqués
        const draws = APP_STATE.draws || CONFIG.DRAWS;
        APP_STATE.drawBlockedNumbers = {};
        for (const draw of draws) {
            try {
                const drawRes = await fetch(`${API_CONFIG.BASE_URL}/blocked-numbers/draw/${draw.id}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
                });
                if (drawRes.ok) {
                    const drawData = await drawRes.json();
                    APP_STATE.drawBlockedNumbers[draw.id] = drawData.blockedNumbers || [];
                } else {
                    APP_STATE.drawBlockedNumbers[draw.id] = [];
                }
            } catch (e) {
                APP_STATE.drawBlockedNumbers[draw.id] = [];
            }
        }
    } catch (error) {
        console.error('❌ Erreur chargement numéros bloqués:', error);
        APP_STATE.globalBlockedNumbers = [];
        APP_STATE.drawBlockedNumbers = {};
    }
}

// ========== FONCTION DE DÉCONNEXION ==========
async function logout() {
    // Demander confirmation (optionnel)
    if (!confirm('Èske ou sèten ou vle dekonekte?')) return;

    const token = localStorage.getItem('auth_token');
    if (token) {
        try {
            // Informer le serveur de la déconnexion (optionnel)
            await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.LOGOUT}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
        } catch (error) {
            console.error('Erreur lors de la déconnexion côté serveur :', error);
        }
    }

    // Nettoyer le stockage local
    localStorage.removeItem('auth_token');
    localStorage.removeItem('agent_id');
    localStorage.removeItem('agent_name');

    // Rediriger vers la page de connexion
    window.location.href = 'index.html';
}

// Rendre la fonction accessible depuis le HTML
window.logout = logout;

// ========== CODE POUR L'INSTALLATION PWA ==========
let deferredPrompt;

// Intercepter l'événement beforeinstallprompt
window.addEventListener('beforeinstallprompt', (e) => {
    // Empêcher l'affichage automatique de la bannière
    e.preventDefault();
    // Stocker l'événement pour l'utiliser plus tard
    deferredPrompt = e;
    // Afficher le message d'invitation après un court délai (pour laisser la page se charger)
    setTimeout(showInstallPromotion, 2000);
});

// Fonction pour afficher le message d'installation
function showInstallPromotion() {
    // Éviter de montrer si déjà installé ou si le message existe déjà
    if (document.getElementById('install-message')) return;

    // Créer l'élément du message
    const installMessage = document.createElement('div');
    installMessage.id = 'install-message';
    installMessage.innerHTML = `
        <div style="position: fixed; bottom: 20px; left: 20px; right: 20px; background: #fbbf24; color: #000; padding: 15px 20px; border-radius: 50px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 10px 25px rgba(0,0,0,0.3); z-index: 9999; font-family: 'Plus Jakarta Sans', sans-serif;">
            <span style="font-weight: 700; font-size: 14px;">📱 Installe LOTATO PRO sur ton écran d'accueil !</span>
            <div style="display: flex; gap: 10px;">
                <button id="install-btn" style="background: #000; color: #fff; border: none; padding: 8px 20px; border-radius: 30px; font-weight: bold; cursor: pointer; font-size: 14px;">Installer</button>
                <span id="close-install" style="cursor:pointer; font-size: 18px; line-height: 1;">✕</span>
            </div>
        </div>
    `;
    document.body.appendChild(installMessage);

    // Gérer le clic sur le bouton d'installation
    document.getElementById('install-btn').addEventListener('click', async () => {
        if (!deferredPrompt) {
            installMessage.remove();
            return;
        }
        // Afficher la boîte de dialogue d'installation native
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`Résultat installation : ${outcome}`);
        // Réinitialiser la variable
        deferredPrompt = null;
        // Cacher le message
        installMessage.remove();
    });

    // Gérer la fermeture manuelle
    document.getElementById('close-install').addEventListener('click', () => {
        installMessage.remove();
    });
}

// Cacher le message si l'application est déjà installée
window.addEventListener('appinstalled', () => {
    console.log('Application installée avec succès');
    const msg = document.getElementById('install-message');
    if (msg) msg.remove();
});

// ========== FIN CODE PWA ==========

document.addEventListener('DOMContentLoaded', initApp);
setInterval(updateClock, 1000);
setInterval(checkSelectedDrawStatus, 30000);
setInterval(updateSyncStatus, 10000);

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
        .then(reg => console.log('PWA: Service Worker actif'))
        .catch(err => console.error('PWA: Erreur', err));
}