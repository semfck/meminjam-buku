// server.js
require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Middleware
app.use(express.json());
app.use(require('helmet')());
app.use(require('cors')());

// Authentication middleware
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  // Verify token (JWT validation would go here)
  next();
};

// API endpoints
app.get('/api/books', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('buku')
      .select('*')
      .order('judul', { ascending: true });
    
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add other endpoints similarly...

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});