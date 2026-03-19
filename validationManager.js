// validationManager.js – Vérification automatique des limites et numéros bloqués
(function() {
    if (window.validationManagerReady) return;
    window.validationManagerReady = true;

    // Sauvegarde de la fonction originale
    const originalProcessFinalTicket = window.processFinalTicket;

    let dataLoaded = false;

    // ==================== Chargement des données ====================
    async function loadValidationData() {
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            // Numéros bloqués globalement
            const globalBlockedRes = await fetch('/api/blocked-numbers/global', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const globalBlockedData = await globalBlockedRes.json();
            window.APP_STATE.globalBlockedNumbers = globalBlockedData.blockedNumbers || [];

            // Limites globales (draw_id = 0)
            const globalLimitsRes = await fetch('/api/number-limits/draw/0', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            window.APP_STATE.globalLimits = await globalLimitsRes.json() || {};

            // Pour chaque tirage, limites et blocages spécifiques
            window.APP_STATE.drawLimits = {};
            window.APP_STATE.drawBlockedNumbers = {};
            if (window.CONFIG && window.CONFIG.DRAWS) {
                for (const draw of window.CONFIG.DRAWS) {
                    // Limites par tirage
                    const drawLimitsRes = await fetch(`/api/number-limits/draw/${draw.id}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    window.APP_STATE.drawLimits[draw.id] = await drawLimitsRes.json() || {};

                    // Blocages par tirage
                    const drawBlockedRes = await fetch(`/api/blocked-numbers/draw/${draw.id}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const drawBlockedData = await drawBlockedRes.json();
                    window.APP_STATE.drawBlockedNumbers[draw.id] = drawBlockedData.blockedNumbers || [];
                }
            }

            // Calcul des totaux du jour à partir de l'historique existant
            calculateDailyTotals();
            dataLoaded = true;
        } catch (error) {
            console.error('Erreur chargement données validation :', error);
        }
    }

    // ==================== Calcul des totaux journaliers ====================
    function calculateDailyTotals() {
        const today = new Date().toDateString();
        window.APP_STATE.dailyTotals = { global: {}, byDraw: {} };

        (window.APP_STATE.ticketsHistory || []).forEach(ticket => {
            const ticketDate = new Date(ticket.date || ticket.created_at).toDateString();
            if (ticketDate !== today) return;

            const drawId = ticket.draw_id || ticket.drawId;
            const bets = ticket.bets;
            if (!bets) return;

            let betsArray = [];
            if (Array.isArray(bets)) betsArray = bets;
            else if (typeof bets === 'string') {
                try { betsArray = JSON.parse(bets); } catch (e) {}
            }

            betsArray.forEach(bet => {
                const number = bet.cleanNumber || bet.number;
                const amount = parseFloat(bet.amount) || 0;
                if (!number) return;

                // Total global
                window.APP_STATE.dailyTotals.global[number] = (window.APP_STATE.dailyTotals.global[number] || 0) + amount;
                // Total par tirage
                if (!window.APP_STATE.dailyTotals.byDraw[drawId]) window.APP_STATE.dailyTotals.byDraw[drawId] = {};
                window.APP_STATE.dailyTotals.byDraw[drawId][number] = (window.APP_STATE.dailyTotals.byDraw[drawId][number] || 0) + amount;
            });
        });
    }

    // ==================== Fonctions de validation ====================
    function checkBlocked(cart) {
        const errors = [];
        const globalBlocked = window.APP_STATE?.globalBlockedNumbers || [];
        const drawBlocked = window.APP_STATE?.drawBlockedNumbers || {};

        cart.forEach(bet => {
            const drawId = bet.drawId;
            const number = bet.cleanNumber || bet.number;
            if (!number) return;

            if (globalBlocked.includes(number)) {
                errors.push(`Numéro ${number} est bloqué globalement`);
            }
            if (drawId && drawBlocked[drawId] && drawBlocked[drawId].includes(number)) {
                errors.push(`Numéro ${number} est bloqué pour le tirage ${bet.drawName || drawId}`);
            }
        });
        return errors;
    }

    function checkLimits(cart) {
        const errors = [];
        const todayTotals = window.APP_STATE?.dailyTotals || { global: {}, byDraw: {} };
        const globalLimits = window.APP_STATE?.globalLimits || {};
        const drawLimits = window.APP_STATE?.drawLimits || {};

        cart.forEach(bet => {
            const drawId = bet.drawId;
            const number = bet.cleanNumber || bet.number;
            const amount = parseFloat(bet.amount) || 0;
            if (!number || amount <= 0) return;

            // Limite globale
            if (globalLimits[number] !== undefined) {
                const limit = globalLimits[number];
                const already = todayTotals.global[number] || 0;
                if (already + amount > limit) {
                    errors.push(`Numéro ${number} : limite globale ${limit} Gdes (déjà ${already} Gdes, tentative +${amount} Gdes)`);
                }
            }

            // Limite par tirage
            if (drawId && drawLimits[drawId] && drawLimits[drawId][number] !== undefined) {
                const limit = drawLimits[drawId][number];
                const already = (todayTotals.byDraw[drawId] && todayTotals.byDraw[drawId][number]) || 0;
                if (already + amount > limit) {
                    errors.push(`Numéro ${number} (${bet.drawName || drawId}) : limite ${limit} Gdes (déjà ${already} Gdes, tentative +${amount} Gdes)`);
                }
            }
        });
        return errors;
    }

    // ==================== Surcharge de processFinalTicket ====================
    window.processFinalTicket = async function() {
        if (!dataLoaded) {
            alert("Chargement des données de validation... Veuillez réessayer dans un instant.");
            return;
        }

        const cart = window.APP_STATE?.currentCart || [];
        if (cart.length === 0) {
            alert("Panye vid");
            return;
        }

        // Vérification des numéros bloqués
        const blockedErrors = checkBlocked(cart);
        if (blockedErrors.length > 0) {
            alert("❌ Nimewo bloke :\n- " + blockedErrors.join("\n- "));
            return;
        }

        // Vérification des limites
        const limitErrors = checkLimits(cart);
        if (limitErrors.length > 0) {
            alert("❌ Depasman limit pou nimewo sa yo :\n- " + limitErrors.join("\n- "));
            return;
        }

        // Tout est bon → appel de la fonction originale
        await originalProcessFinalTicket.apply(this, arguments);

        // Mise à jour des totaux après ajout du nouveau ticket
        calculateDailyTotals();
    };

    // Lancer le chargement des données immédiatement
    loadValidationData();
})();