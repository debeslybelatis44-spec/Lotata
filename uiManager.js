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
        
        await APIService.getTickets();
        renderHistory();
    } catch (error) {
        document.getElementById('history-container').innerHTML = 
            '<div class="empty-msg">Erè chajman istorik</div>';
    }
}

function renderHistory() {
    const container = document.getElementById('history-container');
    
    if (APP_STATE.ticketsHistory.length === 0) {
        container.innerHTML = '<div class="empty-msg">Pa gen tikè nan istorik</div>';
        return;
    }
    
    container.innerHTML = APP_STATE.ticketsHistory.map(ticket => {
        let status = '';
        let statusClass = '';
        
        if (ticket.checked) {
            const hasWin = ticket.win_amount > 0;
            
            if (hasWin) {
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
        
        const ticketDate = new Date(ticket.date);
        const now = new Date();
        const minutesDiff = (now - ticketDate) / (1000 * 60);
        const canDelete = minutesDiff <= 5;
        
        return `
            <div class="history-card">
                <div class="card-header">
                    <span>#${ticket.ticket_id || ticket.id}</span>
                    <span>${new Date(ticket.date).toLocaleDateString('fr-FR')} ${new Date(ticket.date).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <div>
                    <p><strong>Tiraj:</strong> ${ticket.draw_name}</p>
                    <p><strong>Total:</strong> ${ticket.total_amount} Gdes</p>
                    <p><strong>Nimewo:</strong> ${Array.isArray(ticket.bets) ? ticket.bets.length : 0}</p>
                </div>
                <div class="card-footer">
                    <span class="badge ${statusClass}">${status}</span>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn-small" onclick="viewTicketDetails('${ticket.id}')">
                            <i class="fas fa-eye"></i> Detay
                        </button>
                        <button class="delete-history-btn" onclick="deleteTicket('${ticket.id}')" ${canDelete ? '' : 'disabled'}>
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
        APP_STATE.ticketsHistory = APP_STATE.ticketsHistory.filter(t => t.id !== ticketId);
        renderHistory();
        alert('Tikè efase ak siksè!');
    } catch (error) {
        console.error('Erreur suppression:', error);
        alert('Erè nan efasman tikè a: ' + error.message);
    }
}

async function loadReports() {
    try {
        // Charger les tickets et rapports depuis l'API
        await APIService.getTickets();
        const reports = await APIService.getReports();
        
        console.log('Données rapport API:', reports);
        
        // CALCULS CORRIGÉS - UTILISER LES DONNÉES DE L'API DIRECTEMENT
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
                const ticketAmount = ticket.total_amount || 0;
                totalBets += ticketAmount;
                
                if (ticket.checked) {
                    if (ticket.win_amount && ticket.win_amount > 0) {
                        totalWins += ticket.win_amount;
                    } else {
                        totalLoss += ticketAmount;
                    }
                }
            });
        }
        
        const totalProfit = totalBets - totalWins;
        
        console.log('Statistiques réelles:');
        console.log('- Total Tickets:', totalTickets);
        console.log('- Total Paris:', totalBets);
        console.log('- Total Gains:', totalWins);
        console.log('- Total Pertes:', totalLoss);
        console.log('- Bénéfice Net:', totalProfit);
        
        // CORRECTION: Afficher les vrais totaux
        document.getElementById('total-tickets').textContent = totalTickets;
        document.getElementById('total-bets').textContent = totalBets.toLocaleString() + ' Gdes';
        document.getElementById('total-wins').textContent = totalWins.toLocaleString() + ' Gdes';
        document.getElementById('total-loss').textContent = totalLoss.toLocaleString() + ' Gdes';
        document.getElementById('balance').textContent = totalProfit.toLocaleString() + ' Gdes';
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
            const totalTickets = document.getElementById('total-tickets').textContent;
            const totalBets = document.getElementById('total-bets').textContent;
            const totalWins = document.getElementById('total-wins').textContent;
            const totalLoss = document.getElementById('total-loss').textContent;
            const balance = document.getElementById('balance').textContent;
            const balanceColor = document.getElementById('balance').style.color;
            
            document.getElementById('draw-report-card').style.display = 'block';
            document.getElementById('draw-total-tickets').textContent = totalTickets;
            document.getElementById('draw-total-bets').textContent = totalBets;
            document.getElementById('draw-total-wins').textContent = totalWins;
            document.getElementById('draw-total-loss').textContent = totalLoss;
            document.getElementById('draw-balance').textContent = balance;
            document.getElementById('draw-balance').style.color = balanceColor;
        } else {
            // Calculer pour un tirage spécifique
            const drawTickets = APP_STATE.ticketsHistory.filter(t => t.draw_id === selectedDrawId);
            
            let drawTotalTickets = drawTickets.length;
            let drawTotalBets = 0;
            let drawTotalWins = 0;
            let drawTotalLoss = 0;
            
            drawTickets.forEach(ticket => {
                const ticketAmount = ticket.total_amount || 0;
                drawTotalBets += ticketAmount;
                
                if (ticket.checked) {
                    if (ticket.win_amount && ticket.win_amount > 0) {
                        drawTotalWins += ticket.win_amount;
                    } else {
                        drawTotalLoss += ticketAmount;
                    }
                }
            });
            
            const drawProfit = drawTotalBets - drawTotalWins;
            
            document.getElementById('draw-report-card').style.display = 'block';
            document.getElementById('draw-total-tickets').textContent = drawTotalTickets;
            document.getElementById('draw-total-bets').textContent = drawTotalBets.toLocaleString() + ' Gdes';
            document.getElementById('draw-total-wins').textContent = drawTotalWins.toLocaleString() + ' Gdes';
            document.getElementById('draw-total-loss').textContent = drawTotalLoss.toLocaleString() + ' Gdes';
            document.getElementById('draw-balance').textContent = drawProfit.toLocaleString() + ' Gdes';
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
        : APP_STATE.ticketsHistory.filter(t => t.draw_id === selectedDrawId);
    
    totalPending = ticketsToAnalyze.filter(t => !t.checked).length;
    totalVerified = ticketsToAnalyze.filter(t => t.checked).length;
    
    let analyzedTotalBets = 0;
    let analyzedTotalWins = 0;
    let analyzedTotalLoss = 0;
    
    ticketsToAnalyze.forEach(ticket => {
        analyzedTotalBets += ticket.total_amount || 0;
        
        if (ticket.checked) {
            if (ticket.win_amount && ticket.win_amount > 0) {
                analyzedTotalWins += ticket.win_amount;
            } else {
                analyzedTotalLoss += ticket.total_amount || 0;
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
            <p>Total Paris (Antre Lajan): ${analyzedTotalBets.toLocaleString()} Gdes</p>
            <p>Total pou peye (Ganyen): ${analyzedTotalWins.toLocaleString()} Gdes</p>
            <p>Total Retni (Pèdi): ${analyzedTotalLoss.toLocaleString()} Gdes</p>
            <p><strong>Balans Net: ${analyzedProfit.toLocaleString()} Gdes</strong></p>
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
            <p>Total Paris (Antre Lajan): ${analyzedTotalBets.toLocaleString()} Gdes</p>
            <p>Total pou peye (Ganyen): ${analyzedTotalWins.toLocaleString()} Gdes</p>
            <p>Total Retni (Pèdi): ${analyzedTotalLoss.toLocaleString()} Gdes</p>
            <p><strong>Balans Net: ${analyzedProfit.toLocaleString()} Gdes</strong></p>
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
    const totalAmount = APP_STATE.winningTickets.reduce((sum, ticket) => sum + (ticket.win_amount || 0), 0);
    const averageWin = totalAmount / totalWins;
    
    document.getElementById('total-winners-today').textContent = totalWins;
    document.getElementById('total-winning-amount').textContent = totalAmount.toLocaleString() + ' Gdes';
    document.getElementById('average-winning').textContent = averageWin.toFixed(2).toLocaleString() + ' Gdes';
    
    container.innerHTML = APP_STATE.winningTickets.map(ticket => {
        const isPaid = ticket.paid || false;
        const winningResults = APP_STATE.winningResults.find(r => r.drawId === ticket.draw_id);
        const resultStr = winningResults ? winningResults.numbers.join(', ') : 'N/A';
        
        const betAmount = ticket.bet_amount || 0;
        const winAmount = ticket.win_amount || 0;
        const netProfit = winAmount - betAmount;
        
        return `
            <div class="winner-ticket">
                <div class="winner-header">
                    <div>
                        <strong>Tikè #${ticket.ticket_id || ticket.id}</strong>
                        <div style="font-size: 0.8rem; color: var(--text-dim);">
                            ${ticket.draw_name} - ${new Date(ticket.date).toLocaleDateString('fr-FR')}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: bold; color: var(--success); font-size: 1.1rem;">
                            ${winAmount.toLocaleString()} Gdes
                        </div>
                        <div style="font-size: 0.8rem; color: var(--text-dim);">
                            (Mise: ${betAmount.toLocaleString()}G | Net: ${netProfit.toLocaleString()}G)
                        </div>
                    </div>
                </div>
                <div>
                    <p><strong>Rezilta Tiraj:</strong> ${resultStr}</p>
                    <p><strong>Jwèt:</strong> ${ticket.game_type || 'Borlette'}</p>
                    <p><strong>Nimewo Ganyen:</strong> ${ticket.winning_number || 'N/A'}</p>
                </div>
                <div class="winner-actions">
                    ${isPaid ? 
                        '<button class="btn-paid" disabled><i class="fas fa-check"></i> Peye</button>' :
                        '<button class="btn-paid" onclick="markAsPaid(\'' + ticket.id + '\')"><i class="fas fa-money-bill-wave"></i> Make kòm Peye</button>'
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
    const ticket = APP_STATE.ticketsHistory.find(t => t.id === ticketId);
    if (!ticket) {
        alert("Tikè pa jwenn!");
        return;
    }
    
    let details = `
        <h3>Detay Tikè #${ticket.ticket_id || ticket.id}</h3>
        <p><strong>Tiraj:</strong> ${ticket.draw_name}</p>
        <p><strong>Dat:</strong> ${new Date(ticket.date).toLocaleString('fr-FR')}</p>
        <p><strong>Total Mis:</strong> ${ticket.total_amount} Gdes</p>
        <p><strong>Statis:</strong> ${ticket.checked ? (ticket.win_amount > 0 ? 'GANYEN' : 'PÈDI') : 'AP TANN'}</p>
        ${ticket.win_amount > 0 ? `
            <p><strong>Ganyen Total:</strong> ${ticket.win_amount} Gdes</p>
            <p><strong>Pwofi Net:</strong> ${ticket.win_amount - ticket.total_amount} Gdes</p>
        ` : ''}
        <hr>
        <h4>Paray yo:</h4>
    `;
    
    const bets = Array.isArray(ticket.bets) ? ticket.bets : [];
    
    if (bets.length === 0) {
        details += `<p>Pa gen detay paray</p>`;
    } else {
        bets.forEach(bet => {
            let gameName = (bet.game || '').toUpperCase();
            if (bet.specialType) gameName = bet.specialType;
            if (bet.option) gameName += ` (Opsyon ${bet.option})`;
            
            let betDetails = `${gameName} ${bet.number || ''} - ${bet.amount || 0} Gdes`;
            if (bet.gain) {
                const netGain = bet.gain - (bet.amount || 0);
                betDetails += ` (Ganyen: ${bet.gain}G | Net: ${netGain}G)`;
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