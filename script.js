import firebase from "firebase/compat/app";
import "firebase/compat/analytics";
import "firebase/compat/firestore";
import "firebase/compat/auth";

const firebaseConfig = {
    apiKey: "AIzaSyCCi8CdLNb1O6uEZBpVoeH_3mJhXElBGTU",
    authDomain: "meminjam-buku.firebaseapp.com",
    projectId: "meminjam-buku",
    storageBucket: "meminjam-buku.appspot.com",
    messagingSenderId: "517105835463",
    appId: "1:517105835463:web:90dcc1dfa5d2ffc6e38de2",
    measurementId: "G-KK3XQDMD9G"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const analytics = firebase.analytics();
const db = firebase.firestore();
const auth = firebase.auth();

// Fungsi untuk menampilkan alert
function showAlert(type, message) {
    const alertClass = type === 'error' ? 'danger' : 'success';
    const icon = type === 'error' ? 'exclamation-circle' : 'check-circle';
    
    const alertHTML = `
        <div class="alert alert-${alertClass} alert-dismissible fade show" role="alert">
            <i class="fas fa-${icon} me-2"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;
    
    document.getElementById('alertContainer').innerHTML = alertHTML;
    
    // Sembunyikan alert setelah 5 detik
    setTimeout(() => {
        const alerts = document.querySelectorAll('.alert');
        alerts.forEach(alert => {
            new bootstrap.Alert(alert).close();
        });
    }, 5000);
}

// Fungsi untuk memuat data peminjaman aktif
async function loadActiveLoans() {
    try {
        const querySnapshot = await db.collection("peminjaman")
            .where("status", "==", "aktif")
            .get();
            
        const pengembalianBody = document.getElementById('pengembalianBody');
        pengembalianBody.innerHTML = '';
        
        querySnapshot.forEach((doc, index) => {
            const data = doc.data();
            const row = `
                <tr>
                    <td>${index + 1}</td>
                    <td>${data.judulBuku}</td>
                    <td>${data.pengarang}</td>
                    <td>${data.namaPeminjam}</td>
                    <td>${data.tanggalPinjam}</td>
                    <td>${data.jatuhTempo}</td>
                    <td><span class="badge bg-success">Aktif</span></td>
                    <td><button class="btn btn-warning btn-sm btn-kembalikan" data-id="${doc.id}">Kembalikan</button></td>
                </tr>
            `;
            pengembalianBody.innerHTML += row;
        });
        
        // Tambahkan event listener untuk tombol kembalikan
        document.querySelectorAll('.btn-kembalikan').forEach(button => {
            button.addEventListener('click', function() {
                const docId = this.getAttribute('data-id');
                showReturnModal(docId);
            });
        });
    } catch (error) {
        console.error("Error loading active loans: ", error);
        showAlert('error', 'Gagal memuat data peminjaman aktif');
    }
}

// Fungsi untuk memuat riwayat peminjaman
async function loadLoanHistory() {
    try {
        const querySnapshot = await db.collection("peminjaman")
            .where("status", "in", ["dikembalikan", "terlambat"])
            .orderBy("tanggalPinjam", "desc")
            .get();
            
        const riwayatBody = document.getElementById('riwayatBody');
        riwayatBody.innerHTML = '';
        
        querySnapshot.forEach((doc, index) => {
            const data = doc.data();
            const statusBadge = data.status === 'dikembalikan' ? 
                '<span class="badge bg-success">Dikembalikan</span>' : 
                '<span class="badge bg-warning text-dark">Terlambat</span>';
            
            const row = `
                <tr>
                    <td>${index + 1}</td>
                    <td>${data.judulBuku}</td>
                    <td>${data.pengarang}</td>
                    <td>${data.namaPeminjam}</td>
                    <td>${data.tanggalPinjam}</td>
                    <td>${data.jatuhTempo}</td>
                    <td>${data.tanggalKembali || '-'}</td>
                    <td>${statusBadge}</td>
                </tr>
            `;
            riwayatBody.innerHTML += row;
        });
    } catch (error) {
        console.error("Error loading loan history: ", error);
        showAlert('error', 'Gagal memuat riwayat peminjaman');
    }
}

// Fungsi untuk menampilkan modal pengembalian
async function showReturnModal(docId) {
    try {
        const doc = await db.collection("peminjaman").doc(docId).get();
        
        if (doc.exists) {
            const data = doc.data();
            
            document.getElementById('modalJudulBuku').value = data.judulBuku;
            document.getElementById('modalPengarang').value = data.pengarang;
            document.getElementById('modalNamaPeminjam').value = data.namaPeminjam;
            document.getElementById('modalTanggalPinjam').value = data.tanggalPinjam;
            document.getElementById('modalJatuhTempo').value = data.jatuhTempo;
            
            // Set tanggal kembali hari ini
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('modalTanggalKembali').value = today;
            
            // Simpan docId di tombol proses
            const prosesBtn = document.getElementById('btnProsesPengembalian');
            prosesBtn.setAttribute('data-id', docId);
            
            // Tampilkan modal
            const modal = new bootstrap.Modal(document.getElementById('pengembalianModal'));
            modal.show();
        } else {
            showAlert('error', 'Dokumen tidak ditemukan');
        }
    } catch (error) {
        console.error("Error getting document:", error);
        showAlert('error', 'Gagal memuat data peminjaman');
    }
}

// Fungsi untuk menghitung jatuh tempo
function hitungJatuhTempo() {
    const tanggalPinjam = document.getElementById('tanggalPinjam').value;
    const lamaPinjam = document.getElementById('lamaPinjam').value;
    
    if (tanggalPinjam && lamaPinjam) {
        const date = new Date(tanggalPinjam);
        date.setDate(date.getDate() + (lamaPinjam * 7));
        
        const formattedDate = date.toISOString().split('T')[0];
        document.getElementById('jatuhTempo').value = formattedDate;
    }
}

// Fungsi untuk menginisialisasi event listeners
function initializeEventListeners() {
    // Tangani klik tombol pinjam
    document.querySelectorAll('.btn-pinjam').forEach(button => {
        button.addEventListener('click', function() {
            const judul = this.getAttribute('data-judul');
            const pengarang = this.getAttribute('data-pengarang');
            const tahun = this.getAttribute('data-tahun');
            const kategori = this.getAttribute('data-kategori');
            const isbn = this.getAttribute('data-isbn');
            
            document.getElementById('judulBuku').value = judul;
            document.getElementById('pengarang').value = pengarang;
            document.getElementById('tahunTerbit').value = tahun;
            document.getElementById('kategori').value = kategori;
            document.getElementById('isbn').value = isbn;
            
            // Scroll ke form peminjaman
            document.getElementById('formPeminjaman').scrollIntoView({ behavior: 'smooth' });
            
            // Log event analytics
            analytics.logEvent('select_book', {
                book_title: judul,
                author: pengarang,
                category: kategori
            });
        });
    });
    
    // Tangani perubahan tanggal pinjam dan lama pinjam
    document.getElementById('tanggalPinjam').addEventListener('change', hitungJatuhTempo);
    document.getElementById('lamaPinjam').addEventListener('change', hitungJatuhTempo);
    
    // Hitung karakter untuk textarea catatan
    document.getElementById('catatan').addEventListener('input', function() {
        const charCount = this.value.length;
        document.getElementById('charCount').textContent = charCount;
    });
    
    // Validasi form peminjaman
    document.getElementById('formPeminjaman').addEventListener('submit', async function(event) {
        event.preventDefault();
        event.stopPropagation();
        
        if (this.checkValidity()) {
            try {
                // Tampilkan loading
                document.getElementById('loadingOverlay').style.display = 'flex';
                document.getElementById('loadingText').textContent = 'Menyimpan data peminjaman...';
                
                // Ambil data dari form
                const peminjamanData = {
                    judulBuku: document.getElementById('judulBuku').value,
                    pengarang: document.getElementById('pengarang').value,
                    tahunTerbit: document.getElementById('tahunTerbit').value,
                    isbn: document.getElementById('isbn').value,
                    kategori: document.getElementById('kategori').value,
                    namaPeminjam: document.getElementById('namaPeminjam').value,
                    noHp: document.getElementById('noHp').value,
                    tanggalPinjam: document.getElementById('tanggalPinjam').value,
                    lamaPinjam: document.getElementById('lamaPinjam').value,
                    jatuhTempo: document.getElementById('jatuhTempo').value,
                    catatan: document.getElementById('catatan').value,
                    status: 'aktif',
                    tanggalKembali: null,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                // Simpan ke Firestore
                await db.collection("peminjaman").add(peminjamanData);
                
                // Tampilkan alert sukses
                showAlert('success', 'Peminjaman buku berhasil disimpan');
                
                // Reset form
                this.reset();
                this.classList.remove('was-validated');
                document.getElementById('charCount').textContent = '0';
                
                // Perbarui daftar peminjaman aktif
                await loadActiveLoans();
                
                // Log event analytics
                analytics.logEvent('loan_success', {
                    book_title: peminjamanData.judulBuku,
                    borrower: peminjamanData.namaPeminjam
                });
            } catch (error) {
                console.error("Error adding document: ", error);
                showAlert('error', 'Gagal menyimpan peminjaman');
                
                // Log event analytics
                analytics.logEvent('loan_failed', {
                    error: error.message
                });
            } finally {
                // Sembunyikan loading
                document.getElementById('loadingOverlay').style.display = 'none';
            }
        } else {
            this.classList.add('was-validated');
        }
    });
    
    // Tombol reset form
    document.getElementById('btnReset').addEventListener('click', function() {
        document.getElementById('formPeminjaman').reset();
        document.getElementById('formPeminjaman').classList.remove('was-validated');
        document.getElementById('charCount').textContent = '0';
    });
    
    // Proses pengembalian
    document.getElementById('btnProsesPengembalian').addEventListener('click', async function() {
        const modalTanggalKembali = document.getElementById('modalTanggalKembali');
        const docId = this.getAttribute('data-id');
        
        if (!modalTanggalKembali.value) {
            modalTanggalKembali.classList.add('is-invalid');
            return;
        }
        
        modalTanggalKembali.classList.remove('is-invalid');
        
        try {
            // Tampilkan loading
            document.getElementById('loadingOverlay').style.display = 'flex';
            document.getElementById('loadingText').textContent = 'Memproses pengembalian...';
            
            // Hitung status berdasarkan tanggal
            const tanggalKembali = new Date(modalTanggalKembali.value);
            const jatuhTempo = new Date(document.getElementById('modalJatuhTempo').value);
            const status = tanggalKembali > jatuhTempo ? 'terlambat' : 'dikembalikan';
            
            // Update data di Firestore
            await db.collection("peminjaman").doc(docId).update({
                status: status,
                tanggalKembali: modalTanggalKembali.value,
                returnedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Sembunyikan modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('pengembalianModal'));
            modal.hide();
            
            // Tampilkan alert sukses
            showAlert('success', 'Pengembalian buku berhasil diproses');
            
            // Perbarui daftar
            await loadActiveLoans();
            await loadLoanHistory();
            
            // Log event analytics
            analytics.logEvent('return_success', {
                status: status
            });
        } catch (error) {
            console.error("Error updating document: ", error);
            showAlert('error', 'Gagal memproses pengembalian');
            
            // Log event analytics
            analytics.logEvent('return_failed', {
                error: error.message
            });
        } finally {
            // Sembunyikan loading
            document.getElementById('loadingOverlay').style.display = 'none';
        }
    });
    
    // Filter riwayat peminjaman
    document.getElementById('btnFilter').addEventListener('click', async function() {
        const dariTanggal = document.getElementById('filterDari').value;
        const sampaiTanggal = document.getElementById('filterSampai').value;
        const keyword = document.getElementById('searchRiwayat').value.toLowerCase();
        
        try {
            // Tampilkan loading
            document.getElementById('loadingOverlay').style.display = 'flex';
            document.getElementById('loadingText').textContent = 'Memfilter data...';
            
            let query = db.collection("peminjaman")
                .where("status", "in", ["dikembalikan", "terlambat"]);
            
            // Tambahkan filter tanggal jika ada
            if (dariTanggal && sampaiTanggal) {
                query = query.where("tanggalPinjam", ">=", dariTanggal)
                            .where("tanggalPinjam", "<=", sampaiTanggal);
            }
            
            const querySnapshot = await query.orderBy("tanggalPinjam", "desc").get();
            
            const riwayatBody = document.getElementById('riwayatBody');
            riwayatBody.innerHTML = '';
            
            querySnapshot.forEach((doc, index) => {
                const data = doc.data();
                
                // Filter berdasarkan keyword jika ada
                if (keyword && 
                    !data.judulBuku.toLowerCase().includes(keyword) && 
                    !data.pengarang.toLowerCase().includes(keyword) && 
                    !data.namaPeminjam.toLowerCase().includes(keyword)) {
                    return;
                }
                
                const statusBadge = data.status === 'dikembalikan' ? 
                    '<span class="badge bg-success">Dikembalikan</span>' : 
                    '<span class="badge bg-warning text-dark">Terlambat</span>';
                
                const row = `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${data.judulBuku}</td>
                        <td>${data.pengarang}</td>
                        <td>${data.namaPeminjam}</td>
                        <td>${data.tanggalPinjam}</td>
                        <td>${data.jatuhTempo}</td>
                        <td>${data.tanggalKembali || '-'}</td>
                        <td>${statusBadge}</td>
                    </tr>
                `;
                riwayatBody.innerHTML += row;
            });
        } catch (error) {
            console.error("Error filtering loan history: ", error);
            showAlert('error', 'Gagal memfilter riwayat peminjaman');
        } finally {
            // Sembunyikan loading
            document.getElementById('loadingOverlay').style.display = 'none';
        }
    });
    
    // Pencarian peminjaman aktif
    document.getElementById('searchPeminjaman').addEventListener('input', function() {
        const keyword = this.value.toLowerCase();
        const rows = document.querySelectorAll('#pengembalianBody tr');
        
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            if (text.includes(keyword)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    });
}

// Fungsi untuk inisialisasi aplikasi
async function initializeApp() {
    try {
        // Sembunyikan loading overlay setelah inisialisasi selesai
        setTimeout(() => {
            document.getElementById('loadingOverlay').style.display = 'none';
        }, 1000);
        
        // Inisialisasi event listeners
        initializeEventListeners();
        
        // Muat data awal
        await loadActiveLoans();
        await loadLoanHistory();
        
        // Log event analytics
        analytics.logEvent('page_view');
    } catch (error) {
        console.error("Error initializing app: ", error);
        showAlert('error', 'Gagal memuat aplikasi');
    }
}

// Jalankan inisialisasi ketika DOM siap
document.addEventListener('DOMContentLoaded', initializeApp);