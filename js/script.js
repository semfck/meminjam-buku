// ====================== SUPABASE INITIALIZATION ======================
const SUPABASE_URL = 'https://xqnlchcbxekwulncjvfy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxbmxjaGNieGVrd3VsbmNqdmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzI3NzE3OSwiZXhwIjoyMDYyODUzMTc5fQ.cdPk3YnDIdNzkCxmhsv5Tlk_Tc9oYIikY_POz1OcrNY';
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ====================== GLOBAL CONSTANTS ======================
const DENDA_PER_HARI = 5000;
const ITEMS_PER_PAGE = 10;

// ====================== GLOBAL VARIABLES ======================
let peminjamanList = [];
let riwayatList = [];
let currentInvoice = null;
let currentPage = 1;

// ====================== INITIALIZATION ======================
document.addEventListener('DOMContentLoaded', function() {
  initializeDateInputs();
  setupEventListeners();
  loadInitialData();
  showWelcomeMessage();
});

function initializeDateInputs() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('tanggalPinjam').value = today;
  document.getElementById('modalTanggalKembali').value = today;
  document.getElementById('filterDari').value = getFirstDayOfMonth();
  document.getElementById('filterSampai').value = today;
}

// Fungsi yang diperbaiki untuk mendapatkan tanggal awal bulan
function getFirstDayOfMonth() {
  const date = new Date();
  return new Date(date.getFullYear(), date.getMonth(), 2).toISOString().split('T')[0];
}

async function loadInitialData() {
  await loadPeminjaman();
  await loadRiwayat();
}

// ====================== EVENT LISTENERS SETUP ======================
function setupEventListeners() {
  // Peminjaman
  document.getElementById('lamaPinjam').addEventListener('change', hitungJatuhTempo);
  document.getElementById('tanggalPinjam').addEventListener('change', hitungJatuhTempo);
  document.getElementById('formPeminjaman').addEventListener('submit', handleSubmitPeminjaman);
  
  // Pengembalian
  document.getElementById('btnProsesPengembalian').addEventListener('click', prosesPengembalian);
  document.getElementById('searchPeminjaman').addEventListener('input', debounce(searchPeminjaman, 300));
  
  // Riwayat
  document.getElementById('btnFilter').addEventListener('click', () => loadRiwayat());
  document.getElementById('searchRiwayat').addEventListener('input', debounce(searchRiwayat, 300));
  document.getElementById('btnPrev').addEventListener('click', prevPage);
  document.getElementById('btnNext').addEventListener('click', nextPage);
}

// ====================== PEMINJAMAN FUNCTIONS ======================
function handleSubmitPeminjaman(e) {
  e.preventDefault();
  processPeminjaman();
}

async function processPeminjaman() {
  const form = document.getElementById('formPeminjaman');
  
  if (!form.checkValidity()) {
    form.classList.add('was-validated');
    showAlert('error', 'Harap isi semua field yang wajib!');
    return;
  }
  
  showLoading('Menyimpan data peminjaman...');
  
  try {
    const peminjamanData = createPeminjamanData();
    
    const { error } = await supabase
      .from('peminjaman')
      .insert([peminjamanData]);

    if (error) throw error;

    resetForm();
    
    showAlert('success', 'Peminjaman berhasil disimpan!');
    await loadPeminjaman();
  } catch (error) {
    console.error("Error saving peminjaman:", error);
    showAlert('error', 'Gagal menyimpan data: ' + error.message);
  } finally {
    hideLoading();
  }
}

function createPeminjamanData() {
  return {
    nama_peminjam: document.getElementById('namaPeminjam').value.trim(),
    no_hp: document.getElementById('noHp').value.trim(),
    judul_buku: document.getElementById('judulBuku').value.trim(),
    tanggal_pinjam: document.getElementById('tanggalPinjam').value,
    jatuh_tempo: hitungJatuhTempo(),
    status: 'Dipinjam'
  };
}

// Fungsi yang diperbaiki untuk menghitung jatuh tempo
function hitungJatuhTempo() {
  const tglPinjam = document.getElementById('tanggalPinjam').value;
  const lamaPinjam = parseInt(document.getElementById('lamaPinjam').value);
  
  if (!tglPinjam || !lamaPinjam) return null;
  
  const tgl = new Date(tglPinjam);
  tgl.setDate(tgl.getDate() + (lamaPinjam * 7));
  return tgl.toISOString().split('T')[0];
}

// ====================== PENGEMBALIAN FUNCTIONS ======================
async function showPengembalianModal(id) {
  currentInvoice = peminjamanList.find(item => item.id === id);
  if (!currentInvoice) return;

  // Isi data modal
  document.getElementById('modalJudulBuku').value = currentInvoice.judul_buku;
  document.getElementById('modalNamaPeminjam').value = currentInvoice.nama_peminjam;
  document.getElementById('modalTanggalPinjam').value = formatDate(currentInvoice.tanggal_pinjam);
  document.getElementById('modalJatuhTempo').value = formatDate(currentInvoice.jatuh_tempo);
  document.getElementById('modalTanggalKembali').value = new Date().toISOString().split('T')[0];

  // Tampilkan modal
  new bootstrap.Modal(document.getElementById('pengembalianModal')).show();
}

async function prosesPengembalian() {
  const tglKembali = document.getElementById('modalTanggalKembali').value;
  
  if (!tglKembali) {
    showAlert('error', 'Harap pilih tanggal kembali!');
    return;
  }

  showLoading('Memproses pengembalian...');
  
  try {
    const { denda, hariTelat } = await calculateDenda(currentInvoice.id, tglKembali);
    
    const { error } = await supabase
      .from('peminjaman')
      .update({
        tanggal_kembali: tglKembali,
        denda: denda,
        hari_telat: hariTelat,
        status: denda > 0 ? 'Terlambat' : 'Dikembalikan'
      })
      .eq('id', currentInvoice.id);

    if (error) throw error;

    showAlert('success', 'Pengembalian berhasil diproses!');
    await loadPeminjaman();
    await loadRiwayat();
    bootstrap.Modal.getInstance(document.getElementById('pengembalianModal')).hide();
  } catch (error) {
    console.error("Error processing return:", error);
    showAlert('error', 'Gagal memproses: ' + error.message);
  } finally {
    hideLoading();
  }
}

async function calculateDenda(id, tglKembali) {
  const peminjaman = peminjamanList.find(item => item.id === id);
  const tglTempo = new Date(peminjaman.jatuh_tempo);
  const tglKembaliObj = new Date(tglKembali);
  
  const diffTime = tglKembaliObj - tglTempo;
  const hariTelat = diffTime > 0 ? Math.ceil(diffTime / (1000 * 60 * 60 * 24)) : 0;
  const denda = hariTelat * DENDA_PER_HARI;
  
  return { denda, hariTelat };
}

// ====================== UTILITY FUNCTIONS ======================
function formatDate(dateString) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

function resetForm() {
  document.getElementById('formPeminjaman').reset();
  document.getElementById('formPeminjaman').classList.remove('was-validated');
  hitungJatuhTempo();
}

function debounce(func, timeout = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), timeout);
  };
}

// Menampilkan notifikasi
function showAlert(type, message) {
  const alertContainer = document.getElementById('alertContainer');
  const icons = {
    success: 'fa-circle-check',
    error: 'fa-circle-exclamation',
    warning: 'fa-triangle-exclamation',
    info: 'fa-circle-info'
  };

  const alertEl = document.createElement('div');
  alertEl.className = `alert alert-${type} alert-dismissible fade show animate__animated animate__fadeInRight`;
  alertEl.innerHTML = `
    <div class="d-flex align-items-center gap-2">
      <i class="fas ${icons[type]}"></i>
      <div>${message}</div>
      <button type="button" class="btn-close ms-auto" data-bs-dismiss="alert"></button>
    </div>
  `;

  alertContainer.appendChild(alertEl);

  // Auto-hide setelah 5 detik
  setTimeout(() => {
    alertEl.classList.remove('show');
    setTimeout(() => alertEl.remove(), 150);
  }, 5000);
}

// Menampilkan loading overlay
function showLoading(text = 'Memproses...') {
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingText = document.getElementById('loadingText');
  
  loadingText.textContent = text;
  loadingOverlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

// Menyembunyikan loading overlay
function hideLoading() {
  const loadingOverlay = document.getElementById('loadingOverlay');
  loadingOverlay.style.display = 'none';
  document.body.style.overflow = 'auto';
}

// Update tabel pengembalian
function updateTabelPengembalian() {
  const tbody = document.getElementById('pengembalianBody');
  tbody.innerHTML = '';

  if (peminjamanList.length === 0) {
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

  peminjamanList.forEach((item, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${item.judul_buku}</td>
      <td>${item.nama_peminjam}</td>
      <td>${formatDate(item.tanggal_pinjam)}</td>
      <td>${formatDate(item.jatuh_tempo)}</td>
      <td><span class="status-badge ${item.status === 'Dipinjam' ? 'bg-warning' : 'bg-danger'}">${item.status}</span></td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="showPengembalianModal('${item.id}')">
          <i class="fas fa-undo me-1"></i>Proses
        </button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// Update tabel riwayat
function updateRiwayatUI(data) {
  const tbody = document.getElementById('riwayatBody');
  tbody.innerHTML = '';

  if (data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-4">
          <i class="fas fa-book-open fa-2x mb-3 text-muted"></i>
          <p>Tidak ada riwayat peminjaman</p>
        </td>
      </tr>
    `;
    return;
  }

  data.forEach((item, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${item.judul_buku}</td>
      <td>${item.nama_peminjam}</td>
      <td>${formatDate(item.tanggal_pinjam)}</td>
      <td>${formatDate(item.jatuh_tempo)}</td>
      <td>${item.tanggal_kembali ? formatDate(item.tanggal_kembali) : '-'}</td>
      <td>${item.hari_telat || '-'}</td>
      <td>${item.denda ? formatCurrency(item.denda) : '-'}</td>
      <td><span class="status-badge ${item.status === 'Dikembalikan' ? 'bg-success' : 'bg-danger'}">${item.status}</span></td>
    `;
    tbody.appendChild(row);
  });
}

// Pencarian peminjaman aktif
function searchPeminjaman() {
  const searchTerm = document.getElementById('searchPeminjaman').value.toLowerCase();
  const filtered = peminjamanList.filter(item => 
    item.nama_peminjam.toLowerCase().includes(searchTerm) ||
    item.judul_buku.toLowerCase().includes(searchTerm)
  );
  updateTabelPengembalian(filtered);
}

// Pencarian riwayat
function searchRiwayat() {
  const searchTerm = document.getElementById('searchRiwayat').value.toLowerCase();
  const filtered = riwayatList.filter(item => 
    item.nama_peminjam.toLowerCase().includes(searchTerm) ||
    item.judul_buku.toLowerCase().includes(searchTerm)
  );
  updateRiwayatUI(filtered);
}

// Navigasi halaman
function prevPage() {
  if (currentPage > 1) {
    currentPage--;
    loadRiwayat();
  }
}

function nextPage() {
  if (currentPage * ITEMS_PER_PAGE < riwayatList.length) {
    currentPage++;
    loadRiwayat();
  }
}

// Generate laporan
function generateReport() {
  const ctx = document.getElementById('reportChart').getContext('2d');
  
  if (reportChart) {
    reportChart.destroy();
  }

  reportChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Dipinjam', 'Dikembalikan', 'Terlambat'],
      datasets: [{
        label: 'Statistik Peminjaman',
        data: [
          peminjamanList.length,
          riwayatList.filter(item => item.status === 'Dikembalikan').length,
          riwayatList.filter(item => item.status === 'Terlambat').length
        ],
        backgroundColor: [
          'rgba(54, 162, 235, 0.5)',
          'rgba(75, 192, 192, 0.5)',
          'rgba(255, 99, 132, 0.5)'
        ],
        borderColor: [
          'rgb(54, 162, 235)',
          'rgb(75, 192, 192)',
          'rgb(255, 99, 132)'
        ],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'top',
        },
        title: {
          display: true,
          text: 'Statistik Peminjaman Buku'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
      }
    }
  });
}

// Format tanggal ke dd/mm/yyyy
function getFirstDayOfMonth() {
  const date = new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
}