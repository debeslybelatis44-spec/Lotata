// cartManager.js - VERSION FINALE (Impression Stable et Pro)

var CartManager = {
    // ... (Vos fonctions addBet, removeBet, renderCart restent inchangées)
};

/**
 * Fonction d'impression calquée sur uiManager.printReport
 * Résout le problème de disparition et de mise en page
 */
function printThermalTicket(ticket) {
    const lotteryConfig = {
        name: CONFIG.LOTTERY_NAME || "LOTERIE",
        address: CONFIG.LOTTERY_ADDRESS || "",
        phone: CONFIG.LOTTERY_PHONE || ""
    };

    const ticketId = ticket.ticket_id || ticket.id || '000000';
    const dateStr = new Date(ticket.date || Date.now()).toLocaleString('fr-FR');
    
    // Formatage des paris avec alignement pro
    let betsHtml = '';
    const bets = ticket.bets || [];
    betsHtml = bets.map(b => `
        <div style="display: flex; justify-content: space-between; margin: 4px 0; font-size: 15px;">
            <span style="font-weight: bold;">${(b.game || '').toUpperCase()} ${(b.number || b.numero)}</span>
            <span>${(b.amount || 0)} G</span>
        </div>
    `).join('');

    const content = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Ticket ${ticketId}</title>
        <style>
            @page { size: auto; margin: 0; }
            body { 
                font-family: 'Courier New', Courier, monospace; 
                width: 75mm; 
                margin: 0; 
                padding: 10px;
                background-color: white;
            }
            .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 10px; }
            .header h1 { margin: 0; font-size: 22px; text-transform: uppercase; }
            
            .details { font-size: 13px; line-height: 1.4; margin-bottom: 10px; }
            .details b { font-size: 14px; }
            
            .bets { border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 5px; }
            
            .total-area { 
                display: flex; 
                justify-content: space-between; 
                font-size: 20px; 
                font-weight: bold; 
                margin-top: 5px;
                padding: 5px 0;
            }
            
            .footer { text-align: center; margin-top: 20px; font-size: 12px; border-top: 1px dashed #000; padding-top: 10px; }
            .ticket-no { font-size: 16px; font-weight: bold; margin-top: 5px; display: block; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>${lotteryConfig.name}</h1>
            <div style="font-size: 11px;">${lotteryConfig.address}</div>
            <div style="font-size: 11px;">${lotteryConfig.phone}</div>
        </div>

        <div class="details">
            <div>Tiraj: <b>${ticket.draw_name || 'N/A'}</b></div>
            <div>Dat: ${dateStr}</div>
            <div>Ajan: ${ticket.agent_name || APP_STATE.agentName || ''}</div>
        </div>

        <div class="bets">
            ${betsHtml}
        </div>

        <div class="total-area">
            <span>TOTAL:</span>
            <span>${(ticket.total_amount || ticket.total || 0)} Gdes</span>
        </div>

        <div class="footer">
            <span>Mèsi pou konfyans ou!</span>
            <span class="ticket-no"># ${ticketId}</span>
        </div>
    </body>
    </html>
    `;

    // TECHNIQUE UIMANAGER : Ouverture et écriture directe
    const printWindow = window.open('', '_blank');
    
    if (!printWindow) {
        alert("Erreur : Le navigateur bloque l'ouverture de la fenêtre. Autorisez les pop-ups.");
        return;
    }

    printWindow.document.write(content);
    printWindow.document.close();

    // On laisse le temps au rendu de se charger (comme dans uiManager)
    printWindow.focus();
    
    // ATTENTION : On ne met pas de .close() immédiatement pour que le spooler d'impression reçoive tout.
    setTimeout(() => {
        printWindow.print();
        // Optionnel : printWindow.close(); // Décommentez si vous voulez qu'elle se ferme après
    }, 500);
}

/**
 * Fonction principale de sauvegarde modifiée
 */
async function processFinalTicket() {
    if (APP_STATE.currentCart.length === 0) return;

    try {
        const ticketData = {
            agentId: APP_STATE.agentId,
            drawId: APP_STATE.selectedDraw,
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
            // Lancement de l'impression avec le ticket retourné par le serveur
            printThermalTicket(result.ticket);

            // Reset du panier
            APP_STATE.currentCart = [];
            CartManager.renderCart();
            
            // Mise à jour historique
            if (window.loadHistory) loadHistory(); 
        } else {
            alert("Erè: " + result.message);
        }
    } catch (error) {
        console.error('Erreur:', error);
        alert("Pwoblèm koneksyon ak sèvè a.");
    }
}

// Exportation des fonctions
window.processFinalTicket = processFinalTicket;
window.printThermalTicket = printThermalTicket;
