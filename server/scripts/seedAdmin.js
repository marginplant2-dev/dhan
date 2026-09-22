/**
 * Seed Admin User Script
 * Run: node scripts/seedAdmin.js
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// User Schema (simplified for seeding)
const userSchema = new mongoose.Schema({
  oderId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin', 'subadmin', 'broker'], default: 'user' },
  status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
  wallet: {
    balance: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    equity: { type: Number, default: 0 },
    margin: { type: Number, default: 0 },
    freeMargin: { type: Number, default: 0 },
    marginLevel: { type: Number, default: 0 }
  },
  createdBy: { type: String, default: null },
  lastLogin: { type: Date, default: null }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// Admin accounts to seed
const adminAccounts = [
  {
    oderId: 'ADMIN001',
    email: process.env.ADMIN_EMAIL || 'admin@dhanfunded.com',
    phone: '9999999999',
    password: process.env.ADMIN_DEFAULT_PASSWORD || 'Admin@DhanFunded2024',
    name: 'Super Admin',
    role: 'admin',
    wallet: {
      balance: 1000000,
      credit: 0,
      equity: 1000000,
      margin: 0,
      freeMargin: 1000000,
      marginLevel: 0
    }
  },
  {
    oderId: 'SUBADMIN001',
    email: 'subadmin@dhanfunded.com',
    phone: '9999999998',
    password: 'SubAdmin@123',
    name: 'Sub Admin',
    role: 'subadmin',
    wallet: {
      balance: 500000,
      credit: 0,
      equity: 500000,
      margin: 0,
      freeMargin: 500000,
      marginLevel: 0
    }
  },
  {
    oderId: 'BROKER001',
    email: 'broker@dhanfunded.com',
    phone: '9999999997',
    password: 'Broker@123',
    name: 'Broker',
    role: 'broker',
    wallet: {
      balance: 100000,
      credit: 0,
      equity: 100000,
      margin: 0,
      freeMargin: 100000,
      marginLevel: 0
    }
  }
];

async function seedAdmins() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    for (const admin of adminAccounts) {
      const hashedPassword = await bcrypt.hash(admin.password, 10);
      
      const result = await User.findOneAndUpdate(
        { email: admin.email },
        {
          ...admin,
          password: hashedPassword
        },
        { upsert: true, new: true }
      );
      
      console.log(`✅ ${admin.role.toUpperCase()} created/updated: ${result.email}`);
    }

    console.log('\n========================================');
    console.log('🎉 Admin accounts seeded successfully!');
    console.log('========================================\n');
    console.log('Login Credentials:');
    console.log('------------------');
    adminAccounts.forEach(acc => {
      console.log(`${acc.role.toUpperCase()}:`);
      console.log(`  Email: ${acc.email}`);
      console.log(`  Password: ${acc.password}`);
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding admins:', error);
    process.exit(1);
  }
}

seedAdmins();
