(function() {
    console.log('resultsManager chargé - mode test');

    // Attendre que le DOM soit prêt
    function init() {
        // Créer l'écran
        if (!document.getElementById('test-screen')) {
            const main = document.querySelector('.content-area');
            if (!main) return console.error('Pas de .content-area');
            const screen = document.createElement('section');
            screen.id = 'test-screen';
            screen.className = 'screen';
            screen.innerHTML = '<div style="padding:20px"><h2>Test Réussi</h2></div>';
            main.appendChild(screen);
        }

        // Ajouter l'onglet
        const nav = document.querySelector('.nav-bar');
        if (nav && !document.querySelector('[data-test]')) {
            const tab = document.createElement('a');
            tab.href = '#';
            tab.className = 'nav-item';
            tab.setAttribute('data-test', 'true');
            tab.innerHTML = '<i class="fas fa-flask"></i><span>Test</span>';
            tab.addEventListener('click', function(e) {
                e.preventDefault();
                document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                document.getElementById('test-screen').classList.add('active');
                this.classList.add('active');
            });
            nav.appendChild(tab);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();