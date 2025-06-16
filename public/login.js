import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBS1mtdu6GkLG4X7yIv8e5BxmR7_rlMNLQ",
    authDomain: "project-kp-web-inventaris.firebaseapp.com",
    projectId: "project-kp-web-inventaris",
    storageBucket: "project-kp-web-inventaris.appspot.com",
    messagingSenderId: "180534737303",
    appId: "1:180534737303:web:4da196e5f791e2e1dcacd2",
    measurementId: "G-MZZ0K2PDCZ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

document.addEventListener('DOMContentLoaded', function() {
    const passwordInput = document.getElementById('password');
    const togglePassword = document.getElementById('togglePassword');

    if (togglePassword) {
        togglePassword.addEventListener('click', function () {
            const icon = this.querySelector('i');
            
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);

            if (type === 'text') {
                icon.classList.remove('bi-eye-slash');
                icon.classList.add('bi-eye');
            } else {
                icon.classList.remove('bi-eye');
                icon.classList.add('bi-eye-slash');
            }
        });
    }

    const loginForm = document.getElementById('loginForm');
    const loginAlert = document.getElementById('login-alert');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;

            const password = passwordInput.value;
            const submitButton = e.target.querySelector('button[type="submit"]');
        
            submitButton.disabled = true;
            submitButton.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Loading...`;
                
            try {
                await signInWithEmailAndPassword(auth, email, password);
            } catch (error) {
                console.error("Login Gagal:", error.code);
                loginAlert.textContent = 'Email atau password salah. Silakan coba lagi.';
                loginAlert.classList.remove('d-none');
                    
                submitButton.disabled = false;
                submitButton.innerHTML = 'Login';
            }
        });
    }
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        window.location.href = 'index.html';
    }
});