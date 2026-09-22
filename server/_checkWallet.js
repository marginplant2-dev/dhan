require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat_funded').then(async () => {
  const Wallet = require('./models/Wallet');
  const ChallengeAccount = require('./models/ChallengeAccount');
  
  // Show all wallets
  const wallets = await Wallet.find({}).lean();
  console.log('=== WALLETS ===');
  wallets.forEach(w => {
    console.log(`  userId: ${w.userId}, type: ${w.type}, balance: ${w.balance}, oderId: ${w.oderId}`);
  });
  
  // Show challenge accounts
  const accounts = await ChallengeAccount.find({}).lean();
  console.log('\n=== CHALLENGE ACCOUNTS ===');
  accounts.forEach(a => {
    console.log(`  userId: ${a.userId}, accountId: ${a.accountId}, status: ${a.status}, balance: ${a.currentBalance}`);
  });
  
  process.exit(0);
}).catch(err => { console.error(err); process.exit(1); });
