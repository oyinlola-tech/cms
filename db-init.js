const mysql = require('mysql2');
const bcrypt = require('bcrypt');
require('dotenv').config();

const DB_NAME = process.env.DB_NAME || 'church_db';
const SALT_ROUNDS = 10;

// Helper: promisified query
function query(connection, sql, params = []) {
  return new Promise((resolve, reject) => {
    connection.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

// Check if database exists
async function databaseExists(connection) {
  const results = await query(
    connection,
    `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?`,
    [DB_NAME]
  );
  return results.length > 0;
}

// Create database if not exists
async function createDatabase(connection) {
  console.log(`Creating database "${DB_NAME}"...`);
  await query(connection, `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
  console.log(`Database "${DB_NAME}" ready.`);
}

// Create all tables if they don't exist
async function createTables(connection) {
  console.log('Checking tables...');
  
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'admin',
      avatar VARCHAR(500),
      twofa_enabled BOOLEAN DEFAULT FALSE,
      last_login TIMESTAMP NULL,
      last_ip VARCHAR(45),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS password_resets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(100) NOT NULL,
      token VARCHAR(100),
      otp VARCHAR(6),
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX(email)
    )`,
    `CREATE TABLE IF NOT EXISTS church_info (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) DEFAULT 'The Sacred Hearth',
      address TEXT,
      phone VARCHAR(20),
      email VARCHAR(100),
      registration_no VARCHAR(50),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS members (
      id INT AUTO_INCREMENT PRIMARY KEY,
      first_name VARCHAR(50) NOT NULL,
      last_name VARCHAR(50) NOT NULL,
      email VARCHAR(100) UNIQUE,
      phone VARCHAR(20),
      address TEXT,
      dob DATE,
      gender ENUM('male', 'female', 'other'),
      marital_status VARCHAR(20),
      occupation VARCHAR(100),
      member_type ENUM('adult', 'youth', 'child') DEFAULT 'adult',
      department VARCHAR(50),
      baptism_status BOOLEAN DEFAULT FALSE,
      joined_date DATE,
      avatar VARCHAR(500),
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS family_members (
      id INT AUTO_INCREMENT PRIMARY KEY,
      member_id INT NOT NULL,
      related_member_id INT NOT NULL,
      relationship VARCHAR(50),
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
      FOREIGN KEY (related_member_id) REFERENCES members(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS attendance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      member_id INT NOT NULL,
      event_date DATE NOT NULL,
      service_type VARCHAR(50),
      status ENUM('present', 'absent', 'excused') DEFAULT 'present',
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
      INDEX(member_id, event_date)
    )`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      reference VARCHAR(50) UNIQUE NOT NULL,
      type ENUM('income', 'expense') NOT NULL,
      category VARCHAR(50) NOT NULL,
      subcategory VARCHAR(50),
      amount DECIMAL(12,2) NOT NULL,
      description TEXT,
      member_id INT NULL,
      payment_method ENUM('cash', 'bank_transfer', 'mobile', 'card', 'other') DEFAULT 'cash',
      status ENUM('pending', 'completed', 'cancelled') DEFAULT 'pending',
      transaction_date DATE NOT NULL,
      recorded_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL,
      FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX(transaction_date),
      INDEX(type)
    )`,
    `CREATE TABLE IF NOT EXISTS expense_categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL,
      budget_allocation DECIMAL(12,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS programs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      type ENUM('devotion', 'service', 'fellowship', 'bible_study', 'outreach', 'youth', 'other') DEFAULT 'service',
      category VARCHAR(50),
      location VARCHAR(200),
      start_datetime DATETIME NOT NULL,
      end_datetime DATETIME,
      recurring ENUM('none', 'daily', 'weekly', 'monthly') DEFAULT 'none',
      recurring_until DATE,
      schedule VARCHAR(100),
      is_main_service BOOLEAN DEFAULT FALSE,
      is_featured BOOLEAN DEFAULT FALSE,
      status ENUM('upcoming', 'ongoing', 'completed', 'cancelled') DEFAULT 'upcoming',
      display_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX(start_datetime),
      INDEX(status)
    )`,
    `CREATE TABLE IF NOT EXISTS weekly_schedule (
      id INT AUTO_INCREMENT PRIMARY KEY,
      day_of_week ENUM('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday') NOT NULL,
      program_name VARCHAR(100) NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME,
      display_order INT DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS announcements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      summary TEXT NOT NULL,
      content TEXT,
      category VARCHAR(50) DEFAULT 'General',
      image_url VARCHAR(500),
      is_featured BOOLEAN DEFAULT FALSE,
      is_new BOOLEAN DEFAULT FALSE,
      priority ENUM('normal', 'high', 'urgent') DEFAULT 'normal',
      status ENUM('draft', 'published', 'scheduled', 'archived') DEFAULT 'draft',
      scheduled_for DATETIME NULL,
      published_at TIMESTAMP NULL,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX(status),
      INDEX(published_at)
    )`,
    `CREATE TABLE IF NOT EXISTS gallery (
      id INT AUTO_INCREMENT PRIMARY KEY,
      url VARCHAR(500) NOT NULL,
      caption VARCHAR(255),
      description TEXT,
      category VARCHAR(50),
      is_featured BOOLEAN DEFAULT FALSE,
      display_order INT DEFAULT 0,
      uploaded_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX(is_featured)
    )`,
    `CREATE TABLE IF NOT EXISTS contact_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) NOT NULL,
      phone VARCHAR(20),
      subject VARCHAR(100),
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS contact_replies (
      id INT AUTO_INCREMENT PRIMARY KEY,
      contact_message_id INT NOT NULL,
      replied_by INT,
      to_email VARCHAR(100) NOT NULL,
      subject VARCHAR(150) NOT NULL,
      message TEXT NOT NULL,
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contact_message_id) REFERENCES contact_messages(id) ON DELETE CASCADE,
      FOREIGN KEY (replied_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX(contact_message_id)
    )`,
    `CREATE TABLE IF NOT EXISTS external_links (
      id INT AUTO_INCREMENT PRIMARY KEY,
      link_key VARCHAR(80) NOT NULL UNIQUE,
      label VARCHAR(120) NOT NULL,
      url VARCHAR(800),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS activity_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      action VARCHAR(50) NOT NULL,
      entity_type VARCHAR(50),
      entity_id INT,
      description TEXT,
      ip_address VARCHAR(45),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )`
  ];

  for (const sql of tables) {
    await query(connection, sql);
  }
  console.log('All tables verified/created.');
}

// Insert default church info if empty
async function insertDefaultChurchInfo(connection) {
  const results = await query(connection, 'SELECT COUNT(*) as count FROM church_info');
  if (results[0].count === 0) {
    await query(connection,
      `INSERT INTO church_info (name, address, phone, email) VALUES (?, ?, ?, ?)`,
      ['The Sacred Hearth', '12 Cathedral Way, Okitipupa, Ondo State', '+234 803 123 4567', 'hello@sacredhearth.ng']
    );
    console.log('Default church info inserted.');
  }
}

// Insert default weekly schedule if empty
async function insertDefaultWeeklySchedule(connection) {
  const results = await query(connection, 'SELECT COUNT(*) as count FROM weekly_schedule');
  if (results[0].count === 0) {
    const schedules = [
      ['Sunday', 'Divine Worship', '08:00:00', '11:30:00', 1],
      ['Wednesday', 'Prayer Hour', '17:00:00', '18:30:00', 2],
      ['Friday', 'Vigil (Monthly)', '22:00:00', '04:00:00', 3]
    ];
    for (const s of schedules) {
      await query(connection,
        `INSERT INTO weekly_schedule (day_of_week, program_name, start_time, end_time, display_order) VALUES (?, ?, ?, ?, ?)`,
        s
      );
    }
    console.log('Default weekly schedule inserted.');
  }
}

async function insertDefaultExternalLinks(connection) {
  const results = await query(connection, 'SELECT COUNT(*) as count FROM external_links');
  if (results[0].count === 0) {
    const defaults = [
      ['join_service', 'Join Our Service', null],
      ['watch_online', 'Watch Online', null]
    ];
    for (const row of defaults) {
      await query(connection, 'INSERT INTO external_links (link_key, label, url) VALUES (?, ?, ?)', row);
    }
    console.log('Default external links inserted.');
  }
}

// Insert default admin user from .env if not exists
async function insertDefaultAdmin(connection) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME || 'Parish Administrator';

  if (!adminEmail || !adminPassword) {
    console.warn('WARNING: ADMIN_EMAIL or ADMIN_PASSWORD missing in .env. Skipping default admin creation.');
    return;
  }

  if (adminPassword === 'Admin@1234' || adminPassword.length < 10) {
    console.warn('WARNING: ADMIN_PASSWORD looks weak/default. Change it before deploying to production.');
  }

  const results = await query(connection, 'SELECT id FROM users WHERE email = ?', [adminEmail]);
  if (results.length === 0) {
    const hashed = await bcrypt.hash(adminPassword, SALT_ROUNDS);
    await query(connection,
      `INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`,
      [adminName, adminEmail, hashed, 'admin']
    );
    console.log(`Default admin user created: ${adminEmail}`);
  } else {
    console.log(`Admin user "${adminEmail}" already exists.`);
  }
}

// Main initialization function
async function initializeDatabase() {
  const initConn = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'mysql'
  });

  try {
    // Connect without database
    await new Promise((resolve, reject) => {
      initConn.connect(err => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('Connected to MySQL server.');

    // Create database if needed
    const dbExists = await databaseExists(initConn);
    if (!dbExists) {
      await createDatabase(initConn);
    } else {
      console.log(`Database "${DB_NAME}" already exists.`);
    }

    // Close initial connection
    await new Promise(resolve => initConn.end(resolve));

    // Create main connection with database selected
    const dbConnection = mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'mysql',
      database: DB_NAME,
      multipleStatements: true
    });

    await new Promise((resolve, reject) => {
      dbConnection.connect(err => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log(`Connected to database "${DB_NAME}".`);

    // Create tables
    await createTables(dbConnection);

    // Insert default data
    await insertDefaultChurchInfo(dbConnection);
    await insertDefaultWeeklySchedule(dbConnection);
    await insertDefaultExternalLinks(dbConnection);
    await insertDefaultAdmin(dbConnection);

    console.log('Database initialization complete.');
    return dbConnection;
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    throw error;
  }
}

module.exports = { initializeDatabase };
