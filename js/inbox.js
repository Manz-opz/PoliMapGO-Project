// inbox.js - Enhanced with Custom Alerts and Dark Mode Support

const EDGE_FUNCTION_URLS = {
  notifications: "https://spmnhcxigezzjqabxpmg.supabase.co/functions/v1/notifications",
};

const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwbW5oY3hpZ2V6empxYWJ4cG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY3OTE2ODcsImV4cCI6MjA3MjM2NzY4N30.cghMxz__fkITUUzFSYaXxLi4kUj8jKDfNUGpQH35kr4";

// Track last load time and polling state
let lastLoadTime = 0;
let pollingInterval = null;
let isPageVisible = true;
const LOAD_COOLDOWN = 3000;
const POLLING_INTERVAL = 60000;

// Initialize dark mode
function initializeDarkMode() {
  const darkMode = localStorage.getItem('darkMode') === 'true';
  if (darkMode) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
}

// Enhanced Alert System
function showCustomAlert(options) {
  return new Promise((resolve) => {
    const {
      title,
      message,
      type = 'warning', // warning, danger, success, info
      confirmText = 'Confirm',
      cancelText = 'Cancel',
      showCancel = true,
      dangerous = false
    } = options;

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'custom-alert-overlay';
    
    // Create alert container
    const alert = document.createElement('div');
    alert.className = 'custom-alert';
    
    // Icon mapping
    const icons = {
      warning: 'bi-exclamation-triangle',
      danger: 'bi-exclamation-circle',
      success: 'bi-check-circle',
      info: 'bi-info-circle'
    };
    
    alert.innerHTML = `
      <div class="custom-alert-header">
        <div class="custom-alert-icon ${type}">
          <i class="bi ${icons[type]}"></i>
        </div>
        <h3 class="custom-alert-title">${title}</h3>
        ${message ? `<p class="custom-alert-message">${message}</p>` : ''}
      </div>
      <div class="custom-alert-body">
        <div class="custom-alert-actions">
          ${showCancel ? `
            <button class="custom-alert-btn custom-alert-btn-secondary" data-action="cancel">
              ${cancelText}
            </button>
          ` : ''}
          <button class="custom-alert-btn ${dangerous ? 'custom-alert-btn-danger' : 'custom-alert-btn-primary'}" data-action="confirm">
            ${confirmText}
          </button>
        </div>
      </div>
    `;
    
    // Add to DOM
    document.body.appendChild(overlay);
    document.body.appendChild(alert);
    
    // Handle actions
    const handleAction = (action) => {
      document.body.removeChild(overlay);
      document.body.removeChild(alert);
      resolve(action === 'confirm');
    };
    
    // Event listeners
    alert.querySelector('[data-action="confirm"]').addEventListener('click', () => handleAction('confirm'));
    
    if (showCancel) {
      alert.querySelector('[data-action="cancel"]').addEventListener('click', () => handleAction('cancel'));
      overlay.addEventListener('click', () => handleAction('cancel'));
    }
    
    // Escape key handler
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        handleAction('cancel');
        document.removeEventListener('keydown', handleEscape);
      }
    };
    
    document.addEventListener('keydown', handleEscape);
  });
}

// Show toast notification
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `custom-toast custom-toast-${type}`;
  toast.innerHTML = `
    <div class="custom-toast-content">
      <i class="bi ${getToastIcon(type)}"></i>
      <span>${message}</span>
    </div>
  `;
  
  // Add styles if not already added
  if (!document.querySelector('#toast-styles')) {
    const styles = document.createElement('style');
    styles.id = 'toast-styles';
    styles.textContent = `
      .custom-toast {
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border-radius: 12px;
        padding: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        z-index: 1001;
        animation: toastSlideIn 0.3s ease;
        max-width: 300px;
        border-left: 4px solid #007aff;
      }
      .dark-mode .custom-toast {
        background: #2d2d2d;
        color: white;
      }
      .custom-toast-success { border-left-color: #34c759; }
      .custom-toast-warning { border-left-color: #ff9500; }
      .custom-toast-danger { border-left-color: #ff3b30; }
      .custom-toast-info { border-left-color: #007aff; }
      .custom-toast-content {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .custom-toast-content i {
        font-size: 1.2rem;
      }
      @keyframes toastSlideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(styles);
  }
  
  document.body.appendChild(toast);
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.animation = 'toastSlideOut 0.3s ease';
      setTimeout(() => {
        if (toast.parentNode) {
          document.body.removeChild(toast);
        }
      }, 300);
    }
  }, 3000);
}

function getToastIcon(type) {
  const icons = {
    success: 'bi-check-circle',
    warning: 'bi-exclamation-triangle',
    danger: 'bi-exclamation-circle',
    info: 'bi-info-circle'
  };
  return icons[type] || 'bi-info-circle';
}

// Edge Function helper
async function callEdgeFunction(functionName, action, data = {}) {
  try {
    const functionUrl = EDGE_FUNCTION_URLS[functionName];
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ action, data }),
    });

    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}`);
    }

    const result = await response.json();
    if (result.error) throw new Error(result.error);

    return result;
  } catch (error) {
    console.error(`Edge function ${functionName}.${action} failed:`, error);
    throw error;
  }
}

function goBack() {
    window.history.back();
}

function getCurrentUser() {
    return {
        id: localStorage.getItem('userId'),
        username: localStorage.getItem('username')
    };
}

// FIXED: Correct function name - was "mark4shead"
async function markAsRead(id) {
  try {
    const userId = localStorage.getItem('userId');
    if (!userId) {
      console.log("User not logged in, cannot mark as read");
      return;
    }

    await callEdgeFunction("notifications", "mark_as_read", { 
      id: id,
      user_id: userId
    });
  } catch (error) {
    console.error("Failed to mark as read:", error);
  }
}

async function deleteMessage(id) {
  try {
    const userId = localStorage.getItem('userId');
    if (!userId) {
      await showCustomAlert({
        title: 'Login Required',
        message: 'You need to be logged in to delete messages.',
        type: 'warning',
        confirmText: 'OK',
        showCancel: false
      });
      return;
    }

    await callEdgeFunction("notifications", "delete_notification", { 
      id: id,
      user_id: userId
    });
  } catch (error) {
    console.error("Failed to delete message:", error);
    showToast('Failed to delete message: ' + error.message, 'danger');
  }
}

// FIXED: Add missing displayMessages function
function displayMessages(container, messages) {
    if (messages.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-inbox"></i>
                <p>No new messages</p>
                <small>Messages sent to you will appear here</small>
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    messages.forEach(msg => {
        const messageElement = createMessageElement(msg);
        container.appendChild(messageElement);
    });
}

// FIXED: Add missing createMessageElement function
function createMessageElement(msg) {
    const el = document.createElement('div');
    el.className = `message ${msg.is_read ? 'read' : 'unread'}`;
    el.setAttribute('data-message-id', msg.id);

    const avatar = createAvatar(msg.from);
    const badgeHtml = msg.is_read ? '' : '<span class="badge-unread">New</span>';
    const deleteBtn = `<button class="msg-delete" title="Delete message" data-id="${escapeHtml(msg.id)}">&times;</button>`;

    el.innerHTML = `
        ${avatar}
        <div class="content">
            <div class="message-header">
                <strong class="from">${escapeHtml(msg.from || 'System')}</strong>
                <span class="time">${formatTimestamp(msg.timestamp)}</span>
            </div>
            <div class="message-title">${escapeHtml(msg.title || '')}</div>
            <div class="message-body">${escapeHtml(msg.body || '')}</div>
        </div>
        <div class="actions">
            ${badgeHtml}
            ${deleteBtn}
        </div>
    `;

    attachMessageEventListeners(el, msg);
    return el;
}

// FIXED: Add missing createAvatar function
function createAvatar(sender) {
    const senderName = String(sender || 'System');
    const adminLogoPath = '../icon/iconLogo.png';
    const harimauPath = '../icon/harimau.jpg';
    const chosenImg = /admin/i.test(senderName) ? adminLogoPath : harimauPath;
    
    return `
        <div class="avatar">
            <img src="${chosenImg}" alt="${senderName}" 
                 onload="this.nextElementSibling.style.display='none'" 
                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'"/>
            <span class="avatar-fallback">${escapeHtml(senderName.charAt(0).toUpperCase())}</span>
        </div>
    `;
}

// FIXED: Add missing attachMessageEventListeners function
function attachMessageEventListeners(element, msg) {
    // Mark as read on click
    element.addEventListener('click', async (e) => {
        if (!e.target.closest('.msg-delete')) {
            await markAsRead(msg.id);
            element.classList.remove('unread');
            element.classList.add('read');
            const badge = element.querySelector('.badge-unread');
            if (badge) badge.remove();
            
            // Update the message object locally
            msg.is_read = true;
        }
    });

    // Delete message
    const deleteBtn = element.querySelector('.msg-delete');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const messageId = e.currentTarget.getAttribute('data-id');
            await showDeleteConfirmation(messageId, element);
        });
    }
}

// FIXED: Add missing showDeleteConfirmation function
async function showDeleteConfirmation(messageId, element) {
    const confirmed = await showCustomAlert({
        title: 'Delete Message',
        message: 'Are you sure you want to delete this message?',
        type: 'warning',
        confirmText: 'Delete',
        cancelText: 'Keep',
        dangerous: true
    });

    if (confirmed) {
        await deleteMessage(messageId);
        element.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            element.remove();
            const container = document.querySelector('.inbox-container');
            const remainingMessages = container.querySelectorAll('.message');
            if (remainingMessages.length === 0) {
                loadMessages();
            }
        }, 300);
        showToast('Message deleted successfully', 'success');
    }
}

// FIXED: Add missing formatTimestamp function
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);

    if (diffInHours < 24) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 48) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString();
    }
}

// FIXED: Add missing escapeHtml function
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Smart polling function
async function checkForNewMessages() {
    try {
        const userId = localStorage.getItem('userId');
        if (!userId) return;

        console.log('🔍 Checking for new messages...');
        
        const result = await callEdgeFunction("notifications", "get_notifications", {
            user_id: userId,
            limit: 1
        });
        
        const latestNotifications = result.data || [];
        
        if (latestNotifications.length > 0) {
            const latestNotification = latestNotifications[0];
            const latestTime = new Date(latestNotification.created_at).getTime();
            
            const container = document.querySelector('.inbox-container');
            const currentMessages = container.querySelectorAll('.message');
            let newestCurrentTime = 0;
            
            if (currentMessages.length > 0) {
                newestCurrentTime = latestTime - 1000;
            }
            
            if (latestTime > newestCurrentTime || currentMessages.length === 0) {
                console.log('🆕 New messages detected, refreshing...');
                showNewMessageIndicator();
            }
        }
    } catch (error) {
        console.error('Error checking for new messages:', error);
    }
}

// Show visual indicator for new messages
function showNewMessageIndicator() {
    const existingIndicator = document.querySelector('.new-messages-indicator');
    if (existingIndicator) existingIndicator.remove();
    
    const indicator = document.createElement('div');
    indicator.className = 'new-messages-indicator';
    indicator.innerHTML = `
        <div class="alert alert-info alert-dismissible fade show m-2" role="alert">
            <i class="bi bi-bell-fill me-2"></i>
            New messages available
            <button type="button" class="btn btn-sm btn-outline-info ms-2" onclick="loadMessages(true)">
                Refresh
            </button>
            <button type="button" class="btn-close" onclick="this.parentElement.remove()"></button>
        </div>
    `;
    
    const container = document.querySelector('.inbox-container');
    if (container) {
        container.parentNode.insertBefore(indicator, container);
    }
}

// Start smart polling
function startSmartPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    
    pollingInterval = setInterval(() => {
        if (isPageVisible) {
            checkForNewMessages();
        }
    }, POLLING_INTERVAL);
}

// Stop polling when page is not visible
function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

// Load messages from SERVER
async function loadMessages(forceRefresh = false) {
    const now = Date.now();
    
    if (!forceRefresh && (now - lastLoadTime) < LOAD_COOLDOWN) {
        console.log('Skipping load - too soon since last load');
        return;
    }

    const container = document.querySelector('.inbox-container');
    if (!container) return;

    const indicator = document.querySelector('.new-messages-indicator');
    if (indicator && forceRefresh) {
        indicator.remove();
    }

    if (!container.querySelector('.loading-spinner')) {
        container.innerHTML = `
            <div class="loading-spinner">
                <i class="bi bi-arrow-repeat"></i>
                <span>Loading messages...</span>
            </div>
        `;
    }

    try {
        const userId = localStorage.getItem('userId');
        if (!userId) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-person-x"></i>
                    <p>Please login to see messages</p>
                </div>
            `;
            return;
        }

        const result = await callEdgeFunction("notifications", "get_notifications", {
            user_id: userId
        });
        
        const notifications = result.data || [];
        
        const formattedMessages = notifications.map(notification => ({
            id: notification.id,
            to: notification.to_users,
            from: notification.users?.username || 'Admin',
            title: notification.title,
            body: notification.body,
            timestamp: notification.created_at,
            is_read: notification.is_read || false,
            type: notification.type
        }));

        // FIXED: Now displayMessages is defined
        displayMessages(container, formattedMessages);
        lastLoadTime = Date.now();
        
        console.log(`Loaded ${formattedMessages.length} messages`);
        
    } catch (error) {
        console.error("Failed to load messages:", error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-exclamation-triangle"></i>
                <p>Error loading messages</p>
                <small>Please check your connection</small>
            </div>
        `;
    }
}

// UPDATED: deleteAllMessages function with enhanced alert
async function deleteAllMessages() {
    const userId = localStorage.getItem('userId');
    if (!userId) {
        await showCustomAlert({
            title: 'Login Required',
            message: 'You need to be logged in to delete messages.',
            type: 'warning',
            confirmText: 'OK',
            showCancel: false
        });
        return;
    }

    const visibleMessages = document.querySelectorAll('.message');
    const messageCount = visibleMessages.length;
    
    if (messageCount === 0) {
        await showCustomAlert({
            title: 'No Messages',
            message: 'There are no messages to delete.',
            type: 'info',
            confirmText: 'OK',
            showCancel: false
        });
        return;
    }

    const confirmed = await showCustomAlert({
        title: 'Delete All Messages',
        message: `This will remove ${messageCount} messages from your inbox. This action cannot be undone.`,
        type: 'danger',
        confirmText: 'Delete All',
        cancelText: 'Cancel',
        dangerous: true
    });

    if (!confirmed) {
        return;
    }

    try {
        // Show loading state
        const container = document.querySelector('.inbox-container');
        const originalContent = container.innerHTML;
        container.innerHTML = `
            <div class="loading-spinner">
                <i class="bi bi-trash3"></i>
                <span>Deleting ${messageCount} messages...</span>
            </div>
        `;

        // Get IDs of currently visible messages
        const messageIds = Array.from(visibleMessages).map(messageElement => 
            messageElement.getAttribute('data-message-id')
        ).filter(id => id);

        console.log(`Deleting ${messageIds.length} messages:`, messageIds);

        // Delete each visible message individually
        const deletePromises = messageIds.map(messageId => 
            callEdgeFunction("notifications", "delete_notification", { 
                id: messageId,
                user_id: userId
            })
        );

        // Wait for all deletions to complete
        await Promise.all(deletePromises);

        // Show success message
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-check-circle text-success"></i>
                <p>Messages deleted successfully</p>
                <small>${messageIds.length} messages removed from your inbox</small>
                <button class="btn btn-primary mt-2" onclick="loadMessages(true)">
                    Refresh Inbox
                </button>
            </div>
        `;

        showToast(`${messageIds.length} messages deleted successfully`, 'success');
  console.log(`Successfully deleted ${messageIds.length} messages`);

    } catch (error) {
        console.error("Failed to delete all messages:", error);
        
        // Restore original content and show error
        const container = document.querySelector('.inbox-container');
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-exclamation-triangle text-danger"></i>
                <p>Failed to delete messages</p>
                <small>${error.message}</small>
                <button class="btn btn-primary mt-2" onclick="loadMessages(true)">
                    Try Again
                </button>
            </div>
        `;
        
        showToast('Failed to delete messages: ' + error.message, 'danger');
    }
}

// UPDATED: deleteReadMessages function with enhanced alert
async function deleteReadMessages() {
    const userId = localStorage.getItem('userId');
    if (!userId) {
        await showCustomAlert({
            title: 'Login Required',
            message: 'You need to be logged in to delete messages.',
            type: 'warning',
            confirmText: 'OK',
            showCancel: false
        });
        return;
    }

    const readMessages = document.querySelectorAll('.message.read');
    const readCount = readMessages.length;
    
    if (readCount === 0) {
        await showCustomAlert({
            title: 'No Read Messages',
            message: 'There are no read messages to delete.',
            type: 'info',
            confirmText: 'OK',
            showCancel: false
        });
        return;
    }

    const confirmed = await showCustomAlert({
        title: 'Delete Read Messages',
        message: `This will remove ${readCount} read messages from your inbox. Unread messages will be kept.`,
        type: 'warning',
        confirmText: 'Delete Read',
        cancelText: 'Cancel',
        dangerous: true
    });

    if (!confirmed) return;

    try {
        const readMessageIds = Array.from(readMessages).map(messageElement => 
            messageElement.getAttribute('data-message-id')
        ).filter(id => id);

        const deletePromises = readMessageIds.map(messageId => 
            callEdgeFunction("notifications", "delete_notification", { 
                id: messageId,
                user_id: userId
            })
        );

        await Promise.all(deletePromises);
        
        // Remove the deleted messages from view
        readMessages.forEach(message => message.remove());
        
        // Check if inbox is now empty
        const remainingMessages = document.querySelectorAll('.message');
        if (remainingMessages.length === 0) {
            loadMessages(true);
        }
        
        showToast(`${readCount} read messages deleted`, 'success');
        
    } catch (error) {
        console.error("Failed to delete read messages:", error);
        showToast('Failed to delete read messages: ' + error.message, 'danger');
    }
}

// Event Listeners
document.addEventListener('visibilitychange', () => {
    isPageVisible = !document.hidden;
    
    if (isPageVisible) {
        console.log('📱 Page became visible');
        loadMessages(true);
        startSmartPolling();
    } else {
        console.log('📱 Page hidden');
        stopPolling();
    }
});

window.addEventListener('focus', () => {
    console.log('Window focused');
    loadMessages(true);
});

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded');
    initializeDarkMode();
    loadMessages(true);
    startSmartPolling();
});

// Add to global exports
window.deleteReadMessages = deleteReadMessages;

// Make sure to export the function
window.deleteAllMessages = deleteAllMessages;

// Export all functions to global scope
window.goBack = goBack;
window.loadMessages = loadMessages;
window.markAsRead = markAsRead;
window.deleteMessage = deleteMessage;
window.checkForNewMessages = checkForNewMessages;
window.showCustomAlert = showCustomAlert;
window.showToast = showToast;