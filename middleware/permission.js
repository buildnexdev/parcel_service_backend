const pool = require('../config/db');

/**
 * Middleware factory to enforce granular permissions.
 * @param {string} module - The system module (e.g., 'orders', 'reports', 'expenses', 'attendance', 'vehicles', 'drivers', 'staff')
 * @param {'view'|'add'|'edit'|'delete'|'export'} action - The operation being performed
 */
const requirePermission = (moduleName, action) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      // Admin role always has unrestricted full access to all modules and actions
      if (req.user.role === 'admin') {
        return next();
      }

      // Column in user_permissions table: can_view, can_add, can_edit, can_delete
      const actionColumn = action === 'export' ? 'can_edit' : `can_${action}`;

      const [rows] = await pool.query(
        `SELECT can_view, can_add, can_edit, can_delete 
         FROM user_permissions 
         WHERE user_id = ? AND module = ? LIMIT 1`,
        [req.user.id, moduleName]
      );

      // If no permission record exists yet for this user and module:
      if (rows.length === 0) {
        // Default behavior for staff if not explicitly configured:
        // By default, staff can view orders/vehicles/drivers, but cannot delete
        if (action === 'view' && ['orders', 'vehicles', 'drivers', 'expenses', 'attendance'].includes(moduleName)) {
          return next();
        }
        return res.status(403).json({
          success: false,
          message: `Access denied. You do not have permission to ${action} ${moduleName}. Please contact an administrator.`
        });
      }

      const perm = rows[0];
      const isAllowed = Boolean(perm[actionColumn]);

      if (isAllowed) {
        return next();
      }

      return res.status(403).json({
        success: false,
        message: `Access denied. You do not have permission to ${action} ${moduleName}. Please contact an administrator.`
      });
    } catch (err) {
      console.error('Permission check error:', err);
      return res.status(500).json({ success: false, message: 'Server error checking permissions' });
    }
  };
};

module.exports = {
  requirePermission
};
