/**
 * Test Script for Segment Settings
 * Tests the hierarchy: User Settings > Script Override > Segment Default
 * 
 * Run with: node tests/testSegmentSettings.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Models
const Segment = require('../models/Segment');
const ScriptOverride = require('../models/ScriptOverride');
const UserSegmentSettings = require('../models/UserSegmentSettings');
const User = require('../models/User');

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
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

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

// ============== TEST 1: Segment Defaults ==============
const testSegmentDefaults = async () => {
  console.log('\n📋 TEST 1: Segment Defaults');
  console.log('─'.repeat(50));
  
  // Get all segments
  const segments = await Segment.find().sort({ marketType: 1, name: 1 });
  logTest(`Found ${segments.length} segments`, segments.length > 0);
  
  // Check NSE_FUT segment exists
  const nseFut = segments.find(s => s.name === 'NSE_FUT');
  logTest('NSE_FUT segment exists', !!nseFut, nseFut ? '' : 'Not found');
  
  if (nseFut) {
    // Check default values
    logTest('NSE_FUT has maxLots', nseFut.maxLots != null, `maxLots: ${nseFut.maxLots}`);
    logTest('NSE_FUT has minLots', nseFut.minLots != null, `minLots: ${nseFut.minLots}`);
    logTest('NSE_FUT has orderLots', nseFut.orderLots != null, `orderLots: ${nseFut.orderLots}`);
    logTest('NSE_FUT has commission', nseFut.commission != null, `commission: ${nseFut.commission}`);
    logTest('NSE_FUT has tradingEnabled', nseFut.tradingEnabled != null, `tradingEnabled: ${nseFut.tradingEnabled}`);
    
    console.log('\n  📊 NSE_FUT Settings:');
    console.log(`     - maxLots: ${nseFut.maxLots}`);
    console.log(`     - minLots: ${nseFut.minLots}`);
    console.log(`     - orderLots: ${nseFut.orderLots}`);
    console.log(`     - perOrderQty: ${nseFut.perOrderQty}`);
    console.log(`     - maxQtyHolding: ${nseFut.maxQtyHolding}`);
    console.log(`     - commission: ${nseFut.commission} (${nseFut.commissionType})`);
    console.log(`     - tradingEnabled: ${nseFut.tradingEnabled}`);
  }
  
  // Check crypto segments exist
  const cryptoPerp = segments.find(s => s.name === 'CRYPTO_PERPETUAL');
  logTest('CRYPTO_PERPETUAL segment exists', !!cryptoPerp);
  
  return nseFut;
};

// ============== TEST 2: Script Override ==============
const testScriptOverride = async (segment) => {
  console.log('\n📋 TEST 2: Script Override');
  console.log('─'.repeat(50));
  
  if (!segment) {
    console.log('  ⚠️ Skipping - no segment available');
    return null;
  }
  
  // Check existing script overrides
  const existingOverrides = await ScriptOverride.find({ segmentId: segment._id });
  console.log(`  Found ${existingOverrides.length} existing script overrides for ${segment.name}`);
  
  // Create a test script override
  const testSymbol = 'TEST_NIFTY_FUT';
  
  // Clean up any existing test override
  await ScriptOverride.deleteOne({ symbol: testSymbol, segmentId: segment._id });
  
  // Create new override with different values than segment defaults
  const scriptOverride = new ScriptOverride({
    symbol: testSymbol,
    tradingSymbol: testSymbol,
    segmentId: segment._id,
    segmentName: segment.name,
    lotSize: 50,
    maxLots: 25,  // Different from segment default
    minLots: 2,   // Different from segment default
    orderLots: 5, // Different from segment default
    commission: 100, // Different from segment default
    isActive: true
  });
  
  await scriptOverride.save();
  logTest('Created test script override', true);
  
  // Verify it was saved
  const savedOverride = await ScriptOverride.findOne({ symbol: testSymbol, segmentId: segment._id });
  logTest('Script override saved correctly', savedOverride?.maxLots === 25, `maxLots: ${savedOverride?.maxLots}`);
  
  console.log('\n  📊 Script Override Settings:');
  console.log(`     - symbol: ${savedOverride.symbol}`);
  console.log(`     - maxLots: ${savedOverride.maxLots} (segment: ${segment.maxLots})`);
  console.log(`     - minLots: ${savedOverride.minLots} (segment: ${segment.minLots})`);
  console.log(`     - orderLots: ${savedOverride.orderLots} (segment: ${segment.orderLots})`);
  console.log(`     - commission: ${savedOverride.commission} (segment: ${segment.commission})`);
  
  return savedOverride;
};

// ============== TEST 3: User-Specific Settings ==============
const testUserSettings = async (segment, scriptOverride) => {
  console.log('\n📋 TEST 3: User-Specific Settings');
  console.log('─'.repeat(50));
  
  if (!segment) {
    console.log('  ⚠️ Skipping - no segment available');
    return null;
  }
  
  // Get a test user
  const testUser = await User.findOne({ role: 'user' });
  if (!testUser) {
    console.log('  ⚠️ No test user found - creating mock test');
    return null;
  }
  
  logTest(`Found test user: ${testUser.oderId || testUser.email}`, true);
  
  // Clean up any existing test settings
  await UserSegmentSettings.deleteMany({ 
    userId: testUser._id, 
    segmentId: segment._id,
    symbol: scriptOverride?.symbol || null
  });
  
  // Create user-specific settings (highest priority) using findOneAndUpdate to avoid pre-save hook issues
  const userSetting = await UserSegmentSettings.findOneAndUpdate(
    { 
      userId: testUser._id, 
      segmentId: segment._id, 
      symbol: scriptOverride?.symbol || null,
      tradeMode: 'netting'
    },
    {
      userId: testUser._id,
      oderId: testUser.oderId || testUser._id.toString(),
      segmentId: segment._id,
      segmentName: segment.name,
      symbol: scriptOverride?.symbol || null,
      tradeMode: 'netting',
      maxLots: 10,  // User-specific limit (highest priority)
      minLots: 1,
      orderLots: 3,
      commission: 50,
      isActive: true,
      updatedAt: Date.now()
    },
    { upsert: true, new: true }
  );
  logTest('Created user-specific settings', true);
  
  console.log('\n  📊 User Settings:');
  console.log(`     - userId: ${testUser._id}`);
  console.log(`     - maxLots: ${userSetting.maxLots} (script: ${scriptOverride?.maxLots}, segment: ${segment.maxLots})`);
  console.log(`     - minLots: ${userSetting.minLots}`);
  console.log(`     - orderLots: ${userSetting.orderLots}`);
  console.log(`     - commission: ${userSetting.commission}`);
  
  return { user: testUser, userSetting };
};

// ============== TEST 4: Effective Settings Hierarchy ==============
const testEffectiveSettings = async (segment, scriptOverride, userData) => {
  console.log('\n📋 TEST 4: Effective Settings Hierarchy');
  console.log('─'.repeat(50));
  
  if (!segment || !userData?.user) {
    console.log('  ⚠️ Skipping - missing test data');
    return;
  }
  
  const { user } = userData;
  const symbol = scriptOverride?.symbol || 'TEST_NIFTY_FUT';
  
  // Test 4a: Get effective settings WITH user override
  console.log('\n  🔍 Test 4a: With User Override');
  const effectiveWithUser = await UserSegmentSettings.getEffectiveSettingsForUser(
    user._id,
    segment._id,
    symbol,
    'netting'
  );
  
  console.log(`     - maxLots: ${effectiveWithUser.maxLots} (expected: 10 from user)`);
  console.log(`     - hasUserOverride: ${effectiveWithUser.hasUserOverride}`);
  console.log(`     - hasScriptOverride: ${effectiveWithUser.hasScriptOverride}`);
  
  logTest('User override takes priority', effectiveWithUser.maxLots === 10, `Got: ${effectiveWithUser.maxLots}`);
  logTest('hasUserOverride is true', effectiveWithUser.hasUserOverride === true);
  
  // Test 4b: Delete user override and test script override
  console.log('\n  🔍 Test 4b: Without User Override (Script Override)');
  await UserSegmentSettings.deleteMany({ userId: user._id, segmentId: segment._id });
  
  const effectiveWithScript = await UserSegmentSettings.getEffectiveSettingsForUser(
    user._id,
    segment._id,
    symbol,
    'netting'
  );
  
  console.log(`     - maxLots: ${effectiveWithScript.maxLots} (expected: 25 from script)`);
  console.log(`     - hasUserOverride: ${effectiveWithScript.hasUserOverride}`);
  console.log(`     - hasScriptOverride: ${effectiveWithScript.hasScriptOverride}`);
  
  logTest('Script override takes priority when no user override', effectiveWithScript.maxLots === 25, `Got: ${effectiveWithScript.maxLots}`);
  logTest('hasUserOverride is false', effectiveWithScript.hasUserOverride === false);
  logTest('hasScriptOverride is true', effectiveWithScript.hasScriptOverride === true);
  
  // Test 4c: Delete script override and test segment default
  console.log('\n  🔍 Test 4c: Without Script Override (Segment Default)');
  await ScriptOverride.deleteOne({ symbol, segmentId: segment._id });
  
  const effectiveDefault = await UserSegmentSettings.getEffectiveSettingsForUser(
    user._id,
    segment._id,
    symbol,
    'netting'
  );
  
  console.log(`     - maxLots: ${effectiveDefault.maxLots} (expected: ${segment.maxLots} from segment)`);
  console.log(`     - hasUserOverride: ${effectiveDefault.hasUserOverride}`);
  console.log(`     - hasScriptOverride: ${effectiveDefault.hasScriptOverride}`);
  
  logTest('Segment default used when no overrides', effectiveDefault.maxLots === segment.maxLots, `Got: ${effectiveDefault.maxLots}, Expected: ${segment.maxLots}`);
  logTest('hasScriptOverride is false', effectiveDefault.hasScriptOverride === false);
};

// ============== TEST 5: All Setting Types ==============
const testAllSettingTypes = async (segment) => {
  console.log('\n📋 TEST 5: All Setting Types Exist');
  console.log('─'.repeat(50));
  
  if (!segment) {
    console.log('  ⚠️ Skipping - no segment available');
    return;
  }
  
  const settingTypes = [
    // Lot Settings
    { key: 'maxLots', label: 'Max Lots' },
    { key: 'minLots', label: 'Min Lots' },
    { key: 'orderLots', label: 'Order Lots' },
    { key: 'maxExchangeLots', label: 'Max Exchange Lots' },
    // Qty Settings
    { key: 'maxQtyHolding', label: 'Max Qty Holding' },
    { key: 'perOrderQty', label: 'Per Order Qty' },
    // Value Settings
    { key: 'limitType', label: 'Limit Type' },
    { key: 'maxValue', label: 'Max Value' },
    // Fixed Margin Settings
    { key: 'intradayHolding', label: 'Intraday Holding' },
    { key: 'overnightHolding', label: 'Overnight Holding' },
    // Options Settings
    { key: 'buyingStrikeFarPercent', label: 'Buying Strike Far Percent' },
    { key: 'sellingStrikeFarPercent', label: 'Selling Strike Far Percent' },
    { key: 'buyingStrikeFar', label: 'Buying Strike Far' },
    { key: 'sellingStrikeFar', label: 'Selling Strike Far' },
    // Brokerage Settings
    { key: 'commissionType', label: 'Commission Type' },
    { key: 'commission', label: 'Commission' },
    { key: 'exposureIntraday', label: 'Exposure Intraday' },
    { key: 'exposureCarryForward', label: 'Exposure Carry Forward' },
    // Limit away (netting)
    { key: 'limitAwayPercent', label: 'Limit Away Percent' },
    { key: 'limitAwayPoints', label: 'Limit Away Points' },
    // Spread Settings
    { key: 'spreadType', label: 'Spread Type' },
    { key: 'spreadPips', label: 'Spread Pips' },
    // Swap Settings
    { key: 'swapType', label: 'Swap Type' },
    { key: 'swapLong', label: 'Swap Long' },
    { key: 'swapShort', label: 'Swap Short' },
    // Block Settings
    { key: 'tradingEnabled', label: 'Trading Enabled' },
    { key: 'blockOptions', label: 'Block Options' },
    { key: 'isActive', label: 'Is Active' },
  ];
  
  let allExist = true;
  for (const setting of settingTypes) {
    const exists = segment[setting.key] !== undefined;
    if (!exists) {
      console.log(`  ❌ Missing: ${setting.label} (${setting.key})`);
      allExist = false;
    }
  }
  
  logTest('All setting types exist in segment schema', allExist);
  
  if (allExist) {
    console.log('  ✅ All 27 setting types are present in the segment schema');
  }
};

// ============== TEST 6: Database Summary ==============
const testDatabaseSummary = async () => {
  console.log('\n📋 TEST 6: Database Summary');
  console.log('─'.repeat(50));
  
  const segmentCount = await Segment.countDocuments();
  const scriptOverrideCount = await ScriptOverride.countDocuments();
  const userSettingsCount = await UserSegmentSettings.countDocuments();
  const userCount = await User.countDocuments({ role: 'user' });
  
  console.log(`  📊 Database Stats:`);
  console.log(`     - Segments: ${segmentCount}`);
  console.log(`     - Script Overrides: ${scriptOverrideCount}`);
  console.log(`     - User Segment Settings: ${userSettingsCount}`);
  console.log(`     - Users: ${userCount}`);
  
  logTest('Segments exist in DB', segmentCount > 0);
  
  // List all segments
  const segments = await Segment.find().select('name displayName marketType').sort({ marketType: 1, name: 1 });
  console.log('\n  📋 All Segments:');
  segments.forEach(s => {
    console.log(`     - ${s.name} (${s.displayName}) [${s.marketType}]`);
  });
};

// ============== MAIN ==============
const runTests = async () => {
  console.log('\n' + '═'.repeat(60));
  console.log('  NETTING SEGMENT SETTINGS TEST SUITE');
  console.log('═'.repeat(60));
  
  await connectDB();
  
  try {
    // Run tests
    const segment = await testSegmentDefaults();
    const scriptOverride = await testScriptOverride(segment);
    const userData = await testUserSettings(segment, scriptOverride);
    await testEffectiveSettings(segment, scriptOverride, userData);
    await testAllSettingTypes(segment);
    await testDatabaseSummary();
    
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
