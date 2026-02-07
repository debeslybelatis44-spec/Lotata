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

            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SAVE_TICKET}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(ticketData)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Erreur serveur: ${response.status} - ${errorText}`);
            }

            const savedTicket = await response.json();
            console.log('Ticket sauvegardé:', savedTicket);
            tickets.push(savedTicket.ticket);
            
            if (savedTicket.ticket) {
                APP_STATE.ticketsHistory.unshift(savedTicket.ticket);
            }
            
            if (savedTicket.ticket) {
                printThermalTicket(savedTicket.ticket);
            }
        }
        
        if (tickets.length === 1) {
            alert(`✅ Fich #${tickets[0].id || tickets[0].ticket_id} sove ak siksè epi enprime!`);
        } else {
            alert(`✅ ${tickets.length} fich sove ak siksè epi enprime!`);
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
        const printWindow = window.open('', '_blank', 'width=300,height=600');
        
        if (!printWindow) {
            alert("Tanpri pèmèt pop-up pou enprime tikè a.");
            return;
        }
        
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
                    gameName += ` (Opsyon ${b.option})`;
                }
                
                return `
                    <div style="display:flex; justify-content:space-between; font-size:14px; margin-bottom: 5px;">
                        <span>${gameName} ${b.number || ''}</span>
                        <span>${b.amount || 0}G</span>
                    </div>
                `;
            }).join('');
        }

        const lotteryConfig = APP_STATE.lotteryConfig || CONFIG;
        const lotteryName = lotteryConfig.LOTTERY_NAME;
        const logoHtml = lotteryConfig.LOTTERY_LOGO ? 
            `<img src="${lotteryConfig.LOTTERY_LOGO}" style="max-width: 100px; margin: 10px auto; display: block;" alt="${lotteryName}">` : 
            '';
        const addressHtml = lotteryConfig.LOTTERY_ADDRESS ? `<p style="font-size:10px; margin: 5px 0;">${lotteryConfig.LOTTERY_ADDRESS}</p>` : '';
        const phoneHtml = lotteryConfig.LOTTERY_PHONE ? `<p style="font-size:10px; margin: 5px 0;">Tel: ${lotteryConfig.LOTTERY_PHONE}</p>` : '';

        const content = `
            <html>
            <head>
                <title>Ticket #${ticket.ticket_id || ticket.id}</title>
                <style>
                    body { 
                        font-family: 'Courier New', monospace; 
                        width: 100%; 
                        padding: 10px; 
                        margin: 0; 
                        text-align: center; 
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    h2, h3 { margin: 5px 0; }
                    p { margin: 3px 0; }
                    hr { border: 1px dashed #000; margin: 10px 0; }
                    @media print {
                        body { margin: 0; padding: 0; }
                    }
                </style>
            </head>
            <body>
                ${logoHtml}
                <h2 style="margin-bottom:5px;">${lotteryName}</h2>
                ${addressHtml}
                ${phoneHtml}
                <hr>
                <p style="font-size:14px; font-weight:bold;">TIRAJ: ${(ticket.draw_name || '').toUpperCase()}</p>
                <p style="font-size:12px;">TICKET: #${ticket.ticket_id || ticket.id}</p>
                <p style="font-size:12px;">DATE: ${new Date(ticket.date).toLocaleString('fr-FR')}</p>
                <p style="font-size:12px;">AJAN: ${ticket.agent_name || APP_STATE.agentName}</p>
                <hr>
                <div style="text-align:left; padding:0 10px;">
                    ${betsHtml}
                </div>
                <hr>
                <h3 style="margin-top:5px;">TOTAL: ${ticket.total_amount || ticket.total} Gdes</h3>
                <p style="font-size:10px; margin-top:15px;">Mèci paske ou chwazi nou!</p>
                <p style="font-size:10px;">Bòn Chans!</p>
                <hr>
                <p style="font-size:12px; font-weight:bold; margin-top:10px;">LOTATO</p>
                <br><br>
                <script>
                    window.onload = function() {
                        setTimeout(function() {
                            window.print();
                            setTimeout(function() {
                                window.close();
                            }, 500);
                        }, 500);
                    }
                <\/script>
            </body>
            </html>
        `;

        printWindow.document.write(content);
        printWindow.document.close();
        
    } catch (error) {
        console.error('Erreur impression:', error);
        alert('Erè pandan enprimri tikè a. Tanpri eseye ankò.');
    }
}

function closeWinnerModal() {
    document.getElementById('winner-overlay').style.display = 'none';
}