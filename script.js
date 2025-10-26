// Main module script for Consulting Landing Page
// Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, addDoc, collection, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Enable Firestore debug logging
setLogLevel('Debug');

// Global variables for Firebase access
let db = null;
let auth = null;
let userId = null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Safe DOM helpers
const $ = id => document.getElementById(id);
const safeSetText = (id, text) => { const el = $(id); if (el) el.textContent = text; };
const enableForm = () => { const fc = $('form-container'); if (fc) fc.classList.remove('opacity-50', 'pointer-events-none'); };

try {
    const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');

    if (Object.keys(firebaseConfig).length > 0) {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // --- Authentication and User ID Setup ---
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                // User signed in
                userId = user.uid;
                console.log('User signed in with UID:', userId);
                // Update UI if present
                safeSetText('user-id-display', userId);
                safeSetText('auth-status', 'Ready');
                enableForm();
                return;
            }

            // If no user currently, attempt sign-in (custom token or anonymous)
            try {
                if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                    // Sign in with provided custom token
                    await signInWithCustomToken(auth, __initial_auth_token);
                } else {
                    // Fallback to anonymous sign-in if no token is available
                    const anonymousUser = await signInAnonymously(auth);
                    userId = anonymousUser.user.uid;
                    safeSetText('user-id-display', userId);
                }
            } catch (error) {
                console.error("Firebase Auth error:", error);
                // Fallback to a random UUID if authentication fails completely
                try {
                    userId = crypto.randomUUID();
                    safeSetText('user-id-display', userId + " (Anon/Error)");
                } catch (e) {
                    // crypto may not be available in some environments; leave userId null
                    console.warn('Unable to generate fallback UUID:', e);
                }
            }

            safeSetText('auth-status', 'Ready');
            enableForm();
        });

    } else {
        console.error("Firebase config is missing or empty.");
        safeSetText('auth-status', 'Config Error');
        // Allow the form to be interactive even if Firebase isn't configured
        enableForm();
    }
} catch (e) {
    console.error("Firebase initialization failed:", e);
    safeSetText('auth-status', 'Init Failed');
    // Make the form usable so the user can still interact locally
    enableForm();
}

// --- Form Submission Logic ---
window.handleFormSubmit = async function(event) {
    event.preventDefault();

    // 🎯 FIX 1: Define the form element
    const form = event.target; 
    
    // Ensure you have elements for these messages in your HTML (e.g., <p id="status-message">)
    const statusMessage = document.getElementById('status-message');
    const submitBtn = document.getElementById('submit-btn');

    if (!form.checkValidity()) {
        // Let the browser handle standard HTML5 validation errors (e.g., required fields)
        statusMessage.textContent = 'Please fill in all required fields correctly.';
        statusMessage.classList.remove('hidden', 'text-green-600');
        statusMessage.classList.add('text-red-600');
        return;
    }
    
    if (!db || !userId) {
        statusMessage.textContent = 'Database not ready. Please wait a moment.';
        statusMessage.classList.remove('hidden', 'text-green-600', 'text-red-600');
        statusMessage.classList.add('text-yellow-600');
        // Continue submission if it's ONLY for the sheet, but warn the user.
        console.warn('Firebase DB or User ID not ready, proceeding to Sheet submission only.');
    }

    // Prepare the payload from ALL form fields using their 'name' attributes
    const payload = {
        fullName: form.fullName.value,
        email: form.email.value,
        mobile: form.mobile.value,
        age: parseInt(form.age.value),
        qualification: form.qualification.value,
        currentStatus: form.currentStatus.value,
        careerGoals: form.careerGoals.value,
        challenges: form.challenges.value,
        motivation: form.motivation.value,
        expectedPackage: form.expectedPackage.value,
        consultationType: form.consultationType.value,
        specificrequirement: form.specificrequirement.value,
        
        // Add metadata
        submissionDate: new Date().toISOString(),
        submittedBy: userId || 'anonymous',
    };

    // --- CORE FIX: Convert JSON object to URLSearchParams for Apps Script ---
    const urlParams = new URLSearchParams();
    for (const key in payload) {
        urlParams.append(key, payload[key]);
    }

    const SHEET_URL = 'https://script.google.com/macros/s/AKfycbydS70WOjFhI9qb-q-65lyfMqsyo4niYq2GTkpcDQxafgWpZC8IYuuHiBtWUgvl-Ww5/exec';

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
        const sheetResp = await fetch(SHEET_URL, {
            method: 'POST',
            // Correct Content-Type for Apps Script's e.parameter to work
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, 
            body: urlParams.toString(),
        });

        // 💡 IMPORTANT: Check the Google Apps Script logs for errors (View -> Logs)

        let sheetResult = null;
        try { sheetResult = await sheetResp.json(); } catch (e) { sheetResult = { status: sheetResp.status, text: sheetResp.statusText }; }

        if (!sheetResp.ok || sheetResult.result === 'error') {
            console.error('Sheet response not OK or returned error:', sheetResult);
            throw new Error(sheetResult.error || 'Google Sheets submission failed');
        }

        // Optionally also store in Firestore if configured
        if (db) {
            try {
                const collectionRef = collection(db, 'artifacts', appId, 'users', userId || 'anonymous', 'survey_submissions');
                const docRef = await addDoc(collectionRef, payload);
                console.log('Saved to Firestore with id:', docRef.id);
            } catch (fsErr) {
                console.warn('Firestore save failed (non-blocking):', fsErr);
            }
        }

        // Success UI
        statusMessage.textContent = 'Success! Your form has been submitted.';
        statusMessage.classList.remove('hidden', 'text-red-600');
        statusMessage.classList.add('text-green-600');
        form.reset(); 

    } catch (e) {
        console.error("Submission error:", e);
        statusMessage.textContent = "Submission failed. Please try again. (Check browser console for details)";
        statusMessage.classList.remove('hidden', 'text-green-600');
        statusMessage.classList.add('text-red-600');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit & Unlock My Future';
    }
}

// Handle service card clicks to auto-fill form
function setupServiceCardListeners() {
    const cards = document.querySelectorAll('.card-shadow');
    cards.forEach(card => {
        card.addEventListener('click', () => {
            const title = card.querySelector('h3').textContent.toLowerCase();
            const select = document.getElementById('consultationType');
            if (select) {
                let value = '';
                if (title.includes('webinar')) value = 'webinar';
                else if (title.includes('on call')) value = 'oncall';
                else if (title.includes('personal')) value = 'personal';
                
                select.value = value;
                // Smooth scroll to form
                document.getElementById('consultation-form').scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
}

// Initialize Lucide icons and setup listeners when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    try {
        if (window.lucide && typeof lucide.createIcons === 'function') {
            lucide.createIcons();
        }
        setupServiceCardListeners();
    } catch (e) {
        console.warn('initialization error', e);
    }
});
