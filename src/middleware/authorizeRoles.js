/**
 * Role-based access control middleware
 * Usage:
 *   authorizeRoles('admin')
 *   authorizeRoles('super_admin')
 *   authorizeRoles('admin', 'super_admin')
 */

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {

    // authenticate middleware MUST have already run
    if (!req.user) {
      return res.status(401).json({
        error: 'Not authenticated'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    next();
  };
}

module.exports = authorizeRoles;
