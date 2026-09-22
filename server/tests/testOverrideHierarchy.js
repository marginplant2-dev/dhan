/**
 * Test Override Hierarchy
 * Tests that User Settings > Script Override > Segment Default
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Segment = require('../models/Segment');
const ScriptOverride = require('../models/ScriptOverride');
const UserSegmentSettings = require('../models/UserSegmentSettings');

const MONGODB_URI = process.env.MONGODB_URI;

// Test data
const TEST_SEGMENT_NAME = 'NSE_FUT';
const TEST_SYMBOL = 'NIFTY24MARFUT';
const TEST_SYMBOL_2 = 'BANKNIFTY24MARFUT';

let testUser1, testUser2, segment;

async function connectDB() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ MongoDB Connected\n');
}

async function disconnectDB() {
  await mongoose.disconnect();
  console.log('\n✅ MongoDB Disconnected');
}

function printHeader(title) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(60)}`);
}

function printTest(name) {
  console.log(`\n📋 ${name}`);
  console.log('─'.repeat(50));
}

async function setup() {
  printTest('SETUP: Preparing Test Data');
  
  // Get test users
  testUser1 = await User.findOne({ oderId: '661118' });
  testUser2 = await User.findOne({ oderId: '613971' });
  
  if (!testUser1 || !testUser2) {
    throw new Error('Test users not found. Need users with oderId 661118 and 613971');
  }
  
  // Get or create test segment
  segment = await Segment.findOne({ name: TEST_SEGMENT_NAME });
  if (!segment) {
    segment = await Segment.create({
      name: TEST_SEGMENT_NAME,
      displayName: 'NSE FUT',
      maxLots: 100,
      minLots: 1,
      orderLots: 20,
      maxQtyHolding: 10000,
      perOrderQty: 2000,
      commission: 50,
      commissionType: 'per_lot',
      tradingEnabled: true,
      isActive: true
    });
  }
  
  // Clean up any existing overrides
  await ScriptOverride.deleteMany({ segmentId: segment._id, symbol: { $in: [TEST_SYMBOL, TEST_SYMBOL_2] } });
  await UserSegmentSettings.deleteMany({ 
    userId: { $in: [testUser1._id, testUser2._id] }, 
    segmentId: segment._id 
  });
  
  console.log(`  ✅ Test User 1: ${testUser1.oderId}`);
  console.log(`  ✅ Test User 2: ${testUser2.oderId}`);
  console.log(`  ✅ Segment: ${segment.name} (maxLots: ${segment.maxLots})`);
}

async function testSegmentDefault() {
  printTest('TEST 1: Segment Default (No Overrides)');
  
  const settings = await UserSegmentSettings.getEffectiveSettingsForUser(
    testUser1._id,
    segment._id,
    TEST_SYMBOL,
    'netting'
  );
  
  console.log(`  📊 User 1 Settings for ${TEST_SYMBOL}:`);
  console.log(`     - maxLots: ${settings.maxLots} (expected: ${segment.maxLots})`);
  console.log(`     - commission: ${settings.commission} (expected: ${segment.commission})`);
  
  const pass1 = settings.maxLots === segment.maxLots;
  const pass2 = settings.commission === segment.commission;
  
  console.log(`  ${pass1 ? '✅' : '❌'} maxLots from segment default`);
  console.log(`  ${pass2 ? '✅' : '❌'} commission from segment default`);
  
  return pass1 && pass2;
}

async function testScriptOverride() {
  printTest('TEST 2: Script Override (Overrides Segment Default)');
  
  // Create script override with required fields
  await ScriptOverride.create({
    segmentId: segment._id,
    segmentName: segment.name,
    symbol: TEST_SYMBOL,
    tradingSymbol: TEST_SYMBOL,
    maxLots: 50,
    commission: 75,
    isActive: true
  });
  console.log(`  ✅ Created Script Override: maxLots=50, commission=75`);
  
  const settings = await UserSegmentSettings.getEffectiveSettingsForUser(
    testUser1._id,
    segment._id,
    TEST_SYMBOL,
    'netting'
  );
  
  console.log(`  📊 User 1 Settings for ${TEST_SYMBOL}:`);
  console.log(`     - maxLots: ${settings.maxLots} (expected: 50 from script)`);
  console.log(`     - commission: ${settings.commission} (expected: 75 from script)`);
  
  const pass1 = settings.maxLots === 50;
  const pass2 = settings.commission === 75;
  
  console.log(`  ${pass1 ? '✅' : '❌'} maxLots from script override`);
  console.log(`  ${pass2 ? '✅' : '❌'} commission from script override`);
  
  return pass1 && pass2;
}

async function testUserOverride() {
  printTest('TEST 3: User Override (Overrides Script Override)');
  
  // Create user-specific override for User 1
  await UserSegmentSettings.findOneAndUpdate(
    { userId: testUser1._id, segmentId: segment._id, symbol: TEST_SYMBOL, tradeMode: 'netting' },
    {
      userId: testUser1._id,
      oderId: testUser1.oderId,
      segmentId: segment._id,
      segmentName: segment.name,
      symbol: TEST_SYMBOL,
      tradeMode: 'netting',
      maxLots: 25,
      commission: 100,
      isActive: true
    },
    { upsert: true, new: true }
  );
  console.log(`  ✅ Created User Override for User 1: maxLots=25, commission=100`);
  
  // Check User 1 settings (should use user override)
  const settings1 = await UserSegmentSettings.getEffectiveSettingsForUser(
    testUser1._id,
    segment._id,
    TEST_SYMBOL,
    'netting'
  );
  
  console.log(`  📊 User 1 Settings for ${TEST_SYMBOL}:`);
  console.log(`     - maxLots: ${settings1.maxLots} (expected: 25 from user)`);
  console.log(`     - commission: ${settings1.commission} (expected: 100 from user)`);
  
  // Check User 2 settings (should still use script override)
  const settings2 = await UserSegmentSettings.getEffectiveSettingsForUser(
    testUser2._id,
    segment._id,
    TEST_SYMBOL,
    'netting'
  );
  
  console.log(`  📊 User 2 Settings for ${TEST_SYMBOL}:`);
  console.log(`     - maxLots: ${settings2.maxLots} (expected: 50 from script)`);
  console.log(`     - commission: ${settings2.commission} (expected: 75 from script)`);
  
  const pass1 = settings1.maxLots === 25;
  const pass2 = settings1.commission === 100;
  const pass3 = settings2.maxLots === 50;
  const pass4 = settings2.commission === 75;
  
  console.log(`  ${pass1 ? '✅' : '❌'} User 1 maxLots from user override`);
  console.log(`  ${pass2 ? '✅' : '❌'} User 1 commission from user override`);
  console.log(`  ${pass3 ? '✅' : '❌'} User 2 maxLots from script override (no user override)`);
  console.log(`  ${pass4 ? '✅' : '❌'} User 2 commission from script override (no user override)`);
  
  return pass1 && pass2 && pass3 && pass4;
}

async function testDifferentSymbols() {
  printTest('TEST 4: Different Symbols (Script Override per Symbol)');
  
  // Create script override for different symbol with required fields
  await ScriptOverride.create({
    segmentId: segment._id,
    segmentName: segment.name,
    symbol: TEST_SYMBOL_2,
    tradingSymbol: TEST_SYMBOL_2,
    maxLots: 30,
    commission: 60,
    isActive: true
  });
  console.log(`  ✅ Created Script Override for ${TEST_SYMBOL_2}: maxLots=30, commission=60`);
  
  // Check settings for both symbols
  const settings1 = await UserSegmentSettings.getEffectiveSettingsForUser(
    testUser2._id,
    segment._id,
    TEST_SYMBOL,
    'netting'
  );
  
  const settings2 = await UserSegmentSettings.getEffectiveSettingsForUser(
    testUser2._id,
    segment._id,
    TEST_SYMBOL_2,
    'netting'
  );
  
  console.log(`  📊 User 2 Settings for ${TEST_SYMBOL}: maxLots=${settings1.maxLots}`);
  console.log(`  📊 User 2 Settings for ${TEST_SYMBOL_2}: maxLots=${settings2.maxLots}`);
  
  const pass1 = settings1.maxLots === 50; // From NIFTY script override
  const pass2 = settings2.maxLots === 30; // From BANKNIFTY script override
  
  console.log(`  ${pass1 ? '✅' : '❌'} ${TEST_SYMBOL} uses its own script override (50)`);
  console.log(`  ${pass2 ? '✅' : '❌'} ${TEST_SYMBOL_2} uses its own script override (30)`);
  
  return pass1 && pass2;
}

async function testUpdateUserOverride() {
  printTest('TEST 5: Update User Override (Changes Apply Immediately)');
  
  // Get current settings
  const beforeSettings = await UserSegmentSettings.getEffectiveSettingsForUser(
    testUser1._id,
    segment._id,
    TEST_SYMBOL,
    'netting'
  );
  console.log(`  📊 Before Update: maxLots=${beforeSettings.maxLots}`);
  
  // Update user override
  await UserSegmentSettings.findOneAndUpdate(
    { userId: testUser1._id, segmentId: segment._id, symbol: TEST_SYMBOL, tradeMode: 'netting' },
    { maxLots: 15 },
    { new: true }
  );
  console.log(`  ✅ Updated User Override: maxLots=15`);
  
  // Get updated settings
  const afterSettings = await UserSegmentSettings.getEffectiveSettingsForUser(
    testUser1._id,
    segment._id,
    TEST_SYMBOL,
    'netting'
  );
  console.log(`  📊 After Update: maxLots=${afterSettings.maxLots}`);
  
  const pass = afterSettings.maxLots === 15;
  console.log(`  ${pass ? '✅' : '❌'} User override update applied immediately`);
  
  return pass;
}

async function testRemoveUserOverride() {
  printTest('TEST 6: Remove User Override (Falls Back to Script Override)');
  
  // Remove user override
  await UserSegmentSettings.deleteOne({
    userId: testUser1._id,
    segmentId: segment._id,
    symbol: TEST_SYMBOL,
    tradeMode: 'netting'
  });
  console.log(`  ✅ Removed User Override for User 1`);
  
  // Get settings (should fall back to script override)
  const settings = await UserSegmentSettings.getEffectiveSettingsForUser(
    testUser1._id,
    segment._id,
    TEST_SYMBOL,
    'netting'
  );
  
  console.log(`  📊 User 1 Settings after removal: maxLots=${settings.maxLots} (expected: 50 from script)`);
  
  const pass = settings.maxLots === 50;
  console.log(`  ${pass ? '✅' : '❌'} Falls back to script override after user override removed`);
  
  return pass;
}

async function testSegmentLevelUserOverride() {
  printTest('TEST 7: Segment-Level User Override (Applies to All Symbols)');
  
  // Create segment-level user override (symbol = null)
  await UserSegmentSettings.findOneAndUpdate(
    { userId: testUser1._id, segmentId: segment._id, symbol: null, tradeMode: 'netting' },
    {
      userId: testUser1._id,
      oderId: testUser1.oderId,
      segmentId: segment._id,
      segmentName: segment.name,
      symbol: null, // Applies to all symbols in segment
      tradeMode: 'netting',
      maxLots: 40,
      commission: 80,
      isActive: true
    },
    { upsert: true, new: true }
  );
  console.log(`  ✅ Created Segment-Level User Override: maxLots=40 (applies to all symbols)`);
  
  // Check settings for both symbols
  const settings1 = await UserSegmentSettings.getEffectiveSettingsForUser(
    testUser1._id,
    segment._id,
    TEST_SYMBOL,
    'netting'
  );
  
  const settings2 = await UserSegmentSettings.getEffectiveSettingsForUser(
    testUser1._id,
    segment._id,
    TEST_SYMBOL_2,
    'netting'
  );
  
  console.log(`  📊 User 1 Settings for ${TEST_SYMBOL}: maxLots=${settings1.maxLots}`);
  console.log(`  📊 User 1 Settings for ${TEST_SYMBOL_2}: maxLots=${settings2.maxLots}`);
  
  const pass1 = settings1.maxLots === 40;
  const pass2 = settings2.maxLots === 40;
  
  console.log(`  ${pass1 ? '✅' : '❌'} ${TEST_SYMBOL} uses segment-level user override`);
  console.log(`  ${pass2 ? '✅' : '❌'} ${TEST_SYMBOL_2} uses segment-level user override`);
  
  return pass1 && pass2;
}

async function cleanup() {
  printTest('CLEANUP');
  
  await ScriptOverride.deleteMany({ segmentId: segment._id, symbol: { $in: [TEST_SYMBOL, TEST_SYMBOL_2] } });
  await UserSegmentSettings.deleteMany({ 
    userId: { $in: [testUser1._id, testUser2._id] }, 
    segmentId: segment._id 
  });
  
  console.log('  ✅ Cleaned up test data');
}

async function runTests() {
  printHeader('OVERRIDE HIERARCHY TEST');
  console.log('Testing: User Settings > Script Override > Segment Default\n');
  
  await connectDB();
  
  let passed = 0;
  let failed = 0;
  
  try {
    await setup();
    
    const tests = [
      testSegmentDefault,
      testScriptOverride,
      testUserOverride,
      testDifferentSymbols,
      testUpdateUserOverride,
      testRemoveUserOverride,
      testSegmentLevelUserOverride
    ];
    
    for (const test of tests) {
      try {
        const result = await test();
        if (result) passed++;
        else failed++;
      } catch (error) {
        console.error(`  ❌ Test Error: ${error.message}`);
        failed++;
      }
    }
    
    await cleanup();
    
  } catch (error) {
    console.error('Setup Error:', error);
  }
  
  printHeader('TEST RESULTS');
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📊 Total:  ${passed + failed}`);
  printHeader('');
  
  await disconnectDB();
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
