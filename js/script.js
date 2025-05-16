// script.js
// ====================== GLOBAL CONSTANTS ======================
const DENDA_PER_HARI = 5000; // Rp 5,000 per day late
const ITEMS_PER_PAGE = 10;
const SUPABASE_URL = 'https://xqnlchcbxekwulncjvfy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxbmxjaGNieGVrd3VsbmNqdmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDcyNzcxNzksImV4cCI6MjA2Mjg1MzE3OX0.j8nyrPIp64bJL_WziUE8ceSvwrSU0C8VHTd4-qGl8D4';

// ====================== GLOBAL VARIABLES ======================
let bukuList = [];
let peminjamanList = [];
let riwayatList = [];
let currentInvoice = null;
let currentPage = 1;
let reportChart = null;

// Initialize Supabase client
const _supabase = window.supabase;
const supabase = _supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Initialize Bootstrap components
let pengembalianModal, confirmModal, invoiceModal;

// ====================== INITIALIZATION ======================
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Initialize modals after DOM is loaded
        pengembalianModal = new bootstrap.Modal(document.getElementById('pengembalianModal'));
        confirmModal = new bootstrap.Modal(document.getElementById('confirmModal'));
        invoiceModal = new bootstrap.Modal(document.getElementById('invoiceModal'));

        // Set default dates
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('tanggalPinjam').value = today;
        document.getElementById('modalTanggalKembali').value = today;
        document.getElementById('filterDari').value = getFirstDayOfMonth();
        document.getElementById('filterSampai').value = today;
        
        // Event listeners for due date calculation
        document.getElementById('lamaPinjam').addEventListener('change', hitungJatuhTempo);
        document.getElementById('tanggalPinjam').addEventListener('change', hitungJatuhTempo);
        
        // Character counter for notes
        document.getElementById('catatan').addEventListener('input', function() {
            document.getElementById('charCount').textContent = this.value.length;
        });
        
        // Setup other event listeners
        setupEventListeners();
        
        // Load initial data
        await Promise.all([
            loadBuku(),
            loadPeminjaman(),
            loadRiwayat()
        ]);
        
        // Show welcome message
        showAlert('info', 'Selamat datang di Sistem Peminjaman Buku Perpustakaan');
    } catch (error) {
        console.error("Initialization error:", error);
        showAlert('error', 'Gagal memuat aplikasi: ' + error.message);
    }
});

// ====================== MAIN FUNCTIONS ======================
function setupEventListeners() {
    // Form submission
    document.getElementById('formPeminjaman').addEventListener('submit', function(e) {
        e.preventDefault();
        simpanPeminjaman();
    });
    
    // Reset form
    document.getElementById('btnReset').addEventListener('click', resetForm);

    // Book search
    document.getElementById('judulBuku').addEventListener('input', debounce(searchBukuSuggestions, 300));
    document.getElementById('searchBuku').addEventListener('input', debounce(searchBuku, 300));

    // Return functions
    document.getElementById('searchPeminjaman').addEventListener('input', debounce(searchPeminjaman, 300));
    document.getElementById('modalTanggalKembali').addEventListener('change', previewDenda);
    document.getElementById('btnProsesPengembalian').addEventListener('click', prosesPengembalian);
    document.getElementById('btnConfirmPayment').addEventListener('click', confirmPayment);

    // History functions
    document.getElementById('searchRiwayat').addEventListener('input', debounce(searchRiwayat, 300));
    document.getElementById('btnFilter').addEventListener('click', () => loadRiwayat());
    document.getElementById('btnPrev').addEventListener('click', prevPage);
    document.getElementById('btnNext').addEventListener('click', nextPage);
    
    // Date validation
    document.getElementById('tanggalPinjam').addEventListener('change', function() {
        const today = new Date().toISOString().split('T')[0];
        if (this.value < today) {
            this.setCustomValidity('Tanggal pinjam tidak boleh sebelum hari ini');
        } else {
            this.setCustomValidity('');
        }
    });
}

// ====================== BOOK FUNCTIONS ======================
async function loadBuku() {
    showLoading('Memuat data buku...');
    
    try {
        const { data, error } = await supabase
            .from('buku')
            .select('*')
            .order('judul', { ascending: true });

        if (error) throw error;

        bukuList = data || [];
        updateTabelBuku();
    } catch (error) {
        console.error("Error loading buku:", error);
        showAlert('error', 'Gagal memuat data buku: ' + error.message);
    } finally {
        hideLoading();
    }
}

function searchBukuSuggestions() {
    const searchTerm = document.getElementById('judulBuku').value.toLowerCase();
    const suggestions = bukuList.filter(book => 
        book.judul.toLowerCase().includes(searchTerm)
    );
    
    const suggestionsDiv = document.getElementById('bookSuggestions');
    suggestionsDiv.innerHTML = '';
    
    if (searchTerm.length === 0 || suggestions.length === 0) {
        suggestionsDiv.style.display = 'none';
        return;
    }
    
    suggestions.slice(0, 5).forEach(book => {
        const div = document.createElement('div');
        div.className = 'search-suggestion-item';
        div.textContent = book.judul;
        div.addEventListener('click', () => selectBook(book.id));
        suggestionsDiv.appendChild(div);
    });
    
    suggestionsDiv.style.display = 'block';
}

function searchBuku() {
    const searchTerm = document.getElementById('searchBuku').value.toLowerCase();
    const filteredBooks = bukuList.filter(book => 
        book.judul.toLowerCase().includes(searchTerm) ||
        book.pengarang.toLowerCase().includes(searchTerm) ||
        book.kategori.toLowerCase().includes(searchTerm)
    );
    updateTabelBuku(filteredBooks);
}

function updateTabelBuku(filteredBooks = null) {
    const tbody = document.getElementById('bookTableBody');
    tbody.innerHTML = '';

    const booksToShow = filteredBooks || bukuList.filter(book => 
        !peminjamanList.some(loan => 
            loan.kode_buku === book.kode && !loan.tanggal_kembali
        )
    );

    if (booksToShow.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4">
                    <i class="fas fa-book-open fa-2x mb-3 text-muted"></i>
                    <p>Tidak ada buku tersedia</p>
                </td>
            </tr>
        `;
        return;
    }

    booksToShow.forEach((book, index) => {
        const row = document.createElement('tr');
        row.className = 'animate__animated animate__fadeIn';
        row.innerHTML = `
            <td>${book.judul}</td>
            <td>${book.pengarang}</td>
            <td>${book.tahun_terbit}</td>
            <td>${book.kategori}</td>
            <td><span class="status-available">Tersedia</span></td>
            <td>
                <button class="btn btn-primary btn-sm" onclick="selectBook('${book.id}')">
                    <i class="fas fa-hand-holding me-1"></i>Pinjam
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function selectBook(bookId) {
    const book = bukuList.find(b => b.id === bookId);
    if (!book) return;

    document.getElementById('bookId').value = book.id;
    document.getElementById('judulBuku').value = book.judul;
    document.getElementById('pengarang').value = book.pengarang;
    document.getElementById('tahunTerbit').value = book.tahun_terbit;
    document.getElementById('isbn').value = book.isbn || '';
    document.getElementById('kategori').value = book.kategori;

    // Close suggestions if open
    document.getElementById('bookSuggestions').style.display = 'none';
}

// ... (Lanjutkan dengan fungsi-fungsi lainnya sesuai dengan yang ada di HTML)

// ====================== HELPER FUNCTIONS ======================
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
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), timeout);
    };
}

function resetForm() {
    document.getElementById('formPeminjaman').reset();
    document.getElementById('formPeminjaman').classList.remove('was-validated');
    document.getElementById('bookId').value = '';
    document.getElementById('jatuhTempo').value = '';
    document.getElementById('charCount').textContent = '0/200';
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('tanggalPinjam').value = today;
    document.getElementById('bookSuggestions').style.display = 'none';
}

function showLoading(message = 'Memproses...') {
    document.getElementById('loadingText').textContent = message;
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

function showAlert(type, message) {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} animate__animated animate__fadeInRight`;
    alert.role = 'alert';
    alert.innerHTML = `
        <i class="fas fa-${type === 'error' ? 'times-circle' : type === 'info' ? 'info-circle' : 'check-circle'} me-2"></i>
        ${message}
    `;
    document.getElementById('alertContainer').appendChild(alert);
    setTimeout(() => alert.remove(), 5000);
}

// Make functions available globally for HTML event handlers
window.selectBook = selectBook;
window.showPengembalianModal = showPengembalianModal;