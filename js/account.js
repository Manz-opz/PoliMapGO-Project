// Account Management using Edge Functions
const USER_ACCOUNT_URL = "https://spmnhcxigezzjqabxpmg.supabase.co/functions/v1/user-account";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwbW5oY3hpZ2V6empxYWJ4cG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY3OTE2ODcsImV4cCI6MjA3MjM2NzY4N30.cghMxz__fkITUUzFSYaXxLi4kUj8jKDfNUGpQH35kr4";

// Edge Function helper
async function callUserAccountFunction(action, data = {}) {
  try {
    const response = await fetch(USER_ACCOUNT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`
      },
      body: JSON.stringify({ action, data })
    });

    if (!response.ok) {
      throw new Error(`Account operation failed: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    return result;
  } catch (error) {
    console.error('User account function error:', error);
    throw error;
  }
}

// Back button function
function goBack() {
  window.history.back();
}

// Load user account details
async function loadUserAccount() {
  const userId = localStorage.getItem("userId");
  
  if (!userId) {
    alert("Please log in to view account details");
    window.location.href = "login.html";
    return;
  }

  try {
    // Show loading state
    document.querySelectorAll('.list-group-item strong').forEach(el => {
      el.textContent = "Loading...";
    });

    const result = await callUserAccountFunction('get_user_details', { userId });
    const userData = result.data;

    // Update the UI with user data
    document.getElementById('username-display').textContent = userData.username;
    document.getElementById('email-display').textContent = userData.email;
    
    // Display admin status based on boolean value
    const accountTypeElement = document.getElementById('account-type');
    if (userData.isAdmin) {
      accountTypeElement.textContent = "Administrator";
      accountTypeElement.className = "badge bg-success";
    } else {
      accountTypeElement.textContent = "Standard User";
      accountTypeElement.className = "badge bg-secondary";
    }

    // Update avatar - use crown icon for admin, person for regular user
    const avatarIcon = document.querySelector('.avatar-icon i');
    if (avatarIcon) {
      if (userData.isAdmin) {
        avatarIcon.className = 'bi bi-person-badge fs-3';
        avatarIcon.style.color = '#ffd700'; // Gold color for admin
      } else {
        avatarIcon.className = 'bi bi-person-circle fs-3';
        avatarIcon.style.color = ''; // Reset to default
      }
    }

    // Store user data for later use
    sessionStorage.setItem('userAccountData', JSON.stringify(userData));

  } catch (error) {
    console.error("Failed to load user account:", error);
    alert("Failed to load account details: " + error.message);
    
    // Show placeholder data
    document.getElementById('username-display').textContent = "Error loading";
    document.getElementById('email-display').textContent = "Error loading";
    document.getElementById('account-type').textContent = "Error";
  }
}

// Change password functionality
async function changePassword() {
  const userId = localStorage.getItem("userId");
  
  if (!userId) {
    alert("Please log in to change password");
    return;
  }

  const currentPassword = prompt("Enter your current password:");
  if (!currentPassword) return;

  const newPassword = prompt("Enter your new password (min. 6 characters):");
  if (!newPassword) return;

  const confirmPassword = prompt("Confirm your new password:");
  if (!confirmPassword) return;

  if (newPassword !== confirmPassword) {
    alert("New passwords do not match!");
    return;
  }

  if (newPassword.length < 6) {
    alert("New password must be at least 6 characters long!");
    return;
  }

  try {
    const result = await callUserAccountFunction('update_password', {
      userId: userId,
      currentPassword: currentPassword,
      newPassword: newPassword
    });

    if (result.data.success) {
      alert("Password updated successfully!");
    }
  } catch (error) {
    alert("Failed to update password: " + error.message);
  }
}

// Initialize account page
document.addEventListener("DOMContentLoaded", function() {
  // Load user data when page loads
  loadUserAccount();

  // Add click handler for password change
  const passwordChangeLink = document.querySelector('a[href="#"]');
  if (passwordChangeLink) {
    passwordChangeLink.addEventListener('click', function(e) {
      e.preventDefault();
      changePassword();
    });
  }

  // Update page title with username if available
  const username = localStorage.getItem("username");
  if (username) {
    document.title = `${username}'s Account - PoliMap GO!`;
  }
});

// Global function assignments
window.goBack = goBack;
window.loadUserAccount = loadUserAccount;
window.changePassword = changePassword;