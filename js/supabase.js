import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xqnlchcbxekwulncjvfy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxbmxjaGNieGVrd3VsbmNqdmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzI3NzE3OSwiZXhwIjoyMDYyODUzMTc5fQ.cdPk3YnDIdNzkCxmhsv5Tlk_Tc9oYIikY_POz1OcrNY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Row Level Security policy contoh di Supabase:
/*
-- Enable RLS untuk tabel peminjaman
ALTER TABLE peminjaman ENABLE ROW LEVEL SECURITY;

-- Policy: Hanya admin atau pemilik data yang bisa melihat
CREATE POLICY peminjaman_policy ON peminjaman
    USING (auth.uid() = user_id OR auth.jwt() ->> 'is_admin' = 'true');
*/