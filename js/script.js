// ====================== SUPABASE INITIALIZATION ======================
const SUPABASE_URL = 'https://xqnlchcbxekwulncjvfy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxbmxjaGNieGVrd3VsbmNqdmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzI3NzE3OSwiZXhwIjoyMDYyODUzMTc5fQ.cdPk3YnDIdNzkCxmhsv5Tlk_Tc9oYIikY_POz1OcrNY';
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ====================== GLOBAL CONSTANTS ======================
const DENDA_PER_HARI = 5000;
const ITEMS_PER_PAGE = 10;

// ====================== GLOBAL VARIABLES ======================
let peminjamanList = [];
let currentInvoice = null;
let currentPage = 1;
let reportChart = null;

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
  document.getElementById('reportDate').value = getCurrentWeek();
}

function loadInitialData() {
  loadPeminjaman();
  loadRiwayat();
  generateReport();
}

function showWelcomeMessage() {
  showAlert('info', 'Selamat datang di Sistem Peminjaman Buku Perpustakaan');
}

// ====================== PEMINJAMAN FUNCTIONS ======================
async function processPeminjaman() {
  const form = document.getElementById('formPeminjaman');
  
  if (!form.checkValidity()) {
    form.classList.add('was-validated');
    showAlert('error', 'Harap isi semua field yang wajib dengan data yang valid!');
    return;
  }
  
  showLoading('Menyimpan data peminjaman...');
  
  try {
    const peminjamanData = createPeminjamanData();
    
    const { error } = await supabase
      .from('peminjaman')
      .insert([peminjamanData]);

    if (error) throw error;

    resetPeminjamanForm(form);
    
    hideLoading();
    showAlert('success', 'Peminjaman berhasil disimpan!');
    document.getElementById('pengembalian-tab').click();
  } catch (error) {
    console.error("Error saving peminjaman:", error);
    hideLoading();
    showAlert('error', 'Gagal menyimpan data peminjaman: ' + error.message);
  }
}

function createPeminjamanData() {
  return {
    nama: document.getElementById('namaPeminjam').value.trim(),
    no_hp: document.getElementById('noHp').value.trim(),
    email: document.getElementById('email').value.trim() || null,
    judul_buku: document.getElementById('judulBuku').value.trim(),
    kode_buku: document.getElementById('kodeBuku').value.trim(),
    tanggal_pinjam: document.getElementById('tanggalPinjam').value,
    tanggal_tempo: hitungJatuhTempo(true),
    tanggal_kembali: null,
    denda: 0,
    hari_telat: 0,
    status: 'Dipinjam',
    invoice: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

// ====================== DATA LOADING FUNCTIONS ======================
async function loadPeminjaman() {
  showLoading('Memuat data peminjaman...');
  
  try {
    const { data, error } = await supabase
      .from('peminjaman')
      .select('*')
      .is('tanggal_kembali', null)
      .order('tanggal_pinjam', { ascending: true });

    if (error) throw error;

    peminjamanList = data;
    updateTabelPengembalian();
    hideLoading();
  } catch (error) {
    console.error("Error loading peminjaman:", error);
    showAlert('error', 'Gagal memuat data peminjaman: ' + error.message);
    hideLoading();
  }
}

async function loadRiwayat() {
  showLoading('Memuat data riwayat...');
  
  try {
    const dari = document.getElementById('filterDari').value;
    const sampai = document.getElementById('filterSampai').value;
    const searchTerm = document.getElementById('searchRiwayat').value.toLowerCase();
    
    const { data, error } = await supabase
      .from('peminjaman')
      .select('*')
      .gte('tanggal_pinjam', dari)
      .lte('tanggal_pinjam', sampai + 'T23:59:59')
      .order('tanggal_pinjam', { ascending: false });

    if (error) throw error;

    const filteredData = data.filter(item => 
      !searchTerm || 
      item.nama.toLowerCase().includes(searchTerm) || 
      item.judul_buku.toLowerCase().includes(searchTerm) || 
      item.kode_buku.toLowerCase().includes(searchTerm)
    );

    updateRiwayatUI(filteredData);
    hideLoading();
  } catch (error) {
    console.error("Error loading riwayat:", error);
    showAlert('error', 'Gagal memuat data riwayat: ' + error.message);
    hideLoading();
  }
}

// ====================== PENGEMBALIAN FUNCTIONS ======================
async function prosesPengembalian() {
  const id = document.getElementById('pengembalianModal').getAttribute('data-peminjaman-id');
  const tglKembali = document.getElementById('modalTanggalKembali').value;
  
  if (!tglKembali) {
    showAlert('error', 'Harap masukkan tanggal kembali!');
    return;
  }

  showLoading('Memproses pengembalian...');
  
  try {
    const { denda, hariTelat, invoiceNumber } = await calculateDenda(id, tglKembali);
    await updatePeminjamanRecord(id, tglKembali, denda, hariTelat, invoiceNumber);
    
    pengembalianModal.hide();
    handlePengembalianSuccess(denda, hariTelat, id, tglKembali);
  } catch (error) {
    handlePengembalianError(error);
  } finally {
    hideLoading();
  }
}

async function calculateDenda(id, tglKembali) {
  const { data, error } = await supabase
    .from('peminjaman')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    throw new Error('Data peminjaman tidak ditemukan');
  }
  
  const peminjaman = data;
  const tglKembaliObj = new Date(tglKembali);
  const tglTempoObj = new Date(peminjaman.tanggal_tempo);
  
  let hariTelat = 0;
  let denda = 0;
  
  if (tglKembaliObj > tglTempoObj) {
    const diffTime = tglKembaliObj - tglTempoObj;
    hariTelat = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    denda = hariTelat * DENDA_PER_HARI;
  }
  
  let invoiceNumber = null;
  if (denda > 0) {
    const { count } = await supabase
      .from('peminjaman')
      .select('*', { count: 'exact' })
      .not('invoice', 'is', null);

    invoiceNumber = generateInvoiceNumber(count + 1);
  }
  
  return { denda, hariTelat, invoiceNumber };
}

async function updatePeminjamanRecord(id, tglKembali, denda, hariTelat, invoiceNumber) {
  const { error } = await supabase
    .from('peminjaman')
    .update({
      tanggal_kembali: tglKembali,
      denda: denda,
      hari_telat: hariTelat,
      status: denda > 0 ? 'Dikembalikan' : 'Lunas',
      invoice: invoiceNumber,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) throw error;
}

// ====================== UTILITY FUNCTIONS ======================
function formatDate(dateString) {
  if (!dateString) return '-';
  const options = {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  };
  return new Date(dateString).toLocaleDateString('id-ID', options);
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount);
}

function showAlert(type, message) {
  const alertContainer = document.getElementById('alertContainer');
  if (!alertContainer) return;

  const icons = {
    success: 'fa-check-circle',
    error: 'fa-times-circle',
    warning: 'fa-exclamation-triangle',
    info: 'fa-info-circle'
  };
  
  const alertEl = document.createElement('div');
  alertEl.className = `alert alert-${type} alert-dismissible fade show animate__animated animate__fadeInRight`;
  alertEl.innerHTML = `
    <div class="d-flex align-items-center">
      <i class="fas ${icons[type] || 'fa-bell'} me-2"></i>
      <div>${message}</div>
      <button type="button" class="btn-close ms-auto" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
  `;
  
  alertContainer.appendChild(alertEl);
  
  setTimeout(() => {
    alertEl.classList.remove('show');
    setTimeout(() => alertEl.remove(), 150);
  }, 3000);
}

// Fungsi loadPeminjaman yang diperbaiki
async function loadPeminjaman() {
  const { data, error } = await supabase
    .from('peminjaman')
    .select('*')
    .is('tanggal_kembali', null)
    .order('tanggal_pinjam', { ascending: true });
  
  if (!error) {
    peminjamanList = data;
    updateTabelPengembalian();
  }
}

// Initialize event listeners
function setupEventListeners() {
  document.getElementById('lamaPinjam').addEventListener('change', hitungJatuhTempo);
  document.getElementById('tanggalPinjam').addEventListener('change', hitungJatuhTempo);
  
  document.getElementById('formPeminjaman').addEventListener('submit', function(e) {
    e.preventDefault();
    processPeminjaman();
  });
  
  // Add other event listeners as needed
}

// Run the application
setupEventListeners();