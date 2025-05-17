// ====================== GLOBAL CONSTANTS ======================
const DENDA_PER_HARI = 5000;
const ITEMS_PER_PAGE = 10;

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCCi8CdLNb1O6uEZBpVoeH_3mJhXElBGTU",
    authDomain: "meminjam-buku.firebaseapp.com",
    projectId: "meminjam-buku",
    storageBucket: "meminjam-buku.appspot.com",
    messagingSenderId: "517105835463",
    appId: "1:517105835463:web:90dcc1dfa5d2ffc6e38de2",
    measurementId: "G-KK3XQDMD9G"
};

// ====================== INITIALIZATION ======================
// Tambahkan favicon secara dinamis sebelum inisialisasi Firebase
const addDynamicFavicon = () => {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📚</text></svg>';
    document.head.appendChild(link);
};

addDynamicFavicon();

// Inisialisasi Firebase dengan error handling
let app, db;

try {
    app = firebase.initializeApp(firebaseConfig);
    
    // Konfigurasi Firestore untuk kompatibilitas browser modern
    const settings = {
        experimentalForceLongPolling: true, // Untuk mengatasi masalah WebChannel
        merge: true
    };
    
    db = firebase.firestore();
    db.settings(settings);
    
    // Aktifkan persistence dengan error handling
    firebase.firestore().enablePersistence()
        .catch((err) => {
            if (err.code === 'failed-precondition') {
                console.warn("Persistence hanya bisa diaktifkan di satu tab saja");
            } else if (err.code === 'unimplemented') {
                console.warn("Browser ini tidak mendukung semua fitur persistence");
            }
        });
} catch (error) {
    console.error("Error inisialisasi Firebase:", error);
    // Fallback jika Firebase gagal diinisialisasi
    db = {
        collection: () => ({
            where: () => ({
                orderBy: () => ({
                    get: () => Promise.resolve({ docs: [] })
                })
            }),
            doc: () => ({
                update: () => Promise.resolve(),
                get: () => Promise.resolve({ exists: false })
            }),
            add: () => Promise.resolve({ id: 'offline-' + Date.now() })
        })
    };
    showAlert('warning', 'Aplikasi berjalan dalam mode offline terbatas');
}

// ====================== GLOBAL VARIABLES ======================
let bukuList = [];
let peminjamanList = [];
let riwayatList = [];
let currentInvoice = null;
let currentPage = 1;
let reportChart = null;

// ====================== MAIN INITIALIZATION ======================
document.addEventListener('DOMContentLoaded', async function() {
    // Inisialisasi komponen UI
    const pengembalianModal = new bootstrap.Modal(document.getElementById('pengembalianModal'));
    const confirmModal = new bootstrap.Modal(document.getElementById('confirmModal'));
    const invoiceModal = new bootstrap.Modal(document.getElementById('invoiceModal'));
    
    // Set tanggal default
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('tanggalPinjam').value = today;
    document.getElementById('modalTanggalKembali').value = today;
    document.getElementById('filterDari').value = getFirstDayOfMonth();
    document.getElementById('filterSampai').value = today;
    
    // Setup event listeners
    setupEventListeners();
    
    // Load data awal dengan error handling
    try {
        await Promise.all([loadPeminjaman(), loadRiwayat()]);
    } catch (error) {
        console.error("Error loading initial data:", error);
        showAlert('error', 'Gagal memuat data awal. Silakan refresh halaman.');
    }
});

// ====================== IMPROVED FIREBASE FUNCTIONS ======================
async function loadPeminjaman() {
    showLoading('Memuat data peminjaman...');
    try {
        // Coba ambil data dari server
        const snapshot = await db.collection('peminjaman')
            .where('tanggal_kembali', '==', null)
            .orderBy('tanggal_pinjam', 'desc')
            .get();
        
        peminjamanList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateTabelPengembalian();
    } catch (error) {
        console.error("Error loading loans:", error);
        
        // Fallback 1: Coba ambil dari cache
        try {
            const cached = await db.collection('peminjaman')
                .where('tanggal_kembali', '==', null)
                .orderBy('tanggal_pinjam', 'desc')
                .get({ source: 'cache' });
            
            peminjamanList = cached.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            updateTabelPengembalian();
            showAlert('warning', 'Menggunakan data offline');
        } catch (cacheError) {
            console.error("Cache error:", cacheError);
            // Fallback 2: Gunakan array kosong
            peminjamanList = [];
            updateTabelPengembalian();
            showAlert('error', 'Gagal memuat data peminjaman');
        }
    } finally {
        hideLoading();
    }
}

async function loadRiwayat() {
    showLoading('Memuat riwayat...');
    try {
        let query = db.collection('peminjaman').orderBy('tanggal_pinjam', 'desc');

        // Filter tanggal
        const dari = document.getElementById('filterDari').value;
        const sampai = document.getElementById('filterSampai').value;
        if (dari && sampai) {
            query = query.where('tanggal_pinjam', '>=', dari)
                        .where('tanggal_pinjam', '<=', sampai);
        }

        const snapshot = await query.get();
        riwayatList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        document.getElementById('totalData').textContent = riwayatList.length;
        updateRiwayatTable();
        updatePagination();
    } catch (error) {
        console.error("Error loading history:", error);
        showAlert('error', 'Gagal memuat riwayat');
    } finally {
        hideLoading();
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    // Initialize Bootstrap components
    let pengembalianModal = new bootstrap.Modal(document.getElementById('pengembalianModal'));
    let confirmModal = new bootstrap.Modal(document.getElementById('confirmModal'));
    let invoiceModal = new bootstrap.Modal(document.getElementById('invoiceModal'));
    
    // Set today as default date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('tanggalPinjam').value = today;
    document.getElementById('modalTanggalKembali').value = today;
    
    // Set first day of month as default filter
    document.getElementById('filterDari').value = getFirstDayOfMonth();
    document.getElementById('filterSampai').value = today;
    
    // Setup event listeners
    setupEventListeners();
    
    // Load initial data
    await loadPeminjaman();
    await loadRiwayat();
});

function setupEventListeners() {
    // Peminjaman form
    document.getElementById('formPeminjaman').addEventListener('submit', function(e) {
        e.preventDefault();
        simpanPeminjaman();
    });
    
    document.getElementById('btnReset').addEventListener('click', resetForm);
    
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
    
    // Book detail modal borrow button
    document.getElementById('btnBorrowFromDetail').addEventListener('click', function() {
        const book = {
            judul: document.getElementById('detailJudul').textContent,
            pengarang: document.getElementById('detailPengarang').textContent,
            tahun: document.getElementById('detailTahun').textContent,
            kategori: document.getElementById('detailKategori').textContent,
            isbn: document.getElementById('detailISBN').textContent || 'ISBN-' + Math.random().toString(36).substr(2, 8).toUpperCase()
        };
        
        selectBookFromTable(book.judul, book.pengarang, book.tahun, book.kategori, book.isbn);
        bootstrap.Modal.getInstance(document.getElementById('bookDetailModal')).hide();
    });
}

function selectBookFromTable(judul, pengarang, tahun, kategori, isbn) {
    document.getElementById('bookId').value = 'book-' + Math.random().toString(36).substr(2, 9);
    document.getElementById('judulBuku').value = judul;
    document.getElementById('pengarang').value = pengarang;
    document.getElementById('tahunTerbit').value = tahun;
    document.getElementById('kategori').value = kategori;
    document.getElementById('isbn').value = isbn;
    
    showAlert('success', `Buku "${judul}" telah dipilih`);
}

function showBookDetail(judul, pengarang, tahun, kategori, isbn, deskripsi) {
    document.getElementById('detailJudul').textContent = judul;
    document.getElementById('detailPengarang').textContent = pengarang;
    document.getElementById('detailTahun').textContent = tahun;
    document.getElementById('detailKategori').textContent = kategori;
    document.getElementById('detailISBN').textContent = isbn;
    document.getElementById('detailDeskripsi').textContent = deskripsi || '-';
    
    const modal = new bootstrap.Modal(document.getElementById('bookDetailModal'));
    modal.show();
}

// ====================== VALIDATION FUNCTIONS ======================
function validateReturnDate() {
    const returnDateInput = document.getElementById('modalTanggalKembali');
    const returnDate = new Date(returnDateInput.value);
    const borrowDate = new Date(currentInvoice.tanggal_pinjam);
    
    if (returnDate < borrowDate) {
        returnDateInput.setCustomValidity('Tanggal kembali tidak boleh lebih awal dari tanggal pinjam');
        showAlert('error', 'Tanggal kembali tidak valid: tidak boleh lebih awal dari tanggal pinjam');
    } else {
        returnDateInput.setCustomValidity('');
    }
    
    returnDateInput.reportValidity();
}

// ====================== LOAN FUNCTIONS ======================
async function loadPeminjaman() {
    showLoading('Memuat data peminjaman...');
    try {
        const snapshot = await db.collection('peminjaman')
            .where('tanggal_kembali', '==', null)
            .orderBy('tanggal_pinjam', 'desc')
            .get()
            .catch(error => {
                console.error("Firestore error:", error);
                showAlert('error', 'Gagal terhubung ke database. Cek koneksi internet Anda.');
                return { docs: [] };
            });

        peminjamanList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
    const filteredLoans = peminjamanList.filter(loan => 
        loan.judul_buku.toLowerCase().includes(searchTerm) ||
        loan.nama_peminjam.toLowerCase().includes(searchTerm)
    );
    updateTabelPengembalian(filteredLoans);
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

    const book = {
        judul: document.getElementById('judulBuku').value,
        pengarang: document.getElementById('pengarang').value,
        tahun_terbit: document.getElementById('tahunTerbit').value,
        kategori: document.getElementById('kategori').value,
        isbn: document.getElementById('isbn').value
    };

    const loanData = {
        kode_buku: bookId,
        judul_buku: book.judul,
        pengarang: book.pengarang,
        nama_peminjam: document.getElementById('namaPeminjam').value.trim(),
        no_hp: document.getElementById('noHp').value.trim(),
        tanggal_pinjam: document.getElementById('tanggalPinjam').value,
        jatuh_tempo: hitungJatuhTempo(),
        lama_pinjam: document.getElementById('lamaPinjam').value,
        status: 'Dipinjam',
        catatan: document.getElementById('catatan').value.trim(),
        tanggal_kembali: null,
        hari_telat: 0,
        denda: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    showLoading('Menyimpan peminjaman...');
    try {
        const docRef = await db.collection('peminjaman').add(loanData);
        
        showAlert('success', 'Peminjaman berhasil disimpan!');
        
        // Show invoice after successful submission
        setTimeout(() => {
            showInvoice({ id: docRef.id, ...loanData });
        }, 500);
        
        resetForm();
        await loadPeminjaman();
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

        await db.collection('peminjaman').doc(currentInvoice.id).update(updateData);

        pengembalianModal.hide();
        
        // Show invoice if there's a late fee
        if (updateData.denda > 0) {
            setTimeout(() => {
                showInvoice({ ...currentInvoice, ...updateData }, true);
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
    const invoiceNumber = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(loanData.id).substr(0, 4)}`;
    
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
        let query = db.collection('peminjaman')
            .orderBy('tanggal_pinjam', 'desc');

        // Filter tanggal
        const dari = document.getElementById('filterDari').value;
        const sampai = document.getElementById('filterSampai').value;
        if (dari && sampai) {
            query = query.where('tanggal_pinjam', '>=', dari)
                        .where('tanggal_pinjam', '<=', sampai);
        }

        // Pencarian
        const searchTerm = document.getElementById('searchRiwayat').value.toLowerCase();
        if (searchTerm) {
            // Firestore doesn't support OR queries directly, so we'll filter client-side
            const snapshot = await query.get();
            riwayatList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(loan => 
                    loan.nama_peminjam.toLowerCase().includes(searchTerm) ||
                    loan.judul_buku.toLowerCase().includes(searchTerm)
                );
        } else {
            const snapshot = await query.get();
            riwayatList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        document.getElementById('totalData').textContent = riwayatList.length;
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
window.selectBookFromTable = selectBookFromTable;
window.showPengembalianModal = showPengembalianModal;
window.showBookDetail = showBookDetail;