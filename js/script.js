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
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    db: {
        schema: 'public'
    },
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
});

// Initialize Bootstrap components
let pengembalianModal, confirmModal, invoiceModal;

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

// Fungsi untuk memilih buku dari tabel
function selectBookFromTable(bookData) {
    document.getElementById('bookId').value = bookData.id || 'demo-' + Math.random().toString(36).substr(2, 9);
    document.getElementById('judulBuku').value = bookData.judul;
    document.getElementById('pengarang').value = bookData.pengarang;
    document.getElementById('tahunTerbit').value = bookData.tahun;
    document.getElementById('kategori').value = bookData.kategori;
    document.getElementById('isbn').value = bookData.isbn || 'ISBN-' + Math.random().toString(36).substr(2, 8).toUpperCase();
    
    showAlert('success', `Buku "${bookData.judul}" telah dipilih`);
    document.getElementById('formPeminjaman').scrollIntoView({ behavior: 'smooth' });
}

// Data buku contoh
const sampleBooks = {
    fiksi: [
        { id: 'fiksi-1', judul: 'Laskar Pelangi', pengarang: 'Andrea Hirata', tahun: 2005, kategori: 'Fiksi', isbn: '978-979-3062-79-8' },
        { id: 'fiksi-2', judul: 'Bumi Manusia', pengarang: 'Pramoedya Ananta Toer', tahun: 1980, kategori: 'Fiksi', isbn: '979-9234-01-5' },
        { id: 'fiksi-3', judul: 'Perahu Kertas', pengarang: 'Dee Lestari', tahun: 2009, kategori: 'Fiksi', isbn: '978-979-22-3895-7' },
        { id: 'fiksi-4', judul: 'Pulang', pengarang: 'Leila S. Chudori', tahun: 2012, kategori: 'Fiksi', isbn: '978-979-780-635-3' }
    ],
    nonfiksi: [
        { id: 'nonfiksi-1', judul: 'Filosofi Teras', pengarang: 'Henry Manampiring', tahun: 2018, kategori: 'Non-Fiksi', isbn: '978-602-424-698-5' },
        { id: 'nonfiksi-2', judul: 'Atomic Habits', pengarang: 'James Clear', tahun: 2018, kategori: 'Non-Fiksi', isbn: '978-073-521-129-2' },
        { id: 'nonfiksi-3', judul: 'The Psychology of Money', pengarang: 'Morgan Housel', tahun: 2020, kategori: 'Non-Fiksi', isbn: '978-085-719-768-9' },
        { id: 'nonfiksi-4', judul: 'Mindset: The New Psychology of Success', pengarang: 'Carol S. Dweck', tahun: 2006, kategori: 'Non-Fiksi', isbn: '978-034-547-232-8' }
    ],
    teknologi: [
        { id: 'teknologi-1', judul: 'Clean Code', pengarang: 'Robert C. Martin', tahun: 2008, kategori: 'Teknologi', isbn: '978-013-235-088-4' },
        { id: 'teknologi-2', judul: 'The Pragmatic Programmer', pengarang: 'Andrew Hunt, David Thomas', tahun: 1999, kategori: 'Teknologi', isbn: '978-020-161-622-4' },
        { id: 'teknologi-3', judul: 'Designing Data-Intensive Applications', pengarang: 'Martin Kleppmann', tahun: 2017, kategori: 'Teknologi', isbn: '978-144-937-332-0' },
        { id: 'teknologi-4', judul: 'Artificial Intelligence: A Modern Approach', pengarang: 'Stuart Russell, Peter Norvig', tahun: 2020, kategori: 'Teknologi', isbn: '978-013-461-099-3' }
    ],
    sejarah: [
        { id: 'sejarah-1', judul: 'Sejarah Indonesia Modern', pengarang: 'M.C. Ricklefs', tahun: 1981, kategori: 'Sejarah', isbn: '978-979-421-659-5' },
        { id: 'sejarah-2', judul: 'Revolusi Indonesia', pengarang: 'George McTurnan Kahin', tahun: 1952, kategori: 'Sejarah', isbn: '978-979-461-554-5' },
        { id: 'sejarah-3', judul: 'Sapiens: A Brief History of Humankind', pengarang: 'Yuval Noah Harari', tahun: 2011, kategori: 'Sejarah', isbn: '978-006-231-609-7' },
        { id: 'sejarah-4', judul: 'Guns, Germs, and Steel', pengarang: 'Jared Diamond', tahun: 1997, kategori: 'Sejarah', isbn: '978-039-331-755-8' }
    ]
};

// Fungsi untuk memuat tabel buku
function loadBookTables() {
    const categories = ['fiksi', 'nonfiksi', 'teknologi', 'sejarah'];
    
    categories.forEach(category => {
        const tbody = document.getElementById(`${category}-table-body`);
        if (!tbody) return;
        
        tbody.innerHTML = sampleBooks[category].map(book => `
            <tr>
                <td>${book.judul}</td>
                <td>${book.pengarang}</td>
                <td>${book.tahun}</td>
                <td><span class="status-available">Tersedia</span></td>
                <td>
                    <button class="btn btn-primary btn-sm" onclick="selectBookFromTable(${JSON.stringify(book).replace(/"/g, '&quot;')})">
                        <i class="fas fa-hand-holding me-1"></i>Pinjam
                    </button>
                    <button class="btn btn-info btn-sm" onclick="showBookDetail(${JSON.stringify(book).replace(/"/g, '&quot;')})">
                        <i class="fas fa-info-circle me-1"></i>Detail
                    </button>
                </td>
            </tr>
        `).join('');
    });
}

// Fungsi untuk menampilkan detail buku
function showBookDetail(book) {
    const modal = new bootstrap.Modal(document.getElementById('bookDetailModal'));
    document.getElementById('detailJudul').textContent = book.judul;
    document.getElementById('detailPengarang').textContent = book.pengarang;
    document.getElementById('detailTahun').textContent = book.tahun;
    document.getElementById('detailKategori').textContent = book.kategori;
    document.getElementById('detailISBN').textContent = book.isbn;
    document.getElementById('detailDeskripsi').textContent = `Buku ${book.kategori} karya ${book.pengarang} yang diterbitkan tahun ${book.tahun}.`;
    modal.show();
}

// Panggil fungsi saat DOM siap
document.addEventListener('DOMContentLoaded', loadBookTables);

// Fungsi untuk pencarian buku global
function setupBookSearch() {
    const searchInput = document.getElementById('globalBookSearch');
    const searchButton = document.getElementById('btnSearchBook');
    
    const performSearch = () => {
        const searchTerm = searchInput.value.toLowerCase();
        if (searchTerm.length < 2) return;
        
        // Cari di semua kategori
        const allBooks = [...sampleBooks.fiksi, ...sampleBooks.nonfiksi, ...sampleBooks.teknologi, ...sampleBooks.sejarah];
        const results = allBooks.filter(book => 
            book.judul.toLowerCase().includes(searchTerm) || 
            book.pengarang.toLowerCase().includes(searchTerm)
        ).slice(0, 10);
        
        if (results.length > 0) {
            // Tampilkan hasil pencarian dalam modal
            const modal = new bootstrap.Modal(document.getElementById('bookDetailModal'));
            document.getElementById('detailJudul').textContent = 'Hasil Pencarian';
            document.getElementById('detailPengarang').textContent = '';
            document.getElementById('detailTahun').textContent = '';
            document.getElementById('detailKategori').textContent = '';
            document.getElementById('detailISBN').textContent = '';
            
            let resultsHtml = '<div class="list-group">';
            results.forEach(book => {
                resultsHtml += `
                    <a href="#" class="list-group-item list-group-item-action" 
                       onclick="selectBookFromTable(${JSON.stringify(book).replace(/"/g, '&quot;')}); return false;">
                        <div class="d-flex w-100 justify-content-between">
                            <h6 class="mb-1">${book.judul}</h6>
                            <small>${book.kategori}</small>
                        </div>
                        <p class="mb-1">${book.pengarang} (${book.tahun})</p>
                    </a>
                `;
            });
            resultsHtml += '</div>';
            
            document.getElementById('detailDeskripsi').innerHTML = resultsHtml;
            document.getElementById('btnBorrowFromDetail').style.display = 'none';
            modal.show();
        } else {
            showAlert('info', 'Tidak ditemukan buku yang sesuai dengan pencarian Anda');
        }
    };
    
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });
    
    searchButton.addEventListener('click', performSearch);
}

// Event listener untuk tombol pinjam di modal detail
document.getElementById('btnBorrowFromDetail').addEventListener('click', function() {
    const book = {
        judul: document.getElementById('detailJudul').textContent,
        pengarang: document.getElementById('detailPengarang').textContent,
        tahun: document.getElementById('detailTahun').textContent,
        kategori: document.getElementById('detailKategori').textContent,
        isbn: document.getElementById('detailISBN').textContent
    };
    selectBookFromTable(book);
    bootstrap.Modal.getInstance(document.getElementById('bookDetailModal')).hide();
});

// Panggil fungsi setup saat DOM siap
document.addEventListener('DOMContentLoaded', function() {
    loadBookTables();
    setupBookSearch();
});

// ====================== BOOK FUNCTIONS ======================
async function loadBuku(page = 1, itemsPerPage = 50) {
    showLoading('Memuat data buku...');
    
    try {
        const { data, error, count } = await supabase
            .from('buku')
            .select('*', { count: 'exact' })
            .order('judul', { ascending: true })
            .range((page - 1) * itemsPerPage, page * itemsPerPage - 1);

        if (error) throw error;

        bukuList = data || [];
        updateTabelBuku();
        return count; // Return total count for pagination controls
    } catch (error) {
        console.error("Error loading buku:", error);
        showAlert('error', 'Gagal memuat data buku: ' + error.message);
        return 0;
    } finally {
        hideLoading();
    }
}

// Initial load
loadBuku();

// With pagination
loadBuku(1, 50).then(totalCount => {
    console.log(`Total books: ${totalCount}`);
    // Update pagination UI
});

// Refresh every 5 minutes
setInterval(loadBuku, 5 * 60 * 1000);

function searchBukuSuggestions() {
    const searchTerm = document.getElementById('judulBuku').value.toLowerCase();
    const suggestions = bukuList.filter(book => 
        book.judul.toLowerCase().includes(searchTerm)
    );
    
    const suggestionsDiv = document.getElementById('bookSuggestions');
    suggestionsDiv.innerHTML = '';
    
    if (searchTerm.length < 3 || suggestions.length === 0) {
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
    if (searchTerm.length < 3) {
        updateTabelBuku();
        return;
    }

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
    const form = document.getElementById('formPeminjaman');
    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        // Scroll to first invalid field
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
        const { data, error } = await supabase
            .from('peminjaman')
            .insert([loanData])
            .select();

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
function showPengembalianModal(loanId) {
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

    // Validasi tambahan
    const returnDate = new Date(returnDateInput.value);
    const borrowDate = new Date(currentInvoice.tanggal_pinjam);
    if (returnDate < borrowDate) {
        showAlert('error', 'Tanggal kembali tidak boleh lebih awal dari tanggal pinjam');
        return;
    }

    showLoading('Memproses pengembalian...');
    try {
        const dueDate = new Date(currentInvoice.jatuh_tempo);
        const diffDays = Math.ceil((returnDate - dueDate) / (1000 * 60 * 60 * 24));
        
        const updateData = {
            tanggal_kembali: returnDateInput.value,
            hari_telat: diffDays > 0 ? diffDays : 0,
            denda: diffDays > 0 ? diffDays * DENDA_PER_HARI : 0,
            status: diffDays > 0 ? 'Terlambat' : 'Dikembalikan'
        };

        const { data, error } = await supabase
            .from('peminjaman')
            .update(updateData)
            .eq('id', currentInvoice.id)
            .select();

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

// ====================== INVOICE FUNCTIONS ======================
function showInvoice(loanData, isLateReturn = false) {
    // Generate invoice number (INV-YYYYMM-XXXX)
    const now = new Date();
    const invoiceNumber = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(loanData.id).padStart(4, '0')}`;
    
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
    invoiceModal.show();
    
    // Set up print button
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

// ====================== INITIALIZATION ======================
document.addEventListener('DOMContentLoaded', async function() {
    // Initialize modals
    pengembalianModal = new bootstrap.Modal(document.getElementById('pengembalianModal'));
    confirmModal = new bootstrap.Modal(document.getElementById('confirmModal'));
    invoiceModal = new bootstrap.Modal(document.getElementById('invoiceModal'));
    
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

function setupEventListeners() {
    // Peminjaman form
    document.getElementById('formPeminjaman').addEventListener('submit', function(e) {
        e.preventDefault();
        simpanPeminjaman();
    });
    
    document.getElementById('btnReset').addEventListener('click', resetForm);
    
    // Book search
    document.getElementById('judulBuku').addEventListener('input', debounce(searchBukuSuggestions, 300));
    document.getElementById('searchBuku').addEventListener('input', debounce(searchBuku, 300));
    
    // Date calculations
    document.getElementById('tanggalPinjam').addEventListener('change', hitungJatuhTempo);
    document.getElementById('lamaPinjam').addEventListener('change', hitungJatuhTempo);
    
    // Character counter
    document.getElementById('catatan').addEventListener('input', function() {
        document.getElementById('charCount').textContent = this.value.length + '/200';
    });
    
    // Pengembalian
    document.getElementById('modalTanggalKembali').addEventListener('change', function() {
        validateReturnDate();
        previewDenda();
    });
    
    document.getElementById('btnProsesPengembalian').addEventListener('click', prosesPengembalian);
    
    // Riwayat
    document.getElementById('searchPeminjaman').addEventListener('input', debounce(searchPeminjaman, 300));
    document.getElementById('searchRiwayat').addEventListener('input', debounce(searchRiwayat, 300));
    document.getElementById('btnFilter').addEventListener('click', loadRiwayat);
    document.getElementById('btnPrev').addEventListener('click', prevPage);
    document.getElementById('btnNext').addEventListener('click', nextPage);
    
    // Invoice
    document.getElementById('btnCetakInvoice').addEventListener('click', function() {
        window.print();
    });
    
    // Close suggestions when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.search-container')) {
            document.getElementById('bookSuggestions').style.display = 'none';
        }
    });
}

// Make functions available globally for HTML event handlers
window.selectBook = selectBook;
window.showPengembalianModal = showPengembalianModal;
window.selectBookFromTable = selectBookFromTable;
window.showBookDetail = showBookDetail;