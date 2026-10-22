/**
 * IRONMAN TOSS BOOK - Production Environment Configuration Validator (Day 19)
 * Validates required environment variables at application startup.
 * Prevents insecure defaults, missing database configuration, or weak secrets in production.
 */

const DEFAULT_INSECURE_SECRET = 'itb_secure_app_signing_secret_key_2026_at_least_32_chars';

/**
 * Validates environment variables according to runtime environment.
 * @param {Object} env - process.env or test configuration object
 * @returns {{ valid: boolean, errors: string[], warnings: string[], sanitized: Object }}
 */
function validateEnvironment(env = process.env) {
  const errors = [];
  const warnings = [];
  const nodeEnv = (env.NODE_ENV || 'development').toLowerCase();
  const isProduction = nodeEnv === 'production';

  // 1. Validate PORT
  const portStr = env.PORT || '5000';
  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push(`Invalid PORT "${portStr}". Must be an integer between 1 and 65535.`);
  }

  // 2. Validate Database Configuration
  const connectionUri = env.DATABASE_URL || env.MYSQL_URL;
  let dbHost = env.DB_HOST || 'localhost';
  let dbPort = parseInt(env.DB_PORT || '3306', 10);
  let dbName = env.DB_NAME || 'ironman_toss_book';
  let dbUser = env.DB_USER || 'root';
  let hasPassword = Boolean(env.DB_PASSWORD);

  if (connectionUri) {
    try {
      const parsed = new URL(connectionUri);
      dbHost = parsed.hostname;
      dbPort = parseInt(parsed.port || '3306', 10);
      dbName = (parsed.pathname || '').replace(/^\//, '');
      dbUser = decodeURIComponent(parsed.username || 'root');
      hasPassword = Boolean(parsed.password);
    } catch (_) {}
  }

  if (isNaN(dbPort) || dbPort < 1 || dbPort > 65535) {
    errors.push(`Invalid database port "${dbPort}". Must be an integer between 1 and 65535.`);
  }

  if (isProduction) {
    if (!connectionUri && (dbHost === 'localhost' || dbHost === '127.0.0.1')) {
      warnings.push('DB_HOST is set to localhost in production. Ensure MySQL runs locally on host or update to remote managed cluster.');
    }
    if (dbUser === 'root') {
      warnings.push('DB_USER is using "root" in production. Recommended practice is a dedicated least-privilege service account.');
    }
    if (!hasPassword) {
      errors.push('Database password (DB_PASSWORD or in DATABASE_URL) is required in production environment.');
    }
  }

  // 3. Validate Authentication Signing Secret
  const secret = env.SESSION_SECRET;
  if (!secret) {
    if (isProduction) {
      errors.push('SESSION_SECRET is required in production and cannot be empty.');
    } else {
      warnings.push('SESSION_SECRET not provided. Falling back to development placeholder secret.');
    }
  } else {
    if (secret === DEFAULT_INSECURE_SECRET && isProduction) {
      errors.push('SESSION_SECRET is using the insecure default template secret in production. Generate a high-entropy secret.');
    }
    if (secret.length < 32 && isProduction) {
      errors.push(`SESSION_SECRET length (${secret.length} chars) is insufficient for production. Must be at least 32 characters.`);
    }
  }

  // 4. Validate Administrative Provisioning Credentials & Frontend Origin
  if (isProduction) {
    if (env.ADMIN_PASSWORD && env.ADMIN_PASSWORD === 'Admin@Ironman2026') {
      warnings.push('ADMIN_PASSWORD matches default development value. Set a strong unique password before provisioning.');
    }
    const hasFrontendConfig = Boolean(env.FRONTEND_ORIGIN || env.FRONTEND_URL || env.ALLOWED_ORIGINS);
    if (!hasFrontendConfig) {
      warnings.push('FRONTEND_ORIGIN / FRONTEND_URL not explicitly set. Defaulting to localhost:5500 which may block production clients.');
    }
  }

  // 5. Database SSL Configuration
  const dbSsl = env.DB_SSL === 'true';
  const dbSslRejectUnauthorized = env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';

  return {
    valid: errors.length === 0,
    isProduction,
    nodeEnv,
    errors,
    warnings,
    sanitized: {
      nodeEnv,
      port,
      db: {
        host: dbHost,
        port: dbPort,
        database: dbName,
        user: dbUser,
        ssl: dbSsl,
        sslRejectUnauthorized: dbSslRejectUnauthorized,
        connectionLimit: parseInt(env.DB_CONNECTION_LIMIT || '10', 10)
      },
      frontendOrigin: env.FRONTEND_ORIGIN || 'http://localhost:5500',
      hasSessionSecret: Boolean(secret),
      sessionSecretLength: secret ? secret.length : 0
    }
  };
}

module.exports = {
  validateEnvironment,
  DEFAULT_INSECURE_SECRET
};
