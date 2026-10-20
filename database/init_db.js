const pool = require('../config/db');
const bcrypt = require('bcryptjs');

async function initializeDatabase() {
  console.log('🔄 Initializing database tables...');

  // 1. Users table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      phone VARCHAR(20),
      password VARCHAR(255) NOT NULL,
      role ENUM('admin', 'staff') DEFAULT 'admin',
      branch VARCHAR(100) DEFAULT 'Karaikal',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 2. Branches table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS branches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      code VARCHAR(20) NOT NULL UNIQUE,
      address TEXT,
      phone VARCHAR(100),
      is_head_office BOOLEAN DEFAULT FALSE,
      is_branch_office BOOLEAN DEFAULT FALSE,
      status ENUM('active', 'inactive') DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 3. Drivers table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS drivers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      license_no VARCHAR(50),
      vehicle_no VARCHAR(50) NOT NULL,
      assigned_route VARCHAR(100) DEFAULT 'Karaikal - Pondicherry',
      status ENUM('active', 'on_duty', 'inactive') DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 3b. Vehicles table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vehicle_no VARCHAR(50) NOT NULL UNIQUE,
      vehicle_type VARCHAR(50) DEFAULT 'Lorry',
      model_name VARCHAR(100) NULL,
      capacity VARCHAR(50) DEFAULT '2.5 Ton',
      driver_name VARCHAR(100) NULL,
      driver_phone VARCHAR(20) NULL,
      owner_name VARCHAR(100) NULL,
      ownership_type ENUM('OWN', 'ATTACHED', 'MARKET') DEFAULT 'OWN',
      assigned_route VARCHAR(100) DEFAULT 'Karaikal - Pondicherry',
      rc_number VARCHAR(50) NULL,
      insurance_expiry DATE NULL,
      fitness_expiry DATE NULL,
      status ENUM('active', 'in_transit', 'maintenance', 'inactive') DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 4. Orders table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      lr_number VARCHAR(50) UNIQUE NOT NULL,
      booking_date DATE NOT NULL,
      booking_time TIME NOT NULL,
      sender_name VARCHAR(100) NOT NULL,
      sender_phone VARCHAR(20),
      sender_address TEXT,
      receiver_name VARCHAR(100) NOT NULL,
      receiver_phone VARCHAR(20),
      receiver_address TEXT,
      from_station VARCHAR(100) NOT NULL,
      to_station VARCHAR(100) NOT NULL,
      pieces INT DEFAULT 1,
      rate_per_piece DECIMAL(10,2) DEFAULT 0.00,
      weight_kg DECIMAL(10,2) DEFAULT 0.00,
      box_details TEXT NULL,
      description VARCHAR(255) DEFAULT 'Goods',
      payment_mode ENUM('PAID', 'TO_PAY', 'CREDIT') DEFAULT 'TO_PAY',
      payment_status ENUM('PAID', 'UNPAID', 'PARTIALLY_PAID') DEFAULT 'UNPAID',
      payment_method ENUM('CASH', 'UPI', 'BANK_TRANSFER', 'CREDIT') DEFAULT 'CASH',
      freight_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      other_charges DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      delivery_status ENUM('BOOKED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED') DEFAULT 'BOOKED',
      driver_id INT NULL,
      vehicle_id INT NULL,
      vehicle_no VARCHAR(50) NULL,
      delivery_date DATETIME NULL,
      remarks TEXT,
      created_by VARCHAR(50) DEFAULT 'Admin',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Ensure orders table has vehicle, rate_per_piece, and box_details columns
  try {
    const [cols] = await pool.query('SHOW COLUMNS FROM orders');
    const existingCols = cols.map(c => c.Field);
    if (!existingCols.includes('vehicle_id')) {
      await pool.query('ALTER TABLE orders ADD COLUMN vehicle_id INT NULL AFTER driver_id');
    }
    if (!existingCols.includes('vehicle_no')) {
      await pool.query('ALTER TABLE orders ADD COLUMN vehicle_no VARCHAR(50) NULL AFTER vehicle_id');
    }
    if (!existingCols.includes('rate_per_piece')) {
      await pool.query('ALTER TABLE orders ADD COLUMN rate_per_piece DECIMAL(10,2) DEFAULT 0.00 AFTER pieces');
    }
    if (!existingCols.includes('box_details')) {
      await pool.query('ALTER TABLE orders ADD COLUMN box_details TEXT NULL AFTER weight_kg');
    }
  } catch (err) {
    console.warn('Note on orders columns check:', err.message);
  }

  // 5. Tracking history table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tracking_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      status VARCHAR(50) NOT NULL,
      location VARCHAR(100) NOT NULL,
      note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 6. Public inquiries table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inquiries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      email VARCHAR(100),
      from_station VARCHAR(100),
      to_station VARCHAR(100),
      message TEXT,
      status ENUM('new', 'contacted', 'resolved') DEFAULT 'new',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  console.log('✅ All 7 database tables created / verified successfully!');

  // Seed default fleet vehicles (if not exists)
  const [existingVehicles] = await pool.query('SELECT COUNT(*) as count FROM vehicles');
  if (existingVehicles[0].count === 0) {
    const defaultVehicles = [
      {
        vehicle_no: 'PY 02 C 5678',
        vehicle_type: 'Ashok Leyland Dost',
        model_name: 'Dost Strong (BS6)',
        capacity: '2.5 Ton',
        driver_name: 'Agal',
        driver_phone: '9876543210',
        owner_name: 'ES Transporters',
        ownership_type: 'OWN',
        assigned_route: 'Karaikal - Pondicherry',
        status: 'active'
      },
      {
        vehicle_no: 'TN 49 AB 1234',
        vehicle_type: 'Tata 407 Lorry',
        model_name: 'Tata 407 Gold SFC',
        capacity: '4.5 Ton',
        driver_name: 'Mathavan',
        driver_phone: '9360427527',
        owner_name: 'ES Transporters',
        ownership_type: 'OWN',
        assigned_route: 'Karaikal - Nagapattinam',
        status: 'active'
      },
      {
        vehicle_no: 'TN 51 Q 9081',
        vehicle_type: 'Eicher 14ft Container',
        model_name: 'Eicher Pro 2049',
        capacity: '5.0 Ton',
        driver_name: 'Senthil Kumar',
        driver_phone: '9655566060',
        owner_name: 'Attached Partner',
        ownership_type: 'ATTACHED',
        assigned_route: 'Pondicherry - Cuddalore',
        status: 'active'
      }
    ];

    for (const v of defaultVehicles) {
      await pool.query(
        `INSERT INTO vehicles (vehicle_no, vehicle_type, model_name, capacity, driver_name, driver_phone, owner_name, ownership_type, assigned_route, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [v.vehicle_no, v.vehicle_type, v.model_name, v.capacity, v.driver_name, v.driver_phone, v.owner_name, v.ownership_type, v.assigned_route, v.status]
      );
    }
    console.log('🚛 Default fleet vehicles registered successfully!');
  }

  // Seed default Admin login account only (if not exists)
  const [existingUser] = await pool.query('SELECT id FROM users WHERE username = ?', ['admin']);
  if (existingUser.length === 0) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await pool.query(
      `INSERT INTO users (name, username, email, phone, password, role, branch) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['Mathavan (Admin)', 'admin', 'admin@estransporters.com', '9360427527', hashedPassword, 'admin', 'Karaikal']
    );
    console.log('👤 Initial Admin created: username="admin", password="admin123"');
  }

  // Seed the 12 official company network branches (permanent branch list)
  const [existingBranches] = await pool.query('SELECT COUNT(*) as count FROM branches');
  if (existingBranches[0].count === 0) {
    const branchesData = [
      { name: 'Karaikal', code: 'KL', address: 'No.18, Sastha Nagar, Near Radio Station, Karaikal - 609 602 (Church St Reg: 32, Church St)', phone: '93604 27527 / 96555 66060', is_head_office: 1, is_branch_office: 0 },
      { name: 'Pondicherry', code: 'PD', address: 'No.9, Throwpathi Amman Kovil Street, Arumathapuram, Puducherry - 605 110', phone: '94424 85296 / 93604 27527', is_head_office: 0, is_branch_office: 1 },
      { name: 'Cuddalore', code: 'CUD', address: 'Bus Stand Road / Main Bazaar, Cuddalore', phone: '90476 36351', is_head_office: 0, is_branch_office: 0 },
      { name: 'Chidambaram', code: 'CDM', address: 'West Car Street / Bazaar Area, Chidambaram', phone: '96555 66060', is_head_office: 0, is_branch_office: 0 },
      { name: 'Parangipettai', code: 'PGP', address: 'Main Road, Parangipettai (Porto Novo)', phone: '93604 27527', is_head_office: 0, is_branch_office: 0 },
      { name: 'Sirkali', code: 'SRK', address: 'Old Bus Stand Road, Sirkazhi', phone: '94424 85296', is_head_office: 0, is_branch_office: 0 },
      { name: 'Mayiladuthurai', code: 'MYL', address: 'Near Railway Junction Road, Mayiladuthurai', phone: '96555 66060', is_head_office: 0, is_branch_office: 0 },
      { name: 'Nagore', code: 'NGR', address: 'Dargah Main Road, Nagore', phone: '90476 36351', is_head_office: 0, is_branch_office: 0 },
      { name: 'Nagapattinam', code: 'NGP', address: 'Public Office Road, Nagapattinam', phone: '93604 27527', is_head_office: 0, is_branch_office: 0 },
      { name: 'Thiruvarur', code: 'TVR', address: 'South Street / New Bus Stand, Thiruvarur', phone: '94424 85296', is_head_office: 0, is_branch_office: 0 },
      { name: 'Thiruthuraipoondi', code: 'TTP', address: 'Katchery Street, Thiruthuraipoondi', phone: '96555 66060', is_head_office: 0, is_branch_office: 0 },
      { name: 'Vedaranyam', code: 'VDM', address: 'Salt Road / Bus Stand, Vedaranyam', phone: '90476 36351', is_head_office: 0, is_branch_office: 0 }
    ];

    for (const b of branchesData) {
      await pool.query(
        'INSERT INTO branches (name, code, address, phone, is_head_office, is_branch_office) VALUES (?, ?, ?, ?, ?, ?)',
        [b.name, b.code, b.address, b.phone, b.is_head_office, b.is_branch_office]
      );
    }
    console.log('📍 12 Branches registered successfully!');
  }

  console.log('✨ Table creation complete without any dummy orders or drivers.');
}

if (require.main === module) {
  initializeDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Database initialization error:', err);
      process.exit(1);
    });
}

module.exports = initializeDatabase;
