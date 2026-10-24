const pool = require('../config/db');

// 1. Get attendance roster for a specific date (merges active users with attendance records)
exports.getAttendance = async (req, res) => {
  try {
    const {
      date = new Date().toISOString().split('T')[0],
      branch,
      status,
      search
    } = req.query;

    let userQuery = `
      SELECT 
        u.id as user_id,
        u.name,
        u.username,
        u.role,
        u.designation,
        u.branch,
        u.phone,
        a.id as attendance_id,
        a.attendance_date,
        COALESCE(a.status, 'UNMARKED') as status,
        a.check_in,
        a.check_out,
        a.working_hours,
        a.overtime_hours,
        a.notes,
        a.marked_by,
        a.updated_at
      FROM users u
      LEFT JOIN staff_attendance a ON u.id = a.user_id AND a.attendance_date = ?
      WHERE u.status = 'active'
    `;
    const params = [date];

    if (branch && branch !== 'ALL') {
      userQuery += ` AND u.branch = ?`;
      params.push(branch);
    }

    if (status && status !== 'ALL') {
      if (status === 'UNMARKED') {
        userQuery += ` AND a.status IS NULL`;
      } else {
        userQuery += ` AND a.status = ?`;
      }
    }

    if (search && search.trim()) {
      userQuery += ` AND (u.name LIKE ? OR u.username LIKE ? OR u.phone LIKE ? OR u.designation LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    userQuery += ` ORDER BY FIELD(u.role, 'admin', 'staff'), u.name ASC`;

    const [records] = await pool.query(userQuery, params);

    // Compute stats for this date
    const [allRoster] = await pool.query(
      `SELECT 
        COUNT(u.id) as total_staff,
        SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) as present_count,
        SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) as absent_count,
        SUM(CASE WHEN a.status = 'HALF_DAY' THEN 1 ELSE 0 END) as half_day_count,
        SUM(CASE WHEN a.status = 'LEAVE' THEN 1 ELSE 0 END) as leave_count,
        SUM(CASE WHEN a.status = 'ON_DUTY' THEN 1 ELSE 0 END) as on_duty_count,
        SUM(CASE WHEN a.status IS NOT NULL THEN 1 ELSE 0 END) as marked_count,
        SUM(CASE WHEN a.status IS NULL THEN 1 ELSE 0 END) as unmarked_count
      FROM users u
      LEFT JOIN staff_attendance a ON u.id = a.user_id AND a.attendance_date = ?
      WHERE u.status = 'active'`,
      [date]
    );

    return res.json({
      success: true,
      date,
      count: records.length,
      records,
      stats: allRoster[0] || {
        total_staff: 0,
        present_count: 0,
        absent_count: 0,
        half_day_count: 0,
        leave_count: 0,
        on_duty_count: 0,
        marked_count: 0,
        unmarked_count: 0
      }
    });
  } catch (err) {
    console.error('Get attendance error:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving attendance records' });
  }
};

// 2. Mark / Save attendance (supports both single user update and bulk date roster update)
exports.markAttendance = async (req, res) => {
  try {
    const markedBy = req.user ? (req.user.name || req.user.username) : 'Admin';
    const { attendance_date, records, user_id, status, check_in, check_out, working_hours, overtime_hours, notes } = req.body;

    const targetDate = attendance_date || new Date().toISOString().split('T')[0];

    // Case A: Bulk array of records
    if (Array.isArray(records) && records.length > 0) {
      for (const item of records) {
        if (!item.user_id || !item.status) continue;
        if (item.status === 'UNMARKED') {
          // If explicitly resetting to unmarked, remove the row
          await pool.query('DELETE FROM staff_attendance WHERE user_id = ? AND attendance_date = ?', [item.user_id, targetDate]);
          continue;
        }

        await pool.query(
          `INSERT INTO staff_attendance (
            user_id, attendance_date, status, check_in, check_out, 
            working_hours, overtime_hours, branch, notes, marked_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE 
            status = VALUES(status),
            check_in = VALUES(check_in),
            check_out = VALUES(check_out),
            working_hours = VALUES(working_hours),
            overtime_hours = VALUES(overtime_hours),
            branch = VALUES(branch),
            notes = VALUES(notes),
            marked_by = VALUES(marked_by)`,
          [
            item.user_id,
            targetDate,
            item.status,
            item.check_in || null,
            item.check_out || null,
            item.working_hours ? parseFloat(item.working_hours) : null,
            item.overtime_hours ? parseFloat(item.overtime_hours) : 0,
            item.branch || 'Karaikal',
            item.notes || null,
            markedBy
          ]
        );
      }

      return res.json({
        success: true,
        message: `Attendance updated for ${records.length} staff members on ${targetDate}`
      });
    }

    // Case B: Single staff update
    if (!user_id || !status) {
      return res.status(400).json({ success: false, message: 'Please provide user ID and attendance status' });
    }

    if (status === 'UNMARKED') {
      await pool.query('DELETE FROM staff_attendance WHERE user_id = ? AND attendance_date = ?', [user_id, targetDate]);
      return res.json({ success: true, message: 'Attendance record cleared' });
    }

    const [uRows] = await pool.query('SELECT branch FROM users WHERE id = ?', [user_id]);
    const userBranch = uRows.length > 0 ? uRows[0].branch : 'Karaikal';

    await pool.query(
      `INSERT INTO staff_attendance (
        user_id, attendance_date, status, check_in, check_out, 
        working_hours, overtime_hours, branch, notes, marked_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        status = VALUES(status),
        check_in = VALUES(check_in),
        check_out = VALUES(check_out),
        working_hours = VALUES(working_hours),
        overtime_hours = VALUES(overtime_hours),
        branch = VALUES(branch),
        notes = VALUES(notes),
        marked_by = VALUES(marked_by)`,
      [
        user_id,
        targetDate,
        status,
        check_in || null,
        check_out || null,
        working_hours ? parseFloat(working_hours) : null,
        overtime_hours ? parseFloat(overtime_hours) : 0,
        req.body.branch || userBranch,
        notes || null,
        markedBy
      ]
    );

    return res.json({
      success: true,
      message: 'Attendance recorded successfully!'
    });
  } catch (err) {
    console.error('Mark attendance error:', err);
    return res.status(500).json({ success: false, message: 'Server error saving attendance', error: err.message });
  }
};

// 3. Get monthly summary and individual staff statistics
exports.getMonthlySummary = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const month = req.query.month || today.slice(0, 7); // 'YYYY-MM'
    const branch = req.query.branch;

    let query = `
      SELECT 
        u.id as user_id,
        u.name,
        u.username,
        u.role,
        u.designation,
        u.branch,
        u.phone,
        COUNT(a.id) as total_recorded_days,
        SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) as present_days,
        SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) as absent_days,
        SUM(CASE WHEN a.status = 'HALF_DAY' THEN 1 ELSE 0 END) as half_days,
        SUM(CASE WHEN a.status = 'LEAVE' THEN 1 ELSE 0 END) as leave_days,
        SUM(CASE WHEN a.status = 'ON_DUTY' THEN 1 ELSE 0 END) as on_duty_days,
        TIME_FORMAT(SEC_TO_TIME(AVG(TIME_TO_SEC(a.check_in))), '%H:%i') as avg_check_in,
        TIME_FORMAT(SEC_TO_TIME(AVG(TIME_TO_SEC(a.check_out))), '%H:%i') as avg_check_out,
        COALESCE(SUM(a.overtime_hours), 0) as total_overtime_hours,
        COALESCE(SUM(a.working_hours), 0) as total_working_hours
      FROM users u
      LEFT JOIN staff_attendance a ON u.id = a.user_id AND a.attendance_date LIKE ?
      WHERE u.status = 'active'
    `;
    const params = [`${month}%`];

    if (branch && branch !== 'ALL') {
      query += ` AND u.branch = ?`;
      params.push(branch);
    }

    query += ` GROUP BY u.id ORDER BY FIELD(u.role, 'admin', 'staff'), u.name ASC`;

    const [rows] = await pool.query(query, params);

    // Calculate percentage and formatted stats
    const staffSummaries = rows.map(r => {
      const presentEquivalent = parseFloat(r.present_days || 0) + (parseFloat(r.half_days || 0) * 0.5);
      const totalDays = parseInt(r.total_recorded_days || 0, 10);
      const percentage = totalDays > 0 ? Math.round((presentEquivalent / totalDays) * 100) : 0;

      return {
        ...r,
        present_equivalent: presentEquivalent,
        attendance_percentage: percentage
      };
    });

    return res.json({
      success: true,
      month,
      staffSummaries
    });
  } catch (err) {
    console.error('Get monthly summary error:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving monthly attendance summary' });
  }
};

// 4. Get detailed daily records for a single user in a month
exports.getUserMonthRecords = async (req, res) => {
  try {
    const { user_id, month } = req.query;
    if (!user_id || !month) {
      return res.status(400).json({ success: false, message: 'user_id and month required' });
    }

    const [records] = await pool.query(
      `SELECT id, attendance_date, status, check_in, check_out, notes
       FROM staff_attendance
       WHERE user_id = ? AND attendance_date LIKE ?
       ORDER BY attendance_date ASC`,
      [user_id, `${month}%`]
    );

    return res.json({ success: true, records });
  } catch (err) {
    console.error('Get user month records error:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving user month records' });
  }
};

// 4. Delete attendance record
exports.deleteAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM staff_attendance WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Attendance record deleted' });
  } catch (err) {
    console.error('Delete attendance error:', err);
    return res.status(500).json({ success: false, message: 'Server error deleting attendance record' });
  }
};
