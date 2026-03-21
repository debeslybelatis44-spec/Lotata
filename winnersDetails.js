// winnersDetails.js - Ajoute le bouton "Detay" via MutationObserver
(function() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        const winnersContainer = document.getElementById('winners-container');
        if (!winnersContainer) {
            console.warn("winnersDetails: conteneur #winners-container non trouvé");
            return;
        }

        // Ajoute les attributs data-ticket-id et data-win-details aux tickets
        function enrichTickets() {
            const winnerTickets = document.querySelectorAll('#winners-container .winner-ticket');
            if (winnerTickets.length === 0) return;

            const winningTickets = APP_STATE.winningTickets || [];

            winnerTickets.forEach(ticket => {
                // Extraire l'ID du ticket depuis le <strong>
                const strong = ticket.querySelector('strong');
                let ticketId = null;
                if (strong) {
                    const text = strong.innerText;
                    const match = text.match(/#(\S+)/);
                    if (match) ticketId = match[1];
                }

                if (ticketId && !ticket.hasAttribute('data-ticket-id')) {
                    ticket.setAttribute('data-ticket-id', ticketId);
                    const foundTicket = winningTickets.find(t => (t.ticket_id || t.id) == ticketId);
                    if (foundTicket && foundTicket.win_details) {
                        let winDetails = foundTicket.win_details;
                        if (typeof winDetails === 'string') {
                            try { winDetails = JSON.parse(winDetails); } catch(e) { winDetails = null; }
                        }
                        if (winDetails) {
                            ticket.setAttribute('data-win-details', JSON.stringify(winDetails));
                        }
                    }
                }
            });
        }

        // Ajoute les boutons "Detay"
        function addDetailsButtons() {
            const winnerTickets = document.querySelectorAll('#winners-container .winner-ticket');
            if (winnerTickets.length === 0) return;

            winnerTickets.forEach(ticket => {
                if (ticket.querySelector('.btn-details')) return;

                const winDetailsAttr = ticket.getAttribute('data-win-details');
                const ticketId = ticket.getAttribute('data-ticket-id');
                if (!winDetailsAttr && !ticketId) return;

                const actionsDiv = ticket.querySelector('.winner-actions');
                if (!actionsDiv) return;

                const btn = document.createElement('button');
                btn.className = 'btn-details';
                btn.innerHTML = '<i class="fas fa-info-circle"></i> Detay';
                btn.onclick = function() {
                    let winDetails = null;
                    try {
                        winDetails = winDetailsAttr ? JSON.parse(winDetailsAttr) : null;
                    } catch(e) {}
                    if (!winDetails || winDetails.length === 0) {
                        alert("Pa gen detay pou tikè sa a.");
                        return;
                    }
                    showWinnerDetailsModal(winDetails, ticketId);
                };
                actionsDiv.insertBefore(btn, actionsDiv.firstChild);
            });
        }

        function showWinnerDetailsModal(winDetails, ticketId) {
            const modal = document.getElementById('winner-overlay');
            const detailsDiv = document.getElementById('winner-details');
            if (!modal || !detailsDiv) return;
            const title = modal.querySelector('h2');
            if (title) title.innerText = `Detay Tikè #${ticketId}`;
            let html = '<ul style="list-style: none; padding: 0; text-align: left;">';
            winDetails.forEach(d => {
                let gameAbbr = d.gameAbbr || d.game;
                if (typeof getGameAbbreviation === 'function') {
                    gameAbbr = getGameAbbreviation(d.game, d);
                }
                html += `<li style="margin-bottom: 8px;">${gameAbbr} ${d.number} : +${d.gain} G (${d.reason})</li>`;
            });
            html += '</ul>';
            detailsDiv.innerHTML = html;
            modal.style.display = 'flex';
        }

        // Observer les changements dans le conteneur des gagnants
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    enrichTickets();
                    addDetailsButtons();
                }
            });
        });
        observer.observe(winnersContainer, { childList: true, subtree: true });

        // Première exécution
        enrichTickets();
        addDetailsButtons();

        // Intercepter loadWinners pour déclencher après rafraîchissement
        if (typeof window.loadWinners === 'function') {
            const originalLoadWinners = window.loadWinners;
            window.loadWinners = async function(...args) {
                await originalLoadWinners.apply(this, args);
                setTimeout(() => {
                    enrichTickets();
                    addDetailsButtons();
                }, 100);
            };
        }

        console.log("✅ winnersDetails: module actif");
    }
})();