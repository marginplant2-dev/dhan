/**
 * Debug script to check why maxExchangeLots and maxQtyPerScript are not working
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function debug() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharatfundedtrade');
    console.log('Connected to MongoDB\n');

    // Load models
    require('../models/User');
    require('../models/Segment');
    require('../models/ScriptOverride');
    require('../models/NettingScriptOverride');
    const NettingSegment = require('../models/NettingSegment');
    const { NettingPosition } = require('../models/Position');
    const UserSegmentSettings = require('../models/UserSegmentSettings');
    try { require('../models/HedgingSegment'); } catch(e) {}
    try { require('../models/HedgingScriptOverride'); } catch(e) {}

    // 1. Check MCX_FUT segment settings
    console.log('='.repeat(60));
    console.log('1. MCX_FUT SEGMENT SETTINGS');
    console.log('='.repeat(60));
    const mcxFut = await NettingSegment.findOne({ name: 'MCX_FUT' }).lean();
    console.log('maxExchangeLots:', mcxFut?.maxExchangeLots);
    console.log('maxLots:', mcxFut?.maxLots);
    console.log('orderLots:', mcxFut?.orderLots);

    // 2. Check open positions
    console.log('\n' + '='.repeat(60));
    console.log('2. OPEN POSITIONS');
    console.log('='.repeat(60));
    const positions = await NettingPosition.find({ status: 'open' }).lean();
    console.log('Total open positions:', positions.length);
    
    let mcxPositions = [];
    positions.forEach(p => {
      const isMcx = p.exchange === 'MCX' || 
                    (p.symbol && (p.symbol.includes('GOLD') || p.symbol.includes('SILVER') || 
                     p.symbol.includes('CRUDE') || p.symbol.includes('ZINC')));
      if (isMcx) {
        mcxPositions.push(p);
        console.log(`  ${p.symbol}: exchange=${p.exchange}, segment=${p.segment}, volume=${p.volume}, userId=${p.userId}`);
      }
    });
    
    const totalMcxLots = mcxPositions.reduce((sum, p) => sum + (p.volume || 0), 0);
    console.log('\nTotal MCX lots:', totalMcxLots);
    console.log('Max Exchange Lots allowed:', mcxFut?.maxExchangeLots);
    console.log('Should block new orders:', totalMcxLots >= mcxFut?.maxExchangeLots ? 'YES' : 'NO');

    // 3. Check if positions have exchange field
    console.log('\n' + '='.repeat(60));
    console.log('3. POSITION EXCHANGE FIELD CHECK');
    console.log('='.repeat(60));
    const positionsWithoutExchange = positions.filter(p => !p.exchange);
    console.log('Positions WITHOUT exchange field:', positionsWithoutExchange.length);
    if (positionsWithoutExchange.length > 0) {
      console.log('  This could be causing the issue!');
      positionsWithoutExchange.slice(0, 5).forEach(p => {
        console.log(`    ${p.symbol}: exchange=${p.exchange}, segment=${p.segment}`);
      });
    }

    // 4. Check NSE_EQ settings
    console.log('\n' + '='.repeat(60));
    console.log('4. NSE_EQ SEGMENT SETTINGS');
    console.log('='.repeat(60));
    const nseEq = await NettingSegment.findOne({ name: 'NSE_EQ' }).lean();
    console.log('maxQtyPerScript:', nseEq?.maxQtyPerScript);
    console.log('perOrderQty:', nseEq?.perOrderQty);
    console.log('minQty:', nseEq?.minQty);

    // 5. Check effective settings
    console.log('\n' + '='.repeat(60));
    console.log('5. EFFECTIVE SETTINGS FOR DEMO USER');
    console.log('='.repeat(60));
    
    if (mcxFut) {
      const effMcx = await UserSegmentSettings.getEffectiveSettingsForUser('demo', mcxFut._id, 'GOLD26APRFUT', 'netting');
      console.log('MCX_FUT effective:');
      console.log('  maxExchangeLots:', effMcx.maxExchangeLots);
      console.log('  maxLots:', effMcx.maxLots);
      console.log('  orderLots:', effMcx.orderLots);
    }
    
    if (nseEq) {
      const effNse = await UserSegmentSettings.getEffectiveSettingsForUser('demo', nseEq._id, 'SBIN', 'netting');
      console.log('NSE_EQ effective:');
      console.log('  maxQtyPerScript:', effNse.maxQtyPerScript);
      console.log('  perOrderQty:', effNse.perOrderQty);
    }

    // 6. Test segment matching
    console.log('\n' + '='.repeat(60));
    console.log('6. SEGMENT MATCHING TEST');
    console.log('='.repeat(60));
    
    const NettingEngine = require('../engines/NettingEngine');
    const engine = new NettingEngine();
    
    // Test getSegmentNameForInstrument
    const testCases = [
      { exchange: 'MCX', segment: '', symbol: 'GOLD26APRFUT' },
      { exchange: 'MCX', segment: 'FUT', symbol: 'SILVER26MAYFUT' },
      { exchange: 'NSE', segment: '', symbol: 'SBIN' },
      { exchange: 'NSE', segment: 'EQ', symbol: 'RELIANCE' },
    ];
    
    for (const tc of testCases) {
      const segName = engine.getSegmentNameForInstrument(tc.exchange, tc.segment, '', tc.symbol);
      console.log(`  ${tc.symbol} (ex=${tc.exchange}, seg=${tc.segment}) -> ${segName}`);
    }
    
    // Test positionMatchesSegmentName
    console.log('\nPosition matching test:');
    for (const p of mcxPositions.slice(0, 3)) {
      const matches = engine.positionMatchesSegmentName(p, 'MCX_FUT');
      console.log(`  ${p.symbol} matches MCX_FUT: ${matches}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('DIAGNOSIS');
    console.log('='.repeat(60));
    
    if (positionsWithoutExchange.length > 0) {
      console.log('ISSUE FOUND: Some positions are missing the "exchange" field.');
      console.log('This causes positionMatchesSegmentName() to fail, so positions are not counted.');
      console.log('\nFIX: Update positions to have the correct exchange field.');
    } else if (totalMcxLots >= mcxFut?.maxExchangeLots) {
      console.log('Positions have exchange field, but enforcement still not working.');
      console.log('Check the server logs for [LOT-DEBUG] messages when placing an order.');
    } else {
      console.log('Total lots are under the limit. Try adding more positions to test.');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

debug();
