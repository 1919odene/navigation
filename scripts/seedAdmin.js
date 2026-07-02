/**
 * FILE: scripts/seedAdmin.js  — Create Admin Account
 *
 * Run ONCE after first setup:
 *   cd ~/projects/grazing-nav-server
 *   node scripts/seedAdmin.js
 *
 * Admin login credentials after running:
 *   Username: value of ADMIN_USERNAME in .env (default: navigation_admin)
 *   Password: value of ADMIN_PASSWORD in .env (default: Navigation1919)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User     = require('../models/User');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  const exists = await User.findOne({ role: 'admin' });
  const adminUsername = process.env.ADMIN_USERNAME || 'navigation_admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Navigation1919';

  if (exists) {
    if (!exists.username) {
      exists.username = adminUsername;
      await exists.save();
    }
    console.log('Admin already exists');
    process.exit(0);
  }

  await User.create({
    name: 'System Admin',
    username: adminUsername,
    phone: '+255700000000',
    password: adminPassword,
    role: 'admin',
  });
  console.log(`Admin created — login with username: ${adminUsername} and password: ${adminPassword}`);
  process.exit(0);
}
seed().catch((e) => { console.error(e); process.exit(1); });
