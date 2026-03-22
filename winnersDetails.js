// winnersDetails.js - Version simplifiée
(function() {
    function addDetailsButtons() {
        const winnerTickets = document.querySelectorAll('.winner-ticket');
        if (winnerTickets.length === 0) {
            console.log("Aucun ticket gagnant trouvé");
            return;
        }
        console.log("Nombre de tickets gagnants :", winnerTickets.length);
        winnerTickets.forEach(ticket => {
            if (ticket.querySelector('.btn-details')) return; // déjà ajouté
            const actionsDiv = ticket.querySelector('.winner-actions');
            if (!actionsDiv) return;
            const btn = document.createElement('button');
            btn.className = 'btn-details';
            btn.innerHTML = '<i class="fas fa-info-circle"></i> Detay';
            btn.onclick = function() {
                alert("Bouton Detay cliqué !");
            };
            actionsDiv.insertBefore(btn, actionsDiv.firstChild);
            console.log("Bouton Detay ajouté pour un ticket");
        });
    }

    // Essayer plusieurs fois car les tickets peuvent être chargés plus tard
    addDetailsButtons();
    setTimeout(addDetailsButtons, 2000);
    setTimeout(addDetailsButtons, 5000);
    setTimeout(addDetailsButtons, 10000);

    // Observer les changements dans le conteneur
    const container = document.getElementById('winners-container');
    if (container) {
        const observer = new MutationObserver(addDetailsButtons);
        observer.observe(container, { childList: true, subtree: true });
    }

    console.log("winnersDetails: script chargé");
})();