const pool = require('../config/db');

exports.getVehicles = async (req, res) => {
  try {
    const { status, search, ownership_type } = req.query;
    let query = `
      SELECT v.*, 
        (SELECT COUNT(*) FROM orders o 
         WHERE (o.vehicle_id = v.id OR o.vehicle_no = v.vehicle_no) 
           AND o.delivery_status IN ('BOOKED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY')) as active_deliveries_count,
        (SELECT COUNT(*) FROM orders o 
         WHERE o.vehicle_id = v.id OR o.vehicle_no = v.vehicle_no) as total_deliveries_count
      FROM vehicles v
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'ALL') {
      query += ` AND v.status = ?`;
      params.push(status);
    }

    if (ownership_type && ownership_type !== 'ALL') {
      query += ` AND v.ownership_type = ?`;
      params.push(ownership_type);
    }

    if (search) {
      query += ` AND (v.vehicle_no LIKE ? OR v.vehicle_type LIKE ? OR v.model_name LIKE ? OR v.driver_name LIKE ? OR v.driver_phone LIKE ? OR v.assigned_route LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term, term, term, term);
    }

    query += ` ORDER BY v.status = 'active' DESC, v.status = 'in_transit' DESC, v.vehicle_no ASC`;

    const [vehicles] = await pool.query(query, params);

    // Get overview statistics
    const [statsResult] = await pool.query(`
      SELECT 
        COUNT(*) as total_vehicles,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
        SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END) as in_transit_count,
        SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) as maintenance_count,
        SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive_count
      FROM vehicles
    `);

    return res.json({
      success: true,
      count: vehicles.length,
      vehicles,
      stats: statsResult[0] || {}
    });
  } catch (err) {
    console.error('Get vehicles error:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving vehicles' });
  }
};

exports.getVehicleById = async (req, res) => {
  try {
    const { id } = req.params;
    const [vehicles] = await pool.query('SELECT * FROM vehicles WHERE id = ?', [id]);
    if (vehicles.length === 0) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    // Also fetch recent orders for this vehicle
    const [recentOrders] = await pool.query(
      `SELECT id, lr_number, booking_date, from_station, to_station, delivery_status, total_amount 
       FROM orders 
       WHERE vehicle_id = ? OR vehicle_no = ? 
       ORDER BY id DESC LIMIT 10`,
      [id, vehicles[0].vehicle_no]
    );

    return res.json({
      success: true,
      vehicle: vehicles[0],
      recentOrders
    });
  } catch (err) {
    console.error('Get vehicle by id error:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving vehicle' });
  }
};

exports.createVehicle = async (req, res) => {
  try {
    const {
      vehicle_no,
      vehicle_type = 'Lorry',
      model_name = '',
      capacity = '2.5 Ton',
      driver_name = '',
      driver_phone = '',
      owner_name = '',
      ownership_type = 'OWN',
      assigned_route = 'Karaikal - Pondicherry',
      rc_number = '',
      insurance_expiry = null,
      fitness_expiry = null,
      status = 'active'
    } = req.body;

    if (!vehicle_no || vehicle_no.trim() === '') {
      return res.status(400).json({ success: false, message: 'Vehicle registration number is required.' });
    }

    const cleanVehicleNo = vehicle_no.trim().toUpperCase();

    // Check duplicate
    const [dup] = await pool.query('SELECT id FROM vehicles WHERE vehicle_no = ?', [cleanVehicleNo]);
    if (dup.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Vehicle number "${cleanVehicleNo}" is already registered in the fleet.`
      });
    }

    if (driver_phone) {
      const cleanPhone = driver_phone.toString().replace(/\D/g, '');
      if (cleanPhone.length > 0 && cleanPhone.length !== 10) {
        return res.status(400).json({ success: false, message: 'Driver phone number must be exactly 10 digits.' });
      }
    }

    const [result] = await pool.query(
      `INSERT INTO vehicles (
        vehicle_no, vehicle_type, model_name, capacity, driver_name, driver_phone,
        owner_name, ownership_type, assigned_route, rc_number, insurance_expiry, fitness_expiry, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cleanVehicleNo,
        vehicle_type.trim(),
        model_name ? model_name.trim() : null,
        capacity ? capacity.trim() : '2.5 Ton',
        driver_name ? driver_name.trim() : null,
        driver_phone ? driver_phone.trim() : null,
        owner_name ? owner_name.trim() : null,
        ownership_type || 'OWN',
        assigned_route ? assigned_route.trim() : 'Karaikal - Pondicherry',
        rc_number ? rc_number.trim() : null,
        insurance_expiry || null,
        fitness_expiry || null,
        status || 'active'
      ]
    );

    const [newVehicle] = await pool.query('SELECT * FROM vehicles WHERE id = ?', [result.insertId]);
    return res.status(201).json({
      success: true,
      message: `Vehicle "${cleanVehicleNo}" registered successfully!`,
      vehicle: newVehicle[0]
    });
  } catch (err) {
    console.error('Create vehicle error:', err);
    return res.status(500).json({ success: false, message: 'Server error creating vehicle', error: err.message });
  }
};

exports.updateVehicle = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      vehicle_no,
      vehicle_type,
      model_name,
      capacity,
      driver_name,
      driver_phone,
      owner_name,
      ownership_type,
      assigned_route,
      rc_number,
      insurance_expiry,
      fitness_expiry,
      status
    } = req.body;

    const [existing] = await pool.query('SELECT * FROM vehicles WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    const current = existing[0];
    let cleanVehicleNo = current.vehicle_no;

    if (vehicle_no) {
      cleanVehicleNo = vehicle_no.trim().toUpperCase();
      if (cleanVehicleNo !== current.vehicle_no) {
        const [dup] = await pool.query('SELECT id FROM vehicles WHERE vehicle_no = ? AND id != ?', [cleanVehicleNo, id]);
        if (dup.length > 0) {
          return res.status(400).json({
            success: false,
            message: `Vehicle number "${cleanVehicleNo}" is already in use by another vehicle.`
          });
        }
      }
    }

    if (driver_phone) {
      const cleanPhone = driver_phone.toString().replace(/\D/g, '');
      if (cleanPhone.length > 0 && cleanPhone.length !== 10) {
        return res.status(400).json({ success: false, message: 'Driver phone number must be exactly 10 digits.' });
      }
    }

    await pool.query(
      `UPDATE vehicles SET
        vehicle_no = ?,
        vehicle_type = COALESCE(?, vehicle_type),
        model_name = COALESCE(?, model_name),
        capacity = COALESCE(?, capacity),
        driver_name = COALESCE(?, driver_name),
        driver_phone = COALESCE(?, driver_phone),
        owner_name = COALESCE(?, owner_name),
        ownership_type = COALESCE(?, ownership_type),
        assigned_route = COALESCE(?, assigned_route),
        rc_number = COALESCE(?, rc_number),
        insurance_expiry = ?,
        fitness_expiry = ?,
        status = COALESCE(?, status)
      WHERE id = ?`,
      [
        cleanVehicleNo,
        vehicle_type,
        model_name,
        capacity,
        driver_name,
        driver_phone,
        owner_name,
        ownership_type,
        assigned_route,
        rc_number,
        insurance_expiry !== undefined ? (insurance_expiry || null) : current.insurance_expiry,
        fitness_expiry !== undefined ? (fitness_expiry || null) : current.fitness_expiry,
        status,
        id
      ]
    );

    const [updated] = await pool.query('SELECT * FROM vehicles WHERE id = ?', [id]);
    return res.json({
      success: true,
      message: `Vehicle "${cleanVehicleNo}" updated successfully!`,
      vehicle: updated[0]
    });
  } catch (err) {
    console.error('Update vehicle error:', err);
    return res.status(500).json({ success: false, message: 'Server error updating vehicle' });
  }
};

exports.deleteVehicle = async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await pool.query('SELECT * FROM vehicles WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }
    const vehicle = existing[0];

    // Check if vehicle has active shipments in transit
    const [activeOrders] = await pool.query(
      `SELECT id FROM orders 
       WHERE (vehicle_id = ? OR vehicle_no = ?) 
         AND delivery_status IN ('BOOKED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY')`,
      [id, vehicle.vehicle_no]
    );

    if (activeOrders.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete vehicle "${vehicle.vehicle_no}". There are ${activeOrders.length} active shipment(s) assigned. Reassign or complete them first.`
      });
    }

    await pool.query('DELETE FROM vehicles WHERE id = ?', [id]);
    return res.json({
      success: true,
      message: `Vehicle "${vehicle.vehicle_no}" removed from fleet successfully.`
    });
  } catch (err) {
    console.error('Delete vehicle error:', err);
    return res.status(500).json({ success: false, message: 'Server error deleting vehicle' });
  }
};
