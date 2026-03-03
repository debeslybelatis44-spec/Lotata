// resultsManager.js - Version autonome
(function() {
    // Éviter double initialisation
    if (window.resultsManagerReady) return;
    window.resultsManagerReady = true;

    function init() {
        // 1. Créer l'écran des résultats s'il n'existe pas
        if (!document.getElementById('results-screen')) {
            const main = document.querySelector('.content-area');
            if (!main) return; // Sortir si la structure n'est pas trouvée

            const screen = document.createElement('section');
            screen.id = 'results-screen';
            screen.className = 'screen';
            screen.innerHTML = `
                <div style="padding: 20px;">
                    <h2 class="section-title">Résultats des tirages</h2>
                    <div class="results-filter">
                        <button class="chip active" data-filter="all">Tous</button>
                        <button class="chip" data-filter="today">Aujourd'hui</button>
                        <button class="chip" data-filter="yesterday">Hier</button>
                        <button class="chip" data-filter="week">7 derniers jours</button>
                    </div>
                    <div id="results-container" class="results-list"></div>
                </div>
            `;
            main.appendChild(screen);
        }

        // 2. Ajouter l'onglet dans la navigation s'il n'existe pas
        const nav = document.querySelector('.nav-bar');
        if (nav && !document.querySelector('.nav-item[data-tab="results"]')) {
            const tab = document.createElement('a');
            tab.href = '#';
            tab.className = 'nav-item';
            tab.setAttribute('data-tab', 'results');
            tab.innerHTML = '<i class="fas fa-calendar-alt"></i><span>Résultats</span>';
            nav.appendChild(tab);

            // Gestionnaire de clic pour activer l'onglet
            tab.addEventListener('click', function(e) {
                e.preventDefault();
                // Désactiver tous les écrans et onglets
                document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
                document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
                // Activer l'écran results et cet onglet
                document.getElementById('results-screen').classList.add('active');
                tab.classList.add('active');
                // Charger les résultats
                loadResults();
            });
        }

        // 3. Injecter les styles (optionnel)
        if (!document.getElementById('results-styles')) {
            const style = document.createElement('style');
            style.id = 'results-styles';
            style.textContent = `
                .results-filter { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
                .results-list { display: flex; flex-direction: column; gap: 20px; padding-bottom: 80px; }
                .result-day-group { background: var(--surface); border-radius: 20px; padding: 15px; border: 1px solid var(--glass-border); }
                .result-day-group h3 { margin-bottom: 15px; color: var(--secondary); font-size: 1.2rem; }
                .result-draw-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 10px; border-bottom: 1px solid rgba(255,255,255,0.1); }
                .result-draw-row:last-child { border-bottom: none; }
                .draw-info { display: flex; flex-direction: column; }
                .draw-name { font-weight: 600; font-size: 1rem; }
                .draw-time { font-size: 0.8rem; color: var(--text-dim); }
                .result-numbers { font-family: 'Courier New', monospace; font-weight: bold; font-size: 1.2rem; background: rgba(0,212,255,0.1); padding: 6px 12px; border-radius: 20px; color: var(--secondary); }
                .no-result { color: var(--text-dim); font-style: italic; }
            `;
            document.head.appendChild(style);
        }

        // 4. Gestionnaire pour les boutons de filtre
        document.querySelectorAll('.results-filter .chip').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.results-filter .chip').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                loadResults(this.dataset.filter);
            });
        });
    }

    // Fonction de chargement des résultats
    async function loadResults(filter = 'all') {
        const container = document.getElementById('results-container');
        if (!container) return;

        let results = [];
        try {
            // Essayer d'utiliser APIService s'il existe, sinon fetch direct
            if (window.APIService && typeof APIService.getDrawResults === 'function') {
                const data = await APIService.getDrawResults(7);
                results = data.results || [];
            } else {
                const token = localStorage.getItem('auth_token');
                const response = await fetch('https://lotata-islp.onrender.com/api/draws/results?days=7', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    results = data.results || [];
                } else {
                    throw new Error('Erreur réseau');
                }
            }
        } catch (error) {
            console.error('Erreur chargement résultats:', error);
            results = [];
        }

        // Filtrer selon la période
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        const weekAgo = new Date(Date.now() - 7 * 86400000);

        let filtered = results;
        if (filter === 'today') {
            filtered = results.filter(r => new Date(r.date).toDateString() === today);
        } else if (filter === 'yesterday') {
            filtered = results.filter(r => new Date(r.date).toDateString() === yesterday);
        } else if (filter === 'week') {
            filtered = results.filter(r => new Date(r.date) >= weekAgo);
        }

        // Grouper par jour
        const grouped = {};
        filtered.forEach(result => {
            const day = new Date(result.date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            if (!grouped[day]) grouped[day] = [];
            grouped[day].push(result);
        });

        const sortedDays = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

        if (sortedDays.length === 0) {
            container.innerHTML = '<div class="empty-msg">Aucun résultat publié pour cette période.</div>';
            return;
        }

        let html = '';
        sortedDays.forEach(day => {
            html += `<div class="result-day-group"><h3>${day}</h3>`;
            grouped[day].forEach(result => {
                html += `
                    <div class="result-draw-row">
                        <div class="draw-info">
                            <span class="draw-name">${result.drawName || 'Tirage'}</span>
                            <span class="draw-time">${new Date(result.date).toLocaleTimeString('fr-FR')}</span>
                        </div>
                        <span class="result-numbers">${result.winningNumbers || '—'}</span>
                    </div>
                `;
            });
            html += '</div>';
        });

        container.innerHTML = html;
    }

    // Lancer l'initialisation quand le DOM est prêt
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();