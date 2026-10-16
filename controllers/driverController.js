const pool = require('../config/db');

exports.getDrivers = async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = `
      SELECT d.*, 
        (SELECT COUNT(*) FROM orders o WHERE o.driver_id = d.id AND o.delivery_status IN ('BOOKED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY')) as active_deliveries_count,
        (SELECT COUNT(*) FROM orders o WHERE o.driver_id = d.id) as total_deliveries_count
      FROM drivers d
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ` AND d.status = ?`;
      params.push(status);
    }

    if (search) {
      query += ` AND (d.name LIKE ? OR d.phone LIKE ? OR d.vehicle_no LIKE ? OR d.assigned_route LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    query += ` ORDER BY d.status = 'on_duty' DESC, d.status = 'active' DESC, d.name ASC`;

    const [drivers] = await pool.query(query, params);
    return res.json({ success: true, count: drivers.length, drivers });
  } catch (err) {
    console.error('Get drivers error:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving drivers' });
  }
};

exports.getDriverById = async (req, res) => {
  try {
    const [drivers] = await pool.query('SELECT * FROM drivers WHERE id = ?', [req.params.id]);
    if (drivers.length === 0) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }
    return res.json({ success: true, driver: drivers[0] });
  } catch (err) {
    console.error('Get driver by id error:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving driver' });
  }
};

exports.createDriver = async (req, res) => {
  try {
    const { name, phone, license_no, vehicle_no, assigned_route, status } = req.body;
    if (!name || !phone || !vehicle_no) {
      return res.status(400).json({ success: false, message: 'Please provide driver name, phone number, and vehicle number.' });
    }
    const cleanPhone = phone.toString().replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ success: false, message: 'Driver phone number must be exactly 10 digits.' });
    }

    const [result] = await pool.query(
      `INSERT INTO drivers (name, phone, license_no, vehicle_no, assigned_route, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        phone.trim(),
        license_no ? license_no.trim() : null,
        vehicle_no.trim().toUpperCase(),
        assigned_route ? assigned_route.trim() : 'Karaikal - Pondicherry',
        status || 'active'
      ]
    );

    const [newDriver] = await pool.query('SELECT * FROM drivers WHERE id = ?', [result.insertId]);
    return res.status(201).json({
      success: true,
      message: 'Driver added successfully!',
      driver: newDriver[0]
    });
  } catch (err) {
    console.error('Create driver error:', err);
    return res.status(500).json({ success: false, message: 'Server error adding driver', error: err.message });
  }
};

exports.updateDriver = async (req, res) => {
  try {
    const { name, phone, license_no, vehicle_no, assigned_route, status } = req.body;
    const { id } = req.params;

    const [existing] = await pool.query('SELECT id FROM drivers WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    let cleanPhone = null;
    if (phone) {
      cleanPhone = phone.toString().replace(/\D/g, '');
      if (cleanPhone.length !== 10) {
        return res.status(400).json({ success: false, message: 'Driver phone number must be exactly 10 digits.' });
      }
    }

    await pool.query(
      `UPDATE drivers 
       SET name = COALESCE(?, name),
           phone = COALESCE(?, phone),
           license_no = COALESCE(?, license_no),
           vehicle_no = COALESCE(?, vehicle_no),
           assigned_route = COALESCE(?, assigned_route),
           status = COALESCE(?, status)
       WHERE id = ?`,
      [name, phone, license_no, vehicle_no ? vehicle_no.toUpperCase() : null, assigned_route, status, id]
    );

    const [updated] = await pool.query('SELECT * FROM drivers WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Driver updated successfully', driver: updated[0] });
  } catch (err) {
    console.error('Update driver error:', err);
    return res.status(500).json({ success: false, message: 'Server error updating driver' });
  }
};

exports.deleteDriver = async (req, res) => {
  try {
    const { id } = req.params;
    // Check if driver has active shipments
    const [activeOrders] = await pool.query(
      "SELECT id FROM orders WHERE driver_id = ? AND delivery_status IN ('BOOKED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY')",
      [id]
    );
    if (activeOrders.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete driver with active in-progress deliveries. Reassign orders or mark them as completed first.'
      });
    }

    await pool.query('DELETE FROM drivers WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Driver removed successfully' });
  } catch (err) {
    console.error('Delete driver error:', err);
    return res.status(500).json({ success: false, message: 'Server error deleting driver' });
  }
};
