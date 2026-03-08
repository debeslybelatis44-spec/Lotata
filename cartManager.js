// ==========================
// cartManager.js (Version avec Mariage Gratuit Automatique)
// ==========================

// ---------- Utils ----------
function isNumberBlocked(number, drawId) {
    if (APP_STATE.globalBlockedNumbers.includes(number)) return true;
    const drawBlocked = APP_STATE.drawBlockedNumbers[drawId] || [];
    return drawBlocked.includes(number);
}

// ---------- Cart Manager ----------
var CartManager = {

    updateFreeMarriages() {
        // 1. Supprimer les anciens gratuits pour recalculer proprement
        APP_STATE.currentCart = APP_STATE.currentCart.filter(b => !(b.free && b.freeType === 'special_marriage'));

        // 2. Calculer le total actuel (uniquement les paris payants)
        const currentTotal = APP_STATE.currentCart.reduce((sum, bet) => sum + (bet.amount || 0), 0);

        // 3. Déterminer le nombre de mariages gratuits selon vos paliers
        let qty = 0;
        if (currentTotal === 100) {
            qty = 1; 
        } else if (currentTotal > 100 && currentTotal <= 500) {
            qty = 2;
        } else if (currentTotal > 500) {
            qty = 3;
        }

        if (qty === 0) {
            this.renderCart();
            return;
        }

        // 4. Générer des mariages uniques
        for (let i = 0; i < qty; i++) {
            let newMarriage = "";
            let attempts = 0;
            
            do {
                const n1 = Math.floor(Math.random() * 100).toString().padStart(2, '0');
                const n2 = Math.floor(Math.random() * 100).toString().padStart(2, '0');
                // Format standard xx*xx ou xx x xx selon votre GameEngine
                newMarriage = n1 < n2 ? `${n1}x${n2}` : `${n2}x${n1}`;
                attempts++;
            } while (
                (APP_STATE.currentCart.some(b => b.number === newMarriage)) && 
                attempts < 15
            );

            // Ajouter le mariage gratuit au panier
            APP_STATE.currentCart.push({
                id: 'free-' + Date.now() + Math.random(),
                game: 'mariage_gratuit', // Identifiant interne pour l'abréviation "Marg"
                number: newMarriage,
                cleanNumber: newMarriage,
                amount: 0, // Ne compte pas dans la valeur du ticket
                free: true,
                freeType: 'special_marriage',
                potentialWin: 1000, 
                drawId: APP_STATE.selectedDraw,
                drawName: CONFIG.DRAWS.find(d => d.id === APP_STATE.selectedDraw)?.name || '',
                timestamp: new Date().toISOString()
            });
        }

        this.renderCart();
    },

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

        // --- Gestion des jeux automatiques ---
        if (['auto_marriage', 'bo', 'grap', 'auto_lotto4', 'auto_lotto5'].includes(game)) {
            let autoBets = [];
            switch (game) {
                case 'auto_marriage': autoBets = GameEngine.generateAutoMarriageBets(amt); break;
                case 'bo': autoBets = SpecialGames.generateBOBets(amt); break;
                case 'grap': autoBets = SpecialGames.generateGRAPBets(amt); break;
                case 'auto_lotto4': autoBets = GameEngine.generateAutoLotto4Bets(amt); break;
                case 'auto_lotto5': autoBets = GameEngine.generateAutoLotto5Bets(amt); break;
            }

            if (autoBets.length === 0) {
                alert("Pa gen ase nimevo nan panye");
                return;
            }

            const draws = APP_STATE.multiDrawMode ? APP_STATE.selectedDraws : [APP_STATE.selectedDraw];

            draws.forEach(drawId => {
                const drawName = CONFIG.DRAWS.find(d => d.id === drawId)?.name || drawId;
                autoBets.forEach(bet => {
                    APP_STATE.currentCart.push({
                        ...bet,
                        id: Date.now() + Math.random(),
                        drawId: drawId,
                        drawName: drawName
                    });
                });
            });

            this.updateFreeMarriages(); 
            amtInput.value = '';
            numInput.focus();
            return;
        }

        // --- Gestion des jeux NX ---
        if (/^n[0-9]$/.test(game)) {
            const lastDigit = parseInt(game.substring(1), 10);
            const numbers = [];
            for (let tens = 0; tens <= 9; tens++) { numbers.push(tens.toString() + lastDigit.toString()); }

            const draws = APP_STATE.multiDrawMode ? APP_STATE.selectedDraws : [APP_STATE.selectedDraw];

            draws.forEach(drawId => {
                const drawName = CONFIG.DRAWS.find(d => d.id === drawId)?.name || drawId;
                numbers.forEach(num => {
                    if (!isNumberBlocked(num, drawId)) {
                        APP_STATE.currentCart.push({
                            id: Date.now() + Math.random(),
                            game: game,
                            number: num,
                            amount: amt,
                            drawId: drawId,
                            drawName: drawName
                        });
                    }
                });
            });

            this.updateFreeMarriages();
            amtInput.value = '';
            numInput.focus();
            return;
        }

        // --- Gestion des jeux normaux ---
        let num = numInput.value.trim();
        if (!GameEngine.validateEntry(game, num)) {
            alert("Nimewo pa valid");
            return;
        }

        num = GameEngine.getCleanNumber(num);
        const draws = APP_STATE.multiDrawMode ? APP_STATE.selectedDraws : [APP_STATE.selectedDraw];

        draws.forEach(drawId => {
            if (!isNumberBlocked(num, drawId)) {
                if (game === 'lotto4' || game === 'lotto5') {
                    const optionBets = GameEngine.generateLottoBetsWithOptions(game, num, amt);
                    optionBets.forEach(bet => {
                        APP_STATE.currentCart.push({ ...bet, drawId, drawName: CONFIG.DRAWS.find(d => d.id === drawId)?.name || drawId });
                    });
                } else {
                    APP_STATE.currentCart.push({
                        id: Date.now() + Math.random(),
                        game: game,
                        number: num,
                        amount: amt,
                        drawId: drawId,
                        drawName: CONFIG.DRAWS.find(d => d.id === drawId)?.name || drawId
                    });
                }
            }
        });

        this.updateFreeMarriages();
        numInput.value = '';
        amtInput.value = '';
        numInput.focus();
    },

    removeBet(id) {
        APP_STATE.currentCart = APP_STATE.currentCart.filter(b => b.id != id);
        this.updateFreeMarriages();
    },

    renderCart() {
        const display = document.getElementById('cart-display');
        const totalEl = document.getElementById('cart-total-display');
        
        if (!APP_STATE.currentCart.length) {
            display.innerHTML = '<div class="empty-msg">Panye vid</div>';
            totalEl.innerText = '0 Gdes';
            return;
        }

        let total = 0;
        display.innerHTML = APP_STATE.currentCart.map(bet => {
            total += (bet.amount || 0);
            const gameAbbr = getGameAbbreviation(bet.game, bet);
            return `
                <div class="cart-item ${bet.free ? 'free-item' : ''}">
                    <span>${gameAbbr} ${bet.number}</span>
                    <span>${bet.free ? 'GRATIS' : bet.amount + ' G'}</span>
                    <button onclick="CartManager.removeBet('${bet.id}')">✕</button>
                </div>
            `;
        }).join('');

        totalEl.innerText = total.toLocaleString('fr-FR') + ' Gdes';
    }
};

function getGameAbbreviation(gameName, bet) {
    if (bet && bet.free) return "Marg"; 
    const map = {
        'borlette': 'bor', 'lotto3': 'lo3', 'lotto4': 'lo4', 'lotto5': 'lo5',
        'auto_marriage': 'mara', 'mariage': 'mar', 'bo': 'bo', 'grap': 'grap'
    };
    const key = (gameName || '').trim().toLowerCase();
    return map[key] || gameName;
}

async function processFinalTicket() {
    if (!APP_STATE.currentCart.length) {
        alert("Panye vid");
        return;
    }

    const printWindow = window.open('', '_blank', 'width=500,height=700');
    if (!printWindow) return;

    const betsByDraw = {};
    APP_STATE.currentCart.forEach(b => {
        if (!betsByDraw[b.drawId]) betsByDraw[b.drawId] = [];
        betsByDraw[b.drawId].push(b);
    });

    try {
        for (const drawId in betsByDraw) {
            const bets = betsByDraw[drawId];
            const total = bets.reduce((s, b) => s + (b.amount || 0), 0);

            const payload = {
                agentId: APP_STATE.agentId,
                drawId,
                bets,
                total
            };

            const res = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SAVE_TICKET}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                printThermalTicket(data.ticket, printWindow);
            }
        }
        APP_STATE.currentCart = [];
        CartManager.renderCart();
    } catch (err) {
        console.error(err);
        printWindow.close();
    }
}

function printThermalTicket(ticket, printWindow) {
    const html = generateTicketHTML(ticket);
    printWindow.document.write(`<html><head><style>
        body { font-family: 'Courier New', monospace; font-size: 32px; font-weight: bold; width: 76mm; }
        .bet-row { display: flex; justify-content: space-between; margin: 5px 0; }
        .header { text-align: center; border-bottom: 2px dashed #000; }
        .total-row { display: flex; justify-content: space-between; font-size: 36px; border-top: 2px dashed #000; }
    </style></head><body>${html}</body></html>`);
    printWindow.document.close();
    printWindow.onload = () => { printWindow.focus(); printWindow.print(); };
}

function generateTicketHTML(ticket) {
    const betsHTML = (ticket.bets || []).map(b => {
        const gameAbbr = getGameAbbreviation(b.game, b);
        return `<div class="bet-row"><span>${gameAbbr} ${b.number}</span><span>${b.free ? '0' : b.amount} G</span></div>`;
    }).join('');

    return `
        <div class="header"><strong>${APP_STATE.lotteryConfig?.name || 'LOTATO'}</strong></div>
        <div class="info"><p>Ticket #: ${ticket.ticket_id || ticket.id}</p><p>Tiraj: ${ticket.draw_name || ''}</p></div>
        <hr>${betsHTML}<hr>
        <div class="total-row"><span>TOTAL</span><span>${ticket.total || 0} Gdes</span></div>
    `;
}

window.CartManager = CartManager;
window.processFinalTicket = processFinalTicket;
