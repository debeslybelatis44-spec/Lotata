// ==========================
// cartManager.js
// ==========================

// ---------- Utils ----------
function isNumberBlocked(number, drawId) {
    if (APP_STATE.globalBlockedNumbers.includes(number)) return true;
    var drawBlocked = APP_STATE.drawBlockedNumbers[drawId] || [];
    return drawBlocked.includes(number);
}

// ---------- Génère un numéro de mariage aléatoire "XX&YY" ----------
// Fonction autonome globale — aucun problème de contexte "this"
function generateRandomMarriageNumber() {
    function rand2() {
        return Math.floor(Math.random() * 100).toString().padStart(2, '0');
    }
    var n1 = rand2();
    var n2 = rand2();
    while (n2 === n1) { n2 = rand2(); }
    return n1 + '&' + n2;
}

// ---------- Seuils : nombre de mariages gratuits selon le total payant ----------
function computeRequiredFreeMarriages(totalPayant) {
    if (totalPayant >= 500) return 3;
    if (totalPayant >= 250) return 2;
    if (totalPayant >= 100) return 1;
    return 0;
}

// ---------- Cart Manager ----------
var CartManager = {

    updateFreeMarriages: function() {

        // 1. Regrouper par drawId
        var betsByDraw = {};
        for (var i = 0; i < APP_STATE.currentCart.length; i++) {
            var bet = APP_STATE.currentCart[i];
            if (!betsByDraw[bet.drawId]) betsByDraw[bet.drawId] = [];
            betsByDraw[bet.drawId].push(bet);
        }

        // 2. Pour chaque tirage
        var drawIds = Object.keys(betsByDraw);
        for (var d = 0; d < drawIds.length; d++) {
            var drawId = drawIds[d];
            var bets = betsByDraw[drawId];

            // Total des paris PAYANTS uniquement (free !== true ET amount > 0)
            var totalPayant = 0;
            for (var b = 0; b < bets.length; b++) {
                if (bets[b].free !== true && bets[b].amount > 0) {
                    totalPayant += bets[b].amount;
                }
            }

            // Nombre de mariages gratuits requis
            var requiredFree = computeRequiredFreeMarriages(totalPayant);

            // Mariages gratuits déjà présents pour ce tirage
            var existingFreeBets = [];
            for (var e = 0; e < bets.length; e++) {
                if (bets[e].free === true && bets[e].freeType === 'special_marriage') {
                    existingFreeBets.push(bets[e]);
                }
            }
            var existingFree = existingFreeBets.length;

            // Trouver un pari normal pour récupérer drawName
            var normalBet = null;
            for (var n = 0; n < bets.length; n++) {
                if (bets[n].free !== true) { normalBet = bets[n]; break; }
            }
            if (!normalBet) continue;

            if (existingFree < requiredFree) {
                // Ajouter les mariages manquants avec numéros aléatoires uniques
                var toAdd = requiredFree - existingFree;
                for (var a = 0; a < toAdd; a++) {
                    var marriageNumber = generateRandomMarriageNumber();
                    APP_STATE.currentCart.push({
                        id: Date.now() + Math.random() + a,
                        game: 'auto_marriage',
                        number: marriageNumber,
                        cleanNumber: marriageNumber,
                        amount: 0,
                        free: true,
                        freeType: 'special_marriage',
                        gain: 1000,
                        drawId: drawId,
                        drawName: normalBet.drawName,
                        timestamp: new Date().toISOString()
                    });
                }
            } else if (existingFree > requiredFree) {
                // Supprimer les mariages en trop
                var toRemove = existingFree - requiredFree;
                for (var r = 0; r < toRemove; r++) {
                    var last = existingFreeBets[existingFreeBets.length - 1 - r];
                    if (last) {
                        for (var x = 0; x < APP_STATE.currentCart.length; x++) {
                            if (APP_STATE.currentCart[x].id === last.id) {
                                APP_STATE.currentCart.splice(x, 1);
                                break;
                            }
                        }
                    }
                }
            }
        }

        this.renderCart();
    },

    addBet: function() {
        if (APP_STATE.isDrawBlocked) {
            alert("Tiraj sa a ap rantre nan 3 minit.");
            return;
        }

        var numInput = document.getElementById('num-input');
        var amtInput = document.getElementById('amt-input');
        var amt = parseFloat(amtInput.value);

        if (isNaN(amt) || amt <= 0) {
            alert("Montan pa valid");
            return;
        }

        var game = APP_STATE.selectedGame;

        // --- Jeux automatiques ---
        if (game === 'auto_marriage' || game === 'bo' || game === 'grap' || game === 'auto_lotto4' || game === 'auto_lotto5') {
            var autoBets = [];
            if (game === 'auto_marriage') {
                autoBets = GameEngine.generateAutoMarriageBets(amt);
            } else if (game === 'bo') {
                autoBets = SpecialGames.generateBOBets(amt);
            } else if (game === 'grap') {
                autoBets = SpecialGames.generateGRAPBets(amt);
            } else if (game === 'auto_lotto4') {
                autoBets = GameEngine.generateAutoLotto4Bets(amt);
            } else if (game === 'auto_lotto5') {
                autoBets = GameEngine.generateAutoLotto5Bets(amt);
            }

            if (!autoBets || autoBets.length === 0) {
                alert("Pa gen ase nimevo nan panye pou jenere " + game);
                return;
            }

            var draws = APP_STATE.multiDrawMode ? APP_STATE.selectedDraws : [APP_STATE.selectedDraw];

            for (var di = 0; di < draws.length; di++) {
                var drawId = draws[di];
                var drawObj = null;
                for (var dc = 0; dc < CONFIG.DRAWS.length; dc++) {
                    if (CONFIG.DRAWS[dc].id === drawId) { drawObj = CONFIG.DRAWS[dc]; break; }
                }
                var drawName = drawObj ? drawObj.name : drawId;

                for (var ai = 0; ai < autoBets.length; ai++) {
                    var bet = autoBets[ai];
                    // IMPORTANT : ignorer tout pari gratuit venant de GameEngine
                    // Les gratuits sont gérés uniquement par updateFreeMarriages()
                    if (bet.free === true) continue;

                    APP_STATE.currentCart.push({
                        id: Date.now() + Math.random(),
                        game: bet.game || game,
                        number: bet.number,
                        cleanNumber: bet.cleanNumber || bet.number,
                        amount: amt,
                        free: false,
                        drawId: drawId,
                        drawName: drawName,
                        timestamp: new Date().toISOString()
                    });
                }
            }

            // Recalcule et ajoute les mariages gratuits selon les seuils
            this.updateFreeMarriages();

            amtInput.value = '';
            numInput.focus();
            return;
        }

        // --- Jeux NX (n0 à n9) ---
        if (/^n[0-9]$/.test(game)) {
            var lastDigit = parseInt(game.substring(1), 10);
            var numbers = [];
            for (var tens = 0; tens <= 9; tens++) {
                numbers.push(tens.toString() + lastDigit.toString());
            }

            var draws2 = APP_STATE.multiDrawMode ? APP_STATE.selectedDraws : [APP_STATE.selectedDraw];

            for (var d2 = 0; d2 < draws2.length; d2++) {
                for (var ni = 0; ni < numbers.length; ni++) {
                    if (isNumberBlocked(numbers[ni], draws2[d2])) {
                        alert('Nimewo ' + numbers[ni] + ' bloke pou tiraj sa a');
                        return;
                    }
                }
            }

            for (var d3 = 0; d3 < draws2.length; d3++) {
                var drawId2 = draws2[d3];
                var drawObj2 = null;
                for (var dc2 = 0; dc2 < CONFIG.DRAWS.length; dc2++) {
                    if (CONFIG.DRAWS[dc2].id === drawId2) { drawObj2 = CONFIG.DRAWS[dc2]; break; }
                }
                var drawName2 = drawObj2 ? drawObj2.name : drawId2;
                for (var n2 = 0; n2 < numbers.length; n2++) {
                    APP_STATE.currentCart.push({
                        id: Date.now() + Math.random(),
                        game: game,
                        number: numbers[n2],
                        cleanNumber: numbers[n2],
                        amount: amt,
                        drawId: drawId2,
                        drawName: drawName2,
                        timestamp: new Date().toISOString()
                    });
                }
            }

            this.renderCart();
            numInput.value = '';
            amtInput.value = '';
            numInput.focus();
            return;
        }

        // --- Jeux normaux (saisie manuelle) ---
        var num = numInput.value.trim();

        if (!GameEngine.validateEntry(game, num)) {
            alert("Nimewo pa valid");
            return;
        }

        num = GameEngine.getCleanNumber(num);

        var draws3 = APP_STATE.multiDrawMode ? APP_STATE.selectedDraws : [APP_STATE.selectedDraw];

        for (var d4 = 0; d4 < draws3.length; d4++) {
            if (isNumberBlocked(num, draws3[d4])) {
                alert('Nimewo ' + num + ' bloke');
                return;
            }
        }

        for (var d5 = 0; d5 < draws3.length; d5++) {
            var drawId3 = draws3[d5];
            var drawObj3 = null;
            for (var dc3 = 0; dc3 < CONFIG.DRAWS.length; dc3++) {
                if (CONFIG.DRAWS[dc3].id === drawId3) { drawObj3 = CONFIG.DRAWS[dc3]; break; }
            }
            var drawName3 = drawObj3 ? drawObj3.name : drawId3;

            if (game === 'lotto4' || game === 'lotto5') {
                var optionBets = GameEngine.generateLottoBetsWithOptions(game, num, amt);
                for (var ob = 0; ob < optionBets.length; ob++) {
                    APP_STATE.currentCart.push(Object.assign({}, optionBets[ob], {
                        drawId: drawId3,
                        drawName: drawName3
                    }));
                }
            } else {
                APP_STATE.currentCart.push({
                    id: Date.now() + Math.random(),
                    game: game,
                    number: num,
                    cleanNumber: num,
                    amount: amt,
                    drawId: drawId3,
                    drawName: drawName3,
                    timestamp: new Date().toISOString()
                });
            }
        }

        this.renderCart();
        numInput.value = '';
        amtInput.value = '';
        numInput.focus();
    },

    removeBet: function(id) {
        var newCart = [];
        for (var i = 0; i < APP_STATE.currentCart.length; i++) {
            if (APP_STATE.currentCart[i].id != id) {
                newCart.push(APP_STATE.currentCart[i]);
            }
        }
        APP_STATE.currentCart = newCart;
        this.updateFreeMarriages();
    },

    renderCart: function() {
        var display = document.getElementById('cart-display');
        var totalEl = document.getElementById('cart-total-display');
        var itemsCount = document.getElementById('items-count');

        if (!APP_STATE.currentCart.length) {
            display.innerHTML = '<div class="empty-msg">Panye vid</div>';
            totalEl.innerText = '0 Gdes';
            if (itemsCount) itemsCount.innerText = '0 jwèt';
            return;
        }

        var total = 0;
        var count = 0;
        var html = '';

        for (var i = 0; i < APP_STATE.currentCart.length; i++) {
            var bet = APP_STATE.currentCart[i];
            total += bet.amount;
            count++;
            var gameAbbr = getGameAbbreviation(bet.game, bet);
            var displayNumber = bet.number || '';
            if (bet.game === 'auto_marriage' && displayNumber.indexOf('&') !== -1) {
                displayNumber = displayNumber.replace('&', '*');
            }
            html += '<div class="cart-item">' +
                '<span>' + gameAbbr + ' ' + displayNumber + '</span>' +
                '<span>' + bet.amount + ' G</span>' +
                '<button onclick="CartManager.removeBet(\'' + bet.id + '\')">✕</button>' +
                '</div>';
        }

        display.innerHTML = html;
        totalEl.innerText = total.toLocaleString('fr-FR') + ' Gdes';
        if (itemsCount) itemsCount.innerText = count + ' jwèt';
    }
};

// ---------- Abréviation des jeux ----------
function getGameAbbreviation(gameName, bet) {
    // Mariage gratuit → afficher seulement 'marg', 0 G (aucune mention du gain)
    if (bet && bet.free === true && bet.freeType === 'special_marriage') {
        return 'marg';
    }
    var map = {
        'borlette':      'bor',
        'lotto3':        'lo3',
        'lotto4':        'lo4',
        'lotto5':        'lo5',
        'auto_marriage': 'mara',
        'auto_lotto4':   'loa4',
        'auto_lotto5':   'loa5',
        'mariage':       'mar',
        'lotto 3':       'lo3',
        'lotto 4':       'lo4',
        'lotto 5':       'lo5',
        'loto3':         'lo3',
        'loto4':         'lo4',
        'loto5':         'lo5',
        'bo':            'bo',
        'grap':          'grap',
        'n0': 'n0', 'n1': 'n1', 'n2': 'n2', 'n3': 'n3', 'n4': 'n4',
        'n5': 'n5', 'n6': 'n6', 'n7': 'n7', 'n8': 'n8', 'n9': 'n9'
    };
    var key = (gameName || '').trim().toLowerCase();
    return map[key] || gameName;
}

// ---------- Save & Print Ticket ----------
async function processFinalTicket() {
    if (!APP_STATE.currentCart.length) {
        alert("Panye vid");
        return;
    }

    var printWindow = window.open('', '_blank', 'width=500,height=700');
    if (!printWindow) {
        alert("Veuillez autoriser les pop-ups pour imprimer le ticket.");
        return;
    }

    printWindow.document.write('<html><head><title>Chargement...</title></head><body><p style="font-size:20px;text-align:center;">Génération du ticket en cours...</p></body></html>');
    printWindow.document.close();

    var betsByDraw = {};
    for (var i = 0; i < APP_STATE.currentCart.length; i++) {
        var b = APP_STATE.currentCart[i];
        if (!betsByDraw[b.drawId]) betsByDraw[b.drawId] = [];
        betsByDraw[b.drawId].push(b);
    }

    try {
        var drawIds = Object.keys(betsByDraw);
        for (var d = 0; d < drawIds.length; d++) {
            var drawId = drawIds[d];
            var bets = betsByDraw[drawId];
            var total = 0;
            for (var t = 0; t < bets.length; t++) { total += bets[t].amount; }

            var payload = {
                agentId:   APP_STATE.agentId,
                agentName: APP_STATE.agentName,
                drawId:    drawId,
                drawName:  bets[0].drawName,
                bets:      bets,
                total:     total
            };

            var res = await fetch(API_CONFIG.BASE_URL + API_CONFIG.ENDPOINTS.SAVE_TICKET, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('auth_token')
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("Erreur serveur");

            var data = await res.json();
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

// ---------- PRINT ----------
function printThermalTicket(ticket, printWindow) {
    var html = generateTicketHTML(ticket);

    printWindow.document.write('<!DOCTYPE html><html><head><title>Ticket</title><style>' +
        '@page{size:80mm auto;margin:2mm}' +
        'body{font-family:"Courier New",monospace;font-size:32px;font-weight:bold;width:76mm;margin:0 auto;padding:4mm;background:white;color:black}' +
        '.header{text-align:center;border-bottom:2px dashed #000;padding:0;margin:0 0 2px 0;line-height:1}' +
        '.header img{display:block;margin:0 auto;max-height:350px;max-width:100%}' +
        '.header strong{display:block;font-size:40px;font-weight:bold;margin:0;line-height:1}' +
        '.header small{display:block;font-size:26px;color:#555;margin:0;line-height:1}' +
        '.info{margin:10px 0}' +
        '.info p{margin:5px 0;font-size:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        'hr{border:none;border-top:2px dashed #000;margin:10px 0}' +
        '.bet-row{display:flex;justify-content:space-between;margin:5px 0;font-weight:bold;font-size:32px}' +
        '.total-row{display:flex;justify-content:space-between;font-weight:bold;margin-top:10px;font-size:36px}' +
        '.footer{text-align:center;margin-top:20px;font-style:italic;font-size:28px}' +
        '.footer p{font-weight:bold;margin:3px 0}' +
        '</style></head><body>' + html + '</body></html>');

    printWindow.document.close();
    printWindow.onload = function() {
        printWindow.focus();
        printWindow.print();
    };
}

// ---------- Ticket HTML ----------
function generateTicketHTML(ticket) {
    var cfg = APP_STATE.lotteryConfig || CONFIG;
    var lotteryName = cfg.LOTTERY_NAME || cfg.name || 'LOTATO';
    var slogan      = cfg.slogan || '';
    var logoUrl     = cfg.LOTTERY_LOGO || cfg.logo || cfg.logoUrl || '';

    var dateObj = new Date(ticket.date);
    var formattedDate = dateObj.toLocaleDateString('fr-FR') + ' ' +
                        dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    var betsHTML = '';
    var ticketBets = ticket.bets || [];
    for (var i = 0; i < ticketBets.length; i++) {
        var b = ticketBets[i];
        var gameAbbr = getGameAbbreviation(b.game || '', b);
        var displayNumber = b.number || '';
        if (b.game === 'auto_marriage' && displayNumber.indexOf('&') !== -1) {
            displayNumber = displayNumber.replace('&', '*');
        }
        // Mariage gratuit : afficher 0 G — pas de mention des 1000 gourdes
        var displayAmount = (b.free === true && b.freeType === 'special_marriage') ? '0 G' : ((b.amount || 0) + ' G');
        betsHTML += '<div class="bet-row"><span>' + gameAbbr + ' ' + displayNumber + '</span><span>' + displayAmount + '</span></div>';
    }

    return '<div class="header">' +
        (logoUrl ? '<img src="' + logoUrl + '" alt="Logo">' : '') +
        '<strong>' + lotteryName + '</strong>' +
        (slogan ? '<small>' + slogan + '</small>' : '') +
        '</div>' +
        '<div class="info">' +
        '<p>Ticket #: ' + (ticket.ticket_id || ticket.id) + '</p>' +
        '<p>Tiraj: ' + (ticket.draw_name || ticket.drawName || '') + '</p>' +
        '<p>Date: ' + formattedDate + '</p>' +
        '<p>Ajan: ' + (ticket.agent_name || ticket.agentName || '') + '</p>' +
        '</div><hr>' +
        betsHTML +
        '<hr><div class="total-row"><span>TOTAL</span><span>' + (ticket.total_amount || ticket.total || 0) + ' Gdes</span></div>' +
        '<div class="footer">' +
        '<p>tickets valable jusqu\'à 90 jours</p>' +
        '<p>Ref : +509 40 64 3557</p>' +
        '<p><strong>LOTATO S.A.</strong></p>' +
        '</div>';
}

// ---------- Global ----------
window.CartManager = CartManager;
window.processFinalTicket = processFinalTicket;
window.printThermalTicket = printThermalTicket;
