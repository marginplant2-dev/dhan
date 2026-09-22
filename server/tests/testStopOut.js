/**
 * Test Script for MT5-Style Stop Out Logic
 * 
 * This script tests if the stop out mechanism is working correctly.
 * Run with: node server/tests/testStopOut.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/bharatfundedtrade';

async function testStopOut() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Load models
    const User = require('../models/User');
    const RiskSettings = require('../models/RiskSettings');
    const { HedgingPosition, NettingPosition } = require('../models/Position');

    // 1. Check Global Risk Settings
    console.log('='.repeat(60));
    console.log('1. GLOBAL RISK SETTINGS');
    console.log('='.repeat(60));
    
    const globalSettings = await RiskSettings.getGlobalSettings();
    console.log('Margin Call Level:', globalSettings.marginCallLevel, '%');
    console.log('Stop Out Level:', globalSettings.stopOutLevel, '%');
    console.log('Ledger Balance Close:', globalSettings.ledgerBalanceClose, '%');
    console.log('');

    // 2. Find a test user with open positions
    console.log('='.repeat(60));
    console.log('2. FINDING USERS WITH OPEN POSITIONS');
    console.log('='.repeat(60));

    const usersWithHedging = await HedgingPosition.distinct('userId', { status: 'open' });
    const usersWithNetting = await NettingPosition.distinct('userId', { status: 'open' });
    const allUserIds = [...new Set([...usersWithHedging, ...usersWithNetting])];

    console.log(`Found ${allUserIds.length} users with open positions\n`);

    if (allUserIds.length === 0) {
      console.log('⚠️  No users with open positions found. Cannot test stop out.');
      console.log('   Create a test trade first to test the stop out logic.');
      await mongoose.disconnect();
      return;
    }

    // 3. Check margin levels for each user
    console.log('='.repeat(60));
    console.log('3. USER MARGIN LEVELS');
    console.log('='.repeat(60));

    for (const userId of allUserIds.slice(0, 5)) { // Check first 5 users
      const user = await User.findOne({ oderId: userId });
      if (!user || !user.wallet) continue;

      const { balance, equity, margin, freeMargin, marginLevel } = user.wallet;
      
      console.log(`\nUser: ${user.name} (${userId})`);
      console.log(`  Balance: $${balance?.toFixed(2) || 0}`);
      console.log(`  Equity: $${equity?.toFixed(2) || 0}`);
      console.log(`  Used Margin: $${margin?.toFixed(2) || 0}`);
      console.log(`  Free Margin: $${freeMargin?.toFixed(2) || 0}`);
      
      if (margin > 0) {
        const calculatedMarginLevel = (equity / margin) * 100;
        console.log(`  Margin Level: ${calculatedMarginLevel.toFixed(2)}%`);
        
        // Check against thresholds
        if (calculatedMarginLevel <= globalSettings.stopOutLevel) {
          console.log(`  ⚠️  STOP OUT TRIGGERED! (${calculatedMarginLevel.toFixed(2)}% <= ${globalSettings.stopOutLevel}%)`);
        } else if (calculatedMarginLevel <= globalSettings.marginCallLevel) {
          console.log(`  ⚠️  MARGIN CALL WARNING! (${calculatedMarginLevel.toFixed(2)}% <= ${globalSettings.marginCallLevel}%)`);
        } else {
          console.log(`  ✅ Safe (above ${globalSettings.marginCallLevel}% margin call level)`);
        }
      } else {
        console.log(`  Margin Level: N/A (no margin used)`);
      }
    }

    // 4. Simulate Stop Out Scenario
    console.log('\n' + '='.repeat(60));
    console.log('4. STOP OUT SIMULATION');
    console.log('='.repeat(60));
    
    console.log(`\nWith Stop Out Level at ${globalSettings.stopOutLevel}%:`);
    console.log(`\nExample scenarios:`);
    console.log(`  - User with $1000 balance, $200 margin used:`);
    console.log(`    - Equity must fall to $${(200 * globalSettings.stopOutLevel / 100).toFixed(2)} for stop out`);
    console.log(`    - That means loss of $${(1000 - (200 * globalSettings.stopOutLevel / 100)).toFixed(2)}`);
    
    console.log(`\n  - User with $1000 balance, $500 margin used:`);
    console.log(`    - Equity must fall to $${(500 * globalSettings.stopOutLevel / 100).toFixed(2)} for stop out`);
    console.log(`    - That means loss of $${(1000 - (500 * globalSettings.stopOutLevel / 100)).toFixed(2)}`);

    // 5. Test the checkStopOut function directly
    console.log('\n' + '='.repeat(60));
    console.log('5. TESTING checkStopOut FUNCTION');
    console.log('='.repeat(60));

    const riskService = require('../services/riskManagement.service');
    
    if (allUserIds.length > 0) {
      const testUserId = allUserIds[0];
      console.log(`\nTesting checkStopOut for user: ${testUserId}`);
      console.log('(This will check if stop out should trigger based on current margin level)');
      
      // Note: This won't actually close positions without io and priceResolver
      // It will just log what would happen
      try {
        await riskService.checkStopOut(testUserId, null, null);
        console.log('✅ checkStopOut function executed without errors');
      } catch (err) {
        console.log('❌ Error in checkStopOut:', err.message);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('TEST COMPLETE');
    console.log('='.repeat(60));
    console.log('\nTo test stop out in real conditions:');
    console.log('1. Set Stop Out Level to 85% in Admin > Risk Management');
    console.log('2. Create a user with a small balance (e.g., $100)');
    console.log('3. Open a position that uses significant margin');
    console.log('4. Wait for the position to go into loss');
    console.log('5. When Margin Level drops to 85%, positions should auto-close');

    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testStopOut();
