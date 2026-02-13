function switchTab(tabName) {
    APP_STATE.currentTab = tabName;
    
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    document.querySelectorAll('.nav-item').forEach(nav => {
        nav.classList.remove('active');
    });
    
    let screenId = '';
    switch(tabName) {
        case 'home':
            screenId = 'draw-selection-screen';
            document.querySelector('.nav-item:nth-child(1)').classList.add('active');
            break;
        case 'history':
            screenId = 'history-screen';
            document.querySelector('.nav-item:nth-child(2)').classList.add('active');
            loadHistory();
            break;
        case 'reports':
            screenId = 'reports-screen';
            document.querySelector('.nav-item:nth-child(3)').classList.add('active');
            loadReports();
            break;
        case 'winners':
            screenId = 'winners-screen';
            document.querySelector('.nav-item:nth-child(4)').classList.add('active');
            loadWinners();
            break;
    }
    
    if (screenId) {
        document.getElementById(screenId).classList.add('active');
    }
}

async function loadHistory() {
    try {
        const container = document.getElementById('history-container');
        container.innerHTML = '<div class="empty-msg">Chajman...</div>';
        
        console.log('Début du chargement historique...');
        
        // Récupérer les tickets
        const ticketsData = await APIService.getTickets();
        console.log('Données reçues de getTickets():', ticketsData);
        
        // Normaliser les données
        let tickets = [];
        
        if (Array.isArray(ticketsData)) {
            tickets = ticketsData;
        } else if (ticketsData && Array.isArray(ticketsData.data)) {
            tickets = ticketsData.data;
        } else if (ticketsData && Array.isArray(ticketsData.tickets)) {
            tickets = ticketsData.tickets;
        } else {
            console.warn('Format de données inattendu, tentative de normalisation...', ticketsData);
            // Essayer de créer un tableau à partir de l'objet
            tickets = [ticketsData];
        }
        
        // Stocker dans APP_STATE
        APP_STATE.ticketsHistory = tickets || [];
        
        console.log('Tickets normalisés pour historique:', APP_STATE.ticketsHistory);
        console.log('Nombre de tickets:', APP_STATE.ticketsHistory.length);
        
        if (APP_STATE.ticketsHistory.length > 0) {
            console.log('Exemple de ticket (premier):', APP_STATE.ticketsHistory[0]);
            console.log('Propriétés du premier ticket:', Object.keys(APP_STATE.ticketsHistory[0]));
        }
        
        renderHistory();
    } catch (error) {
        console.error('Erreur chargement historique:', error);
        document.getElementById('history-container').innerHTML = 
            '<div class="empty-msg">Erè chajman istorik: ' + error.message + '</div>';
    }
}

function renderHistory() {
    const container = document.getElementById('history-container');
    
    console.log('Rendu historique, tickets disponibles:', APP_STATE.ticketsHistory);
    
    if (!APP_STATE.ticketsHistory || APP_STATE.ticketsHistory.length === 0) {
        container.innerHTML = '<div class="empty-msg">Pa gen tikè nan istorik</div>';
        return;
    }
    
    container.innerHTML = APP_STATE.ticketsHistory.map((ticket, index) => {
        // DEBUG: Afficher toutes les propriétés du ticket
        console.log(`Ticket ${index + 1}:`, ticket);
        console.log(`Propriétés ticket ${index + 1}:`, Object.keys(ticket));
        
        // Obtenir l'ID du ticket (priorité: ticket_id, puis id)
        const ticketId = ticket.ticket_id || ticket.id || `temp_${Date.now()}_${index}`;
        
        // Extraire les propriétés avec toutes les variantes possibles
        const drawName = ticket.draw_name || ticket.drawName || ticket.draw_name_fr || 'Tiraj Inkonu';
        const totalAmount = ticket.total_amount || ticket.totalAmount || ticket.amount || 0;
        const date = ticket.date || ticket.created_at || ticket.created_date || new Date().toISOString();
        const bets = ticket.bets || ticket.numbers || [];
        const checked = ticket.checked || ticket.verified || false;
        const winAmount = ticket.win_amount || ticket.winAmount || ticket.prize_amount || 0;
        const drawId = ticket.draw_id || ticket.drawId || '';
        
        // Obtenir le nombre de paris
        let numberOfBets = 0;
        if (Array.isArray(bets)) {
            numberOfBets = bets.length;
        } else if (typeof bets === 'object' && bets !== null) {
            numberOfBets = Object.keys(bets).length;
        } else if (typeof bets === 'string') {
            // Si bets est une chaîne JSON
            try {
                const parsedBets = JSON.parse(bets);
                numberOfBets = Array.isArray(parsedBets) ? parsedBets.length : 1;
            } catch (e) {
                numberOfBets = 1;
            }
        }
        
        // Déterminer le statut
        let status = '';
        let statusClass = '';
        
        if (checked) {
            if (winAmount > 0) {
                status = 'GANYEN';
                statusClass = 'badge-win';
            } else {
                status = 'PÈDI';
                statusClass = 'badge-lost';
            }
        } else {
            status = 'AP TANN';
            statusClass = 'badge-wait';
        }
        
        // Vérifier si on peut supprimer (dans les 2 minutes)
        const ticketDate = new Date(date);
        const now = new Date();
        const minutesDiff = (now - ticketDate) / (1000 * 60);
        const canDelete = minutesDiff <= 2;  // MODIFIÉ : 2 minutes au lieu de 5
        
        // Vérifier si on peut modifier (dans les 4 minutes)
        const canEdit = minutesDiff <= 4;
        
        // Formatage de la date
        let formattedDate = 'Date inkonu';
        let formattedTime = '';
        
        try {
            formattedDate = ticketDate.toLocaleDateString('fr-FR');
            formattedTime = ticketDate.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
        } catch (e) {
            formattedDate = 'N/A';
            formattedTime = '';
        }
        
        // Créer le HTML de la carte
        return `
            <div class="history-card" data-ticket-id="${ticketId}">
                <div class="card-header">
                    <span class="ticket-id">#${ticket.ticket_id || ticket.id || 'N/A'}</span>
                    <span class="ticket-date">${formattedDate} ${formattedTime}</span>
                </div>
                <div class="ticket-info">
                    <p><strong>Tiraj:</strong> <span class="draw-name">${drawName}</span></p>
                    <p><strong>Total:</strong> <span class="total-amount">${totalAmount}</span> Gdes</p>
                    <p><strong>Nimewo:</strong> <span class="bet-count">${numberOfBets}</span></p>
                </div>
                <div class="card-footer">
                    <span class="badge ${statusClass}">${status}</span>
                    <div class="action-buttons">
                        <button class="btn-small view-details-btn" onclick="viewTicketDetails('${ticketId}')">
                            <i class="fas fa-eye"></i> Detay
                        </button>
                        <!-- Bouton Modifier -->
                        <button class="edit-history-btn" onclick="editTicket('${ticketId}')" ${canEdit ? '' : 'disabled'}>
                            <i class="fas fa-edit"></i> Modifye
                        </button>
                        <button class="delete-history-btn" onclick="deleteTicket('${ticketId}')" ${canDelete ? '' : 'disabled'}>
                            <i class="fas fa-trash"></i> Efase
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function deleteTicket(ticketId) {
    if (!confirm('Èske ou sèten ou vle efase tikè sa a?')) return;
    
    try {
        await APIService.deleteTicket(ticketId);
        
        // Supprimer le ticket de APP_STATE
        APP_STATE.ticketsHistory = APP_STATE.ticketsHistory.filter(t => 
            (t.id !== ticketId && t.ticket_id !== ticketId)
        );
        
        renderHistory();
        alert('Tikè efase ak siksè!');
    } catch (error) {
        console.error('Erreur suppression:', error);
        alert('Erè nan efasman tikè a: ' + error.message);
    }
}

// Fonction pour modifier un ticket
async function editTicket(ticketId) {
    // Recherche du ticket
    const ticket = APP_STATE.ticketsHistory.find(t => 
        t.id === ticketId || t.ticket_id === ticketId
    );
    
    if (!ticket) {
        alert('Tikè pa jwenn!');
        return;
    }
    
    // Vérifier le délai de modification (4 minutes)
    const ticketDate = new Date(ticket.date || ticket.created_at || ticket.created_date);
    const now = new Date();
    const minutesDiff = (now - ticketDate) / (1000 * 60);
    
    if (minutesDiff > 4) {
        alert('Tikè sa a pa ka modifye paske li gen plis pase 4 minit.');
        return;
    }
    
    // Vérifier si le tirage est bloqué
    const draw = CONFIG.DRAWS.find(d => d.id === (ticket.draw_id || ticket.drawId));
    if (draw && isDrawBlocked(draw.time)) {
        alert('Tiraj sa a ap rantre nan 3 minit. Ou pa ka modifye tikè sa a.');
        return;
    }
    
    // Vider le panier actuel
    APP_STATE.currentCart = [];
    
    // Charger les paris du ticket dans le panier
    let bets = ticket.bets || ticket.numbers || [];
    if (typeof bets === 'string') {
        try {
            bets = JSON.parse(bets);
        } catch (e) {
            bets = [];
        }
    }
    
    if (Array.isArray(bets)) {
        bets.forEach(bet => {
            // Reconstruire l'objet pari avec les informations nécessaires
            const cartItem = {
                ...bet,
                id: Date.now() + Math.random(), // Nouvel ID pour éviter les conflits
                drawId: ticket.draw_id || ticket.drawId,
                drawName: ticket.draw_name || ticket.drawName,
                timestamp: new Date().toISOString()
            };
            APP_STATE.currentCart.push(cartItem);
        });
    }
    
    // Mettre à jour le tirage sélectionné
    APP_STATE.selectedDraw = ticket.draw_id || ticket.drawId;
    APP_STATE.selectedDraws = [APP_STATE.selectedDraw];
    APP_STATE.multiDrawMode = false;
    
    // Mettre à jour le titre de l'écran de pari
    const drawName = ticket.draw_name || ticket.drawName || 'Tiraj';
    document.getElementById('current-draw-title').textContent = drawName;
    
    // Indiquer qu'on est en mode édition
    APP_STATE.editingTicketId = ticketId;
    
    // Basculer vers l'écran de pari
    document.getElementById('draw-selection-screen').classList.remove('active');
    document.getElementById('betting-screen').classList.add('active');
    document.querySelector('.back-button').style.display = 'flex';
    
    // Mettre à jour le sélecteur de jeu et vérifier le statut du tirage
    updateGameSelector();
    checkSelectedDrawStatus();
    
    // Afficher le panier
    CartManager.renderCart();
    
    // Optionnel : message pour indiquer le mode édition
    alert('Ou ap modifye tikè #' + ticketId + '. Ajoute oubyen retire paray, epi klike sou "Enprime Fich" pou sove modifikasyon yo.');
}

// Fonction de déconnexion
function logout() {
    if (confirm('Èske ou vreman vle dekonekte?')) {
        // Rediriger vers la page de login (ou recharger l'application)
        window.location.href = 'login.html'; // À adapter selon votre structure
    }
}

async function loadReports() {
    try {
        // Charger les tickets et rapports depuis l'API
        const ticketsData = await APIService.getTickets();
        
        // Normaliser les tickets comme dans loadHistory()
        let tickets = [];
        if (Array.isArray(ticketsData)) {
            tickets = ticketsData;
        } else if (ticketsData && Array.isArray(ticketsData.data)) {
            tickets = ticketsData.data;
        } else if (ticketsData && Array.isArray(ticketsData.tickets)) {
            tickets = ticketsData.tickets;
        } else {
            tickets = ticketsData ? [ticketsData] : [];
        }
        
        APP_STATE.ticketsHistory = tickets;
        
        const reports = await APIService.getReports();
        
        console.log('Données rapport API:', reports);
        
        // CALCULS
        let totalTickets = 0;
        let totalBets = 0;
        let totalWins = 0;
        let totalLoss = 0;
        
        // Si l'API retourne des rapports, utiliser ces données
        if (reports && reports.total_tickets !== undefined) {
            totalTickets = reports.total_tickets || 0;
            totalBets = reports.total_bets || 0;
            totalWins = reports.total_wins || 0;
            totalLoss = reports.total_loss || 0;
        } else {
            // Sinon calculer à partir des tickets
            totalTickets = APP_STATE.ticketsHistory.length;
            
            APP_STATE.ticketsHistory.forEach(ticket => {
                const ticketAmount = parseFloat(ticket.total_amount || ticket.totalAmount || ticket.amount || 0);
                totalBets += ticketAmount;
                
                if (ticket.checked || ticket.verified) {
                    const winAmount = parseFloat(ticket.win_amount || ticket.winAmount || ticket.prize_amount || 0);
                    if (winAmount > 0) {
                        totalWins += winAmount;
                    } else {
                        totalLoss += ticketAmount;
                    }
                }
            });
        }
        
        const totalProfit = totalBets - totalWins;
        
        // Afficher les statistiques
        document.getElementById('total-tickets').textContent = totalTickets;
        document.getElementById('total-bets').textContent = totalBets.toLocaleString('fr-FR') + ' Gdes';
        document.getElementById('total-wins').textContent = totalWins.toLocaleString('fr-FR') + ' Gdes';
        document.getElementById('total-loss').textContent = totalLoss.toLocaleString('fr-FR') + ' Gdes';
        document.getElementById('balance').textContent = totalProfit.toLocaleString('fr-FR') + ' Gdes';
        document.getElementById('balance').style.color = (totalProfit >= 0) ? 'var(--success)' : 'var(--danger)';
        
        // Remplir le sélecteur de tirage
        const drawSelector = document.getElementById('draw-report-selector');
        drawSelector.innerHTML = '<option value="all">Tout Tiraj</option>';
        
        CONFIG.DRAWS.forEach(draw => {
            const option = document.createElement('option');
            option.value = draw.id;
            option.textContent = draw.name;
            drawSelector.appendChild(option);
        });
        
        // Charger le rapport pour "Tout Tiraj" par défaut
        await loadDrawReport('all');
        
    } catch (error) {
        console.error('Erreur chargement rapports:', error);
        document.getElementById('total-tickets').textContent = '0';
        document.getElementById('total-bets').textContent = '0 Gdes';
        document.getElementById('total-wins').textContent = '0 Gdes';
        document.getElementById('total-loss').textContent = '0 Gdes';
        document.getElementById('balance').textContent = '0 Gdes';
        document.getElementById('balance').style.color = 'var(--success)';
    }
}

async function loadDrawReport(drawId = null) {
    try {
        const selectedDrawId = drawId || document.getElementById('draw-report-selector').value;
        
        if (selectedDrawId === 'all') {
            // Copier les valeurs générales
            const totalTickets = parseInt(document.getElementById('total-tickets').textContent) || 0;
            const totalBetsText = document.getElementById('total-bets').textContent;
            const totalWinsText = document.getElementById('total-wins').textContent;
            const totalLossText = document.getElementById('total-loss').textContent;
            
            const totalBets = parseFloat(totalBetsText.replace(/[^0-9.]/g, '')) || 0;
            const totalWins = parseFloat(totalWinsText.replace(/[^0-9.]/g, '')) || 0;
            const totalLoss = parseFloat(totalLossText.replace(/[^0-9.]/g, '')) || 0;
            const balance = totalBets - totalWins;
            
            document.getElementById('draw-report-card').style.display = 'block';
            document.getElementById('draw-total-tickets').textContent = totalTickets;
            document.getElementById('draw-total-bets').textContent = totalBets.toLocaleString('fr-FR') + ' Gdes';
            document.getElementById('draw-total-wins').textContent = totalWins.toLocaleString('fr-FR') + ' Gdes';
            document.getElementById('draw-total-loss').textContent = totalLoss.toLocaleString('fr-FR') + ' Gdes';
            document.getElementById('draw-balance').textContent = balance.toLocaleString('fr-FR') + ' Gdes';
            document.getElementById('draw-balance').style.color = (balance >= 0) ? 'var(--success)' : 'var(--danger)';
        } else {
            // Calculer pour un tirage spécifique
            const drawTickets = APP_STATE.ticketsHistory.filter(t => 
                t.draw_id === selectedDrawId || t.drawId === selectedDrawId
            );
            
            let drawTotalTickets = drawTickets.length;
            let drawTotalBets = 0;
            let drawTotalWins = 0;
            let drawTotalLoss = 0;
            
            drawTickets.forEach(ticket => {
                const ticketAmount = parseFloat(ticket.total_amount || ticket.totalAmount || ticket.amount || 0);
                drawTotalBets += ticketAmount;
                
                if (ticket.checked || ticket.verified) {
                    const winAmount = parseFloat(ticket.win_amount || ticket.winAmount || ticket.prize_amount || 0);
                    if (winAmount > 0) {
                        drawTotalWins += winAmount;
                    } else {
                        drawTotalLoss += ticketAmount;
                    }
                }
            });
            
            const drawProfit = drawTotalBets - drawTotalWins;
            
            document.getElementById('draw-report-card').style.display = 'block';
            document.getElementById('draw-total-tickets').textContent = drawTotalTickets;
            document.getElementById('draw-total-bets').textContent = drawTotalBets.toLocaleString('fr-FR') + ' Gdes';
            document.getElementById('draw-total-wins').textContent = drawTotalWins.toLocaleString('fr-FR') + ' Gdes';
            document.getElementById('draw-total-loss').textContent = drawTotalLoss.toLocaleString('fr-FR') + ' Gdes';
            document.getElementById('draw-balance').textContent = drawProfit.toLocaleString('fr-FR') + ' Gdes';
            document.getElementById('draw-balance').style.color = (drawProfit >= 0) ? 'var(--success)' : 'var(--danger)';
        }
        
    } catch (error) {
        console.error('Erreur chargement rapport tirage:', error);
        document.getElementById('draw-report-card').style.display = 'block';
        document.getElementById('draw-total-tickets').textContent = '0';
        document.getElementById('draw-total-bets').textContent = '0 Gdes';
        document.getElementById('draw-total-wins').textContent = '0 Gdes';
        document.getElementById('draw-total-loss').textContent = '0 Gdes';
        document.getElementById('draw-balance').textContent = '0 Gdes';
        document.getElementById('draw-balance').style.color = 'var(--success)';
    }
}

function printReport() {
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    
    const drawSelector = document.getElementById('draw-report-selector');
    const selectedDraw = drawSelector.options[drawSelector.selectedIndex].text;
    const selectedDrawId = drawSelector.value;
    
    let reportData = '';
    let totalPending = 0;
    let totalVerified = 0;
    
    let ticketsToAnalyze = selectedDrawId === 'all' 
        ? APP_STATE.ticketsHistory 
        : APP_STATE.ticketsHistory.filter(t => 
            t.draw_id === selectedDrawId || t.drawId === selectedDrawId
          );
    
    totalPending = ticketsToAnalyze.filter(t => !(t.checked || t.verified)).length;
    totalVerified = ticketsToAnalyze.filter(t => t.checked || t.verified).length;
    
    let analyzedTotalBets = 0;
    let analyzedTotalWins = 0;
    let analyzedTotalLoss = 0;
    
    ticketsToAnalyze.forEach(ticket => {
        analyzedTotalBets += parseFloat(ticket.total_amount || ticket.totalAmount || ticket.amount || 0);
        
        if (ticket.checked || ticket.verified) {
            const winAmount = parseFloat(ticket.win_amount || ticket.winAmount || ticket.prize_amount || 0);
            if (winAmount > 0) {
                analyzedTotalWins += winAmount;
            } else {
                analyzedTotalLoss += parseFloat(ticket.total_amount || ticket.totalAmount || ticket.amount || 0);
            }
        }
    });
    
    const analyzedProfit = analyzedTotalBets - analyzedTotalWins;
    
    if (selectedDrawId === 'all') {
        reportData = `
            <h2>Rapò Jeneral Jodi a</h2>
            <p><strong>Dat:</strong> ${new Date().toLocaleDateString('fr-FR')}</p>
            <p><strong>Ajant:</strong> ${APP_STATE.agentName}</p>
            <hr>
            <p><strong>Statistik Tikè:</strong></p>
            <p>• Total Tikè: ${ticketsToAnalyze.length}</p>
            <p>• Tikè Verifye: ${totalVerified}</p>
            <p>• Tikè an Atant: ${totalPending}</p>
            <hr>
            <p><strong>Statistik Finansye:</strong></p>
            <p>Total Paris (Antre Lajan): ${analyzedTotalBets.toLocaleString('fr-FR')} Gdes</p>
            <p>Total pou peye (Ganyen): ${analyzedTotalWins.toLocaleString('fr-FR')} Gdes</p>
            <p>Total Retni (Pèdi): ${analyzedTotalLoss.toLocaleString('fr-FR')} Gdes</p>
            <p><strong>Balans Net: ${analyzedProfit.toLocaleString('fr-FR')} Gdes</strong></p>
        `;
    } else {
        reportData = `
            <h2>Rapò Tiraj ${selectedDraw}</h2>
            <p><strong>Dat:</strong> ${new Date().toLocaleDateString('fr-FR')}</p>
            <p><strong>Ajant:</strong> ${APP_STATE.agentName}</p>
            <hr>
            <p><strong>Statistik Tikè:</strong></p>
            <p>• Total Tikè: ${ticketsToAnalyze.length}</p>
            <p>• Tikè Verifye: ${totalVerified}</p>
            <p>• Tikè an Atant: ${totalPending}</p>
            <hr>
            <p><strong>Statistik Finansye:</strong></p>
            <p>Total Paris (Antre Lajan): ${analyzedTotalBets.toLocaleString('fr-FR')} Gdes</p>
            <p>Total pou peye (Ganyen): ${analyzedTotalWins.toLocaleString('fr-FR')} Gdes</p>
            <p>Total Retni (Pèdi): ${analyzedTotalLoss.toLocaleString('fr-FR')} Gdes</p>
            <p><strong>Balans Net: ${analyzedProfit.toLocaleString('fr-FR')} Gdes</strong></p>
        `;
    }
    
    const lotteryConfig = APP_STATE.lotteryConfig || CONFIG;
    const logoHtml = lotteryConfig.LOTTERY_LOGO ? 
        `<img src="${lotteryConfig.LOTTERY_LOGO}" style="max-width: 100px; margin: 10px auto; display: block;" alt="${lotteryConfig.LOTTERY_NAME}">` : 
        '';
    const addressHtml = lotteryConfig.LOTTERY_ADDRESS ? `<p style="font-size:12px;">${lotteryConfig.LOTTERY_ADDRESS}</p>` : '';
    const phoneHtml = lotteryConfig.LOTTERY_PHONE ? `<p style="font-size:12px;">Tel: ${lotteryConfig.LOTTERY_PHONE}</p>` : '';
    
    const content = `
        <html>
        <head>
            <title>Rapò ${selectedDraw}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h2 { color: #333; }
                hr { border: 1px solid #ccc; margin: 10px 0; }
                p { margin: 8px 0; }
                .note { font-style: italic; color: #666; font-size: 11px; margin-top: 5px; }
                .section { margin: 15px 0; }
                .important { font-weight: bold; font-size: 14px; }
            </style>
        </head>
        <body style="text-align:center;">
            ${logoHtml}
            <h1>${lotteryConfig.LOTTERY_NAME}</h1>
            ${addressHtml}
            ${phoneHtml}
            <hr>
            <div class="section">
                ${reportData}
            </div>
            <hr>
            <p class="note">Balans = Total Paris - Total Ganyen</p>
            <p class="note">Balans pozitif = Pwofi pou ajant</p>
            <p class="note">Balans negatif = Pèt pou ajant</p>
            <hr>
            <p style="font-size:12px;">Jenere nan: ${new Date().toLocaleString('fr-FR')}</p>
        </body>
        </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
    
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
}

async function loadWinners() {
    try {
        await APIService.getWinningTickets();
        await APIService.getWinningResults();
        updateWinnersDisplay();
    } catch (error) {
        console.error('Erreur chargement gagnants:', error);
    }
}

function updateWinnersDisplay() {
    const container = document.getElementById('winners-container');
    
    if (APP_STATE.winningTickets.length === 0) {
        container.innerHTML = '<div class="empty-msg">Pa gen tikè ganyen pou kounye a</div>';
        
        document.getElementById('total-winners-today').textContent = '0';
        document.getElementById('total-winning-amount').textContent = '0 Gdes';
        document.getElementById('average-winning').textContent = '0 Gdes';
        return;
    }
    
    const totalWins = APP_STATE.winningTickets.length;
    const totalAmount = APP_STATE.winningTickets.reduce((sum, ticket) => {
        const winAmount = parseFloat(ticket.win_amount || ticket.winAmount || ticket.prize_amount || 0);
        return sum + winAmount;
    }, 0);
    const averageWin = totalWins > 0 ? totalAmount / totalWins : 0;
    
    document.getElementById('total-winners-today').textContent = totalWins;
    document.getElementById('total-winning-amount').textContent = totalAmount.toLocaleString('fr-FR') + ' Gdes';
    document.getElementById('average-winning').textContent = averageWin.toFixed(2).toLocaleString('fr-FR') + ' Gdes';
    
    container.innerHTML = APP_STATE.winningTickets.map(ticket => {
        const isPaid = ticket.paid || false;
        const winningResults = APP_STATE.winningResults.find(r => 
            r.drawId === (ticket.draw_id || ticket.drawId)
        );
        const resultStr = winningResults ? winningResults.numbers.join(', ') : 'N/A';
        
        const betAmount = parseFloat(ticket.bet_amount || ticket.total_amount || ticket.amount || 0) || 0;
        const winAmount = parseFloat(ticket.win_amount || ticket.winAmount || ticket.prize_amount || 0) || 0;
        const netProfit = winAmount - betAmount;
        
        return `
            <div class="winner-ticket">
                <div class="winner-header">
                    <div>
                        <strong>Tikè #${ticket.ticket_id || ticket.id}</strong>
                        <div style="font-size: 0.8rem; color: var(--text-dim);">
                            ${ticket.draw_name || ticket.drawName} - ${new Date(ticket.date || ticket.created_at).toLocaleDateString('fr-FR')}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: bold; color: var(--success); font-size: 1.1rem;">
                            ${winAmount.toLocaleString('fr-FR')} Gdes
                        </div>
                        <div style="font-size: 0.8rem; color: var(--text-dim);">
                            (Mise: ${betAmount.toLocaleString('fr-FR')}G | Net: ${netProfit.toLocaleString('fr-FR')}G)
                        </div>
                    </div>
                </div>
                <div>
                    <p><strong>Rezilta Tiraj:</strong> ${resultStr}</p>
                    <p><strong>Jwèt:</strong> ${ticket.game_type || ticket.gameType || 'Borlette'}</p>
                    <p><strong>Nimewo Ganyen:</strong> ${ticket.winning_number || ticket.winningNumber || 'N/A'}</p>
                </div>
                <div class="winner-actions">
                    ${isPaid ? 
                        '<button class="btn-paid" disabled><i class="fas fa-check"></i> Peye</button>' :
                        '<button class="btn-paid" onclick="markAsPaid(\'' + (ticket.id || ticket.ticket_id) + '\')"><i class="fas fa-money-bill-wave"></i> Make kòm Peye</button>'
                    }
                </div>
            </div>
        `;
    }).join('');
}

async function markAsPaid(ticketId) {
    try {
        const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.PAY_WINNER}/${ticketId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) throw new Error('Erreur réseau');
        
        const data = await response.json();
        if (data.success) {
            alert('Tikè make kòm peye!');
            loadWinners();
        }
    } catch (error) {
        console.error('Erreur marquage payé:', error);
        alert('Erè nan makaj tikè a.');
    }
}

function viewTicketDetails(ticketId) {
    console.log('Recherche ticket avec ID:', ticketId);
    console.log('Tickets disponibles:', APP_STATE.ticketsHistory);
    
    // Recherche par id ou ticket_id
    const ticket = APP_STATE.ticketsHistory.find(t => 
        t.id === ticketId || t.ticket_id === ticketId
    );
    
    if (!ticket) {
        alert(`Tikè pa jwenn! ID: ${ticketId}\nTotal tickets disponibles: ${APP_STATE.ticketsHistory.length}`);
        return;
    }
    
    console.log('Ticket trouvé pour détails:', ticket);
    
    // Extraire les propriétés avec toutes les variantes possibles
    const drawName = ticket.draw_name || ticket.drawName || ticket.draw_name_fr || 'Tiraj Inkonu';
    const totalAmount = ticket.total_amount || ticket.totalAmount || ticket.amount || 0;
    const date = ticket.date || ticket.created_at || ticket.created_date || new Date().toISOString();
    const winAmount = ticket.win_amount || ticket.winAmount || ticket.prize_amount || 0;
    const checked = ticket.checked || ticket.verified || false;
    
    let details = `
        <h3>Detay Tikè #${ticket.ticket_id || ticket.id || 'N/A'}</h3>
        <p><strong>Tiraj:</strong> ${drawName}</p>
        <p><strong>Dat:</strong> ${new Date(date).toLocaleString('fr-FR')}</p>
        <p><strong>Total Mis:</strong> ${totalAmount} Gdes</p>
        <p><strong>Statis:</strong> ${checked ? (winAmount > 0 ? 'GANYEN' : 'PÈDI') : 'AP TANN'}</p>
        ${winAmount > 0 ? `
            <p><strong>Ganyen Total:</strong> ${winAmount} Gdes</p>
            <p><strong>Pwofi Net:</strong> ${winAmount - totalAmount} Gdes</p>
        ` : ''}
        <hr>
        <h4>Paray yo:</h4>
    `;
    
    // Traiter les paris
    let bets = [];
    
    if (Array.isArray(ticket.bets)) {
        bets = ticket.bets;
    } else if (Array.isArray(ticket.numbers)) {
        bets = ticket.numbers;
    } else if (typeof ticket.bets === 'string') {
        try {
            bets = JSON.parse(ticket.bets);
        } catch (e) {
            bets = [{ number: ticket.bets, amount: totalAmount }];
        }
    } else if (ticket.bets && typeof ticket.bets === 'object') {
        // Convertir l'objet en tableau
        bets = Object.entries(ticket.bets).map(([key, value]) => {
            return { number: key, amount: value };
        });
    } else {
        bets = [{ number: 'N/A', amount: totalAmount }];
    }
    
    if (!Array.isArray(bets)) {
        bets = [bets];
    }
    
    if (bets.length === 0) {
        details += `<p>Pa gen detay paray</p>`;
    } else {
        bets.forEach((bet, index) => {
            if (!bet) return;
            
            let gameName = (bet.game || '').toUpperCase() || 'BORLETTE';
            if (bet.specialType) gameName = bet.specialType;
            if (bet.option) gameName += ` (Opsyon ${bet.option})`;
            
            const betNumber = bet.number || bet.numero || bet.n || 'N/A';
            const betAmount = bet.amount || bet.montant || bet.a || 0;
            const betGain = bet.gain || bet.prize || 0;
            
            let betDetails = `${gameName} ${betNumber} - ${betAmount} Gdes`;
            if (betGain) {
                const netGain = betGain - betAmount;
                betDetails += ` (Ganyen: ${betGain}G | Net: ${netGain}G)`;
            }
            details += `<p>${betDetails}</p>`;
        });
    }
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 3000;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: var(--bg);
        padding: 20px;
        border-radius: 20px;
        max-width: 90%;
        max-height: 80%;
        overflow-y: auto;
        border: 2px solid var(--primary);
    `;
    
    modalContent.innerHTML = `
        <div style="text-align: left;">
            ${details}
        </div>
        <button onclick="this.parentElement.parentElement.remove()" style="
            background: var(--primary);
            border: none;
            color: white;
            padding: 10px 20px;
            border-radius: 10px;
            margin-top: 20px;
            cursor: pointer;
        ">
            Fèmen
        </button>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
}

function updateClock() {
    const now = new Date();
    document.getElementById('live-clock').innerText = now.toLocaleTimeString('fr-FR');
    
    if (APP_STATE.currentTab === 'home' || APP_STATE.currentTab === 'betting') {
        checkSelectedDrawStatus();
    }
}

function updateSyncStatus() {
    const syncBar = document.getElementById('sync-status-bar');
    const syncText = document.getElementById('sync-text');
    
    const statuses = [
        { text: "Sistem OK", class: "sync-idle" },
        { text: "Synchro...", class: "sync-syncing" },
        { text: "Konekte", class: "sync-connected" }
    ];
    
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    syncText.textContent = status.text;
    syncBar.className = "sync-status-bar " + status.class;
}

async function loadLotteryConfig() {
    try {
        const config = await APIService.getLotteryConfig();
        if (config) {
            APP_STATE.lotteryConfig = config;
            
            document.getElementById('lottery-name').innerHTML = `${config.name} <span class="pro-badge">vession 6</span>`;
            
            CONFIG.LOTTERY_NAME = config.name;
            CONFIG.LOTTERY_LOGO = config.logo || 'https://raw.githubusercontent.com/your-username/your-repo/main/logo.png';
            CONFIG.LOTTERY_ADDRESS = config.address || '';
            CONFIG.LOTTERY_PHONE = config.phone || '';
        }
    } catch (error) {
        console.error('Erreur chargement configuration:', error);
    }
}