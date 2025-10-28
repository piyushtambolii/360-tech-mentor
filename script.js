// Main module script for Consulting Landing Page
// Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  addDoc,
  collection,
  setLogLevel,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Enable Firestore debug logging
setLogLevel("Debug");

// Global variables for Firebase access
let db = null;
let auth = null;
let userId = null;
const appId = typeof __app_id !== "undefined" ? __app_id : "default-app-id";

// Safe DOM helpers
const $ = (id) => document.getElementById(id);
const safeSetText = (id, text) => {
  const el = $(id);
  if (el) el.textContent = text;
};
const enableForm = () => {
  const fc = $("form-container");
  if (fc) fc.classList.remove("opacity-50", "pointer-events-none");
};

try {
  const firebaseConfig = JSON.parse(
    typeof __firebase_config !== "undefined" ? __firebase_config : "{}"
  );

  if (Object.keys(firebaseConfig).length > 0) {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);

    // --- Authentication and User ID Setup ---
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        // User signed in
        userId = user.uid;
        console.log("User signed in with UID:", userId);
        // Update UI if present
        safeSetText("user-id-display", userId);
        safeSetText("auth-status", "Ready");
        enableForm();
        return;
      }

      // If no user currently, attempt sign-in (custom token or anonymous)
      try {
        if (
          typeof __initial_auth_token !== "undefined" &&
          __initial_auth_token
        ) {
          // Sign in with provided custom token
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          // Fallback to anonymous sign-in if no token is available
          const anonymousUser = await signInAnonymously(auth);
          userId = anonymousUser.user.uid;
          safeSetText("user-id-display", userId);
        }
      } catch (error) {
        console.error("Firebase Auth error:", error);
        // Fallback to a random UUID if authentication fails completely
        try {
          userId = crypto.randomUUID();
          safeSetText("user-id-display", userId + " (Anon/Error)");
        } catch (e) {
          // crypto may not be available in some environments; leave userId null
          console.warn("Unable to generate fallback UUID:", e);
        }
      }

      safeSetText("auth-status", "Ready");
      enableForm();
    });
  } else {
    console.error("Firebase config is missing or empty.");
    safeSetText("auth-status", "Config Error");
    // Allow the form to be interactive even if Firebase isn't configured
    enableForm();
  }
} catch (e) {
  console.error("Firebase initialization failed:", e);
  safeSetText("auth-status", "Init Failed");
  // Make the form usable so the user can still interact locally
  enableForm();
}

// --- Form Submission Logic ---
window.handleFormSubmit = async function (event) {
  event.preventDefault();

  // 🎯 FIX 1: Define the form element
  const form = event.target;

  const consentCheckbox = document.getElementById("consentCheckbox");
  if (!consentCheckbox.checked) {
    statusMessage.textContent =
      "⚠️ Please agree to the consent before submitting.";
    statusMessage.classList.remove("hidden", "text-green-600");
    statusMessage.classList.add("text-red-600");
    return;
  }

  // Ensure you have elements for these messages in your HTML (e.g., <p id="status-message">)
  const statusMessage = document.getElementById("status-message");
  const submitBtn = document.getElementById("submit-btn");

  if (!form.checkValidity()) {
    // Let the browser handle standard HTML5 validation errors (e.g., required fields)
    statusMessage.textContent = "Please fill in all required fields correctly.";
    statusMessage.classList.remove("hidden", "text-green-600");
    statusMessage.classList.add("text-red-600");
    return;
  }

  // Prepare the payload from ALL form fields using their 'name' attributes
  const payload = {
    fullName: form.fullName.value,
    email: form.email.value,
    mobile: form.mobile.value,
    alternateMobile: form.alternateMobile ? form.alternateMobile.value : "",
    age: parseInt(form.age.value),
    qualification: form.qualification.value,
    Address: form.Address.value,
    currentStatus: form.currentStatus.value,
    careerGoals: form.careerGoals.value,
    challenges: form.challenges.value,
    motivation: form.motivation.value,
    expectedPackage: form.expectedPackage.value,
    consultationType: form.consultationType.value,
    specificrequirement: form.specificrequirement.value,

    // Add metadata
    submissionDate: new Date().toISOString(),
    submittedBy: userId || "anonymous",
  };

  // --- CORE FIX: Convert JSON object to URLSearchParams for Apps Script ---
  const urlParams = new URLSearchParams();
  for (const key in payload) {
    urlParams.append(key, payload[key]);
  }

  const SHEET_URL =
    "https://script.google.com/macros/s/AKfycbydS70WOjFhI9qb-q-65lyfMqsyo4niYq2GTkpcDQxafgWpZC8IYuuHiBtWUgvl-Ww5/exec";

  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";

  try {
    const sheetResp = await fetch(SHEET_URL, {
      method: "POST",
      // Correct Content-Type for Apps Script's e.parameter to work
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: urlParams.toString(),
    });

    // 💡 IMPORTANT: Check the Google Apps Script logs for errors (View -> Logs)

    let sheetResult = null;
    try {
      sheetResult = await sheetResp.json();
    } catch (e) {
      sheetResult = { status: sheetResp.status, text: sheetResp.statusText };
    }

    if (!sheetResp.ok || sheetResult.result === "error") {
      console.error("Sheet response not OK or returned error:", sheetResult);
      throw new Error(sheetResult.error || "Google Sheets submission failed");
    }

    // Optionally also store in Firestore if configured
    if (db) {
      try {
        const collectionRef = collection(
          db,
          "artifacts",
          appId,
          "users",
          userId || "anonymous",
          "survey_submissions"
        );
        const docRef = await addDoc(collectionRef, payload);
        console.log("Saved to Firestore with id:", docRef.id);
      } catch (fsErr) {
        console.warn("Firestore save failed (non-blocking):", fsErr);
      }
    }

    // 🎯 NEW Success UI Block: Show the Modal
    const successModal = document.getElementById("success-modal");

    if (successModal) {
      // Hide the status message element since we're using the modal
      statusMessage.classList.add("hidden");

      // Show the modal
      successModal.classList.remove("hidden");
      successModal.classList.add("flex"); // Use flex to center the content
    } else {
      // Fallback for success in case modal is missing
      statusMessage.textContent = "Success! Your form has been submitted.";
      statusMessage.classList.remove("hidden", "text-red-600");
      statusMessage.classList.add("text-green-600");
    }

    form.reset(); // Clear form on success
  } catch (e) {
    console.error("Submission error:", e);
    statusMessage.textContent =
      "Submission failed. Please try again. (Check browser console for details)";
    statusMessage.classList.remove("hidden", "text-green-600");
    statusMessage.classList.add("text-red-600");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit & Unlock My Future";
  }
};

// --- Modal Close Logic ---
document.addEventListener("DOMContentLoaded", () => {
  // ... (rest of your DOMContentLoaded logic) ...

  // Add close listener for the new modal
  const modal = document.getElementById("success-modal");
  const closeBtn = document.getElementById("close-modal-btn");

  if (closeBtn && modal) {
    closeBtn.addEventListener("click", () => {
      modal.classList.add("hidden");
      modal.classList.remove("flex"); // Remove flex class to hide it properly
    });
  }
});

// --- Terms and Conditions Modal Logic ---
// --- Terms and Conditions Modal Logic (REVISED) ---
document.addEventListener('DOMContentLoaded', () => {
    // Get all necessary elements
    const tncModal = document.getElementById('tnc-modal');
    
    // 🎯 CRITICAL CHANGE: Use querySelectorAll to find ALL links with the CLASS
    const tncLinks = document.querySelectorAll('.tnc-link-trigger'); 

    const tncCloseTop = document.getElementById('tnc-close-btn-top');
    const tncCloseBottom = document.getElementById('tnc-close-btn-bottom');

    // Function to open the modal
    function openTNCModal(e) {
        e.preventDefault(); // Stop the link from navigating
        if (tncModal) {
            tncModal.classList.remove('hidden');
            tncModal.classList.add('flex');
        }
    }

    // Function to close the modal
    function closeTNCModal() {
        if (tncModal) {
            tncModal.classList.add('hidden');
            tncModal.classList.remove('flex');
        }
    }

    // 1. Open the modal when ANY link with the class is clicked
    if (tncLinks.length > 0) {
        tncLinks.forEach(link => {
            link.addEventListener('click', openTNCModal);
        });
    }

    // 2. Close the modal when the close buttons are clicked
    if (tncCloseTop) {
        tncCloseTop.addEventListener('click', closeTNCModal);
    }
    if (tncCloseBottom) {
        tncCloseBottom.addEventListener('click', closeTNCModal);
    }

    // 3. Close the modal when the ESC key is pressed
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && tncModal && !tncModal.classList.contains('hidden')) {
            closeTNCModal();
        }
    });

    // 4. Close the modal when clicking outside of the content (on the overlay)
    if (tncModal) {
        tncModal.addEventListener('click', (e) => {
            // Check if the click target is the modal container itself (not the content inside)
            if (e.target === tncModal) {
                closeTNCModal();
            }
        });
    }
});

// Handle service card clicks to auto-fill form
function setupServiceCardListeners() {
  const cards = document.querySelectorAll(".card-shadow");
  cards.forEach((card) => {
    card.addEventListener("click", () => {
      const title = card.querySelector("h3").textContent.toLowerCase();
      const select = document.getElementById("consultationType");
      if (select) {
        let value = "";
        if (title.includes("webinar")) value = "webinar (₹199)";
        else if (title.includes("on call")) value = "On Call Discussion (₹499)";
        else if (title.includes("personal")) value = "personal";

        select.value = value;
        // Smooth scroll to form
        document
          .getElementById("consultation-form")
          .scrollIntoView({ behavior: "smooth" });
      }
    });
  });
}

// Initialize Lucide icons and setup listeners when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  try {
    if (window.lucide && typeof lucide.createIcons === "function") {
      lucide.createIcons();
    }
    setupServiceCardListeners();

    // Show/hide specificrequirement field based on consultationType
    const consultationType = document.getElementById("consultationType");
    const specificContainer = document.getElementById(
      "specificrequirement-container"
    );
    const specificInput = document.getElementById("specificrequirement");
    if (consultationType && specificContainer && specificInput) {
      function updateSpecificRequirementVisibility() {
        if (consultationType.value === "personal") {
          specificContainer.classList.remove("hidden-field");
          specificInput.required = true;
        } else {
          specificContainer.classList.add("hidden-field");
          specificInput.required = false;
        }
      }
      consultationType.addEventListener(
        "change",
        updateSpecificRequirementVisibility
      );
      updateSpecificRequirementVisibility();
    }
  } catch (e) {
    console.warn("initialization error", e);
  }
});
