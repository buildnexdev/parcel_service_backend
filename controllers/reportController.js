const pool = require('../config/db');

exports.getDailyReport = async (req, res) => {
  try {
    const {
      date,
      startDate,
      endDate,
      payment_status,
      payment_mode,
      delivery_status,
      from_station,
      to_station,
      driver_id
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

    // Date filtering
    if (startDate && endDate) {
      query += ` AND o.booking_date BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    } else if (date) {
      query += ` AND o.booking_date = ?`;
      params.push(date);
    }

    // Payment Status filter (PAID / UNPAID)
    if (payment_status && payment_status !== 'ALL') {
      query += ` AND o.payment_status = ?`;
      params.push(payment_status);
    }

    // Payment Mode filter (PAID / TO_PAY / CREDIT)
    if (payment_mode && payment_mode !== 'ALL') {
      query += ` AND o.payment_mode = ?`;
      params.push(payment_mode);
    }

    // Delivered Status filter (BOOKED, IN_TRANSIT, DELIVERED, etc.)
    if (delivery_status && delivery_status !== 'ALL') {
      query += ` AND o.delivery_status = ?`;
      params.push(delivery_status);
    }

    // Station routes
    if (from_station && from_station !== 'ALL') {
      query += ` AND o.from_station = ?`;
      params.push(from_station);
    }

    if (to_station && to_station !== 'ALL') {
      query += ` AND o.to_station = ?`;
      params.push(to_station);
    }

    // Driver filter
    if (driver_id && driver_id !== 'ALL') {
      query += ` AND o.driver_id = ?`;
      params.push(driver_id);
    }

    query += ` ORDER BY o.booking_date DESC, o.id DESC`;

    const [rows] = await pool.query(query, params);

    // Compute summary metrics for the filtered result set
    let totalBills = rows.length;
    let totalPieces = 0;
    let totalAmount = 0;
    let totalPaid = 0;
    let totalToPay = 0;
    let totalCredit = 0;

    let deliveredCount = 0;
    let inTransitCount = 0;
    let bookedCount = 0;

    for (const r of rows) {
      totalPieces += parseInt(r.pieces, 10) || 0;
      const amt = parseFloat(r.total_amount) || 0;
      totalAmount += amt;

      if (r.payment_status === 'PAID') {
        totalPaid += amt;
      } else if (r.payment_mode === 'TO_PAY') {
        totalToPay += amt;
      } else if (r.payment_mode === 'CREDIT') {
        totalCredit += amt;
      } else {
        totalToPay += amt;
      }

      if (r.delivery_status === 'DELIVERED') deliveredCount++;
      else if (r.delivery_status === 'IN_TRANSIT' || r.delivery_status === 'OUT_FOR_DELIVERY') inTransitCount++;
      else bookedCount++;
    }

    return res.json({
      success: true,
      filters: {
        date: date || null,
        startDate: startDate || null,
        endDate: endDate || null,
        payment_status: payment_status || 'ALL',
        payment_mode: payment_mode || 'ALL',
        delivery_status: delivery_status || 'ALL',
        from_station: from_station || 'ALL',
        to_station: to_station || 'ALL',
        driver_id: driver_id || 'ALL'
      },
      summary: {
        totalBills,
        totalPieces,
        totalAmount,
        totalPaid,
        totalToPay,
        totalCredit,
        deliveredCount,
        inTransitCount,
        bookedCount
      },
      orders: rows
    });
  } catch (err) {
    console.error('Daily report error:', err);
    return res.status(500).json({ success: false, message: 'Server error generating daily report' });
  }
};

exports.getDashboardSummary = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [todayStats] = await pool.query(`
      SELECT 
        COUNT(*) as today_orders_count,
        COALESCE(SUM(pieces), 0) as today_pieces,
        COALESCE(SUM(total_amount), 0) as today_revenue,
        COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN total_amount ELSE 0 END), 0) as today_paid,
        COALESCE(SUM(CASE WHEN payment_mode = 'TO_PAY' AND payment_status != 'PAID' THEN total_amount ELSE 0 END), 0) as today_pending_topay,
        COALESCE(SUM(CASE WHEN delivery_status = 'DELIVERED' THEN 1 ELSE 0 END), 0) as today_delivered
      FROM orders
      WHERE booking_date = ?
    `, [today]);

    const [allTimeStats] = await pool.query(`
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(pieces), 0) as total_pieces,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN delivery_status = 'IN_TRANSIT' OR delivery_status = 'OUT_FOR_DELIVERY' THEN 1 ELSE 0 END), 0) as active_in_transit,
        COALESCE(SUM(CASE WHEN delivery_status = 'DELIVERED' THEN 1 ELSE 0 END), 0) as total_delivered,
        COALESCE(SUM(CASE WHEN payment_mode = 'TO_PAY' AND payment_status != 'PAID' THEN total_amount ELSE 0 END), 0) as total_pending_topay
      FROM orders
    `);

    const [driverCount] = await pool.query(`
      SELECT 
        COUNT(*) as total_drivers,
        COALESCE(SUM(CASE WHEN status = 'on_duty' THEN 1 ELSE 0 END), 0) as on_duty_drivers
      FROM drivers
    `);

    const [recentOrders] = await pool.query(`
      SELECT o.*, d.name as driver_name, d.vehicle_no as driver_vehicle
      FROM orders o
      LEFT JOIN drivers d ON o.driver_id = d.id
      ORDER BY o.id DESC
      LIMIT 8
    `);

    return res.json({
      success: true,
      today: todayStats[0],
      allTime: allTimeStats[0],
      drivers: driverCount[0],
      recentOrders
    });
  } catch (err) {
    console.error('Dashboard summary error:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving dashboard summary' });
  }
};
