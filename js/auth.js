import { supabase } from './supabase.js';

class AuthSystem {
    constructor() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleLogin();
        });

        document.getElementById('forgotPassword').addEventListener('click', async (e) => {
            e.preventDefault();
            await this.handleForgotPassword();
        });
    }

    async handleLogin() {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        this.showLoading('Sedang masuk...');
        
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            // Simpan session dan redirect
            localStorage.setItem('sb-auth-token', JSON.stringify(data.session));
            window.location.href = 'index.html';
        } catch (error) {
            this.showAlert('error', error.message);
        } finally {
            this.hideLoading();
        }
    }

    async handleForgotPassword() {
        const email = prompt('Masukkan email Anda untuk reset password:');
        if (!email) return;

        this.showLoading('Mengirim email reset password...');
        
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email);
            
            if (error) throw error;
            
            this.showAlert('success', `Email reset password telah dikirim ke ${email}`);
        } catch (error) {
            this.showAlert('error', error.message);
        } finally {
            this.hideLoading();
        }
    }

    // Helper methods sama dengan sebelumnya
}

// Inisialisasi
document.addEventListener('DOMContentLoaded', () => {
    new AuthSystem();
});