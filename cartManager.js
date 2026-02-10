const CartManager = {
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

        if (APP_STATE.selectedGame === 'bo') {
            const boBets = SpecialGames.generateBOBets(amt);
            
            if (boBets.length === 0) {
                alert("Pa gen boules paires pou ajoute");
                return;
            }

            const draws = APP_STATE.multiDrawMode ? APP_STATE.selectedDraws : [APP_STATE.selectedDraw];
            
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
        APP_STATE.currentCart = APP_STATE.currentCart.filter(item => item.id !== id);
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

async function processFinalTicket() {
    if (APP_STATE.currentCart.length === 0) {
        alert("Pa gen anyen nan panye an!");
        return;
    }

    if (APP_STATE.isDrawBlocked) {
        alert("Tiraj sa a ap rantre nan 3 minit. Ou pa ka enprime fich.");
        return;
    }

    // Vérifier l'authentification
    const token = localStorage.getItem('auth_token');
    if (!token) {
        alert("Ou pa konekte! Tanpri rekonekte.");
        window.location.href = 'index.html';
        return;
    }

    const betsByDraw = {};
    APP_STATE.currentCart.forEach(bet => {
        if (!betsByDraw[bet.drawId]) {
            betsByDraw[bet.drawId] = [];
        }
        betsByDraw[bet.drawId].push({
            ...bet,
            id: bet.id || Date.now() + Math.random(),
            drawName: bet.drawName || CONFIG.DRAWS.find(d => d.id === bet.drawId)?.name || bet.drawId,
            timestamp: bet.timestamp || new Date().toISOString(),
            isAutoGenerated: bet.isAutoGenerated || false,
            specialType: bet.specialType || null,
            option: bet.option || null
        });
    });

    const drawIds = Object.keys(betsByDraw);
    let tickets = [];
    
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

            console.log('📤 Envoi ticket vers API:', ticketData);
            
            // Utiliser APIService.saveTicket qui gère déjà l'authentification
            const responseData = await APIService.saveTicket(ticketData);
            
            console.log('✅ Ticket sauvegardé:', responseData);
            
            if (responseData.ticket) {
                tickets.push(responseData.ticket);
                APP_STATE.ticketsHistory.unshift(responseData.ticket);
                
                // Imprimer le ticket
                printThermalTicket(responseData.ticket);
            }
        }
        
        if (tickets.length === 1) {
            alert(`✅ Fich #${tickets[0].id || tickets[0].ticket_id} sove ak siksè epi enprime!`);
        } else {
            alert(`✅ ${tickets.length} fich sove ak siksè epi enprime!`);
        }
        
        // Vider le panier
        APP_STATE.currentCart = [];
        CartManager.renderCart();
        
        // Rafraîchir l'historique
        if (APP_STATE.currentTab === 'history') {
            loadHistory();
        }
        
        // Rafraîchir les rapports
        if (APP_STATE.currentTab === 'reports') {
            loadReports();
        }
        
    } catch (error) {
        console.error('❌ Erreur sauvegarde:', error);
        alert(`❌ Erè sou sèvè a: ${error.message}\nFich la pa sove.`);
    }
}

function printThermalTicket(ticket) {
    try {
        const printContent = generateTicketHTML(ticket);
        
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
        iframeDoc.write(printContent);
        iframeDoc.close();
        
        setTimeout(() => {
            iframe.contentWindow.focus();
            
            iframe.contentWindow.print();
            
            setTimeout(() => {
                document.body.removeChild(iframe);
            }, 1000);
            
        }, 500);
        
    } catch (error) {
        console.error('Erreur impression:', error);
        fallbackPrintTicket(ticket);
    }
}

function generateTicketHTML(ticket) {
    const lotteryConfig = APP_STATE.lotteryConfig || CONFIG;
    const lotteryName = lotteryConfig.LOTTERY_NAME || 'LOTTERIE';
    const logoUrl = lotteryConfig.LOTTERY_LOGO || '';
    const address = lotteryConfig.LOTTERY_ADDRESS || '';
    const phone = lotteryConfig.LOTTERY_PHONE || '';
    
    let betsHtml = '';
    if (Array.isArray(ticket.bets)) {
        betsHtml = ticket.bets.map(b => {
            let gameName = '';
            if (b.isAutoGenerated && b.specialType) {
                gameName = b.specialType.toUpperCase();
            } else if (b.isAutoGenerated) {
                gameName = `${(b.game || '').replace('_', ' ').toUpperCase()}*`;
            } else {
                gameName = (b.game || '').toUpperCase();
            }
            
            if (b.option) {
                gameName += ` (${b.option})`;
            }
            
            const number = b.number || '';
            const amount = b.amount || 0;
            
            return `
                <div style="display:flex; justify-content:space-between; font-size:12px; margin:2px 0;">
                    <span style="flex:2; text-align:left;">${gameName} ${number}</span>
                    <span style="flex:1; text-align:right;">${amount}G</span>
                </div>
            `;
        }).join('');
    }
    
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
                        font-family: 'Courier New', monospace;
                        font-size: 11px;
                        width: 76mm;
                        margin: 0;
                        padding: 2mm;
                        color: #000;
                        background: #fff;
                    }
                    * {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .ticket-header {
                        text-align: center;
                        border-bottom: 1px dashed #000;
                        padding-bottom: 5px;
                        margin-bottom: 5px;
                    }
                    .ticket-body {
                        margin: 5px 0;
                    }
                    .ticket-footer {
                        border-top: 1px dashed #000;
                        padding-top: 5px;
                        margin-top: 5px;
                        text-align: center;
                    }
                    .bold { font-weight: bold; }
                    .center { text-align: center; }
                    .left { text-align: left; }
                    .right { text-align: right; }
                    .mb-1 { margin-bottom: 3px; }
                    .mt-1 { margin-top: 3px; }
                    .logo {
                        max-width: 60mm;
                        max-height: 20mm;
                        margin: 0 auto;
                    }
                }
            </style>
        </head>
        <body onload="window.print(); setTimeout(() => window.close(), 500);">
            <div class="ticket-header">
                ${logoUrl ? `<img src="${logoUrl}" class="logo" alt="${lotteryName}">` : ''}
                <h2 class="bold mb-1" style="font-size:14px;">${lotteryName}</h2>
                ${address ? `<p style="font-size:9px;">${address}</p>` : ''}
                ${phone ? `<p style="font-size:9px;">Tel: ${phone}</p>` : ''}
            </div>
            
            <div class="ticket-body">
                <p class="bold center mb-1">TIRAJ: ${(ticket.draw_name || '').toUpperCase()}</p>
                <p class="mb-1">Ticket: #${ticket.ticket_id || ticket.id}</p>
                <p class="mb-1">Date: ${new Date(ticket.date).toLocaleString('fr-FR')}</p>
                <p class="mb-1">Ajan: ${ticket.agent_name || APP_STATE.agentName}</p>
                
                <div style="border-top: 1px dashed #000; margin: 5px 0;"></div>
                
                <div class="bold mb-1">DETAY PARAY:</div>
                ${betsHtml}
                
                <div style="border-top: 1px dashed #000; margin: 5px 0;"></div>
                
                <div style="display:flex; justify-content:space-between; font-size:13px;" class="bold">
                    <span>TOTAL:</span>
                    <span>${ticket.total_amount || ticket.total} Gdes</span>
                </div>
            </div>
            
            <div class="ticket-footer">
                <p style="font-size:10px; margin:3px 0;">Mèci paske ou chwazi nou!</p>
                <p style="font-size:10px; margin:3px 0;">Bòn Chans!</p>
                <p style="font-size:12px; font-weight:bold; margin-top:5px;">LOTATO</p>
                <p style="font-size:8px; margin-top:3px;">${new Date().toLocaleString()}</p>
            </div>
        </body>
        </html>
    `;
}

function fallbackPrintTicket(ticket) {
    const printWindow = window.open('', '_blank', 'width=300,height=600');
    if (!printWindow) {
        alert("Tanpri pèmèt pop-up pou enprime tikè a.");
        return;
    }
    
    printWindow.document.write(generateTicketHTML(ticket));
    printWindow.document.close();
}

function closeWinnerModal() {
    const overlay = document.getElementById('winner-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// Fonctions pour l'interface agent uniquement
window.CartManager = CartManager;
window.processFinalTicket = processFinalTicket;
window.printThermalTicket = printThermalTicket;
window.fallbackPrintTicket = fallbackPrintTicket;
window.closeWinnerModal = closeWinnerModal;