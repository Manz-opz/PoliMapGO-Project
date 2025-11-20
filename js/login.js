// Login using Edge Functions
const AUTH_FUNCTION_URL =
  "https://spmnhcxigezzjqabxpmg.supabase.co/functions/v1/auth";
const anonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwbW5oY3hpZ2V6empxYWJ4cG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY3OTE2ODcsImV4cCI6MjA3MjM2NzY4N30.cghMxz__fkITUUzFSYaXxLi4kUj8jKDfNUGpQH35kr4";

// Edge Function helper
// Edge Function helper - UPDATED VERSION
async function callAuthFunction(action, data = {}) {
  try {
    console.log("🔍 Sending request to auth function:", { action, data });

    const requestBody = {
      action: action,
      data: data,
    };

    console.log("📦 Request body:", JSON.stringify(requestBody, null, 2));

    const response = await fetch(AUTH_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    console.log("📡 Response status:", response.status);

    const responseText = await response.text();
    console.log("📨 Response text:", responseText);

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
  console.error("JSON parse error:", parseError);
      throw new Error("Invalid JSON response from server");
    }

    if (!response.ok) {
  console.error("Response not OK:", result);
      throw new Error(
        result.error || `Authentication failed: ${response.status}`
      );
    }

  console.log("Auth function success:", result);
    return result;
  } catch (error) {
  console.error("Auth function error:", error);
    throw error;
  }
}

// OTP Password Reset System
let currentStep = 1;
let userEmail = "";
let otpTimer = null;
let timeLeft = 600; // 10 minutes in seconds

// TAMBAH: Forgot Password Functions
function showForgotPassword() {
  currentStep = 1;
  userEmail = "";
  resetModal();

  const modal = new bootstrap.Modal(
    document.getElementById("forgotPasswordModal")
  );
  modal.show();
}

function resetModal() {
  // Reset semua steps ke step 1
  document.getElementById("step1").classList.remove("d-none");
  document.getElementById("step2").classList.add("d-none");
  document.getElementById("step3").classList.add("d-none");

  // Reset inputs
  document.getElementById("resetEmail").value = "";
  document.getElementById("resetOTP").value = "";
  document.getElementById("newPassword").value = "";
  document.getElementById("confirmPassword").value = "";

  // Reset button
  document.getElementById("modalActionBtn").textContent = "Send OTP";
  document.getElementById("modalActionBtn").disabled = false;

  // Clear timer
  if (otpTimer) {
    clearInterval(otpTimer);
    otpTimer = null;
  }

  // Reset timer display
  document.getElementById("otpTimer").textContent = "10:00";
}

async function handleModalAction() {
  switch (currentStep) {
    case 1:
      await requestOTP();
      break;
    case 2:
      await verifyOTP();
      break;
    case 3:
      await resetPasswordWithOTP();
      break;
  }
}

async function requestOTP() {
  const email = document.getElementById("resetEmail").value.trim();

  if (!email) {
    alert("Please enter your email address");
    return;
  }

  if (!validateEmail(email)) {
    alert("Please enter a valid email address");
    return;
  }

  try {
    // Show loading
    const btn = document.getElementById("modalActionBtn");
    btn.disabled = true;
    btn.innerHTML =
      '<span class="spinner-border spinner-border-sm" role="status"></span> Sending...';

    // Request OTP dari Edge Function
    const result = await callAuthFunction("request_otp", { email });

    console.log("OTP Response:", result); // Debug log

    if (result.success) {
      userEmail = email;
      currentStep = 2;

      // Show OTP step
      document.getElementById("step1").classList.add("d-none");
      document.getElementById("step2").classList.remove("d-none");
      document.getElementById("modalActionBtn").textContent = "Verify OTP";
      document.getElementById("modalActionBtn").disabled = false;

      // Start OTP timer
      startOTPTimer();

      // Show OTP untuk development - FIXED ACCESS
      const otpCode = result.data?.otp;
      if (otpCode) {
        alert(
          `OTP for ${email}: ${otpCode}\n\n(In production, this would be sent via email/SMS)`
        );
      } else {
        alert(`OTP sent to ${email}! Check your email.`);
      }
    }
  } catch (error) {
    alert("Failed to send OTP: " + error.message);
  } finally {
    const btn = document.getElementById("modalActionBtn");
    btn.disabled = false;
    if (currentStep === 1) {
      btn.textContent = "Send OTP";
    }
  }
}

async function verifyOTP() {
  const otp = document.getElementById("resetOTP").value.trim();

  if (!otp || otp.length !== 6) {
    alert("Please enter a valid 6-digit OTP");
    return;
  }

  try {
    const btn = document.getElementById("modalActionBtn");
    btn.disabled = true;
    btn.innerHTML =
      '<span class="spinner-border spinner-border-sm" role="status"></span> Verifying...';

    const result = await callAuthFunction("verify_otp", {
      email: userEmail,
      otp: otp,
    });

    if (result.success) {
      currentStep = 3;

      // Show password step
      document.getElementById("step2").classList.add("d-none");
      document.getElementById("step3").classList.remove("d-none");
      document.getElementById("modalActionBtn").textContent = "Reset Password";
      document.getElementById("modalActionBtn").disabled = false;

      // Clear timer
      if (otpTimer) {
        clearInterval(otpTimer);
        otpTimer = null;
      }
    }
  } catch (error) {
    alert("OTP verification failed: " + error.message);
  } finally {
    const btn = document.getElementById("modalActionBtn");
    btn.disabled = false;
    if (currentStep === 2) {
      btn.textContent = "Verify OTP";
    }
  }
}

async function resetPasswordWithOTP() {
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;
  const otp = document.getElementById("resetOTP").value.trim();

  if (!newPassword || !confirmPassword) {
    alert("Please enter and confirm your new password");
    return;
  }

  if (newPassword !== confirmPassword) {
    alert("Passwords do not match!");
    return;
  }

  if (newPassword.length < 6) {
    alert("Password must be at least 6 characters long");
    return;
  }

  try {
    const btn = document.getElementById("modalActionBtn");
    btn.disabled = true;
    btn.innerHTML =
      '<span class="spinner-border spinner-border-sm" role="status"></span> Resetting...';

    const result = await callAuthFunction("reset_password_with_otp", {
      email: userEmail,
      otp: otp,
      new_password: newPassword,
    });

    if (result.success) {
      alert(
        "Password reset successfully! You can now login with your new password."
      );

      // Close modal
      const modal = bootstrap.Modal.getInstance(
        document.getElementById("forgotPasswordModal")
      );
      modal.hide();
    }
  } catch (error) {
    alert("Password reset failed: " + error.message);
  } finally {
    const btn = document.getElementById("modalActionBtn");
    btn.disabled = false;
    btn.textContent = "Reset Password";
  }
}

function startOTPTimer() {
  timeLeft = 600; // 10 minutes
  updateTimerDisplay();

  otpTimer = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();

    if (timeLeft <= 0) {
      clearInterval(otpTimer);
      document.getElementById("otpTimer").textContent = "OTP Expired";
      document.getElementById("modalActionBtn").disabled = true;
    }
  }, 1000);
}

function updateTimerDisplay() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  document.getElementById("otpTimer").textContent = `${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

async function resendOTP() {
  if (timeLeft > 570) {
    // Prevent spam - wait at least 30 seconds
    alert("Please wait before requesting a new OTP");
    return;
  }

  try {
    const result = await callAuthFunction("request_otp", { email: userEmail });

    if (result.success) {
      // Reset timer
      if (otpTimer) clearInterval(otpTimer);
      startOTPTimer();

      // Enable verify button
      document.getElementById("modalActionBtn").disabled = false;

      alert(`New OTP sent: ${result.data.otp}`);
    }
  } catch (error) {
    alert("Failed to resend OTP: " + error.message);
  }
}

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// Existing login functions
document.addEventListener("keypress", function (event) {
  if (event.key === "Enter") {
    event.preventDefault();
    document.getElementById("enter").click();
  }
});

export async function login() {
  const user = document.getElementById("username").value.trim();
  const pass = document.getElementById("password").value;

  if (!user || !pass) {
    alert("Enter username/password!");
    return;
  }

  try {
    // Call secure Edge Function for login
    const result = await callAuthFunction("login", {
      username: user,
      password: pass,
    });

    const userData = result.data;

    // Store UUID and basic info in localStorage
    localStorage.setItem("userId", userData.id);
    localStorage.setItem("username", userData.username);

    // Redirect
    window.location.href = "map.html";
  } catch (error) {
    alert(error.message);
  }
}

export function firstPage() {
  localStorage.setItem("userId", "0");
  localStorage.setItem("username", "Guest");
  localStorage.removeItem("userId"); // Clear any previous user ID
  window.location.href = "map.html";
}

// Make functions global
window.login = login;
window.firstPage = firstPage;
window.showForgotPassword = showForgotPassword;
window.handleModalAction = handleModalAction;
window.resendOTP = resendOTP;
