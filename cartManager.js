// cartManager.js

// Fonction utilitaire pour vérifier si un numéro est bloqué
function isNumberBlocked(number, drawId) {
    if (APP_STATE.globalBlockedNumbers.includes(number)) return true;
    const drawBlocked = APP_STATE.drawBlockedNumbers[drawId] || [];
    return drawBlocked.includes(number);
}

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

        if (APP_STATE.selectedGame === 'bo') {
            const boBets = SpecialGames.generateBOBets(amt);
            if (boBets.length === 0) return;
            const draws = APP_STATE.multiDrawMode ? APP_STATE.selectedDraws : [APP_STATE.selectedDraw];
            
            draws.forEach(drawId => {
                boBets.forEach(bet => {
                    const newBet = { ...bet, id: Date.now() + Math.random(), drawId: drawId, drawName: CONFIG.DRAWS.find(d => d.id === drawId).name };
                    APP_STATE.currentCart.push(newBet);
                });
            });
            this.renderCart();
            amtInput.value = '';
            return;
        }

        // ... (Logique abrégée pour les autres types de jeux n1, n2, grap, auto)
        
        if (!GameEngine.validateEntry(APP_STATE.selectedGame, num)) {
            alert("Nimewo sa pa bon");
            return;
        }

        num = GameEngine.getCleanNumber(num);
        const draws = APP_STATE.multiDrawMode ? APP_STATE.selectedDraws : [APP_STATE.selectedDraw];
        
        draws.forEach(drawId => {
            const bet = {
                id: Date.now() + Math.random(),
                game: APP_STATE.selectedGame,
                number: num,
                cleanNumber: num,
                amount: amt,
                drawId: drawId,
                drawName: CONFIG.DRAWS.find(d => d.id === drawId).name
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
            return `
                <div class="cart-item">
                    <div class="item-info">
                        <span class="item-game">${item.game.toUpperCase()} ${item.number}</span>
                        <span style="font-size:0.8rem; color:var(--text-dim)">${item.drawName}</span>
                    </div>
                    <div class="item-price">
                        <span>${item.amount} Gdes</span>
                        <button onclick="CartManager.removeBet('${item.id}')">×</button>
                    </div>
                </div>
            `;
        }).join('');

        totalDisplay.innerText = total.toLocaleString();
        countDisplay.innerText = APP_STATE.currentCart.length + " jwèt";
        cartTotalDisplay.innerText = total.toLocaleString() + " Gdes";
        summary.style.display = 'block';
    }
};

// --- NOUVELLE LOGIQUE D'IMPRESSION (BASÉE SUR UIMANAGER) ---

function printThermalTicket(ticket) {
    const lotteryConfig = APP_STATE.lotteryConfig || CONFIG;
    
    let betsHtml = '';
    if (Array.isArray(ticket.bets)) {
        betsHtml = ticket.bets.map(b => `
            <div style="display: flex; justify-content: space-between; margin: 2px 0;">
                <span>${(b.game || '').toUpperCase()} ${b.number || b.numero}</span>
                <span style="font-weight: bold;">${(b.amount || 0)} G</span>
            </div>
        `).join('');
    }

    const content = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Ticket #${ticket.ticket_id || ticket.id}</title>
        <style>
            body { font-family: 'Courier New', monospace; width: 80mm; padding: 5mm; font-size: 12px; }
            .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 5px; }
            .content { margin: 10px 0; }
            .footer { text-align: center; border-top: 1px dashed #000; padding-top: 5px; font-size: 10px; }
            .total { font-weight: bold; font-size: 14px; display: flex; justify-content: space-between; margin-top: 5px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h2 style="margin:0;">${lotteryConfig.LOTTERY_NAME || 'LOTERIE'}</h2>
            <p style="margin:2px;">${new Date(ticket.date).toLocaleString('fr-FR')}</p>
            <p style="margin:2px;">Ticket: #${ticket.ticket_id || ticket.id}</p>
        </div>
        <div class="content">
            <p><strong>Tiraj: ${ticket.draw_name}</strong></p>
            <div style="border-bottom: 1px solid #eee; margin-bottom: 5px;"></div>
            ${betsHtml}
            <div class="total">
                <span>TOTAL:</span>
                <span>${(ticket.total_amount || ticket.total || 0)} Gdes</span>
            </div>
        </div>
        <div class="footer">
            <p>Ajan: ${ticket.agent_name || APP_STATE.agentName}</p>
            <p>Mèsi e Bòn Chans!</p>
        </div>
    </body>
    </html>
    `;

    // Utilisation de la méthode de uiManager (window.print() explicite)
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    printWindow.document.write(content);
    printWindow.document.close();
    
    // On laisse un petit délai pour charger le contenu avant d'imprimer
    setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        // Optionnel : printWindow.close();
    }, 250);
}

async function processFinalTicket() {
    if (APP_STATE.currentCart.length === 0) return;
    if (APP_STATE.isDrawBlocked) return;

    try {
        const ticketData = {
            agentId: APP_STATE.agentId,
            agentName: APP_STATE.agentName,
            drawId: APP_STATE.selectedDraw,
            drawName: CONFIG.DRAWS.find(d => d.id === APP_STATE.selectedDraw).name,
            bets: APP_STATE.currentCart,
            total: APP_STATE.currentCart.reduce((sum, b) => sum + b.amount, 0)
        };

        const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SAVE_TICKET}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify(ticketData)
        });

        if (!response.ok) throw new Error('Erreur serveur');

        const result = await response.json();
        const savedTicket = result.ticket;

        // Mise à jour de l'historique et impression
        APP_STATE.ticketsHistory.unshift(savedTicket);
        printThermalTicket(savedTicket);

        // Vider le panier
        APP_STATE.currentCart = [];
        CartManager.renderCart();
        alert("Tikè sove ak siksè!");

    } catch (error) {
        console.error('Erreur:', error);
        alert("Erè nan sovgad tikè a.");
    }
}

window.printDailyReport = function() {
    // Logique similaire à uiManager.printReport
};

window.processFinalTicket = processFinalTicket;
