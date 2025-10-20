function goBack() {
    window.history.back();
}

// Simple rating and submit handlers for report page
document.addEventListener('DOMContentLoaded', function () {
    // star rating
    const stars = document.querySelectorAll('.rating .star');
    let currentRating = 0;
    stars.forEach((s) => {
        s.addEventListener('click', function () {
            currentRating = parseInt(this.dataset.value || '0', 10);
            stars.forEach((st) => st.classList.toggle('filled', parseInt(st.dataset.value, 10) <= currentRating));
        });
    });

    // submit actions (placeholder behavior)
    const submitIssue = document.getElementById('submitIssue');
    const submitFeedback = document.getElementById('submitFeedback');
    if (submitIssue) submitIssue.addEventListener('click', function () {
        const txt = document.getElementById('issueTextarea')?.value || '';
        alert('Issue submitted. Thank you!\n\n' + (txt ? txt.substring(0, 200) : ''));
    });
    if (submitFeedback) submitFeedback.addEventListener('click', function () {
        const txt = document.getElementById('feedbackTextarea')?.value || '';
        alert('Feedback sent. Thank you!\nRating: ' + (currentRating || 'n/a') + '\n\n' + (txt ? txt.substring(0, 200) : ''));
    });
});