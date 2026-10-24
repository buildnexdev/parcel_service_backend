const pool = require('../config/db');

const SYSTEM_MODULES = [
  { id: 'orders', name: 'Orders & Tracking (LR)', important: true, description: 'Bookings, consignments, waybills, and LR tracking' },
  { id: 'reports', name: 'Daily & Financial Reports', important: true, description: 'Revenue summaries, branch analytics, delivery run sheets' },
  { id: 'expenses', name: 'Daily Expenses', important: false, description: 'Diesel, driver batta, tolls, loading charges, vehicle maintenance' },
  { id: 'attendance', name: 'Staff Attendance', important: false, description: 'Daily attendance marking, working hours, monthly registers' },
  { id: 'vehicles', name: 'Vehicles & Fleet', important: false, description: 'Fleet directory, vehicle registration, and assignments' },
  { id: 'drivers', name: 'Assigned Drivers', important: false, description: 'Driver directory, phone numbers, and assigned routes' },
  { id: 'staff', name: 'Staff & Team Directory', important: false, description: 'Staff members, designations, and account status' }
];

// 1. Get current logged-in user's active permissions
exports.getMyPermissions = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    if (role === 'admin') {
      // Admin has full access to everything
      const fullPerms = {};
      SYSTEM_MODULES.forEach(m => {
        fullPerms[m.id] = {
          view: true,
          add: true,
          edit: true,
          delete: true,
          export: true
        };
      });
      fullPerms['permissions'] = {
        view: true,
        add: true,
        edit: true,
        delete: true
      };

      return res.json({
        success: true,
        isAdmin: true,
        permissions: fullPerms
      });
    }

    // For staff, load from user_permissions
    const [rows] = await pool.query(
      'SELECT module, can_view, can_add, can_edit, can_delete FROM user_permissions WHERE user_id = ?',
      [userId]
    );

    const perms = {};
    // Initial defaults for staff
    SYSTEM_MODULES.forEach(m => {
      perms[m.id] = {
        view: ['orders', 'vehicles', 'drivers'].includes(m.id),
        add: ['orders'].includes(m.id),
        edit: false,
        delete: false,
        export: false
      };
    });

    rows.forEach(r => {
      perms[r.module] = {
        view: Boolean(r.can_view),
        add: Boolean(r.can_add),
        edit: Boolean(r.can_edit),
        delete: Boolean(r.can_delete),
        export: Boolean(r.can_edit)
      };
    });

    // Staff never gets permission management page
    perms['permissions'] = {
      view: false,
      add: false,
      edit: false,
      delete: false
    };

    return res.json({
      success: true,
      isAdmin: false,
      permissions: perms
    });
  } catch (err) {
    console.error('Get my permissions error:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving permissions' });
  }
};

// 2. Get all staff users and their configured permissions (Admin only)
exports.getAllStaffPermissions = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only administrators can manage permissions' });
    }

    // Fetch all active users
    const [users] = await pool.query(
      `SELECT id, name, username, email, phone, role, designation, branch, status 
       FROM users 
       ORDER BY FIELD(role, 'admin', 'staff'), name ASC`
    );

    // Fetch all permission rows
    const [permRows] = await pool.query(
      'SELECT user_id, module, can_view, can_add, can_edit, can_delete FROM user_permissions'
    );

    // Map permissions by user_id
    const userPermMap = {};
    permRows.forEach(r => {
      if (!userPermMap[r.user_id]) userPermMap[r.user_id] = {};
      userPermMap[r.user_id][r.module] = {
        can_view: Boolean(r.can_view),
        can_add: Boolean(r.can_add),
        can_edit: Boolean(r.can_edit),
        can_delete: Boolean(r.can_delete)
      };
    });

    // Build complete users list with module permissions
    const usersWithPermissions = users.map(u => {
      const perms = {};
      const isAdmin = u.role === 'admin';

      SYSTEM_MODULES.forEach(m => {
        if (isAdmin) {
          perms[m.id] = { can_view: true, can_add: true, can_edit: true, can_delete: true };
        } else if (userPermMap[u.id] && userPermMap[u.id][m.id]) {
          perms[m.id] = userPermMap[u.id][m.id];
        } else {
          // Default initial suggestion for staff
          perms[m.id] = {
            can_view: ['orders', 'vehicles', 'drivers'].includes(m.id),
            can_add: ['orders'].includes(m.id),
            can_edit: false,
            can_delete: false
          };
        }
      });

      return {
        ...u,
        permissions: perms
      };
    });

    return res.json({
      success: true,
      modules: SYSTEM_MODULES,
      users: usersWithPermissions
    });
  } catch (err) {
    console.error('Get all staff permissions error:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving staff permissions' });
  }
};

// 3. Get single user's permissions (Admin only)
exports.getUserPermissions = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only administrators can manage permissions' });
    }

    const userId = req.params.userId;
    const [users] = await pool.query(
      'SELECT id, name, username, email, phone, role, designation, branch, status FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = users[0];
    const isAdmin = user.role === 'admin';

    const [rows] = await pool.query(
      'SELECT module, can_view, can_add, can_edit, can_delete FROM user_permissions WHERE user_id = ?',
      [userId]
    );

    const savedPerms = {};
    rows.forEach(r => {
      savedPerms[r.module] = {
        can_view: Boolean(r.can_view),
        can_add: Boolean(r.can_add),
        can_edit: Boolean(r.can_edit),
        can_delete: Boolean(r.can_delete)
      };
    });

    const perms = {};
    SYSTEM_MODULES.forEach(m => {
      if (isAdmin) {
        perms[m.id] = { can_view: true, can_add: true, can_edit: true, can_delete: true };
      } else if (savedPerms[m.id]) {
        perms[m.id] = savedPerms[m.id];
      } else {
        perms[m.id] = {
          can_view: ['orders', 'vehicles', 'drivers'].includes(m.id),
          can_add: ['orders'].includes(m.id),
          can_edit: false,
          can_delete: false
        };
      }
    });

    return res.json({
      success: true,
      user,
      modules: SYSTEM_MODULES,
      permissions: perms
    });
  } catch (err) {
    console.error('Get user permissions error:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving user permissions' });
  }
};

// 4. Update permissions for a specific user (Admin only)
exports.updateUserPermissions = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only administrators can modify permissions' });
    }

    const userId = req.params.userId;
    const { permissions } = req.body; // { orders: { can_view, can_add, can_edit, can_delete }, ... }

    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid permissions payload' });
    }

    const [users] = await pool.query('SELECT id, name, role FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Save permissions for each module
    for (const mod of SYSTEM_MODULES) {
      const p = permissions[mod.id] || {};
      const can_view = p.can_view ? 1 : 0;
      const can_add = p.can_add ? 1 : 0;
      const can_edit = p.can_edit ? 1 : 0;
      const can_delete = p.can_delete ? 1 : 0;

      await pool.query(
        `INSERT INTO user_permissions (user_id, module, can_view, can_add, can_edit, can_delete) 
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           can_view = VALUES(can_view),
           can_add = VALUES(can_add),
           can_edit = VALUES(can_edit),
           can_delete = VALUES(can_delete)`,
        [userId, mod.id, can_view, can_add, can_edit, can_delete]
      );
    }

    return res.json({
      success: true,
      message: `Permissions updated successfully for ${users[0].name}`
    });
  } catch (err) {
    console.error('Update user permissions error:', err);
    return res.status(500).json({ success: false, message: 'Server error updating permissions', error: err.message });
  }
};
