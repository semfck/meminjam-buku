// script.js
// ====================== GLOBAL CONSTANTS ======================
const DENDA_PER_HARI = 5000; // Rp 5,000 per day late
const ITEMS_PER_PAGE = 10;
const SUPABASE_URL = 'https://xqnlchcbxekwulncjvfy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxbmxjaGNieGVrd3VsbmNqdmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDcyNzcxNzksImV4cCI6MjA2Mjg1MzE3OX0.j8nyrPIp64bJL_WziUE8ceSvwrSU0C8VHTd4-qGl8D4';

// Data buku dummy minimal 4 buku dari 4 kategori
const DUMMY_BOOKS = [
    {
        id: '1',
        kode: 'FIK001',
        judul: 'Laskar Pelangi',
        pengarang: 'Andrea Hirata',
        tahun_terbit: '2005',
        kategori: 'Fiksi',
        isbn: '978-9793062797',
        deskripsi: 'Novel tentang persahabatan dan pendidikan di Belitung'
    },
    {
        id: '2',
        kode: 'NFK001',
        judul: 'Atomic Habits',
        pengarang: 'James Clear',
        tahun_terbit: '2018',
        kategori: 'Non-Fiksi',
        isbn: '978-0735211292',
        deskripsi: 'Buku tentang membangun kebiasaan baik dan menghilangkan kebiasaan buruk'
    },
    {
        id: '3',
        kode: 'TEK001',
        judul: 'Clean Code',
        pengarang: 'Robert C. Martin',
        tahun_terbit: '2008',
        kategori: 'Teknologi',
        isbn: '978-0132350884',
        deskripsi: 'Panduan menulis kode yang bersih dan mudah dipahami'
    },
    {
        id: '4',
        kode: 'SEJ001',
        judul: 'Sejarah Indonesia Modern',
        pengarang: 'M.C. Ricklefs',
        tahun_terbit: '1981',
        kategori: 'Sejarah',
        isbn: '978-9794211875',
        deskripsi: 'Sejarah perkembangan Indonesia dari masa kolonial hingga modern'
    }
];

// ====================== GLOBAL VARIABLES ======================
let bukuList = [];
let peminjamanList = [];
let riwayatList = [];
let currentInvoice = null;
let currentPage = 1;
let reportChart = null;

// Initialize Supabase client
const _supabase = supabase;
const supabase = _supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Initialize Bootstrap components
let pengembalianModal, confirmModal, invoiceModal, bookDetailModal;

// ====================== INITIALIZATION ======================
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Initialize modals after DOM is loaded
        pengembalianModal = new bootstrap.Modal(document.getElementById('pengembalianModal'));
        confirmModal = new bootstrap.Modal(document.getElementById('confirmModal'));
        invoiceModal = new bootstrap.Modal(document.getElementById('invoiceModal'));
        bookDetailModal = new bootstrap.Modal(document.getElementById('bookDetailModal'));

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
        // Coba ambil dari local storage dulu
        const cachedBooks = getFromLocalStorage('bukuList');
        if (cachedBooks && cachedBooks.length > 0) {
            bukuList = cachedBooks;
            updateTabelBuku();
        }
        
        // Kemudian coba update dari server
        const { data, error } = await supabase
            .from('buku')
            .select('*')
            .order('judul', { ascending: true });

        if (!error && data && data.length > 0) {
            bukuList = data;
            saveToLocalStorage('bukuList', data);
            updateTabelBuku();
        } else if (!cachedBooks) {
            // Jika tidak ada data dari server dan tidak ada cache, gunakan data dummy
            bukuList = DUMMY_BOOKS;
            saveToLocalStorage('bukuList', DUMMY_BOOKS);
            updateTabelBuku();
            showAlert('warning', 'Menggunakan data dummy karena koneksi database bermasalah');
        }
    } catch (error) {
        console.error("Error loading buku:", error);
        if (!getFromLocalStorage('bukuList')) {
            bukuList = DUMMY_BOOKS;
            saveToLocalStorage('bukuList', DUMMY_BOOKS);
            updateTabelBuku();
            showAlert('error', 'Gagal memuat data buku. Menggunakan data dummy.');
        }
    } finally {
        hideLoading();
    }
}

function searchBukuSuggestions() {
    const searchTerm = document.getElementById('judulBuku').value.trim().toLowerCase();
    const suggestionsDiv = document.getElementById('bookSuggestions');
    
    // Kosongkan suggestions jika pencarian kosong
    if (searchTerm.length < 2) {
        suggestionsDiv.style.display = 'none';
        return;
    }
    
    // Gunakan Fuse.js untuk fuzzy search yang lebih baik
    const options = {
        keys: ['judul', 'pengarang', 'kategori'],
        threshold: 0.4,
        includeScore: true
    };
    
    const fuse = new Fuse(bukuList, options);
    const results = fuse.search(searchTerm).slice(0, 5);
    
    suggestionsDiv.innerHTML = '';
    
    if (results.length === 0) {
        suggestionsDiv.style.display = 'none';
        return;
    }
    
    results.forEach(result => {
        const div = document.createElement('div');
        div.className = 'search-suggestion-item';
        div.textContent = result.item.judul;
        div.addEventListener('click', () => selectBook(result.item.id));
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
            <td class="d-flex">
                <button class="btn btn-primary btn-sm me-2" onclick="selectBook('${book.id}')">
                    <i class="fas fa-hand-holding me-1"></i>Pinjam
                </button>
                <button class="btn btn-info btn-sm" onclick="showBookDetail('${book.id}')">
                    <i class="fas fa-info-circle me-1"></i>Detail
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

function showBookDetail(bookId) {
    const book = bukuList.find(b => b.id === bookId);
    if (!book) return;

    document.getElementById('detailJudul').textContent = book.judul;
    document.getElementById('detailPengarang').textContent = book.pengarang;
    document.getElementById('detailTahun').textContent = book.tahun_terbit;
    document.getElementById('detailKategori').textContent = book.kategori;
    document.getElementById('detailISBN').textContent = book.isbn || '-';
    document.getElementById('detailDeskripsi').textContent = book.deskripsi || 'Tidak ada deskripsi';
    
    bookDetailModal.show();
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

function updateTabelPengembalian(filteredLoans = null) {
    const tbody = document.getElementById('pengembalianBody');
    tbody.innerHTML = '';

    const loansToShow = filteredLoans || peminjamanList.filter(loan => !loan.tanggal_kembali);

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

    loansToShow.forEach((loan, index) => {
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
    if (!validatePeminjamanForm()) return;

    const bookId = document.getElementById('bookId').value;
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
        // Simpan ke Supabase jika tersedia
        let savedData = null;
        try {
            const { data, error } = await supabase
                .from('peminjaman')
                .insert([loanData])
                .select();

            if (error) throw error;
            savedData = data && data.length > 0 ? data[0] : null;
        } catch (dbError) {
            console.warn("Gagal menyimpan ke database:", dbError);
            // Simpan ke local storage sebagai fallback
            loanData.id = Date.now().toString();
            loanData.created_at = new Date().toISOString();
            peminjamanList.unshift(loanData);
            saveToLocalStorage('peminjamanList', peminjamanList);
            savedData = loanData;
            showAlert('warning', 'Data disimpan secara lokal karena koneksi bermasalah');
        }

        showAlert('success', 'Peminjaman berhasil disimpan!');
        
        // Show invoice after successful submission
        if (savedData) {
            setTimeout(() => {
                showInvoice(savedData);
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

function validatePeminjamanForm() {
    const form = document.getElementById('formPeminjaman');
    const bookId = document.getElementById('bookId').value;
    const namaPeminjam = document.getElementById('namaPeminjam').value.trim();
    const noHp = document.getElementById('noHp').value.trim();
    const tanggalPinjam = document.getElementById('tanggalPinjam').value;
    const lamaPinjam = document.getElementById('lamaPinjam').value;
    
    // Validasi buku
    if (!bookId) {
        showAlert('error', 'Harap pilih buku terlebih dahulu');
        document.getElementById('judulBuku').focus();
        return false;
    }
    
    // Validasi nama peminjam
    if (namaPeminjam.length < 3 || !/^[a-zA-Z ]+$/.test(namaPeminjam)) {
        showAlert('error', 'Nama hanya boleh mengandung huruf dan spasi (minimal 3 karakter)');
        document.getElementById('namaPeminjam').focus();
        return false;
    }
    
    // Validasi nomor HP
    if (!/^08[0-9]{8,11}$/.test(noHp)) {
        showAlert('error', 'Format nomor HP tidak valid (contoh: 081234567890)');
        document.getElementById('noHp').focus();
        return false;
    }
    
    // Validasi tanggal
    if (!tanggalPinjam) {
        showAlert('error', 'Harap pilih tanggal pinjam');
        return false;
    }
    
    // Validasi lama pinjam
    if (!lamaPinjam) {
        showAlert('error', 'Harap pilih lama pinjam');
        return false;
    }
    
    return true;
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

    // Reset validation
    document.getElementById('modalTanggalKembali').setCustomValidity('');

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
    const returnDateInput = document.getElementById('modalTanggalKembali');
    if (!returnDateInput.value) {
        returnDateInput.setCustomValidity('Harap pilih tanggal kembali');
        returnDateInput.reportValidity();
        return;
    }

    showLoading('Memproses pengembalian...');
    try {
        const returnDate = returnDateInput.value;
        const dueDate = new Date(currentInvoice.jatuh_tempo);
        const diffDays = Math.ceil((new Date(returnDate) - dueDate) / (1000 * 60 * 60 * 24));
        
        const updateData = {
            tanggal_kembali: returnDate,
            hari_telat: diffDays > 0 ? diffDays : 0,
            denda: diffDays > 0 ? diffDays * DENDA_PER_HARI : 0,
            status: diffDays > 0 ? 'Terlambat' : 'Dikembalikan'
        };

        // Coba update ke database
        try {
            const { data, error } = await supabase
                .from('peminjaman')
                .update(updateData)
                .eq('id', currentInvoice.id)
                .select();

            if (error) throw error;
            currentInvoice = data && data.length > 0 ? data[0] : null;
        } catch (dbError) {
            console.warn("Gagal update database:", dbError);
            // Update lokal sebagai fallback
            Object.assign(currentInvoice, updateData);
            saveToLocalStorage('peminjamanList', peminjamanList);
            showAlert('warning', 'Data diupdate secara lokal karena koneksi bermasalah');
        }

        pengembalianModal.hide();
        
        // Show invoice if there's a late fee
        if (currentInvoice && updateData.denda > 0) {
            setTimeout(() => {
                showInvoice(currentInvoice, true);
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

// ====================== HISTORY FUNCTIONS ======================
async function loadRiwayat() {
    showLoading('Memuat riwayat...');
    try {
        // Coba ambil dari database
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
        } catch (dbError) {
            console.warn("Gagal memuat dari database:", dbError);
            // Gunakan data lokal sebagai fallback
            riwayatList = peminjamanList.filter(loan => loan.tanggal_kembali);
            document.getElementById('totalData').textContent = riwayatList.length;
            showAlert('warning', 'Menggunakan data lokal karena koneksi bermasalah');
        }

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

function saveToLocalStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.error('Error saving to localStorage', e);
    }
}

function getFromLocalStorage(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        console.error('Error reading from localStorage', e);
        return null;
    }
}

// Make functions available globally for HTML event handlers
window.selectBook = selectBook;
window.showPengembalianModal = showPengembalianModal;
window.showBookDetail = showBookDetail;