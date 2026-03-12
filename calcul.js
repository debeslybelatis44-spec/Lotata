// calcul.js (version client‑side uniquement)
(function() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    async function init() {
        if (document.getElementById('sales-period')) return;

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

        const firstStatsGrid = document.querySelector('.stats-grid');
        if (firstStatsGrid) {
            firstStatsGrid.parentNode.insertBefore(container, firstStatsGrid.nextSibling);
        } else {
            const dashboardTab = document.getElementById('tab-dashboard');
            if (dashboardTab) dashboardTab.appendChild(container);
            else return;
        }

        await loadTicketsAndCompute();
    }

    async function loadTicketsAndCompute() {
        const token = localStorage.getItem('auth_token');
        if (!token) return;

        try {
            let allTickets = [];
            let page = 0;
            const limit = 100;
            let hasMore = true;

            while (hasMore) {
                const url = `/api/owner/tickets?period=today&page=${page}&limit=${limit}`;
                const res = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) throw new Error('Erreur réseau');
                const data = await res.json();
                allTickets = allTickets.concat(data.tickets);
                hasMore = data.hasMore;
                page++;
            }

            const startHour = 7, endHour = 21, endMinute = 30;
            let sales = 0, wins = 0;

            allTickets.forEach(t => {
                const date = new Date(t.date);
                const hour = date.getHours();
                const minute = date.getMinutes();
                if (hour < startHour || hour > endHour) return;
                if (hour === endHour && minute > endMinute) return;

                sales += parseFloat(t.total_amount) || 0;
                wins += parseFloat(t.win_amount) || 0;
            });

            const balance = sales - wins;

            document.getElementById('sales-period').innerText = `${sales.toLocaleString()} G`;
            document.getElementById('wins-period').innerText = `${wins.toLocaleString()} G`;
            document.getElementById('balance-period').innerText = `${balance.toLocaleString()} G`;

        } catch (error) {
            console.error('Erreur calcul période :', error);
            document.getElementById('sales-period').innerText = 'Erreur';
            document.getElementById('wins-period').innerText = 'Erreur';
            document.getElementById('balance-period').innerText = 'Erreur';
        }
    }
})();