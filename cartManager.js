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
            
            const cleanNum = GameEngine.getCleanNumber(num);
            for (const drawId of draws) {
                if (isNumberBlocked(cleanNum, drawId)) {
                    alert(`Nimewo ${cleanNum} bloke, pa ka ajoute.`);
                    return;
                }
            }

            for (const drawId of draws) {
                if (APP_STATE.drawNumberLimits && APP_STATE.drawNumberLimits[drawId]) {
                    const limits = APP_STATE.drawNumberLimits[drawId];
                    const currentTotalInCart = APP_STATE.currentCart
                        .filter(item => item.drawId === drawId && item.cleanNumber === cleanNum)
                        .reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
                    const newTotal = currentTotalInCart + amt;
                    if (limits[cleanNum] && newTotal > limits[cleanNum]) {
                        alert(`Atansyon: Limite pou nimewo ${cleanNum} se ${limits[cleanNum]} Gdes. Ou ap depase si w ajoute sa.`);
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
        
        for (const drawId of draws) {
            if (isNumberBlocked(num, drawId)) {
                alert(`Nimewo ${num} bloke pou tiraj sa a. Ou pa ka jwe li.`);
                return;
            }
        }

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

    const betsByDraw = {};
    APP_STATE.currentCart.forEach(bet => {
        if (!betsByDraw[bet.drawId]) betsByDraw[bet.drawId] = [];
        betsByDraw[bet.drawId].push(bet);
    });

    const drawIds = Object.keys(betsByDraw);
    let savedTickets = [];

    try {
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

        if (savedTickets.length > 1) {
            const compositeTicket = {
                id: `COMPOSITE-${Date.now()}`,
                ticket_id: `MULTI-${Date.now()}`,
                draw_name: "Tiraj MilTip",
                date: new Date().toISOString(),
                agent_name: APP_STATE.agentName,
                total_amount: savedTickets.reduce((sum, t) => sum + (parseFloat(t.total_amount) || 0), 0),
                bets: savedTickets.flatMap(t => t.bets || []),
                multiDraw: true,
                subTickets: savedTickets.map(t => ({ id: t.ticket_id || t.id, drawName: t.draw_name }))
            };
            printThermalTicket(compositeTicket);
            alert(`✅ ${savedTickets.length} fich sove ak siksè! Yon sèl papye enprime.`);
        } else {
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

// Impression de ticket selon la même logique que uiManager (sans fermeture auto)
function printThermalTicket(ticket) {
    try {
        const printContent = generateTicketHTML(ticket);
        const printWindow = window.open('', '_blank', 'width=400,height=600');
        if (!printWindow) {
            alert("Tanpri pèmèt pop-up pou enprime tikè a.");
            return;
        }
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print(); // L'utilisateur fermera la fenêtre manuellement après impression
    } catch (error) {
        console.error('Erreur impression:', error);
        alert('Erè pandan enpresyon an.');
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
    
    const multiDrawNote = ticket.multiDraw ? 
        '<div style="text-align:center; font-weight:bold; margin:5px 0;">--- MULTI-TIRAJ ---</div>' : '';

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Ticket #${ticket.ticket_id || ticket.id}</title>
            <style>
                @media print {
                    @page {
                        size: 80mm auto;
                        margin: 2mm;
                    }
                    body {
                        font-family: 'Arial', 'Helvetica', sans-serif;
                        font-size: 11px;
                        width: 76mm;
                        margin: 0 auto;
                        padding: 3mm;
                        color: #000000;
                        background: #ffffff;
                        line-height: 1.3;
                    }
                    * {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
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
        </head>
        <body>
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
        </body>
        </html>
    `;
}

// --- Rapports et autres fonctions d'impression (inchangées) ---

function printDailyReport() {
    if (!APP_STATE.ticketsHistory || APP_STATE.ticketsHistory.length === 0) {
        alert("Pa gen tikè nan istorik la!");
        return;
    }
    
    const today = new Date().toLocaleDateString('fr-FR');
    const todayTickets = APP_STATE.ticketsHistory.filter(ticket => 
        new Date(ticket.date).toLocaleDateString('fr-FR') === today
    );
    
    if (todayTickets.length === 0) {
        alert("Pa gen tikè pou jodi a!");
        return;
    }
    
    const totalAmount = todayTickets.reduce((sum, ticket) => 
        sum + (parseFloat(ticket.total_amount) || 0), 0
    );
    
    const reportContent = generateReportHTML(todayTickets, today, totalAmount);
    
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    iframe.style.left = '-1000px';
    iframe.style.top = '-1000px';
    
    document.body.appendChild(iframe);
    
    let iframeDoc = iframe.contentWindow || iframe.contentDocument;
    if (iframeDoc.document) {
        iframeDoc = iframeDoc.document;
    }
    
    iframeDoc.open();
    iframeDoc.write(reportContent);
    iframeDoc.close();
    
    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        
        setTimeout(() => {
            document.body.removeChild(iframe);
        }, 1000);
    }, 500);
}

function generateReportHTML(tickets, date, totalAmount) {
    const lotteryConfig = APP_STATE.lotteryConfig || CONFIG;
    const lotteryName = lotteryConfig.LOTTERY_NAME || 'LOTERIE';
    const agentName = APP_STATE.agentName || 'Agent';
    
    let ticketsHtml = tickets.map(ticket => `
        <tr>
            <td>${ticket.ticket_id || ticket.id}</td>
            <td>${ticket.draw_name || ''}</td>
            <td>${new Date(ticket.date).toLocaleTimeString('fr-FR')}</td>
            <td style="text-align:right;">${ticket.total_amount || ticket.total}</td>
        </tr>
    `).join('');
    
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Rapò Jounalye - ${date}</title>
            <style>
                @media print {
                    @page {
                        size: A4;
                        margin: 15mm;
                    }
                    body {
                        font-family: Arial, sans-serif;
                        font-size: 12px;
                        line-height: 1.4;
                    }
                    .report-header {
                        text-align: center;
                        margin-bottom: 20px;
                        border-bottom: 2px solid #000;
                        padding-bottom: 10px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 15px 0;
                    }
                    th, td {
                        border: 1px solid #000;
                        padding: 6px;
                        text-align: left;
                    }
                    th {
                        background-color: #f0f0f0;
                        font-weight: bold;
                    }
                    .total-row {
                        font-weight: bold;
                        background-color: #e0e0e0;
                    }
                    .summary {
                        margin-top: 20px;
                        padding: 10px;
                        border: 1px solid #000;
                        background-color: #f9f9f9;
                    }
                }
            </style>
        </head>
        <body onload="window.print(); setTimeout(() => window.close(), 1000);">
            <div class="report-header">
                <h1>${lotteryName}</h1>
                <h2>Rapò Vann Jounalye</h2>
                <p>Dat: ${date} | Ajan: ${agentName}</p>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th>N° Tikè</th>
                        <th>Tiraj</th>
                        <th>Lè</th>
                        <th>Montan (Gdes)</th>
                    </tr>
                </thead>
                <tbody>
                    ${ticketsHtml}
                </tbody>
                <tfoot>
                    <tr class="total-row">
                        <td colspan="3">TOTAL JENERAL:</td>
                        <td style="text-align:right;">${totalAmount} Gdes</td>
                    </tr>
                </tfoot>
            </table>
            
            <div class="summary">
                <h3>Rezime</h3>
                <p>Total Tikè: ${tickets.length}</p>
                <p>Total Vann: ${totalAmount} Gdes</p>
                <p>Mwayèn pa Tikè: ${(totalAmount / tickets.length).toFixed(2)} Gdes</p>
                <p>Dènye tikè: ${tickets[0] ? new Date(tickets[0].date).toLocaleTimeString('fr-FR') : 'N/A'}</p>
            </div>
            
            <div style="margin-top: 30px; text-align: center; font-size: 10px;">
                <p>Rapò jenere le: ${new Date().toLocaleString('fr-FR')}</p>
                <p>© ${lotteryName} - Tout dwa rezève</p>
            </div>
        </body>
        </html>
    `;
}

function exportPDFReport() {
    if (!APP_STATE.ticketsHistory || APP_STATE.ticketsHistory.length === 0) {
        alert("Pa gen tikè nan istorik la!");
        return;
    }
    
    const today = new Date().toLocaleDateString('fr-FR');
    const todayTickets = APP_STATE.ticketsHistory.filter(ticket => 
        new Date(ticket.date).toLocaleDateString('fr-FR') === today
    );
    
    if (todayTickets.length === 0) {
        alert("Pa gen tikè pou jodi a!");
        return;
    }
    
    const content = generateReportHTML(todayTickets, today, 
        todayTickets.reduce((sum, t) => sum + (parseFloat(t.total_amount) || 0), 0)
    );
    
    const win = window.open('', '_blank');
    win.document.write(content);
    win.document.close();
    
    setTimeout(() => {
        win.print();
    }, 500);
}

window.printDailyReport = printDailyReport;
window.exportPDFReport = exportPDFReport;

function closeWinnerModal() {
    document.getElementById('winner-overlay').style.display = 'none';
}