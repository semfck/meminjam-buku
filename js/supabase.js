// ====================== GLOBAL CONSTANTS ======================
const DENDA_PER_HARI = 5000; // Rp 5,000 per day late
const ITEMS_PER_PAGE = 10;
const API_BASE_URL = '/api'; // Relative path to your backend

// ====================== GLOBAL VARIABLES ======================
let bukuList = [];
let peminjamanList = [];
let riwayatList = [];
let currentInvoice = null;
let currentPage = 1;
let reportChart = null;
let authToken = null; // Will be set after login

// Initialize Bootstrap components
let pengembalianModal, confirmModal, invoiceModal;

// ====================== AUTHENTICATION ======================
async function login(username, password) {
  showLoading('Authenticating...');
  
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });
    
    if (!response.ok) {
      throw new Error('Login failed');
    }
    
    const { token } = await response.json();
    authToken = token;
    localStorage.setItem('authToken', token);
    
    // Load initial data after successful login
    await Promise.all([loadBuku(), loadPeminjaman(), loadRiwayat()]);
    
    showAlert('success', 'Login successful');
    return true;
  } catch (error) {
    console.error("Login error:", error);
    showAlert('error', 'Login failed: ' + error.message);
    return false;
  } finally {
    hideLoading();
  }
}

function checkAuth() {
  const token = localStorage.getItem('authToken');
  if (!token) {
    window.location.href = '/login.html';
    return false;
  }
  authToken = token;
  return true;
}

// ====================== SECURE API CALLS ======================
async function fetchSecured(url, options = {}) {
  if (!authToken && !checkAuth()) {
    throw new Error('Not authenticated');
  }
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`,
    ...options.headers
  };
  
  try {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      ...options,
      headers
    });
    
    if (response.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('authToken');
      window.location.href = '/login.html';
      return;
    }
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Request failed');
    }
    
    return await response.json();
  } catch (error) {
    console.error("API call failed:", error);
    throw error;
  }
}

// ====================== UPDATED DATA FUNCTIONS ======================
async function loadBuku() {
  showLoading('Memuat data buku...');
  
  try {
    const data = await fetchSecured('/books');
    bukuList = data || [];
    updateTabelBuku();
  } catch (error) {
    console.error("Error loading buku:", error);
    showAlert('error', 'Gagal memuat data buku: ' + error.message);
  } finally {
    hideLoading();
  }
}

async function loadPeminjaman() {
  showLoading('Memuat data peminjaman...');
  try {
    const data = await fetchSecured('/loans?status=active');
    peminjamanList = data || [];
    updateTabelPengembalian();
  } catch (error) {
    console.error("Error loading loans:", error);
    showAlert('error', 'Gagal memuat data peminjaman: ' + error.message);
  } finally {
    hideLoading();
  }
}

async function simpanPeminjaman() {
  const form = document.getElementById('formPeminjaman');
  if (!form.checkValidity()) {
    form.classList.add('was-validated');
    const invalidElements = form.querySelectorAll(':invalid');
    if (invalidElements.length > 0) {
      invalidElements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }

  const bookId = document.getElementById('bookId').value;
  if (!bookId) {
    showAlert('error', 'Harap pilih buku terlebih dahulu');
    return;
  }

  const book = bukuList.find(b => b.id === bookId);
  if (!book) {
    showAlert('error', 'Buku tidak ditemukan');
    return;
  }

  const loanData = {
    kode_buku: book.kode,
    judul_buku: book.judul,
    pengarang: book.pengarang,
    nama_peminjam: document.getElementById('namaPeminjam').value.trim(),
    no_hp: document.getElementById('noHp').value.trim(),
    tanggal_pinjam: document.getElementById('tanggalPinjam').value,
    jatuh_tempo: hitungJatuhTempo(),
    lama_pinjam: document.getElementById('lamaPinjam').value,
    status: 'Dipinjam',
    catatan: document.getElementById('catatan').value.trim()
  };

  showLoading('Menyimpan peminjaman...');
  try {
    const data = await fetchSecured('/loans', {
      method: 'POST',
      body: JSON.stringify(loanData)
    });

    showAlert('success', 'Peminjaman berhasil disimpan!');
    
    if (data) {
      setTimeout(() => {
        showInvoice(data);
      }, 500);
    }
    
    resetForm();
    await loadPeminjaman();
    await loadBuku();
  } catch (error) {
    console.error("Error saving loan:", error);
    showAlert('error', 'Gagal menyimpan peminjaman: ' + error.message);
  } finally {
    hideLoading();
  }
}

// ====================== INITIALIZATION ======================
document.addEventListener('DOMContentLoaded', async function() {
  // Initialize modals
  pengembalianModal = new bootstrap.Modal(document.getElementById('pengembalianModal'));
  confirmModal = new bootstrap.Modal(document.getElementById('confirmModal'));
  invoiceModal = new bootstrap.Modal(document.getElementById('invoiceModal'));
  
  // Check authentication
  if (!checkAuth()) return;
  
  // Set today as default date
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('tanggalPinjam').value = today;
  document.getElementById('modalTanggalKembali').value = today;
  
  // Set first day of month as default filter
  document.getElementById('filterDari').value = getFirstDayOfMonth();
  document.getElementById('filterSampai').value = today;
  
  // Load initial data
  await Promise.all([loadBuku(), loadPeminjaman(), loadRiwayat()]);
  
  // Setup event listeners
  setupEventListeners();
});