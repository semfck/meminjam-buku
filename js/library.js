import { supabase } from './supabase.js';

class LibrarySystem {
    constructor() {
        // Konfigurasi dasar
        this.DENDA_PER_HARI = 5000;
        this.ITEMS_PER_PAGE = 10;
        
        // Data state
        this.currentInvoice = null;
        this.currentPage = 1;
        this.peminjamanList = [];
        this.bukuList = [];
        this.riwayatList = [];
        this.loanChart = null;
        this.categoryChart = null;
        this.currentLibrary = null;
        this.libraries = [];
        this.isOnline = navigator.onLine;
        
        // Inisialisasi
        this.setupOfflineSupport();
    }

    async init() {
        try {
            this.setupEventListeners();
            this.setDefaultDates();
            await this.loadLibraries();
            await this.loadAllData();
            this.showAlert('info', 'Selamat datang di Sistem Peminjaman Buku');
        } catch (error) {
            this.handleError(error, 'Gagal menginisialisasi sistem');
        }
    }

    // ====================== UTILITY METHODS ======================
    setDefaultDates() {
        const today = new Date().toISOString().split('T')[0];
        const dateInputs = {
            'tanggalPinjam': today,
            'modalTanggalKembali': today,
            'filterDari': this.getFirstDayOfMonth(),
            'filterSampai': today
        };

        for (const [id, value] of Object.entries(dateInputs)) {
            const element = document.getElementById(id);
            if (element) element.value = value;
        }
    }

    getFirstDayOfMonth() {
        const date = new Date();
        return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
    }

    sanitizeInput(input) {
        if (!input) return '';
        const div = document.createElement('div');
        div.textContent = input;
        return div.innerHTML;
    }

    formatDate(dateString, style = 'long') {
        if (!dateString) return '-';
        const options = { 
            day: '2-digit', 
            month: style === 'short' ? 'short' : 'long', 
            year: 'numeric' 
        };
        return new Date(dateString).toLocaleDateString('id-ID', options);
    }

    formatRupiah(amount) {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(amount || 0);
    }

    debounce(func, timeout = 300) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => func.apply(this, args), timeout);
        };
    }

    // ====================== OFFLINE SUPPORT ======================
    setupOfflineSupport() {
        window.addEventListener('online', () => this.handleOnlineStatus());
        window.addEventListener('offline', () => this.handleOfflineStatus());
    }

    handleOnlineStatus() {
        this.isOnline = true;
        this.showAlert('info', 'Koneksi internet telah pulih. Menyinkronkan data...');
        this.syncOfflineData();
    }

    handleOfflineStatus() {
        this.isOnline = false;
        this.showAlert('warning', 'Anda sedang offline. Perubahan akan disinkronkan ketika online kembali.');
    }

    async syncOfflineData() {
        const offlineActions = JSON.parse(localStorage.getItem('offlineActions') || '[]');
        if (offlineActions.length === 0) return;

        this.showLoading(`Menyinkronkan ${offlineActions.length} perubahan...`);
        
        try {
            for (const action of offlineActions) {
                switch (action.type) {
                    case 'tambah_peminjaman':
                        await supabase
                            .from('peminjaman')
                            .insert(action.data);
                        break;
                    case 'pengembalian':
                        await supabase
                            .from('peminjaman')
                            .update(action.data)
                            .eq('id', action.id);
                        break;
                    default:
                        console.warn('Unknown action type:', action.type);
                }
            }

            localStorage.removeItem('offlineActions');
            await this.loadAllData();
            this.showAlert('success', 'Data berhasil disinkronkan!');
        } catch (error) {
            this.handleError(error, 'Gagal menyinkronkan data');
        } finally {
            this.hideLoading();
        }
    }

    queueOfflineAction(type, data, id = null) {
        const actions = JSON.parse(localStorage.getItem('offlineActions') || '[]');
        actions.push({ 
            type, 
            data, 
            id, 
            timestamp: new Date().toISOString() 
        });
        localStorage.setItem('offlineActions', JSON.stringify(actions));
        this.showAlert('info', 'Aksi disimpan untuk disinkronkan ketika online kembali');
    }

    // ====================== EVENT HANDLERS ======================
    setupEventListeners() {
        // Form submission
        document.getElementById('formPeminjaman')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });
        
        // Reset form
        document.getElementById('btnReset')?.addEventListener('click', () => this.resetForm());

        // Book search
        const searchBuku = document.getElementById('searchBuku');
        if (searchBuku) {
            searchBuku.addEventListener('input', 
                this.debounce(() => this.searchBuku(), 300));
        }

        // Return functions
        document.getElementById('searchPeminjaman')?.addEventListener('input', 
            this.debounce(() => this.searchPeminjaman(), 300));
        
        document.getElementById('modalTanggalKembali')?.addEventListener('change', 
            () => this.previewDenda());
        
        document.getElementById('btnProsesPengembalian')?.addEventListener('click', 
            () => this.prosesPengembalian());
        
        document.getElementById('btnConfirmPayment')?.addEventListener('click', 
            () => this.confirmPayment());

        // History functions
        document.getElementById('searchRiwayat')?.addEventListener('input', 
            this.debounce(() => this.searchRiwayat(), 300));
        
        document.getElementById('btnFilter')?.addEventListener('click', 
            () => this.loadRiwayat());
        
        document.getElementById('btnPrev')?.addEventListener('click', 
            () => this.prevPage());
        
        document.getElementById('btnNext')?.addEventListener('click', 
            () => this.nextPage());

        // Library selector
        document.getElementById('librarySelector')?.addEventListener('change', 
            (e) => this.changeLibrary(e.target.value));
    }

    // ====================== DATA LOADING ======================
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

    async loadLibraries() {
        this.showLoading('Memuat data perpustakaan...');
        try {
            const { data, error } = await supabase
                .from('perpustakaan')
                .select('*');

            if (error) throw error;

            this.libraries = data || [];
            
            if (this.libraries.length > 0) {
                const savedLibrary = localStorage.getItem('currentLibrary');
                this.currentLibrary = savedLibrary 
                    ? this.libraries.find(lib => lib.id === savedLibrary) || this.libraries[0]
                    : this.libraries[0];
                
                this.updateLibrarySelector();
            }
        } catch (error) {
            this.handleError(error, 'Gagal memuat data perpustakaan');
        } finally {
            this.hideLoading();
        }
    }

    updateLibrarySelector() {
        const selector = document.getElementById('librarySelector');
        if (!selector) return;

        selector.innerHTML = this.libraries.map(lib => 
            `<option value="${lib.id}">${lib.nama}</option>`
        ).join('');

        if (this.currentLibrary) {
            selector.value = this.currentLibrary.id;
        }
    }

    async changeLibrary(libraryId) {
        this.currentLibrary = this.libraries.find(lib => lib.id === libraryId);
        if (!this.currentLibrary) return;

        localStorage.setItem('currentLibrary', libraryId);
        await this.loadAllData();
        this.showAlert('info', `Berhasil beralih ke perpustakaan ${this.currentLibrary.nama}`);
    }

    // ====================== BOOK MANAGEMENT ======================
    async loadBuku() {
        this.showLoading('Memuat data buku...');
        try {
            let query = supabase
                .from('buku')
                .select('*')
                .order('judul', { ascending: true });

            if (this.currentLibrary) {
                query = query.eq('perpustakaan_id', this.currentLibrary.id);
            }

            const { data, error } = await query;

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
        if (!tbody) return;

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

        availableBooks.forEach((book) => {
            const row = document.createElement('tr');
            row.className = 'animate__animated animate__fadeIn';
            row.innerHTML = `
                <td>${this.sanitizeInput(book.judul)}</td>
                <td>${this.sanitizeInput(book.pengarang)}</td>
                <td>${book.tahun_terbit}</td>
                <td>${this.sanitizeInput(book.kategori)}</td>
                <td><span class="status-available status-badge">Tersedia</span></td>
                <td>
                    <button class="btn btn-primary btn-sm pinjam-btn" data-id="${book.id}">
                        <i class="fas fa-hand-holding me-1"></i>Pinjam
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

        // Add event listeners to all pinjam buttons
        document.querySelectorAll('.pinjam-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const bookId = e.target.closest('button').dataset.id;
                this.pinjamBuku(bookId);
            });
        });
    }

    async pinjamBuku(bookId) {
        const book = this.bukuList.find(b => b.id === bookId);
        if (!book) return;

        // Isi form dengan data buku
        document.getElementById('bookId').value = book.id;
        document.getElementById('judulBuku').value = book.judul;
        document.getElementById('pengarang').value = book.pengarang;
        document.getElementById('tahunTerbit').value = book.tahun_terbit;
        document.getElementById('kategori').value = book.kategori;

        // Scroll ke form peminjaman
        document.getElementById('formPeminjaman').scrollIntoView({ behavior: 'smooth' });
    }

    async tambahBuku(bookData) {
        this.showLoading('Menambahkan buku...');
        try {
            if (this.currentLibrary) {
                bookData.perpustakaan_id = this.currentLibrary.id;
            }

            const { error } = await supabase
                .from('buku')
                .insert([bookData]);

            if (error) throw error;

            this.showAlert('success', 'Buku berhasil ditambahkan!');
            await this.loadBuku();
            return true;
        } catch (error) {
            this.handleError(error, 'Gagal menambahkan buku');
            return false;
        } finally {
            this.hideLoading();
        }
    }

    async updateBuku(id, bookData) {
        this.showLoading('Memperbarui buku...');
        try {
            const { error } = await supabase
                .from('buku')
                .update(bookData)
                .eq('id', id);

            if (error) throw error;

            this.showAlert('success', 'Buku berhasil diperbarui!');
            await this.loadBuku();
            return true;
        } catch (error) {
            this.handleError(error, 'Gagal memperbarui buku');
            return false;
        } finally {
            this.hideLoading();
        }
    }

    async hapusBuku(id) {
        const buku = this.bukuList.find(b => b.id === id);
        if (!buku) return false;

        // Cek apakah buku sedang dipinjam
        const isBorrowed = this.peminjamanList.some(p => p.kode_buku === buku.kode && !p.tanggal_kembali);
        if (isBorrowed) {
            this.showAlert('error', 'Buku tidak dapat dihapus karena sedang dipinjam!');
            return false;
        }

        if (confirm(`Apakah Anda yakin ingin menghapus buku "${buku.judul}"?`)) {
            this.showLoading('Menghapus buku...');
            
            try {
                const { error } = await supabase
                    .from('buku')
                    .delete()
                    .eq('id', id);

                if (error) throw error;

                this.showAlert('success', 'Buku berhasil dihapus!');
                await this.loadBuku();
                return true;
            } catch (error) {
                this.handleError(error, 'Gagal menghapus buku');
                return false;
            } finally {
                this.hideLoading();
            }
        }
        return false;
    }

    searchBuku() {
        const term = document.getElementById('searchBuku')?.value.toLowerCase() || '';
        
        if (term.length < 2) {
            this.updateBookTable();
            return;
        }
        
        const filtered = this.bukuList.filter(book => 
            book.judul.toLowerCase().includes(term) || 
            book.pengarang.toLowerCase().includes(term) ||
            book.kategori.toLowerCase().includes(term)
        );
        
        this.updateBookTable(filtered);
    }

    // ====================== LOAN MANAGEMENT ======================
    async loadPeminjaman() {
        this.showLoading('Memuat data peminjaman...');
        try {
            let query = supabase
                .from('peminjaman')
                .select('*')
                .order('tanggal_pinjam', { ascending: false });

            if (this.currentLibrary) {
                query = query.eq('perpustakaan_id', this.currentLibrary.id);
            }

            const { data, error } = await query;

            if (error) throw error;

            this.peminjamanList = data || [];
            this.updateTabelPengembalian();
        } catch (error) {
            this.handleError(error, 'Gagal memuat data peminjaman');
        } finally {
            this.hideLoading();
        }
    }

    updateTabelPengembalian() {
        const tbody = document.getElementById('pengembalianBody');
        if (!tbody) return;

        tbody.innerHTML = '';

        const activeLoans = this.peminjamanList.filter(loan => !loan.tanggal_kembali);

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
                <td>${this.sanitizeInput(loan.judul_buku)}</td>
                <td>${this.sanitizeInput(loan.pengarang)}</td>
                <td>${this.sanitizeInput(loan.nama_peminjam)}</td>
                <td>${this.formatDate(loan.tanggal_pinjam)}</td>
                <td>${this.formatDate(loan.jatuh_tempo)}</td>
                <td><span class="status-borrowed">${loan.status || 'Dipinjam'}</span></td>
                <td>
                    <button class="btn btn-primary btn-sm proses-btn" data-id="${loan.id}">
                        <i class="fas fa-undo me-1"></i>Proses
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

        // Add event listeners to all proses buttons
        document.querySelectorAll('.proses-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const loanId = e.target.closest('button').dataset.id;
                this.showPengembalianModal(loanId);
            });
        });
    }

    async handleSubmit() {
        if (!this.validateForm()) return;

        const formData = {
            judul_buku: this.sanitizeInput(document.getElementById('judulBuku').value),
            pengarang: this.sanitizeInput(document.getElementById('pengarang').value),
            tahun_terbit: document.getElementById('tahunTerbit').value,
            isbn: this.sanitizeInput(document.getElementById('isbn').value),
            kategori: document.getElementById('kategori').value,
            nama_peminjam: this.sanitizeInput(document.getElementById('namaPeminjam').value),
            no_hp: document.getElementById('noHp').value,
            tanggal_pinjam: document.getElementById('tanggalPinjam').value,
            jatuh_tempo: this.hitungJatuhTempo(),
            lama_pinjam: document.getElementById('lamaPinjam').value,
            status: 'Dipinjam',
            catatan: this.sanitizeInput(document.getElementById('catatan').value),
            perpustakaan_id: this.currentLibrary?.id || null
        };

        this.showLoading('Menyimpan peminjaman...');
        try {
            if (!this.isOnline) {
                this.queueOfflineAction('tambah_peminjaman', formData);
                this.resetForm();
                return;
            }

            const { error } = await supabase
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

    hitungJatuhTempo() {
        try {
            const tglPinjam = document.getElementById('tanggalPinjam')?.value;
            const lamaPinjam = parseInt(document.getElementById('lamaPinjam')?.value);
            
            if (tglPinjam && lamaPinjam) {
                const tglPinjamObj = new Date(tglPinjam);
                const tglTempo = new Date(tglPinjamObj);
                tglTempo.setDate(tglPinjamObj.getDate() + (lamaPinjam * 7));
                
                const jatuhTempoElement = document.getElementById('jatuhTempo');
                if (jatuhTempoElement) {
                    jatuhTempoElement.value = this.formatDate(tglTempo.toISOString().split('T')[0]);
                }
                return tglTempo.toISOString().split('T')[0];
            }
            return null;
        } catch (error) {
            console.error("Error calculating due date:", error);
            return null;
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
            if (!element?.value.trim()) {
                element?.classList.add('is-invalid');
                isValid = false;
            } else {
                element?.classList.remove('is-invalid');
            }
        });
        
        // Validasi nomor HP
        const phoneRegex = /^08\d{8,11}$/;
        const noHp = document.getElementById('noHp')?.value || '';
        if (!phoneRegex.test(noHp)) {
            document.getElementById('noHp')?.classList.add('is-invalid');
            this.showAlert('error', 'Format nomor HP tidak valid. Harus dimulai dengan 08 dan 10-13 digit');
            isValid = false;
        }
        
        // Validasi tanggal tidak boleh di masa lalu
        const today = new Date().toISOString().split('T')[0];
        const tglPinjam = document.getElementById('tanggalPinjam')?.value || today;
        if (tglPinjam < today) {
            document.getElementById('tanggalPinjam')?.classList.add('is-invalid');
            this.showAlert('error', 'Tanggal pinjam tidak boleh di masa lalu');
            isValid = false;
        }
        
        return isValid;
    }

    resetForm() {
        const form = document.getElementById('formPeminjaman');
        if (form) {
            form.reset();
            form.classList.remove('was-validated');
            document.getElementById('jatuhTempo').value = '';
        }
    }

    searchPeminjaman() {
        const term = document.getElementById('searchPeminjaman')?.value.toLowerCase() || '';
        
        if (term.length < 2) {
            this.updateTabelPengembalian();
            return;
        }
        
        const filtered = this.peminjamanList.filter(loan => 
            !loan.tanggal_kembali && (
                loan.judul_buku.toLowerCase().includes(term) || 
                loan.nama_peminjam.toLowerCase().includes(term)
            )
        );
        
        this.updateTabelPengembalian(filtered);
    }

    // ====================== RETURN MANAGEMENT ======================
    async showPengembalianModal(loanId) {
        this.currentInvoice = this.peminjamanList.find(loan => loan.id === loanId);
        if (!this.currentInvoice) return;

        // Isi data modal
        const modalElements = {
            'modalJudulBuku': this.currentInvoice.judul_buku,
            'modalPengarang': this.currentInvoice.pengarang,
            'modalNamaPeminjam': this.currentInvoice.nama_peminjam,
            'modalTanggalPinjam': this.formatDate(this.currentInvoice.tanggal_pinjam),
            'modalJatuhTempo': this.formatDate(this.currentInvoice.jatuh_tempo),
            'modalTanggalKembali': new Date().toISOString().split('T')[0]
        };

        for (const [id, value] of Object.entries(modalElements)) {
            const element = document.getElementById(id);
            if (element) element.value = value;
        }

        // Hitung denda awal
        this.previewDenda();
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('pengembalianModal'));
        modal.show();
    }

    previewDenda() {
        if (!this.currentInvoice) return;

        const returnDate = new Date(document.getElementById('modalTanggalKembali')?.value || new Date());
        const dueDate = new Date(this.currentInvoice.jatuh_tempo);
        const diffTime = returnDate - dueDate;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const hariTelat = diffDays > 0 ? diffDays : 0;
        const denda = hariTelat * this.DENDA_PER_HARI;

        const modalElements = {
            'modalHariTelat': `${hariTelat} hari`,
            'modalDenda': this.formatRupiah(denda)
        };

        for (const [id, value] of Object.entries(modalElements)) {
            const element = document.getElementById(id);
            if (element) element.value = value;
        }
    }

    async prosesPengembalian() {
        if (!this.currentInvoice) return;

        this.showLoading('Memproses pengembalian...');
        try {
            const returnDate = document.getElementById('modalTanggalKembali')?.value;
            const dueDate = new Date(this.currentInvoice.jatuh_tempo);
            const diffDays = Math.ceil((new Date(returnDate) - dueDate) / (1000 * 60 * 60 * 24));
            
            const updateData = {
                tanggal_kembali: returnDate,
                hari_telat: diffDays > 0 ? diffDays : 0,
                denda: diffDays > 0 ? diffDays * this.DENDA_PER_HARI : 0,
                status: diffDays > 0 ? 'Terlambat' : 'Dikembalikan'
            };

            if (!this.isOnline) {
                this.queueOfflineAction('pengembalian', updateData, this.currentInvoice.id);
                
                // Close modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('pengembalianModal'));
                modal?.hide();
                
                return;
            }

            const { error } = await supabase
                .from('peminjaman')
                .update(updateData)
                .eq('id', this.currentInvoice.id);

            if (error) throw error;

            if (updateData.denda > 0) {
                this.showInvoice(updateData);
            }

            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('pengembalianModal'));
            modal?.hide();

            this.showAlert('success', 'Pengembalian berhasil diproses!');
            await this.loadAllData();
        } catch (error) {
            this.handleError(error, 'Gagal memproses pengembalian');
        } finally {
            this.hideLoading();
        }
    }

    showInvoice(data) {
        const invoiceElements = {
            'invoiceHariTelat': data.hari_telat,
            'invoiceDenda': this.formatRupiah(data.denda),
            'invoiceTotal': this.formatRupiah(data.denda)
        };

        for (const [id, value] of Object.entries(invoiceElements)) {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        }
        
        const modal = new bootstrap.Modal(document.getElementById('invoiceModal'));
        modal.show();
    }

    async confirmPayment() {
        this.showLoading('Mengkonfirmasi pembayaran...');
        try {
            const { error } = await supabase
                .from('peminjaman')
                .update({ status: 'Lunas' })
                .eq('id', this.currentInvoice.id);

            if (error) throw error;

            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('confirmModal'));
            modal?.hide();

            this.showAlert('success', 'Pembayaran berhasil dikonfirmasi!');
            await this.loadAllData();
        } catch (error) {
            this.handleError(error, 'Gagal mengkonfirmasi pembayaran');
        } finally {
            this.hideLoading();
        }
    }

    // ====================== HISTORY MANAGEMENT ======================
    async loadRiwayat() {
        this.showLoading('Memuat riwayat...');
        try {
            let query = supabase
                .from('peminjaman')
                .select('*', { count: 'exact' })
                .order('tanggal_pinjam', { ascending: false });

            // Filter perpustakaan
            if (this.currentLibrary) {
                query = query.eq('perpustakaan_id', this.currentLibrary.id);
            }

            // Filter tanggal
            const dari = document.getElementById('filterDari')?.value;
            const sampai = document.getElementById('filterSampai')?.value;
            if (dari && sampai) {
                query = query.gte('tanggal_pinjam', dari).lte('tanggal_pinjam', sampai);
            }

            // Pencarian
            const searchTerm = document.getElementById('searchRiwayat')?.value.toLowerCase() || '';
            if (searchTerm) {
                query = query.or(`nama_peminjam.ilike.%${searchTerm}%,judul_buku.ilike.%${searchTerm}%`);
            }

            const { data, error, count } = await query;
            if (error) throw error;

            this.riwayatList = data || [];
            document.getElementById('totalData').textContent = count || 0;
            this.updateRiwayatTable();
            this.updatePagination();
        } catch (error) {
            this.handleError(error, 'Gagal memuat riwayat');
        } finally {
            this.hideLoading();
        }
    }

    updateRiwayatTable() {
        const tbody = document.getElementById('riwayatBody');
        if (!tbody) return;

        tbody.innerHTML = '';

        const start = (this.currentPage - 1) * this.ITEMS_PER_PAGE;
        const end = start + this.ITEMS_PER_PAGE;
        const currentData = this.riwayatList.slice(start, end);

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
                <td>${this.sanitizeInput(loan.judul_buku)}</td>
                <td>${this.sanitizeInput(loan.pengarang)}</td>
                <td>${this.sanitizeInput(loan.nama_peminjam)}</td>
                <td>${this.formatDate(loan.tanggal_pinjam)}</td>
                <td>${this.formatDate(loan.jatuh_tempo)}</td>
                <td>${loan.tanggal_kembali ? this.formatDate(loan.tanggal_kembali) : '-'}</td>
                <td>${loan.hari_telat || '-'} hari</td>
                <td>${loan.denda ? this.formatRupiah(loan.denda) : '-'}</td>
                <td><span class="${loan.status === 'Terlambat' ? 'status-late' : 'status-returned'}">${loan.status || '-'}</span></td>
            `;
            tbody.appendChild(row);
        });

        // Hitung total denda
        const totalDenda = this.riwayatList.reduce((sum, loan) => sum + (loan.denda || 0), 0);
        document.getElementById('totalDenda').textContent = this.formatRupiah(totalDenda);
    }

    updatePagination() {
        const btnPrev = document.getElementById('btnPrev');
        const btnNext = document.getElementById('btnNext');
        
        if (btnPrev) btnPrev.disabled = this.currentPage === 1;
        if (btnNext) btnNext.disabled = this.currentPage * this.ITEMS_PER_PAGE >= this.riwayatList.length;
    }

    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.updateRiwayatTable();
            this.updatePagination();
        }
    }

    nextPage() {
        if (this.currentPage * this.ITEMS_PER_PAGE < this.riwayatList.length) {
            this.currentPage++;
            this.updateRiwayatTable();
            this.updatePagination();
        }
    }

    searchRiwayat() {
        this.currentPage = 1;
        this.loadRiwayat();
    }

    // ====================== REPORT FUNCTIONS ======================
    async generateReports() {
        this.showLoading('Membuat laporan...');
        try {
            let queryMonthly = supabase
                .from('peminjaman')
                .select('tanggal_pinjam, count:id')
                .gte('tanggal_pinjam', this.getFirstDayOfMonth())
                .order('tanggal_pinjam', { ascending: true });

            let queryCategory = supabase
                .from('peminjaman')
                .select('kategori, count:id')
                .group('kategori');

            // Filter perpustakaan
            if (this.currentLibrary) {
                queryMonthly = queryMonthly.eq('perpustakaan_id', this.currentLibrary.id);
                queryCategory = queryCategory.eq('perpustakaan_id', this.currentLibrary.id);
            }

            const { data: monthlyData } = await queryMonthly;
            const { data: categoryData } = await queryCategory;
            
            this.renderCharts(monthlyData, categoryData);
            this.renderStats(this.riwayatList);
        } catch (error) {
            this.handleError(error, 'Gagal memuat laporan');
        } finally {
            this.hideLoading();
        }
    }

    renderCharts(monthlyData = [], categoryData = []) {
        const loanCtx = document.getElementById('loanChart')?.getContext('2d');
        const categoryCtx = document.getElementById('categoryChart')?.getContext('2d');
        
        // Hancurkan chart sebelumnya jika ada
        if (this.loanChart) this.loanChart.destroy();
        if (this.categoryChart) this.categoryChart.destroy();
        
        // Chart peminjaman bulanan
        if (loanCtx) {
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
        }
        
        // Chart kategori
        if (categoryCtx) {
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
    }

    renderStats(data = []) {
        const statsContainer = document.getElementById('statsContainer');
        if (!statsContainer) return;

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

    // ====================== EXPORT FUNCTIONS ======================
    async exportData(type = 'peminjaman', format = 'csv') {
        this.showLoading(`Menyiapkan data ${type}...`);
        
        try {
            let data, fileName, content;

            // Ambil data berdasarkan jenis
            if (type === 'peminjaman') {
                const { data: peminjaman } = await supabase
                    .from('peminjaman')
                    .select('*');
                data = peminjaman;
                fileName = `peminjaman_${new Date().toISOString().split('T')[0]}`;
            } else if (type === 'buku') {
                const { data: buku } = await supabase
                    .from('buku')
                    .select('*');
                data = buku;
                fileName = `daftar_buku_${new Date().toISOString().split('T')[0]}`;
            } else {
                throw new Error('Jenis data tidak valid');
            }

            // Format data
            if (format === 'csv') {
                content = this.convertToCSV(data);
                fileName += '.csv';
            } else if (format === 'json') {
                content = JSON.stringify(data, null, 2);
                fileName += '.json';
            } else {
                throw new Error('Format ekspor tidak valid');
            }

            // Buat file download
            const blob = new Blob([content], { type: `text/${format === 'csv' ? 'csv' : 'plain'}` });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (error) {
            this.handleError(error, `Gagal mengekspor data ${type}`);
        } finally {
            this.hideLoading();
        }
    }

    convertToCSV(data = []) {
        if (!data || data.length === 0) return '';
        
        const headers = Object.keys(data[0] || {});
        const rows = data.map(obj => 
            headers.map(header => {
                let value = obj[header];
                // Handle nilai null/undefined
                if (value === null || value === undefined) return '';
                // Handle tanggal
                if (header.includes('tanggal') && value) {
                    value = this.formatDate(value, 'short');
                }
                // Handle nilai yang mengandung koma
                return `"${value.toString().replace(/"/g, '""')}"`;
            }).join(',')
        );
        
        return [headers.join(','), ...rows].join('\n');
    }

    // ====================== NOTIFICATION FUNCTIONS ======================
    async sendReminder(loanId) {
        const peminjaman = this.peminjamanList.find(p => p.id === loanId);
        if (!peminjaman) return false;

        this.showLoading('Mengirim pengingat...');
        
        try {
            // Kirim via email (menggunakan Supabase Function)
            const { error: emailError } = await supabase.functions.invoke('send-email', {
                body: JSON.stringify({
                    to: peminjaman.email_peminjam,
                    subject: 'Pengingat Pengembalian Buku',
                    html: this.generateReminderEmail(peminjaman)
                })
            });

            if (emailError) throw emailError;

            // Kirim via WhatsApp (menggunakan API eksternal)
            if (peminjaman.no_hp) {
                const waMessage = this.generateReminderWhatsApp(peminjaman);
                await this.sendWhatsApp(peminjaman.no_hp, waMessage);
            }

            this.showAlert('success', 'Pengingat berhasil dikirim!');
            return true;
        } catch (error) {
            this.handleError(error, 'Gagal mengirim pengingat');
            return false;
        } finally {
            this.hideLoading();
        }
    }

    generateReminderEmail(peminjaman) {
        return `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4361ee;">Pengingat Pengembalian Buku</h2>
                <p>Halo ${this.sanitizeInput(peminjaman.nama_peminjam)},</p>
                <p>Berikut adalah detail peminjaman Anda:</p>
                
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    <tr>
                        <td style="padding: 8px; border: 1px solid #ddd; width: 30%;"><strong>Judul Buku</strong></td>
                        <td style="padding: 8px; border: 1px solid #ddd;">${this.sanitizeInput(peminjaman.judul_buku)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Tanggal Pinjam</strong></td>
                        <td style="padding: 8px; border: 1px solid #ddd;">${this.formatDate(peminjaman.tanggal_pinjam)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Jatuh Tempo</strong></td>
                        <td style="padding: 8px; border: 1px solid #ddd;">${this.formatDate(peminjaman.jatuh_tempo)}</td>
                    </tr>
                </table>
                
                <p>Silakan kembalikan buku sebelum jatuh tempo untuk menghindari denda.</p>
                <p style="color: #e74c3c;"><strong>Denda keterlambatan: ${this.formatRupiah(this.DENDA_PER_HARI)} per hari</strong></p>
                
                <p>Terima kasih,<br>Perpustakaan ${this.currentLibrary?.nama || ''}</p>
            </div>
        `;
    }

    generateReminderWhatsApp(peminjaman) {
        return `
Halo ${peminjaman.nama_peminjam},

Ini adalah pengingat untuk pengembalian buku:
Judul: ${peminjaman.judul_buku}
Tanggal Pinjam: ${this.formatDate(peminjaman.tanggal_pinjam)}
Jatuh Tempo: ${this.formatDate(peminjaman.jatuh_tempo)}

Silakan kembalikan buku sebelum jatuh tempo untuk menghindari denda.

Terima kasih,
Perpustakaan ${this.currentLibrary?.nama || ''}
        `;
    }

    async sendWhatsApp(phone, message) {
        try {
            // Implementasi aktual akan tergantung pada API yang digunakan
            // Contoh menggunakan Twilio API
            const response = await fetch('https://api.twilio.com/...', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
                },
                body: new URLSearchParams({
                    To: `whatsapp:${phone}`,
                    From: `whatsapp:${TWILIO_PHONE_NUMBER}`,
                    Body: message
                })
            });

            if (!response.ok) throw new Error('Gagal mengirim WhatsApp');
        } catch (error) {
            console.error('WhatsApp error:', error);
            throw error;
        }
    }

    // ====================== UI METHODS ======================
    showLoading(message = 'Memproses...') {
        const overlay = document.getElementById('loadingOverlay');
        const text = document.getElementById('loadingText');
        
        if (overlay) {
            overlay.style.display = 'flex';
            overlay.classList.add('animate__fadeIn');
            overlay.classList.remove('animate__fadeOut');
        }
        
        if (text) text.textContent = message;
    }

    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.add('animate__fadeOut');
            setTimeout(() => {
                overlay.style.display = 'none';
            }, 300);
        }
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
            ${this.sanitizeInput(message)}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        
        const container = document.getElementById('alertContainer');
        if (container) {
            container.appendChild(alert);
            
            setTimeout(() => {
                alert.classList.remove('animate__fadeIn');
                alert.classList.add('animate__fadeOut');
                setTimeout(() => alert.remove(), 300);
            }, 5000);
        }
    }

    handleError(error, message = 'Terjadi kesalahan') {
        console.error(error);
        this.showAlert('error', `${message}: ${error.message}`);
    }
}

// Inisialisasi sistem
const librarySystem = new LibrarySystem();
document.addEventListener('DOMContentLoaded', () => librarySystem.init());