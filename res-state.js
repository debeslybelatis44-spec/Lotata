// Configuration du superviseur
const SUPERVISOR_CONFIG = {
    SUPERVISOR_ID: null,
    SUPERVISOR_NAME: '',
    SUPERVISOR_EMAIL: '',
    SUPERVISOR_PHONE: '',
    PERMISSIONS: {
        DELETE_TICKETS: true,
        BLOCK_AGENTS: true,
        VIEW_REPORTS: true,
        VIEW_WINNERS: true,
        MAX_DELETE_TIME: 10 // minutes
    }
};

let SUPERVISOR_STATE = {
    agents: [],
    tickets: [],
    winners: [],
    selectedAgent: null,
    currentView: 'dashboard'
};

// État de l'application mobile
let MOBILE_MODE = false;