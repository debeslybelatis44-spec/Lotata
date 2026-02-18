// cartManager.js

// Fonction utilitaire pour vérifier si un numéro est bloqué
function isNumberBlocked(number, drawId) {
    if (APP_STATE.globalBlockedNumbers.includes(number)) return true;
    const drawBlocked = APP_STATE.drawBlockedNumbers[drawId] || [];
    return drawBlocked.includes(number);
}

// Rendre CartManager global (var au lieu de const)
var CartManager = {
    addBet() {
        if (APP_STATE.isDrawBlocked) {
            alert("Tiraj sa a ap rantre nan 3 minit. Ou pa ka ajoute plis paray.");
            return;
        }

        const numInput = document.getElementById('num-input');
        const amtInput = document.getElementById('amt-input');
        let num = numInput.value.trim();
        const amt = parseFloat(amtInput.value);

        if (isNaN(amt) || amt <= 0) {
            alert("Tanpri antre yon montan ki valid");
            return;
        }

        // Pour les jeux qui génèrent automatiquement plusieurs numéros, on vérifie chaque numéro
        if (APP_STATE.selectedGame === 'bo') {
            const boBets = SpecialGames.generateBOBets(amt);
            
            if (boBets.length === 0) {
                alert("Pa gen boules paires pou ajoute");
                return;
            }

            const draws = APP_STATE.multiDrawMode ? APP_STATE.selectedDraws : [APP_STATE.selectedDraw];
            
            // Vérifier que tous les numéros générés ne sont pas bloqués
            for (const drawId of draws) {
                for (const bet of boBets) {
                    if (isNumberBlocked(bet.cleanNumber, drawId)) {
                        alert(`Nimewo ${bet.cleanNumber} bloke, pa ka ajoute.`);
                        return;
                    }
                }
            }
            
            draws.forEach(drawId => {
                boBets.forEach(bet => {
                    const newBet = {
                        ...bet,
                        id: Date.now() + Math.random(),
                        drawId: drawId,
                        drawName: CONFIG.DRAWS.find(d => d.id === drawId).name
                    };
                    APP_STATE.currentCart.push(newBet);
                });
            });
            
            this.renderCart();
            amtInput.value = '';
            alert(`${boBets.length * draws.length} boules paires ajoute nan panye`);
            return;
        }

        if (APP_STATE.selectedGame.startsWith('n')) {
            const digit = parseInt(APP_STATE.selectedGame[1]);
            const nBets = SpecialGames.generateNBets(digit, amt);
            
            if (nBets.length === 0) {
                alert("Pa gen boules pou ajoute");
                return;
            }

            const draws = APP_STATE.multiDrawMode ? APP_STATE.selectedDraws : [APP_STATE.selectedDraw];
            
            // Vérifier chaque numéro
            for (const drawId of draws) {
                for (const bet of nBets) {
                    if (isNumberBlocked(bet.cleanNumber, drawId)) {
                        alert(`Nimewo ${bet.cleanNumber} bloke, pa ka ajoute.`);
                        return;
                    }
                }
            }
            
            draws.forEach(drawId => {
                nBets.forEach(bet => {
                    const newBet = {
                        ...bet,
                        id: Date.now() + Math.random(),
                        drawId: drawId,
                        drawName: CONFIG.DRAWS.find(d => d.id === drawId).name
                    };
                    APP_STATE.currentCart.push(newBet);
                });
            });
            
            this.renderCart();
            amtInput.value = '';
            alert(`${nBets.length * draws.length} boules (N${digit}) ajoute nan panye`);
            return;
        }

        if (APP_STATE.selectedGame === 'grap') {
            const grapBets = SpecialGames.generateGRAPBets(amt);
            
            if (grapBets.length === 0) {
                alert("Pa gen boules grap pou ajoute");
                return;
            }

            const draws = APP_STATE.multiDrawMode ? APP_STATE.selectedDraws : [APP_STATE.selectedDraw];
            
            // Vérifier
            for (const drawId of draws) {
                for (const bet of grapBets) {
                    if (isNumberBlocked(bet.cleanNumber, drawId)) {
                        alert(`Nimewo ${bet.cleanNumber} bloke, pa ka ajoute.`);
                        return;
                    }
                }
            }
            
            draws.forEach(drawId => {
                grapBets.forEach(bet => {
                    const newBet = {
                        ...bet,
                        id: Date.now() + Math.random(),
                        drawId: drawId,
                        drawName: CONFIG.DRAWS.find(d => d.id === drawId).name
                    };
                    APP_STATE.currentCart.push(newBet);
                });
            });
            
            this.renderCart();
            amtInput.value = '';
            alert(`${grapBets.length * draws.length} boules grap ajoute nan panye`);
            return;
        }

        if (APP_STATE.selectedGame.includes('auto')) {
            if (isNaN(amt) || amt <= 0) {
                alert("Tanpri antre yon montan ki valid");
                return;
            }

            let autoBets = [];
            if (APP_STATE.selectedGame === 'auto_marriage') {
                autoBets = GameEngine.generateAutoMarriageBets(amt);
            } else if (APP_STATE.selectedGame === 'auto_lotto4') {
                autoBets = GameEngine.generateAutoLotto4Bets(amt);
            } else if (APP_STATE.selectedGame === 'auto_lotto5') {
                autoBets = GameEngine.generateAutoLotto5Bets(amt);
            }
            
            if (autoBets.length === 0) {
                alert("Pa gen nimewo nan panye pou kreye jwèt otomatik yo");
                return;
            }

            const draws = APP_STATE.multiDrawMode ? APP_STATE.selectedDraws : [APP_STATE.selectedDraw];
            
            // Vérifier chaque numéro généré
            for (const drawId of draws) {
                for (const bet of autoBets) {
                    if (isNumberBlocked(bet.cleanNumber, drawId)) {
                        alert(`Nimewo ${bet.cleanNumber} bloke, pa ka ajoute.`);
                        return;
                    }
                }
            }
            
            draws.forEach(drawId => {
                autoBets.forEach(bet => {
                    const newBet = {
                        ...bet,
                        id: Date.now() + Math.random(),
                        drawId: drawId,
                        drawName: CONFIG.DRAWS.find(d => d.id === drawId).name
                    };
                    APP_STATE.currentCart.push(newBet);
                });
            });
            
            this.renderCart();
            amtInput.value = '';
            alert(`${autoBets.length * draws.length} jwèt otomatik ajoute nan panye`);
            return;
        }

        if (APP_STATE.selectedGame === 'lotto4' || APP_STATE.selectedGame === 'lotto5') {
            if (!GameEngine.validateEntry(APP_STATE.selectedGame, num)) {
                alert("Nimewo sa pa bon pou " + APP_STATE.selectedGame);
                return;
            }
            
            const options = APP_STATE.selectedGame === 'lotto4' ? APP_STATE.lotto4Options : APP_STATE.lotto5Options;
            const activeOptions = options.filter(opt => opt).length;
            
            if (activeOptions === 0) {
                alert("Tanpri chwazi omwen yon opsyon pou " + APP_STATE.selectedGame);
                return;
            }
            
            const bets = GameEngine.generateLottoBetsWithOptions(APP_STATE.selectedGame, num, amt);
            
            if (bets.length === 0) {
                alert("Pa gen opsyon chwazi pou " + APP_STATE.selectedGame);
                return;
            }

            const draws = APP_STATE.multiDrawMode ? APP_STATE.selectedDraws : [APP_STATE.selectedDraw];
            
            // Vérifier le numéro nettoyé (premier bet suffit car même numéro)
            const cleanNum = GameEngine.getCleanNumber(num);
            for (const drawId of draws) {
                if (isNumberBlocked(cleanNum, drawId)) {
                    alert(`Nimewo ${cleanNum} bloke, pa ka ajoute.`);
                    return;
                }
            }

            // Vérifier les limites (avertissement)
            for (const drawId of draws) {
                if (APP_STATE.drawNumberLimits && APP_STATE.drawNumberLimits[drawId]) {
                    const limits = APP_STATE.drawNumberLimits[drawId];
                    const currentTotalInCart = APP_STATE.currentCart
                        .filter(item => item.drawId === drawId && item.cleanNumber === cleanNum)
                        .reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
                    const newTotal = currentTotalInCart + amt;
                    if (limits[cleanNum] && newTotal > limits[cleanNum]) {
                        alert(`Atansyon: Limite pou nimewo ${cleanNum} se ${limits[cleanNum]} Gdes. Ou ap depase si w ajoute sa.`);
                        // La validation finale sera faite par le serveur
                    }
                }
            }
            
            draws.forEach(drawId => {
                bets.forEach(bet => {
                    const newBet = {
                        ...bet,
                        id: Date.now() + Math.random(),
                        drawId: drawId,
                        drawName: CONFIG.DRAWS.find(d => d.id === drawId).name
                    };
                    APP_STATE.currentCart.push(newBet);
                });
            });
            
            this.renderCart();
            numInput.value = '';
            amtInput.value = '';
            numInput.focus();
            
            alert(`${bets.length * draws.length} ${APP_STATE.selectedGame} ajoute nan panye (${activeOptions} opsyon)`);
            return;
        }

        if (!GameEngine.validateEntry(APP_STATE.selectedGame, num)) {
            alert("Nimewo sa pa bon pou " + APP_STATE.selectedGame);
            return;
        }

        num = GameEngine.getCleanNumber(num);
        
        let displayNum = num;
        if (APP_STATE.selectedGame === 'lotto4' && num.length === 4) {
            displayNum = num.slice(0, 2) + '-' + num.slice(2, 4);
        } else if (APP_STATE.selectedGame === 'lotto5' && num.length === 5) {
            displayNum = num.slice(0, 3) + '-' + num.slice(3, 5);
        } else if (APP_STATE.selectedGame === 'mariage' && num.length === 4) {
            displayNum = num.slice(0, 2) + '&' + num.slice(2, 4);
        }

        const draws = APP_STATE.multiDrawMode ? APP_STATE.selectedDraws : [APP_STATE.selectedDraw];
        
        // Vérifier que le numéro n'est pas bloqué pour chaque tirage
        for (const drawId of draws) {
            if (isNumberBlocked(num, drawId)) {
                alert(`Nimewo ${num} bloke pou tiraj sa a. Ou pa ka jwe li.`);
                return;
            }
        }

        // Vérifier les limites (avertissement)
        for (const drawId of draws) {
            if (APP_STATE.drawNumberLimits && APP_STATE.drawNumberLimits[drawId]) {
                const limits = APP_STATE.drawNumberLimits[drawId];
                const currentTotalInCart = APP_STATE.currentCart
                    .filter(item => item.drawId === drawId && item.cleanNumber === num)
                    .reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
                const newTotal = currentTotalInCart + amt;
                if (limits[num] && newTotal > limits[num]) {
                    alert(`Atansyon: Limite pou nimewo ${num} se ${limits[num]} Gdes. Ou ap depase si w ajoute sa.`);
                }
            }
        }
        
        draws.forEach(drawId => {
            const bet = {
                id: Date.now() + Math.random(),
                game: APP_STATE.selectedGame,
                number: displayNum,
                cleanNumber: num,
                amount: amt,
                drawId: drawId,
                drawName: CONFIG.DRAWS.find(d => d.id === drawId).name,
                timestamp: new Date().toISOString(),
                isAutoGenerated: false,
                isSpecial: false
            };

            APP_STATE.currentCart.push(bet);
        });
        
        this.renderCart();
        
        numInput.value = '';
        amtInput.value = '';
        numInput.focus();
    },

    removeBet(id) {
        // CORRECTION : convertir les IDs en chaîne pour une comparaison fiable
        APP_STATE.currentCart = APP_STATE.currentCart.filter(item => item.id.toString() !== id.toString());
        this.renderCart();
    },

    renderCart() {
        const display = document.getElementById('cart-display');
        const summary = document.getElementById('cart-summary');
        const totalDisplay = document.getElementById('total-amount');
        const countDisplay = document.getElementById('items-count');
        const cartTotalDisplay = document.getElementById('cart-total-display');

        if (APP_STATE.currentCart.length === 0) {
            display.innerHTML = '<div class="empty-msg">Pa gen paray ankò</div>';
            summary.style.display = 'none';
            countDisplay.innerText = "0 jwèt";
            cartTotalDisplay.innerText = "0 Gdes";
            return;
        }

        let total = 0;
        display.innerHTML = APP_STATE.currentCart.map(item => {
            total += item.amount;
            let gameName = '';
            
            if (item.isAutoGenerated && item.specialType) {
                gameName = item.specialType.toUpperCase();
            } else if (item.isAutoGenerated) {
                gameName = `${item.game.replace('_', ' ').toUpperCase()}*`;
            } else {
                gameName = item.game.toUpperCase();
            }
            
            if (item.option) {
                gameName += ` (Opsyon ${item.option})`;
            }
            
            const drawName = APP_STATE.multiDrawMode ? item.drawName : '';
            
            return `
                <div class="cart-item animate-fade">
                    <div class="item-info">
                        <span class="item-game">${gameName} ${item.number}</span>
                        ${APP_STATE.multiDrawMode ? `<span style="font-size:0.8rem; color:var(--text-dim)">${drawName}</span>` : ''}
                    </div>
                    <div class="item-price">
                        <span>${item.amount} ${CONFIG.CURRENCY}</span>
                        <button onclick="CartManager.removeBet('${item.id}')" style="background:none; border:none; color:var(--danger); cursor:pointer;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        totalDisplay.innerText = total.toLocaleString();
        countDisplay.innerText = APP_STATE.currentCart.length + " jwèt";
        cartTotalDisplay.innerText = total.toLocaleString() + " Gdes";
        summary.style.display = 'block';
        
        display.scrollTop = display.scrollHeight;
    }
};

// --- Fonctions d'impression améliorées ---

async function processFinalTicket() {
    if (APP_STATE.currentCart.length === 0) {
        alert("Pa gen anyen nan panye an!");
        return;
    }

    if (APP_STATE.isDrawBlocked) {
        alert("Tiraj sa a ap rantre nan 3 minit. Ou pa ka enprime fich.");
        return;
    }

    // Grouper les paris par tirage
    const betsByDraw = {};
    APP_STATE.currentCart.forEach(bet => {
        if (!betsByDraw[bet.drawId]) betsByDraw[bet.drawId] = [];
        betsByDraw[bet.drawId].push(bet);
    });

    const drawIds = Object.keys(betsByDraw);
    let savedTickets = [];

    try {
        // Sauvegarder chaque ticket individuellement
        for (const drawId of drawIds) {
            const drawBets = betsByDraw[drawId];
            const draw = CONFIG.DRAWS.find(d => d.id === drawId);
            const ticketData = {
                agentId: APP_STATE.agentId,
                agentName: APP_STATE.agentName,
                drawId: drawId,
                drawName: draw?.name || drawId,
                bets: drawBets,
                total: drawBets.reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0)
            };

            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SAVE_TICKET}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: JSON.stringify(ticketData)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Erreur serveur: ${response.status} - ${errorText}`);
            }

            const savedTicket = await response.json();
            savedTickets.push(savedTicket.ticket);
            APP_STATE.ticketsHistory.unshift(savedTicket.ticket);
        }

        // Impression : un seul ticket si multi-tirage
        if (savedTickets.length > 1) {
            // Créer un ticket composite pour l'impression uniquement
            const compositeTicket = {
                id: `COMPOSITE-${Date.now()}`,
                ticket_id: `MULTI-${Date.now()}`,
                draw_name: "Tiraj MilTip",
                date: new Date().toISOString(),
                agent_name: APP_STATE.agentName,
                total_amount: savedTickets.reduce((sum, t) => sum + (parseFloat(t.total_amount) || 0), 0),
                bets: savedTickets.flatMap(t => t.bets || []), // Fusionner tous les paris
                multiDraw: true,
                subTickets: savedTickets.map(t => ({ id: t.ticket_id || t.id, drawName: t.draw_name }))
            };
            printThermalTicket(compositeTicket);
            alert(`✅ ${savedTickets.length} fich sove ak siksè! Yon sèl papye enprime.`);
        } else {
            // Un seul tirage
            printThermalTicket(savedTickets[0]);
            alert(`✅ Fich #${savedTickets[0].id || savedTickets[0].ticket_id} sove ak siksè epi enprime!`);
        }

        APP_STATE.currentCart = [];
        CartManager.renderCart();

    } catch (error) {
        console.error('❌ Erreur sauvegarde:', error);
        alert(`❌ Erè sou sèvè a: ${error.message}\nFich la pa sove.`);
    }
}

function printThermalTicket(ticket) {
    try {
        // Générer le HTML du ticket
        const ticketHTML = generateTicketHTML(ticket);
        
        // Créer un conteneur temporaire
        const printContainer = document.createElement('div');
        printContainer.id = 'thermal-print-container';
        printContainer.style.position = 'fixed';
        printContainer.style.top = '-100%';
        printContainer.style.left = '-100%';
        printContainer.style.width = '100%';
        printContainer.style.height = 'auto';
        printContainer.style.backgroundColor = '#fff';
        printContainer.style.zIndex = '-1000';
        printContainer.style.visibility = 'hidden'; // Sera visible uniquement à l'impression grâce aux médias
        printContainer.innerHTML = ticketHTML;
        
        document.body.appendChild(printContainer);
        
        // Ajouter temporairement une feuille de style pour l'impression
        const style = document.createElement('style');
        style.id = 'print-style-temp';
        style.textContent = `
            @media print {
                body > *:not(#thermal-print-container) {
                    display: none !important;
                }
                #thermal-print-container {
                    position: static !important;
                    visibility: visible !important;
                    display: block !important;
                    width: 100%;
                    margin: 0;
                    padding: 0;
                }
            }
        `;
        document.head.appendChild(style);
        
        // Déclencher l'impression
        window.print();
        
        // Nettoyer après impression (avec un délai pour laisser le temps à l'impression de démarrer)
        setTimeout(() => {
            if (document.body.contains(printContainer)) {
                document.body.removeChild(printContainer);
            }
            const tempStyle = document.getElementById('print-style-temp');
            if (tempStyle) {
                document.head.removeChild(tempStyle);
            }
        }, 1000);
        
    } catch (error) {
        console.error('Erreur impression:', error);
        alert("Impossible d'imprimer le ticket. Vérifiez votre connexion ou réessayez.");
    }
}

function generateTicketHTML(ticket) {
    const lotteryConfig = APP_STATE.lotteryConfig || CONFIG;
    const lotteryName = lotteryConfig.LOTTERY_NAME || lotteryConfig.name || 'LOTTERIE';
    const slogan = lotteryConfig.slogan || '';
    const logoUrl = lotteryConfig.LOTTERY_LOGO || lotteryConfig.logo || '';
    const address = lotteryConfig.LOTTERY_ADDRESS || lotteryConfig.address || '';
    const phone = lotteryConfig.LOTTERY_PHONE || lotteryConfig.phone || '';
    
    let betsHtml = '';
    if (Array.isArray(ticket.bets)) {
        betsHtml = ticket.bets.map(b => {
            let gameName = '';
            if (b.isAutoGenerated && b.specialType) gameName = b.specialType.toUpperCase();
            else if (b.isAutoGenerated) gameName = `${(b.game || '').replace('_', ' ').toUpperCase()}*`;
            else gameName = (b.game || '').toUpperCase();
            if (b.option) gameName += ` (${b.option})`;
            
            const number = b.number || '';
            const amount = (b.amount || 0).toLocaleString('fr-FR');
            
            return `
                <div style="display: flex; justify-content: space-between; margin: 4px 0; font-size: 12px;">
                    <span style="flex: 2; text-align: left;">${gameName} ${number}</span>
                    <span style="flex: 1; text-align: right; font-weight: bold;">${amount} G</span>
                </div>
            `;
        }).join('');
    }
    
    // Si c'est un ticket composite, on peut ajouter une mention
    const multiDrawNote = ticket.multiDraw ? 
        '<div style="text-align:center; font-weight:bold; margin:5px 0;">--- MULTI-TIRAJ ---</div>' : '';

    // Styles intégrés directement pour l'impression
    return `
        <style>
            @media print {
                @page {
                    size: 80mm auto;
                    margin: 2mm;
                }
                body, html {
                    margin: 0;
                    padding: 0;
                    background: white;
                    font-family: 'Arial', 'Helvetica', sans-serif;
                    font-size: 11px;
                    width: 76mm;
                }
                .ticket {
                    padding: 3mm;
                    background: #ffffff;
                    color: #000000;
                    line-height: 1.3;
                }
                .ticket-header {
                    text-align: center;
                    border-bottom: 1px solid #000;
                    padding-bottom: 5px;
                    margin-bottom: 5px;
                }
                .ticket-header h2 {
                    margin: 5px 0 2px 0;
                    font-size: 16px;
                    font-weight: bold;
                    text-transform: uppercase;
                }
                .ticket-header .slogan {
                    font-style: italic;
                    font-size: 10px;
                    color: #333;
                }
                .ticket-header .address,
                .ticket-header .phone {
                    font-size: 9px;
                    color: #555;
                }
                .ticket-body {
                    margin: 8px 0;
                }
                .info-line {
                    display: flex;
                    justify-content: space-between;
                    margin: 3px 0;
                    font-size: 11px;
                }
                .info-line .label {
                    font-weight: bold;
                }
                .divider {
                    border-top: 1px dashed #333;
                    margin: 8px 0;
                }
                .bets-title {
                    font-weight: bold;
                    font-size: 12px;
                    margin: 8px 0 4px 0;
                    text-align: center;
                }
                .total-line {
                    display: flex;
                    justify-content: space-between;
                    font-weight: bold;
                    font-size: 13px;
                    margin-top: 8px;
                    padding-top: 5px;
                    border-top: 2px solid #000;
                }
                .ticket-footer {
                    text-align: center;
                    margin-top: 10px;
                    border-top: 1px solid #000;
                    padding-top: 5px;
                    font-size: 10px;
                }
                .ticket-footer p {
                    margin: 3px 0;
                }
                .logo {
                    max-width: 60mm;
                    max-height: 15mm;
                    margin: 0 auto;
                    display: block;
                }
            }
        </style>
        <div class="ticket">
            <div class="ticket-header">
                ${logoUrl ? `<img src="${logoUrl}" class="logo" alt="${lotteryName}">` : ''}
                <h2>${lotteryName}</h2>
                ${slogan ? `<div class="slogan">${slogan}</div>` : ''}
                ${address ? `<div class="address">${address}</div>` : ''}
                ${phone ? `<div class="phone">Tel: ${phone}</div>` : ''}
            </div>
            
            <div class="ticket-body">
                <div class="info-line">
                    <span class="label">Tiraj:</span>
                    <span>${(ticket.draw_name || '').toUpperCase()}</span>
                </div>
                <div class="info-line">
                    <span class="label">Ticket #:</span>
                    <span>${ticket.ticket_id || ticket.id}</span>
                </div>
                <div class="info-line">
                    <span class="label">Date:</span>
                    <span>${new Date(ticket.date).toLocaleString('fr-FR')}</span>
                </div>
                <div class="info-line">
                    <span class="label">Ajan:</span>
                    <span>${ticket.agent_name || APP_STATE.agentName}</span>
                </div>
                
                <div class="divider"></div>
                
                <div class="bets-title">DETAY PARAY</div>
                ${multiDrawNote}
                ${betsHtml}
                
                <div class="divider"></div>
                
                <div class="total-line">
                    <span>TOTAL:</span>
                    <span>${(ticket.total_amount || ticket.total || 0).toLocaleString('fr-FR')} Gdes</span>
                </div>
            </div>
            
            <div class="ticket-footer">
                <p>Mèsi paske ou chwazi nou!</p>
                <p>Bòn Chans!</p>
                <p style="font-size:12px; font-weight:bold;">LOTATO</p>
                <p style="font-size:8px;">${new Date().toLocaleString()}</p>
            </div>
        </div>
    `;
}

function closeWinnerModal() {
    document.getElementById('winner-overlay').style.display = 'none';
}

// Les autres fonctions (impression de rapports, etc.) restent inchangées
// ... (les fonctions existantes après ce point ne sont pas modifiées, mais pour la complétude, nous les incluons dans le fichier final)