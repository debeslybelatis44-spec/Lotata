// ==========================
// cartManager.js (corrigé)
// ==========================

// ---------- Utils ----------
function isNumberBlocked(number, drawId) {
    if (APP_STATE.globalBlockedNumbers.includes(number)) return true;
    const drawBlocked = APP_STATE.drawBlockedNumbers[drawId] || [];
    return drawBlocked.includes(number);
}

// ---------- Cart Manager ----------
var CartManager = {

    // Gestion des mariages gratuits
    updateFreeMarriages() {

        const betsByDraw = {};

        APP_STATE.currentCart.forEach(bet => {
            if (!betsByDraw[bet.drawId]) {
                betsByDraw[bet.drawId] = [];
            }
            betsByDraw[bet.drawId].push(bet);
        });

        Object.keys(betsByDraw).forEach(drawId => {

            const bets = betsByDraw[drawId];

            // total mariage PAYANT seulement
            const totalMarriage = bets
                .filter(b => b.game === 'auto_marriage' && !b.free)
                .reduce((sum, b) => sum + b.amount, 0);

            let requiredFree = 0;

            if (totalMarriage >= 100 && totalMarriage <= 200) {
                requiredFree = 1;
            }
            else if (totalMarriage >= 201 && totalMarriage <= 500) {
                requiredFree = 2;
            }
            else if (totalMarriage >= 501) {
                requiredFree = 3;
            }

            const existingFree = bets.filter(
                b => b.free && b.freeType === 'special_marriage'
            );

            const existingCount = existingFree.length;

            // supprimer gratuits en trop
            if (existingCount > requiredFree) {

                const toRemove = existingCount - requiredFree;

                for (let i = 0; i < toRemove; i++) {

                    const freeBet = existingFree[i];

                    const index = APP_STATE.currentCart.findIndex(
                        b => b.id === freeBet.id
                    );

                    if (index !== -1) {
                        APP_STATE.currentCart.splice(index, 1);
                    }
                }
            }

            // ajouter gratuits manquants
            if (existingCount < requiredFree) {

                const toAdd = requiredFree - existingCount;

                for (let i = 0; i < toAdd; i++) {

                    const freeBet = GameEngine.generateAutoMarriageBets(0)[0];

                    if (!freeBet) continue;

                    APP_STATE.currentCart.push({
                        ...freeBet,
                        id: Date.now() + Math.random(),
                        amount: 0,
                        free: true,
                        freeType: 'special_marriage',
                        drawId: drawId,
                        drawName: bets[0].drawName
                    });
                }
            }

        });

        this.renderCart();
    },

    // ---------- Ajouter pari ----------
    addBet() {

        if (APP_STATE.isDrawBlocked) {
            alert("Tiraj sa a ap rantre nan 3 minit.");
            return;
        }

        const numInput = document.getElementById('num-input');
        const amtInput = document.getElementById('amt-input');

        const amt = parseFloat(amtInput.value);

        if (isNaN(amt) || amt <= 0) {
            alert("Montan pa valid");
            return;
        }

        const game = APP_STATE.selectedGame;

        // jeux automatiques
        if (game === 'auto_marriage') {

            const autoBets = GameEngine.generateAutoMarriageBets(amt);

            if (!autoBets.length) {
                alert("Pa gen ase nimewo pou jenere mariage");
                return;
            }

            const draws = APP_STATE.multiDrawMode
                ? APP_STATE.selectedDraws
                : [APP_STATE.selectedDraw];

            draws.forEach(drawId => {

                const drawName =
                    CONFIG.DRAWS.find(d => d.id === drawId)?.name || drawId;

                autoBets.forEach(bet => {

                    APP_STATE.currentCart.push({
                        ...bet,
                        id: Date.now() + Math.random(),
                        drawId,
                        drawName
                    });

                });

            });

            this.updateFreeMarriages();

            amtInput.value = '';
            numInput.focus();

            return;
        }

        // jeux normaux
        let num = numInput.value.trim();

        if (!GameEngine.validateEntry(game, num)) {
            alert("Nimewo pa valid");
            return;
        }

        num = GameEngine.getCleanNumber(num);

        const draws = APP_STATE.multiDrawMode
            ? APP_STATE.selectedDraws
            : [APP_STATE.selectedDraw];

        draws.forEach(drawId => {

            if (isNumberBlocked(num, drawId)) {
                alert(`Nimewo ${num} bloke`);
                return;
            }

            APP_STATE.currentCart.push({

                id: Date.now() + Math.random(),
                game: game,
                number: num,
                cleanNumber: num,
                amount: amt,
                drawId: drawId,
                drawName:
                    CONFIG.DRAWS.find(d => d.id === drawId)?.name || drawId,

                timestamp: new Date().toISOString()

            });

        });

        this.renderCart();

        numInput.value = '';
        amtInput.value = '';
        numInput.focus();
    },

    // ---------- supprimer pari ----------
    removeBet(id) {

        APP_STATE.currentCart =
            APP_STATE.currentCart.filter(b => b.id != id);

        this.updateFreeMarriages();
    },

    // ---------- affichage panier ----------
    renderCart() {

        const display = document.getElementById('cart-display');
        const totalEl = document.getElementById('cart-total-display');

        if (!APP_STATE.currentCart.length) {

            display.innerHTML = '<div>Panye vid</div>';
            totalEl.innerText = '0 Gdes';

            return;
        }

        let total = 0;

        display.innerHTML =
            APP_STATE.currentCart.map(bet => {

                total += bet.amount;

                const gameAbbr =
                    getGameAbbreviation(bet.game, bet);

                let displayNumber = bet.number;

                if (bet.game === 'auto_marriage'
                    && bet.number?.includes('&')) {

                    displayNumber = bet.number.replace('&', '*');
                }

                return `

                <div class="cart-item">

                <span>${gameAbbr} ${displayNumber}</span>

                <span>${bet.amount} G</span>

                <button onclick="CartManager.removeBet('${bet.id}')">
                ✕
                </button>

                </div>

                `;

            }).join('');

        totalEl.innerText =
            total.toLocaleString('fr-FR') + ' Gdes';
    }

};

// ---------- Abbreviation ----------
function getGameAbbreviation(gameName, bet) {

    if (bet?.free && bet.freeType === 'special_marriage') {
        return 'marg';
    }

    const map = {

        borlette: 'bor',
        lotto3: 'lo3',
        lotto4: 'lo4',
        lotto5: 'lo5',
        auto_marriage: 'mara',
        mariage: 'mar'

    };

    const key = (gameName || '').toLowerCase();

    return map[key] || gameName;
}

// ---------- Global ----------
window.CartManager = CartManager;
// ---------- Save & Print Ticket ----------
async function processFinalTicket() {

    if (!APP_STATE.currentCart.length) {
        alert("Panye vid");
        return;
    }

    const printWindow = window.open('', '_blank', 'width=500,height=700');

    if (!printWindow) {
        alert("Veuillez autoriser les pop-ups pour imprimer le ticket.");
        return;
    }

    printWindow.document.write('<html><body>Chargement...</body></html>');
    printWindow.document.close();

    const betsByDraw = {};

    APP_STATE.currentCart.forEach(b => {

        if (!betsByDraw[b.drawId]) {
            betsByDraw[b.drawId] = [];
        }

        betsByDraw[b.drawId].push(b);

    });

    try {

        for (const drawId in betsByDraw) {

            const bets = betsByDraw[drawId];

            const total = bets.reduce((s, b) => s + b.amount, 0);

            const payload = {

                agentId: APP_STATE.agentId,
                agentName: APP_STATE.agentName,
                drawId,
                drawName: bets[0].drawName,
                bets,
                total

            };

            const res = await fetch(
                `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SAVE_TICKET}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization':
                            `Bearer ${localStorage.getItem('auth_token')}`
                    },
                    body: JSON.stringify(payload)
                }
            );

            if (!res.ok) throw new Error("Erreur serveur");

            const data = await res.json();

            printThermalTicket(data.ticket, printWindow);

            APP_STATE.ticketsHistory.unshift(data.ticket);
        }

        APP_STATE.currentCart = [];

        CartManager.renderCart();

        alert("✅ Tikè sove & enprime");

    }

    catch (err) {

        console.error(err);

        alert("❌ Erè pandan enpresyon");

        printWindow.close();
    }
}