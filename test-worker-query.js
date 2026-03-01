const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'admin',
    password: 'Hj1ltl1nd&!',
    database: 'castlerock_po_dev',
    port: 3306
  });

  try {
    const [workers] = await conn.query(
      `
      SELECT
        id,
        first_name,
        last_name,
        email,
        mobile_number,
        address,
        bank_details,
        pps_number,
        weekly_take_home,
        weekly_cost,
        safe_pass_number,
        safe_pass_expiry_date,
        date_of_employment,
        employee_id,
        notes,
        left_at,
        active
      FROM workers
      WHERE id = ?
      `,
      [12]
    );

    if (workers.length === 0) {
      console.log('Worker with ID 12 not found');
    } else {
      console.log('Worker found:', workers[0]);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }

  await conn.end();
})();
