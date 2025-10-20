// Signin using Edge Functions
const AUTH_FUNCTION_URL = "https://spmnhcxigezzjqabxpmg.supabase.co/functions/v1/auth";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwbW5oY3hpZ2V6empxYWJ4cG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY3OTE2ODcsImV4cCI6MjA3MjM2NzY4N30.cghMxz__fkITUUzFSYaXxLi4kUj8jKDfNUGpQH35kr4";

// Edge Function helper
async function callAuthFunction(action, data = {}) {
  try {
    const response = await fetch(AUTH_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`
      },
      body: JSON.stringify({ action, data })
    });

    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    return result;
  } catch (error) {
    console.error('Auth function error:', error);
    throw error;
  }
}

// Back button
function goBack() {
  window.history.back();
}

// Register new user
async function register() {
  const username = document.getElementById("username").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  // Validation
  if (!username || !email || !password || !confirmPassword) {
    alert("Please fill in all fields.");
    return;
  }

  if (password !== confirmPassword) {
    alert("Passwords do not match.");
    return;
  }

  if (password.length < 6) {
    alert("Password must be at least 6 characters long.");
    return;
  }

  try {
    // Call secure Edge Function for registration
    const result = await callAuthFunction('register', {
      username: username,
      email: email,
      password: password
    });

    alert("Registration successful! You can now log in.");
    window.location.href = "login.html";
  } catch (error) {
    alert("Registration failed: " + error.message);
  }
}

// Global function assignments
window.register = register;
window.goBack = goBack;