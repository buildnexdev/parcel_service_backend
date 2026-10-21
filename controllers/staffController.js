const pool = require('../config/db');
const bcrypt = require('bcryptjs');

// 1. Get all staff members with optional filters & analytics stats
exports.getStaff = async (req, res) => {
  try {
    const { search, branch, designation, role, status } = req.query;

    let query = `
      SELECT id, name, username, email, phone, role, designation, branch, status, created_at, updated_at
      FROM users
      WHERE 1=1
    `;
    const params = [];

    if (branch && branch !== 'ALL') {
      query += ` AND branch = ?`;
      params.push(branch);
    }

    if (designation && designation !== 'ALL') {
      query += ` AND designation = ?`;
      params.push(designation);
    }

    if (role && role !== 'ALL') {
      query += ` AND role = ?`;
      params.push(role);
    }

    if (status && status !== 'ALL') {
      query += ` AND status = ?`;
      params.push(status);
    }

    if (search && search.trim()) {
      query += ` AND (name LIKE ? OR username LIKE ? OR phone LIKE ? OR email LIKE ? OR branch LIKE ? OR designation LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term, term, term);
    }

    query += ` ORDER BY FIELD(role, 'admin', 'staff'), FIELD(designation, 'Proprietor', 'Partner', 'Branch Incharge') DESC, id ASC`;

    const [staff] = await pool.query(query, params);

    // Compute overview statistics
    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total_staff,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_staff,
        SUM(CASE WHEN designation = 'Branch Incharge' THEN 1 ELSE 0 END) as branch_incharges,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admins,
        COUNT(DISTINCT branch) as unique_branches
      FROM users
    `);

    return res.json({
      success: true,
      count: staff.length,
      staff,
      stats: stats[0] || { total_staff: 0, active_staff: 0, branch_incharges: 0, admins: 0, unique_branches: 0 }
    });
  } catch (err) {
    console.error('Get staff error:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving staff directory' });
  }
};

// 2. Get single staff member by ID
exports.getStaffById = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, username, email, phone, role, designation, branch, status, created_at, updated_at FROM users WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Staff member not found' });
    }
    return res.json({ success: true, staff: rows[0] });
  } catch (err) {
    console.error('Get staff by ID error:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving staff member' });
  }
};

// 3. Create a new staff member
exports.createStaff = async (req, res) => {
  try {
    const { name, username, email, phone, password, role = 'staff', designation = 'Staff', branch = 'Karaikal', status = 'active' } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Full name is required.' });
    }
    if (!username || !username.trim()) {
      return res.status(400).json({ success: false, message: 'Username is required.' });
    }
    if (!password || password.trim().length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    const cleanEmail = (email && email.trim()) ? email.trim().toLowerCase() : `${cleanUsername}@estransporters.com`;
    const cleanPhone = phone ? phone.toString().replace(/\D/g, '') : null;

    if (cleanPhone && cleanPhone.length !== 10) {
      return res.status(400).json({ success: false, message: 'Phone number must be exactly 10 digits.' });
    }

    // Check username or email uniqueness
    const [existing] = await pool.query(
      'SELECT id, username, email FROM users WHERE username = ? OR email = ? LIMIT 1',
      [cleanUsername, cleanEmail]
    );

    if (existing.length > 0) {
      if (existing[0].username === cleanUsername) {
        return res.status(400).json({ success: false, message: `Username "${cleanUsername}" is already taken.` });
      }
      return res.status(400).json({ success: false, message: `Email "${cleanEmail}" is already registered.` });
    }

    const hashedPassword = await bcrypt.hash(password.trim(), 10);

    const [result] = await pool.query(
      `INSERT INTO users (name, username, email, phone, password, role, designation, branch, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        cleanUsername,
        cleanEmail,
        cleanPhone,
        hashedPassword,
        role === 'admin' ? 'admin' : 'staff',
        designation.trim() || 'Staff',
        branch.trim() || 'Karaikal',
        status === 'inactive' ? 'inactive' : 'active'
      ]
    );

    const [newUser] = await pool.query(
      'SELECT id, name, username, email, phone, role, designation, branch, status, created_at FROM users WHERE id = ?',
      [result.insertId]
    );

    return res.status(201).json({
      success: true,
      message: `Staff member "${name.trim()}" added successfully!`,
      staff: newUser[0]
    });
  } catch (err) {
    console.error('Create staff error:', err);
    return res.status(500).json({ success: false, message: 'Server error adding staff member', error: err.message });
  }
};

// 4. Update an existing staff member
exports.updateStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, username, email, phone, password, role, designation, branch, status } = req.body;

    const [existing] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Staff member not found.' });
    }

    const currentStaff = existing[0];

    // Safety: prevent deactivating or demoting the primary 'admin' account
    if (currentStaff.username === 'admin') {
      if (status === 'inactive') {
        return res.status(400).json({ success: false, message: 'The primary super-administrator account cannot be deactivated.' });
      }
      if (role && role !== 'admin') {
        return res.status(400).json({ success: false, message: 'The primary super-administrator role cannot be demoted.' });
      }
    }

    const cleanUsername = username ? username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '') : currentStaff.username;
    const cleanEmail = email ? email.trim().toLowerCase() : currentStaff.email;
    const cleanPhone = phone !== undefined ? (phone ? phone.toString().replace(/\D/g, '') : null) : currentStaff.phone;

    if (cleanPhone && cleanPhone.length !== 10) {
      return res.status(400).json({ success: false, message: 'Phone number must be exactly 10 digits.' });
    }

    // Check username uniqueness if changed
    if (cleanUsername !== currentStaff.username) {
      const [uCheck] = await pool.query('SELECT id FROM users WHERE username = ? AND id != ? LIMIT 1', [cleanUsername, id]);
      if (uCheck.length > 0) {
        return res.status(400).json({ success: false, message: `Username "${cleanUsername}" is already taken.` });
      }
    }

    // Check email uniqueness if changed
    if (cleanEmail !== currentStaff.email) {
      const [eCheck] = await pool.query('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1', [cleanEmail, id]);
      if (eCheck.length > 0) {
        return res.status(400).json({ success: false, message: `Email "${cleanEmail}" is already taken.` });
      }
    }

    let passwordHash = currentStaff.password;
    if (password && password.trim().length >= 6) {
      passwordHash = await bcrypt.hash(password.trim(), 10);
    }

    await pool.query(
      `UPDATE users 
       SET name = ?, username = ?, email = ?, phone = ?, password = ?, role = ?, designation = ?, branch = ?, status = ?
       WHERE id = ?`,
      [
        name ? name.trim() : currentStaff.name,
        cleanUsername,
        cleanEmail,
        cleanPhone,
        passwordHash,
        role || currentStaff.role,
        designation || currentStaff.designation,
        branch || currentStaff.branch,
        status || currentStaff.status,
        id
      ]
    );

    const [updated] = await pool.query(
      'SELECT id, name, username, email, phone, role, designation, branch, status, created_at, updated_at FROM users WHERE id = ?',
      [id]
    );

    return res.json({
      success: true,
      message: 'Staff details updated successfully!',
      staff: updated[0]
    });
  } catch (err) {
    console.error('Update staff error:', err);
    return res.status(500).json({ success: false, message: 'Server error updating staff member', error: err.message });
  }
};

// 5. Delete staff member
exports.deleteStaff = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query('SELECT id, name, username, role FROM users WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Staff member not found.' });
    }

    const staff = rows[0];

    // Cannot delete super admin
    if (staff.username === 'admin') {
      return res.status(403).json({ success: false, message: 'The primary super-administrator cannot be deleted.' });
    }

    // Cannot delete yourself
    if (req.user && req.user.id == id) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own logged-in account.' });
    }

    await pool.query('DELETE FROM users WHERE id = ?', [id]);

    return res.json({
      success: true,
      message: `Staff member "${staff.name}" has been removed.`
    });
  } catch (err) {
    console.error('Delete staff error:', err);
    return res.status(500).json({ success: false, message: 'Server error deleting staff member' });
  }
};

// 6. Reset password specifically
exports.resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.trim().length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword.trim(), 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id]);

    return res.json({
      success: true,
      message: 'Password reset successfully!'
    });
  } catch (err) {
    console.error('Reset staff password error:', err);
    return res.status(500).json({ success: false, message: 'Server error resetting password' });
  }
};
