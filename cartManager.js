// ==========================
// cartManager.js (sans mariage gratuit)
// ==========================

// ---------- Utils ----------
function isNumberBlocked(number, drawId) {
    if (APP_STATE.globalBlockedNumbers.includes(number)) return true;
    const drawBlocked = APP_STATE.drawBlockedNumbers[drawId] || [];
    return drawBlocked.includes(number);
}

// ---------- Cart Manager ----------
var CartManager = {

    addBet() {
        if (APP_STATE.isDrawBlocked) {
            alert("Tiraj sa a ap rantre nan 3 minit.");
            return;
        }

        const numInput = document.getElementById('num-input');
        const amtInput = document.getElementById('amt-input');
        const amt = parseFloat(amtInput.value);

        if (isNaN(amt) || amt <= 0) {
            alert("Montan pa valid");
            return;
        }

        const game = APP_STATE.selectedGame;

        // --- Jeux automatiques ---
        if (game === 'auto_marriage' || game === 'bo' || game === 'grap' || game === 'auto_lotto4' || game === 'auto_lotto5') {
            let autoBets = [];

            switch (game) {
                case 'auto_marriage':
                    autoBets = GameEngine.generateAutoMarriageBets(amt);
                    break;
                case 'bo':
                    autoBets = SpecialGames.generateBOBets(amt);
                    break;
                case 'grap':
                    autoBets = SpecialGames.generateGRAPBets(amt);
                    break;
                case 'auto_lotto4':
                    autoBets = GameEngine.generateAutoLotto4Bets(amt);
                    break;
                case 'auto_lotto5':
                    autoBets = GameEngine.generateAutoLotto5Bets(amt);
                    break;
            }

            if (!autoBets.length) {
                alert("Pa gen ase nimewo pou jenere jwèt la");
                return;
            }

            const draws = APP_STATE.multiDrawMode
                ? APP_STATE.selectedDraws
                : [APP_STATE.selectedDraw];

            draws.forEach(drawId => {
                const drawName = CONFIG.DRAWS.find(d => d.id === drawId)?.name || drawId;
                autoBets.forEach(bet => {
                    APP_STATE.currentCart.push({
                        ...bet,
                        id: Date.now() + Math.random(),
                        drawId,
                        drawName
                    });
                });
            });

            this.renderCart();
            amtInput.value = '';
            numInput.focus();
            return;
        }

        // --- Jeux NX ---
        if (/^n[0-9]$/.test(game)) {
            const lastDigit = parseInt(game.substring(1), 10);
            const numbers = [];

            for (let tens = 0; tens <= 9; tens++) {
                numbers.push(tens.toString() + lastDigit.toString());
            }

            const draws = APP_STATE.multiDrawMode
                ? APP_STATE.selectedDraws
                : [APP_STATE.selectedDraw];

            for (const drawId of draws) {
                for (const num of numbers) {
                    if (isNumberBlocked(num, drawId)) {
                        alert(`Nimewo ${num} bloke`);
                        return;
                    }
                }
            }

            draws.forEach(drawId => {
                const drawName = CONFIG.DRAWS.find(d => d.id === drawId)?.name || drawId;
                numbers.forEach(num => {
                    APP_STATE.currentCart.push({
                        id: Date.now() + Math.random(),
                        game,
                        number: num,
                        cleanNumber: num,
                        amount: amt,
                        drawId,
                        drawName,
                        timestamp: new Date().toISOString()
                    });
                });
            });

            this.renderCart();
            numInput.value = '';
            amtInput.value = '';
            return;
        }

        // --- Jeux normaux ---
        let num = numInput.value.trim();

        if (!GameEngine.validateEntry(game, num)) {
            alert("Nimewo pa valid");
            return;
        }

        num = GameEngine.getCleanNumber(num);

        const draws = APP_STATE.multiDrawMode
            ? APP_STATE.selectedDraws
            : [APP_STATE.selectedDraw];

        for (const drawId of draws) {
            if (isNumberBlocked(num, drawId)) {
                alert(`Nimewo ${num} bloke`);
                return;
            }
        }

        draws.forEach(drawId => {
            if (game === 'lotto4' || game === 'lotto5') {
                const optionBets = GameEngine.generateLottoBetsWithOptions(game, num, amt);
                optionBets.forEach(bet => {
                    APP_STATE.currentCart.push({
                        ...bet,
                        drawId,
                        drawName: CONFIG.DRAWS.find(d => d.id === drawId)?.name || drawId
                    });
                });
            } else {
                APP_STATE.currentCart.push({
                    id: Date.now() + Math.random(),
                    game,
                    number: num,
                    cleanNumber: num,
                    amount: amt,
                    drawId,
                    drawName: CONFIG.DRAWS.find(d => d.id === drawId)?.name || drawId,
                    timestamp: new Date().toISOString()
                });
            }
        });

        this.renderCart();
        numInput.value = '';
        amtInput.value = '';
    },

    removeBet(id) {
        APP_STATE.currentCart = APP_STATE.currentCart.filter(b => b.id != id);
        this.renderCart();
    },

    renderCart() {
        const display = document.getElementById('cart-display');
        const totalEl = document.getElementById('cart-total-display');
        const itemsCount = document.getElementById('items-count');

        if (!APP_STATE.currentCart.length) {
            display.innerHTML = '<div class="empty-msg">Panye vid</div>';
            totalEl.innerText = '0 Gdes';
            if (itemsCount) itemsCount.innerText = '0 jwèt';
            return;
        }

        let total = 0;
        let count = 0;

        display.innerHTML = APP_STATE.currentCart.map(bet => {
            total += bet.amount;
            count++;
            const gameAbbr = getGameAbbreviation(bet.game);
            let displayNumber = bet.number;

            if (bet.game === 'auto_marriage' && displayNumber?.includes('&')) {
                displayNumber = displayNumber.replace('&', '*');
            }

            return `
                <div class="cart-item">
                    <span>${gameAbbr} ${displayNumber}</span>
                    <span>${bet.amount} G</span>
                    <button onclick="CartManager.removeBet('${bet.id}')">✕</button>
                </div>
            `;
        }).join('');

        totalEl.innerText = total.toLocaleString('fr-FR') + ' Gdes';
        if (itemsCount) itemsCount.innerText = count + ' jwèt';
    }
};

// ---------- Abréviations ----------
function getGameAbbreviation(gameName) {
    const map = {
        borlette: 'bor',
        lotto3: 'lo3',
        lotto4: 'lo4',
        lotto5: 'lo5',
        auto_marriage: 'mara',
        auto_lotto4: 'loa4',
        auto_lotto5: 'loa5',
        bo: 'bo',
        grap: 'grap',
        n0: 'n0', n1: 'n1', n2: 'n2', n3: 'n3', n4: 'n4',
        n5: 'n5', n6: 'n6', n7: 'n7', n8: 'n8', n9: 'n9'
    };

    return map[(gameName || '').toLowerCase()] || gameName;
}

// ---------- Global ----------
window.CartManager = CartManager;