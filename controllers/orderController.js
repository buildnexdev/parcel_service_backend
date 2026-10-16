const pool = require('../config/db');

exports.getOrders = async (req, res) => {
  try {
    const { 
      search, 
      delivery_status, 
      payment_status, 
      payment_mode,
      from_station, 
      to_station, 
      driver_id,
      date,
      limit = 100, 
      offset = 0 
    } = req.query;

    let query = `
      SELECT o.*, 
        d.name as driver_name, 
        d.vehicle_no as driver_vehicle,
        d.phone as driver_phone
      FROM orders o
      LEFT JOIN drivers d ON o.driver_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ` AND (o.lr_number LIKE ? OR o.sender_name LIKE ? OR o.receiver_name LIKE ? OR o.sender_phone LIKE ? OR o.receiver_phone LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term, term, term);
    }

    if (delivery_status && delivery_status !== 'ALL') {
      query += ` AND o.delivery_status = ?`;
      params.push(delivery_status);
    }

    if (payment_status && payment_status !== 'ALL') {
      query += ` AND o.payment_status = ?`;
      params.push(payment_status);
    }

    if (payment_mode && payment_mode !== 'ALL') {
      query += ` AND o.payment_mode = ?`;
      params.push(payment_mode);
    }

    if (from_station && from_station !== 'ALL') {
      query += ` AND o.from_station = ?`;
      params.push(from_station);
    }

    if (to_station && to_station !== 'ALL') {
      query += ` AND o.to_station = ?`;
      params.push(to_station);
    }

    if (driver_id && driver_id !== 'ALL') {
      query += ` AND o.driver_id = ?`;
      params.push(driver_id);
    }

    if (date) {
      query += ` AND o.booking_date = ?`;
      params.push(date);
    }

    query += ` ORDER BY o.id DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const [orders] = await pool.query(query, params);

    // Get counts
    const [counts] = await pool.query(`
      SELECT 
        COUNT(*) as total_orders,
        SUM(CASE WHEN delivery_status = 'BOOKED' THEN 1 ELSE 0 END) as booked_count,
        SUM(CASE WHEN delivery_status = 'IN_TRANSIT' THEN 1 ELSE 0 END) as in_transit_count,
        SUM(CASE WHEN delivery_status = 'OUT_FOR_DELIVERY' THEN 1 ELSE 0 END) as out_for_delivery_count,
        SUM(CASE WHEN delivery_status = 'DELIVERED' THEN 1 ELSE 0 END) as delivered_count,
        SUM(CASE WHEN payment_status = 'PAID' THEN 1 ELSE 0 END) as paid_count,
        SUM(CASE WHEN payment_status = 'UNPAID' THEN 1 ELSE 0 END) as unpaid_count,
        SUM(total_amount) as total_revenue,
        SUM(CASE WHEN payment_mode = 'TO_PAY' AND payment_status != 'PAID' THEN total_amount ELSE 0 END) as pending_topay
      FROM orders
    `);

    return res.json({
      success: true,
      orders,
      stats: counts[0]
    });
  } catch (err) {
    console.error('Get orders error:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving orders' });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const [orders] = await pool.query(
      `SELECT o.*, 
        d.name as driver_name, 
        d.vehicle_no as driver_vehicle,
        d.phone as driver_phone
       FROM orders o
       LEFT JOIN drivers d ON o.driver_id = d.id
       WHERE o.id = ? OR o.lr_number = ?`,
      [id, id]
    );

    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = orders[0];

    // Fetch tracking history
    const [history] = await pool.query(
      'SELECT * FROM tracking_history WHERE order_id = ? ORDER BY created_at ASC',
      [order.id]
    );

    return res.json({
      success: true,
      order,
      tracking_history: history
    });
  } catch (err) {
    console.error('Get order by id error:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving order details' });
  }
};

exports.createOrder = async (req, res) => {
  try {
    let {
      lr_number,
      booking_date,
      booking_time,
      sender_name,
      sender_phone,
      sender_address,
      receiver_name,
      receiver_phone,
      receiver_address,
      from_station,
      to_station,
      pieces = 1,
      weight_kg = 0,
      description = 'Goods',
      payment_mode = 'TO_PAY',
      payment_status = 'UNPAID',
      payment_method = 'CASH',
      freight_amount = 0,
      other_charges = 0,
      driver_id = null,
      remarks = ''
    } = req.body;

    if (!sender_name || !receiver_name || !from_station || !to_station) {
      return res.status(400).json({
        success: false,
        message: 'Sender Name, Receiver Name, From Station, and To Station are required.'
      });
    }

    if (sender_phone && sender_phone.toString().replace(/\D/g, '').length !== 10) {
      return res.status(400).json({
        success: false,
        message: 'Sender phone number must be exactly 10 digits.'
      });
    }

    if (receiver_phone && receiver_phone.toString().replace(/\D/g, '').length !== 10) {
      return res.status(400).json({
        success: false,
        message: 'Receiver phone number must be exactly 10 digits.'
      });
    }

    // Auto-generate LR number if omitted
    if (!lr_number || lr_number.trim() === '') {
      const [last] = await pool.query('SELECT lr_number FROM orders ORDER BY id DESC LIMIT 1');
      if (last.length > 0 && !isNaN(parseInt(last[0].lr_number, 10))) {
        lr_number = (parseInt(last[0].lr_number, 10) + 1).toString();
      } else {
        lr_number = Math.floor(10000 + Math.random() * 90000).toString();
      }
    } else {
      lr_number = lr_number.trim();
      // Check for duplicate LR
      const [dup] = await pool.query('SELECT id FROM orders WHERE lr_number = ?', [lr_number]);
      if (dup.length > 0) {
        return res.status(400).json({
          success: false,
          message: `LR / Way Bill Number "${lr_number}" already exists. Please provide a unique LR Number.`
        });
      }
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toTimeString().split(' ')[0];
    booking_date = booking_date || todayStr;
    booking_time = booking_time || nowTime;

    const freight = parseFloat(freight_amount) || 0;
    const others = parseFloat(other_charges) || 0;
    const total = freight + others;
    
    // Auto-align payment status based on mode
    if (payment_mode === 'PAID') {
      payment_status = 'PAID';
    } else if (payment_mode === 'TO_PAY') {
      if (payment_status !== 'PAID') payment_status = 'UNPAID';
    }

    const amount_paid = (payment_status === 'PAID') ? total : 0;
    const created_by = req.user ? req.user.name : 'Staff';

    const [result] = await pool.query(
      `INSERT INTO orders (
        lr_number, booking_date, booking_time, sender_name, sender_phone, sender_address,
        receiver_name, receiver_phone, receiver_address, from_station, to_station,
        pieces, weight_kg, description, payment_mode, payment_status, payment_method,
        freight_amount, other_charges, total_amount, amount_paid, delivery_status,
        driver_id, remarks, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BOOKED', ?, ?, ?)`,
      [
        lr_number, booking_date, booking_time, sender_name.trim(), sender_phone || null, sender_address || null,
        receiver_name.trim(), receiver_phone || null, receiver_address || null, from_station, to_station,
        parseInt(pieces, 10) || 1, parseFloat(weight_kg) || 0, description.trim(),
        payment_mode, payment_status, payment_method,
        freight, others, total, amount_paid,
        driver_id ? parseInt(driver_id, 10) : null, remarks || null, created_by
      ]
    );

    const orderId = result.insertId;

    // Insert Initial Tracking Log
    await pool.query(
      `INSERT INTO tracking_history (order_id, status, location, note) VALUES (?, ?, ?, ?)`,
      [orderId, 'BOOKED', from_station, `Order #${lr_number} booked at ${from_station} station. Destination: ${to_station}.`]
    );

    const [created] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);

    return res.status(201).json({
      success: true,
      message: `Order LR #${lr_number} created successfully!`,
      order: created[0]
    });
  } catch (err) {
    console.error('Create order error:', err);
    return res.status(500).json({ success: false, message: 'Server error creating order', error: err.message });
  }
};

/**
 * IN-PLACE PAYMENT UPDATE (as requested: "in that same page we can update payment too")
 */
exports.updatePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_status, payment_mode, payment_method, amount_paid, remarks } = req.body;

    const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [id]);
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = orders[0];
    const newStatus = payment_status || order.payment_status;
    const newMode = payment_mode || order.payment_mode;
    const newMethod = payment_method || order.payment_method;
    const newAmountPaid = (newStatus === 'PAID') 
      ? order.total_amount 
      : (amount_paid !== undefined ? parseFloat(amount_paid) : order.amount_paid);

    await pool.query(
      `UPDATE orders 
       SET payment_status = ?,
           payment_mode = ?,
           payment_method = ?,
           amount_paid = ?,
           remarks = COALESCE(?, remarks)
       WHERE id = ?`,
      [newStatus, newMode, newMethod, newAmountPaid, remarks, id]
    );

    // Also add tracking note for payment update
    const note = `Payment updated: Status marked as ${newStatus} (${newMode} via ${newMethod}). Amount: ₹${newAmountPaid}`;
    await pool.query(
      `INSERT INTO tracking_history (order_id, status, location, note) VALUES (?, ?, ?, ?)`,
      [id, 'PAYMENT_UPDATE', order.to_station, note]
    );

    const [updated] = await pool.query('SELECT * FROM orders WHERE id = ?', [id]);
    return res.json({
      success: true,
      message: `Payment updated for LR #${order.lr_number}: Status is now ${newStatus}!`,
      order: updated[0]
    });
  } catch (err) {
    console.error('Update payment error:', err);
    return res.status(500).json({ success: false, message: 'Server error updating payment' });
  }
};

/**
 * UPDATE DELIVERY STATUS & AUTO-LOG TRACKING EVENT
 */
exports.updateDeliveryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { delivery_status, location, note, driver_id, mark_payment_paid } = req.body;

    const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [id]);
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = orders[0];
    const isDelivered = delivery_status === 'DELIVERED';
    const loc = location || (isDelivered ? order.to_station : order.from_station);

    let query = `UPDATE orders SET delivery_status = ?`;
    const params = [delivery_status];

    if (isDelivered) {
      query += `, delivery_date = NOW()`;
      if (mark_payment_paid || order.payment_mode === 'TO_PAY') {
        query += `, payment_status = 'PAID', amount_paid = total_amount`;
      }
    }

    if (driver_id) {
      query += `, driver_id = ?`;
      params.push(driver_id);
    }

    query += ` WHERE id = ?`;
    params.push(id);

    await pool.query(query, params);

    // Log checkpoint in tracking_history
    const trackNote = note || `Status updated to ${delivery_status} at ${loc}.`;
    await pool.query(
      `INSERT INTO tracking_history (order_id, status, location, note) VALUES (?, ?, ?, ?)`,
      [id, delivery_status, loc, trackNote]
    );

    const [updated] = await pool.query('SELECT * FROM orders WHERE id = ?', [id]);
    return res.json({
      success: true,
      message: `Status updated to ${delivery_status} for LR #${order.lr_number}!`,
      order: updated[0]
    });
  } catch (err) {
    console.error('Update delivery status error:', err);
    return res.status(500).json({ success: false, message: 'Server error updating delivery status' });
  }
};

exports.addTrackingCheckpoint = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, location, note } = req.body;

    if (!location) {
      return res.status(400).json({ success: false, message: 'Location is required' });
    }

    await pool.query(
      `INSERT INTO tracking_history (order_id, status, location, note) VALUES (?, ?, ?, ?)`,
      [id, status || 'UPDATE', location, note || 'Checkpoint logged']
    );

    const [history] = await pool.query('SELECT * FROM tracking_history WHERE order_id = ? ORDER BY created_at ASC', [id]);
    return res.json({ success: true, message: 'Checkpoint added', tracking_history: history });
  } catch (err) {
    console.error('Add tracking checkpoint error:', err);
    return res.status(500).json({ success: false, message: 'Server error adding checkpoint' });
  }
};

exports.deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM orders WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Order deleted successfully' });
  } catch (err) {
    console.error('Delete order error:', err);
    return res.status(500).json({ success: false, message: 'Server error deleting order' });
  }
};
