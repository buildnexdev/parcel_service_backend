const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = require('./config/db');
const initializeDatabase = require('./database/init_db');
const authRoutes = require('./routes/authRoutes');
const driverRoutes = require('./routes/driverRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');
const staffRoutes = require('./routes/staffRoutes');
const orderRoutes = require('./routes/orderRoutes');
const reportRoutes = require('./routes/reportRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const permissionRoutes = require('./routes/permissionRoutes');
const publicRoutes = require('./routes/publicRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve unified frontend (Vite production build if present locally)
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
const frontendStaticPath = path.join(__dirname, '..', 'frontend');
const staticPath = fs.existsSync(frontendDistPath) ? frontendDistPath : frontendStaticPath;

if (fs.existsSync(staticPath)) {
  app.use(express.static(staticPath));
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/permissions', permissionRoutes);
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

// Explicit Database Initialization / Verification Endpoint
app.get('/api/init-db', async (req, res) => {
  try {
    await initializeDatabase();
    res.json({
      success: true,
      message: 'Database schema verified and initial admin/branches ensured successfully'
    });
  } catch (err) {
    console.error('Manual DB Init Error:', err);
    res.status(500).json({ success: false, message: 'DB Init error', error: err.message });
  }
});

// App routing fallback for SPA or API info
app.get('*', (req, res) => {
  const indexPath = path.join(staticPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  return res.json({
    status: 'ok',
    service: 'ES TRANSPORTERS / IGR QUICK PARCEL SERVICE BACKEND API',
    endpoints: {
      health: '/api/health',
      initDb: '/api/init-db',
      auth: '/api/auth/login',
      branches: '/api/public/branches',
      track: '/api/public/track/:lrNumber'
    }
  });
});

// Start Server & Auto-init Database
app.listen(PORT, async () => {
  console.log(`=======================================================`);
  console.log(`🚀 ES TRANSPORTERS / IGR QUICK PARCEL SERVICE`);
  console.log(`🌐 Server running at: http://localhost:${PORT}`);
  console.log(`📦 Head Office: Karaikal | Branch Office: Pondicherry`);
  console.log(`=======================================================`);

  try {
    await initializeDatabase();
    console.log('✅ Startup database check & seed completed successfully.');
  } catch (err) {
    console.error('⚠️ Startup database initialization failed:', err.message);
  }
});
