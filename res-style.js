:root {
    --primary: #4a6bff;
    --secondary: #00d4ff;
    --success: #28a745;
    --danger: #ff4d4d;
    --warning: #ffc107;
    --dark: #343a40;
    --light: #f8f9fa;
    --text: #333;
    --text-dim: #666;
    --border: #dee2e6;
    --card-bg: #fff;
    --sidebar-bg: #2c3e50;
    --shadow: rgba(0, 0, 0, 0.1);
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
}

body {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    padding: 15px;
    font-size: 14px;
    line-height: 1.4;
}

.supervisor-container {
    max-width: 1400px;
    margin: 0 auto;
    background: white;
    border-radius: 16px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    overflow: hidden;
    min-height: calc(100vh - 30px);
}

/* Header */
.supervisor-header {
    background: var(--dark);
    color: white;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 15px;
    border-bottom: 3px solid var(--primary);
}

.header-left h1 {
    font-size: 20px;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 10px;
}

.header-left p {
    color: #ccc;
    font-size: 13px;
}

.header-right {
    display: flex;
    gap: 10px;
    justify-content: space-between;
}

.stats-box {
    background: rgba(255, 255, 255, 0.1);
    padding: 10px 15px;
    border-radius: 10px;
    text-align: center;
    flex: 1;
    min-width: 0;
}

.stats-box .number {
    font-size: 20px;
    font-weight: bold;
    color: var(--secondary);
}

.stats-box .label {
    font-size: 11px;
    opacity: 0.8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* Main Layout */
.supervisor-main {
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - 120px);
}

/* Sidebar */
.supervisor-sidebar {
    background: var(--sidebar-bg);
    color: white;
    padding: 15px;
    width: 100%;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.user-profile {
    text-align: center;
    padding: 15px 0;
    margin-bottom: 15px;
}

.user-avatar {
    width: 70px;
    height: 70px;
    background: linear-gradient(135deg, #667eea, #764ba2);
    border-radius: 50%;
    margin: 0 auto 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
}

.user-name {
    font-size: 16px;
    font-weight: bold;
    margin-bottom: 4px;
}

.user-role {
    color: var(--secondary);
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
}

.nav-menu {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    justify-content: center;
}

.nav-item {
    padding: 12px 15px;
    border-radius: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 10px;
    transition: all 0.3s;
    flex: 1;
    min-width: 120px;
    justify-content: center;
}

.nav-item:hover, .nav-item.active {
    background: rgba(255, 255, 255, 0.1);
    color: var(--secondary);
}

.nav-item i {
    width: 20px;
    text-align: center;
    font-size: 16px;
}

.nav-item.logout-btn {
    color: var(--danger);
    background: rgba(255, 77, 77, 0.1);
}

/* Content Area */
.supervisor-content {
    padding: 20px;
    background: #f5f7fb;
    flex: 1;
    overflow-y: auto;
}

.section-header {
    display: flex;
    flex-direction: column;
    gap: 15px;
    margin-bottom: 25px;
    padding-bottom: 15px;
    border-bottom: 1px solid var(--border);
}

.section-header h2 {
    color: var(--dark);
    font-size: 20px;
    display: flex;
    align-items: center;
    gap: 10px;
}

.controls {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
}

.btn {
    padding: 10px 16px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: all 0.3s;
    font-size: 14px;
    white-space: nowrap;
}

.btn-primary {
    background: var(--primary);
    color: white;
}

.btn-secondary {
    background: var(--secondary);
    color: white;
}

.btn-danger {
    background: var(--danger);
    color: white;
}

.btn-warning {
    background: var(--warning);
    color: var(--dark);
}

.btn-success {
    background: var(--success);
    color: white;
}

.btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.15);
}

.btn:active {
    transform: translateY(0);
}

/* Stats Grid */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 15px;
    margin-bottom: 25px;
}

.stat-card {
    color: white;
    padding: 20px;
    border-radius: 15px;
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
}

.stat-card-1 {
    background: linear-gradient(135deg, #667eea, #764ba2);
}

.stat-card-2 {
    background: linear-gradient(135deg, #28a745, #20c997);
}

.stat-card-3 {
    background: linear-gradient(135deg, #ffc107, #fd7e14);
}

.stat-card-4 {
    background: linear-gradient(135deg, #dc3545, #e83e8c);
}

.stat-card h3 {
    font-size: 16px;
    margin-bottom: 10px;
    opacity: 0.9;
}

.stat-number {
    font-size: 28px;
    font-weight: bold;
}

/* Agents Grid */
.agents-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 15px;
}

.recent-agents-container {
    display: grid;
    grid-template-columns: 1fr;
    gap: 15px;
}

.agent-card {
    background: white;
    border-radius: 12px;
    padding: 18px;
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.05);
    border: 2px solid transparent;
    transition: all 0.3s;
}

.agent-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
    border-color: var(--primary);
}

.agent-card.blocked {
    border-color: var(--danger);
    opacity: 0.7;
}

.agent-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
    gap: 10px;
}

.agent-status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
}

.status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
}

.status-dot.online {
    background: var(--success);
    box-shadow: 0 0 8px var(--success);
    animation: pulse 2s infinite;
}

.status-dot.offline {
    background: var(--text-dim);
}

.agent-name {
    font-size: 16px;
    font-weight: bold;
    color: var(--dark);
    margin-bottom: 4px;
}

.agent-id {
    color: var(--text-dim);
    font-size: 12px;
    margin-bottom: 10px;
}

.agent-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin: 12px 0;
}

.stat-item {
    text-align: center;
    padding: 10px;
    background: #f8f9fa;
    border-radius: 8px;
}

.stat-label {
    font-size: 11px;
    color: var(--text-dim);
    display: block;
    margin-bottom: 4px;
}

.stat-value {
    font-size: 16px;
    font-weight: bold;
    color: var(--primary);
}

.agent-actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
}

.btn-small {
    padding: 8px 12px;
    font-size: 12px;
    flex: 1;
}

/* Modal */
.modal {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1000;
    align-items: center;
    justify-content: center;
    padding: 15px;
}

.modal-content {
    background: white;
    width: 100%;
    max-width: 800px;
    max-height: 90vh;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
}

.modal-header {
    background: var(--dark);
    color: white;
    padding: 18px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
}

.modal-header h3 {
    font-size: 18px;
    margin: 0;
}

.close-modal {
    background: none;
    border: none;
    color: white;
    font-size: 24px;
    cursor: pointer;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.modal-body {
    padding: 20px;
    overflow-y: auto;
    flex: 1;
}

/* Tabs */
.tabs {
    display: flex;
    gap: 5px;
    margin-bottom: 20px;
    border-bottom: 2px solid var(--border);
    flex-wrap: wrap;
}

.tab-btn {
    padding: 12px 16px;
    background: none;
    border: none;
    border-bottom: 3px solid transparent;
    cursor: pointer;
    font-weight: 600;
    color: var(--text-dim);
    font-size: 14px;
    white-space: nowrap;
}

.tab-btn.active {
    color: var(--primary);
    border-bottom-color: var(--primary);
}

.tab-content {
    display: none;
}

.tab-content.active {
    display: block;
    animation: fadeIn 0.3s;
}

/* Ticket List */
.tickets-list {
    max-height: 300px;
    overflow-y: auto;
}

.ticket-item {
    background: #f8f9fa;
    padding: 12px;
    margin-bottom: 8px;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.ticket-info {
    flex: 1;
}

.ticket-time {
    color: var(--text-dim);
    font-size: 11px;
    display: block;
    margin-top: 4px;
}

.btn-delete-ticket {
    background: var(--danger);
    color: white;
    border: none;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    align-self: flex-end;
}

/* Forms */
.form-control {
    padding: 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    font-size: 14px;
    width: 100%;
}

.filters {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 20px;
}

#search-agent {
    padding: 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    font-size: 14px;
}

/* Loading States */
.loading-spinner {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    color: var(--text-dim);
    text-align: center;
    gap: 15px;
}

.loading-spinner.small {
    padding: 20px;
}

.loading-spinner i {
    font-size: 32px;
    color: var(--primary);
}

.loading-spinner.small i {
    font-size: 24px;
}

.loading-spinner p {
    font-size: 14px;
}

.empty-state {
    text-align: center;
    color: var(--text-dim);
    padding: 40px;
    font-size: 16px;
}

/* Notification Container */
#notification-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 350px;
}

.notification {
    padding: 15px 20px;
    border-radius: 10px;
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
    animation: slideIn 0.3s;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
}

.notification.success {
    background: var(--success);
    color: white;
}

.notification.error {
    background: var(--danger);
    color: white;
}

.notification.info {
    background: var(--primary);
    color: white;
}

.notification.warning {
    background: var(--warning);
    color: var(--dark);
}

/* Modal Footer */
.modal-footer {
    padding: 18px 20px;
    background: #f8f9fa;
    border-top: 1px solid var(--border);
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
}

.section-title {
    margin: 25px 0 15px 0;
    font-size: 18px;
    color: var(--dark);
}

/* Animations */
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

@keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
}

@keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(40, 167, 69, 0.7); }
    70% { box-shadow: 0 0 0 10px rgba(40, 167, 69, 0); }
    100% { box-shadow: 0 0 0 0 rgba(40, 167, 69, 0); }
}

/* Responsive Design */
@media (min-width: 576px) {
    body {
        padding: 20px;
    }
    
    .supervisor-header {
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        padding: 20px 25px;
    }
    
    .header-right {
        gap: 15px;
    }
    
    .stats-box {
        padding: 12px 18px;
    }
    
    .supervisor-sidebar {
        width: 250px;
        border-right: 1px solid rgba(255, 255, 255, 0.1);
        border-bottom: none;
    }
    
    .supervisor-main {
        flex-direction: row;
    }
    
    .nav-menu {
        flex-direction: column;
        flex-wrap: nowrap;
    }
    
    .nav-item {
        justify-content: flex-start;
        min-width: auto;
    }
    
    .stats-grid {
        grid-template-columns: repeat(4, 1fr);
    }
    
    .filters {
        flex-direction: row;
    }
    
    #search-agent {
        flex: 1;
    }
}

@media (min-width: 768px) {
    .agents-grid {
        grid-template-columns: repeat(2, 1fr);
    }
    
    .recent-agents-container {
        grid-template-columns: repeat(2, 1fr);
    }
    
    .section-header {
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
    }
    
    .modal-content {
        max-height: 85vh;
    }
}

@media (min-width: 992px) {
    .agents-grid {
        grid-template-columns: repeat(3, 1fr);
    }
    
    .recent-agents-container {
        grid-template-columns: repeat(4, 1fr);
    }
}

@media (min-width: 1200px) {
    .agents-grid {
        grid-template-columns: repeat(4, 1fr);
    }
}

/* Touch-friendly improvements */
@media (hover: none) and (pointer: coarse) {
    .btn, .nav-item, .tab-btn {
        min-height: 44px;
        min-width: 44px;
    }
    
    .agent-card:hover {
        transform: none;
    }
    
    .btn:hover {
        transform: none;
    }
    
    .agent-actions .btn-small {
        padding: 12px;
    }
}

/* Print Styles */
@media print {
    .supervisor-container {
        box-shadow: none;
        border-radius: 0;
    }
    
    .btn, .modal, #notification-container {
        display: none !important;
    }
    
    body {
        background: white;
        padding: 0;
    }
}