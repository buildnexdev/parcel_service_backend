const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const driverRoutes = require('./routes/driverRoutes');
const orderRoutes = require('./routes/orderRoutes');
const reportRoutes = require('./routes/reportRoutes');
const publicRoutes = require('./routes/publicRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve unified frontend (Vite production build)
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
const frontendStaticPath = path.join(__dirname, '..', 'frontend');
const staticPath = fs.existsSync(frontendDistPath) ? frontendDistPath : frontendStaticPath;

app.use(express.static(staticPath));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/public', publicRoutes);

// Health Check
app.get('/api/health', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 as test');
    res.json({ status: 'ok', time: new Date(), db: 'connected', test: rows[0].test });
  } catch (err) {
    res.status(500).json({ status: 'error', db: err.message });
  }
});

// App routing fallback for SPA
app.get('*', (req, res) => {
  const indexPath = path.join(staticPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.sendFile(path.join(frontendStaticPath, 'index.html'));
  }
});

// Start Server
app.listen(PORT, async () => {
  console.log(`=======================================================`);
  console.log(`🚀 ES TRANSPORTERS / IGR QUICK PARCEL SERVICE`);
  console.log(`🌐 React Vite Web App running at: http://localhost:${PORT}`);
  console.log(`📦 Head Office: Karaikal | Branch Office: Pondicherry`);
  console.log(`=======================================================`);
});
