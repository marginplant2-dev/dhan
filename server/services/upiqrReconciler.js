/**
 * Settle UPIQR orders that the browser never came back to confirm.
 *
 * The gateway only marks an order paid once it matches an incoming UPI credit,
 * and that match can land well after the buyer has closed the tab — or only
 * when the merchant approves it by hand. Either way the money is in and the
 * challenge should activate without anyone watching, so this re-asks UPIQR
 * about every order we still have open.
 *
 * It is the same decision the webhook and the browser callback make, taken on
 * a timer: the answer always comes from UPIQR over TLS with our own key, never
 * from anything a client sent. approveChallengeBuy guards on status, so an
 * order settled by one path is a no-op for the others.
 */
const Transaction = require('../models/Transaction');
const upiqr = require('./upiqr.service');
const challengeApprovalService = require('./challengeApproval.service');

// How far back to keep asking. An order UPIQR has not matched within a day is
// not going to be matched by another poll, and manual approval well past that
// is rare enough to be worth an admin's attention instead of silent activation.
const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const EVERY_MS = 60 * 1000;

let timer = null;
let running = false;

async function settleOne(tx) {
  const clientTxnId = tx.paymentDetails?.upiqrClientTxnId;
  if (!clientTxnId) return;

  const status = await upiqr.checkOrderStatus(clientTxnId);

  if (upiqr.isPaid(status)) {
    const paid = Number(status.amount);
    const owed = Number(tx.amount);
    if (Number.isFinite(paid) && Number.isFinite(owed) && paid + 0.01 < owed) {
      console.warn(`[upiqr-reconciler] ${clientTxnId}: short payment ${paid} of ${owed}, left pending`);
      return;
    }
    if (status.upi_txn_id) {
      tx.paymentDetails.upiqrUtr = String(status.upi_txn_id);
      await tx.save();
    }
    await challengeApprovalService.approveChallengeBuy(tx._id, 'upiqr:reconciler');
    console.log(`[upiqr-reconciler] activated ${clientTxnId} (₹${paid})`);
    return;
  }

  if (upiqr.isFailed(status)) {
    await challengeApprovalService.rejectChallengeBuy(tx._id, null, `UPIQR reported ${status.status}`);
    console.log(`[upiqr-reconciler] closed ${clientTxnId} as ${status.status}`);
  }
  // still pending → leave it; the next pass asks again.
}

async function runOnce() {
  if (running || !upiqr.isConfigured()) return;
  running = true;
  try {
    const open = await Transaction.find({
      type: 'challenge_purchase',
      status: 'pending',
      paymentMethod: 'upiqr',
      createdAt: { $gte: new Date(Date.now() - LOOKBACK_MS) },
    }).limit(50);

    for (const tx of open) {
      try {
        await settleOne(tx);
      } catch (e) {
        // One bad order must not stop the rest of the sweep.
        console.warn(`[upiqr-reconciler] ${tx.paymentDetails?.upiqrClientTxnId}: ${e.message}`);
      }
    }
  } catch (e) {
    console.error('[upiqr-reconciler] sweep failed:', e.message);
  } finally {
    running = false;
  }
}

function start() {
  if (timer || !upiqr.isConfigured()) return;
  timer = setInterval(runOnce, EVERY_MS);
  if (timer.unref) timer.unref();
  console.log(`✅ UPIQR reconciler: every ${EVERY_MS / 1000}s`);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, runOnce };
