# API Documentation - Sistem Peminjaman Buku

## Endpoints

### Buku
- `GET /buku` - Mendapatkan daftar buku
  ```json
  {
    "id": "uuid",
    "judul": "string",
    "pengarang": "string",
    "tahun_terbit": "number",
    "kategori": "string",
    "status": "string"
  }
  ```

### Peminjaman
- `POST /peminjaman` - Membuat peminjaman baru
  ```json
  {
    "kode_buku": "string",
    "nama_peminjam": "string",
    "no_hp": "string",
    "tanggal_pinjam": "date",
    "jatuh_tempo": "date",
    "lama_pinjam": "number",
    "catatan": "string"
  }
  ```

### Pengembalian
- `PATCH /peminjaman/:id` - Memproses pengembalian
  ```json
  {
    "tanggal_kembali": "date",
    "hari_telat": "number",
    "denda": "number",
    "status": "string"
  }
  ```

## Contoh Penggunaan

```javascript
// Mendapatkan daftar buku
const { data, error } = await supabase
    .from('buku')
    .select('*');

// Membuat peminjaman baru
const { error } = await supabase
    .from('peminjaman')
    .insert([{
        kode_buku: 'BK001',
        nama_peminjam: 'John Doe',
        no_hp: '08123456789',
        tanggal_pinjam: '2023-06-01',
        jatuh_tempo: '2023-06-08',
        lama_pinjam: 1,
        catatan: 'Pinjam untuk penelitian'
    }]);
```