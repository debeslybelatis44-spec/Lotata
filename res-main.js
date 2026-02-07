// Initialisation de l'application
document.addEventListener('DOMContentLoaded', () => {
    // Ajouter les styles UI
    UI.addStyles();
    
    // Créer le bouton de basculement de la sidebar pour mobile
    const sidebarToggle = document.createElement('button');
    sidebarToggle.className = 'sidebar-toggle';
    sidebarToggle.innerHTML = '<i class="fas fa-bars"></i>';
    sidebarToggle.onclick = UI.toggleSidebar;
    document.body.appendChild(sidebarToggle);
    
    // Initialiser l'état du mode mobile
    MOBILE_MODE = localStorage.getItem('mobile_mode') === 'true';
    if (MOBILE_MODE) {
        document.body.classList.add('mobile-mode');
        document.querySelector('.mobile-toggle i').className = 'fas fa-desktop';
        document.querySelector('.mobile-toggle').title = 'Mode PC';
    } else {
        document.querySelector('.mobile-toggle i').className = 'fas fa-mobile-alt';
        document.querySelector('.mobile-toggle').title = 'Mode Mobile';
    }
    
    // Initialiser le gestionnaire de superviseur
    window.supervisorManager = new SupervisorManager();
    
    // Initialiser les écouteurs d'événements UI
    UI.initEventListeners();
    
    // Actualiser automatiquement les données toutes les 60 secondes
    setInterval(() => {
        if (supervisorManager) {
            supervisorManager.updateDashboardStats();
        }
    }, 60000);
    
    console.log('✅ Application initialisée');
});