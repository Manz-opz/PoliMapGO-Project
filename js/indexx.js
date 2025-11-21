// Show splash for this many milliseconds before navigating
const SPLASH_DURATION = 2200;

function hideSplashAndNavigate() {
    const splash = document.getElementById('splash');
    if (!splash) {
        window.location.href = 'html2/login.html';
        return;
    }

    // add a class to body so CSS can restore overflow
    document.body.classList.add('splash-hidden');

    // fade out the splash
    splash.style.transition = 'opacity 400ms ease';
    splash.style.opacity = '0';

    setTimeout(() => {
        // remove splash from DOM after fade
        if (splash.parentNode) splash.parentNode.removeChild(splash);
        window.location.href = 'html2/login.html';
    }, 450);
}

// Wait for DOM ready then start the timer
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(hideSplashAndNavigate, SPLASH_DURATION));
} else {
    setTimeout(hideSplashAndNavigate, SPLASH_DURATION);
}
