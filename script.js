// =============================================
// IMPORTA MODUL FIREBASE (VERSI MODERN)
// =============================================
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  serverTimestamp,
  collection,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  getDocs
} from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getAnalytics, logEvent, setUserId } from "firebase/analytics";

// =============================================
// KONFIGURASI FIREBASE
// =============================================
const firebaseConfig = {
  apiKey: "AIzaSyCCi8CdLNb1O6uEZBpVoeH_3mJhXElBGTU",
  authDomain: "meminjam-buku.firebaseapp.com",
  projectId: "meminjam-buku",
  storageBucket: "meminjam-buku.appspot.com",
  messagingSenderId: "517105835463",
  appId: "1:517105835463:web:90dcc1dfa5d2ffc6e38de2",
  measurementId: "G-KK3XQDMD9G"
};

// =============================================
// INISIALISASI APLIKASI
// =============================================
let app, db, auth, analytics;

try {
  // Inisialisasi Firebase
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  
  // Inisialisasi Analytics hanya di client side
  if (typeof window !== 'undefined') {
    analytics = getAnalytics(app);
    
    // Setel user ID jika sudah login
    onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(analytics, user.uid);
      }
    });
    
    logEvent(analytics, 'app_initialized');
  }
} catch (error) {
  console.error("Firebase initialization failed:", error);
  showFatalError("Aplikasi tidak dapat dimulai. Silakan refresh halaman.");
}

// =============================================
// FUNGSI UTILITAS
// =============================================

/**
 * Menampilkan loading overlay
 * @param {string} message - Pesan yang ditampilkan
 */
function showLoading(message = 'Memuat...') {
  const overlay = document.getElementById('loadingOverlay');
  const textElement = document.getElementById('loadingText');
  
  if (overlay && textElement) {
    textElement.textContent = message;
    overlay.style.display = 'flex';
  }
}

/**
 * Menyembunyikan loading overlay
 */
function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

/**
 * Menampilkan pesan error fatal
 * @param {string} message - Pesan error
 */
function showFatalError(message) {
  const appContainer = document.getElementById('appContainer');
  if (appContainer) {
    appContainer.innerHTML = `
      <div class="alert alert-danger m-4">
        <h4 class="alert-heading">Terjadi Kesalahan</h4>
        <p>${message}</p>
        <button class="btn btn-primary" onclick="window.location.reload()">
          Muat Ulang Halaman
        </button>
      </div>
    `;
  }
}

/**
 * Escape string untuk mencegah XSS
 * @param {string} unsafe - String yang belum di-escape
 * @returns {string} String yang sudah aman
 */
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe.toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Format tanggal menjadi string yang lebih mudah dibaca
 * @param {string|Date} date - Tanggal yang akan diformat
 * @returns {string} Tanggal yang sudah diformat
 */
function formatDate(date) {
  if (!date) return '-';
  
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) return '-';
  
  const options = { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  
  return dateObj.toLocaleDateString('id-ID', options);
}

/**
 * Wrapper untuk log event analytics yang aman
 * @param {string} eventName - Nama event
 * @param {object} eventParams - Parameter event
 */
function safeLogEvent(eventName, eventParams = {}) {
  try {
    if (analytics) {
      logEvent(analytics, eventName, eventParams);
    }
  } catch (error) {
    console.warn("Analytics error:", error);
  }
}

/**
 * Menampilkan alert kepada pengguna
 * @param {string} type - Tipe alert (success, error, info)
 * @param {string} message - Pesan yang ditampilkan
 * @param {number} [duration=5000] - Durasi tampil (ms)
 */
function showAlert(type, message, duration = 5000) {
  const alertContainer = document.getElementById('alertContainer');
  if (!alertContainer) return;
  
  const alertTypes = {
    success: { class: 'success', icon: 'check-circle' },
    error: { class: 'danger', icon: 'exclamation-circle' },
    info: { class: 'info', icon: 'info-circle' }
  };
  
  const config = alertTypes[type] || alertTypes.info;
  
  const alertElement = document.createElement('div');
  alertElement.className = `alert alert-${config.class} alert-dismissible fade show`;
  alertElement.role = 'alert';
  alertElement.innerHTML = `
    <i class="fas fa-${config.icon} me-2"></i>
    ${escapeHtml(message)}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  `;
  
  alertContainer.prepend(alertElement);
  
  // Auto dismiss setelah beberapa detik
  setTimeout(() => {
    const bsAlert = new bootstrap.Alert(alertElement);
    bsAlert.close();
  }, duration);
  
  safeLogEvent('alert_shown', { type, message });
}

// =============================================
// FUNGSI UTAMA APLIKASI
// =============================================

/**
 * Memuat data peminjaman aktif
 */
async function loadActiveLoans() {
  try {
    showLoading('Memuat peminjaman aktif...');
    
    const q = query(
      collection(db, "peminjaman"),
      where("status", "==", "aktif"),
      orderBy("tanggalPinjam", "desc")
    );
    
    const querySnapshot = await getDocs(q);
    const pengembalianBody = document.getElementById('pengembalianBody');
    
    if (!pengembalianBody) {
      throw new Error('Element pengembalianBody tidak ditemukan');
    }
    
    pengembalianBody.innerHTML = '';
    
    if (querySnapshot.empty) {
      pengembalianBody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-muted py-4">
            <i class="fas fa-book-open me-2"></i>
            Tidak ada peminjaman aktif
          </td>
        </tr>
      `;
      return;
    }
    
    querySnapshot.forEach((doc, index) => {
      const data = doc.data();
      const row = `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(data.judulBuku)}</td>
          <td>${escapeHtml(data.pengarang)}</td>
          <td>${escapeHtml(data.namaPeminjam)}</td>
          <td>${formatDate(data.tanggalPinjam)}</td>
          <td>${formatDate(data.jatuhTempo)}</td>
          <td><span class="badge bg-success">Aktif</span></td>
          <td>
            <button class="btn btn-warning btn-sm btn-kembalikan" 
                    data-id="${doc.id}"
                    title="Kembalikan buku">
              <i class="fas fa-book-return me-1"></i> Kembalikan
            </button>
          </td>
        </tr>
      `;
      pengembalianBody.innerHTML += row;
    });
    
    safeLogEvent('active_loans_loaded', { count: querySnapshot.size });
    
  } catch (error) {
    console.error("Error loading active loans:", error);
    showAlert('error', 'Gagal memuat data peminjaman aktif');
    safeLogEvent('load_error', { 
      function: 'loadActiveLoans',
      error: error.message 
    });
  } finally {
    hideLoading();
  }
}

/**
 * Memuat riwayat peminjaman
 */
async function loadLoanHistory() {
  try {
    showLoading('Memuat riwayat peminjaman...');
    
    // Coba query gabungan dulu
    let querySnapshot;
    try {
      const q = query(
        collection(db, "peminjaman"),
        where("status", "in", ["dikembalikan", "terlambat"]),
        orderBy("tanggalPinjam", "desc")
      );
      querySnapshot = await getDocs(q);
    } catch (error) {
      // Fallback ke query terpisah jika error
      if (error.code === 'failed-precondition') {
        const [returned, late] = await Promise.all([
          getDocs(query(
            collection(db, "peminjaman"),
            where("status", "==", "dikembalikan"),
            orderBy("tanggalPinjam", "desc")
          )),
          getDocs(query(
            collection(db, "peminjaman"),
            where("status", "==", "terlambat"),
            orderBy("tanggalPinjam", "desc")
          ))
        ]);
        
        const allDocs = [...returned.docs, ...late.docs];
        allDocs.sort((a, b) => 
          new Date(b.data().tanggalPinjam) - new Date(a.data().tanggalPinjam)
        );
        
        querySnapshot = { docs: allDocs };
        
        // Beri tahu admin untuk membuat index
        const indexUrl = error.message.match(/https:\/\/[^ ]+/)?.[0];
        if (indexUrl) {
          showAlert('info', `Untuk performa lebih baik, <a href="${indexUrl}" target="_blank">buat index Firestore</a>`);
        }
      } else {
        throw error;
      }
    }
    
    const riwayatBody = document.getElementById('riwayatBody');
    if (!riwayatBody) {
      throw new Error('Element riwayatBody tidak ditemukan');
    }
    
    riwayatBody.innerHTML = '';
    
    if (!querySnapshot.docs || querySnapshot.docs.length === 0) {
      riwayatBody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-muted py-4">
            <i class="fas fa-history me-2"></i>
            Tidak ada riwayat peminjaman
          </td>
        </tr>
      `;
      return;
    }
    
    querySnapshot.docs.forEach((doc, index) => {
      const data = doc.data();
      const statusBadge = data.status === 'dikembalikan' 
        ? '<span class="badge bg-success">Dikembalikan</span>' 
        : '<span class="badge bg-warning text-dark">Terlambat</span>';
      
      const row = `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(data.judulBuku)}</td>
          <td>${escapeHtml(data.pengarang)}</td>
          <td>${escapeHtml(data.namaPeminjam)}</td>
          <td>${formatDate(data.tanggalPinjam)}</td>
          <td>${formatDate(data.jatuhTempo)}</td>
          <td>${formatDate(data.tanggalKembali)}</td>
          <td>${statusBadge}</td>
        </tr>
      `;
      riwayatBody.innerHTML += row;
    });
    
    safeLogEvent('loan_history_loaded', { count: querySnapshot.docs.length });
    
  } catch (error) {
    console.error("Error loading loan history:", error);
    showAlert('error', 'Gagal memuat riwayat peminjaman');
    safeLogEvent('load_error', { 
      function: 'loadLoanHistory',
      error: error.message 
    });
  } finally {
    hideLoading();
  }
}

/**
 * Menampilkan modal pengembalian buku
 * @param {string} docId - ID dokumen peminjaman
 */
async function showReturnModal(docId) {
  try {
    showLoading('Menyiapkan pengembalian...');
    
    const docRef = doc(db, "peminjaman", docId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      throw new Error('Data peminjaman tidak ditemukan');
    }
    
    const data = docSnap.data();
    
    // Isi form modal
    document.getElementById('modalJudulBuku').value = escapeHtml(data.judulBuku);
    document.getElementById('modalPengarang').value = escapeHtml(data.pengarang);
    document.getElementById('modalNamaPeminjam').value = escapeHtml(data.namaPeminjam);
    document.getElementById('modalTanggalPinjam').value = formatDate(data.tanggalPinjam);
    document.getElementById('modalJatuhTempo').value = formatDate(data.jatuhTempo);
    
    // Set tanggal kembali hari ini
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('modalTanggalKembali').value = today;
    
    // Simpan docId di tombol proses
    const prosesBtn = document.getElementById('btnProsesPengembalian');
    if (prosesBtn) {
      prosesBtn.dataset.id = docId;
    }
    
    // Tampilkan modal
    const modalElement = document.getElementById('pengembalianModal');
    if (modalElement) {
      const modal = new bootstrap.Modal(modalElement);
      modal.show();
    }
    
    safeLogEvent('return_modal_opened', { book_id: docId });
    
  } catch (error) {
    console.error("Error showing return modal:", error);
    showAlert('error', 'Gagal memuat data pengembalian');
    safeLogEvent('modal_error', { 
      function: 'showReturnModal',
      error: error.message 
    });
  } finally {
    hideLoading();
  }
}

/**
 * Memproses pengembalian buku
 * @param {string} docId - ID dokumen peminjaman
 * @param {string} returnDate - Tanggal pengembalian (format YYYY-MM-DD)
 */
async function processBookReturn(docId, returnDate) {
  try {
    showLoading('Memproses pengembalian...');
    
    // Validasi input
    if (!docId || !returnDate) {
      throw new Error('Data pengembalian tidak lengkap');
    }
    
    const returnDateObj = new Date(returnDate);
    if (isNaN(returnDateObj.getTime())) {
      throw new Error('Format tanggal tidak valid');
    }
    
    const docRef = doc(db, "peminjaman", docId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      throw new Error('Data peminjaman tidak ditemukan');
    }
    
    const data = docSnap.data();
    const dueDate = new Date(data.jatuhTempo);
    const isLate = returnDateObj > dueDate;
    
    // Update data di Firestore
    await updateDoc(docRef, {
      status: isLate ? 'terlambat' : 'dikembalikan',
      tanggalKembali: returnDate,
      returnedAt: serverTimestamp()
    });
    
    // Tutup modal
    const modalElement = document.getElementById('pengembalianModal');
    if (modalElement) {
      const modal = bootstrap.Modal.getInstance(modalElement);
      modal.hide();
    }
    
    // Tampilkan notifikasi
    showAlert('success', `Buku berhasil dikembalikan (${isLate ? 'terlambat' : 'tepat waktu'})`);
    
    // Perbarui data
    await Promise.all([loadActiveLoans(), loadLoanHistory()]);
    
    safeLogEvent('book_returned', { 
      status: isLate ? 'late' : 'on_time',
      book_id: docId,
      return_date: returnDate
    });
    
  } catch (error) {
    console.error("Error processing return:", error);
    showAlert('error', `Gagal memproses pengembalian: ${error.message}`);
    safeLogEvent('return_error', { 
      function: 'processBookReturn',
      error: error.message,
      doc_id: docId 
    });
  } finally {
    hideLoading();
  }
}

/**
 * Menghitung tanggal jatuh tempo
 */
function calculateDueDate() {
  const tanggalPinjam = document.getElementById('tanggalPinjam')?.value;
  const lamaPinjam = document.getElementById('lamaPinjam')?.value;
  
  if (tanggalPinjam && lamaPinjam) {
    const date = new Date(tanggalPinjam);
    const weeks = parseInt(lamaPinjam) || 0;
    date.setDate(date.getDate() + (weeks * 7));
    
    const formattedDate = date.toISOString().split('T')[0];
    const jatuhTempoField = document.getElementById('jatuhTempo');
    if (jatuhTempoField) {
      jatuhTempoField.value = formattedDate;
    }
  }
}

/**
 * Menangani submit form peminjaman
 */
async function handleLoanSubmission(event) {
  event.preventDefault();
  event.stopPropagation();
  
  const form = event.target;
  
  try {
    // Validasi form
    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }
    
    showLoading('Menyimpan data peminjaman...');
    
    // Kumpulkan data form
    const loanData = {
      judulBuku: form.judulBuku.value,
      pengarang: form.pengarang.value,
      tahunTerbit: form.tahunTerbit.value,
      isbn: form.isbn.value,
      kategori: form.kategori.value,
      namaPeminjam: form.namaPeminjam.value,
      noHp: form.noHp.value,
      tanggalPinjam: form.tanggalPinjam.value,
      lamaPinjam: parseInt(form.lamaPinjam.value),
      jatuhTempo: form.jatuhTempo.value,
      catatan: form.catatan.value,
      status: 'aktif',
      tanggalKembali: null,
      createdAt: serverTimestamp()
    };
    
    // Validasi data
    if (!loanData.judulBuku || !loanData.namaPeminjam || !loanData.tanggalPinjam) {
      throw new Error('Data peminjaman tidak lengkap');
    }
    
    // Simpan ke Firestore
    const docRef = await addDoc(collection(db, "peminjaman"), loanData);
    
    // Reset form
    form.reset();
    form.classList.remove('was-validated');
    document.getElementById('charCount').textContent = '0';
    
    // Tampilkan notifikasi
    showAlert('success', 'Peminjaman berhasil dicatat!');
    
    // Perbarui daftar peminjaman
    await loadActiveLoans();
    
    safeLogEvent('loan_created', {
      book_title: loanData.judulBuku,
      borrower: loanData.namaPeminjam,
      loan_duration: loanData.lamaPinjam
    });
    
  } catch (error) {
    console.error("Error submitting loan:", error);
    showAlert('error', 'Gagal menyimpan peminjaman: ' + error.message);
    safeLogEvent('loan_error', { 
      function: 'handleLoanSubmission',
      error: error.message 
    });
  } finally {
    hideLoading();
  }
}

// =============================================
// INISIALISASI EVENT LISTENER
// =============================================

/**
 * Menginisialisasi semua event listener
 */
function initializeEventListeners() {
  // Event delegation untuk tombol kembalikan
  document.getElementById('pengembalianBody')?.addEventListener('click', (e) => {
    const returnBtn = e.target.closest('.btn-kembalikan');
    if (returnBtn) {
      showReturnModal(returnBtn.dataset.id);
    }
  });
  
  // Tombol proses pengembalian di modal
  document.getElementById('btnProsesPengembalian')?.addEventListener('click', () => {
    const docId = document.getElementById('btnProsesPengembalian')?.dataset.id;
    const returnDate = document.getElementById('modalTanggalKembali')?.value;
    
    if (docId && returnDate) {
      processBookReturn(docId, returnDate);
    } else {
      showAlert('error', 'Data pengembalian tidak lengkap');
    }
  });
  
  // Form peminjaman
  const loanForm = document.getElementById('formPeminjaman');
  if (loanForm) {
    loanForm.addEventListener('submit', handleLoanSubmission);
  }
  
  // Hitung jatuh tempo saat input berubah
  document.getElementById('tanggalPinjam')?.addEventListener('change', calculateDueDate);
  document.getElementById('lamaPinjam')?.addEventListener('change', calculateDueDate);
  
  // Hitung karakter catatan
  document.getElementById('catatan')?.addEventListener('input', function() {
    const charCount = this.value.length;
    const counter = document.getElementById('charCount');
    if (counter) {
      counter.textContent = charCount;
    }
  });
  
  // Tab Bootstrap
  const tabEls = document.querySelectorAll('[data-bs-toggle="tab"]');
  tabEls.forEach(tabEl => {
    tabEl.addEventListener('click', function(e) {
      e.preventDefault();
      const tab = new bootstrap.Tab(this);
      tab.show();
      
      // Muat data sesuai tab yang aktif
      if (this.getAttribute('href') === '#pengembalian') {
        loadActiveLoans();
      } else if (this.getAttribute('href') === '#riwayat') {
        loadLoanHistory();
      }
    });
  });
  
  // Tombol refresh
  document.getElementById('btnRefresh')?.addEventListener('click', () => {
    const activeTab = document.querySelector('.nav-link.active');
    if (activeTab?.getAttribute('href') === '#pengembalian') {
      loadActiveLoans();
    } else if (activeTab?.getAttribute('href') === '#riwayat') {
      loadLoanHistory();
    }
  });
  
  // Pencarian peminjaman aktif
  document.getElementById('searchPeminjaman')?.addEventListener('input', function() {
    const keyword = this.value.toLowerCase();
    const rows = document.querySelectorAll('#pengembalianBody tr');
    
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(keyword) ? '' : 'none';
    });
  });
  
  // Filter riwayat
  document.getElementById('btnFilterRiwayat')?.addEventListener('click', async () => {
    const dariTanggal = document.getElementById('filterDari')?.value;
    const sampaiTanggal = document.getElementById('filterSampai')?.value;
    const keyword = document.getElementById('searchRiwayat')?.value.toLowerCase();
    
    try {
      showLoading('Menerapkan filter...');
      
      let q = query(
        collection(db, "peminjaman"),
        where("status", "in", ["dikembalikan", "terlambat"])
      );
      
      // Tambahkan filter tanggal jika ada
      if (dariTanggal && sampaiTanggal) {
        q = query(q, 
          where("tanggalPinjam", ">=", dariTanggal),
          where("tanggalPinjam", "<=", sampaiTanggal)
        );
      }
      
      // Urutkan berdasarkan tanggal
      q = query(q, orderBy("tanggalPinjam", "desc"));
      
      const querySnapshot = await getDocs(q);
      const riwayatBody = document.getElementById('riwayatBody');
      
      if (!riwayatBody) return;
      
      riwayatBody.innerHTML = '';
      
      if (querySnapshot.empty) {
        riwayatBody.innerHTML = `
          <tr>
            <td colspan="8" class="text-center text-muted py-4">
              Tidak ada data dengan filter yang dipilih
            </td>
          </tr>
        `;
        return;
      }
      
      querySnapshot.forEach((doc, index) => {
        const data = doc.data();
        
        // Filter berdasarkan keyword jika ada
        if (keyword && 
            !data.judulBuku.toLowerCase().includes(keyword) && 
            !data.pengarang.toLowerCase().includes(keyword) && 
            !data.namaPeminjam.toLowerCase().includes(keyword)) {
          return;
        }
        
        const statusBadge = data.status === 'dikembalikan' 
          ? '<span class="badge bg-success">Dikembalikan</span>' 
          : '<span class="badge bg-warning text-dark">Terlambat</span>';
        
        const row = `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(data.judulBuku)}</td>
            <td>${escapeHtml(data.pengarang)}</td>
            <td>${escapeHtml(data.namaPeminjam)}</td>
            <td>${formatDate(data.tanggalPinjam)}</td>
            <td>${formatDate(data.jatuhTempo)}</td>
            <td>${formatDate(data.tanggalKembali)}</td>
            <td>${statusBadge}</td>
          </tr>
        `;
        riwayatBody.innerHTML += row;
      });
      
      safeLogEvent('history_filtered', {
        from_date: dariTanggal || 'none',
        to_date: sampaiTanggal || 'none',
        keyword: keyword || 'none'
      });
      
    } catch (error) {
      console.error("Error filtering history:", error);
      showAlert('error', 'Gagal menerapkan filter');
      safeLogEvent('filter_error', { 
        function: 'filterHistory',
        error: error.message 
      });
    } finally {
      hideLoading();
    }
  });
}

// =============================================
// INISIALISASI APLIKASI SAAT DOM SIAP
// =============================================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Inisialisasi event listeners
    initializeEventListeners();
    
    // Muat data awal
    await loadActiveLoans();
    
    // Log event
    safeLogEvent('page_view');
    
  } catch (error) {
    console.error("Initialization error:", error);
    showAlert('error', 'Gagal memuat aplikasi');
    safeLogEvent('init_error', { error: error.message });
  } finally {
    hideLoading();
  }
});

// Ekspor fungsi untuk testing (jika diperlukan)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    escapeHtml,
    formatDate,
    calculateDueDate
  };
}