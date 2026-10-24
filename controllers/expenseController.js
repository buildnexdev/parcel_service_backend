const pool = require('../config/db');

// 1. Get all expenses with advanced filtering & summary metrics
exports.getExpenses = async (req, res) => {
  try {
    const {
      date,
      startDate,
      endDate,
      category,
      branch,
      payment_mode,
      search
    } = req.query;

    let query = `
      SELECT e.*, 
             v.model_name as vehicle_model,
             d.phone as driver_phone
      FROM daily_expenses e
      LEFT JOIN vehicles v ON e.vehicle_id = v.id
      LEFT JOIN drivers d ON e.driver_id = d.id
      WHERE 1=1
    `;
    const params = [];

    // Date filters
    if (startDate && endDate) {
      query += ` AND e.expense_date BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    } else if (date) {
      query += ` AND e.expense_date = ?`;
      params.push(date);
    }

    if (category && category !== 'ALL') {
      query += ` AND e.category = ?`;
      params.push(category);
    }

    if (branch && branch !== 'ALL') {
      query += ` AND e.branch = ?`;
      params.push(branch);
    }

    if (payment_mode && payment_mode !== 'ALL') {
      query += ` AND e.payment_mode = ?`;
      params.push(payment_mode);
    }

    if (search && search.trim()) {
      query += ` AND (
        e.title LIKE ? OR 
        e.paid_to LIKE ? OR 
        e.voucher_no LIKE ? OR 
        e.vehicle_no LIKE ? OR 
        e.driver_name LIKE ? OR 
        e.notes LIKE ?
      )`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term, term, term);
    }

    query += ` ORDER BY e.expense_date DESC, e.id DESC`;

    const [expenses] = await pool.query(query, params);

    // Compute key financial metrics (KPIs)
    const today = new Date().toISOString().split('T')[0];
    const currentYearMonth = today.slice(0, 7); // 'YYYY-MM'

    const [statsRows] = await pool.query(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_expenses,
        COALESCE(SUM(CASE WHEN expense_date = ? THEN amount ELSE 0 END), 0) as today_expenses,
        COALESCE(SUM(CASE WHEN expense_date LIKE ? THEN amount ELSE 0 END), 0) as month_expenses,
        COALESCE(SUM(CASE WHEN (category LIKE '%Fuel%' OR category LIKE '%Diesel%') AND expense_date LIKE ? THEN amount ELSE 0 END), 0) as month_fuel,
        COALESCE(SUM(CASE WHEN (category LIKE '%Batta%' OR category LIKE '%Allowance%') AND expense_date LIKE ? THEN amount ELSE 0 END), 0) as month_batta,
        COALESCE(SUM(CASE WHEN category LIKE '%Maintenance%' AND expense_date LIKE ? THEN amount ELSE 0 END), 0) as month_maintenance,
        COALESCE(SUM(CASE WHEN category LIKE '%Loading%' AND expense_date LIKE ? THEN amount ELSE 0 END), 0) as month_loading
      FROM daily_expenses
    `, [today, `${currentYearMonth}%`, `${currentYearMonth}%`, `${currentYearMonth}%`, `${currentYearMonth}%`, `${currentYearMonth}%`]);

    // Filtered total amount
    const filteredTotal = expenses.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);

    return res.json({
      success: true,
      count: expenses.length,
      filteredTotal,
      expenses,
      stats: statsRows[0] || {
        total_expenses: 0,
        today_expenses: 0,
        month_expenses: 0,
        month_fuel: 0,
        month_batta: 0,
        month_maintenance: 0,
        month_loading: 0
      }
    });
  } catch (err) {
    console.error('Get expenses error:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving expenses' });
  }
};

// 2. Get single expense by ID
exports.getExpenseById = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM daily_expenses WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Expense record not found' });
    }
    return res.json({ success: true, expense: rows[0] });
  } catch (err) {
    console.error('Get expense by id error:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving expense details' });
  }
};

// 3. Create new expense
exports.createExpense = async (req, res) => {
  try {
    const {
      expense_date,
      category,
      title,
      amount,
      branch = 'Karaikal',
      payment_mode = 'CASH',
      paid_to,
      voucher_no,
      vehicle_id,
      vehicle_no,
      driver_id,
      driver_name,
      notes
    } = req.body;

    if (!expense_date || !category || !title || amount === undefined || amount === null || amount === '') {
      return res.status(400).json({
        success: false,
        message: 'Please provide expense date, category, title, and valid amount'
      });
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount < 0) {
      return res.status(400).json({ success: false, message: 'Amount must be a positive number' });
    }

    // Auto-resolve vehicle_no if vehicle_id supplied
    let resolvedVehicleNo = vehicle_no || null;
    if (vehicle_id && !resolvedVehicleNo) {
      const [vRows] = await pool.query('SELECT vehicle_no FROM vehicles WHERE id = ?', [vehicle_id]);
      if (vRows.length > 0) resolvedVehicleNo = vRows[0].vehicle_no;
    }

    // Auto-resolve driver_name if driver_id supplied
    let resolvedDriverName = driver_name || null;
    if (driver_id && !resolvedDriverName) {
      const [dRows] = await pool.query('SELECT name FROM drivers WHERE id = ?', [driver_id]);
      if (dRows.length > 0) resolvedDriverName = dRows[0].name;
    }

    const createdBy = req.user ? (req.user.name || req.user.username) : 'Admin';

    const [result] = await pool.query(
      `INSERT INTO daily_expenses (
        expense_date, category, title, amount, branch, payment_mode, 
        paid_to, voucher_no, vehicle_id, vehicle_no, driver_id, driver_name, 
        notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        expense_date,
        category,
        title,
        numericAmount,
        branch,
        payment_mode,
        paid_to || null,
        voucher_no || null,
        vehicle_id ? parseInt(vehicle_id, 10) : null,
        resolvedVehicleNo,
        driver_id ? parseInt(driver_id, 10) : null,
        resolvedDriverName,
        notes || null,
        createdBy
      ]
    );

    const [newRow] = await pool.query('SELECT * FROM daily_expenses WHERE id = ?', [result.insertId]);

    return res.status(201).json({
      success: true,
      message: 'Daily expense recorded successfully!',
      expense: newRow[0]
    });
  } catch (err) {
    console.error('Create expense error:', err);
    return res.status(500).json({ success: false, message: 'Server error creating expense', error: err.message });
  }
};

// 4. Update existing expense
exports.updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      expense_date,
      category,
      title,
      amount,
      branch,
      payment_mode,
      paid_to,
      voucher_no,
      vehicle_id,
      vehicle_no,
      driver_id,
      driver_name,
      notes
    } = req.body;

    const [existing] = await pool.query('SELECT id FROM daily_expenses WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Expense record not found' });
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount < 0) {
      return res.status(400).json({ success: false, message: 'Amount must be a positive number' });
    }

    await pool.query(
      `UPDATE daily_expenses SET
        expense_date = ?,
        category = ?,
        title = ?,
        amount = ?,
        branch = ?,
        payment_mode = ?,
        paid_to = ?,
        voucher_no = ?,
        vehicle_id = ?,
        vehicle_no = ?,
        driver_id = ?,
        driver_name = ?,
        notes = ?
      WHERE id = ?`,
      [
        expense_date,
        category,
        title,
        numericAmount,
        branch,
        payment_mode,
        paid_to || null,
        voucher_no || null,
        vehicle_id ? parseInt(vehicle_id, 10) : null,
        vehicle_no || null,
        driver_id ? parseInt(driver_id, 10) : null,
        driver_name || null,
        notes || null,
        id
      ]
    );

    const [updated] = await pool.query('SELECT * FROM daily_expenses WHERE id = ?', [id]);

    return res.json({
      success: true,
      message: 'Daily expense updated successfully!',
      expense: updated[0]
    });
  } catch (err) {
    console.error('Update expense error:', err);
    return res.status(500).json({ success: false, message: 'Server error updating expense', error: err.message });
  }
};

// 5. Delete expense
exports.deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM daily_expenses WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Expense record not found' });
    }
    return res.json({ success: true, message: 'Expense record deleted successfully' });
  } catch (err) {
    console.error('Delete expense error:', err);
    return res.status(500).json({ success: false, message: 'Server error deleting expense' });
  }
};
