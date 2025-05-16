// ====================== SUPABASE INITIALIZATION ======================
const SUPABASE_URL = 'https://xqnlchcbxekwulncjvfy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxbmxjaGNieGVrd3VsbmNqdmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDcyNzcxNzksImV4cCI6MjA2Mjg1MzE3OX0.j8nyrPIp64bJL_WziUE8ceSvwrSU0C8VHTd4-qGl8D4';
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ====================== GLOBAL CONSTANTS ======================
const DENDA_PER_HARI = 5000; // Rp 5,000 per day late
const ITEMS_PER_PAGE = 10;
let fuse = null; // Inisialisasi Fuse.js

// ====================== GLOBAL VARIABLES ======================
let bukuList = [];
let peminjamanList = [];
let riwayatList = [];
let currentInvoice = null;
let currentPage = 1;
let reportChart = null;

// Initialize Bootstrap components
const pengembalianModal = new bootstrap.Modal(document.getElementById('pengembalianModal'));
const confirmModal = new bootstrap.Modal(document.getElementById('confirmModal'));

// ====================== INITIALIZATION ======================
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Set default dates
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('tanggalPinjam').value = today;
        document.getElementById('modalTanggalKembali').value = today;
        document.getElementById('filterDari').value = getFirstDayOfMonth();
        document.getElementById('filterSampai').value = today;
        
        // Event listeners for due date calculation
        document.getElementById('lamaPinjam').addEventListener('change', hitungJatuhTempo);
        document.getElementById('tanggalPinjam').addEventListener('change', hitungJatuhTempo);
        
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
        
        // Inisialisasi Fuse.js untuk pencarian fuzzy
        const fuseOptions = {
            keys: [
                { name: 'judul', weight: 0.5 },
                { name: 'pengarang', weight: 0.3 },
                { name: 'kategori', weight: 0.2 }
            ],
            includeScore: true,
            threshold: 0.4,
            minMatchCharLength: 2
        };
        fuse = new Fuse(bukuList, fuseOptions);
        
        updateTabelBuku();
    } catch (error) {
        console.error("Error loading buku:", error);
        showAlert('error', 'Gagal memuat data buku: ' + error.message);
    } finally {
        hideLoading();
    }
}

// ... (kode lainnya tetap sama sampai bagian search functions) ...

function searchBukuSuggestions() {
    const searchTerm = document.getElementById('judulBuku').value.trim();
    const suggestionsContainer = document.getElementById('bookSuggestions');
    suggestionsContainer.innerHTML = '';
    
    if (searchTerm.length < 2) {
        suggestionsContainer.style.display = 'none';
        return;
    }

    // Gunakan Fuse.js untuk pencarian fuzzy
    const results = fuse.search(searchTerm);
    
    if (results.length > 0) {
        results.slice(0, 5).forEach(result => {
            const book = result.item;
            const suggestionItem = document.createElement('div');
            suggestionItem.className = 'search-suggestion-item';
            suggestionItem.innerHTML = `
                <strong>${highlightMatches(book.judul, searchTerm)}</strong> - 
                ${highlightMatches(book.pengarang, searchTerm)}<br>
                <small>${book.kategori} (${book.tahun_terbit})</small>
            `;
            suggestionItem.addEventListener('click', () => {
                selectBook(book.id);
                suggestionsContainer.style.display = 'none';
            });
            suggestionsContainer.appendChild(suggestionItem);
        });
        suggestionsContainer.style.display = 'block';
    } else {
        suggestionsContainer.style.display = 'none';
    }
}

function searchBuku() {
    const searchTerm = document.getElementById('searchBuku').value.trim();
    let filteredBooks = bukuList;
    
    if (searchTerm) {
        const results = fuse.search(searchTerm);
        filteredBooks = results.map(result => result.item);
    }
    
    updateTabelBuku(filteredBooks);
}

// Fungsi untuk menandai teks yang cocok
function highlightMatches(text, searchTerm) {
    if (!text || !searchTerm) return text;
    const regex = new RegExp(`(${searchTerm})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

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

function updateTabelBuku() {
    const tbody = document.getElementById('bookTableBody');
    tbody.innerHTML = '';

    const availableBooks = bukuList.filter(book => 
        !peminjamanList.some(loan => 
            loan.kode_buku === book.kode && !loan.tanggal_kembali
        )
    );

    if (availableBooks.length === 0) {
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

    availableBooks.forEach((book, index) => {
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

async function searchBukuSuggestions() {
    const searchTerm = document.getElementById('judulBuku').value.toLowerCase();
    const suggestionsContainer = document.getElementById('bookSuggestions');
    suggestionsContainer.innerHTML = '';
    
    if (searchTerm.length < 2) {
        suggestionsContainer.style.display = 'none';
        return;
    }

    const filteredBooks = bukuList.filter(book => 
        book.judul.toLowerCase().includes(searchTerm) ||
        book.pengarang.toLowerCase().includes(searchTerm) ||
        book.kategori.toLowerCase().includes(searchTerm)
    );

    if (filteredBooks.length > 0) {
        filteredBooks.forEach(book => {
            const suggestionItem = document.createElement('div');
            suggestionItem.className = 'search-suggestion-item';
            suggestionItem.innerHTML = `
                <strong>${book.judul}</strong> - ${book.pengarang}<br>
                <small>${book.kategori} (${book.tahun_terbit})</small>
            `;
            suggestionItem.addEventListener('click', () => {
                selectBook(book.id);
                suggestionsContainer.style.display = 'none';
            });
            suggestionsContainer.appendChild(suggestionItem);
        });
        suggestionsContainer.style.display = 'block';
    } else {
        suggestionsContainer.style.display = 'none';
    }
}

function searchBuku() {
    const searchTerm = document.getElementById('searchBuku').value.toLowerCase();
    updateTabelBuku(bukuList.filter(book => 
        book.judul.toLowerCase().includes(searchTerm) ||
        book.pengarang.toLowerCase().includes(searchTerm) ||
        book.kategori.toLowerCase().includes(searchTerm)
    ));
}

// ====================== LOAN FUNCTIONS ======================
async function loadPeminjaman() {
    showLoading('Memuat data peminjaman...');
    try {
        const { data, error } = await supabase
            .from('peminjaman')
            .select('*')
            .order('tanggal_pinjam', { ascending: false });

        if (error) throw error;

        peminjamanList = data || [];
        updateTabelPengembalian();
    } catch (error) {
        console.error("Error loading loans:", error);
        showAlert('error', 'Gagal memuat data peminjaman: ' + error.message);
    } finally {
        hideLoading();
    }
}

function updateTabelPengembalian() {
    const tbody = document.getElementById('pengembalianBody');
    tbody.innerHTML = '';

    const activeLoans = peminjamanList.filter(loan => !loan.tanggal_kembali);

    if (activeLoans.length === 0) {
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

    activeLoans.forEach((loan, index) => {
        const row = document.createElement('tr');
        row.className = 'animate__animated animate__fadeIn';
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${loan.judul_buku}</td>
            <td>${loan.pengarang}</td>
            <td>${loan.nama_peminjam}</td>
            <td>${formatDate(loan.tanggal_pinjam)}</td>
            <td>${formatDate(loan.jatuh_tempo)}</td>
            <td><span class="status-borrowed">${loan.status}</span></td>
            <td>
                <button class="btn btn-primary btn-sm" onclick="showPengembalianModal('${loan.id}')">
                    <i class="fas fa-undo me-1"></i>Proses
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function searchPeminjaman() {
    const searchTerm = document.getElementById('searchPeminjaman').value.toLowerCase();
    const activeLoans = peminjamanList.filter(loan => !loan.tanggal_kembali);
    const filteredLoans = activeLoans.filter(loan => 
        loan.judul_buku.toLowerCase().includes(searchTerm) ||
        loan.nama_peminjam.toLowerCase().includes(searchTerm)
    );
    updateTabelPengembalian(filteredLoans);
}

async function simpanPeminjaman() {
    const form = document.getElementById('formPeminjaman');
    if (!form.checkValidity()) {
        form.classList.add('was-validated');
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
        nama_peminjam: document.getElementById('namaPeminjam').value,
        no_hp: document.getElementById('noHp').value,
        tanggal_pinjam: document.getElementById('tanggalPinjam').value,
        jatuh_tempo: hitungJatuhTempo(),
        lama_pinjam: document.getElementById('lamaPinjam').value,
        status: 'Dipinjam',
        catatan: document.getElementById('catatan').value
    };

    showLoading('Menyimpan peminjaman...');
    try {
        const { error } = await supabase
            .from('peminjaman')
            .insert([loanData]);

        if (error) throw error;

        showAlert('success', 'Peminjaman berhasil disimpan!');
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

function hitungJatuhTempo() {
    try {
        const tglPinjam = document.getElementById('tanggalPinjam').value;
        const lamaPinjam = parseInt(document.getElementById('lamaPinjam').value);
        
        if (tglPinjam && lamaPinjam) {
            const tglPinjamObj = new Date(tglPinjam);
            const tglTempo = new Date(tglPinjamObj);
            tglTempo.setDate(tglPinjamObj.getDate() + (lamaPinjam * 7));
            
            document.getElementById('jatuhTempo').value = formatDate(tglTempo.toISOString().split('T')[0]);
            return tglTempo.toISOString().split('T')[0];
        }
        return null;
    } catch (error) {
        console.error("Error calculating due date:", error);
        return null;
    }
}

// ====================== RETURN FUNCTIONS ======================
async function showPengembalianModal(loanId) {
    currentInvoice = peminjamanList.find(loan => loan.id === loanId);
    if (!currentInvoice) return;

    // Isi data modal
    document.getElementById('modalJudulBuku').value = currentInvoice.judul_buku;
    document.getElementById('modalPengarang').value = currentInvoice.pengarang;
    document.getElementById('modalNamaPeminjam').value = currentInvoice.nama_peminjam;
    document.getElementById('modalTanggalPinjam').value = formatDate(currentInvoice.tanggal_pinjam);
    document.getElementById('modalJatuhTempo').value = formatDate(currentInvoice.jatuh_tempo);
    document.getElementById('modalTanggalKembali').value = new Date().toISOString().split('T')[0];

    // Hitung denda awal
    previewDenda();
    pengembalianModal.show();
}

function previewDenda() {
    const returnDate = new Date(document.getElementById('modalTanggalKembali').value);
    const dueDate = new Date(currentInvoice.jatuh_tempo);
    const diffTime = returnDate - dueDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const hariTelat = diffDays > 0 ? diffDays : 0;
    const denda = hariTelat * DENDA_PER_HARI;

    document.getElementById('modalHariTelat').value = `${hariTelat} hari`;
    document.getElementById('modalDenda').value = formatRupiah(denda);
}

async function prosesPengembalian() {
    showLoading('Memproses pengembalian...');
    try {
        const updateData = {
            tanggal_kembali: document.getElementById('modalTanggalKembali').value,
            hari_telat: parseInt(document.getElementById('modalHariTelat').value.split(' ')[0]),
            denda: parseInt(document.getElementById('modalDenda').value.replace(/\D/g, '')),
            status: document.getElementById('modalDenda').value !== 'Rp0' ? 'Terlambat' : 'Dikembalikan'
        };

        const { error } = await supabase
            .from('peminjaman')
            .update(updateData)
            .eq('id', currentInvoice.id);

        if (error) throw error;

        pengembalianModal.hide();
        showAlert('success', 'Pengembalian berhasil diproses!');
        await loadPeminjaman();
        await loadRiwayat();
    } catch (error) {
        console.error("Error processing return:", error);
        showAlert('error', 'Gagal memproses pengembalian: ' + error.message);
    } finally {
        hideLoading();
    }
}

// ====================== HISTORY FUNCTIONS ======================
async function loadRiwayat() {
    showLoading('Memuat riwayat...');
    try {
        let query = supabase
            .from('peminjaman')
            .select('*', { count: 'exact' })
            .order('tanggal_pinjam', { ascending: false });

        // Filter tanggal
        const dari = document.getElementById('filterDari').value;
        const sampai = document.getElementById('filterSampai').value;
        if (dari && sampai) {
            query = query.gte('tanggal_pinjam', dari).lte('tanggal_pinjam', sampai);
        }

        // Pencarian
        const searchTerm = document.getElementById('searchRiwayat').value.toLowerCase();
        if (searchTerm) {
            query = query.or(`nama_peminjam.ilike.%${searchTerm}%,judul_buku.ilike.%${searchTerm}%`);
        }

        const { data, error, count } = await query;
        if (error) throw error;

        riwayatList = data || [];
        document.getElementById('totalData').textContent = count || 0;
        updateRiwayatTable();
        updatePagination();
    } catch (error) {
        console.error("Error loading history:", error);
        showAlert('error', 'Gagal memuat riwayat: ' + error.message);
    } finally {
        hideLoading();
    }
}

function updateRiwayatTable() {
    const tbody = document.getElementById('riwayatBody');
    tbody.innerHTML = '';

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const currentData = riwayatList.slice(start, end);

    if (currentData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center py-4">
                    <i class="fas fa-book-open fa-2x mb-3 text-muted"></i>
                    <p>Tidak ada data riwayat</p>
                </td>
            </tr>
        `;
        return;
    }

    currentData.forEach((loan, index) => {
        const row = document.createElement('tr');
        row.className = 'animate__animated animate__fadeIn';
        row.innerHTML = `
            <td>${start + index + 1}</td>
            <td>${loan.judul_buku}</td>
            <td>${loan.pengarang}</td>
            <td>${loan.nama_peminjam}</td>
            <td>${formatDate(loan.tanggal_pinjam)}</td>
            <td>${formatDate(loan.jatuh_tempo)}</td>
            <td>${loan.tanggal_kembali ? formatDate(loan.tanggal_kembali) : '-'}</td>
            <td>${loan.hari_telat || '-'} hari</td>
            <td>${loan.denda ? formatRupiah(loan.denda) : '-'}</td>
            <td><span class="${loan.status === 'Terlambat' ? 'status-late' : 'status-returned'}">${loan.status}</span></td>
        `;
        tbody.appendChild(row);
    });

    // Hitung total denda
    const totalDenda = riwayatList.reduce((sum, loan) => sum + (loan.denda || 0), 0);
    document.getElementById('totalDenda').textContent = formatRupiah(totalDenda);
}

function searchRiwayat() {
    const searchTerm = document.getElementById('searchRiwayat').value.toLowerCase();
    const filteredRiwayat = riwayatList.filter(loan => 
        loan.judul_buku.toLowerCase().includes(searchTerm) ||
        loan.nama_peminjam.toLowerCase().includes(searchTerm)
    );
    updateRiwayatTable(filteredRiwayat);
}

function updatePagination() {
    const btnPrev = document.getElementById('btnPrev');
    const btnNext = document.getElementById('btnNext');
    btnPrev.disabled = currentPage === 1;
    btnNext.disabled = currentPage * ITEMS_PER_PAGE >= riwayatList.length;
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        updateRiwayatTable();
        updatePagination();
    }
}

function nextPage() {
    if (currentPage * ITEMS_PER_PAGE < riwayatList.length) {
        currentPage++;
        updateRiwayatTable();
        updatePagination();
    }
}

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
    }).format(amount);
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
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('tanggalPinjam').value = today;
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
        <i class="fas fa-${type === 'error' ? 'times-circle' : 'check-circle'} me-2"></i>
        ${message}
    `;
    document.getElementById('alertContainer').appendChild(alert);
    setTimeout(() => alert.remove(), 5000);
}

// Fungsi untuk menampilkan invoice peminjaman
function showInvoice(loanData, isDenda = false) {
  // Generate nomor invoice
  const invoiceNumber = `INV-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(loanData.id).padStart(4, '0')}`;
  
  // Isi data invoice
  document.getElementById('invoiceNumber').textContent = invoiceNumber;
  document.getElementById('invoiceNamaPeminjam').textContent = loanData.nama_peminjam;
  document.getElementById('invoiceNoHp').textContent = loanData.no_hp;
  document.getElementById('invoiceTanggalPinjam').textContent = formatDate(loanData.tanggal_pinjam);
  document.getElementById('invoiceJatuhTempo').textContent = formatDate(loanData.jatuh_tempo);
  
  // Isi detail buku
  const bookDetails = document.getElementById('invoiceBookDetails');
  bookDetails.innerHTML = `
      <tr>
          <td>${loanData.judul_buku}</td>
          <td>${loanData.pengarang}</td>
          <td>${loanData.lama_pinjam} minggu</td>
          <td>${loanData.status || 'Dipinjam'}</td>
      </tr>
  `;
  
  // Jika ada denda, tampilkan section denda
  if (isDenda && loanData.denda > 0) {
      document.getElementById('dendaSection').classList.remove('d-none');
      document.getElementById('invoiceTanggalKembali').textContent = formatDate(loanData.tanggal_kembali);
      document.getElementById('invoiceHariTelat').textContent = loanData.hari_telat || 0;
      document.getElementById('invoiceDenda').textContent = formatRupiah(loanData.denda);
  } else {
      document.getElementById('dendaSection').classList.add('d-none');
  }
  
  // Tampilkan modal
  const invoiceModal = new bootstrap.Modal('#invoiceModal');
  invoiceModal.show();
  
  // Event listener untuk tombol cetak
  document.getElementById('btnCetakInvoice').addEventListener('click', function() {
      printInvoice();
  });
}

// Fungsi untuk mencetak invoice
function printInvoice() {
  const printContents = document.getElementById('invoiceModal').querySelector('.modal-content').innerHTML;
  const originalContents = document.body.innerHTML;
  
  document.body.innerHTML = `
      <!DOCTYPE html>
      <html>
      <head>
          <title>Cetak Invoice</title>
          <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
          <style>
              @media print {
                  body { padding: 20px; }
                  .no-print { display: none !important; }
              }
          </style>
      </head>
      <body onload="window.print(); window.close();">
          ${printContents}
      </body>
      </html>
  `;
  
  // Kembalikan konten asli setelah pencetakan selesai
  setTimeout(() => {
      document.body.innerHTML = originalContents;
  }, 1000);
}

// Modifikasi fungsi prosesPengembalian untuk menampilkan invoice setelah pengembalian
async function prosesPengembalian() {
  showLoading('Memproses pengembalian...');
  try {
      const returnDate = document.getElementById('modalTanggalKembali').value;
      const dueDate = new Date(currentInvoice.jatuh_tempo);
      const diffDays = Math.ceil((new Date(returnDate) - dueDate) / (1000 * 60 * 60 * 24));
      
      const updateData = {
          tanggal_kembali: returnDate,
          hari_telat: diffDays > 0 ? diffDays : 0,
          denda: diffDays > 0 ? diffDays * DENDA_PER_HARI : 0,
          status: diffDays > 0 ? 'Terlambat' : 'Dikembalikan'
      };

      const { error } = await supabase
          .from('peminjaman')
          .update(updateData)
          .eq('id', currentInvoice.id);

      if (error) throw error;

      pengembalianModal.hide();
      
      // Tampilkan invoice setelah pengembalian
      const updatedLoan = { ...currentInvoice, ...updateData };
      showInvoice(updatedLoan, true);
      
      await loadPeminjaman();
      await loadRiwayat();
  } catch (error) {
      console.error("Error processing return:", error);
      showAlert('error', 'Gagal memproses pengembalian: ' + error.message);
  } finally {
      hideLoading();
  }
}

// Modifikasi fungsi simpanPeminjaman untuk menampilkan invoice setelah peminjaman
async function simpanPeminjaman() {
  // ... kode sebelumnya tetap sama ...
  
  try {
      const { data, error } = await supabase
          .from('peminjaman')
          .insert([loanData])
          .select(); // Tambahkan .select() untuk mendapatkan data yang baru dibuat

      if (error) throw error;

      showAlert('success', 'Peminjaman berhasil disimpan!');
      
      // Tampilkan invoice peminjaman
      if (data && data.length > 0) {
          showInvoice(data[0]);
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

// ====================== INVOICE FUNCTIONS ======================

/**
 * Show invoice for book loan or return
 * @param {Object} loanData - Loan data object
 * @param {boolean} isLateReturn - Whether this is for a late return
 */
function showInvoice(loanData, isLateReturn = false) {
  // Generate invoice number (INV-YYYYMM-XXXX)
  const now = new Date();
  const invoiceNumber = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(loanData.id).padStart(4, '0')}`;
  
  // Format date to Indonesian format (dd MonthName yyyy)
  const formatDate = (dateString) => {
      if (!dateString) return '-';
      const options = { day: '2-digit', month: 'long', year: 'numeric' };
      return new Date(dateString).toLocaleDateString('id-ID', options);
  };

  // Format currency to Rupiah
  const formatRupiah = (amount) => {
      return new Intl.NumberFormat('id-ID', {
          style: 'currency',
          currency: 'IDR',
          minimumFractionDigits: 0
      }).format(amount || 0);
  };

  // Fill in invoice data
  document.getElementById('invoiceNumber').textContent = invoiceNumber;
  document.getElementById('invoiceNamaPeminjam').textContent = loanData.nama_peminjam || '-';
  document.getElementById('invoiceNoHp').textContent = loanData.no_hp || '-';
  document.getElementById('invoiceTanggalPinjam').textContent = formatDate(loanData.tanggal_pinjam);
  document.getElementById('invoiceJatuhTempo').textContent = formatDate(loanData.jatuh_tempo);
  
  // Fill book details
  const bookDetails = document.getElementById('invoiceBookDetails');
  bookDetails.innerHTML = `
      <tr>
          <td>${loanData.judul_buku || '-'}</td>
          <td>${loanData.pengarang || '-'}</td>
          <td>${loanData.lama_pinjam ? loanData.lama_pinjam + ' minggu' : '-'}</td>
          <td>
              <span class="badge ${loanData.status === 'Terlambat' ? 'bg-danger' : 'bg-success'}">
                  ${loanData.status || 'Dipinjam'}
              </span>
          </td>
      </tr>
  `;
  
  // Handle late return section
  const dendaSection = document.getElementById('dendaSection');
  if (isLateReturn && loanData.denda > 0) {
      dendaSection.classList.remove('d-none');
      document.getElementById('invoiceTanggalKembali').textContent = formatDate(loanData.tanggal_kembali);
      document.getElementById('invoiceHariTelat').textContent = loanData.hari_telat || 0;
      document.getElementById('invoiceDenda').textContent = formatRupiah(loanData.denda);
  } else {
      dendaSection.classList.add('d-none');
  }
  
  // Initialize and show modal
  const invoiceModal = new bootstrap.Modal('#invoiceModal');
  invoiceModal.show();
  
  // Set up print button
  setupPrintButton();
}

/**
* Set up the print invoice button functionality
*/
function setupPrintButton() {
  document.getElementById('btnCetakInvoice').onclick = function() {
      // Clone the modal content
      const printContent = document.getElementById('invoiceModal').cloneNode(true);
      
      // Remove elements with no-print class
      const noPrintElements = printContent.querySelectorAll('.no-print');
      noPrintElements.forEach(el => el.remove());
      
      // Create print window
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
              <title>Cetak Invoice Peminjaman Buku</title>
              <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
              <style>
                  body {
                      padding: 20px;
                      font-size: 14px;
                  }
                  .table {
                      font-size: 13px;
                  }
                  .table th {
                      background-color: #f8f9fa !important;
                  }
                  .badge {
                      font-size: 12px;
                  }
                  .signature-box {
                      height: 80px;
                      margin-top: 40px;
                      position: relative;
                  }
                  .signature-line {
                      position: absolute;
                      bottom: 0;
                      width: 100%;
                      border-top: 1px solid #000;
                  }
                  @page {
                      size: A4;
                      margin: 10mm;
                  }
                  @media print {
                      body {
                          padding: 0;
                          font-size: 12px;
                      }
                      .table {
                          font-size: 11px;
                      }
                      .modal-header {
                          background-color: #4361ee !important;
                          color: white !important;
                          -webkit-print-color-adjust: exact;
                          print-color-adjust: exact;
                      }
                  }
              </style>
          </head>
          <body onload="window.print();">
              ${printContent.querySelector('.modal-content').outerHTML}
          </body>
          </html>
      `);
      printWindow.document.close();
  };
}

// ====================== INTEGRATION WITH EXISTING FUNCTIONS ======================

/**
* Modified save loan function to show invoice after successful submission
*/
async function simpanPeminjaman() {
  // ... (your existing validation code) ...
  
  try {
      const { data, error } = await supabase
          .from('peminjaman')
          .insert([loanData])
          .select(); // Important: Add .select() to get the inserted data

      if (error) throw error;

      showAlert('success', 'Peminjaman berhasil disimpan!');
      
      // Show invoice after successful submission
      if (data && data.length > 0) {
          setTimeout(() => {
              showInvoice(data[0]);
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

/**
* Modified return process function to show invoice for late returns
*/
async function prosesPengembalian() {
  showLoading('Memproses pengembalian...');
  try {
      const returnDate = document.getElementById('modalTanggalKembali').value;
      const dueDate = new Date(currentInvoice.jatuh_tempo);
      const diffDays = Math.ceil((new Date(returnDate) - dueDate) / (1000 * 60 * 60 * 24));
      
      const updateData = {
          tanggal_kembali: returnDate,
          hari_telat: diffDays > 0 ? diffDays : 0,
          denda: diffDays > 0 ? diffDays * DENDA_PER_HARI : 0,
          status: diffDays > 0 ? 'Terlambat' : 'Dikembalikan'
      };

      const { data, error } = await supabase
          .from('peminjaman')
          .update(updateData)
          .eq('id', currentInvoice.id)
          .select(); // Important: Add .select() to get the updated data

      if (error) throw error;

      pengembalianModal.hide();
      
      // Show invoice if there's a late fee
      if (data && data.length > 0 && updateData.denda > 0) {
          setTimeout(() => {
              showInvoice(data[0], true);
          }, 500);
      } else {
          showAlert('success', 'Pengembalian berhasil diproses!');
      }
      
      await loadPeminjaman();
      await loadRiwayat();
  } catch (error) {
      console.error("Error processing return:", error);
      showAlert('error', 'Gagal memproses pengembalian: ' + error.message);
  } finally {
      hideLoading();
  }
}

// ====================== HELPER FUNCTIONS ======================

/**
* Format date to dd/mm/yyyy
*/
function formatDate(dateString) {
  if (!dateString) return '-';
  const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
  return new Date(dateString).toLocaleDateString('id-ID', options);
}

/**
* Format number to Rupiah currency
*/
function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
  }).format(amount || 0);
}

// Make functions available globally for HTML event handlers
window.selectBook = selectBook;
window.showPengembalianModal = showPengembalianModal;