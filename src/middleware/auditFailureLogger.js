const logAudit = require('../services/auditService');

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const RESOURCE_TO_TABLE = {
  'purchase-orders': 'purchase_orders',
  invoices: 'invoices',
  suppliers: 'suppliers',
  workers: 'workers',
  timesheets: 'timesheets',
  locations: 'locations',
  sites: 'sites',
  stages: 'po_stages',
  settings: 'site_settings',
  users: 'users',
  cashflow: 'cashflow',
  backups: 'system',
  'setup-wizard': 'system',
  auth: 'system'
};

function sanitizeForAudit(value, depth = 0) {
  if (value === null || value === undefined) {
    return value;
  }

  if (depth > 4) {
    return '[TRUNCATED_DEPTH]';
  }

  if (typeof value === 'string') {
    if (value.length <= 500) {
      return value;
    }
    return `${value.slice(0, 500)}...[TRUNCATED]`;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    const maxItems = 25;
    const trimmed = value.slice(0, maxItems).map(item => sanitizeForAudit(item, depth + 1));
    if (value.length > maxItems) {
      trimmed.push(`[TRUNCATED_ITEMS:${value.length - maxItems}]`);
    }
    return trimmed;
  }

  if (typeof value === 'object') {
    const output = {};
    const keys = Object.keys(value);
    const maxKeys = 40;

    for (const key of keys.slice(0, maxKeys)) {
      if (/password|token|secret|authorization|cookie/i.test(key)) {
        output[key] = '[REDACTED]';
      } else {
        output[key] = sanitizeForAudit(value[key], depth + 1);
      }
    }

    if (keys.length > maxKeys) {
      output.__truncated_keys = keys.length - maxKeys;
    }

    return output;
  }

  return String(value);
}

function inferTableNameFromRequest(req) {
  const url = String(req.originalUrl || req.baseUrl || req.path || '');
  const [pathOnly] = url.split('?');
  const segments = pathOnly.split('/').filter(Boolean);

  if (!segments.length) {
    return 'system';
  }

  const resource = segments[0];
  if (RESOURCE_TO_TABLE[resource]) {
    return RESOURCE_TO_TABLE[resource];
  }

  return resource.replace(/-/g, '_');
}

function getErrorMessageFromResponse(payload, statusCode) {
  if (!payload) {
    return statusCode >= 500 ? 'Internal server error' : 'Request failed';
  }

  if (typeof payload === 'string') {
    return payload.slice(0, 500);
  }

  if (typeof payload === 'object') {
    if (payload.error) return String(payload.error).slice(0, 500);
    if (payload.message) return String(payload.message).slice(0, 500);
  }

  return `Request failed (${statusCode})`;
}

function captureAuditFailure(req, error, context = {}) {
  if (!req || !error) return;

  req.auditFailureDetails = {
    error_message: error.message || null,
    error_code: error.code || null,
    errno: error.errno || null,
    sql_state: error.sqlState || null,
    sql_message: error.sqlMessage || null,
    context: sanitizeForAudit(context)
  };
}

function auditFailureLogger(req, res, next) {
  if (!MUTATION_METHODS.has(req.method)) {
    return next();
  }

  let responsePayload;

  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  res.json = function patchedJson(body) {
    responsePayload = body;
    return originalJson(body);
  };

  res.send = function patchedSend(body) {
    if (responsePayload === undefined) {
      responsePayload = body;
    }
    return originalSend(body);
  };

  res.on('finish', () => {
    if (res.statusCode < 400) {
      return;
    }

    if (!req.user || !req.user.id) {
      return;
    }

    const idCandidate = req.params?.id;
    const parsedId = Number(idCandidate);
    const recordId = Number.isFinite(parsedId) ? parsedId : null;

    const diagnostics = {
      status_code: res.statusCode,
      method: req.method,
      path: req.originalUrl || req.path || null,
      route: req.route?.path ? `${req.baseUrl || ''}${req.route.path}` : null,
      params: sanitizeForAudit(req.params),
      query: sanitizeForAudit(req.query),
      body: sanitizeForAudit(req.body),
      response: sanitizeForAudit(responsePayload),
      failure: req.auditFailureDetails || null,
      occurred_at: new Date().toISOString()
    };

    logAudit({
      table_name: inferTableNameFromRequest(req),
      record_id: recordId,
      action: `${req.method}_FAILED`,
      old_data: null,
      new_data: {
        success: false,
        error: getErrorMessageFromResponse(responsePayload, res.statusCode),
        diagnostics
      },
      changed_by: req.user.id,
      req
    }).catch((err) => {
      console.error('Failure audit logging failed:', err.message);
    });
  });

  next();
}

module.exports = {
  auditFailureLogger,
  captureAuditFailure
};
