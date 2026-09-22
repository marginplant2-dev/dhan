/**
 * Test QTY Settings enforcement for NSE_EQ
 * Tests: minQty, perOrderQty, maxQtyPerScript, maxQtyPerSegment
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function runTests() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharatfundedtrade');
    console.log('Connected to MongoDB');

    // Load all required models
    require('../models/User');
    require('../models/Segment');
    require('../models/ScriptOverride');
    require('../models/NettingScriptOverride');
    const NettingSegment = require('../models/NettingSegment');
    const UserSegmentSettings = require('../models/UserSegmentSettings');
    try { require('../models/HedgingSegment'); } catch(e) {}
    try { require('../models/HedgingScriptOverride'); } catch(e) {}

    // 1. Find NSE_EQ segment
    const nseEq = await NettingSegment.findOne({ name: 'NSE_EQ' });
    if (!nseEq) {
      console.error('❌ NSE_EQ segment not found! Run seedDefaultSegments first.');
      process.exit(1);
    }

    console.log('\n=== NSE_EQ Segment QTY Fields ===');
    console.log('  minQty:', nseEq.minQty);
    console.log('  perOrderQty:', nseEq.perOrderQty);
    console.log('  maxQtyPerScript:', nseEq.maxQtyPerScript);
    console.log('  maxQtyPerSegment:', nseEq.maxQtyPerSegment);
    console.log('  maxQtyHolding:', nseEq.maxQtyHolding);

    // 2. Test getEffectiveSettingsForUser
    // Use a dummy userId (won't have user overrides)
    const testUserId = 'TEST_QTY_USER_999';
    
    console.log('\n=== Effective Settings for test user (no overrides) ===');
    const effective = await UserSegmentSettings.getEffectiveSettingsForUser(
      testUserId,
      nseEq._id,
      'SBIN',
      'netting'
    );

    console.log('  segment:', effective.segment);
    console.log('  minQty:', effective.minQty);
    console.log('  perOrderQty:', effective.perOrderQty);
    console.log('  maxQtyPerScript:', effective.maxQtyPerScript);
    console.log('  maxQtyPerSegment:', effective.maxQtyPerSegment);
    console.log('  maxQtyHolding:', effective.maxQtyHolding);

    // 3. Verify enforcement logic
    let passed = 0;
    let failed = 0;

    // Test: maxQtyPerScript
    if (effective.maxQtyPerScript != null && effective.maxQtyPerScript > 0) {
      console.log(`\n✅ maxQtyPerScript IS set: ${effective.maxQtyPerScript}`);
      console.log('   Engine WILL enforce this limit');
      passed++;
    } else {
      console.log(`\n❌ maxQtyPerScript is null/0: ${effective.maxQtyPerScript}`);
      console.log('   Engine will SKIP this check (null/0 means disabled)');
      console.log('   FIX: Verify admin UI saved the value to NettingSegment');
      failed++;
    }

    // Test: perOrderQty
    if (effective.perOrderQty != null && effective.perOrderQty > 0) {
      console.log(`✅ perOrderQty IS set: ${effective.perOrderQty}`);
      passed++;
    } else {
      console.log(`⚠️  perOrderQty is null/0: ${effective.perOrderQty}`);
      failed++;
    }

    // Test: minQty
    if (effective.minQty != null && effective.minQty > 0) {
      console.log(`✅ minQty IS set: ${effective.minQty}`);
      passed++;
    } else {
      console.log(`⚠️  minQty is null/0: ${effective.minQty}`);
      failed++;
    }

    // Test: maxQtyPerSegment
    if (effective.maxQtyPerSegment != null && effective.maxQtyPerSegment > 0) {
      console.log(`✅ maxQtyPerSegment IS set: ${effective.maxQtyPerSegment}`);
      passed++;
    } else {
      console.log(`⚠️  maxQtyPerSegment is null/0: ${effective.maxQtyPerSegment}`);
      failed++;
    }

    console.log(`\n=== Results: ${passed} passed, ${failed} issues ===`);

    // 4. Direct DB check - raw document
    console.log('\n=== Raw NettingSegment document (QTY fields only) ===');
    const raw = await NettingSegment.findOne({ name: 'NSE_EQ' }).lean();
    console.log('  minQty:', raw.minQty, `(type: ${typeof raw.minQty})`);
    console.log('  perOrderQty:', raw.perOrderQty, `(type: ${typeof raw.perOrderQty})`);
    console.log('  maxQtyPerScript:', raw.maxQtyPerScript, `(type: ${typeof raw.maxQtyPerScript})`);
    console.log('  maxQtyPerSegment:', raw.maxQtyPerSegment, `(type: ${typeof raw.maxQtyPerSegment})`);

    // 5. Simulate engine enforcement logic
    console.log('\n=== SIMULATING ENGINE QTY ENFORCEMENT ===');
    console.log('Settings: minQty=1, perOrderQty=2, maxQtyPerScript=5, maxQtyPerSegment=10');
    
    const simulateTrade = (testName, quantity, existingQty = 0, existingSide = 'buy', orderSide = 'buy') => {
      const segSettings = effective;
      const isReduceOnly = existingQty > 0 && existingSide !== orderSide && quantity <= existingQty;
      
      // MIN QTY check
      if (!isReduceOnly && segSettings.minQty != null && segSettings.minQty > 0) {
        if (quantity < segSettings.minQty) {
          console.log(`  ❌ ${testName}: REJECTED - Min qty is ${segSettings.minQty}, tried ${quantity}`);
          return false;
        }
      }
      
      // PER ORDER QTY check
      if (!isReduceOnly && segSettings.perOrderQty != null && segSettings.perOrderQty > 0) {
        if (quantity > segSettings.perOrderQty) {
          console.log(`  ❌ ${testName}: REJECTED - Per order qty limit is ${segSettings.perOrderQty}, tried ${quantity}`);
          return false;
        }
      }
      
      // MAX QTY PER SCRIPT check (projected total)
      if (segSettings.maxQtyPerScript != null && segSettings.maxQtyPerScript > 0) {
        let projectedQty;
        if (orderSide === existingSide || existingQty === 0) {
          projectedQty = existingQty + quantity; // Adding to position
        } else {
          projectedQty = Math.abs(existingQty - quantity); // Reducing/reversing
        }
        if (projectedQty > segSettings.maxQtyPerScript) {
          console.log(`  ❌ ${testName}: REJECTED - Max qty/script is ${segSettings.maxQtyPerScript}, projected: ${projectedQty} (existing: ${existingQty} + order: ${quantity})`);
          return false;
        }
      }
      
      // MAX QTY PER SEGMENT check
      if (segSettings.maxQtyPerSegment != null && segSettings.maxQtyPerSegment > 0) {
        let projectedSegQty;
        if (orderSide === existingSide || existingQty === 0) {
          projectedSegQty = existingQty + quantity;
        } else {
          projectedSegQty = Math.abs(existingQty - quantity);
        }
        if (projectedSegQty > segSettings.maxQtyPerSegment) {
          console.log(`  ❌ ${testName}: REJECTED - Max segment qty is ${segSettings.maxQtyPerSegment}, projected: ${projectedSegQty}`);
          return false;
        }
      }
      
      console.log(`  ✅ ${testName}: ACCEPTED (qty: ${quantity}, existing: ${existingQty})`);
      return true;
    };
    
    console.log('\n--- Fresh user, no existing positions ---');
    simulateTrade('Buy 1 SBIN (below min)', 0.5);    // Should reject (< minQty 1)
    simulateTrade('Buy 1 SBIN', 1);                    // Should accept
    simulateTrade('Buy 2 SBIN', 2);                    // Should accept (= perOrderQty)
    simulateTrade('Buy 3 SBIN (over perOrder)', 3);    // Should reject (> perOrderQty 2)
    simulateTrade('Buy 5 SBIN', 5);                    // Should reject (> perOrderQty 2)
    simulateTrade('Buy 10 SBIN', 10);                  // Should reject (> perOrderQty 2)
    
    console.log('\n--- User has 3 SBIN open, buying more ---');
    simulateTrade('Buy 2 more SBIN (total 5)', 2, 3);  // Should accept (3+2=5 = maxQtyPerScript)
    simulateTrade('Buy 3 more SBIN (total 6)', 3, 3);  // Should reject by perOrderQty (3 > 2)
    
    console.log('\n--- User has 5 SBIN open, buying more ---');
    simulateTrade('Buy 1 more SBIN (total 6)', 1, 5);  // Should reject (5+1=6 > maxQtyPerScript 5)
    
    console.log('\n--- User has 5 SBIN open, SELLING (reduce) ---');
    simulateTrade('Sell 3 SBIN (reduce)', 3, 5, 'buy', 'sell');  // Should accept (reduce)
    simulateTrade('Sell 5 SBIN (close)', 5, 5, 'buy', 'sell');   // Should accept (close)

  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

runTests();
