const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const bukuRoutes = require('./routes/buku');
const peminjamanRoutes = require('./routes/peminjaman');

// Database configuration
require('./config/database');

// Middleware
app.use(bodyParser.json());

// Routes
app.use('/buku', bukuRoutes);
app.use('/peminjaman', peminjamanRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

module.exports = app;