/**
 * Test Script for Trade Validation with Segment Settings
 * Tests that segment settings are correctly applied during trade execution
 * 
 * Run with: node tests/testTradeValidation.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Models
const Segment = require('../models/Segment');
const ScriptOverride = require('../models/ScriptOverride');
const UserSegmentSettings = require('../models/UserSegmentSettings');
const User = require('../models/User');

// Engine
const NettingEngine = require('../engines/NettingEngine');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    process.exit(1);
  }
};

// Test Results
const results = { passed: 0, failed: 0, tests: [] };

const logTest = (name, passed, details = '') => {
  results.tests.push({ name, passed, details });
  if (passed) {
    results.passed++;
    console.log(`  ✅ ${name}`);
  } else {
    results.failed++;
    console.log(`  ❌ ${name}: ${details}`);
  }
};

// ============== SETUP TEST DATA ==============
const setupTestData = async () => {
  console.log('\n📋 SETUP: Creating Test Data');
  console.log('─'.repeat(50));
  
  // Get test user
  const testUser = await User.findOne({ role: 'user' });
  if (!testUser) {
    console.log('  ⚠️ No test user found');
    return null;
  }
  console.log(`  ✅ Test User: ${testUser.oderId}`);
  
  // Get NSE_FUT segment
  const segment = await Segment.findOne({ name: 'NSE_FUT' });
  if (!segment) {
    console.log('  ⚠️ NSE_FUT segment not found');
    return null;
  }
  console.log(`  ✅ Segment: ${segment.name} (maxLots: ${segment.maxLots})`);
  
  // Clean up test data
  await ScriptOverride.deleteMany({ symbol: 'NIFTY24MARFUT' });
  await UserSegmentSettings.deleteMany({ userId: testUser._id, segmentId: segment._id });
  
  return { user: testUser, segment };
};

// ============== TEST 1: Segment Default Limits ==============
const testSegmentDefaultLimits = async (engine, user, segment) => {
  console.log('\n📋 TEST 1: Segment Default Limits');
  console.log('─'.repeat(50));
  
  // Get effective settings (should be segment defaults)
  const settings = await UserSegmentSettings.getEffectiveSettingsForUser(
    user._id, segment._id, 'NIFTY24MARFUT', 'netting'
  );
  
  console.log(`  📊 Effective Settings (Segment Default):`);
  console.log(`     - maxLots: ${settings.maxLots}`);
  console.log(`     - minLots: ${settings.minLots}`);
  console.log(`     - orderLots: ${settings.orderLots}`);
  console.log(`     - tradingEnabled: ${settings.tradingEnabled}`);
  
  logTest('maxLots from segment default', settings.maxLots === segment.maxLots, 
    `Expected: ${segment.maxLots}, Got: ${settings.maxLots}`);
  logTest('tradingEnabled from segment default', settings.tradingEnabled === true);
  
  return settings;
};

// ============== TEST 2: Script Override Limits ==============
const testScriptOverrideLimits = async (engine, user, segment) => {
  console.log('\n📋 TEST 2: Script Override Limits');
  console.log('─'.repeat(50));
  
  // Create script override with lower limits
  const scriptOverride = await ScriptOverride.findOneAndUpdate(
    { symbol: 'NIFTY24MARFUT', segmentId: segment._id },
    {
      symbol: 'NIFTY24MARFUT',
      tradingSymbol: 'NIFTY24MARFUT',
      segmentId: segment._id,
      segmentName: segment.name,
      lotSize: 50,
      maxLots: 20,  // Lower than segment default (50)
      minLots: 1,
      orderLots: 5,
      perOrderQty: 500,
      maxQtyHolding: 1000,
      commission: 50,
      isActive: true,
      tradingEnabled: true
    },
    { upsert: true, new: true }
  );
  
  console.log(`  ✅ Created Script Override: maxLots=${scriptOverride.maxLots}`);
  
  // Get effective settings (should use script override)
  const settings = await UserSegmentSettings.getEffectiveSettingsForUser(
    user._id, segment._id, 'NIFTY24MARFUT', 'netting'
  );
  
  console.log(`  📊 Effective Settings (With Script Override):`);
  console.log(`     - maxLots: ${settings.maxLots} (script: 20, segment: ${segment.maxLots})`);
  console.log(`     - perOrderQty: ${settings.perOrderQty}`);
  console.log(`     - hasScriptOverride: ${settings.hasScriptOverride}`);
  
  logTest('maxLots from script override', settings.maxLots === 20, 
    `Expected: 20, Got: ${settings.maxLots}`);
  logTest('perOrderQty from script override', settings.perOrderQty === 500,
    `Expected: 500, Got: ${settings.perOrderQty}`);
  logTest('hasScriptOverride is true', settings.hasScriptOverride === true);
  
  return scriptOverride;
};

// ============== TEST 3: User-Specific Override ==============
const testUserSpecificOverride = async (engine, user, segment) => {
  console.log('\n📋 TEST 3: User-Specific Override');
  console.log('─'.repeat(50));
  
  // Create user-specific override with even lower limits
  const userSetting = await UserSegmentSettings.findOneAndUpdate(
    { userId: user._id, segmentId: segment._id, symbol: 'NIFTY24MARFUT', tradeMode: 'netting' },
    {
      userId: user._id,
      oderId: user.oderId,
      segmentId: segment._id,
      segmentName: segment.name,
      symbol: 'NIFTY24MARFUT',
      tradeMode: 'netting',
      maxLots: 5,  // Even lower than script override (20)
      minLots: 1,
      orderLots: 2,
      perOrderQty: 100,
      maxQtyHolding: 200,
      commission: 25,
      isActive: true,
      tradingEnabled: true,
      updatedAt: Date.now()
    },
    { upsert: true, new: true }
  );
  
  console.log(`  ✅ Created User Override: maxLots=${userSetting.maxLots}`);
  
  // Get effective settings (should use user override)
  const settings = await UserSegmentSettings.getEffectiveSettingsForUser(
    user._id, segment._id, 'NIFTY24MARFUT', 'netting'
  );
  
  console.log(`  📊 Effective Settings (With User Override):`);
  console.log(`     - maxLots: ${settings.maxLots} (user: 5, script: 20, segment: ${segment.maxLots})`);
  console.log(`     - perOrderQty: ${settings.perOrderQty} (user: 100, script: 500)`);
  console.log(`     - hasUserOverride: ${settings.hasUserOverride}`);
  
  logTest('maxLots from user override', settings.maxLots === 5, 
    `Expected: 5, Got: ${settings.maxLots}`);
  logTest('perOrderQty from user override', settings.perOrderQty === 100,
    `Expected: 100, Got: ${settings.perOrderQty}`);
  logTest('hasUserOverride is true', settings.hasUserOverride === true);
  
  return userSetting;
};

// ============== TEST 4: Block Settings ==============
const testBlockSettings = async (engine, user, segment) => {
  console.log('\n📋 TEST 4: Block Settings');
  console.log('─'.repeat(50));
  
  // Update user setting to block trading
  await UserSegmentSettings.findOneAndUpdate(
    { userId: user._id, segmentId: segment._id, symbol: 'NIFTY24MARFUT', tradeMode: 'netting' },
    { tradingEnabled: false }
  );
  
  const settings = await UserSegmentSettings.getEffectiveSettingsForUser(
    user._id, segment._id, 'NIFTY24MARFUT', 'netting'
  );
  
  logTest('tradingEnabled is false (blocked)', settings.tradingEnabled === false,
    `Expected: false, Got: ${settings.tradingEnabled}`);
  
  // Re-enable trading
  await UserSegmentSettings.findOneAndUpdate(
    { userId: user._id, segmentId: segment._id, symbol: 'NIFTY24MARFUT', tradeMode: 'netting' },
    { tradingEnabled: true }
  );
  
  console.log('  ✅ Re-enabled trading for further tests');
};

// ============== TEST 5: Different Users Get Different Settings ==============
const testDifferentUsers = async (engine, user, segment) => {
  console.log('\n📋 TEST 5: Different Users Get Different Settings');
  console.log('─'.repeat(50));
  
  // Get another user
  const otherUser = await User.findOne({ role: 'user', _id: { $ne: user._id } });
  
  if (!otherUser) {
    console.log('  ⚠️ No other user found - skipping test');
    return;
  }
  
  console.log(`  User 1: ${user.oderId}`);
  console.log(`  User 2: ${otherUser.oderId}`);
  
  // User 1 has override (maxLots: 5)
  const user1Settings = await UserSegmentSettings.getEffectiveSettingsForUser(
    user._id, segment._id, 'NIFTY24MARFUT', 'netting'
  );
  
  // User 2 should get script override (maxLots: 20) since no user-specific override
  const user2Settings = await UserSegmentSettings.getEffectiveSettingsForUser(
    otherUser._id, segment._id, 'NIFTY24MARFUT', 'netting'
  );
  
  console.log(`  📊 User 1 (${user.oderId}): maxLots=${user1Settings.maxLots}, hasUserOverride=${user1Settings.hasUserOverride}`);
  console.log(`  📊 User 2 (${otherUser.oderId}): maxLots=${user2Settings.maxLots}, hasUserOverride=${user2Settings.hasUserOverride}`);
  
  logTest('User 1 gets user override (maxLots: 5)', user1Settings.maxLots === 5,
    `Expected: 5, Got: ${user1Settings.maxLots}`);
  logTest('User 2 gets script override (maxLots: 20)', user2Settings.maxLots === 20,
    `Expected: 20, Got: ${user2Settings.maxLots}`);
  logTest('User 1 hasUserOverride=true', user1Settings.hasUserOverride === true);
  logTest('User 2 hasUserOverride=false', user2Settings.hasUserOverride === false);
};

// ============== TEST 6: Segment-Level User Override (No Symbol) ==============
const testSegmentLevelUserOverride = async (engine, user, segment) => {
  console.log('\n📋 TEST 6: Segment-Level User Override (All Symbols)');
  console.log('─'.repeat(50));
  
  // Create segment-level override (applies to all symbols in segment)
  await UserSegmentSettings.findOneAndUpdate(
    { userId: user._id, segmentId: segment._id, symbol: null, tradeMode: 'netting' },
    {
      userId: user._id,
      oderId: user.oderId,
      segmentId: segment._id,
      segmentName: segment.name,
      symbol: null,  // Applies to entire segment
      tradeMode: 'netting',
      maxLots: 30,
      commission: 75,
      isActive: true,
      tradingEnabled: true,
      updatedAt: Date.now()
    },
    { upsert: true, new: true }
  );
  
  console.log('  ✅ Created segment-level user override (maxLots: 30)');
  
  // Test with a different symbol (not NIFTY24MARFUT)
  const settingsOtherSymbol = await UserSegmentSettings.getEffectiveSettingsForUser(
    user._id, segment._id, 'BANKNIFTY24MARFUT', 'netting'
  );
  
  console.log(`  📊 Settings for BANKNIFTY24MARFUT:`);
  console.log(`     - maxLots: ${settingsOtherSymbol.maxLots} (segment-level user override: 30)`);
  
  // Note: NIFTY24MARFUT should still use symbol-specific override (maxLots: 5)
  const settingsNifty = await UserSegmentSettings.getEffectiveSettingsForUser(
    user._id, segment._id, 'NIFTY24MARFUT', 'netting'
  );
  
  console.log(`  📊 Settings for NIFTY24MARFUT:`);
  console.log(`     - maxLots: ${settingsNifty.maxLots} (symbol-specific user override: 5)`);
  
  logTest('Other symbol uses segment-level override', settingsOtherSymbol.maxLots === 30,
    `Expected: 30, Got: ${settingsOtherSymbol.maxLots}`);
  logTest('NIFTY still uses symbol-specific override', settingsNifty.maxLots === 5,
    `Expected: 5, Got: ${settingsNifty.maxLots}`);
};

// ============== CLEANUP ==============
const cleanup = async (user, segment) => {
  console.log('\n📋 CLEANUP');
  console.log('─'.repeat(50));
  
  await ScriptOverride.deleteMany({ symbol: 'NIFTY24MARFUT' });
  await UserSegmentSettings.deleteMany({ userId: user._id, segmentId: segment._id });
  
  console.log('  ✅ Cleaned up test data');
};

// ============== MAIN ==============
const runTests = async () => {
  console.log('\n' + '═'.repeat(60));
  console.log('  TRADE VALIDATION WITH SEGMENT SETTINGS TEST');
  console.log('═'.repeat(60));
  
  await connectDB();
  
  const engine = new NettingEngine();
  
  try {
    const testData = await setupTestData();
    if (!testData) {
      console.log('\n❌ Setup failed - cannot run tests');
      return;
    }
    
    const { user, segment } = testData;
    
    // Run tests
    await testSegmentDefaultLimits(engine, user, segment);
    await testScriptOverrideLimits(engine, user, segment);
    await testUserSpecificOverride(engine, user, segment);
    await testBlockSettings(engine, user, segment);
    await testDifferentUsers(engine, user, segment);
    await testSegmentLevelUserOverride(engine, user, segment);
    
    // Cleanup
    await cleanup(user, segment);
    
    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('  TEST RESULTS');
    console.log('═'.repeat(60));
    console.log(`  ✅ Passed: ${results.passed}`);
    console.log(`  ❌ Failed: ${results.failed}`);
    console.log(`  📊 Total:  ${results.passed + results.failed}`);
    console.log('═'.repeat(60) + '\n');
    
    if (results.failed > 0) {
      console.log('  Failed Tests:');
      results.tests.filter(t => !t.passed).forEach(t => {
        console.log(`    - ${t.name}: ${t.details}`);
      });
    }
    
  } catch (error) {
    console.error('\n❌ Test Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ MongoDB Disconnected');
  }
};

runTests();
