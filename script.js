// ====================== GLOBAL CONSTANTS ======================
const DENDA_PER_HARI = 5000;
const ITEMS_PER_PAGE = 10;

// ====================== UTILITY FUNCTIONS ======================
function formatDate(dateString) {
    if (!dateString) return '-';
    const options = { day: '2-digit', month: 'long', year: 'numeric' };
    return new Date(dateString).toLocaleDateString('id-ID', options);
}

function formatRupiah(amount) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(amount || 0);
}

function getFirstDayOfMonth() {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
}

function debounce(func, timeout = 300) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), timeout);
    };
}

function showAlert(type, message) {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) return;
    
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} animate__animated animate__fadeInRight`;
    alert.role = 'alert';
    alert.innerHTML = `
        <i class="fas fa-${type === 'error' ? 'times-circle' : type === 'info' ? 'info-circle' : 'check-circle'} me-2"></i>
        ${message}
    `;
    alertContainer.appendChild(alert);
    setTimeout(() => alert.remove(), 5000);
}

function showLoading(message = 'Memproses...') {
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    if (loadingOverlay && loadingText) {
        loadingText.textContent = message;
        loadingOverlay.style.display = 'flex';
    }
}

function hideLoading() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
}

// ====================== FORM FUNCTIONS ======================
function resetForm() {
    const form = document.getElementById('formPeminjaman');
    if (!form) return;

    form.reset();
    form.classList.remove('was-validated');
    
    const bookId = document.getElementById('bookId');
    const jatuhTempo = document.getElementById('jatuhTempo');
    const charCount = document.getElementById('charCount');
    const tanggalPinjam = document.getElementById('tanggalPinjam');
    
    if (bookId) bookId.value = '';
    if (jatuhTempo) jatuhTempo.value = '';
    if (charCount) charCount.textContent = '0/200';
    
    const today = new Date().toISOString().split('T')[0];
    if (tanggalPinjam) tanggalPinjam.value = today;
}

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

try {
    app = firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    
    db.settings({
        experimentalForceLongPolling: true,
        merge: true
    });
    
    firebase.firestore().enablePersistence()
        .catch(function(err) {
            if (err.code === 'failed-precondition') {
                console.warn("Multi-tab persistence disabled");
            } else if (err.code === 'unimplemented') {
                console.warn("Persistence not supported");
            }
        });
} catch (error) {
    console.error("Firebase initialization error:", error);
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
}

// ====================== APPLICATION STATE ======================
let bukuList = [];
let peminjamanList = [];
let riwayatList = [];
let currentInvoice = null;
let currentPage = 1;

// ====================== DATA OPERATIONS ======================
async function loadPeminjaman() {
    showLoading('Memuat data peminjaman...');
    try {
        const snapshot = await db.collection('peminjaman')
            .where('tanggal_kembali', '==', null)
            .orderBy('tanggal_pinjam', 'desc')
            .get();
        
        peminjamanList = snapshot.docs.map(function(doc) {
            return { id: doc.id, ...doc.data() };
        });
        updateTabelPengembalian();
    } catch (error) {
        console.error("Error loading loans:", error);
        showAlert('error', 'Gagal memuat data peminjaman');
    } finally {
        hideLoading();
    }
}

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
        riwayatList = snapshot.docs.map(function(doc) {
            return { id: doc.id, ...doc.data() };
        });

        const totalData = document.getElementById('totalData');
        if (totalData) totalData.textContent = riwayatList.length;
        
        updateRiwayatTable();
        updatePagination();
    } catch (error) {
        console.error("Error loading history:", error);
        showAlert('error', 'Gagal memuat riwayat');
    } finally {
        hideLoading();
    }
}

function updateTabelPengembalian(filteredLoans) {
    const tbody = document.getElementById('pengembalianBody');
    if (!tbody) return;

    tbody.innerHTML = '';
    const loansToShow = filteredLoans || peminjamanList;

    if (loansToShow.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-4">
                    <i class="fas fa-book-open fa-2x mb-3 text-muted"></i>
                    <p>Tidak ada peminjaman aktif</p>
                </td>
            </tr>
        `;
        return;
    }

    loansToShow.forEach(function(loan, index) {
        const row = document.createElement('tr');
        row.className = 'animate__animated animate__fadeIn';
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${loan.judul_buku || ''}</td>
            <td>${loan.pengarang || ''}</td>
            <td>${loan.nama_peminjam || ''}</td>
            <td>${formatDate(loan.tanggal_pinjam)}</td>
            <td>${formatDate(loan.jatuh_tempo)}</td>
            <td><span class="status-borrowed">${loan.status || ''}</span></td>
            <td>
                <button class="btn btn-primary btn-sm" onclick="showPengembalianModal('${loan.id}')">
                    <i class="fas fa-undo me-1"></i>Proses
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// ====================== EVENT HANDLERS ======================
function setupEventListeners() {
    const formPeminjaman = document.getElementById('formPeminjaman');
    if (formPeminjaman) {
        formPeminjaman.addEventListener('submit', function(e) {
            e.preventDefault();
            simpanPeminjaman();
        });
    }

    const btnReset = document.getElementById('btnReset');
    if (btnReset) {
        btnReset.addEventListener('click', resetForm);
    }

    const tanggalPinjam = document.getElementById('tanggalPinjam');
    if (tanggalPinjam) {
        tanggalPinjam.addEventListener('change', hitungJatuhTempo);
    }

    const lamaPinjam = document.getElementById('lamaPinjam');
    if (lamaPinjam) {
        lamaPinjam.addEventListener('change', hitungJatuhTempo);
    }

    const catatan = document.getElementById('catatan');
    if (catatan) {
        catatan.addEventListener('input', function() {
            const charCount = document.getElementById('charCount');
            if (charCount) {
                charCount.textContent = this.value.length + '/200';
            }
        });
    }
}

// ====================== INITIALIZATION ======================
document.addEventListener('DOMContentLoaded', function() {
    // Add dynamic favicon
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📚</text></svg>';
    document.head.appendChild(link);

    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    
    const tanggalPinjam = document.getElementById('tanggalPinjam');
    if (tanggalPinjam) tanggalPinjam.value = today;
    
    const modalTanggalKembali = document.getElementById('modalTanggalKembali');
    if (modalTanggalKembali) modalTanggalKembali.value = today;
    
    const filterDari = document.getElementById('filterDari');
    if (filterDari) filterDari.value = getFirstDayOfMonth();
    
    const filterSampai = document.getElementById('filterSampai');
    if (filterSampai) filterSampai.value = today;

    setupEventListeners();

    // Load initial data
    Promise.all([loadPeminjaman(), loadRiwayat()])
        .catch(function(error) {
            console.error("Initialization error:", error);
            showAlert('error', 'Gagal memuat data awal');
        });
});

// ====================== GLOBAL EXPORTS ======================
window.selectBookFromTable = function(judul, pengarang, tahun, kategori, isbn) {
    // Implementation here
};

window.showPengembalianModal = function(loanId) {
    // Implementation here
};

window.showBookDetail = function(judul, pengarang, tahun, kategori, isbn, deskripsi) {
    // Implementation here
};

// ====================== GLOBAL EXPORTS ======================
window.selectBookFromTable = selectBookFromTable;
window.showPengembalianModal = showPengembalianModal;
window.showBookDetail = showBookDetail;
window.resetForm = resetForm;