// calcul.js - Version robuste, ne bloque pas l'affichage
(function() {
    // Attendre que le DOM soit chargé, mais sans bloquer
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', safeInit);
    } else {
        safeInit();
    }

    function safeInit() {
        try {
            init();
        } catch (e) {
            console.error('Erreur dans calcul.js (initialisation) :', e);
            // On ne relance pas l'erreur pour ne pas bloquer la page
        }
    }

    async function init() {
        // Vérifier si les cartes existent déjà (pour éviter les doublons)
        if (document.getElementById('sales-period')) return;

        // Créer le conteneur des nouvelles cartes
        const container = document.createElement('div');
        container.className = 'stats-grid';
        container.style.marginTop = '20px';
        container.innerHTML = `
            <div class="stat-card">
                <div style="font-size:2rem;" id="sales-period">0 G</div>
                <div>Ventes (7h - 21h30)</div>
            </div>
            <div class="stat-card">
                <div style="font-size:2rem;" id="wins-period">0 G</div>
                <div>Gains (même période)</div>
            </div>
            <div class="stat-card">
                <div style="font-size:2rem;" id="balance-period">0 G</div>
                <div>Solde (Ventes - Gains)</div>
            </div>
        `;

        // Trouver un endroit pour insérer les cartes
        const firstStatsGrid = document.querySelector('.stats-grid');
        if (firstStatsGrid) {
            firstStatsGrid.parentNode.insertBefore(container, firstStatsGrid.nextSibling);
        } else {
            // Si on ne trouve pas la grille, on ajoute dans l'onglet dashboard
            const dashboardTab = document.getElementById('tab-dashboard');
            if (dashboardTab) {
                dashboardTab.appendChild(container);
            } else {
                console.warn("Impossible de trouver l'emplacement pour les cartes. Annulation.");
                return;
            }
        }

        // Charger les données
        await loadTicketsAndCompute();
    }

    async function loadTicketsAndCompute() {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            console.warn('Aucun token, impossible de charger les données');
            return;
        }

        try {
            let allTickets = [];
            let page = 0;
            const limit = 100; // Vous pouvez ajuster
            let hasMore = true;

            while (hasMore) {
                const url = `/api/owner/tickets?period=today&page=${page}&limit=${limit}`;
                const res = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) {
                    throw new Error(`Erreur HTTP ${res.status}`);
                }
                const data = await res.json();
                allTickets = allTickets.concat(data.tickets || []);
                hasMore = data.hasMore;
                page++;
            }

            // Filtrer les tickets entre 7h et 21h30 (heure locale du navigateur)
            const startHour = 7;
            const endHour = 21;
            const endMinute = 30;

            let sales = 0;
            let wins = 0;

            allTickets.forEach(ticket => {
                const date = new Date(ticket.date);
                const hour = date.getHours();
                const minute = date.getMinutes();

                if (hour < startHour || hour > endHour) return;
                if (hour === endHour && minute > endMinute) return;

                sales += parseFloat(ticket.total_amount) || 0;
                wins += parseFloat(ticket.win_amount) || 0;
            });

            const balance = sales - wins;

            // Mettre à jour l'affichage
            const salesEl = document.getElementById('sales-period');
            const winsEl = document.getElementById('wins-period');
            const balanceEl = document.getElementById('balance-period');

            if (salesEl) salesEl.innerText = `${sales.toLocaleString()} G`;
            if (winsEl) winsEl.innerText = `${wins.toLocaleString()} G`;
            if (balanceEl) balanceEl.innerText = `${balance.toLocaleString()} G`;

        } catch (error) {
            console.error('Erreur lors du calcul des indicateurs période :', error);
            // Afficher un message d'erreur dans les cartes
            const salesEl = document.getElementById('sales-period');
            const winsEl = document.getElementById('wins-period');
            const balanceEl = document.getElementById('balance-period');
            if (salesEl) salesEl.innerText = 'Erreur';
            if (winsEl) winsEl.innerText = 'Erreur';
            if (balanceEl) balanceEl.innerText = 'Erreur';
        }
    }
})();