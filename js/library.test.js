import { LibrarySystem } from './library.js';
import { supabase } from './supabase.js';

// Mock Supabase client
jest.mock('./supabase.js', () => ({
    supabase: {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        auth: {
            signInWithPassword: jest.fn()
        }
    }
}));

describe('LibrarySystem', () => {
    let library;

    beforeEach(() => {
        library = new LibrarySystem();
    });

    test('should initialize correctly', () => {
        expect(library).toBeInstanceOf(LibrarySystem);
        expect(library.DENDA_PER_HARI).toBe(5000);
    });

    describe('validateForm', () => {
        test('should validate required fields', () => {
            document.body.innerHTML = `
                <input id="judulBuku">
                <input id="namaPeminjam">
                <input id="noHp" value="08123456789">
                <input id="tanggalPinjam" value="${new Date().toISOString().split('T')[0]}">
            `;
            
            expect(library.validateForm()).toBe(false);
        });

        test('should validate phone number format', () => {
            document.body.innerHTML = `
                <input id="noHp" value="123">
                <input id="tanggalPinjam" value="${new Date().toISOString().split('T')[0]}">
            `;
            
            expect(library.validateForm()).toBe(false);
        });
    });

    describe('formatRupiah', () => {
        test('should format number to Rupiah', () => {
            expect(library.formatRupiah(10000)).toBe('Rp10.000');
            expect(library.formatRupiah(2500000)).toBe('Rp2.500.000');
        });
    });

    // Tambahkan test lainnya
});