-- =====================================================================
-- ES TRANSPORTERS / IGR QUICK PARCEL SERVICE
-- Database Schema (MySQL)
-- Database: es_transporters_db
-- =====================================================================

CREATE DATABASE IF NOT EXISTS es_transporters_db 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE es_transporters_db;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  phone VARCHAR(20),
  password VARCHAR(255) NOT NULL,
  role ENUM('admin', 'staff') DEFAULT 'admin',
  designation VARCHAR(100) DEFAULT 'Staff',
  branch VARCHAR(100) DEFAULT 'Karaikal',
  status ENUM('active', 'inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Branches Table
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

-- 3. Drivers Table
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

-- 3b. Vehicles / Fleet Table
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

-- 4. Orders Table
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
  delivery_status ENUM('BOOKED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'UNDELIVERED', 'CANCELLED') DEFAULT 'BOOKED',
  driver_id INT NULL,
  vehicle_id INT NULL,
  vehicle_no VARCHAR(50) NULL,
  delivery_date DATETIME NULL,
  remarks TEXT,
  created_by VARCHAR(50) DEFAULT 'Admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Tracking History Table
CREATE TABLE IF NOT EXISTS tracking_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  status VARCHAR(50) NOT NULL,
  location VARCHAR(100) NOT NULL,
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Inquiries Table
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

-- 7. Daily Expenses Table
CREATE TABLE IF NOT EXISTS daily_expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  expense_date DATE NOT NULL,
  category VARCHAR(50) NOT NULL,
  title VARCHAR(150) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  branch VARCHAR(100) DEFAULT 'Karaikal',
  payment_mode ENUM('CASH', 'UPI', 'BANK_TRANSFER', 'PETTY_CASH', 'CHEQUE') DEFAULT 'CASH',
  paid_to VARCHAR(100) NULL,
  voucher_no VARCHAR(50) NULL,
  vehicle_id INT NULL,
  vehicle_no VARCHAR(50) NULL,
  driver_id INT NULL,
  driver_name VARCHAR(100) NULL,
  notes TEXT NULL,
  created_by VARCHAR(100) DEFAULT 'Admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. Staff Attendance Table
CREATE TABLE IF NOT EXISTS staff_attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  attendance_date DATE NOT NULL,
  user_id INT NOT NULL,
  status ENUM('PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'ON_DUTY') DEFAULT 'PRESENT',
  check_in TIME NULL,
  check_out TIME NULL,
  working_hours DECIMAL(4,2) NULL,
  overtime_hours DECIMAL(4,2) DEFAULT 0.00,
  branch VARCHAR(100) DEFAULT 'Karaikal',
  notes VARCHAR(255) NULL,
  marked_by VARCHAR(100) DEFAULT 'Admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_date (user_id, attendance_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. User Permissions Table
CREATE TABLE IF NOT EXISTS user_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  module VARCHAR(50) NOT NULL,
  can_view TINYINT(1) DEFAULT 1,
  can_add TINYINT(1) DEFAULT 0,
  can_edit TINYINT(1) DEFAULT 0,
  can_delete TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_module (user_id, module),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

