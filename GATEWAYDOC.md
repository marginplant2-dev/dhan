# upiPe / UPIQR payment gateway — port guide

How the UPI payment gateway is wired into DhanFunded, written so you can drop
it into another white-label build. It covers the copy-paste prompt, the whole
design, the dashboard settings, and the traps that cost real money and hours to
find here — read **Pitfalls** before you write any code, because four of the
five were only visible at runtime.

- **Gateway:** upiPe (`https://upipe.co.in` dashboard, `https://upiqr.xyz` API)
- **Scope:** one-time purchases only (challenge / plan / order). **Never wire it
  to withdrawals or payouts** — money going *out* needs a human.
- **Version this was taken from:** DhanFunded, Oct 2026.

---

## Part 1 — The prompt

Paste this into the other project, replacing the three bracketed values.

> Add the upiPe (UPIQR) UPI payment gateway to this project for **one-time
> purchases only**. Do not touch withdrawals, payouts or refunds.
>
> **Credentials** (put in server `.env`, never in the repo or any client bundle):
> ```
> UPIQR_API_KEY=[YOUR_API_KEY]
> UPIQR_WEBHOOK_SECRET=[YOUR_WEBHOOK_SECRET]
> ```
> Public site origin is `[https://yourdomain.com]`.
>
> **The API** (all POST, JSON, key goes in the body — there is no auth header):
> - `POST https://upiqr.xyz/api/create_order`
>   body: `{ key, amount, client_txn_id, customer_name, customer_mobile, redirect_url, p_info }`
>   → `{ status: true, data: { order_id, payment_url, upi_intent: { bhim_link, phonepe_link, paytm_link, gpay_link } } }`
>   `amount` is in **rupees**, not paise. `client_txn_id` must be unique — a repeat returns 400.
> - `POST https://upiqr.xyz/api/check_order_status`
>   body: `{ key, client_txn_id }`
>   → `{ status: true, data: { amount, status, upi_txn_id, expires_at, ... } }`
>   `status` is one of `pending` / `success` / `failure`. `upi_txn_id` is the UTR
>   and is empty until the gateway has actually matched the money.
> - Webhook → your URL, header `X-Webhook-Signature: sha256=<hmac_hex>`, HMAC-SHA256
>   of the **raw** body with the webhook secret. Retries 3 times, 10s apart.
>
> **Build it like this:**
>
> 1. A service wrapping `create_order` and `check_order_status`, plus
>    `isPaid()` / `isFailed()` helpers and `verifyWebhookSignature(rawBody, sig)`.
> 2. `POST /api/<area>/upiqr/create-order` — authenticated. The **server**
>    computes the price; never accept an amount from the client. Create the
>    pending order record first, then the gateway order with
>    `client_txn_id = "<PREFIX>_<your order id>"`, save that id on the record,
>    return `payment_url`. If the price is 0 after a discount, skip the gateway
>    and fulfil immediately.
> 3. `POST /api/<area>/upiqr/verify` — authenticated. Takes only a
>    `client_txn_id`. Re-reads the order from **your** DB, checks it belongs to
>    the caller, then calls `check_order_status` and fulfils only on a paid
>    status. Refuse if the paid amount is less than what is owed.
> 4. `POST /api/<area>/upiqr/webhook` — **registered before the JSON body
>    parser** so the raw bytes survive for the signature check. If a signature
>    is present it must verify, else 400. Then read `client_txn_id` out of the
>    payload and **call `check_order_status` yourself** — never fulfil based on
>    what the webhook body claims.
> 5. A reconciler on a 60-second timer that re-checks every still-pending order
>    from the last 24h: paid → fulfil, failed → cancel, pending → leave. This is
>    not optional; see the pitfalls.
> 6. An admin toggle `paymentGatewayEnabled` (default true) exposed on the public
>    settings endpoint. The checkout reads it, **and** `create-order` enforces it
>    — hiding a button does not close an endpoint.
> 7. Keep unpaid gateway orders out of the admin approval queue and out of the
>    buyer's own order list until payment lands.
>
> All three of verify / webhook / reconciler must be idempotent — guard on the
> record's status so whichever arrives first wins and the others are no-ops.

---

## Part 2 — What to configure in the upiPe dashboard

**Developer → Webhook configuration.** Replace the domain; keep the paths.

| Field | Value |
|---|---|
| Webhook URL | `https://api.yourdomain.com/api/<area>/upiqr/webhook` |
| Callback URL | `https://api.yourdomain.com/api/<area>/upiqr/webhook` |
| Success redirect URL | `https://yourdomain.com/<page-after-payment>` |
| Failed redirect URL | `https://yourdomain.com/<page-to-retry-on>` |

If the API and the site are the same origin, use that origin for all four.

**Connect Merchant.** This is what reads incoming UPI credits and matches them
to orders. **If it is not connected, no payment is ever detected** — orders go
`pending` → `failure` with an empty UTR even though the payer was debited. This
was the single biggest source of confusion here; check it first when payments
"fail" but money moves.

**Manual Approvals.** Anything auto-matching misses lands here for the merchant
to approve by hand. With the reconciler running, approving there fulfils the
order on your side within a minute, with no further action.

---

## Part 3 — The files

What exists in this repo, as a map for the port.

| File | Role |
|---|---|
| `server/services/upiqr.service.js` | API wrapper, `isPaid`/`isFailed`, signature check |
| `server/services/upiqrReconciler.js` | 60s sweep that settles abandoned orders |
| `server/routes/propTrading.js` | `/upiqr/create-order`, `/upiqr/verify` |
| `server/index.js` | `/api/prop/upiqr/webhook` (before `express.json()`), reconciler start |
| `server/models/Transaction.js` | `upiqrClientTxnId` (indexed), `upiqrOrderId`, `upiqrUtr`; `'upiqr'` in the paymentMethod enum |
| `server/models/AppSettings.js` | `paymentGatewayEnabled` |
| `server/services/propTradingEngine.js` | `GATEWAY_METHODS` set — see pitfall 1 |
| `server/services/challengeApproval.service.js` | hides unpaid gateway orders from the admin queue |
| `server/scripts/upiqrSignature.selfcheck.js` | runnable check for the signature boundary |
| `client/.../PropChallengePage.jsx` | the Pay Online button, reads the admin toggle |
| `client/.../MyChallengesPage.jsx` | confirms on return from `?upiqr=<id>` |

### Database fields

```js
// on the order/transaction document
paymentMethod: 'upiqr',               // add to whatever enum you have
paymentDetails: {
  upiqrClientTxnId: { type: String, index: true },  // the only handle status accepts
  upiqrOrderId:     { type: String },               // gateway's own id, for support
  upiqrUtr:         { type: String },               // bank reference once paid
}
```

`upiqrClientTxnId` **must be indexed** — the webhook and the reconciler look
orders up by it on every call.

### The flow

```
Buy  → create-order ─ server prices it ─→ pending record
                                        └→ upiPe order  → payment_url
                                                            │
                               buyer pays on the hosted page
                                                            │
     ┌──────────────────────────────────────────────────────┤
     │                        │                             │
  browser returns        webhook fires              reconciler, 60s
  ?upiqr=<id>            (signed)                   (catches the rest)
     │                        │                             │
     └──────────► all three call check_order_status ◄───────┘
                              │
                     paid? → fulfil (idempotent)
                   failed? → cancel, free a retry
                  pending? → leave it for the next pass
```

---

## Part 4 — Pitfalls

Each of these was a live bug here. They are the reason this document exists.

**1. A gateway method must be in every "is this a gateway" check.**
The purchase engine decided manual-vs-gateway with
`method === 'razorpay' || method === 'cashfree'`. Adding `upiqr` without
touching that chain meant every purchase fell into the *manual* branch and read
payment-proof fields a gateway never sends — **every Pay Online click died**
with `Cannot read properties of undefined`. Use a set, in one place:

```js
const GATEWAY_METHODS = new Set(['razorpay', 'cashfree', 'upiqr']);
const isGateway = GATEWAY_METHODS.has(paymentMethod);
```

**2. Starting a checkout must not create an approval request.**
The pending record is created *before* the buyer reaches the payment page. If
your admin queue lists pending orders, abandoned checkouts pile up there asking
someone to approve money nobody sent — and show in the buyer's own list as
"awaiting approval". Exclude `{ paymentMethod: <gateway>, status: 'pending' }`
from both. Paid ones stay visible as history.

**3. The browser will not always come back — build the reconciler.**
upiPe matches a credit on its own schedule, and on some accounts only when the
merchant approves by hand, long after the tab is closed. Without the 60s sweep
those orders stay pending forever. This is the piece most likely to be skipped
and most likely to be needed.

**4. An order expires 180 seconds after it is created.**
Measured from the `expires_at` the API returns. Scan, open GPay, enter a PIN,
wait for matching — three minutes goes fast. Say so on the checkout *before*
the buyer leaves, and when an order fails, close it so a clean retry is
possible instead of leaving it pending forever.

**5. Never fulfil on a webhook body.**
A webhook is a *hint that something changed*, not the answer. Read the id, then
ask the gateway yourself over TLS with your own key. Then a forged call costs an
attacker one wasted status check instead of a free product. Verify the
signature too, and **fail closed** when no secret is configured:

```js
function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.UPIQR_WEBHOOK_SECRET;
  if (!secret || !signature || !rawBody) return false;   // closed, not open
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const given = String(signature).replace(/^sha256=/i, '').trim();
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

Register the route **before** your JSON body parser, or the raw bytes are gone
and every signature fails:

```js
app.post('/api/<area>/upiqr/webhook', express.raw({ type: '*/*' }), handler);
// ...
app.use(express.json());
```

---

## Part 5 — Test checklist

Run these against the real gateway before announcing it. Creating an order
moves no money, so most are free.

1. `check_order_status` with a nonsense id → `404 Transaction not found`.
   A `403` means the key is wrong or inactive.
2. `create-order` without a session → `401`.
3. Create an order at ₹1 — it is accepted; there is **no minimum** on creation.
4. Create an order, do not pay → admin queue count unchanged, buyer's list
   unchanged. Wait 3 minutes, run the reconciler → the order is closed, not
   stuck pending.
5. `POST` the webhook with `X-Webhook-Signature: sha256=deadbeef` → `400`.
6. Turn the admin toggle off → public settings report `false` and `create-order`
   answers `503`. Turn it back on.
7. Pay one real order end to end, **inside 3 minutes** → fulfilled
   automatically, UTR stored.

---

## Part 6 — Troubleshooting

| Symptom | Where to look |
|---|---|
| Status `failure`, `upi_txn_id` empty, money debited | **Connect Merchant** in upiPe, then Manual Approvals. The gateway never matched the credit; nothing in your code can fix this. |
| Orders sit `pending` forever | Reconciler not running, or the webhook URL is blank in the dashboard. |
| Pay button does nothing, 400 on create-order | Pitfall 1 — the method is missing from a gateway check. |
| Every webhook rejected | Route registered after the body parser, or the secret does not match the dashboard. |
| Unpaid orders in the admin queue | Pitfall 2 — filter them out. |
| Payment succeeds but nothing is fulfilled | Your fulfil call is not idempotent, or verify/webhook/reconciler are not all reaching it. |
| `403 Insufficient wallet balance for platform fee` | upiPe charges a per-order platform fee from the merchant wallet. Top it up. |

---

## Part 7 — Hand this over with

- `UPIQR_API_KEY` and `UPIQR_WEBHOOK_SECRET` for the new project (**generate a
  fresh pair per project** — never reuse this one).
- The site origin and the API origin.
- The four dashboard URLs from Part 2.
- Confirmation that **Connect Merchant** is active on that upiPe account —
  without it, nothing else in this document matters.
