const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Please provide username and password' });
    }

    const identifier = username.trim();
    const phoneDigits = identifier.replace(/\D/g, '');

    const [users] = await pool.query(
      `SELECT * FROM users 
       WHERE username = ? 
          OR email = ? 
          OR phone = ? 
          OR (LENGTH(?) >= 10 AND REPLACE(phone, ' ', '') = ?)
       LIMIT 1`,
      [identifier, identifier, identifier, phoneDigits, phoneDigits]
    );

    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials. User not found.' });
    }

    const user = users[0];
    if (user.status === 'inactive') {
      return res.status(403).json({ success: false, message: 'Your account is deactivated. Please contact the administrator.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid password. Please check your credentials.' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, name: user.name, branch: user.branch, designation: user.designation || 'Staff' },
      process.env.JWT_SECRET || 'es_transporters_jwt_secret_2026_super_secure_key',
      { expiresIn: '24h' }
    );

    const safeUser = {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      phone: user.phone,
      role: user.role,
      designation: user.designation || 'Staff',
      branch: user.branch,
      status: user.status || 'active'
    };

    return res.json({
      success: true,
      message: 'Login successful',
      token,
      expiresIn: 86400, // 24 hours in seconds
      user: safeUser
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Server error during login', error: err.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, name, username, email, phone, role, designation, branch, status, created_at FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.json({ success: true, user: users[0] });
  } catch (err) {
    console.error('Get profile error:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving profile' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Please provide both current and new password' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long' });
    }

    const [users] = await pool.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, users[0].password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password does not match' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);

    return res.json({ success: true, message: 'Password updated successfully!' });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ success: false, message: 'Server error updating password' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, branch } = req.body;
    await pool.query(
      'UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), branch = COALESCE(?, branch) WHERE id = ?',
      [name, phone, branch, req.user.id]
    );

    const [users] = await pool.query('SELECT id, name, username, email, phone, role, branch FROM users WHERE id = ?', [req.user.id]);
    return res.json({ success: true, message: 'Profile updated successfully', user: users[0] });
  } catch (err) {
    console.error('Update profile error:', err);
    return res.status(500).json({ success: false, message: 'Server error updating profile' });
  }
};
