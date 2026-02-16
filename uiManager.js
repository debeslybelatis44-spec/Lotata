// Fonction utilitaire pour récupérer les tickets depuis l'API
async function fetchTickets() {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Non authentifié');

    const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_TICKETS}`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    if (!response.ok) throw new Error('Erreur réseau');
    const data = await response.json();
    return data.tickets || [];
}

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
        
        const tickets = await fetchTickets();
        APP_STATE.ticketsHistory = tickets;
        
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
        
        const ticketId = ticket.ticket_id || ticket.id || `temp_${Date.now()}_${index}`;
        const drawName = ticket.draw_name || ticket.drawName || ticket.draw_name_fr || 'Tiraj Inkonu';
        const totalAmount = ticket.total_amount || ticket.totalAmount || ticket.amount || 0;
        const date = ticket.date || ticket.created_at || ticket.created_date || new Date().toISOString();
        const bets = ticket.bets || ticket.numbers || [];
        const checked = ticket.checked || ticket.verified || false;
        const winAmount = ticket.win_amount || ticket.winAmount || ticket.prize_amount || 0;
        const drawId = ticket.draw_id || ticket.drawId || '';
        
        let numberOfBets = 0;
        if (Array.isArray(bets)) {
            numberOfBets = bets.length;
        } else if (typeof bets === 'object' && bets !== null) {
            numberOfBets = Object.keys(bets).length;
        } else if (typeof bets === 'string') {
            try {
                const parsedBets = JSON.parse(bets);
                numberOfBets = Array.isArray(parsedBets) ? parsedBets.length : 1;
            } catch (e) {
                numberOfBets = 1;
            }
        }
        
        let status = '';
        let statusClass = '';
        
        if (checked) {
            if (winAmount > 0) {
                status = 'GeNYEN';
                statusClass = 'badge-win';
            } else {
                status = 'PÈDI';
                statusClass = 'badge-lost';
            }
        } else {
            status = 'AP TANN';
            statusClass = 'badge-wait';
        }
        
        const ticketDate = new Date(date);
        const now = new Date();
        const minutesDiff = (now - ticketDate) / (1000 * 60);
        const canDelete = minutesDiff <= 2;      // Changé de 5 à 2 minutes
        const canEdit = minutesDiff <= 3;        // 3 minutes pour modifier
        
        let formattedDate = 'Date inkonu';
        let formattedTime = '';
        
        try {
            formattedDate = ticketDate.toLocaleDateString('fr-FR');
            formattedTime = ticketDate.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
        } catch (e) {
            formattedDate = 'N/A';
            formattedTime = '';
        }
        
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
                        ${canEdit ? `
                            <button class="btn-small edit-btn" onclick="editTicket('${ticketId}')">
                                <i class="fas fa-edit"></i> Modifye
                            </button>
                        ` : ''}
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

function editTicket(ticketId) {
    const ticket = APP_STATE.ticketsHistory.find(t => t.id === ticketId || t.ticket_id === ticketId);
    if (!ticket) {
        alert("Tikè pa jwenn!");
        return;
    }

    // Vérifier la limite de 3 minutes
    const ticketDate = new Date(ticket.date || ticket.created_at);
    const now = new Date();
    const minutesDiff = (now - ticketDate) / (1000 * 60);
    if (minutesDiff > 3) {
        alert("Tikè sa a gen plis pase 3 minit, ou pa ka modifye li.");
        return;
    }

    // Vider le panier actuel
    APP_STATE.currentCart = [];

    // Reconstruire les paris
    let bets = [];
    if (Array.isArray(ticket.bets)) {
        bets = ticket.bets;
    } else if (typeof ticket.bets === 'string') {
        try {
            bets = JSON.parse(ticket.bets);
        } catch (e) {
            bets = [];
        }
    }

    bets.forEach(bet => {
        const newBet = {
            ...bet,
            id: Date.now() + Math.random(), // nouvel ID pour éviter les conflits
            drawId: bet.drawId || ticket.draw_id,
            drawName: bet.drawName || ticket.draw_name
        };
        APP_STATE.currentCart.push(newBet);
    });

    CartManager.renderCart();
    switchTab('home'); // Retour à l'écran de jeu
    alert(`Tikè #${ticket.ticket_id || ticket.id} charge nan panye. Ou kapab modifye l.`);
}

async function loadReports() {
    try {
        const tickets = await fetchTickets();
        APP_STATE.ticketsHistory = tickets;
        
        const reports = await APIService.getReports();
        
        console.log('Données rapport API:', reports);
        
        let totalTickets = 0;
        let totalBets = 0;
        let totalWins = 0;
        let totalLoss = 0;
        
        if (reports && reports.total_tickets !== undefined) {
            totalTickets = reports.total_tickets || 0;
            totalBets = reports.total_bets || 0;
            totalWins = reports.total_wins || 0;
            totalLoss = reports.total_loss || 0;
        } else {
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
        
        document.getElementById('total-tickets').textContent = totalTickets;
        document.getElementById('total-bets').textContent = totalBets.toLocaleString('fr-FR') + ' Gdes';
        document.getElementById('total-wins').textContent = totalWins.toLocaleString('fr-FR') + ' Gdes';
        document.getElementById('total-loss').textContent = totalLoss.toLocaleString('fr-FR') + ' Gdes';
        document.getElementById('balance').textContent = totalProfit.toLocaleString('fr-FR') + ' Gdes';
        document.getElementById('balance').style.color = (totalProfit >= 0) ? 'var(--success)' : 'var(--danger)';
        
        const drawSelector = document.getElementById('draw-report-selector');
        drawSelector.innerHTML = '<option value="all">Tout Tiraj</option>';
        
        CONFIG.DRAWS.forEach(draw => {
            const option = document.createElement('option');
            option.value = draw.id;
            option.textContent = draw.name;
            drawSelector.appendChild(option);
        });
        
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
            <p class="note">Balans pozitif = Pwofi pou ajan</p>
            <p class="note">Balans negatif = Pèt pou ajan</p>
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
        container.innerHTML = '<div class="empty-msg">Pa gen tikè genyen pou kounye a</div>';
        
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
        // Correction : utiliser draw_id au lieu de drawId
        const winningResults = APP_STATE.winningResults.find(r => 
            r.draw_id === (ticket.draw_id || ticket.drawId)
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
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
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
    
    const ticket = APP_STATE.ticketsHistory.find(t => 
        t.id === ticketId || t.ticket_id === ticketId
    );
    
    if (!ticket) {
        alert(`Tikè pa jwenn! ID: ${ticketId}\nTotal tickets disponibles: ${APP_STATE.ticketsHistory.length}`);
        return;
    }
    
    console.log('Ticket trouvé pour détails:', ticket);
    
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
        details += `<p>Pa gen detay paryaj</p>`;
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
                betDetails += ` (Genyen: ${betGain}G | Net: ${netGain}G)`;
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

// ==================== FONCTION DE DÉCONNEXION ====================
function logout() {
    if (!confirm('Èske ou sèten ou vle dekonekte?')) return;

    const token = localStorage.getItem('auth_token');
    
    // Appel à l'API de déconnexion pour journaliser (optionnel)
    fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.LOGOUT}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .catch(err => console.error('Erreur lors de la déconnexion côté serveur:', err))
    .finally(() => {
        // Nettoyer le stockage local
        localStorage.removeItem('auth_token');
        localStorage.removeItem('agent_id');
        localStorage.removeItem('agent_name');
        localStorage.removeItem('user_role');
        
        // Rediriger vers la page de connexion
        window.location.href = 'index.html';
    });
}

// Exposer la fonction editTicket globalement (déjà fait)
window.editTicket = editTicket;