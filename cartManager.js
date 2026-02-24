// cartManager.js - VERSION CORRIGÉE POUR L'IMPRESSION

var CartManager = {
    // ... (Gardez vos fonctions addBet, removeBet, renderCart telles quelles)
};

/**
 * Cette fonction remplace l'ancienne logique. 
 * Elle imite la méthode de uiManager mais avec une sécurité anti-blocage.
 */
function printThermalTicket(ticket) {
    const lotteryConfig = APP_STATE.lotteryConfig || {
        LOTTERY_NAME: "BOUL PAW",
        LOTTERY_LOGO: ""
    };
    
    // Préparation des paris (formatage texte)
    let betsHtml = '';
    const bets = ticket.bets || [];
    betsHtml = bets.map(b => `
        <div style="display: flex; justify-content: space-between; margin: 3px 0; font-family: monospace;">
            <span>${(b.game || '').toUpperCase()} ${(b.number || b.numero)}</span>
            <span style="font-weight: bold;">${(b.amount || 0)} G</span>
        </div>
    `).join('');

    const ticketId = ticket.ticket_id || ticket.id || '000000';
    const dateStr = new Date(ticket.date || Date.now()).toLocaleString('fr-FR');

    const content = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            @page { size: auto; margin: 0mm; }
            body { 
                font-family: 'Courier New', Courier, monospace; 
                width: 80mm; 
                margin: 0; 
                padding: 10px;
                font-size: 13px;
                line-height: 1.2;
            }
            .header { text-align: center; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 5px; }
            .ticket-info { margin-bottom: 10px; font-size: 12px; }
            .divider { border-top: 1px dashed #000; margin: 5px 0; }
            .total { 
                display: flex; 
                justify-content: space-between; 
                font-weight: bold; 
                font-size: 16px; 
                margin-top: 10px;
                border-top: 1px solid #000;
                padding-top: 5px;
            }
            .footer { text-align: center; margin-top: 15px; font-size: 11px; }
            .barcode { text-align: center; margin-top: 10px; font-size: 10px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h2 style="margin:0; text-transform: uppercase;">${lotteryConfig.LOTTERY_NAME}</h2>
            <div style="font-size: 11px;">${lotteryConfig.LOTTERY_ADDRESS || ''}</div>
            <div style="font-size: 11px;">${lotteryConfig.LOTTERY_PHONE || ''}</div>
        </div>
        
        <div class="ticket-info">
            <div>Date: ${dateStr}</div>
            <div>Ticket #: <strong>${ticketId}</strong></div>
            <div>Tiraj: <strong>${ticket.draw_name || 'N/A'}</strong></div>
            <div>Ajan: ${ticket.agent_name || APP_STATE.agentName || ''}</div>
        </div>

        <div class="divider"></div>
        <div class="bets-container">
            ${betsHtml}
        </div>
        <div class="total">
            <span>TOTAL</span>
            <span>${(ticket.total_amount || ticket.total || 0)} Gdes</span>
        </div>

        <div class="footer">
            <p>Mèsi pou konfyans ou!<br>Bòn Chans!</p>
            <div class="barcode">* ${ticketId} *</div>
        </div>
    </body>
    </html>
    `;

    // CRÉATION DE LA FENÊTRE D'IMPRESSION (Méthode robuste)
    const printWindow = window.open('', '_blank', 'width=600,height=800');
    
    if (!printWindow) {
        alert("Erreur: Le bloqueur de publicités empêche l'impression. Veuillez autoriser les popups pour ce site.");
        return;
    }

    printWindow.document.write(content);
    printWindow.document.close();

    // Attendre que le contenu soit "prêt" dans le DOM de la nouvelle fenêtre
    printWindow.focus();
    
    // On utilise un délai légèrement plus long pour garantir que le moteur de rendu a fini
    setTimeout(() => {
        printWindow.print();
        // On ne ferme la fenêtre que si l'utilisateur a fini (certains navigateurs ferment trop vite)
        printWindow.onafterprint = () => printWindow.close();
    }, 500);
}

// Fonction de sauvegarde modifiée pour appeler l'impression
async function processFinalTicket() {
    if (APP_STATE.currentCart.length === 0) {
        alert("Panyen an vid!");
        return;
    }

    try {
        const ticketData = {
            agentId: APP_STATE.agentId,
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

        const result = await response.json();

        if (response.ok && result.success) {
            // L'objet ticket retourné par votre API
            const savedTicket = result.ticket;
            
            // 1. Ajouter à l'historique local
            if (APP_STATE.ticketsHistory) {
                APP_STATE.ticketsHistory.unshift(savedTicket);
            }

            // 2. LANCER L'IMPRESSION
            printThermalTicket(savedTicket);

            // 3. Vider le panier et notifier
            APP_STATE.currentCart = [];
            CartManager.renderCart();
            
            // Optionnel : un petit message de succès
            console.log("Ticket imprimé avec succès");
        } else {
            alert("Erè: " + (result.message || "Impossible de sauver le ticket"));
        }

    } catch (error) {
        console.error('Erreur lors du traitement:', error);
        alert("Erè rezo. Verifye koneksyon ou.");
    }
}

// Exposer les fonctions au window pour les boutons HTML
window.processFinalTicket = processFinalTicket;
window.printThermalTicket = printThermalTicket;
