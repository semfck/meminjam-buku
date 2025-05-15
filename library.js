class LibrarySystem {
    constructor() {
        this.SUPABASE_URL = 'https://xqnlchcbxekwulncjvfy.supabase.co';
        this.SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxbmxjaGNieGVrd3VsbmNqdmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzI3NzE3OSwiZXhwIjoyMDYyODUzMTc5fQ.cdPk3YnDIdNzkCxmhsv5Tlk_Tc9oYIikY_POz1OcrNY';
        this.DENDA_PER_HARI = 5000;
        this.ITEMS_PER_PAGE = 10;
        
        this.supabase = supabase.createClient(this.SUPABASE_URL, this.SUPABASE_KEY);
        this.currentInvoice = null;
        this.currentPage = 1;
        this.peminjamanList = [];
        this.bukuList = [];
        this.riwayatList = [];
        this.loanChart = null;
        this.categoryChart = null;
    }

    async init() {
        this.setupEventListeners();
        this.setDefaultDates();
        await this.loadAllData();
        this.showAlert('info', 'Selamat datang di Sistem Peminjaman Buku');
    }

    setDefaultDates() {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('tanggalPinjam').value = today;
        document.getElementById('modalTanggalKembali').value = today;
        document.getElementById('filterDari').value = this.getFirstDayOfMonth();
        document.getElementById('filterSampai').value = today;
    }

    getFirstDayOfMonth() {
        const date = new Date();
        return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
    }

    async loadAllData() {
        try {
            await Promise.all([
                this.loadPeminjaman(),
                this.loadBuku(),
                this.loadRiwayat()
            ]);
            this.generateReports();
        } catch (error) {
            this.handleError(error, 'Gagal memuat data');
        }
    }

    // ====================== EVENT HANDLERS ======================
    setupEventListeners() {
        // Form submission
        document.getElementById('formPeminjaman').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });
        
        // Reset form
        document.getElementById('btnReset').addEventListener('click', () => this.resetForm());

        // Book search
        document.getElementById('searchBuku').addEventListener('input', 
            this.debounce(() => this.searchBuku(), 300));

        // Return functions
        document.getElementById('searchPeminjaman').addEventListener('input', 
            this.debounce(() => this.searchPeminjaman(), 300));
        document.getElementById('modalTanggalKembali').addEventListener('change', () => this.previewDenda());
        document.getElementById('btnProsesPengembalian').addEventListener('click', () => this.prosesPengembalian());
        document.getElementById('btnConfirmPayment').addEventListener('click', () => this.confirmPayment());

        // History functions
        document.getElementById('searchRiwayat').addEventListener('input', 
            this.debounce(() => this.searchRiwayat(), 300));
        document.getElementById('btnFilter').addEventListener('click', () => this.loadRiwayat());
        document.getElementById('btnPrev').addEventListener('click', () => this.prevPage());
        document.getElementById('btnNext').addEventListener('click', () => this.nextPage());
    }

    // ====================== BOOK MANAGEMENT ======================
    async loadBuku() {
        this.showLoading('Memuat data buku...');
        try {
            const { data, error } = await this.supabase
                .from('buku')
                .select('*')
                .order('judul', { ascending: true });

            if (error) throw error;
            
            this.bukuList = data || [];
            this.updateBookTable();
        } catch (error) {
            this.handleError(error, 'Gagal memuat data buku');
        } finally {
            this.hideLoading();
        }
    }

    updateBookTable(books = this.bukuList) {
        const tbody = document.getElementById('bookTableBody');
        tbody.innerHTML = '';

        if (books.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-4">
                        <i class="fas fa-book-open fa-2x mb-3 text-muted"></i>
                        <p>Tidak ada data buku</p>
                    </td>
                </tr>
            `;
            return;
        }

        const availableBooks = books.filter(book => 
            !this.peminjamanList.some(loan => 
                loan.kode_buku === book.kode && !loan.tanggal_kembali
            )
        );

        availableBooks.forEach((book, index) => {
            const row = document.createElement('tr');
            row.className = 'animate__animated animate__fadeIn';
            row.innerHTML = `
                <td>${book.judul}</td>
                <td>${book.pengarang}</td>
                <td>${book.tahun_terbit}</td>
                <td>${book.kategori}</td>
                <td><span class="status-available status-badge">Tersedia</span></td>
                <td>
                    <button class="btn btn-primary btn-sm" 
                        onclick="librarySystem.pinjamBuku('${book.id}')">
                        <i class="fas fa-hand-holding me-1"></i>Pinjam
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    // ====================== LOAN MANAGEMENT ======================
    async handleSubmit() {
        if (!this.validateForm()) return;

        const formData = {
            kode_buku: document.getElementById('bookId').value,
            nama_peminjam: this.sanitizeInput(document.getElementById('namaPeminjam').value),
            no_hp: document.getElementById('noHp').value,
            tanggal_pinjam: document.getElementById('tanggalPinjam').value,
            jatuh_tempo: this.hitungJatuhTempo(),
            lama_pinjam: document.getElementById('lamaPinjam').value,
            catatan: this.sanitizeInput(document.getElementById('catatan').value)
        };

        this.showLoading('Menyimpan peminjaman...');
        try {
            const { error } = await this.supabase
                .from('peminjaman')
                .insert([formData]);

            if (error) throw error;

            this.showAlert('success', 'Peminjaman berhasil disimpan!');
            this.resetForm();
            await this.loadAllData();
        } catch (error) {
            this.handleError(error, 'Gagal menyimpan peminjaman');
        } finally {
            this.hideLoading();
        }
    }

    validateForm() {
        const requiredFields = [
            'judulBuku', 'pengarang', 'tahunTerbit', 
            'kategori', 'namaPeminjam', 'noHp', 
            'tanggalPinjam', 'lamaPinjam'
        ];
        
        let isValid = true;
        
        // Validasi field required
        requiredFields.forEach(field => {
            const element = document.getElementById(field);
            if (!element.value.trim()) {
                element.classList.add('is-invalid');
                isValid = false;
            } else {
                element.classList.remove('is-invalid');
            }
        });
        
        // Validasi nomor HP
        const phoneRegex = /^08\d{8,11}$/;
        const noHp = document.getElementById('noHp').value;
        if (!phoneRegex.test(noHp)) {
            document.getElementById('noHp').classList.add('is-invalid');
            this.showAlert('error', 'Format nomor HP tidak valid. Harus dimulai dengan 08 dan 10-13 digit');
            isValid = false;
        }
        
        // Validasi tanggal tidak boleh di masa lalu
        const today = new Date().toISOString().split('T')[0];
        const tglPinjam = document.getElementById('tanggalPinjam').value;
        if (tglPinjam < today) {
            document.getElementById('tanggalPinjam').classList.add('is-invalid');
            this.showAlert('error', 'Tanggal pinjam tidak boleh di masa lalu');
            isValid = false;
        }
        
        return isValid;
    }

    // ... (Lanjutkan dengan method lainnya)

    // ====================== REPORT FUNCTIONS ======================
    async generateReports() {
        this.showLoading('Membuat laporan...');
        try {
            // Data untuk chart peminjaman bulanan
            const { data: monthlyData } = await this.supabase
                .from('peminjaman')
                .select('tanggal_pinjam, count:id')
                .gte('tanggal_pinjam', this.getFirstDayOfMonth())
                .order('tanggal_pinjam', { ascending: true });
            
            // Data untuk chart kategori
            const { data: categoryData } = await this.supabase
                .from('peminjaman')
                .select('kategori, count:id')
                .group('kategori');
            
            // Data statistik
            const { data: statsData } = await this.supabase
                .from('peminjaman')
                .select('*');
            
            this.renderCharts(monthlyData, categoryData);
            this.renderStats(statsData);
        } catch (error) {
            this.handleError(error, 'Gagal memuat laporan');
        } finally {
            this.hideLoading();
        }
    }

    renderCharts(monthlyData, categoryData) {
        const loanCtx = document.getElementById('loanChart').getContext('2d');
        const categoryCtx = document.getElementById('categoryChart').getContext('2d');
        
        // Hancurkan chart sebelumnya jika ada
        if (this.loanChart) this.loanChart.destroy();
        if (this.categoryChart) this.categoryChart.destroy();
        
        // Chart peminjaman bulanan
        this.loanChart = new Chart(loanCtx, {
            type: 'line',
            data: {
                labels: monthlyData.map(item => this.formatDate(item.tanggal_pinjam, 'short')),
                datasets: [{
                    label: 'Peminjaman Harian',
                    data: monthlyData.map(item => item.count),
                    backgroundColor: 'rgba(67, 97, 238, 0.2)',
                    borderColor: 'rgba(67, 97, 238, 1)',
                    borderWidth: 2,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Peminjaman Bulan Ini'
                    }
                }
            }
        });
        
        // Chart kategori
        this.categoryChart = new Chart(categoryCtx, {
            type: 'doughnut',
            data: {
                labels: categoryData.map(item => item.kategori),
                datasets: [{
                    data: categoryData.map(item => item.count),
                    backgroundColor: [
                        '#4361ee', '#3a0ca3', '#f72585', 
                        '#4cc9f0', '#4895ef', '#560bad'
                    ]
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Peminjaman per Kategori'
                    }
                }
            }
        });
    }

    renderStats(data) {
        const statsContainer = document.getElementById('statsContainer');
        statsContainer.innerHTML = '';
        
        // Hitung berbagai statistik
        const totalLoans = data.length;
        const activeLoans = data.filter(loan => !loan.tanggal_kembali).length;
        const lateLoans = data.filter(loan => loan.status === 'Terlambat').length;
        const totalDenda = data.reduce((sum, loan) => sum + (loan.denda || 0), 0);
        
        // Buat card statistik
        const stats = [
            { title: 'Total Peminjaman', value: totalLoans, icon: 'book' },
            { title: 'Sedang Dipinjam', value: activeLoans, icon: 'book-reader' },
            { title: 'Terlambat', value: lateLoans, icon: 'exclamation-triangle' },
            { title: 'Total Denda', value: this.formatRupiah(totalDenda), icon: 'money-bill-wave' }
        ];
        
        stats.forEach(stat => {
            const col = document.createElement('div');
            col.className = 'col-md-3 mb-3';
            col.innerHTML = `
                <div class="stat-card">
                    <h3>${stat.value}</h3>
                    <p><i class="fas fa-${stat.icon} me-2"></i>${stat.title}</p>
                </div>
            `;
            statsContainer.appendChild(col);
        });
    }

    // ====================== HELPER FUNCTIONS ======================
    sanitizeInput(input) {
        if (!input) return '';
        const div = document.createElement('div');
        div.textContent = input;
        return div.innerHTML;
    }

    formatDate(dateString, style = 'long') {
        if (!dateString) return '-';
        const options = { day: '2-digit', month: style === 'short' ? 'short' : 'long', year: 'numeric' };
        return new Date(dateString).toLocaleDateString('id-ID', options);
    }

    formatRupiah(amount) {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(amount);
    }

    debounce(func, timeout = 300) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => func.apply(this, args), timeout);
        };
    }

    showLoading(message = 'Memproses...') {
        const overlay = document.getElementById('loadingOverlay');
        const text = document.getElementById('loadingText');
        
        text.textContent = message;
        overlay.style.display = 'flex';
        overlay.classList.add('animate__fadeIn');
        overlay.classList.remove('animate__fadeOut');
    }

    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        overlay.classList.add('animate__fadeOut');
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 300);
    }

    showAlert(type, message) {
        const alertTypes = {
            'error': { icon: 'times-circle', color: 'danger' },
            'success': { icon: 'check-circle', color: 'success' },
            'info': { icon: 'info-circle', color: 'info' },
            'warning': { icon: 'exclamation-triangle', color: 'warning' }
        };
        
        const alert = document.createElement('div');
        alert.className = `alert alert-${alertTypes[type].color} animate__animated animate__fadeInRight`;
        alert.role = 'alert';
        alert.innerHTML = `
            <i class="fas fa-${alertTypes[type].icon} me-2"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        
        const container = document.getElementById('alertContainer');
        container.appendChild(alert);
        
        setTimeout(() => {
            alert.classList.remove('animate__fadeIn');
            alert.classList.add('animate__fadeOut');
            setTimeout(() => alert.remove(), 300);
        }, 5000);
    }

    handleError(error, message = 'Terjadi kesalahan') {
        console.error(error);
        this.showAlert('error', `${message}: ${error.message}`);
    }
}

// Inisialisasi sistem
const librarySystem = new LibrarySystem();
document.addEventListener('DOMContentLoaded', () => librarySystem.init());