const pool = require('../config/db');

const getStationCode = (station) => {
  if (!station) return 'KA';
  const s = station.toString().trim().toLowerCase();
  if (s.includes('karaikal')) return 'KA';
  if (s.includes('pondi') || s.includes('pudu')) return 'PD';
  if (s.includes('cudda')) return 'CUD';
  if (s.includes('chidam')) return 'CDM';
  if (s.includes('paran')) return 'PGP';
  if (s.includes('sirk')) return 'SRK';
  if (s.includes('mayil')) return 'MYL';
  if (s.includes('nagore')) return 'NGR';
  if (s.includes('nagap')) return 'NGP';
  if (s.includes('thiruva') || s.includes('tiruva')) return 'TVR';
  if (s.includes('thirut') || s.includes('tirut')) return 'TTP';
  if (s.includes('veda')) return 'VDM';
  return station.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || 'KA';
};

exports.getNextWaybillNumber = async (req, res) => {
  try {
    const { from_station = 'Karaikal', date } = req.query;

    let targetDate = new Date();
    if (date) {
      const parsed = new Date(date);
      if (!isNaN(parsed.getTime())) targetDate = parsed;
    }
    const yyyy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dd = String(targetDate.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;

    const stationCode = getStationCode(from_station);
    const prefix = `${dateStr}${stationCode}`;
    const hyphenPrefix = `${dateStr}-${stationCode}`;

    // Check existing orders for today matching prefix or date+station
    const [existing] = await pool.query(
      `SELECT lr_number FROM orders 
       WHERE lr_number LIKE ? OR lr_number LIKE ? OR (booking_date = ? AND from_station = ?)`,
      [`${prefix}%`, `${hyphenPrefix}%`, `${yyyy}-${mm}-${dd}`, from_station]
    );

    let maxSeq = 0;
    for (const row of existing) {
      const lr = (row.lr_number || '').trim();
      const match = lr.match(new RegExp(`${dateStr}[-_]?${stationCode}[-_]?(\\d+)`, 'i'));
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      } else {
        const matchEnd = lr.match(/(\d+)$/);
        if (matchEnd && matchEnd[1]) {
          const num = parseInt(matchEnd[1], 10);
          if (!isNaN(num) && num < 10000 && num > maxSeq) maxSeq = num;
        }
      }
    }

    const nextSeq = maxSeq + 1;
    const paddedSeq = String(nextSeq).padStart(3, '0');
    const nextLrNumber = `${prefix}${paddedSeq}`;

    return res.json({
      success: true,
      next_lr: nextLrNumber,
      sequence: nextSeq,
      prefix,
      station_code: stationCode,
      date_str: dateStr
    });
  } catch (err) {
    console.error('Get next waybill error:', err);
    return res.status(500).json({ success: false, message: 'Server error generating waybill number' });
  }
};

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
      vehicle_id,
      date,
      limit = 100, 
      offset = 0 
    } = req.query;

    let query = `
      SELECT o.*, 
        COALESCE(d.name, v.driver_name) as driver_name, 
        COALESCE(o.vehicle_no, v.vehicle_no, d.vehicle_no) as driver_vehicle,
        COALESCE(o.vehicle_no, v.vehicle_no, d.vehicle_no) as vehicle_no,
        COALESCE(d.phone, v.driver_phone) as driver_phone,
        v.vehicle_type,
        v.model_name as vehicle_model,
        v.capacity as vehicle_capacity,
        v.status as vehicle_status
      FROM orders o
      LEFT JOIN drivers d ON o.driver_id = d.id
      LEFT JOIN vehicles v ON o.vehicle_id = v.id
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
        COALESCE(d.name, v.driver_name) as driver_name, 
        COALESCE(o.vehicle_no, v.vehicle_no, d.vehicle_no) as driver_vehicle,
        COALESCE(o.vehicle_no, v.vehicle_no, d.vehicle_no) as vehicle_no,
        COALESCE(d.phone, v.driver_phone) as driver_phone,
        v.vehicle_type,
        v.model_name as vehicle_model,
        v.capacity as vehicle_capacity,
        v.status as vehicle_status
       FROM orders o
       LEFT JOIN drivers d ON o.driver_id = d.id
       LEFT JOIN vehicles v ON o.vehicle_id = v.id
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
      rate_per_piece = 0,
      weight_kg = 0,
      box_details = null,
      description = 'Goods',
      payment_mode = 'TO_PAY',
      payment_status = 'UNPAID',
      payment_method = 'CASH',
      freight_amount = 0,
      other_charges = 0,
      driver_id = null,
      vehicle_id = null,
      vehicle_no = null,
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
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}${mm}${dd}`;
      const stationCode = getStationCode(from_station);
      const prefix = `${dateStr}${stationCode}`;
      const hyphenPrefix = `${dateStr}-${stationCode}`;

      const [existing] = await pool.query(
        `SELECT lr_number FROM orders 
         WHERE lr_number LIKE ? OR lr_number LIKE ? OR (booking_date = ? AND from_station = ?)`,
        [`${prefix}%`, `${hyphenPrefix}%`, `${yyyy}-${mm}-${dd}`, from_station]
      );

      let maxSeq = 0;
      for (const row of existing) {
        const lr = (row.lr_number || '').trim();
        const match = lr.match(new RegExp(`${dateStr}[-_]?${stationCode}[-_]?(\\d+)`, 'i'));
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSeq) maxSeq = num;
        } else {
          const matchEnd = lr.match(/(\d+)$/);
          if (matchEnd && matchEnd[1]) {
            const num = parseInt(matchEnd[1], 10);
            if (!isNaN(num) && num < 10000 && num > maxSeq) maxSeq = num;
          }
        }
      }

      lr_number = `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
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

    // Resolve vehicle details if vehicle_id or driver_id provided
    let resolvedVehicleNo = vehicle_no ? vehicle_no.trim().toUpperCase() : null;
    let resolvedVehicleId = vehicle_id ? parseInt(vehicle_id, 10) : null;
    if (resolvedVehicleId && !resolvedVehicleNo) {
      const [vRows] = await pool.query('SELECT vehicle_no FROM vehicles WHERE id = ?', [resolvedVehicleId]);
      if (vRows.length > 0) resolvedVehicleNo = vRows[0].vehicle_no;
    } else if (driver_id && !resolvedVehicleNo) {
      const [dRows] = await pool.query('SELECT vehicle_no FROM drivers WHERE id = ?', [driver_id]);
      if (dRows.length > 0) resolvedVehicleNo = dRows[0].vehicle_no;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toTimeString().split(' ')[0];
    booking_date = booking_date || todayStr;
    booking_time = booking_time || nowTime;

    let numPieces = parseInt(pieces, 10) || 1;
    let unitRate = parseFloat(rate_per_piece) || 0;
    let freight = parseFloat(freight_amount) || 0;

    // Automatic calculation: pcs * amount (rate) = freight (e.g. 2 * 100 = 200)
    if (unitRate > 0 && (freight === 0 || freight === unitRate)) {
      freight = numPieces * unitRate;
    } else if (freight > 0 && unitRate === 0 && numPieces > 0) {
      unitRate = parseFloat((freight / numPieces).toFixed(2));
    }

    // Process box details (individual box weights)
    let parsedBoxDetails = null;
    let totalWeight = parseFloat(weight_kg) || 0;

    if (box_details) {
      if (typeof box_details === 'string') {
        parsedBoxDetails = box_details;
      } else if (Array.isArray(box_details) || typeof box_details === 'object') {
        parsedBoxDetails = JSON.stringify(box_details);
      }
      try {
        const parsed = typeof box_details === 'string' ? JSON.parse(box_details) : box_details;
        if (Array.isArray(parsed) && parsed.length > 0) {
          const sumWeight = parsed.reduce((acc, b) => acc + (parseFloat(b.weight || b) || 0), 0);
          if (sumWeight > 0) {
            totalWeight = parseFloat(sumWeight.toFixed(2));
          }
          const sumAmount = parsed.reduce((acc, b) => acc + (parseFloat(b.amount) || 0), 0);
          if (sumAmount > 0) {
            freight = parseFloat(sumAmount.toFixed(2));
            unitRate = numPieces > 0 ? parseFloat((freight / numPieces).toFixed(2)) : unitRate;
          }
          if (parsed.length !== numPieces && parsed.length > 1) {
            numPieces = parsed.length;
          }
        }
      } catch (e) {}
    }

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
        pieces, rate_per_piece, weight_kg, box_details, description, payment_mode, payment_status, payment_method,
        freight_amount, other_charges, total_amount, amount_paid, delivery_status,
        driver_id, vehicle_id, vehicle_no, remarks, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BOOKED', ?, ?, ?, ?, ?)`,
      [
        lr_number, booking_date, booking_time, sender_name.trim(), sender_phone || null, sender_address || null,
        receiver_name.trim(), receiver_phone || null, receiver_address || null, from_station, to_station,
        numPieces, unitRate, totalWeight, parsedBoxDetails, (description || 'Goods').trim(),
        payment_mode, payment_status, payment_method,
        freight, others, total, amount_paid,
        driver_id ? parseInt(driver_id, 10) : null,
        resolvedVehicleId,
        resolvedVehicleNo,
        remarks || null, created_by
      ]
    );

    const orderId = result.insertId;

    // Insert Initial Tracking Log
    await pool.query(
      `INSERT INTO tracking_history (order_id, status, location, note) VALUES (?, ?, ?, ?)`,
      [orderId, 'BOOKED', from_station, `Order #${lr_number} booked at ${from_station} station. Destination: ${to_station}.`]
    );

    const [created] = await pool.query(
      `SELECT o.*, 
        d.name as driver_name, 
        COALESCE(o.vehicle_no, v.vehicle_no, d.vehicle_no) as driver_vehicle,
        COALESCE(o.vehicle_no, v.vehicle_no, d.vehicle_no) as vehicle_no,
        v.vehicle_type
       FROM orders o
       LEFT JOIN drivers d ON o.driver_id = d.id
       LEFT JOIN vehicles v ON o.vehicle_id = v.id
       WHERE o.id = ?`,
      [orderId]
    );

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

exports.updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const {
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
      pieces,
      rate_per_piece,
      weight_kg,
      box_details,
      description,
      payment_mode,
      payment_status,
      payment_method,
      freight_amount,
      other_charges,
      delivery_status,
      driver_id,
      vehicle_id,
      vehicle_no,
      remarks
    } = req.body;

    const [existing] = await pool.query('SELECT * FROM orders WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const currentOrder = existing[0];

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

    // Check LR duplication if LR number changed
    let updatedLr = (lr_number || currentOrder.lr_number).toString().trim();
    if (updatedLr !== currentOrder.lr_number) {
      const [dup] = await pool.query('SELECT id FROM orders WHERE lr_number = ? AND id != ?', [updatedLr, id]);
      if (dup.length > 0) {
        return res.status(400).json({
          success: false,
          message: `LR / Way Bill Number "${updatedLr}" already exists on another order.`
        });
      }
    }

    // Resolve vehicle details
    let resolvedVehicleNo = vehicle_no !== undefined ? (vehicle_no ? vehicle_no.trim().toUpperCase() : null) : currentOrder.vehicle_no;
    let resolvedVehicleId = vehicle_id !== undefined ? (vehicle_id ? parseInt(vehicle_id, 10) : null) : currentOrder.vehicle_id;
    if (resolvedVehicleId && !resolvedVehicleNo) {
      const [vRows] = await pool.query('SELECT vehicle_no FROM vehicles WHERE id = ?', [resolvedVehicleId]);
      if (vRows.length > 0) resolvedVehicleNo = vRows[0].vehicle_no;
    } else if (driver_id && !resolvedVehicleNo) {
      const [dRows] = await pool.query('SELECT vehicle_no FROM drivers WHERE id = ?', [driver_id]);
      if (dRows.length > 0) resolvedVehicleNo = dRows[0].vehicle_no;
    }

    let numPieces = pieces !== undefined ? (parseInt(pieces, 10) || 1) : (currentOrder.pieces || 1);
    let unitRate = rate_per_piece !== undefined ? (parseFloat(rate_per_piece) || 0) : (parseFloat(currentOrder.rate_per_piece) || 0);
    let freight = freight_amount !== undefined ? parseFloat(freight_amount) : parseFloat(currentOrder.freight_amount);

    // Auto-calculate if unitRate changed or freight matches unitRate * pieces
    if (unitRate > 0 && (freight === 0 || freight === unitRate || rate_per_piece !== undefined)) {
      if (freight_amount === undefined || parseFloat(freight_amount) === 0) {
        freight = numPieces * unitRate;
      }
    } else if (freight > 0 && unitRate === 0 && numPieces > 0) {
      unitRate = parseFloat((freight / numPieces).toFixed(2));
    }

    let parsedBoxDetails = currentOrder.box_details;
    let totalWeight = weight_kg !== undefined ? (parseFloat(weight_kg) || 0) : (parseFloat(currentOrder.weight_kg) || 0);

    if (box_details !== undefined) {
      if (!box_details) {
        parsedBoxDetails = null;
      } else if (typeof box_details === 'string') {
        parsedBoxDetails = box_details;
      } else if (Array.isArray(box_details) || typeof box_details === 'object') {
        parsedBoxDetails = JSON.stringify(box_details);
      }
      try {
        const parsed = typeof box_details === 'string' ? JSON.parse(box_details) : box_details;
        if (Array.isArray(parsed) && parsed.length > 0) {
          const sumWeight = parsed.reduce((acc, b) => acc + (parseFloat(b.weight || b) || 0), 0);
          if (sumWeight > 0) {
            totalWeight = parseFloat(sumWeight.toFixed(2));
          }
          const sumAmount = parsed.reduce((acc, b) => acc + (parseFloat(b.amount) || 0), 0);
          if (sumAmount > 0) {
            freight = parseFloat(sumAmount.toFixed(2));
            unitRate = numPieces > 0 ? parseFloat((freight / numPieces).toFixed(2)) : unitRate;
          }
        }
      } catch (e) {}
    }

    const others = other_charges !== undefined ? parseFloat(other_charges) : parseFloat(currentOrder.other_charges);
    const total = (isNaN(freight) ? 0 : freight) + (isNaN(others) ? 0 : others);

    const newPaymentStatus = payment_status || currentOrder.payment_status;
    const newPaymentMode = payment_mode || currentOrder.payment_mode;
    const newDeliveryStatus = delivery_status || currentOrder.delivery_status;

    let amount_paid = currentOrder.amount_paid;
    if (newPaymentStatus === 'PAID') {
      amount_paid = total;
    } else if (newPaymentStatus === 'UNPAID') {
      amount_paid = 0;
    }

    let delivery_date = currentOrder.delivery_date;
    if (newDeliveryStatus === 'DELIVERED' && !delivery_date) {
      delivery_date = new Date();
    }

    const formattedBookingDate = booking_date 
      ? new Date(booking_date).toISOString().split('T')[0]
      : currentOrder.booking_date;

    await pool.query(
      `UPDATE orders SET
        lr_number = ?,
        booking_date = ?,
        booking_time = COALESCE(?, booking_time),
        sender_name = ?,
        sender_phone = ?,
        sender_address = ?,
        receiver_name = ?,
        receiver_phone = ?,
        receiver_address = ?,
        from_station = ?,
        to_station = ?,
        pieces = ?,
        rate_per_piece = ?,
        weight_kg = ?,
        box_details = ?,
        description = ?,
        payment_mode = ?,
        payment_status = ?,
        payment_method = ?,
        freight_amount = ?,
        other_charges = ?,
        total_amount = ?,
        amount_paid = ?,
        delivery_status = ?,
        delivery_date = ?,
        driver_id = ?,
        vehicle_id = ?,
        vehicle_no = ?,
        remarks = ?
      WHERE id = ?`,
      [
        updatedLr,
        formattedBookingDate,
        booking_time || null,
        sender_name.trim(),
        sender_phone ? sender_phone.toString().trim() : null,
        sender_address || null,
        receiver_name.trim(),
        receiver_phone ? receiver_phone.toString().trim() : null,
        receiver_address || null,
        from_station,
        to_station,
        numPieces,
        unitRate,
        totalWeight,
        parsedBoxDetails,
        (description || 'Goods').trim(),
        newPaymentMode,
        newPaymentStatus,
        payment_method || currentOrder.payment_method || 'CASH',
        freight,
        others,
        total,
        amount_paid,
        newDeliveryStatus,
        delivery_date,
        driver_id ? parseInt(driver_id, 10) : null,
        resolvedVehicleId,
        resolvedVehicleNo,
        remarks || null,
        id
      ]
    );

    // If status changed, log in tracking history
    if (newDeliveryStatus !== currentOrder.delivery_status) {
      const loc = newDeliveryStatus === 'DELIVERED' ? to_station : from_station;
      await pool.query(
        `INSERT INTO tracking_history (order_id, status, location, note) VALUES (?, ?, ?, ?)`,
        [id, newDeliveryStatus, loc, `Status updated to ${newDeliveryStatus} via Order Edit.`]
      );
    }

    const [updated] = await pool.query(
      `SELECT o.*, 
        d.name as driver_name, 
        COALESCE(o.vehicle_no, v.vehicle_no, d.vehicle_no) as driver_vehicle,
        COALESCE(o.vehicle_no, v.vehicle_no, d.vehicle_no) as vehicle_no,
        d.phone as driver_phone,
        v.vehicle_type
       FROM orders o
       LEFT JOIN drivers d ON o.driver_id = d.id
       LEFT JOIN vehicles v ON o.vehicle_id = v.id
       WHERE o.id = ?`,
      [id]
    );

    return res.json({
      success: true,
      message: `Order LR #${updatedLr} updated successfully!`,
      order: updated[0]
    });
  } catch (err) {
    console.error('Update order error:', err);
    return res.status(500).json({ success: false, message: 'Server error updating order', error: err.message });
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
