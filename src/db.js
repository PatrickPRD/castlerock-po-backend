const mysql = require('mysql2/promise');

const baseConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true,
  enableKeepAlive: true
};

const pool = mysql.createPool({
  ...baseConfig,
  database: process.env.DB_NAME
});

async function ensureDatabaseExists() {
  const dbName = process.env.DB_NAME;
  if (!dbName) {
    throw new Error('DB_NAME is not set in the environment');
  }

  const adminConn = await mysql.createConnection({
    host: baseConfig.host,
    user: baseConfig.user,
    password: baseConfig.password,
    port: baseConfig.port,
    connectTimeout: 5000
  });

  try {
    await adminConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  } finally {
    await adminConn.end();
  }
}

const dbReady = (async () => {
  try {
    await ensureDatabaseExists();
    const conn = await Promise.race([
      pool.getConnection(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout after 5 seconds')), 5000)
      )
    ]);
    conn.release();
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    throw err;
  }
})();

pool.ready = dbReady;

module.exports = pool;
