// ====================== GLOBAL CONSTANTS ======================
const DENDA_PER_HARI = 5000;
const ITEMS_PER_PAGE = 10;
const MAX_BORROW_WEEKS = 4;
const MAX_NOTES_LENGTH = 200;

// ====================== UTILITY FUNCTIONS ======================
/**
 * Format date to Indonesian locale
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date
 */
function formatDate(dateString) {
    if (!dateString) return '-';
    try {
        const options = { day: '2-digit', month: 'long', year: 'numeric' };
        return new Date(dateString).toLocaleDateString('id-ID', options);
    } catch (error) {
        console.error("Error formatting date:", error);
        return dateString;
    }
}

/**
 * Format number to Rupiah currency
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency
 */
function formatRupiah(amount) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(amount || 0);
}

/**
 * Get first day of current month
 * @returns {string} ISO date string
 */
function getFirstDayOfMonth() {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
}

/**
 * Debounce function to limit rapid calls
 * @param {Function} func - Function to debounce
 * @param {number} timeout - Debounce timeout in ms
 * @returns {Function} Debounced function
 */
function debounce(func, timeout = 300) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), timeout);
    };
}

/**
 * Show alert message
 * @param {string} type - Alert type (success, error, info, warning)
 * @param {string} message - Alert message
 */
function showAlert(type, message) {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) return;
    
    const icons = {
        success: 'check-circle',
        error: 'times-circle',
        info: 'info-circle',
        warning: 'exclamation-circle'
    };
    
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.role = 'alert';
    alert.innerHTML = `
        <i class="fas fa-${icons[type] || 'info-circle'} me-2"></i>
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    // Remove existing alerts before showing new one
    while (alertContainer.firstChild) {
        alertContainer.removeChild(alertContainer.firstChild);
    }
    
    alertContainer.appendChild(alert);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        alert.classList.remove('show');
        setTimeout(() => alert.remove(), 150);
    }, 5000);
}

/**
 * Show loading overlay
 * @param {string} message - Loading message
 */
function showLoading(message = 'Memproses...') {
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    if (loadingOverlay && loadingText) {
        loadingText.textContent = message;
        loadingOverlay.style.display = 'flex';
    }
}

/**
 * Hide loading overlay
 */
function hideLoading() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
}

/**
 * Validate phone number format
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid
 */
function validatePhoneNumber(phone) {
    return /^08[0-9]{8,11}$/.test(phone);
}

/**
 * Validate name format
 * @param {string} name - Name to validate
 * @returns {boolean} True if valid
 */
function validateName(name) {
    return /^[A-Za-z\s]{3,50}$/.test(name);
}

// ====================== FORM FUNCTIONS ======================
/**
 * Reset form to initial state
 */
function resetForm() {
    const form = document.getElementById('formPeminjaman');
    if (!form) return;

    form.reset();
    form.classList.remove('was-validated');
    
    // Reset specific fields
    const elements = {
        bookId: '',
        jatuhTempo: '',
        charCount: '0/200',
        tanggalPinjam: new Date().toISOString().split('T')[0]
    };
    
    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            if (id === 'charCount') {
                element.textContent = value;
            } else {
                element.value = value;
            }
        }
    });
}

/**
 * Calculate due date based on borrow date and duration
 * @returns {string|null} ISO date string or null
 */
function hitungJatuhTempo() {
    try {
        const tanggalPinjam = document.getElementById('tanggalPinjam');
        const lamaPinjam = document.getElementById('lamaPinjam');
        const jatuhTempo = document.getElementById('jatuhTempo');
        
        if (!tanggalPinjam || !lamaPinjam || !jatuhTempo) return null;
        
        const tglPinjam = tanggalPinjam.value;
        const lama = parseInt(lamaPinjam.value);
        
        if (tglPinjam && lama) {
            const tglPinjamObj = new Date(tglPinjam);
            const tglTempo = new Date(tglPinjamObj);
            tglTempo.setDate(tglPinjamObj.getDate() + (lama * 7));
            
            jatuhTempo.value = formatDate(tglTempo.toISOString().split('T')[0]);
            return tglTempo.toISOString().split('T')[0];
        }
        return null;
    } catch (error) {
        console.error("Error calculating due date:", error);
        showAlert('error', 'Gagal menghitung jatuh tempo');
        return null;
    }
}

// ====================== FIREBASE INITIALIZATION ======================
const firebaseConfig = {
    apiKey: "AIzaSyCCi8CdLNb1O6uEZBpVoeH_3mJhXElBGTU",
    authDomain: "meminjam-buku.firebaseapp.com",
    projectId: "meminjam-buku",
    storageBucket: "meminjam-buku.appspot.com",
    messagingSenderId: "517105835463",
    appId: "1:517105835463:web:90dcc1dfa5d2ffc6e38de2",
    measurementId: "G-KK3XQDMD9G"
};

let app, db;

function initializeFirebase() {
    try {
        // Initialize Firebase if not already initialized
        if (!firebase.apps.length) {
            app = firebase.initializeApp(firebaseConfig);
            db = firebase.firestore();
            
            // Configure Firestore settings
            db.settings({
                experimentalForceLongPolling: true,
                merge: true
            });
            
            // Enable offline persistence
            firebase.firestore().enablePersistence()
                .catch(function(err) {
                    if (err.code === 'failed-precondition') {
                        console.warn("Multi-tab persistence disabled");
                    } else if (err.code === 'unimplemented') {
                        console.warn("Persistence not supported");
                    }
                });
        } else {
            app = firebase.app();
            db = firebase.firestore();
        }
        
        return true;
    } catch (error) {
        console.error("Firebase initialization error:", error);
        
        // Fallback to mock database when offline
        db = {
            collection: function() {
                return {
                    where: function() {
                        return {
                            orderBy: function() {
                                return {
                                    get: function() {
                                        return Promise.resolve({ docs: [] });
                                    }
                                };
                            }
                        };
                    },
                    doc: function() {
                        return {
                            update: function() {
                                return Promise.resolve();
                            },
                            get: function() {
                                return Promise.resolve({ exists: false });
                            }
                        };
                    },
                    add: function() {
                        return Promise.resolve({ id: 'offline-' + Date.now() });
                    }
                };
            }
        };
        
        showAlert('warning', 'Running in limited offline mode');
        return false;
    }
}

// ====================== APPLICATION STATE ======================
let bukuList = [];
let peminjamanList = [];
let riwayatList = [];
let currentInvoice = null;
let currentPage = 1;

// ====================== DATA OPERATIONS ======================
/**
 * Load active loans from Firestore
 */
async function loadPeminjaman() {
    showLoading('Memuat data peminjaman...');
    try {
        const snapshot = await db.collection('peminjaman')
            .where('tanggal_kembali', '==', null)
            .orderBy('tanggal_pinjam', 'desc')
            .get();
        
        peminjamanList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            status: getLoanStatus(doc.data().jatuh_tempo)
        }));
        
        updateTabelPengembalian();
    } catch (error) {
        console.error("Error loading loans:", error);
        showAlert('error', 'Gagal memuat data peminjaman');
    } finally {
        hideLoading();
    }
}

/**
 * Load history data from Firestore
 */
async function loadRiwayat() {
    showLoading('Memuat riwayat...');
    try {
        let query = db.collection('peminjaman').orderBy('tanggal_pinjam', 'desc');

        const dari = document.getElementById('filterDari');
        const sampai = document.getElementById('filterSampai');
        
        if (dari && sampai && dari.value && sampai.value) {
            query = query.where('tanggal_pinjam', '>=', dari.value)
                        .where('tanggal_pinjam', '<=', sampai.value);
        }

        const snapshot = await query.get();
        riwayatList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            status: getLoanStatus(doc.data().jatuh_tempo, doc.data().tanggal_kembali)
        }));

        updateRiwayatTable();
        updatePagination();
        
        const totalData = document.getElementById('totalData');
        if (totalData) totalData.textContent = riwayatList.length;
    } catch (error) {
        console.error("Error loading history:", error);
        showAlert('error', 'Gagal memuat riwayat');
    } finally {
        hideLoading();
    }
}

/**
 * Determine loan status based on dates
 * @param {string} dueDate - Jatuh tempo date
 * @param {string|null} returnDate - Tanggal kembali (null if not returned)
 * @returns {string} Status text
 */
function getLoanStatus(dueDate, returnDate = null) {
    if (!returnDate) {
        return isDatePastDue(dueDate) ? 'Terlambat' : 'Aktif';
    }
    return isDatePastDue(dueDate, returnDate) ? 'Dikembalikan (Terlambat)' : 'Dikembalikan';
}

/**
 * Check if date is past due
 * @param {string} dueDate - Due date to check
 * @param {string} [compareDate] - Date to compare against (defaults to today)
 * @returns {boolean} True if past due
 */
function isDatePastDue(dueDate, compareDate = new Date().toISOString().split('T')[0]) {
    if (!dueDate) return false;
    return new Date(compareDate) > new Date(dueDate);
}

/**
 * Update loans table with current data
 * @param {Array} [filteredLoans] - Optional filtered loans to display
 */
function updateTabelPengembalian(filteredLoans) {
    const tbody = document.getElementById('pengembalianBody');
    if (!tbody) return;

    tbody.innerHTML = '';
    const loansToShow = filteredLoans || peminjamanList;

    if (loansToShow.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-4 text-muted">
                    <i class="fas fa-book-open fa-2x mb-3"></i>
                    <p class="mb-0">Tidak ada peminjaman aktif</p>
                </td>
            </tr>
        `;
        return;
    }

    loansToShow.forEach((loan, index) => {
        const row = document.createElement('tr');
        row.className = 'animate__animated animate__fadeIn';
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${loan.judul_buku || '-'}</td>
            <td>${loan.pengarang || '-'}</td>
            <td>${loan.nama_peminjam || '-'}</td>
            <td>${formatDate(loan.tanggal_pinjam)}</td>
            <td>${formatDate(loan.jatuh_tempo)}</td>
            <td>
                <span class="badge ${loan.status === 'Aktif' ? 'bg-success' : 'bg-warning text-dark'}">
                    ${loan.status}
                </span>
            </td>
            <td>
                <button class="btn btn-primary btn-sm btn-kembalikan" data-loan-id="${loan.id}">
                    <i class="fas fa-undo me-1"></i>Proses
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// ====================== EVENT HANDLERS ======================
/**
 * Set up all event listeners
 */
function setupEventListeners() {
    // Form submission
    const formPeminjaman = document.getElementById('formPeminjaman');
    if (formPeminjaman) {
        formPeminjaman.addEventListener('submit', handleFormSubmit);
    }

    // Reset button
    const btnReset = document.getElementById('btnReset');
    if (btnReset) {
        btnReset.addEventListener('click', resetForm);
    }

    // Date calculations
    const dateInputs = ['tanggalPinjam', 'lamaPinjam'];
    dateInputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', hitungJatuhTempo);
        }
    });

    // Notes character counter
    const catatan = document.getElementById('catatan');
    if (catatan) {
        catatan.addEventListener('input', updateCharacterCount);
    }

    // Search functionality
    const searchInputs = ['searchPeminjaman', 'searchRiwayat'];
    searchInputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', debounce(handleSearch));
        }
    });

    // Filter button
    const btnFilter = document.getElementById('btnFilter');
    if (btnFilter) {
        btnFilter.addEventListener('click', loadRiwayat);
    }

    // Delegated event for return buttons
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('btn-kembalikan') || 
            e.target.closest('.btn-kembalikan')) {
            const button = e.target.classList.contains('btn-kembalikan') ? 
                e.target : e.target.closest('.btn-kembalikan');
            const loanId = button.dataset.loanId;
            if (loanId) showPengembalianModal(loanId);
        }
    });
}

/**
 * Handle form submission
 * @param {Event} e - Form submit event
 */
function handleFormSubmit(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const form = e.target;
    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        return;
    }
    
    simpanPeminjaman();
}

/**
 * Update character count for notes field
 */
function updateCharacterCount() {
    const catatan = document.getElementById('catatan');
    const charCount = document.getElementById('charCount');
    
    if (catatan && charCount) {
        const remaining = MAX_NOTES_LENGTH - catatan.value.length;
        charCount.textContent = `${catatan.value.length}/${MAX_NOTES_LENGTH}`;
        
        // Add warning class if approaching limit
        charCount.classList.toggle('text-danger', remaining < 20);
    }
}

/**
 * Handle search input
 */
function handleSearch(e) {
    const searchTerm = e.target.value.toLowerCase();
    const targetId = e.target.id;
    
    if (targetId === 'searchPeminjaman') {
        const filtered = peminjamanList.filter(loan => 
            loan.judul_buku.toLowerCase().includes(searchTerm) ||
            loan.nama_peminjam.toLowerCase().includes(searchTerm) ||
            loan.pengarang.toLowerCase().includes(searchTerm)
        );
        updateTabelPengembalian(filtered);
    } else if (targetId === 'searchRiwayat') {
        currentPage = 1;
        updateRiwayatTable(searchTerm);
    }
}

// ====================== INITIALIZATION ======================
/**
 * Initialize the application
 */
function initializeApp() {
    // Set dynamic favicon
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📚</text></svg>';
    document.head.appendChild(link);

    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    const dateElements = {
        tanggalPinjam: today,
        modalTanggalKembali: today,
        filterDari: getFirstDayOfMonth(),
        filterSampai: today
    };
    
    Object.entries(dateElements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.value = value;
    });

    // Initialize Firebase and setup
    if (initializeFirebase()) {
        setupEventListeners();
        
        // Load initial data
        Promise.all([loadPeminjaman(), loadRiwayat()])
            .catch(error => {
                console.error("Initialization error:", error);
                showAlert('error', 'Gagal memuat data awal');
            });
    }
}

// Start the application when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);

// ====================== GLOBAL EXPORTS ======================
window.selectBookFromTable = function(judul, pengarang, tahun, kategori, isbn) {
    const elements = {
        judulBuku: judul,
        pengarang: pengarang,
        tahunTerbit: tahun,
        kategori: kategori,
        isbn: isbn
    };
    
    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.value = value;
    });
    
    // Scroll to form
    const form = document.getElementById('formPeminjaman');
    if (form) form.scrollIntoView({ behavior: 'smooth' });
};

window.showPengembalianModal = function(loanId) {
    const loan = peminjamanList.find(item => item.id === loanId);
    if (!loan) return;

    const elements = {
        modalJudulBuku: loan.judul_buku,
        modalPengarang: loan.pengarang,
        modalNamaPeminjam: loan.nama_peminjam,
        modalTanggalPinjam: formatDate(loan.tanggal_pinjam),
        modalJatuhTempo: formatDate(loan.jatuh_tempo),
        modalTanggalKembali: new Date().toISOString().split('T')[0]
    };
    
    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.value = value;
    });
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('pengembalianModal'));
    modal.show();
};

window.showBookDetail = function(judul, pengarang, tahun, kategori, isbn, deskripsi) {
    // Implementation for book detail modal
    console.log("Showing details for:", judul);
};

// ====================== GLOBAL EXPORTS ======================
window.selectBookFromTable = selectBookFromTable;
window.showPengembalianModal = showPengembalianModal;
window.showBookDetail = showBookDetail;
window.resetForm = resetForm;
window.hitungJatuhTempo = hitungJatuhTempo;