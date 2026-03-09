// ==========================
// cartManager.js (corrigé - gestion mariage gratuit)
// ==========================

// ---------- Utils ----------
function isNumberBlocked(number, drawId) {
    if (APP_STATE.globalBlockedNumbers.includes(number)) return true;
    const drawBlocked = APP_STATE.drawBlockedNumbers[drawId] || [];
    return drawBlocked.includes(number);
}

// ---------- Cart Manager ----------
var CartManager = {

    // Correction mariage gratuit
    updateFreeMarriages() {

        const betsByDraw = {};

        APP_STATE.currentCart.forEach(bet => {
            if (!betsByDraw[bet.drawId]) betsByDraw[bet.drawId] = [];
            betsByDraw[bet.drawId].push(bet);
        });

        Object.keys(betsByDraw).forEach(drawId => {

            const bets = betsByDraw[drawId];

            // total seulement auto_marriage payant
            const totalMarriage = bets
                .filter(b => b.game === 'auto_marriage' && !b.free)
                .reduce((sum, b) => sum + b.amount, 0);

            let requiredFree = 0;

            if (totalMarriage >= 100 && totalMarriage <= 200) requiredFree = 1;
            else if (totalMarriage >= 201 && totalMarriage <= 500) requiredFree = 2;
            else if (totalMarriage >= 501) requiredFree = 3;

            const existingFree = bets.filter(
                b => b.free && b.freeType === 'special_marriage'
            );

            const existingCount = existingFree.length;

            if (existingCount > requiredFree) {

                const toRemove = existingCount - requiredFree;

                for (let i = 0; i < toRemove; i++) {

                    const freeBet = existingFree[i];

                    const index = APP_STATE.currentCart.findIndex(
                        b => b.id === freeBet.id
                    );

                    if (index !== -1) {
                        APP_STATE.currentCart.splice(index, 1);
                    }
                }
            }

            if (existingCount < requiredFree) {

                const normalMarriage = bets.find(
                    b => b.game === 'auto_marriage' && !b.free
                );

                if (!normalMarriage) return;

                const toAdd = requiredFree - existingCount;

                for (let i = 0; i < toAdd; i++) {

                    const newFree = {
                        ...normalMarriage,
                        id: Date.now() + Math.random() + i,
                        amount: 0,
                        free: true,
                        freeType: 'special_marriage'
                    };

                    APP_STATE.currentCart.push(newFree);
                }
            }

        });

        this.renderCart();
    },

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

            if (autoBets.length === 0) {
                alert("Pa gen ase nimewo nan panye pou jenere " + game);
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
                        drawId: drawId,
                        drawName: drawName
                    });

                });

            });

            this.updateFreeMarriages();

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
                        alert(`Nimewo ${num} bloke pou tiraj sa a`);
                        return;
                    }
                }
            }

            draws.forEach(drawId => {

                const drawName = CONFIG.DRAWS.find(d => d.id === drawId)?.name || drawId;

                numbers.forEach(num => {

                    APP_STATE.currentCart.push({
                        id: Date.now() + Math.random(),
                        game: game,
                        number: num,
                        cleanNumber: num,
                        amount: amt,
                        drawId: drawId,
                        drawName: drawName,
                        timestamp: new Date().toISOString()
                    });

                });

            });

            this.renderCart();

            numInput.value = '';
            amtInput.value = '';

            numInput.focus();

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
                        drawId: drawId,
                        drawName: CONFIG.DRAWS.find(d => d.id === drawId)?.name || drawId
                    });

                });

            } else {

                APP_STATE.currentCart.push({
                    id: Date.now() + Math.random(),
                    game: game,
                    number: num,
                    cleanNumber: num,
                    amount: amt,
                    drawId: drawId,
                    drawName: CONFIG.DRAWS.find(d => d.id === drawId)?.name || drawId,
                    timestamp: new Date().toISOString()
                });

            }

        });

        this.renderCart();

        numInput.value = '';
        amtInput.value = '';

        numInput.focus();
    },

    removeBet(id) {
        APP_STATE.currentCart = APP_STATE.currentCart.filter(b => b.id != id);
        this.updateFreeMarriages();
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

            const gameAbbr = getGameAbbreviation(bet.game, bet);

            let displayNumber = bet.number;

            if (bet.game === 'auto_marriage' && bet.number && bet.number.includes('&')) {
                displayNumber = bet.number.replace('&', '*');
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

// ---------- Global ----------
window.CartManager = CartManager;