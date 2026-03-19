// validationManager.js – Version robuste avec attente de CONFIG et logs
(function() {
    if (window.validationManagerReady) return;
    window.validationManagerReady = true;

    const originalProcessFinalTicket = window.processFinalTicket;
    let dataLoaded = false;

    async function loadValidationData() {
        try {
            // 1. Attendre que CONFIG.DRAWS soit disponible
            while (!window.CONFIG || !window.CONFIG.DRAWS) {
                console.log("validationManager: Attente de CONFIG.DRAWS...");
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            console.log("validationManager: CONFIG.DRAWS trouvé");

            const token = localStorage.getItem('auth_token');
            if (!token) {
                console.warn("validationManager: Pas de token, validation désactivée.");
                dataLoaded = true; // On autorise l'impression sans validation
                return;
            }

            // 2. Charger les données globales
            const [globalBlockedRes, globalLimitsRes] = await Promise.all([
                fetch('/api/blocked-numbers/global', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/number-limits/draw/0', { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            if (!globalBlockedRes.ok || !globalLimitsRes.ok) {
                throw new Error(`Erreur API globales: ${globalBlockedRes.status} / ${globalLimitsRes.status}`);
            }

            const globalBlockedData = await globalBlockedRes.json();
            window.APP_STATE.globalBlockedNumbers = globalBlockedData.blockedNumbers || [];

            const globalLimitsData = await globalLimitsRes.json();
            window.APP_STATE.globalLimits = globalLimitsData || {};

            // 3. Charger les données par tirage
            window.APP_STATE.drawLimits = {};
            window.APP_STATE.drawBlockedNumbers = {};

            for (const draw of window.CONFIG.DRAWS) {
                try {
                    const [drawLimitsRes, drawBlockedRes] = await Promise.all([
                        fetch(`/api/number-limits/draw/${draw.id}`, { headers: { 'Authorization': `Bearer ${token}` } }),
                        fetch(`/api/blocked-numbers/draw/${draw.id}`, { headers: { 'Authorization': `Bearer ${token}` } })
                    ]);

                    if (drawLimitsRes.ok) {
                        window.APP_STATE.drawLimits[draw.id] = await drawLimitsRes.json() || {};
                    } else {
                        window.APP_STATE.drawLimits[draw.id] = {};
                    }

                    if (drawBlockedRes.ok) {
                        const drawBlockedData = await drawBlockedRes.json();
                        window.APP_STATE.drawBlockedNumbers[draw.id] = drawBlockedData.blockedNumbers || [];
                    } else {
                        window.APP_STATE.drawBlockedNumbers[draw.id] = [];
                    }
                } catch (e) {
                    console.warn(`Erreur chargement pour tirage ${draw.id}`, e);
                    window.APP_STATE.drawLimits[draw.id] = {};
                    window.APP_STATE.drawBlockedNumbers[draw.id] = [];
                }
            }

            // 4. Calculer les totaux du jour
            calculateDailyTotals();
            dataLoaded = true;
            console.log("validationManager: Données chargées avec succès");
        } catch (error) {
            console.error('Erreur chargement données validation :', error);
            // En cas d'erreur, on peut décider d'autoriser l'impression sans validation
            // dataLoaded = true; // Décommentez si vous voulez que l'impression fonctionne malgré l'échec
        }
    }

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

                window.APP_STATE.dailyTotals.global[number] = (window.APP_STATE.dailyTotals.global[number] || 0) + amount;
                if (!window.APP_STATE.dailyTotals.byDraw[drawId]) window.APP_STATE.dailyTotals.byDraw[drawId] = {};
                window.APP_STATE.dailyTotals.byDraw[drawId][number] = (window.APP_STATE.dailyTotals.byDraw[drawId][number] || 0) + amount;
            });
        });
    }

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

            if (globalLimits[number] !== undefined) {
                const limit = globalLimits[number];
                const already = todayTotals.global[number] || 0;
                if (already + amount > limit) {
                    errors.push(`Numéro ${number} : limite globale ${limit} Gdes (déjà ${already} Gdes, tentative +${amount} Gdes)`);
                }
            }

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

        const blockedErrors = checkBlocked(cart);
        if (blockedErrors.length > 0) {
            alert("❌ Nimewo bloke :\n- " + blockedErrors.join("\n- "));
            return;
        }

        const limitErrors = checkLimits(cart);
        if (limitErrors.length > 0) {
            alert("❌ Depasman limit pou nimewo sa yo :\n- " + limitErrors.join("\n- "));
            return;
        }

        await originalProcessFinalTicket.apply(this, arguments);
        calculateDailyTotals();
    };

    // Lancer le chargement
    loadValidationData();
})();