// admin-check.js - Secure admin verification using Edge Functions
const ADMIN_CHECK_URL = "https://spmnhcxigezzjqabxpmg.supabase.co/functions/v1/check-admin";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwbW5oY3hpZ2V6empxYWJ4cG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY3OTE2ODcsImV4cCI6MjA3MjM2NzY4N30.cghMxz__fkITUUzFSYaXxLi4kUj8jKDfNUGpQH35kr4";

// Edge Function helper for admin check
async function callAdminCheck(action, data = {}) {
  try {
    const response = await fetch(ADMIN_CHECK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`
      },
      body: JSON.stringify({ action, data })
    });

    if (!response.ok) {
      throw new Error(`Admin check failed: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    return result;
  } catch (error) {
    console.error('Admin check error:', error);
    throw error;
  }
}

// Main function to check if current user is admin
export async function checkAdminStatus() {
  const userId = localStorage.getItem("userId");
  
  if (!userId) {
    console.log("No user ID found - user is not logged in");
    return false;
  }

  try {
    const result = await callAdminCheck('check_admin', { userId });
    const userData = result.data;
    
    // Store the admin status in sessionStorage (temporary)
    sessionStorage.setItem("isAdmin", userData.isAdmin);
    sessionStorage.setItem("currentUsername", userData.username);
    
    return userData.isAdmin;
  } catch (error) {
    console.error("Failed to verify admin status:", error);
    sessionStorage.setItem("isAdmin", "false");
    return false;
  }
}

// Function to show/hide admin elements
export async function toggleAdminElements() {
  const isAdmin = await checkAdminStatus();
  
  if (isAdmin) {
    document.querySelectorAll(".admin-only").forEach(el => {
      el.style.display = "block";
    });
    console.log("Admin elements shown");
  } else {
    document.querySelectorAll(".admin-only").forEach(el => {
      el.style.display = "none";
    });
    console.log("Admin elements hidden");
  }
}

// Quick check without API call (uses sessionStorage cache)
export function isAdminCached() {
  return sessionStorage.getItem("isAdmin") === "true";
}

// Clear admin cache (call this on logout)
export function clearAdminCache() {
  sessionStorage.removeItem("isAdmin");
  sessionStorage.removeItem("currentUsername");
}

// Global function assignments
window.checkAdminStatus = checkAdminStatus;
window.toggleAdminElements = toggleAdminElements;
window.isAdminCached = isAdminCached;
window.clearAdminCache = clearAdminCache;
