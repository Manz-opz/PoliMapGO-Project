// Enhanced Alert System for Map with Dark Mode Support
function showCustomAlert(options) {
  return new Promise((resolve) => {
    // Check current dark mode state
    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    
    const {
      title,
      message,
      type = 'warning',
      confirmText = 'Confirm',
      cancelText = 'Cancel',
      showCancel = true,
      dangerous = false
    } = options;

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'custom-alert-overlay';
    
    // Create alert container with dark mode class if needed
    const alert = document.createElement('div');
    alert.className = `custom-alert ${isDarkMode ? 'dark-mode' : ''}`;
    
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

// Show toast notification with dark mode support
function showToast(message, type = 'info') {
  const isDarkMode = localStorage.getItem('darkMode') === 'true';
  
  const toast = document.createElement('div');
  toast.className = `custom-toast custom-toast-${type} ${isDarkMode ? 'dark-mode' : ''}`;
  toast.innerHTML = `
    <div class="custom-toast-content">
      <i class="bi ${getToastIcon(type)}"></i>
      <span>${message}</span>
    </div>
  `;
  
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

// Enhanced Logout Function with Dark Mode Support
async function logout() {
  const confirmed = await showCustomAlert({
    title: 'Logout',
    message: 'Are you sure you want to logout? You will need to login again to access your account.',
    type: 'warning',
    confirmText: 'Logout',
    cancelText: 'Stay',
    dangerous: true
  });

  if (confirmed) {
    try {
      // Show loading state
      showToast('Logging out...', 'info');
      
      // Clear user data with a small delay for better UX
      setTimeout(() => {
        localStorage.removeItem("userId");
        localStorage.removeItem("username");
        localStorage.removeItem("messages");
        
        // Show success message
        showToast('Logged out successfully', 'success');
        
        // Redirect to login page after a brief delay
        setTimeout(() => {
          window.location.href = "index.html";
        }, 1000);
        
      }, 500);
      
    } catch (error) {
      console.error('Logout error:', error);
      showToast('Error during logout', 'danger');
    }
  }
}

// Initialize dark mode on page load
function initializeDarkMode() {
  const isDarkMode = localStorage.getItem('darkMode') === 'true';
  document.body.classList.toggle('dark-mode', isDarkMode);
}

// Make functions globally available
window.showCustomAlert = showCustomAlert;
window.showToast = showToast;
window.logout = logout;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
  initializeDarkMode();
  console.log('Dark mode initialized:', localStorage.getItem('darkMode') === 'true');
});