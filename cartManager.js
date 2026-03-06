// ==========================
// cartManager.js (avec gestion des jeux automatiques et abréviations courtes)
// ==========================

// ---------- Utils ----------
function isNumberBlocked(number, drawId) {
    if (APP_STATE.globalBlockedNumbers.includes(number)) return true;
    const drawBlocked = APP_STATE.drawBlockedNumbers[drawId] || [];
    return drawBlocked.includes(number);
}

// Extrait tous les numéros d'une chaîne (ex: "12 34 56" → ["12","34","56"])
function extractNumbersFromString(str) {
    const matches = str.match(/\d+/g);
    return matches || [];
}

// Génère tous les numéros pour un pattern nX (ex: n1 → 01,11,21,...,91)
function expandNPattern(input) {
    // Nettoie l'entrée : enlève les espaces et met en minuscules
    const cleaned = input.replace(/\s+/g, '').toLowerCase();
    const match = cleaned.match(/^n(\d)$/); // n suivi d'un seul chiffre
    if (!match) return null;
    const lastDigit = match[1];
    const numbers = [];
    for (let i = 0; i <= 9; i++) {
        // Former le nombre à deux chiffres : dizaine i, unité lastDigit
        const num = i.toString() + lastDigit; // "0"+"1" = "01", "1"+"1" = "11", etc.
        numbers.push(num);
    }
    return numbers;
}

// ---------- Cart Manager ----------
var CartManager = {

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
        let rawNum = numInput.value.trim();

        // --- Étape 1 : Vérifier s'il s'agit d'un pattern nX (uniquement pour borlette) ---
        let numbersToAdd = [];
        if (game === 'borlette') {
            const expanded = expandNPattern(rawNum);
            if (expanded) {
                numbersToAdd = expanded;
                console.log("Pattern nX détecté, génération de", numbersToAdd.length, "numéros");
            }
        }

        // --- Si ce n'est pas un pattern, on traite normalement ---
        if (numbersToAdd.length === 0) {
            // Validation du format pour le jeu en cours
            if (!GameEngine.validateEntry(game, rawNum)) {
                alert("Nimewo pa valid");
                return;
            }
            // Nettoyage du numéro (supprime les espaces, formate)
            const cleanNum = GameEngine.getCleanNumber(rawNum);
            numbersToAdd = [cleanNum];
        }

        // Vérifier que nous avons des numéros
        if (numbersToAdd.length === 0) {
            alert("Pa gen nimewo valab");
            return;
        }

        const draws = APP_STATE.multiDrawMode
            ? APP_STATE.selectedDraws
            : [APP_STATE.selectedDraw];

        // Vérifier chaque numéro pour chaque tirage
        for (const drawId of draws) {
            for (const n of numbersToAdd) {
                if (isNumberBlocked(n, drawId)) {
                    alert(`Nimewo ${n} bloke pou tiraj sa a`);
                    return;
                }
            }
        }

        // Ajouter les paris : pour chaque numéro dans numbersToAdd, pour chaque tirage
        draws.forEach(drawId => {
            const drawName = CONFIG.DRAWS.find(d => d.id === drawId)?.name || drawId;
            numbersToAdd.forEach(number => {
                // Pour les jeux Lotto 4/5 avec options multiples
                if (game === 'lotto4' || game === 'lotto5') {
                    const optionBets = GameEngine.generateLottoBetsWithOptions(game, number, amt);
                    optionBets.forEach(bet => {
                        APP_STATE.currentCart.push({
                            ...bet,
                            id: Date.now() + Math.random(),
                            drawId: drawId,
                            drawName: drawName
                        });
                    });
                } else {
                    APP_STATE.currentCart.push({
                        id: Date.now() + Math.random(),
                        game: game,
                        number: number,
                        cleanNumber: number,
                        amount: amt,
                        drawId: drawId,
                        drawName: drawName,
                        timestamp: new Date().toISOString()
                    });
                }
            });
        });

        this.renderCart();
        numInput.value = '';
        amtInput.value = '';
    },

    removeBet(id) {
        APP_STATE.currentCart = APP_STATE.currentCart.filter(b => b.id != id);
        this.renderCart();
    },

    renderCart() {
        const display = document.getElementById('cart-display');
        const totalEl = document.getElementById('cart-total-display');
        const itemsCount = document.getElementById('items-count');

        if (!APP_STATE.currentCart.length) {
            display.innerHTML = '<div class="empty-msg">Panye vid</div>';
            totalEl.innerText = '0 Gdes';
            if (itemsCount) itemsCount.innerText = '0 jwèt';
            return;
        }

        let total = 0;
        let count = 0;

        display.innerHTML = APP_STATE.currentCart.map(bet => {
            total += bet.amount;
            count++;
            const gameAbbr = getGameAbbreviation(bet.game, bet);
            let displayNumber = bet.number;
            if (bet.game === 'auto_marriage' && bet.number.includes('&')) {
                displayNumber = bet.number.replace('&', '*');
            }
            return `
                <div class="cart-item">
                    <span>${gameAbbr} ${displayNumber}</span>
                    <span>${bet.amount} G</span>
                    <button onclick="CartManager.removeBet('${bet.id}')">✕</button>
                </div>
            `;
        }).join('');

        totalEl.innerText = total.toLocaleString('fr-FR') + ' Gdes';
        if (itemsCount) itemsCount.innerText = count + ' jwèt';
    }
};

// ---------- Fonction d'abréviation des jeux (version courte) ----------
function getGameAbbreviation(gameName, bet) {
    if (bet && bet.free && bet.freeType === 'special_marriage') {
        return 'marg';
    }
    const map = {
        'borlette': 'bor',
        'lotto3': 'lo3',
        'lotto4': 'lo4',
        'lotto5': 'lo5',
        'auto_marriage': 'mara',
        'auto_lotto4': 'loa4',
        'auto_lotto5': 'loa5',
        'mariage': 'mar',
        'lotto 3': 'lo3',
        'lotto 4': 'lo4',
        'lotto 5': 'lo5',
        'loto3': 'lo3',
        'loto4': 'lo4',
        'loto5': 'lo5',
        'bo': 'bo',
        'grap': 'grap'
    };
    const key = (gameName || '').trim().toLowerCase();
    return map[key] || gameName;
}

// ---------- Save & Print Ticket (inchangé) ----------
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

    printWindow.document.write('<html><head><title>Chargement...</title></head><body><p style="font-size:20px; text-align:center;">Génération du ticket en cours...</p></body></html>');
    printWindow.document.close();

    const betsByDraw = {};
    APP_STATE.currentCart.forEach(b => {
        if (!betsByDraw[b.drawId]) betsByDraw[b.drawId] = [];
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

            const res = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SAVE_TICKET}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("Erreur serveur");

            const data = await res.json();
            printThermalTicket(data.ticket, printWindow);
            APP_STATE.ticketsHistory.unshift(data.ticket);
        }

        APP_STATE.currentCart = [];
        CartManager.renderCart();
        alert("✅ Tikè sove & enprime");

    } catch (err) {
        console.error(err);
        alert("❌ Erè pandan enpresyon");
        printWindow.close();
    }
}

// ---------- PRINT (inchangé) ----------
function printThermalTicket(ticket, printWindow) {
    const html = generateTicketHTML(ticket);
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Ticket</title>
            <style>
                @page { size: 80mm auto; margin: 2mm; }
                body {
                    font-family: 'Courier New', monospace;
                    font-size: 32px; font-weight: bold;
                    width: 76mm; margin: 0 auto; padding: 4mm;
                    background: white; color: black;
                }
                .header { text-align: center; border-bottom: 2px dashed #000; padding: 0; margin: 0 0 2px 0; line-height: 1; }
                .header img { display: block; margin: 0 auto; max-height: 350px; max-width: 100%; }
                .header strong { display: block; font-size: 40px; margin: 0; }
                .header small { display: block; font-size: 26px; color: #555; margin: 0; }
                .info { margin: 10px 0; }
                .info p { margin: 5px 0; font-size: 20px; }
                hr { border: none; border-top: 2px dashed #000; margin: 10px 0; }
                .bet-row { display: flex; justify-content: space-between; margin: 5px 0; font-size: 32px; }
                .total-row { display: flex; justify-content: space-between; font-weight: bold; margin-top: 10px; font-size: 36px; }
                .footer { text-align: center; margin-top: 20px; font-size: 28px; }
            </style>
        </head>
        <body>${html}</body>
        </html>
    `);
    printWindow.document.close();
    printWindow.onload = function() { printWindow.focus(); printWindow.print(); };
}

function generateTicketHTML(ticket) {
    const cfg = APP_STATE.lotteryConfig || CONFIG;
    const lotteryName = cfg.LOTTERY_NAME || cfg.name || 'LOTATO';
    const slogan = cfg.slogan || '';
    const logoUrl = cfg.LOTTERY_LOGO || cfg.logo || cfg.logoUrl || '';
    const dateObj = new Date(ticket.date);
    const formattedDate = dateObj.toLocaleDateString('fr-FR') + ' ' + 
                          dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const betsHTML = (ticket.bets || []).map(b => {
        const gameAbbr = getGameAbbreviation(b.game || '', b);
        let displayNumber = b.number || '';
        if (b.game === 'auto_marriage' && displayNumber.includes('&')) {
            displayNumber = displayNumber.replace('&', '*');
        }
        return `<div class="bet-row"><span>${gameAbbr} ${displayNumber}</span><span>${b.amount || 0} G</span></div>`;
    }).join('');
    return `
        <div class="header">
            ${logoUrl ? `<img src="${logoUrl}" alt="Logo">` : ''}
            <strong>${lotteryName}</strong>
            ${slogan ? `<small>${slogan}</small>` : ''}
        </div>
        <div class="info">
            <p>Ticket #: ${ticket.ticket_id || ticket.id}</p>
            <p>Tiraj: ${ticket.draw_name || ticket.drawName || ''}</p>
            <p>Date: ${formattedDate}</p>
            <p>Ajan: ${ticket.agent_name || ticket.agentName || ''}</p>
        </div>
        <hr>
        ${betsHTML}
        <hr>
        <div class="total-row"><span>TOTAL</span><span>${ticket.total_amount || ticket.total || 0} Gdes</span></div>
        <div class="footer">
            <p>tickets valable jusqu'à 90 jours</p>
            <p>Ref : +509 40 64 3557</p>
            <p><strong>LOTATO S.A.</strong></p>
        </div>
    `;
}

// ---------- Global ----------
window.CartManager = CartManager;
window.processFinalTicket = processFinalTicket;