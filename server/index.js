require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const jwt = require('jsonwebtoken');
const { connectDB } = require('./config/database');
const TradeModeSettings = require('./models/Settings');
const AppSettings = require('./models/AppSettings');
const Trade = require('./models/Trade');
const User = require('./models/User');
const Banner = require('./models/Banner');
const Transaction = require('./models/Transaction');
const PaymentMethod = require('./models/PaymentMethod');
const { SpreadSetting, CommissionSetting, SwapSetting, MarginSetting, LeverageSetting, FeeSetting } = require('./models/ChargeSettings');
const { HedgingPosition, NettingPosition, BinaryTrade } = require('./models/Position');
const KYC = require('./models/KYC');
const UserActivityLog = require('./models/UserActivityLog');
const AdminActivityLog = require('./models/AdminActivityLog');
const Admin = require('./models/Admin');
const Segment = require('./models/Segment');
const ScriptOverride = require('./models/ScriptOverride');
const UserSegmentSettings = require('./models/UserSegmentSettings');
const HedgingSegment = require('./models/HedgingSegment');
const HedgingScriptOverride = require('./models/HedgingScriptOverride');
const AdminPaymentDetail = require('./models/AdminPaymentDetail');
const ZerodhaSettings = require('./models/ZerodhaSettings');
const zerodhaService = require('./services/zerodha.service');
const {
  filterZerodhaInstrumentsByExpirySettings,
  mapAdminSegmentToExpirySettingsKey,
  inferExpiryKeyFromExchangeAndType
} = require('./services/indianFnOExpiryFilter');
const MarketControl = require('./models/MarketControl');
const UserInstruments = require('./models/UserInstruments');
const ReorderSettings = require('./models/ReorderSettings');
const Notification = require('./models/Notification');
const RiskSettings = require('./models/RiskSettings');
const UserRiskSettings = require('./models/UserRiskSettings');
const ExpirySettings = require('./models/ExpirySettings');
const mongoose = require('mongoose');
const { saveAdminTradeEditLog } = require('./utils/tradeEditLog');

const { router: authRouter } = require('./routes/auth');
const adminEmailTemplatesRouter = require('./routes/adminEmailTemplates');
const metaApiProxyRouter = require('./routes/metaApiProxy');
const propTradingRouter = require('./routes/propTrading');
const aiOptionsRouter = require('./routes/aiOptions');

// Redis for scaling (optional - falls back to memory if not available)
let redisClient = null;
let RedisStore = null;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const NODE_ENV = process.env.NODE_ENV || 'development';

const app = express();
const server = http.createServer(app);

// Socket.IO optimized for 3000+ concurrent users
const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      callback(null, true); // Allow all origins for Socket.IO (auth is token-based, not origin-based)
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  },
  // Performance optimizations for high concurrency
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  perMessageDeflate: {
    threshold: 1024 // Only compress messages > 1KB
  },
  maxHttpBufferSize: 1e6 // 1MB max message size
});

// ============== SECURITY MIDDLEWARE ==============

// Set security HTTP headers (configured for Cloudflare proxy)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
  // Disable HSTS as Cloudflare handles SSL
  strictTransportSecurity: false,
  // Disable upgrade-insecure-requests as Cloudflare handles this
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://checkout.razorpay.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https:", "wss:"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      // Razorpay Checkout opens its payment UI in an iframe from these origins.
      frameSrc: ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com"],
      upgradeInsecureRequests: null // Disable upgrade-insecure-requests
    }
  }
}));

// Trust Cloudflare proxy
app.set('trust proxy', true);

// Rate limiting - General API (very high limit for trading app with many users)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100000, // 100k requests per 15 min (supports 3000+ concurrent users)
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting - Auth endpoints (relaxed for shared mobile IPs / carrier-grade NAT)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 auth attempts per 15 min per IP (mobile carriers share IPs across many users)
  message: { error: 'Too many authentication attempts, please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting - Admin login
const adminAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 admin login attempts per 15 min
  message: { error: 'Too many admin login attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// CORS — allow the configured origin + localhost for dev. In production, also allow any
// HTTPS origin so mobile apps and different domains don't get CORS-blocked.
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    const allowed = [
      CORS_ORIGIN,
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5174'
    ];
    if (allowed.includes(origin) || origin.endsWith('.amazonaws.com') || origin.startsWith('https://')) {
      return callback(null, true);
    }
    // In development allow all; in production log and allow (CORS is not a security boundary for APIs)
    return callback(null, true);
  },
  credentials: true,
  // The renewed session token rides back on this header; without exposing it
  // the browser hides it from our own fetch wrapper.
  exposedHeaders: ['X-Renewed-Token'],
  // Without this, browsers cache a preflight for ~5 seconds. The trading
  // terminal polls positions, wallet and pending orders every 5s, so EVERY
  // poll was paying for a second round trip — measured at up to 1.9s each on
  // a fresh connection. 24h is the spec max; Chrome clamps it to 2h.
  maxAge: 86400
}));

// Apply general rate limiting to all routes (after CORS)
app.use('/api/', generalLimiter);

// ── Razorpay webhook ──────────────────────────────────────────────────
// MUST be registered BEFORE express.json() so the RAW request bytes are
// available for HMAC-SHA256 signature verification (re-parsing would change
// the byte layout and break the signature). No user auth — the webhook is
// authenticated by its signature. Idempotent: it activates the challenge on a
// successful payment even if the browser never calls /verify.
app.post('/api/prop/razorpay/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const razorpay = require('./services/razorpay.service');
    const signature = req.headers['x-razorpay-signature'];
    if (!razorpay.verifyWebhookSignature(req.body, signature)) {
      return res.status(400).json({ error: 'invalid signature' });
    }
    const event = JSON.parse(req.body.toString('utf8'));
    const type = event?.event;
    const orderId = event?.payload?.payment?.entity?.order_id || event?.payload?.order?.entity?.id;
    const paymentId = event?.payload?.payment?.entity?.id || null;

    if ((type === 'payment.captured' || type === 'order.paid') && orderId) {
      const Transaction = require('./models/Transaction');
      const challengeApprovalService = require('./services/challengeApproval.service');
      const tx = await Transaction.findOne({ type: 'challenge_purchase', 'paymentDetails.razorpayOrderId': orderId });
      if (tx && tx.status === 'pending') {
        tx.paymentDetails = tx.paymentDetails || {};
        if (paymentId) tx.paymentDetails.razorpayPaymentId = paymentId;
        await tx.save();
        try {
          await challengeApprovalService.approveChallengeBuy(tx._id, 'razorpay:webhook');
        } catch (e) {
          // Already approved by the /verify callback — safe no-op.
          if (!/already/i.test(String(e.message))) throw e;
        }
      }
    }
    return res.json({ received: true });
  } catch (e) {
    console.error('[Razorpay webhook] error:', e.message);
    // 5xx → Razorpay retries with backoff (eventual consistency for legit events).
    return res.status(500).json({ error: 'processing_error' });
  }
});

// ── Cashfree webhook ──────────────────────────────────────────────────
// Registered BEFORE express.json() so the RAW bytes are available for the
// HMAC-SHA256 signature check. No user auth — authenticated by its signature.
// Idempotent: activates the challenge on a successful payment even if the
// browser never calls /verify.
app.post('/api/prop/cashfree/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const cashfree = require('./services/cashfree.service');
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];
    if (!cashfree.verifyWebhookSignature(req.body, signature, timestamp)) {
      return res.status(400).json({ error: 'invalid signature' });
    }
    const event = JSON.parse(req.body.toString('utf8'));
    const type = event?.type;
    const orderId = event?.data?.order?.order_id;
    const paymentStatus = event?.data?.payment?.payment_status;
    const paymentId = event?.data?.payment?.cf_payment_id;

    if (orderId && (type === 'PAYMENT_SUCCESS_WEBHOOK' || paymentStatus === 'SUCCESS')) {
      const Transaction = require('./models/Transaction');
      const challengeApprovalService = require('./services/challengeApproval.service');
      const tx = await Transaction.findOne({ type: 'challenge_purchase', 'paymentDetails.cashfreeOrderId': orderId });
      if (tx && tx.status === 'pending') {
        tx.paymentDetails = tx.paymentDetails || {};
        if (paymentId) tx.paymentDetails.cashfreePaymentId = String(paymentId);
        await tx.save();
        try {
          await challengeApprovalService.approveChallengeBuy(tx._id, 'cashfree:webhook');
        } catch (e) {
          // Already approved by the /verify callback — safe no-op.
          if (!/already/i.test(String(e.message))) throw e;
        }
      }
    }
    return res.json({ received: true });
  } catch (e) {
    console.error('[Cashfree webhook] error:', e.message);
    // 5xx → Cashfree retries with backoff (eventual consistency for legit events).
    return res.status(500).json({ error: 'processing_error' });
  }
});

// Body parsers
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// ── Never let an authenticated API response be cached ────────────────────────
// Express sends a default ETag and we set no Cache-Control, so responses were
// cacheable by URL alone. iOS/WKWebView (the installed PWA) does not vary on the
// Authorization header, so after a purchase it kept replaying the pre-purchase
// /api/prop/my-accounts body and the new funded account simply never appeared —
// until the user cleared the cache or logged in again.
// This must sit above every route so it covers all of them.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Data sanitization against NoSQL injection (custom middleware for Express 5.x compatibility)
const sanitizeInput = (obj) => {
  if (obj && typeof obj === 'object') {
    for (const key in obj) {
      if (key.startsWith('$') || key.includes('.')) {
        delete obj[key];
      } else if (typeof obj[key] === 'object') {
        sanitizeInput(obj[key]);
      }
    }
  }
  return obj;
};

app.use((req, res, next) => {
  if (req.body) sanitizeInput(req.body);
  if (req.params) sanitizeInput(req.params);
  next();
});

// Prevent HTTP Parameter Pollution
app.use(hpp());

// Trust proxy for accurate IP detection behind reverse proxies
app.set('trust proxy', 1);

// Serve static files (avatars)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve TradingView Charting Library for mobile WebView (and dev web)
app.use('/charting_library', express.static(path.join(__dirname, '..', 'client', 'public', 'charting_library')));

// Auth routes with rate limiting
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/send-signup-otp', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
app.use('/api/auth/admin/login', adminAuthLimiter);
app.use('/api/auth/admin/seed', adminAuthLimiter);
app.use('/api/auth', authRouter);
app.use('/api/admin/email-templates', adminEmailTemplatesRouter);

// Admin-managed FAQ + Blog content. Admin CRUD mounted BEFORE the permission
// chokepoint (it does its own admin-token check); public read routes mounted
// further below at /api.
const { publicRouter: contentPublicRouter, adminRouter: contentAdminRouter } = require('./routes/content');
app.use('/api/admin/content', contentAdminRouter);

// ─── Phase 2: admin permission enforcement chokepoint ───────────────────────
// Every request to /api/admin/* passes through here. Routes listed in
// `adminRouteMap.js` are permission-checked via `requirePermission(key)`.
// Unmapped routes keep legacy behavior (any valid admin token works) so no
// endpoint is accidentally locked out. Public routes (login/seed/verify) are
// handled by the router above before this middleware runs.
/**
 * Sliding session.
 *
 * A user who keeps using the app should never be logged out by the clock. On
 * any request carrying a still-valid user token that is past a third of its
 * life, mint a fresh one and hand it back in a response header; the client
 * swaps it into storage. The only way to reach an expired token is to actually
 * stay away for the whole window.
 *
 * This sits in front of every /api route rather than inside the six separate
 * token guards, so nothing can be missed.
 */
const JWT_SIGNING_SECRET = process.env.JWT_SECRET || 'BharatFundedTrade-secret-key-2024';
const TOKEN_LIFETIME = process.env.JWT_EXPIRES_IN || '30d';
app.use('/api', (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next();
  const token = header.slice(7).trim();
  // Admin sessions use the 'admin-<id>' scheme and their own lifetime.
  if (!token || token.startsWith('admin-')) return next();
  try {
    const decoded = jwt.verify(token, JWT_SIGNING_SECRET);
    // A user token carries { id } only; admin/broker tokens also carry a role.
    if (!decoded || !decoded.id || decoded.role) return next();
    const life = (decoded.exp || 0) - (decoded.iat || 0);
    const remaining = (decoded.exp || 0) - Math.floor(Date.now() / 1000);
    if (life > 0 && remaining > 0 && remaining < life * 0.67) {
      res.setHeader(
        'X-Renewed-Token',
        jwt.sign({ id: decoded.id }, JWT_SIGNING_SECRET, { expiresIn: TOKEN_LIFETIME })
      );
    }
  } catch {
    // Expired, malformed or foreign — the route's own guard answers it.
  }
  next();
});

const enforceAdminPermissionByRoute = require('./middleware/enforceAdminPermissionByRoute');
app.use('/api/admin', enforceAdminPermissionByRoute);
const { scopeUserFilter, capPermissions } = require('./middleware/adminPermission');
const { logScopedChange } = require('./services/scopedAuditLog');
const { ownedEventsFilter } = require('./services/revenueAttribution');

// Phase 3 — scoped write endpoints (sub-admin / broker editing settings that
// apply only to users in their subtree). Mounted AFTER the chokepoint so
// the chokepoint's "public" markers let these routes through; the router
// itself enforces requirePermission(...) + attachScope per endpoint.
const adminScopedRouter = require('./routes/adminScoped');
app.use('/api/admin/scoped', adminScopedRouter);

// White-label branding + custom domain (feature-flagged inside the router).
app.use('/api/admin/branding', require('./routes/adminBranding'));

// Public brand lookup: the end-user app asks "whose site am I on?" on load.
// Unauthenticated by design — it returns only what a visitor already sees.
app.get('/api/public/branding', async (req, res) => {
  try {
    const { tenantForHost, PLATFORM_DOMAIN } = require('./services/tenantDomain');
    const tenant = await tenantForHost(req.headers.host);
    res.json({
      success: true,
      tenant: tenant
        ? { brandName: tenant.brandName || tenant.name, logoUrl: tenant.logoUrl || '', domain: tenant.customDomain }
        : null,
      platformDomain: PLATFORM_DOMAIN,
    });
  } catch (err) {
    res.json({ success: true, tenant: null });
  }
});

// MetaAPI proxy routes (hides token from client)
app.use('/api/metaapi', metaApiProxyRouter);

// IB and Wallet routes
const ibRouter = require('./routes/ib');
const walletRouter = require('./routes/wallet');

// Expose socket.io to routes that need to emit (e.g. prop close-position).
app.set('io', io);

app.use('/api/ib', ibRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/prop', propTradingRouter);
app.use('/api/ai-options', aiOptionsRouter);

// Global promo coupons (admin-issued, applies to any user)
const globalCouponRouter = require('./routes/globalCoupon');
app.use('/api/global-coupons', globalCouponRouter);

// Public FAQ + Blog content (GET /api/faqs, /api/blog, /api/blog/:slug)
app.use('/api', contentPublicRouter);

// Import execution engines
const HedgingEngine = require('./engines/HedgingEngine');
const NettingEngine = require('./engines/NettingEngine');
const BinaryEngine = require('./engines/BinaryEngine');
const MetaApiStreamingService = require('./services/metaApiStreaming');
const DeltaExchangeStreamingService = require('./services/deltaExchangeStreaming');

// Import IB services for trade hooks
const commissionService = require('./services/commission.service');
const { initializeCronJobs, setSocketIO: setCronSocketIO, triggerOptionExpirySettlement } = require('./cron/settlement.cron');
const riskManagement = require('./services/riskManagement.service');
const { refreshRate: refreshUsdInrRate } = require('./services/currencyRateService');

// Initialize engines (will be set after DB connection)
let hedgingEngine = null;
let nettingEngine = null;
let binaryEngine = null;
let metaApiStreaming = null;
let deltaExchangeStreaming = null;

// Connect to MongoDB and initialize engines
connectDB().then(async () => {
  hedgingEngine = new HedgingEngine();
  nettingEngine = new NettingEngine();
  binaryEngine = new BinaryEngine(io);
  riskManagement.setRiskEngines(hedgingEngine, nettingEngine);
  console.log('⚙️ Trade mode settings initialized');

  // Initialize MetaAPI streaming for real-time prices (non-blocking)
  metaApiStreaming = new MetaApiStreamingService(io);
  metaApiStreaming.initialize().catch(err => console.error('MetaAPI init error:', err.message));
  
  // Initialize Delta Exchange streaming for crypto futures & options
  deltaExchangeStreaming = new DeltaExchangeStreamingService(io);
  nettingEngine.setDeltaExchangeStreaming(deltaExchangeStreaming);
  deltaExchangeStreaming.initialize().catch(err => console.error('Delta Exchange init error:', err.message));

  metaApiStreaming.setTradeEngines(hedgingEngine, nettingEngine, deltaExchangeStreaming);
  
  // Initialize IB cron jobs with Socket.IO for notifications
  setCronSocketIO(io);
  initializeCronJobs();
  console.log('📅 Settlement cron jobs initialized');
  
  refreshUsdInrRate().then(() => {}).catch(() => {});

  try {
    const emailTemplateService = require('./services/emailTemplate.service');
    const n = await emailTemplateService.seedMissingTemplates();
    if (n) console.log(`📧 Seeded ${n} default email template(s)`);
    // One-shot self-heal: replace a stale welcome email (old copy / brand typo)
    // with the current colourful default. Guarded, so it won't clobber edits.
    const repaired = await emailTemplateService.repairWelcomeTemplate();
    if (repaired) console.log('📧 Welcome email template refreshed to latest design');
  } catch (err) {
    console.error('Email template seed:', err.message);
  }

  try {
    const { seedContentIfEmpty } = require('./services/contentSeed.service');
    const { faqs, posts } = await seedContentIfEmpty();
    if (faqs || posts) console.log(`📝 Seeded content — ${faqs} FAQ(s), ${posts} blog post(s)`);
  } catch (err) {
    console.error('Content seed:', err.message);
  }
});

// ============== API ROUTES ==============

// Root endpoint - returns 200 OK
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'DhanFunded API', timestamp: new Date().toISOString() });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public contact form — landing-page "Contact Our Support Team" form posts here.
// Sends the visitor's enquiry to the configured support inbox via the same
// Hostinger SMTP that powers signup OTP and welcome emails. Reply-To is set
// to the visitor's address so the support team can reply directly.
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body || {};
    const safeName = String(name || '').trim();
    const safeEmail = String(email || '').trim();
    const safeSubject = String(subject || '').trim();
    const safeMessage = String(message || '').trim();

    if (!safeName || !safeEmail || !safeMessage) {
      return res.status(400).json({ success: false, error: 'Name, email and message are required.' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(safeEmail)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }

    const emailService = require('./services/email.service');
    if (!emailService.isSmtpConfigured()) {
      return res.status(503).json({ success: false, error: 'Email service is not available right now. Please email us directly.' });
    }

    // Where the enquiry lands. Falls back to SMTP_USER (the support inbox) so
    // we never have to hard-code an address — set CONTACT_INBOX in .env to
    // route enquiries somewhere different (e.g. sales@).
    const supportInbox = (process.env.CONTACT_INBOX || process.env.SMTP_USER || '').trim();
    if (!supportInbox) {
      return res.status(500).json({ success: false, error: 'Support inbox not configured.' });
    }

    const mailSubject = safeSubject
      ? `[Website Contact] ${safeSubject}`
      : `[Website Contact] New enquiry from ${safeName}`;

    const text = [
      `New enquiry from the DhanFunded contact form:`,
      ``,
      `Name:    ${safeName}`,
      `Email:   ${safeEmail}`,
      `Subject: ${safeSubject || '(none)'}`,
      ``,
      `Message:`,
      safeMessage,
      ``,
      `— Reply directly to this email to respond to ${safeName}.`
    ].join('\n');

    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0D0F1A;">
        <div style="background:linear-gradient(135deg,#2B4EFF 0%,#4B6AFF 100%);padding:18px 22px;border-radius:10px 10px 0 0;color:#fff;">
          <p style="margin:0;font-size:11px;font-weight:800;letter-spacing:2px;color:rgba(255,255,255,0.85);text-transform:uppercase;">Website Contact</p>
          <h2 style="margin:4px 0 0 0;font-size:18px;font-weight:700;">New enquiry from ${safeName}</h2>
        </div>
        <div style="background:#FAFBFD;padding:20px 22px;border:1px solid #E8EAF0;border-top:none;border-radius:0 0 10px 10px;">
          <table style="width:100%;font-size:14px;color:#4B5165;border-spacing:0;">
            <tr><td style="padding:4px 0;width:90px;color:#6B7080;">Name</td><td style="padding:4px 0;font-weight:600;color:#0D0F1A;">${safeName}</td></tr>
            <tr><td style="padding:4px 0;color:#6B7080;">Email</td><td style="padding:4px 0;font-weight:600;color:#0D0F1A;"><a href="mailto:${safeEmail}" style="color:#2B4EFF;text-decoration:none;">${safeEmail}</a></td></tr>
            <tr><td style="padding:4px 0;color:#6B7080;">Subject</td><td style="padding:4px 0;font-weight:600;color:#0D0F1A;">${safeSubject || '<em style="color:#9AA0B4;font-weight:400;">(none)</em>'}</td></tr>
          </table>
          <div style="margin-top:14px;padding:14px 16px;background:#fff;border:1px solid #E8EAF0;border-radius:8px;font-size:14px;line-height:1.6;color:#0D0F1A;white-space:pre-wrap;">${safeMessage.replace(/[<>]/g, (c) => c === '<' ? '&lt;' : '&gt;')}</div>
          <p style="margin:14px 0 0 0;font-size:12px;color:#6B7080;">Hit Reply to respond directly to ${safeName}.</p>
        </div>
      </div>
    `;

    // sendMail uses Hostinger SMTP. Adding replyTo so the support agent can
    // hit Reply in their inbox and the response goes to the visitor, not back
    // to the support inbox itself.
    const transporter = emailService.createTransport();
    if (!transporter) {
      return res.status(503).json({ success: false, error: 'Email service is not available right now.' });
    }
    const fromName = (process.env.SMTP_FROM_NAME || 'DhanFunded');
    const fromAddr = (process.env.SMTP_FROM || process.env.SMTP_USER);
    await transporter.sendMail({
      from: `"${fromName}" <${fromAddr}>`,
      to: supportInbox,
      replyTo: `"${safeName}" <${safeEmail}>`,
      subject: mailSubject,
      text,
      html
    });

    res.json({ success: true, message: 'Thanks — your message has been sent. We typically reply within 2 hours.' });
  } catch (error) {
    console.error('[Contact] send failed:', error);
    res.status(500).json({ success: false, error: 'Could not send your message. Please try again or email us directly.' });
  }
});

// Get current live prices (for debugging)
app.get('/api/live-prices', (req, res) => {
  if (metaApiStreaming && metaApiStreaming.prices) {
    const prices = metaApiStreaming.prices;
    const symbols = Object.keys(prices);
    res.json({ 
      success: true, 
      count: symbols.length,
      symbols: symbols
    });
  } else {
    res.json({ success: false, error: 'MetaAPI not initialized' });
  }
});

/** MetaAPI may expose both XAUUSD and XAUUSD.c with the same quotes; keep one row per underlying. */
function brokerInstrumentBaseKey(symbol) {
  return String(symbol || '').replace(/\.[a-zA-Z0-9]+$/, '').toUpperCase();
}
function brokerInstrumentPreferenceRank(sym) {
  const s = String(sym);
  const hasSuffix = /\.[a-zA-Z0-9]+$/.test(s);
  return (hasSuffix ? 1 << 20 : 0) + s.length;
}
function pickBetterBrokerInstrumentSymbol(a, b) {
  const ra = brokerInstrumentPreferenceRank(a);
  const rb = brokerInstrumentPreferenceRank(b);
  if (ra !== rb) return ra < rb ? a : b;
  return a <= b ? a : b;
}
function dedupeMetaInstrumentsByBrokerBase(instruments) {
  const map = new Map();
  for (const inst of instruments) {
    const base = brokerInstrumentBaseKey(inst.symbol);
    const prev = map.get(base);
    if (!prev) map.set(base, inst);
    else {
      const chosenSym = pickBetterBrokerInstrumentSymbol(prev.symbol, inst.symbol);
      map.set(base, chosenSym === prev.symbol ? prev : inst);
    }
  }
  return Array.from(map.values());
}

// Get all available instruments from broker with live prices
app.get('/api/instruments', (req, res) => {
  if (metaApiStreaming && metaApiStreaming.prices) {
    const prices = metaApiStreaming.prices;
    const { search, category } = req.query;
    
    // Build instruments list from all available prices
    let instruments = Object.entries(prices).map(([symbol, priceData]) => {
      // Determine category based on symbol pattern
      let cat = 'other';
      const sym = symbol.toUpperCase();
      const baseSym = sym.replace(/\.[A-Z0-9]+$/i, '');
      
      // Crypto — check BEFORE forex so BTCUSD/ETHUSD (6 chars) don't match forex pattern
      if (baseSym.includes('BTC') || baseSym.includes('ETH') || baseSym.includes('LTC') || baseSym.includes('XRP') || 
               baseSym.includes('ADA') || baseSym.includes('DOT') || baseSym.includes('SOL') || baseSym.includes('DOGE') ||
               baseSym.includes('LINK') || baseSym.includes('MATIC') || baseSym.includes('AVAX') || baseSym.includes('BCH') ||
               baseSym.includes('BNB') || baseSym.includes('SHIB') || baseSym.includes('PEPE') || baseSym.includes('APT') ||
               baseSym.includes('ARB') || baseSym.includes('OP') || baseSym.includes('NEAR') || baseSym.includes('ATOM')) {
        cat = 'crypto_perpetual';
      }
      // Metals
      else if (baseSym.startsWith('XAU') || baseSym.startsWith('XAG') || baseSym.startsWith('XPT') || baseSym.startsWith('XPD')) {
        cat = 'metals';
      }
      // Forex pairs (6 chars, both parts are currencies)
      else if (/^[A-Z]{6}$/.test(baseSym)) {
        if (baseSym.includes('JPY')) cat = 'forex_yen';
        else cat = 'forex';
      }
      // International equities (broker suffix .US, .DE, …)
      else if (
        /^[A-Z]{1,5}$/.test(baseSym) &&
        (sym.includes('.US') || sym.includes('.DE') || sym.includes('.UK') || sym.includes('.EU') || sym.includes('.FR'))
      ) {
        cat = 'stocks';
      }
      // Indices
      else if (baseSym.startsWith('US') || baseSym.startsWith('UK') || baseSym.startsWith('DE') || baseSym.startsWith('JP') ||
               baseSym.startsWith('HK') || baseSym.startsWith('AU') || baseSym.startsWith('CN') || baseSym.startsWith('EU') ||
               baseSym.includes('100') || baseSym.includes('500') || baseSym.includes('30') || baseSym.includes('225') ||
               baseSym.includes('DAX') || baseSym.includes('FTSE') || baseSym.includes('NIKKEI') || baseSym.includes('STOXX')) {
        cat = 'indices';
      }
      // Energy/Commodities
      else if (baseSym.includes('OIL') || baseSym.includes('GAS') || baseSym.includes('BRENT') || baseSym.includes('WTI') ||
               baseSym.includes('XTI') || baseSym.includes('XBR') || baseSym.includes('NGAS')) {
        cat = 'energy';
      }
      
      return {
        symbol,
        name: getInstrumentName(baseSym),
        category: cat,
        exchange: cat === 'forex' || cat === 'forex_yen' ? 'FOREX'
                : cat === 'stocks' ? 'STOCKS'
                : cat === 'indices' ? 'INDICES'
                : cat === 'metals' || cat === 'energy' ? 'COMMODITIES'
                : '',
        bid: priceData.bid || 0,
        ask: priceData.ask || 0,
        low: priceData.low || 0,
        high: priceData.high || 0,
        change: priceData.change || 0,
        spread: priceData.spread || 0,
        time: priceData.time
      };
    });

    instruments = dedupeMetaInstrumentsByBrokerBase(instruments);

    // Filter by search query (base-aware so e.g. XAUUSD.c still finds the canonical XAUUSD row)
    if (search) {
      const searchLower = search.toLowerCase();
      const searchBase = searchLower.replace(/\.[a-zA-Z0-9]+$/, '');
      instruments = instruments.filter(inst => {
        const sym = inst.symbol.toLowerCase();
        const base = brokerInstrumentBaseKey(inst.symbol).toLowerCase();
        return (
          sym.includes(searchLower) ||
          base.includes(searchBase) ||
          sym.includes(searchBase) ||
          (inst.name && inst.name.toLowerCase().includes(searchLower))
        );
      });
    }
    
    // Filter by category (UI: Com = metals+energy, Forex = majors+crosses incl. JPY)
    if (category && category !== 'all') {
      if (category === 'com') {
        instruments = instruments.filter(inst => inst.category === 'metals' || inst.category === 'energy');
      } else if (category === 'forex') {
        instruments = instruments.filter(inst => inst.category === 'forex' || inst.category === 'forex_yen');
      } else if (category === 'crypto_spot') {
        instruments = instruments.filter(() => false);
      } else {
        instruments = instruments.filter(inst => inst.category === category);
      }
    }
    
    // Sort alphabetically
    instruments.sort((a, b) => a.symbol.localeCompare(b.symbol));
    
    res.json({ 
      success: true, 
      count: instruments.length,
      instruments: instruments
    });
  } else {
    res.json({ success: false, error: 'MetaAPI not initialized', instruments: [] });
  }
});

// Batch: live bid/ask from MetaAPI streaming cache + REST alias fallback (broker symbols like EURUSD.c)
app.post('/api/instruments/prices', async (req, res) => {
  try {
    const symbols = req.body?.symbols;
    if (!Array.isArray(symbols)) {
      return res.status(400).json({ success: false, error: 'symbols array required' });
    }
    const cache = metaApiStreaming?.prices || {};
    const prices = {};
    for (const raw of symbols) {
      if (!raw) continue;
      const upper = String(raw).toUpperCase();
      let p = cache[upper] || cache[raw];
      if (!p) {
        const hit = Object.keys(cache).find(
          (k) => k.replace(/\.[a-zA-Z0-9]+$/, '').toUpperCase() === upper
        );
        if (hit) p = cache[hit];
      }
      if (p && (Number(p.bid) > 0 || Number(p.ask) > 0)) {
        prices[raw] = {
          bid: p.bid,
          ask: p.ask,
          low: p.low,
          high: p.high,
          change: p.change,
          pointChange: p.pointChange,
          sessionOpen: p.sessionOpen,
          previousClose: p.previousClose,
          open: p.sessionOpen,
          close: p.previousClose
        };
      }
    }

    const needRest = symbols.filter((raw) => {
      if (!raw) return false;
      const got = prices[raw];
      return !got || (Number(got.bid) <= 0 && Number(got.ask) <= 0);
    });
    const restFn = MetaApiStreamingService.restPriceForSymbol;
    if (needRest.length > 0 && typeof restFn === 'function') {
      await Promise.all(
        needRest.map(async (raw) => {
          try {
            const r = await restFn(raw);
            if (!r) return;
            prices[raw] = {
              bid: r.bid,
              ask: r.ask,
              low: r.low,
              high: r.high,
              change: 0,
              pointChange: 0,
              sessionOpen: r.sessionOpen,
              previousClose: r.previousClose,
              open: r.sessionOpen,
              close: r.previousClose
            };
            const upper = String(raw).toUpperCase();
            if (metaApiStreaming?.prices) {
              metaApiStreaming.prices[upper] = {
                symbol: upper,
                bid: r.bid,
                ask: r.ask,
                low: r.low,
                high: r.high,
                change: 0,
                pointChange: 0,
                sessionOpen: r.sessionOpen,
                previousClose: r.previousClose,
                time: new Date().toISOString()
              };
            }
          } catch (_) {
            /* ignore per symbol */
          }
        })
      );
    }

    const diskPrices =
      typeof MetaApiStreamingService.loadDiskCacheForFallback === 'function'
        ? MetaApiStreamingService.loadDiskCacheForFallback()
        : {};
    const pickDiskPrice = (sym) => {
      if (!sym || !diskPrices || typeof diskPrices !== 'object') return null;
      const upper = String(sym).toUpperCase();
      let p = diskPrices[upper] || diskPrices[sym];
      if (p && (Number(p.bid) > 0 || Number(p.ask) > 0)) return p;
      const hit = Object.keys(diskPrices).find(
        (k) => k.replace(/\.[a-zA-Z0-9]+$/, '').toUpperCase() === upper
      );
      return hit ? diskPrices[hit] : null;
    };
    for (const raw of symbols) {
      if (!raw) continue;
      const got = prices[raw];
      if (got && Number(got.bid) > 0 && Number(got.ask) > 0) continue;
      const d = pickDiskPrice(raw);
      if (d && (Number(d.bid) > 0 || Number(d.ask) > 0)) {
        prices[raw] = {
          bid: d.bid,
          ask: d.ask,
          low: d.low,
          high: d.high,
          change: d.change ?? 0,
          pointChange: d.pointChange,
          sessionOpen: d.sessionOpen,
          previousClose: d.previousClose,
          open: d.sessionOpen,
          close: d.previousClose
        };
      }
    }

    res.json({ success: true, prices });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

function getInstrumentName(symbol) {
  const names = {
    'NIFTY50': 'Nifty 50',
    'NIFTY': 'Nifty 50',
    'BANKNIFTY': 'Bank Nifty',
    'FINNIFTY': 'Fin Nifty',
    'SENSEX': 'BSE Sensex',
    'RELIANCE': 'Reliance Industries',
    'TCS': 'Tata Consultancy Services',
    'INFY': 'Infosys',
    'HDFCBANK': 'HDFC Bank',
    'ICICIBANK': 'ICICI Bank',
    'SBIN': 'State Bank of India',
    'ITC': 'ITC Limited',
    'HINDUNILVR': 'Hindustan Unilever',
    'KOTAKBANK': 'Kotak Mahindra Bank',
    'LT': 'Larsen & Toubro',
    'AXISBANK': 'Axis Bank',
    'BHARTIARTL': 'Bharti Airtel',
    'ASIANPAINT': 'Asian Paints',
    'MARUTI': 'Maruti Suzuki',
    'BAJFINANCE': 'Bajaj Finance',
    'WIPRO': 'Wipro',
    'HCLTECH': 'HCL Technologies',
    'TATAMOTORS': 'Tata Motors',
    'SUNPHARMA': 'Sun Pharmaceutical'
  };
  return names[symbol] || symbol;
}

// Get Delta Exchange instruments (Crypto Futures & Options)
app.get('/api/delta/instruments', (req, res) => {
  if (deltaExchangeStreaming) {
    const { search, category } = req.query;
    
    let instruments = [];
    
    if (category && category !== 'all') {
      instruments = deltaExchangeStreaming.getInstrumentsByCategory(category);
    } else {
      instruments = deltaExchangeStreaming.getAllInstruments();
    }
    
    // Filter by search query
    if (search) {
      const searchLower = search.toLowerCase();
      instruments = instruments.filter(inst => 
        inst.symbol.toLowerCase().includes(searchLower) ||
        inst.name.toLowerCase().includes(searchLower) ||
        (inst.underlying && inst.underlying.toLowerCase().includes(searchLower))
      );
    }
    
    // Sort by symbol
    instruments.sort((a, b) => a.symbol.localeCompare(b.symbol));
    
    res.json({ 
      success: true, 
      count: instruments.length,
      instruments: instruments
    });
  } else {
    res.json({ success: false, error: 'Delta Exchange not initialized', instruments: [] });
  }
});

// Get Delta Exchange status
app.get('/api/delta/status', (req, res) => {
  if (deltaExchangeStreaming) {
    res.json({ 
      success: true, 
      ...deltaExchangeStreaming.getStatus()
    });
  } else {
    res.json({ success: false, error: 'Delta Exchange not initialized' });
  }
});

// Get Delta Exchange live prices
app.get('/api/delta/prices', (req, res) => {
  if (deltaExchangeStreaming) {
    const prices = deltaExchangeStreaming.getPrices();
    res.json({ 
      success: true, 
      count: Object.keys(prices).length,
      prices: prices
    });
  } else {
    res.json({ success: false, error: 'Delta Exchange not initialized', prices: {} });
  }
});

app.get('/api/delta/history/:symbol', async (req, res) => {
  try {
    const axios = require('axios');
    const DELTA_API_URL = process.env.DELTA_API_URL || 'https://api.india.delta.exchange';
    const { symbol } = req.params;
    const resolution = req.query.resolution || '5m';
    const end = Math.floor(Date.now() / 1000);
    const lookbackSec = Math.min(86400 * 400, Math.max(300, parseInt(req.query.lookbackSec || '604800', 10)));
    const start = end - lookbackSec;

    const url = `${DELTA_API_URL.replace(/\/$/, '')}/v2/history/candles`;
    const response = await axios.get(url, {
      params: { symbol, resolution, start, end },
      headers: { Accept: 'application/json' },
      timeout: 20000
    });

    const result = response.data?.result;
    if (!Array.isArray(result)) {
      return res.json({ success: true, candles: [] });
    }
    const candles = [...result]
      .sort((a, b) => a.time - b.time)
      .map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume != null ? c.volume : 0
      }));
    res.json({ success: true, candles });
  } catch (error) {
    const msg = error.response?.data?.error || error.message;
    console.error('Delta history error:', msg);
    res.status(502).json({ success: false, error: String(msg || 'Delta history failed') });
  }
});

// Get trade mode settings
app.get('/api/settings/trade-modes', async (req, res) => {
  try {
    const settings = await TradeModeSettings.find({});
    const result = {};
    settings.forEach(s => { result[s.mode] = s.toObject(); });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update trade mode settings
app.put('/api/settings/trade-modes/:mode', async (req, res) => {
  try {
    const { mode } = req.params;
    const settings = await TradeModeSettings.findOneAndUpdate(
      { mode },
      { ...req.body },
      { new: true, upsert: true }
    );
    res.json({ success: true, settings: settings.toObject() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== ORDER EXECUTION ==============

// Place order (unified endpoint)
app.post('/api/orders', async (req, res) => {
  try {
    const { mode, userId, challengeAccountId, ...orderData } = req.body;

    if (!mode || !userId) {
      return res.status(400).json({ error: 'Mode and userId are required' });
    }

    if (!hedgingEngine || !nettingEngine || !binaryEngine) {
      return res.status(503).json({ error: 'Server initializing, please try again' });
    }

    // Challenge-account trades are routed to the isolated prop engine so they
    // only affect the virtual sub-wallet on the ChallengeAccount document;
    // the user's main User.wallet is never touched in this branch.
    if (challengeAccountId) {
      const challengePropEngine = require('./services/challengePropEngine.service');
      const propResult = await challengePropEngine.openPosition(challengeAccountId, {
        symbol: orderData.symbol,
        side: orderData.side,
        volume: orderData.volume,
        quantity: orderData.quantity,
        lotSize: orderData.lotSize,
        // For limit/stop orders this is the user's trigger price; for market
        // orders it's the live price. The engine treats limit/stop as PENDING
        // and only fills when the live market reaches this price.
        entryPrice: orderData.price || orderData.entryPrice,
        price: orderData.price,
        leverage: orderData.leverage,
        stopLoss: orderData.stopLoss,
        takeProfit: orderData.takeProfit,
        exchange: orderData.exchange,
        segment: orderData.segment,
        session: orderData.session,
        orderType: orderData.orderType,
        // Live bid/ask so the engine can validate pending-order placement.
        marketData: orderData.marketData
      });
      if (!propResult.success) {
        return res.status(400).json({ error: propResult.error, code: propResult.code });
      }
      io.to(userId).emit('challengeAccountUpdate', {
        challengeAccountId,
        account: propResult.account,
        position: propResult.position
      });
      return res.json({ success: true, position: propResult.position, account: propResult.account });
    }

    // Prop-only platform: reject main-wallet order placement. Trades must
    // always be scoped to a challenge account. Closing existing main-wallet
    // positions is handled by /api/positions/close, not this endpoint.
    return res.status(403).json({
      error: 'This is a prop-trading platform. Please select an active challenge account before placing orders.',
      code: 'CHALLENGE_REQUIRED'
    });

    // eslint-disable-next-line no-unreachable
    let result;

    // Create getCurrentPrice callback for reorder functionality
    const getCurrentPriceCallback = async () => {
      try {
        const symbol = orderData.symbol;
        console.log(`[Reorder Callback] Getting current price for ${symbol}`);
        // Try to get current price from MetaAPI streaming service
        if (metaApiStreaming) {
          const price = metaApiStreaming.getPrice(symbol);
          console.log(`[Reorder Callback] MetaAPI price for ${symbol}:`, price);
          if (price && price.bid) {
            const resultPrice = orderData.side === 'buy' ? price.ask : price.bid;
            console.log(`[Reorder Callback] Returning price: ${resultPrice} for side: ${orderData.side}`);
            return resultPrice;
          }
        }
        // Fallback to the price from order data
        console.log(`[Reorder Callback] Using fallback price: ${orderData.price}`);
        return orderData.price;
      } catch (error) {
        console.error('[Reorder] Error getting current price:', error);
        return orderData.price;
      }
    };

    console.log(`[Order API] Placing order - mode: ${mode}, symbol: ${orderData.symbol}, side: ${orderData.side}, price: ${orderData.price}`);

    switch (mode) {
      case 'hedging':
        console.log(`[Order API] Calling hedgingEngine.executeOrder with getCurrentPriceCallback`);
        result = await hedgingEngine.executeOrder(userId, orderData, orderData.marketData, getCurrentPriceCallback);
        break;
      case 'netting':
        console.log(`[Order API] Calling nettingEngine.executeOrder with getCurrentPriceCallback`);
        result = await nettingEngine.executeOrder(userId, orderData, orderData.marketData, getCurrentPriceCallback);
        break;
      case 'binary':
        result = await binaryEngine.executeOrder(userId, orderData);
        break;
      default:
        return res.status(400).json({ error: 'Invalid trading mode' });
    }

    // Emit position update + send response IMMEDIATELY so the client gets a
    // fast trade confirmation. Activity log + User.findOne are fire-and-forget
    // (saved ~150-300ms per order in production where DB latency is higher).
    io.to(userId).emit('positionUpdate', { mode, positions: result.positions });
    res.json(result);

    // Background: persist activity log without blocking the response.
    if (result.position) {
      const orderUserAgent = resolveUA(req);
      const orderDevice = resolveDevice(req);
      const ip = req.ip;
      setImmediate(async () => {
        try {
          const user = await User.findOne({ oderId: userId }).lean();
          if (!user) return;
          const pos = result.position;
          const isPending = pos.status === 'pending' || orderData.orderType === 'limit' || orderData.orderType === 'stop';
          await UserActivityLog.logActivity({
            userId: user._id.toString(),
            oderId: userId,
            activityType: isPending ? 'order_placed' : 'trade_open',
            description: isPending
              ? `Placed ${orderData.orderType?.toUpperCase() || 'LIMIT'} order: ${orderData.side?.toUpperCase()} ${orderData.volume} lot(s) ${orderData.symbol} @ ${orderData.price}`
              : `Opened ${orderData.side?.toUpperCase()} position: ${orderData.volume} lot(s) ${orderData.symbol} @ ${pos.entryPrice || orderData.price}`,
            metadata: {
              positionId: pos._id || pos.id,
              symbol: orderData.symbol,
              side: orderData.side,
              volume: orderData.volume,
              price: pos.entryPrice || orderData.price,
              orderType: orderData.orderType,
              mode,
            },
            ipAddress: ip,
            userAgent: orderUserAgent,
            device: orderDevice,
            os: parseOS(orderUserAgent),
            browser: parseBrowser(orderUserAgent),
            status: 'success',
          });
        } catch (logErr) {
          console.warn('Order activity log failed:', logErr.message);
        }
      });
    }
  } catch (error) {
    console.error('Order execution error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Close position
app.post('/api/positions/close', async (req, res) => {
  try {
    const { mode, userId, positionId, volume, currentPrice, symbol } = req.body;

    let result;
    let closedPosition = null;

    switch (mode) {
      case 'hedging':
        // Get position details before closing for activity log
        const { HedgingPosition } = require('./models/Position');
        const mongoose = require('mongoose');
        // Try by _id first, then by oderId
        if (mongoose.Types.ObjectId.isValid(positionId)) {
          closedPosition = await HedgingPosition.findById(positionId);
        }
        if (!closedPosition) {
          closedPosition = await HedgingPosition.findOne({ oderId: positionId });
        }
        result = await hedgingEngine.closePosition(userId, positionId, volume, currentPrice);
        break;
      case 'netting':
        // NettingEngine.closePosition expects (userId, symbol, quantity, currentPrice)
        // Get symbol from request or lookup from positionId
        let nettingSymbol = symbol;
        if (!nettingSymbol && positionId) {
          const { NettingPosition } = require('./models/Position');
          const pos = await NettingPosition.findOne({ oderId: positionId });
          nettingSymbol = pos?.symbol;
          closedPosition = pos;
        }
        if (!nettingSymbol) {
          return res.status(400).json({ error: 'Symbol required for netting close' });
        }
        result = await nettingEngine.closePosition(userId, nettingSymbol, volume, currentPrice);
        break;
      default:
        return res.status(400).json({ error: 'Invalid mode for close' });
    }

    // Send response immediately, log close activity in background.
    io.to(userId).emit('positionUpdate', { mode, positions: result.positions });
    res.json(result);

    // Always log trade close, even if we didn't pre-fetch closedPosition (e.g.
    // netting close-by-symbol or APK calls). Background-fetches the position.
    const closeUserAgent = resolveUA(req);
    const closeDevice = resolveDevice(req);
    const ip = req.ip;
    const pnl = result.profit || result.pnl || 0;
    setImmediate(async () => {
      try {
        const user = await User.findOne({ oderId: userId }).lean();
        if (!user) return;
        let pos = closedPosition;
        if (!pos) {
          // Try to resolve from result or DB so the log has symbol/side info.
          pos = result.position || result.closedPosition || null;
          if (!pos && symbol) pos = { symbol, side: result.side, volume };
          if (!pos && positionId) {
            const { HedgingPosition, NettingPosition } = require('./models/Position');
            pos = await HedgingPosition.findOne({ $or: [{ _id: positionId }, { oderId: positionId }] }).lean()
               || await NettingPosition.findOne({ oderId: positionId }).lean();
          }
        }
        const sym = pos?.symbol || symbol || 'N/A';
        const side = pos?.side?.toUpperCase() || 'N/A';
        const vol = volume || pos?.volume || 0;
        await UserActivityLog.logActivity({
          userId: user._id.toString(),
          oderId: userId,
          activityType: 'trade_close',
          description: `Closed ${side} position: ${vol} lot(s) ${sym} @ ${currentPrice ?? 'market'} | P/L: ${pnl >= 0 ? '+' : ''}$${Number(pnl).toFixed(2)}`,
          metadata: { positionId, symbol: sym, side: pos?.side, volume: vol, closePrice: currentPrice, pnl, mode },
          ipAddress: ip,
          userAgent: closeUserAgent,
          device: closeDevice,
          os: parseOS(closeUserAgent),
          browser: parseBrowser(closeUserAgent),
          status: 'success'
        });
      } catch (err) { console.warn('Close activity log failed:', err.message); }
    });
  } catch (error) {
    const msg = error.message || '';
    if (msg.includes('must be held at least')) {
      return res.status(400).json({ error: msg });
    }
    res.status(500).json({ error: msg });
  }
});

// Cancel pending order
app.post('/api/orders/cancel', async (req, res) => {
  try {
    const { mode, userId, orderId } = req.body;

    if (!mode || !userId || !orderId) {
      return res.status(400).json({ error: 'Mode, userId, and orderId are required' });
    }

    let result;
    switch (mode) {
      case 'hedging':
        result = await hedgingEngine.cancelPendingOrder(userId, orderId);
        break;
      case 'netting':
        result = await nettingEngine.cancelPendingOrder(userId, orderId);
        break;
      default:
        return res.status(400).json({ error: 'Cancel pending order only supported for hedging and netting modes' });
    }

    io.to(userId).emit('pendingOrderUpdate', { mode, pendingOrders: result.pendingOrders });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Partial close position
app.post('/api/positions/partial-close', async (req, res) => {
  try {
    const { mode, userId, positionId, volume, currentPrice } = req.body;

    if (mode !== 'hedging') {
      return res.status(400).json({ error: 'Partial close only supported for hedging mode' });
    }

    const result = await hedgingEngine.closePosition(userId, positionId, volume, currentPrice);
    io.to(userId).emit('positionUpdate', { mode, positions: result.positions });
    res.json(result);
  } catch (error) {
    const msg = error.message || '';
    if (msg.includes('must be held at least')) {
      return res.status(400).json({ error: msg });
    }
    res.status(500).json({ error: msg });
  }
});

// Modify position (SL/TP)
app.put('/api/positions/modify', async (req, res) => {
  try {
    const { mode, userId, positionId, stopLoss, takeProfit } = req.body;

    let result;

    switch (mode) {
      case 'hedging':
        result = await hedgingEngine.modifyPosition(userId, positionId, { stopLoss, takeProfit });
        break;
      case 'netting':
        result = await nettingEngine.modifyPosition(userId, positionId, { stopLoss, takeProfit });
        break;
      default:
        return res.status(400).json({ error: 'Invalid mode for modify' });
    }

    io.to(userId).emit('positionUpdate', { mode, positions: result.positions });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Modify pending order (price, SL, TP)
app.put('/api/orders/modify', async (req, res) => {
  try {
    const { mode, userId, orderId, price, stopLoss, takeProfit } = req.body;

    if (!mode || !userId || !orderId) {
      return res.status(400).json({ error: 'Mode, userId, and orderId are required' });
    }

    const { HedgingPosition, NettingPosition } = require('./models/Position');
    const mongoose = require('mongoose');
    
    let order;
    let Position;
    
    if (mode === 'hedging') {
      Position = HedgingPosition;
    } else if (mode === 'netting') {
      Position = NettingPosition;
    } else {
      return res.status(400).json({ error: 'Invalid mode for modify pending order' });
    }

    // Find pending order
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      order = await Position.findOne({ _id: orderId, userId, status: 'pending' });
    }
    if (!order) {
      order = await Position.findOne({ oderId: orderId, userId, status: 'pending' });
    }
    
    if (!order) {
      return res.status(404).json({ error: 'Pending order not found' });
    }

    // Update fields
    if (price !== undefined && price !== null) {
      if (mode === 'hedging') {
        order.entryPrice = price;
        order.triggerPrice = price;
      } else {
        order.avgPrice = price;
        order.triggerPrice = price;
      }
    }
    if (stopLoss !== undefined) {
      order.stopLoss = stopLoss;
    }
    if (takeProfit !== undefined) {
      order.takeProfit = takeProfit;
    }

    await order.save();

    // Get updated pending orders
    const pendingOrders = await Position.find({ userId, status: 'pending' });

    io.to(userId).emit('pendingOrderUpdate', { mode, pendingOrders: pendingOrders.map(p => ({ ...p.toObject(), mode })) });
    
    res.json({
      success: true,
      order: order.toObject(),
      pendingOrders: pendingOrders.map(p => ({ ...p.toObject(), mode })),
      message: 'Pending order modified successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all positions across all modes for a user (must be before /:mode/:userId)
app.get('/api/positions/all/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!hedgingEngine || !nettingEngine || !binaryEngine) {
      return res.status(503).json({ error: 'Server initializing', positions: [] });
    }

    const hedgingPositions = await hedgingEngine.getPositions(userId);
    const nettingPositions = await nettingEngine.getPositions(userId);
    const binaryPositions = await binaryEngine.getPositions(userId);

    const allPositions = [
      ...hedgingPositions,
      ...nettingPositions,
      ...binaryPositions
    ];

    res.json({ positions: allPositions });
  } catch (error) {
    console.error('Error fetching positions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get positions by mode
app.get('/api/positions/:mode/:userId', async (req, res) => {
  try {
    const { mode, userId } = req.params;

    if (!hedgingEngine || !nettingEngine || !binaryEngine) {
      return res.status(503).json({ error: 'Server initializing', positions: [] });
    }

    let positions = [];

    switch (mode) {
      case 'hedging':
        positions = await hedgingEngine.getPositions(userId);
        break;
      case 'netting':
        positions = await nettingEngine.getPositions(userId);
        break;
      case 'binary':
        positions = await binaryEngine.getPositions(userId);
        break;
    }

    res.json({ positions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get trade history (closed trades) with pagination
app.get('/api/trades/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // History filter (Fix 18):
    //  - Include 'consumed' rows so FIFO-consumed legs from older data
    //    (created before the grouping schema bump) still appear, AND so
    //    grouped consumed legs can fall through if their parent gets deleted.
    //  - Children of a group (rows with `groupId` set AND
    //    `isHistoryParent !== true`) are HIDDEN from the flat list. They
    //    appear when the user expands the parent via /api/trades/group/...
    //  - Atomic closes (no groupId at all) appear as standalone rows.
    //  - Legacy rows (no groupId field) pass through too — `isHistoryParent`
    //    defaults to false on the schema but legacy docs are missing the
    //    field entirely; the $or below handles both cases.
    const historyFilter = {
      userId,
      type: { $in: ['close', 'partial_close', 'binary', 'consumed'] },
      closedBy: { $ne: 'admin' },
      $or: [
        { groupId: null },
        { groupId: { $exists: false } },
        { isHistoryParent: true }
      ]
    };

    const totalCount = await Trade.countDocuments(historyFilter);

    const trades = await Trade.find(historyFilter)
      .sort({ executedAt: -1 })
      .skip(skip)
      .limit(limitNum);

    res.json({
      trades: trades.map(t => ({ ...t.toObject(), mode: t.mode })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
        hasMore: skip + trades.length < totalCount
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch all child legs of a History group (Fix 18). Returns every Trade doc
// sharing this groupId, sorted oldest-first, EXCLUDING the parent itself
// (the client already has the parent row from the History list). Each row
// is the per-fill audit of how the group's total close was assembled.
app.get('/api/trades/group/:userId/:groupId', async (req, res) => {
  try {
    const { userId, groupId } = req.params;
    if (!groupId) return res.status(400).json({ error: 'groupId is required' });
    const children = await Trade.find({
      userId,
      groupId,
      isHistoryParent: { $ne: true }
    }).sort({ executedAt: 1 });
    res.json({ children: children.map(t => ({ ...t.toObject(), mode: t.mode })) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get individual entry legs for a netting position (all open + partial_close trades with same orderId)
app.get('/api/trades/legs/:userId/:orderId', async (req, res) => {
  try {
    const { userId, orderId } = req.params;
    const legs = await Trade.find({
      userId,
      oderId: orderId,
      type: { $in: ['open', 'partial_close', 'close'] },
      mode: 'netting'
    }).sort({ executedAt: 1 });
    res.json({ legs: legs.map(t => t.toObject()) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Close a single open netting Trade leg (Batch 2 / Phase 4).
// PnL uses the leg's own entry (decision D), wallet is settled, parent
// avgPrice is recomputed from remaining legs. If this is the last open leg,
// the parent position becomes status='closed'.
app.post('/api/positions/close-leg', async (req, res) => {
  try {
    const { userId, tradeId, currentPrice, closeReason } = req.body || {};
    if (!userId || !tradeId) {
      return res.status(400).json({ error: 'userId and tradeId are required' });
    }
    if (!(Number(currentPrice) > 0)) {
      return res.status(400).json({ error: 'currentPrice must be > 0' });
    }
    const result = await nettingEngine.closePositionLeg(
      userId,
      tradeId,
      Number(currentPrice),
      { closeReason: closeReason || 'user' }
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Resolve effective netting segment settings for a SYMBOL (Fix 14d).
// Used by the SL/TP modal hints to look up the limit-away band for any
// position regardless of which symbol is currently open in the order panel.
//
// Reuses the engine's existing `getSegmentSettingsForTrade` so the symbol →
// segment resolution stays in one place. Optional `exchange`, `segment`, and
// `instrumentType` query params disambiguate Indian futures/options (which
// can't be classified from symbol pattern alone).
//
// Returns `{ success: true, settings }` or `{ success: true, settings: null }`
// if no segment matched. Never 404 — the client treats null as
// "degrade hint to direction-only".
app.get('/api/user/segment-settings/by-symbol/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const userId = req.query.userId ? String(req.query.userId) : null;
    if (!userId) {
      return res.status(400).json({ error: 'userId query param is required' });
    }
    if (!symbol) {
      return res.status(400).json({ error: 'symbol path param is required' });
    }
    const exchange = req.query.exchange ? String(req.query.exchange) : null;
    const segment = req.query.segment ? String(req.query.segment) : null;
    const instrumentType = req.query.instrumentType ? String(req.query.instrumentType) : null;

    const settings = await nettingEngine.getSegmentSettingsForTrade(
      userId,
      symbol,
      exchange,
      segment,
      instrumentType
    );
    res.json({ success: true, settings: settings || null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update per-fill SL/TP on a single open netting Trade leg (Batch 2 / Phase 2).
// Only `type === 'open'` legs with no `closedAt` are mutable. The user must
// own the leg (matched via oderId === userOderId).
//
// SL/TP placement is validated (Fix 12): direction check + the segment's
// limit-away gap if configured.
app.put('/api/trades/legs/:tradeId', async (req, res) => {
  try {
    const { tradeId } = req.params;
    const { userId, stopLoss, takeProfit } = req.body || {};
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    // Look up by Mongo _id OR by tradeId field (we accept either for client convenience)
    const query = mongoose.Types.ObjectId.isValid(tradeId)
      ? { $or: [{ _id: tradeId }, { tradeId }] }
      : { tradeId };
    const leg = await Trade.findOne(query);
    if (!leg) return res.status(404).json({ error: 'Leg not found' });
    if (leg.userId !== userId) return res.status(403).json({ error: 'Not your leg' });
    if (leg.type !== 'open' || leg.closedAt) {
      return res.status(400).json({ error: `Leg is not open (type=${leg.type})` });
    }
    if (leg.mode !== 'netting') {
      return res.status(400).json({ error: 'Per-leg SL/TP only supported for netting fills' });
    }

    // Resolve a current/reference price + segment settings for validation.
    // Reference price priority: parent NettingPosition.currentPrice → leg.entryPrice.
    const { NettingPosition } = require('./models/Position');
    const parent = await NettingPosition.findOne({ oderId: leg.oderId, userId });
    const refPrice = parent && Number(parent.currentPrice) > 0
      ? Number(parent.currentPrice)
      : Number(leg.entryPrice) || 0;
    let segSettings = null;
    try {
      segSettings = await nettingEngine.getSegmentSettingsForTrade(
        userId,
        leg.symbol,
        leg.exchange,
        leg.segment,
        parent?.instrumentType
      );
    } catch (_) {
      // optional — direction check still runs without segment settings
    }
    // The "next" SL/TP after the proposed mutation (treat undefined as "leave alone").
    const proposedSL = stopLoss !== undefined ? (stopLoss === null ? null : Number(stopLoss)) : leg.stopLoss;
    const proposedTP = takeProfit !== undefined ? (takeProfit === null ? null : Number(takeProfit)) : leg.takeProfit;
    const sltpErr = nettingEngine.validateSLTPPlacement(leg.side, refPrice, proposedSL, proposedTP, segSettings);
    if (sltpErr) {
      return res.status(400).json({ error: sltpErr });
    }

    // Treat undefined as "leave alone"; explicit null clears the field.
    if (stopLoss !== undefined) leg.stopLoss = stopLoss === null ? null : Number(stopLoss);
    if (takeProfit !== undefined) leg.takeProfit = takeProfit === null ? null : Number(takeProfit);
    await leg.save();
    res.json({ success: true, leg: leg.toObject() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get pending orders (limit/stop orders not yet executed)
app.get('/api/orders/pending/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { HedgingPosition, NettingPosition } = require('./models/Position');
    
    // Fetch pending orders from both hedging and netting
    const hedgingPending = await HedgingPosition.find({ userId, status: 'pending' });
    const nettingPending = await NettingPosition.find({ userId, status: 'pending' });
    
    const allPendingOrders = [
      ...hedgingPending.map(o => ({ ...o.toObject(), mode: 'hedging' })),
      ...nettingPending.map(o => ({ ...o.toObject(), mode: 'netting' }))
    ];
    
    res.json({ orders: allPendingOrders });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get cancelled/rejected orders
app.get('/api/orders/cancelled/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const trades = await Trade.find({ userId, type: 'cancelled' }).sort({ executedAt: -1 }).limit(50);
    res.json({ orders: trades.map(t => ({ ...t.toObject(), mode: t.mode })) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== USER BANK ACCOUNTS MANAGEMENT ==============

// Get user's saved bank accounts
app.get('/api/user/bank-accounts/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOne({ 
      $or: [{ oderId: userId }, { _id: userId.match(/^[0-9a-fA-F]{24}$/) ? userId : null }]
    });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, bankAccounts: user.bankAccounts || [] });
  } catch (error) {
    console.error('Error fetching bank accounts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add a new bank account for user
app.post('/api/user/bank-accounts/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { bankName, accountNumber, ifsc, accountHolder, upiId } = req.body;
    
    if (!bankName || !accountNumber || !ifsc || !accountHolder) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }
    
    const user = await User.findOne({ 
      $or: [{ oderId: userId }, { _id: userId.match(/^[0-9a-fA-F]{24}$/) ? userId : null }]
    });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Initialize bankAccounts array if not exists
    if (!user.bankAccounts) {
      user.bankAccounts = [];
    }
    
    // Check for duplicate account number
    const exists = user.bankAccounts.find(b => b.accountNumber === accountNumber);
    if (exists) {
      return res.status(400).json({ success: false, error: 'This account number is already saved' });
    }
    
    // Add new bank account with optional UPI ID
    user.bankAccounts.push({
      _id: new mongoose.Types.ObjectId(),
      bankName,
      accountNumber,
      ifsc: ifsc.toUpperCase(),
      accountHolder,
      upiId: upiId || null,
      createdAt: new Date()
    });
    
    await user.save();
    res.json({ success: true, bankAccounts: user.bankAccounts, message: 'Bank account added successfully' });
  } catch (error) {
    console.error('Error adding bank account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a bank account
app.delete('/api/user/bank-accounts/:userId/:bankId', async (req, res) => {
  try {
    const { userId, bankId } = req.params;
    
    const user = await User.findOne({ 
      $or: [{ oderId: userId }, { _id: userId.match(/^[0-9a-fA-F]{24}$/) ? userId : null }]
    });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    if (!user.bankAccounts || user.bankAccounts.length === 0) {
      return res.status(404).json({ success: false, error: 'No bank accounts found' });
    }
    
    user.bankAccounts = user.bankAccounts.filter(b => b._id.toString() !== bankId);
    await user.save();
    
    res.json({ success: true, bankAccounts: user.bankAccounts, message: 'Bank account deleted' });
  } catch (error) {
    console.error('Error deleting bank account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== USER UPI ACCOUNTS MANAGEMENT ==============

// Get user's saved UPI accounts
app.get('/api/user/upi-accounts/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOne({ 
      $or: [{ oderId: userId }, { _id: userId.match(/^[0-9a-fA-F]{24}$/) ? userId : null }]
    });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, upiAccounts: user.upiAccounts || [] });
  } catch (error) {
    console.error('Error fetching UPI accounts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add a new UPI account for user
app.post('/api/user/upi-accounts/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { upiId, name } = req.body;
    
    if (!upiId || !name) {
      return res.status(400).json({ success: false, error: 'UPI ID and Name are required' });
    }
    
    const user = await User.findOne({ 
      $or: [{ oderId: userId }, { _id: userId.match(/^[0-9a-fA-F]{24}$/) ? userId : null }]
    });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    if (!user.upiAccounts) {
      user.upiAccounts = [];
    }
    
    const exists = user.upiAccounts.find(u => u.upiId === upiId);
    if (exists) {
      return res.status(400).json({ success: false, error: 'This UPI ID is already saved' });
    }
    
    user.upiAccounts.push({
      _id: new mongoose.Types.ObjectId(),
      upiId,
      name,
      createdAt: new Date()
    });
    
    await user.save();
    res.json({ success: true, upiAccounts: user.upiAccounts, message: 'UPI account added successfully' });
  } catch (error) {
    console.error('Error adding UPI account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a UPI account
app.delete('/api/user/upi-accounts/:userId/:upiId', async (req, res) => {
  try {
    const { userId, upiId } = req.params;
    
    const user = await User.findOne({ 
      $or: [{ oderId: userId }, { _id: userId.match(/^[0-9a-fA-F]{24}$/) ? userId : null }]
    });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    if (!user.upiAccounts || user.upiAccounts.length === 0) {
      return res.status(404).json({ success: false, error: 'No UPI accounts found' });
    }
    
    user.upiAccounts = user.upiAccounts.filter(u => u._id.toString() !== upiId);
    await user.save();
    
    res.json({ success: true, upiAccounts: user.upiAccounts, message: 'UPI account deleted' });
  } catch (error) {
    console.error('Error deleting UPI account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== WALLET MANAGEMENT ==============

// Get user wallet by userId (before wallet router to avoid conflict)
// A user's OWN trade-mode + currency-display permissions. User-accessible so
// the app can read it without an admin token — the client used to hit the
// admin-only /api/admin/users/:id here and got a 401 on every challenge/app page.
app.get('/api/user/trade-permissions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOne({
      $or: [{ oderId: userId }, { _id: userId.match(/^[0-9a-fA-F]{24}$/) ? userId : null }]
    }).select('allowedTradeModes allowedCurrencyDisplay');
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({
      success: true,
      allowedTradeModes: user.allowedTradeModes || { hedging: false, netting: true, binary: false },
      allowedCurrencyDisplay: user.allowedCurrencyDisplay || 'BOTH'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/user/wallet/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({
      $or: [{ oderId: userId }, { _id: userId.match(/^[0-9a-fA-F]{24}$/) ? userId : null }]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Calculate live margin from active positions for accurate freeMargin
    const userIdStr = user._id.toString();
    const userOderId = user.oderId;
    const [hedgingPositions, nettingPositions] = await Promise.all([
      HedgingPosition.find({ userId: userIdStr, status: 'open' }).lean(),
      NettingPosition.find({ oderId: userOderId, status: 'open' }).lean()
    ]);

    let liveMargin = 0;
    for (const pos of hedgingPositions) {
      liveMargin += Number(pos.marginUsed || pos.margin || 0);
    }
    for (const pos of nettingPositions) {
      liveMargin += Number(pos.marginUsed || pos.margin || 0);
    }

    const balance = Number(user.wallet.balance) || 0;
    const credit = Number(user.wallet.credit) || 0;
    const equity = balance + credit;
    const liveFreeMargin = Math.max(0, equity - liveMargin);

    const wallet = {
      ...user.wallet.toObject ? user.wallet.toObject() : { ...user.wallet },
      creditInr: credit,
      margin: liveMargin,
      equity,
      freeMargin: liveFreeMargin,
      marginLevel: liveMargin > 0 ? (equity / liveMargin) * 100 : 0,
    };

    res.json({
      success: true,
      wallet,
      stats: user.stats,
      walletINR: user.walletINR || { balance: 0, totalDeposits: 0, totalWithdrawals: 0 }
    });
  } catch (error) {
    console.error('Error fetching user wallet:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user wallet (legacy endpoint)
app.get('/api/wallet/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({
      $or: [{ oderId: userId }, { _id: userId.match(/^[0-9a-fA-F]{24}$/) ? userId : null }]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found. Please register for an account.' });
    }

    res.json({ wallet: user.wallet, stats: user.stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user wallet (admin deposit/withdrawal)
app.post('/api/wallet/:userId/update', async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, type, description } = req.body; // type: 'deposit' or 'withdrawal'

    let user = await User.findOne({ oderId: userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (type === 'deposit') {
      user.wallet.balance += amount;
    } else if (type === 'withdrawal') {
      if (user.wallet.balance < amount) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }
      user.wallet.balance -= amount;
    }

    user.wallet.equity = user.wallet.balance + user.wallet.credit;
    user.wallet.freeMargin = user.wallet.equity - user.wallet.margin;
    await user.save();

    res.json({ success: true, wallet: user.wallet });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset user wallet to default balance (admin only)
app.post('/api/wallet/:userId/reset', async (req, res) => {
  try {
    const { userId } = req.params;
    const { balance = 10000 } = req.body; // Default reset balance

    let user = await User.findOne({ oderId: userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Reset wallet to specified balance
    user.wallet = {
      balance: balance,
      credit: 0,
      equity: balance,
      margin: 0,
      freeMargin: balance,
      marginLevel: 0
    };
    await user.save();

    // Also close all open positions for this user to prevent further issues
    const { NettingPosition, HedgingPosition } = require('./models/Position');
    await NettingPosition.updateMany(
      { userId, status: 'open' },
      { status: 'closed', closeTime: new Date(), profit: 0 }
    );
    await HedgingPosition.updateMany(
      { oderId: userId, status: 'open' },
      { status: 'closed', closeTime: new Date(), profit: 0 }
    );

    res.json({ 
      success: true, 
      wallet: user.wallet,
      message: `Wallet reset to $${balance}. All open positions closed.`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== TRANSACTION MANAGEMENT ==============

// Get user transactions
app.get('/api/transactions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { type, status } = req.query;

    const query = { oderId: userId };
    if (type) query.type = type;
    if (status) query.status = status;

    const transactions = await Transaction.find(query).sort({ createdAt: -1 });
    res.json({ transactions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generic create transaction (used by user wallet page)
app.post('/api/transactions', async (req, res) => {
  try {
    const { oderId, userId, userName, type, amount, method, proofImage, withdrawalInfo } = req.body;
    
    const userOderId = oderId || userId;
    if (!userOderId || !amount || !type) {
      return res.status(400).json({ error: 'oderId, amount, and type are required' });
    }

    // For withdrawals, calculate LIVE free margin from active positions
    if (type === 'withdrawal') {
      const user = await User.findOne({ oderId: userOderId });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Calculate live margin used from all active positions
      const userIdStr = user._id.toString();
      const [hedgingPositions, nettingPositions] = await Promise.all([
        HedgingPosition.find({ userId: userIdStr, status: 'open' }).lean(),
        NettingPosition.find({ oderId: userOderId, status: 'open' }).lean()
      ]);

      let totalMarginUsed = 0;
      for (const pos of hedgingPositions) {
        totalMarginUsed += Number(pos.marginUsed || pos.margin || 0);
      }
      for (const pos of nettingPositions) {
        totalMarginUsed += Number(pos.marginUsed || pos.margin || 0);
      }

      const balance = Number(user.wallet.balance) || 0;
      const credit = Number(user.wallet.credit) || 0;
      const liveFreeMargin = Math.max(0, balance + credit - totalMarginUsed);

      if (amount > liveFreeMargin) {
        return res.status(400).json({
          error: `Insufficient free margin. Available: ₹${liveFreeMargin.toFixed(2)}${totalMarginUsed > 0 ? ` (Margin in use: ₹${totalMarginUsed.toFixed(2)})` : ''}`
        });
      }
    }

    // Map method to valid paymentMethod enum value
    let paymentMethodValue = 'bank_transfer';
    if (method) {
      // Check if method is already a valid enum value
      const validMethods = ['bank_transfer', 'upi', 'crypto', 'card', 'wallet', 'admin_transfer'];
      if (validMethods.includes(method)) {
        paymentMethodValue = method;
      } else if (withdrawalInfo?.method) {
        // For withdrawals, use the method from withdrawalInfo
        const methodMap = { 'bank': 'bank_transfer', 'upi': 'upi', 'crypto': 'crypto' };
        paymentMethodValue = methodMap[withdrawalInfo.method] || 'bank_transfer';
      }
      // If method is an ObjectId (payment method ID), we keep default 'bank_transfer'
      // The actual payment details are stored in paymentDetails or withdrawalInfo
    }

    const transaction = new Transaction({
      oderId: userOderId,
      userName: userName || '',
      type,
      amount,
      currency: 'INR',
      paymentMethod: paymentMethodValue,
      proofImage: proofImage || '',
      withdrawalInfo: withdrawalInfo || null,
      status: 'pending'
    });

    await transaction.save();

    // Log activity
    const user = await User.findOne({ oderId: userOderId });
    if (user) {
      await UserActivityLog.logActivity({
        userId: user._id.toString(),
        oderId: userOderId,
        activityType: type === 'deposit' ? 'deposit_request' : 'withdrawal_request',
        description: `${type === 'deposit' ? 'Deposit' : 'Withdrawal'} request of ₹${amount}`,
        metadata: { transactionId: transaction._id, amount, method },
        ipAddress: req.ip,
        status: 'success'
      });
    }

    // Fire-and-forget admin notification — don't block the user response.
    try {
      const emailService = require('./services/email.service');
      const isDeposit = type === 'deposit';
      const wd = withdrawalInfo || {};
      const wdBank = wd.bankDetails || {};
      const wdCrypto = wd.cryptoDetails || {};
      emailService.sendAdminNotification({
        type: isDeposit ? 'user_deposit' : 'user_withdrawal',
        title: `${isDeposit ? 'New deposit' : 'New withdrawal'} request from ${user?.name || userOderId}`,
        subtitle: `₹${Number(amount).toLocaleString('en-IN')} · ${paymentMethodValue} · pending your approval`,
        user: user ? { name: user.name, oderId: user.oderId, email: user.email, phone: user.phone } : { oderId: userOderId, name: userName },
        fields: [
          { label: 'Amount', value: `₹${Number(amount).toLocaleString('en-IN')}` },
          { label: 'Method', value: paymentMethodValue },
          isDeposit && proofImage && { label: 'Proof', value: 'Screenshot attached (open admin panel)' },
          !isDeposit && wd.method && { label: 'Withdraw to', value: String(wd.method).toUpperCase() },
          !isDeposit && wdBank.bankName && { label: 'Bank', value: wdBank.bankName },
          !isDeposit && wdBank.accountNumber && { label: 'Account', value: `****${String(wdBank.accountNumber).slice(-4)}` },
          !isDeposit && wdBank.ifsc && { label: 'IFSC', value: wdBank.ifsc },
          !isDeposit && wdBank.accountHolder && { label: 'Holder', value: wdBank.accountHolder },
          !isDeposit && wdBank.upiId && { label: 'UPI', value: wdBank.upiId },
          !isDeposit && wdCrypto.network && { label: 'Network', value: wdCrypto.network },
          !isDeposit && wdCrypto.address && { label: 'Wallet', value: wdCrypto.address }
        ].filter(Boolean),
        actionUrl: `${process.env.ADMIN_URL || 'https://admin.dhanfunded.com'}/admin/funds`,
        actionLabel: 'Review & Approve'
      }).catch(() => {});
    } catch (_) { /* notification is best-effort */ }

    res.json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Legacy endpoint retained to avoid breaking older clients still polling it;
// the platform is INR-only now so the rate is always 1.
app.get('/api/exchange-rate', async (req, res) => {
  res.json({
    success: true,
    rates: { USD_TO_INR: 1, INR_TO_USD: 1 },
    USD_TO_INR: 1,
    INR_TO_USD: 1,
    usdMarkup: 0,
    effectiveRate: 1,
    source: 'inr-only',
  });
});

app.post('/api/transactions/deposit', async (req, res) => {
  try {
    const { userId, amount, paymentMethod, paymentDetails, proofImage, userNote } = req.body;

    if (!userId || !amount || !paymentMethod) {
      return res.status(400).json({ error: 'userId, amount, and paymentMethod are required' });
    }

    const user = await User.findOne({ oderId: userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const transaction = new Transaction({
      oderId: userId,
      type: 'deposit',
      amount,
      currency: 'INR',
      paymentMethod,
      paymentDetails: paymentDetails || {},
      proofImage: proofImage || '',
      userNote: userNote || '',
      status: 'pending'
    });

    await transaction.save();

    await UserActivityLog.logActivity({
      userId: user._id.toString(),
      oderId: userId,
      activityType: 'deposit_request',
      description: `Deposit request of ₹${amount} via ${paymentMethod}`,
      metadata: { transactionId: transaction._id, amount, currency: 'INR', paymentMethod },
      ipAddress: req.ip,
      status: 'success'
    });

    res.json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/transactions/withdraw', async (req, res) => {
  try {
    const { userId, amount, paymentMethod, paymentDetails, userNote } = req.body;

    if (!userId || !amount || !paymentMethod) {
      return res.status(400).json({ error: 'userId, amount, and paymentMethod are required' });
    }

    const user = await User.findOne({ oderId: userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const availableBalance = user.walletINR?.balance || user.wallet?.freeMargin || 0;
    if (availableBalance < amount) {
      return res.status(400).json({ error: `Insufficient balance. Available: ₹${availableBalance}` });
    }

    const transaction = new Transaction({
      oderId: userId,
      type: 'withdrawal',
      amount,
      currency: 'INR',
      paymentMethod,
      paymentDetails: paymentDetails || {},
      userNote: userNote || '',
      status: 'pending'
    });

    await transaction.save();

    await UserActivityLog.logActivity({
      userId: user._id.toString(),
      oderId: userId,
      activityType: 'withdrawal_request',
      description: `Withdrawal request of ₹${amount} via ${paymentMethod}`,
      metadata: { transactionId: transaction._id, amount, currency: 'INR', paymentMethod },
      ipAddress: req.ip,
      status: 'success'
    });

    res.json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get all transactions (enhanced with pagination, search, date range)
app.get('/api/admin/transactions', async (req, res) => {
  try {
    const { type, status, limit = 50, page = 1, search, paymentMethod, dateFrom, dateTo, includeAdminRequests } = req.query;

    const query = {};
    if (type) query.type = type;
    if (status) query.status = status;
    if (paymentMethod) query.paymentMethod = paymentMethod;
    if (search) query.oderId = { $regex: search, $options: 'i' };
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
    }
    
    // By default, exclude admin_fund_request type unless specifically requested
    // This ensures user deposit/withdrawal requests are shown
    if (!includeAdminRequests && !type) {
      query.type = { $in: ['deposit', 'withdrawal'] };
    }

    // Paginated rows — EXCLUDE proofImage (base64 screenshots, often 200KB+
    // per row). The list view never renders it; admin clicks into a single
    // row to see the screenshot via a separate detail endpoint. Sending the
    // full base64 here was making the response 10-20MB per page load.
    const [total, transactions] = await Promise.all([
      Transaction.countDocuments(query),
      Transaction.find(query)
        .select('-proofImage')
        .sort({ createdAt: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit))
        .lean()
    ]);

    // Enrich transactions with user's parent hierarchy info + contact phone
    const userIds = [...new Set(transactions.map(t => t.oderId))];
    const users = await User.find({ oderId: { $in: userIds } })
      .select('oderId phone email parentAdminId parentAdminOderId')
      .populate('parentAdminId', 'name oderId role')
      .lean();

    const userMap = {};
    users.forEach(u => {
      userMap[u.oderId] = u;
    });

    transactions.forEach(tx => {
      const user = userMap[tx.oderId];
      // Attach the buyer's phone/email so the admin deposit list can show the
      // mobile number inline without a second lookup.
      tx.userPhone = user?.phone || '';
      tx.userEmail = user?.email || '';
      if (user && user.parentAdminId) {
        tx.parentType = user.parentAdminId.role === 'broker' ? 'BROKER' :
                        user.parentAdminId.role === 'subadmin' ? 'SUBADMIN' : 'ADMIN';
        tx.parentName = user.parentAdminId.name || user.parentAdminOderId || 'Unknown';
        tx.parentOderId = user.parentAdminId.oderId || user.parentAdminOderId;
      } else {
        tx.parentType = 'ADMIN';
        tx.parentName = 'Superadmin';
        tx.parentOderId = null;
      }
    });

    // Summary stats via aggregation pipeline — runs entirely inside Mongo,
    // no docs streamed to Node. Replaces the old "fetch ALL matching
    // transactions with proofImage" pattern that was reading 10MB+ per
    // page load and making the page hang.
    const summaryAgg = await Transaction.aggregate([
      { $match: query },
      { $group: {
        _id: { type: '$type', status: '$status' },
        count: { $sum: 1 },
        sum: { $sum: { $ifNull: ['$amount', 0] } }
      } }
    ]);

    const isApproved = (s) => s === 'approved' || s === 'completed';
    const isPending = (s) => s === 'pending' || s === 'processing';

    let totalDeposits = 0, totalWithdrawals = 0, totalDepositsApproved = 0, totalWithdrawalsApproved = 0;
    let depositCount = 0, withdrawalCount = 0, pendingCount = 0, approvedCount = 0, rejectedCount = 0;
    let pendingAmount = 0, pendingRequestsCount = 0, totalCount = 0;

    for (const row of summaryAgg) {
      const { type, status } = row._id || {};
      const cnt = Number(row.count) || 0;
      const amt = Number(row.sum) || 0;
      totalCount += cnt;
      if (type === 'deposit') {
        totalDeposits += amt;
        depositCount += cnt;
        if (isApproved(status)) totalDepositsApproved += amt;
      } else if (type === 'withdrawal') {
        totalWithdrawals += amt;
        withdrawalCount += cnt;
        if (isApproved(status)) totalWithdrawalsApproved += amt;
      }
      if (status === 'pending') pendingCount += cnt;
      if (isApproved(status)) approvedCount += cnt;
      if (status === 'rejected') rejectedCount += cnt;
      if (isPending(status)) { pendingRequestsCount += cnt; pendingAmount += amt; }
    }

    const summary = {
      total: totalCount,
      totalDeposits,
      totalWithdrawals,
      totalDepositsApproved,
      totalWithdrawalsApproved,
      netBalance: totalDepositsApproved - totalWithdrawalsApproved,
      pendingRequestsCount,
      depositCount,
      withdrawalCount,
      pendingCount,
      approvedCount,
      rejectedCount,
      pendingAmount
    };

    res.json({
      success: true,
      transactions,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
      summary
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Reconciliation data
app.get('/api/admin/transactions/reconciliation', async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const query = {};
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
    }

    const allTx = await Transaction.find(query).sort({ createdAt: -1 });

    // Overall stats
    const deposits = allTx.filter(t => t.type === 'deposit');
    const withdrawals = allTx.filter(t => t.type === 'withdrawal');
    const approvedDeposits = deposits.filter(t => t.status === 'approved' || t.status === 'completed');
    const approvedWithdrawals = withdrawals.filter(t => t.status === 'approved' || t.status === 'completed');
    const pendingTx = allTx.filter(t => t.status === 'pending');

    const totalDepositsApproved = approvedDeposits.reduce((s, t) => s + t.amount, 0);
    const totalWithdrawalsApproved = approvedWithdrawals.reduce((s, t) => s + t.amount, 0);
    const totalPending = pendingTx.reduce((s, t) => s + t.amount, 0);

    // Daily breakdown
    const dailyMap = {};
    allTx.forEach(t => {
      const day = new Date(t.createdAt).toISOString().split('T')[0];
      if (!dailyMap[day]) dailyMap[day] = { date: day, deposits: 0, withdrawals: 0, depositCount: 0, withdrawalCount: 0, pending: 0 };
      if (t.type === 'deposit') { dailyMap[day].deposits += t.amount; dailyMap[day].depositCount++; }
      else { dailyMap[day].withdrawals += t.amount; dailyMap[day].withdrawalCount++; }
      if (t.status === 'pending') dailyMap[day].pending += t.amount;
    });
    const dailyBreakdown = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

    // By payment method
    const methodMap = {};
    allTx.forEach(t => {
      if (!methodMap[t.paymentMethod]) methodMap[t.paymentMethod] = { method: t.paymentMethod, count: 0, amount: 0 };
      methodMap[t.paymentMethod].count++;
      methodMap[t.paymentMethod].amount += t.amount;
    });
    const byMethod = Object.values(methodMap).sort((a, b) => b.count - a.count);

    // Status distribution
    const statusMap = {};
    allTx.forEach(t => {
      if (!statusMap[t.status]) statusMap[t.status] = { status: t.status, count: 0, amount: 0 };
      statusMap[t.status].count++;
      statusMap[t.status].amount += t.amount;
    });
    const statusDistribution = Object.values(statusMap);

    res.json({
      success: true,
      summary: {
        totalTransactions: allTx.length,
        totalDepositsApproved,
        totalWithdrawalsApproved,
        netFlow: totalDepositsApproved - totalWithdrawalsApproved,
        totalPending,
        pendingCount: pendingTx.length
      },
      dailyBreakdown,
      byMethod,
      statusDistribution
    });
  } catch (error) {
    console.error('Error fetching reconciliation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: bulk-delete transactions by id (Deposits multi-select).
app.post('/api/admin/transactions/bulk-delete', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
    if (ids.length === 0) return res.status(400).json({ success: false, error: 'No transaction ids provided' });
    const result = await Transaction.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Process transaction (approve/reject)
app.put('/api/admin/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNote, rejectionReason, processedBy } = req.body;

    const transaction = await Transaction.findById(id);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Scope guard (Phase 10): if the caller is a sub_admin / broker / bank_user,
    // make sure the transaction's user is inside their scope. Super-admin is
    // unrestricted. Silently no-op on resolution errors so we never break the
    // existing super-admin path.
    try {
      const { resolveAdminFromRequest, getScopedUserIds } = require('./middleware/adminPermission');
      const caller = await resolveAdminFromRequest(req);
      if (caller && caller.role !== 'super_admin') {
        const scoped = await getScopedUserIds(caller);
        if (scoped !== null) {
          // bank_user returns null → unrestricted for this action
          const txUser = await User.findOne({ oderId: transaction.oderId }).select('_id').lean();
          const txUserId = String(txUser?._id || '');
          if (!txUserId || !scoped.map(String).includes(txUserId)) {
            return res.status(403).json({ success: false, error: 'Transaction user not in your scope' });
          }
        }
      }
    } catch (scopeErr) {
      console.warn('[PUT /transactions/:id] scope check skipped:', scopeErr.message);
    }

    // ── Challenge purchase branch ──────────────────────────────────────
    // Challenge buys are exposed in the same Deposits queue but live in
    // their own collection-of-truth (the linked ChallengeAccount). The
    // wallet must NOT be touched on approval — instead the challenge
    // account is activated. Delegate to the dedicated approval service
    // which also handles coupon redemption finalisation.
    if (transaction.type === 'challenge_purchase') {
      const challengeApprovalService = require('./services/challengeApproval.service');
      try {
        if (status === 'approved' || status === 'completed') {
          const result = await challengeApprovalService.approveChallengeBuy(transaction._id, processedBy || 'admin');
          return res.json({ success: true, transaction: result.transaction, account: result.account });
        }
        if (status === 'rejected') {
          const result = await challengeApprovalService.rejectChallengeBuy(transaction._id, processedBy || 'admin', rejectionReason || '');
          return res.json({ success: true, transaction: result.transaction });
        }
        return res.status(400).json({ success: false, error: `Unsupported status '${status}' for challenge purchase` });
      } catch (e) {
        return res.status(400).json({ success: false, error: e.message });
      }
    }

    // ── Challenge RESET / RESTART branch ───────────────────────────────
    // Paid retry of a FAILED account, surfaced in the same Deposits queue.
    // Approving wipes all trades and restarts the account fresh; the wallet
    // is never touched. Same logic as the dedicated Challenge Resets tab.
    if (transaction.type === 'challenge_reset') {
      const ChallengeAccount = require('./models/ChallengeAccount');
      const { resetChallengeAccountFresh } = require('./services/challengeReset.service');
      try {
        if (status === 'approved' || status === 'completed') {
          const account = await ChallengeAccount.findById(transaction.challengePurchaseInfo?.challengeAccountId).populate('challengeId');
          if (!account) return res.status(404).json({ success: false, error: 'Linked challenge account not found' });
          await resetChallengeAccountFresh(account, account.challengeId);
          transaction.status = 'approved';
          transaction.processedBy = processedBy || 'admin';
          transaction.processedAt = new Date();
          await transaction.save();
          return res.json({ success: true, transaction, account: { accountId: account.accountId } });
        }
        if (status === 'rejected') {
          transaction.status = 'rejected';
          transaction.rejectionReason = rejectionReason || '';
          transaction.processedBy = processedBy || 'admin';
          transaction.processedAt = new Date();
          await transaction.save();
          return res.json({ success: true, transaction });
        }
        return res.status(400).json({ success: false, error: `Unsupported status '${status}' for challenge reset` });
      } catch (e) {
        return res.status(400).json({ success: false, error: e.message });
      }
    }

    // Update transaction
    transaction.status = status;
    transaction.adminNote = adminNote || '';
    transaction.rejectionReason = rejectionReason || '';
    transaction.processedBy = processedBy || 'admin';
    transaction.processedAt = new Date();

    // Find user for wallet update and activity logging.
    // Prop payout transactions store the MongoDB _id as oderId (via
    // ChallengeAccount.userId); regular transactions use the display oderId.
    // Try both lookups so both cases work.
    let user = await User.findOne({ oderId: transaction.oderId });
    if (!user && transaction.oderId) {
      user = await User.findById(transaction.oderId).catch(() => null);
    }

    // ── IB-source withdrawal branch ────────────────────────────────────
    // IB earnings live in a separate Wallet doc (type='ib') and the IB
    // record's wallet sub-doc — they must NOT touch user.walletINR.
    // When the request was created, the amount was frozen on the IB
    // wallet; we either drain it (approve) or release it (reject).
    if (transaction.source === 'ib' && transaction.type === 'withdrawal') {
      const Wallet = require('./models/Wallet');
      const IB = require('./models/IB');
      const amount = transaction.amount;

      if (status === 'approved' || status === 'completed') {
        if (user) {
          const ibWallet = await Wallet.findOne({ userId: user._id, type: 'ib' });
          if (ibWallet) {
            ibWallet.frozenBalance = Math.max(0, (ibWallet.frozenBalance || 0) - amount);
            ibWallet.pendingWithdrawal = Math.max(0, (ibWallet.pendingWithdrawal || 0) - amount);
            ibWallet.balance = Math.max(0, (ibWallet.balance || 0) - amount);
            ibWallet.totalWithdrawn = (ibWallet.totalWithdrawn || 0) + amount;
            ibWallet.lastTransactionAt = new Date();
            await ibWallet.save();
          }
          const ib = await IB.findOne({ userId: user._id });
          if (ib) {
            ib.wallet.balance = Math.max(0, (ib.wallet.balance || 0) - amount);
            ib.wallet.pendingWithdrawal = Math.max(0, (ib.wallet.pendingWithdrawal || 0) - amount);
            ib.wallet.totalWithdrawn = (ib.wallet.totalWithdrawn || 0) + amount;
            await ib.save();
          }
        }
      } else if (status === 'rejected') {
        // Release the frozen funds back so the IB can request again.
        if (user) {
          const ibWallet = await Wallet.findOne({ userId: user._id, type: 'ib' });
          if (ibWallet) {
            ibWallet.frozenBalance = Math.max(0, (ibWallet.frozenBalance || 0) - amount);
            ibWallet.pendingWithdrawal = Math.max(0, (ibWallet.pendingWithdrawal || 0) - amount);
            await ibWallet.save();
          }
          const ib = await IB.findOne({ userId: user._id });
          if (ib) {
            ib.wallet.pendingWithdrawal = Math.max(0, (ib.wallet.pendingWithdrawal || 0) - amount);
            await ib.save();
          }
        }
      }
      // Skip the main-wallet branch below; the IB flow is self-contained.
      await transaction.save();
      return res.json({ success: true, transaction });
    }

    if (status === 'approved' || status === 'completed') {
      if (user) {
        const amount = transaction.amount;

        if (!user.walletINR) user.walletINR = { balance: 0, totalDeposits: 0, totalWithdrawals: 0 };

        if (transaction.type === 'deposit') {
          user.walletINR.balance += amount;
          user.walletINR.totalDeposits += amount;
          user.wallet.balance += amount;

          try {
            const isFirstDeposit = !user.firstDepositAt;
            if (isFirstDeposit) {
              user.firstDepositAt = new Date();
            }
            const { maybeGrantDepositBonus } = require('./services/bonusAutoTrigger.service');
            const autoBonus = await maybeGrantDepositBonus(user, amount, isFirstDeposit, 1);
            if (autoBonus) {
              transaction.bonusAmount = autoBonus.amount;
              transaction.bonusTemplateName = autoBonus.templateName || '';
              console.log(`[BonusAutoTrigger] Approved deposit ${transaction._id} → granted ₹${autoBonus.amount.toFixed(2)} ${autoBonus.type} bonus to ${user.oderId}`);
            }
          } catch (bonusErr) {
            console.error('[BonusAutoTrigger] Failed on deposit approval:', bonusErr.message);
          }
        } else if (transaction.type === 'withdrawal') {
          // ── Prop payout branch ────────────────────────────────────────
          // If this is a prop_payout withdrawal, reset the challenge
          // account wallet instead of touching the user's main wallet.
          const isPropPayout = transaction.paymentDetails?.kind === 'prop_payout' ||
            !!transaction.paymentDetails?.challengeAccountId ||
            !!transaction.paymentDetails?.challengeAccountCode;
          console.log('[PropPayout Check]', { isPropPayout, kind: transaction.paymentDetails?.kind, challengeAccountId: transaction.paymentDetails?.challengeAccountId, txId: transaction._id });
          if (isPropPayout) {
            const ChallengeAccount = require('./models/ChallengeAccount');
            let chAccId = transaction.paymentDetails?.challengeAccountId;
            if (!chAccId) {
              // Try finding the challenge account by userId. Since userId is an ObjectId
              // and transaction.oderId might be either ObjectId-string or display-ID,
              // try both: first direct match, then look up user by display oderId.
              let fallback = await ChallengeAccount.findOne({ userId: transaction.oderId, status: 'FUNDED' });
              if (!fallback && user) {
                fallback = await ChallengeAccount.findOne({ userId: user._id, status: 'FUNDED' });
              }
              console.log('[PropPayout] Fallback lookup:', { txOderId: transaction.oderId, userId: user?._id, found: !!fallback });
              if (fallback) chAccId = String(fallback._id);
            }
            console.log('[PropPayout] chAccId:', chAccId);
            if (chAccId) {
              const chAcc = await ChallengeAccount.findById(chAccId);
              if (chAcc) {
                const initial = Number(chAcc.initialBalance) || 0;
                console.log('[PropPayout] Resetting wallet. Before:', { walletBalance: chAcc.walletBalance, initial, totalWithdrawn: chAcc.totalWithdrawn });
                chAcc.walletBalance = initial;
                chAcc.walletEquity = initial;
                chAcc.walletMargin = 0;
                chAcc.walletFreeMargin = initial;
                chAcc.walletMarginLevel = 0;
                chAcc.currentBalance = initial;
                chAcc.currentEquity = initial;
                chAcc.phaseStartBalance = initial;
                chAcc.totalWithdrawn = (Number(chAcc.totalWithdrawn) || 0) + amount;
                chAcc.lastWithdrawalDate = new Date();
                await chAcc.save();
                console.log('[PropPayout] Wallet reset SUCCESS. After:', { walletBalance: chAcc.walletBalance, totalWithdrawn: chAcc.totalWithdrawn });
              } else {
                console.log('[PropPayout] ERROR: ChallengeAccount not found by ID:', chAccId);
              }
            } else {
              console.log('[PropPayout] ERROR: No chAccId found for oderId:', transaction.oderId);
            }
            // Auto-reject duplicate pending prop payouts from same user
            await Transaction.updateMany(
              { _id: { $ne: transaction._id }, oderId: transaction.oderId, type: 'withdrawal', status: 'pending', 'paymentDetails.kind': 'prop_payout' },
              { $set: { status: 'rejected', rejectionReason: 'Auto-rejected: duplicate (another payout approved)', processedBy: 'system', processedAt: new Date() } }
            );
          } else {
            if (user.walletINR.balance < amount) {
              return res.status(400).json({ error: 'Insufficient balance for withdrawal' });
            }
            user.walletINR.balance -= amount;
            user.walletINR.totalWithdrawals += amount;
            if (user.wallet.balance >= amount) {
              user.wallet.balance -= amount;
            } else {
              return res.status(400).json({ error: 'Insufficient balance for withdrawal' });
            }
          }
        }
        user.wallet.equity = user.wallet.balance + user.wallet.credit;
        user.wallet.freeMargin = user.wallet.equity - user.wallet.margin;
        await user.save();
      }
    }

    await transaction.save();

    // Log activity for deposit/withdrawal approval or rejection
    if (user) {
      const isApproved = status === 'approved' || status === 'completed';
      const isRejected = status === 'rejected';
      
      if (isApproved || isRejected) {
        const activityType = transaction.type === 'deposit' 
          ? (isApproved ? 'deposit_approved' : 'deposit_rejected')
          : (isApproved ? 'withdrawal_approved' : 'withdrawal_rejected');
        
        const description = isApproved
          ? `${transaction.type === 'deposit' ? 'Deposit' : 'Withdrawal'} of ₹${transaction.amount} approved`
          : `${transaction.type === 'deposit' ? 'Deposit' : 'Withdrawal'} of ₹${transaction.amount} rejected${rejectionReason ? ': ' + rejectionReason : ''}`;
        
        await UserActivityLog.logActivity({
          userId: user._id.toString(),
          oderId: transaction.oderId,
          activityType,
          description,
          metadata: {
            transactionId: transaction._id,
            amount: transaction.amount,
            status,
            adminNote: adminNote || '',
            rejectionReason: rejectionReason || ''
          },
          ipAddress: req.ip,
          status: isApproved ? 'success' : 'failed'
        });

        // Also log to AdminActivityLog so it shows in admin Activity Logs page
        logAdminSettingsChange({
          req,
          activityType,
          description: `${description} (User: ${transaction.oderId})`,
          metadata: { transactionId: transaction._id, userId: transaction.oderId, amount: transaction.amount, currency: transaction.currency, status }
        });
      }
    }

    res.json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== PAYMENT METHODS ==============

// Get active payment methods (for users)
app.get('/api/payment-methods', async (req, res) => {
  try {
    const { type } = req.query; // 'deposit' or 'withdrawal'

    const query = { isActive: true };
    if (type === 'deposit') query.allowDeposit = true;
    if (type === 'withdrawal') query.allowWithdraw = true;

    const methods = await PaymentMethod.find(query).sort({ displayOrder: 1 });
    res.json({ methods });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get all payment methods
app.get('/api/admin/payment-methods', async (req, res) => {
  try {
    const methods = await PaymentMethod.find({}).sort({ displayOrder: 1 });
    res.json({ methods });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Create payment method
app.post('/api/admin/payment-methods', async (req, res) => {
  try {
    const method = new PaymentMethod(req.body);
    await method.save();
    res.json({ success: true, method });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Update payment method
app.put('/api/admin/payment-methods/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const method = await PaymentMethod.findByIdAndUpdate(id, req.body, { new: true });
    if (!method) {
      return res.status(404).json({ error: 'Payment method not found' });
    }
    res.json({ success: true, method });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Delete payment method
app.delete('/api/admin/payment-methods/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await PaymentMethod.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== ADMIN PAYMENT DETAILS (Bank Accounts, UPI, Crypto) ==============

// Get payment details for a user based on their parent admin hierarchy
// Users see their broker's payment details, or subadmin's, or superadmin's (fallback)
app.get('/api/admin-payment-details', async (req, res) => {
  try {
    // Default: get SuperAdmin payment details (adminId = null)
    const details = await AdminPaymentDetail.find({ isActive: true, adminId: null }).sort({ createdAt: -1 });
    const bankAccounts = details.filter(d => d.type === 'bank');
    const upiIds = details.filter(d => d.type === 'upi');
    const cryptoWallets = details.filter(d => d.type === 'crypto');
    res.json({ success: true, bankAccounts, upiIds, cryptoWallets });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get payment details for a specific user based on their parent admin
app.get('/api/admin-payment-details/for-user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Check if userId is a valid ObjectId
    const isObjectId = mongoose.Types.ObjectId.isValid(userId) && String(new mongoose.Types.ObjectId(userId)) === userId;
    
    let user;
    if (isObjectId) {
      user = await User.findById(userId);
    }
    if (!user) {
      user = await User.findOne({ oderId: userId });
    }
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Check if user has a parent admin (broker or subadmin)
    let adminId = user.parentAdminId || null;
    let details = [];
    let useParentDetails = false;
    
    // Try to get payment details from parent admin hierarchy
    if (adminId) {
      const parentAdmin = await Admin.findById(adminId);
      
      // Check if parent admin has permission to show their bank details to users
      // viewUserBankDetails controls whether users see this admin's bank details or super admin's
      // If viewUserBankDetails is explicitly set to false, users should see super admin's bank details instead
      // For backward compatibility: if permission is undefined, check if admin has any payment details set up
      const permissionValue = parentAdmin?.permissions?.viewUserBankDetails;
      const hasPermission = permissionValue === true || (permissionValue === undefined && parentAdmin?.role === 'sub_admin');
      
      console.log(`[Payment Details] User: ${userId}, Parent Admin: ${parentAdmin?.oderId}, Role: ${parentAdmin?.role}, viewUserBankDetails: ${parentAdmin?.permissions?.viewUserBankDetails}, hasPermission: ${hasPermission}`);
      
      if (hasPermission) {
        details = await AdminPaymentDetail.find({ isActive: true, adminId }).sort({ createdAt: -1 });
        console.log(`[Payment Details] Found ${details.length} payment details for admin ${parentAdmin?.oderId}`);
        
        // If no details found for this admin, check parent's parent (broker -> subadmin -> superadmin)
        if (details.length === 0 && parentAdmin && parentAdmin.parentId) {
          // Check parent's parent permission too
          const grandParentAdmin = await Admin.findById(parentAdmin.parentId);
          const grandParentPermissionValue = grandParentAdmin?.permissions?.viewUserBankDetails;
          const grandParentHasPermission = grandParentPermissionValue === true || (grandParentPermissionValue === undefined && grandParentAdmin?.role === 'sub_admin');
          
          console.log(`[Payment Details] Checking grandparent: ${grandParentAdmin?.oderId}, hasPermission: ${grandParentHasPermission}`);
          
          if (grandParentHasPermission) {
            details = await AdminPaymentDetail.find({ isActive: true, adminId: parentAdmin.parentId }).sort({ createdAt: -1 });
            console.log(`[Payment Details] Found ${details.length} payment details for grandparent ${grandParentAdmin?.oderId}`);
          }
        }
        
        if (details.length > 0) {
          useParentDetails = true;
        }
      } else {
        console.log(`[Payment Details] Admin ${parentAdmin?.oderId} does not have viewUserBankDetails permission, falling back to super admin`);
      }
    }
    
    // Fallback to SuperAdmin payment details if:
    // 1. No parent admin
    // 2. Parent admin doesn't have viewUserBankDetails permission
    // 3. No payment details found in hierarchy
    if (!useParentDetails || details.length === 0) {
      details = await AdminPaymentDetail.find({ isActive: true, adminId: null }).sort({ createdAt: -1 });
    }
    
    const bankAccounts = details.filter(d => d.type === 'bank');
    const upiIds = details.filter(d => d.type === 'upi');
    const cryptoWallets = details.filter(d => d.type === 'crypto');
    res.json({ success: true, bankAccounts, upiIds, cryptoWallets });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin/SubAdmin/Broker: Get their own payment details
app.get('/api/admin/payment-details', async (req, res) => {
  try {
    const { adminId } = req.query;
    const query = adminId ? { adminId } : { adminId: null };
    const details = await AdminPaymentDetail.find(query).sort({ createdAt: -1 });
    const bankAccounts = details.filter(d => d.type === 'bank');
    const upiIds = details.filter(d => d.type === 'upi');
    const cryptoWallets = details.filter(d => d.type === 'crypto');
    res.json({ success: true, bankAccounts, upiIds, cryptoWallets });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin/SubAdmin/Broker: Add bank account
app.post('/api/admin/payment-details/bank', async (req, res) => {
  try {
    const { bankName, accountNumber, ifsc, accountHolder, isActive, adminId } = req.body;
    if (!bankName || !accountNumber || !ifsc || !accountHolder) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }
    const detail = new AdminPaymentDetail({
      type: 'bank',
      adminId: adminId || null,
      bankName,
      accountNumber,
      ifsc,
      accountHolder,
      isActive: isActive !== false
    });
    await detail.save();
    res.json({ success: true, detail });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin/SubAdmin/Broker: Add UPI
app.post('/api/admin/payment-details/upi', async (req, res) => {
  try {
    const { upiId, name, qrImage, isActive, adminId } = req.body;
    if (!upiId || !name) {
      return res.status(400).json({ success: false, error: 'UPI ID and name are required' });
    }
    const detail = new AdminPaymentDetail({
      type: 'upi',
      adminId: adminId || null,
      upiId,
      name,
      qrImage,
      isActive: isActive !== false
    });
    await detail.save();
    res.json({ success: true, detail });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin/SubAdmin/Broker: Add Crypto Wallet
app.post('/api/admin/payment-details/crypto', async (req, res) => {
  try {
    const { network, address, qrImage, isActive, adminId } = req.body;
    if (!network || !address) {
      return res.status(400).json({ success: false, error: 'Network and address are required' });
    }
    const detail = new AdminPaymentDetail({
      type: 'crypto',
      adminId: adminId || null,
      network,
      address,
      qrImage,
      isActive: isActive !== false
    });
    await detail.save();
    res.json({ success: true, detail });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Update payment detail
app.put('/api/admin/payment-details/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const detail = await AdminPaymentDetail.findByIdAndUpdate(id, { ...req.body, updatedAt: new Date() }, { new: true });
    if (!detail) {
      return res.status(404).json({ success: false, error: 'Payment detail not found' });
    }
    res.json({ success: true, detail });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Delete payment detail
app.delete('/api/admin/payment-details/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await AdminPaymentDetail.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== ZERODHA INTEGRATION ==============

// Get Zerodha settings and status
app.get('/api/zerodha/status', async (req, res) => {
  try {
    const status = await zerodhaService.getStatus();
    res.json({ success: true, ...status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Zerodha settings (admin only)
app.get('/api/zerodha/settings', async (req, res) => {
  try {
    const settings = await ZerodhaSettings.getSettings();
    
    // Redirect URL resolution order:
    // 1. ZERODHA_REDIRECT_URL env var (authoritative — must match the URL
    //    you registered in the Kite Connect developer portal).
    // 2. Saved `settings.redirectUrl` from the DB (set by admin).
    // 3. Built from the incoming request headers — works for localhost dev
    //    and any production host where this server is actually reachable.
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3001';
    const dynamicRedirectUrl =
      process.env.ZERODHA_REDIRECT_URL ||
      settings.redirectUrl ||
      `${protocol}://${host}/api/zerodha/callback`;
    
    // Check if token is expired
    const isTokenExpired = settings.tokenExpiry ? new Date() >= new Date(settings.tokenExpiry) : true;
    
    // If token is expired, mark as disconnected
    if (isTokenExpired && settings.isConnected) {
      settings.isConnected = false;
      settings.wsStatus = 'disconnected';
      await settings.save();
    }
    
    res.json({
      success: true,
      settings: {
        apiKey: settings.apiKey,
        apiSecret: settings.apiSecret ? '********' : '',
        isConnected: settings.isConnected && !isTokenExpired,
        lastConnected: settings.lastConnected,
        tokenExpiry: settings.tokenExpiry,
        isTokenExpired: isTokenExpired,
        wsStatus: settings.wsStatus,
        enabledSegments: settings.enabledSegments,
        subscribedInstruments: settings.subscribedInstruments,
        redirectUrl: dynamicRedirectUrl
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update Zerodha API credentials
app.post('/api/zerodha/settings', async (req, res) => {
  try {
    const { apiKey, apiSecret, enabledSegments, redirectUrl } = req.body;
    const settings = await ZerodhaSettings.getSettings();
    
    if (apiKey !== undefined) settings.apiKey = apiKey;
    if (apiSecret !== undefined && apiSecret !== '********') settings.apiSecret = apiSecret;
    if (enabledSegments !== undefined) settings.enabledSegments = { ...settings.enabledSegments, ...enabledSegments };
    if (redirectUrl !== undefined) settings.redirectUrl = redirectUrl;
    
    await settings.save();
    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Zerodha login URL
app.get('/api/zerodha/login-url', async (req, res) => {
  try {
    const loginUrl = await zerodhaService.getLoginUrl();
    res.json({ success: true, loginUrl });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Zerodha OAuth callback
app.get('/api/zerodha/callback', async (req, res) => {
  // CORS_ORIGIN may contain multiple comma-separated origins. Pick a sensible
  // single origin for the admin redirect: explicit env var wins, else the
  // first "admin.*" origin from CORS_ORIGIN, else the first origin.
  const pickAdminOrigin = () => {
    if (process.env.ADMIN_URL) return process.env.ADMIN_URL;
    if (process.env.ZERODHA_SUCCESS_REDIRECT) return process.env.ZERODHA_SUCCESS_REDIRECT;
    const origins = (process.env.CORS_ORIGIN || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const adminOrigin = origins.find(o => /\/\/admin\./i.test(o));
    if (adminOrigin) return adminOrigin;
    if (origins.length > 0) return origins[0];
    return 'http://localhost:5173';
  };
  const frontendUrl = pickAdminOrigin().replace(/\/$/, '');
  try {
    const { request_token, status } = req.query;

    if (status === 'cancelled') {
      return res.redirect(`${frontendUrl}/admin/zerodha?error=cancelled`);
    }

    if (!request_token) {
      return res.redirect(`${frontendUrl}/admin/zerodha?error=no_token`);
    }

    await zerodhaService.generateSession(request_token);

    // Auto-connect WebSocket after successful authentication
    try {
      await zerodhaService.connectWebSocket();
      console.log('Zerodha WebSocket auto-connected after authentication');
    } catch (wsError) {
      console.log('WebSocket auto-connect failed:', wsError.message);
    }

    res.redirect(`${frontendUrl}/admin/zerodha?success=true`);
  } catch (error) {
    console.error('Zerodha callback error:', error);
    res.redirect(`${frontendUrl}/admin/zerodha?error=${encodeURIComponent(error.message)}`);
  }
});

// Manual token entry — for when the OAuth redirect URL is broken (e.g. DNS
// not configured) the admin can copy the `request_token` from the failed
// callback URL in their browser and paste it here to complete the login.
app.post('/api/zerodha/connect-with-token', async (req, res) => {
  try {
    const { request_token } = req.body || {};
    if (!request_token || !String(request_token).trim()) {
      return res.status(400).json({ success: false, error: 'request_token is required' });
    }
    await zerodhaService.generateSession(String(request_token).trim());
    try {
      await zerodhaService.connectWebSocket();
    } catch (wsError) {
      console.log('WebSocket auto-connect failed:', wsError.message);
    }
    res.json({ success: true, message: 'Zerodha connected with manual token' });
  } catch (error) {
    console.error('Zerodha manual-token error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// Connect Zerodha WebSocket
app.post('/api/zerodha/connect-ws', async (req, res) => {
  try {
    await zerodhaService.connectWebSocket();
    res.json({ success: true, message: 'WebSocket connected' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Disconnect Zerodha WebSocket
app.post('/api/zerodha/disconnect-ws', async (req, res) => {
  try {
    zerodhaService.disconnect();
    const settings = await ZerodhaSettings.getSettings();
    settings.wsStatus = 'disconnected';
    await settings.save();
    res.json({ success: true, message: 'WebSocket disconnected' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search instruments (uses cached all instruments - no subscription needed)
app.get('/api/zerodha/instruments/search', async (req, res) => {
  try {
    const { query, segment } = req.query;
    if (!query) {
      return res.json({ success: true, instruments: [] });
    }
    const raw = segment != null ? String(segment).trim() : '';
    const ZERODHA_API_CODES = new Set([
      'nseEq', 'bseEq', 'nseFut', 'nseOpt', 'mcxFut', 'mcxOpt', 'bseFut', 'bseOpt'
    ]);
    const DISPLAY_OR_CODE_TO_API = {
      'NSE EQ': 'nseEq',
      'BSE EQ': 'bseEq',
      'NSE FUT': 'nseFut',
      'NSE OPT': 'nseOpt',
      'MCX FUT': 'mcxFut',
      'MCX OPT': 'mcxOpt',
      'BSE FUT': 'bseFut',
      'BSE OPT': 'bseOpt',
      NSE_EQ: 'nseEq',
      BSE_EQ: 'bseEq',
      NSE_FUT: 'nseFut',
      NSE_OPT: 'nseOpt',
      MCX_FUT: 'mcxFut',
      MCX_OPT: 'mcxOpt',
      BSE_FUT: 'bseFut',
      BSE_OPT: 'bseOpt'
    };
    const normalizedSegment =
      !raw
        ? null
        : ZERODHA_API_CODES.has(raw)
          ? raw
          : DISPLAY_OR_CODE_TO_API[raw] || null;

    const instruments = await zerodhaService.searchAllInstruments(query, normalizedSegment, {
      exactName: req.query.exact === 'true' || req.query.exact === '1'
    });
    
    // Filter out expired F&O instruments (expiry date before today in IST)
    const now = new Date();
    const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const todayStart = new Date(istNow.getFullYear(), istNow.getMonth(), istNow.getDate()).getTime();
    
    const filteredInstruments = instruments.filter(inst => {
      // If no expiry, keep the instrument (equity, forex, etc.)
      if (!inst.expiry) return true;
      
      const expDate = new Date(inst.expiry);
      if (isNaN(expDate.getTime())) return true;
      
      // Convert expiry to IST and get start of day
      const istExp = new Date(expDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const expStart = new Date(istExp.getFullYear(), istExp.getMonth(), istExp.getDate()).getTime();
      
      // Keep only if expiry is today or in the future
      return expStart >= todayStart;
    });
    
    // Format expiry dates for display.
    //
    // These are Mongoose subdocuments. Spreading one copies its internals —
    // including `__parentArray`, the whole instrument array — and none of its
    // fields, so the result had no `symbol` for the picker to show and the
    // response ran to megabytes. Name the fields the client actually uses.
    const formattedInstruments = filteredInstruments.map(inst => {
      const i = typeof inst.toObject === 'function' ? inst.toObject() : inst;
      let expiryStr = '';
      if (i.expiry) {
        const expDate = new Date(i.expiry);
        expiryStr = expDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      }
      return {
        token: i.token,
        symbol: i.symbol,
        tradingsymbol: i.tradingsymbol || i.symbol,
        name: i.name,
        exchange: i.exchange,
        segment: i.segment,
        lotSize: i.lotSize,
        tickSize: i.tickSize,
        strike: i.strike,
        instrumentType: i.instrumentType,
        instrument_type: i.instrumentType,
        expiry: expiryStr,
      };
    });
    
    if (query && query.length >= 2 && req.query.isAdmin === 'true') {
      const searchUpper = query.toUpperCase();
      const prefixCount = filteredInstruments.filter(inst => {
         const symbol = inst.tradingsymbol || inst.symbol || '';
         return symbol.toUpperCase().startsWith(searchUpper);
      }).length;
      
      if (prefixCount > 0) {
        formattedInstruments.unshift({
          symbol: searchUpper,
          tradingsymbol: searchUpper,
          tradingSymbol: searchUpper,
          name: `${searchUpper} (Base Prefix) - Applies to ~${prefixCount} active scripts`,
          lotSize: 1,
          exchange: normalizedSegment || 'NFO'
        });
      }
    }
    
    res.json({ success: true, instruments: formattedInstruments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clear all subscribed instruments and resync fresh
app.post('/api/zerodha/instruments/clear', async (req, res) => {
  try {
    const settings = await ZerodhaSettings.getSettings();
    const previousCount = settings.subscribedInstruments?.length || 0;
    settings.subscribedInstruments = [];
    settings.instrumentsLastFetched = null;
    await settings.save();
    
    // Clear cache
    zerodhaService.allInstrumentsCache = {};
    zerodhaService.instrumentsCacheTime = null;
    
    res.json({ success: true, message: `Cleared ${previousCount} subscribed instruments` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Debug: Get raw CSV sample from Zerodha
app.get('/api/zerodha/debug-csv', async (req, res) => {
  try {
    const settings = await ZerodhaSettings.getSettings();
    if (!settings.accessToken) {
      return res.json({ error: 'Not connected to Zerodha' });
    }
    
    const axios = require('axios');
    const response = await axios.get('https://api.kite.trade/instruments/MCX', {
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${settings.apiKey}:${settings.accessToken}`
      }
    });
    
    const lines = response.data.split('\n');
    const headers = lines[0];
    const sampleRow = lines.find(l => l.includes('GOLD') && l.includes('FUT'));
    
    res.json({
      headers: headers,
      sampleGoldRow: sampleRow,
      headersSplit: headers.split(','),
      lotSizeIndex: headers.split(',').indexOf('lot_size')
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

// Clear instrument cache (lightweight operation)
app.post('/api/zerodha/instruments/sync', async (req, res) => {
  try {
    // Just clear cache and remove expired - don't pre-load all instruments
    zerodhaService.allInstrumentsCache = {};
    zerodhaService.instrumentsCacheTime = null;
    const expired = await zerodhaService.removeExpiredInstruments();
    res.json({ success: true, message: 'Cache cleared. Instruments will be fetched on-demand when searched.', expiredRemoved: expired || 0 });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get cached instruments count (lightweight - doesn't load all)
app.get('/api/zerodha/instruments/all', async (req, res) => {
  try {
    const { exchange } = req.query;
    // Return only cached count, don't fetch all
    const cached = exchange 
      ? (zerodhaService.allInstrumentsCache[exchange] || [])
      : Object.values(zerodhaService.allInstrumentsCache).flat();
    res.json({ success: true, count: cached.length, cached: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get subscribed instruments - MUST be before :exchange route
app.get('/api/zerodha/instruments/subscribed', async (req, res) => {
  try {
    const settings = await ZerodhaSettings.getSettings();
    res.json({ success: true, instruments: settings?.subscribedInstruments || [] });
  } catch (error) {
    console.error('Error fetching subscribed instruments:', error);
    // Return empty array instead of 500 to prevent frontend crash
    res.json({ success: true, instruments: [], error: error.message });
  }
});

// Get instruments by segment (parameterized route - must be AFTER specific routes)
app.get('/api/zerodha/instruments/:exchange', async (req, res) => {
  try {
    const { exchange } = req.params;
    const instruments = await zerodhaService.getInstruments(exchange);
    res.json({ success: true, instruments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get historical data for charting
app.get('/api/zerodha/historical/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { interval = 'minute', from, to } = req.query;
    const fromUnix = from != null && from !== '' ? parseInt(from, 10) : null;
    const toUnix = to != null && to !== '' ? parseInt(to, 10) : null;

    // Get instrument token from symbol
    const token = await zerodhaService.getInstrumentToken(symbol);
    if (!token) {
      return res.status(404).json({ success: false, error: 'Instrument not found', candles: [] });
    }

    const candles = await zerodhaService.getHistoricalData(
      token,
      interval,
      Number.isFinite(fromUnix) ? fromUnix : null,
      Number.isFinite(toUnix) ? toUnix : null
    );
    res.json({ success: true, candles });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, candles: [] });
  }
});

// Add instrument to subscription
app.post('/api/zerodha/instruments/subscribe', async (req, res) => {
  try {
    const { instrument } = req.body;
    if (!instrument || !instrument.token) {
      return res.status(400).json({ success: false, error: 'Invalid instrument' });
    }
    const result = await zerodhaService.addInstrument(instrument);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Re-subscribe by tradingsymbol only (e.g. user opens SBIN after admin cleared subscriptions/cache)
app.post('/api/zerodha/instruments/subscribe-by-symbol', async (req, res) => {
  try {
    const { symbol } = req.body || {};
    if (!symbol || String(symbol).trim() === '') {
      return res.status(400).json({ success: false, error: 'symbol required' });
    }
    const inst = await zerodhaService.findInstrumentBySymbol(String(symbol).trim());
    if (!inst || !inst.token) {
      return res.status(404).json({ success: false, error: 'Instrument not found for symbol' });
    }
    const result = await zerodhaService.addInstrument(inst);
    res.json({ ...result, token: inst.token, symbol: inst.symbol });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove instrument from subscription
app.delete('/api/zerodha/instruments/subscribe/:token', async (req, res) => {
  try {
    const token = parseInt(req.params.token);
    const result = await zerodhaService.removeInstrument(token);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get LTP (Last Traded Price) for subscribed instruments - works even when market is closed
app.get('/api/zerodha/ltp', async (req, res) => {
  try {
    const ticks = await zerodhaService.fetchAndBroadcastLTP();
    res.json({ success: true, ticks });
  } catch (error) {
    // Return empty ticks instead of 500 to prevent frontend crash
    console.error('Zerodha LTP error:', error.message);
    res.json({ success: true, ticks: [], error: error.message });
  }
});

// Bulk subscribe to instruments
app.post('/api/zerodha/instruments/subscribe-bulk', async (req, res) => {
  try {
    const { instruments } = req.body;
    if (!instruments || !Array.isArray(instruments) || instruments.length === 0) {
      return res.status(400).json({ success: false, error: 'No instruments provided' });
    }

    const settings = await ZerodhaSettings.getSettings();
    let addedCount = 0;
    const tokensToSubscribe = [];

    for (const instrument of instruments) {
      if (!instrument.token) continue;
      
      // Check if already subscribed
      const exists = settings.subscribedInstruments.find(i => i.token === instrument.token);
      if (!exists) {
        settings.subscribedInstruments.push(instrument);
        tokensToSubscribe.push(instrument.token);
        addedCount++;
      }
    }

    await settings.save();

    // Subscribe via WebSocket if connected
    if (tokensToSubscribe.length > 0) {
      zerodhaService.subscribe(tokensToSubscribe);
    }

    res.json({ success: true, count: addedCount, message: `Subscribed to ${addedCount} instruments` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Logout / Disconnect Zerodha
app.post('/api/zerodha/logout', async (req, res) => {
  try {
    zerodhaService.disconnect();
    const settings = await ZerodhaSettings.getSettings();
    settings.accessToken = null;
    settings.refreshToken = null;
    settings.isConnected = false;
    settings.wsStatus = 'disconnected';
    await settings.save();
    res.json({ success: true, message: 'Logged out from Zerodha' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Initialize default payment methods if none exist
const initializePaymentMethods = async () => {
  try {
    const count = await PaymentMethod.countDocuments();
    if (count === 0) {
      const defaultMethods = [
        {
          type: 'bank_transfer',
          name: 'Bank Transfer (IMPS/NEFT)',
          isActive: true,
          allowDeposit: true,
          allowWithdraw: true,
          minAmount: 500,
          maxAmount: 500000,
          processingTime: '1-24 hours',
          feeType: 'fixed',
          feeAmount: 0,
          instructions: 'Transfer to our bank account and upload payment proof',
          displayOrder: 1
        },
        {
          type: 'upi',
          name: 'UPI Payment',
          isActive: true,
          allowDeposit: true,
          allowWithdraw: true,
          minAmount: 100,
          maxAmount: 100000,
          processingTime: 'Instant - 1 hour',
          feeType: 'fixed',
          feeAmount: 0,
          instructions: 'Pay via UPI and enter UTR number',
          displayOrder: 2
        },
      ];

      await PaymentMethod.insertMany(defaultMethods);
      console.log('✅ Default payment methods initialized');
    }
  } catch (error) {
    console.error('Error initializing payment methods:', error);
  }
};

// Initialize payment methods after first DB connection (called from the initial connectDB above)
initializePaymentMethods();

// ============== BANNER MANAGEMENT ==============

// Get all banners (admin)
app.get('/api/banners', async (req, res) => {
  try {
    const banners = await Banner.find({}).sort({ createdAt: -1 });
    res.json({ banners });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get active banners (for home page)
app.get('/api/banners/active', async (req, res) => {
  try {
    const banners = await Banner.find({ isActive: true }).sort({ createdAt: -1 });
    res.json({ banners });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create banner
app.post('/api/banners', async (req, res) => {
  try {
    const { title, subtitle, imageData, link, isActive } = req.body;
    const banner = new Banner({ title, subtitle, imageData, link, isActive });
    await banner.save();
    res.json({ success: true, banner });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update banner
app.put('/api/banners/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const banner = await Banner.findByIdAndUpdate(id, req.body, { new: true });
    if (!banner) {
      return res.status(404).json({ error: 'Banner not found' });
    }
    res.json({ success: true, banner });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete banner
app.delete('/api/banners/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const banner = await Banner.findByIdAndDelete(id);
    if (!banner) {
      return res.status(404).json({ error: 'Banner not found' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== ADMIN DASHBOARD & USER MANAGEMENT ==============

// Admin: Get dashboard stats
app.get('/api/admin/dashboard/stats', async (req, res) => {
  try {
    const ChallengeAccount = require('./models/ChallengeAccount');

    // Everything below used to run as ~20 SERIAL round-trips to Atlas plus an
    // N+1 loop (one Transaction.findById per completed account). On a loaded
    // server that hung the dashboard for minutes. Run all independent queries
    // in parallel and batch the per-account lookup into a single $in query.
    const ibStatsP = (async () => {
      let ibTotalRevenue = 0, ibPendingWithdrawals = 0, ibTotalWithdrawals = 0;
      try {
        const ibWithdrawAgg = await Transaction.aggregate([
          { $match: { type: 'ib_withdrawal' } },
          { $group: { _id: '$status', total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]);
        for (const row of ibWithdrawAgg) {
          if (row._id === 'pending') ibPendingWithdrawals = row.count;
          ibTotalWithdrawals += row.total || 0;
        }
        const IBUser = require('./models/IBUser');
        const ibRevenueAgg = await IBUser.aggregate([
          { $group: { _id: null, total: { $sum: '$totalCommissionEarned' } } }
        ]);
        ibTotalRevenue = ibRevenueAgg[0]?.total || 0;
      } catch (e) { /* IB models may not exist yet */ }
      return { ibTotalRevenue, ibPendingWithdrawals, ibTotalWithdrawals };
    })();

    const [
      totalUsers, activeUsers, blockedUsers,
      totalTrades, openPositions,
      completedAccounts,
      payouts,
      pendingChallengeBuys, pendingPayouts,
      resets, aiSubs, pendingResets,
      activeAccounts, fundedAccounts, passedAccounts, failedAccounts,
      ibStats,
      recentUsers, recentTrades
    ] = await Promise.all([
      User.countDocuments({ role: { $ne: 'admin' } }),
      User.countDocuments({ role: { $ne: 'admin' }, isActive: { $ne: false } }),
      User.countDocuments({ role: { $ne: 'admin' }, isActive: false }),
      Trade.countDocuments(),
      HedgingPosition.countDocuments({ status: 'open' }),
      ChallengeAccount.find({ paymentStatus: 'COMPLETED', status: { $ne: 'CANCELLED' }, accountType: { $ne: 'DEMO' } }).populate('challengeId', 'challengeFee tiers').lean(),
      Transaction.aggregate([
        { $match: { type: 'withdrawal', status: { $in: ['approved', 'completed'] }, 'paymentDetails.kind': 'prop_payout' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),
      Transaction.countDocuments({ type: 'challenge_purchase', status: 'pending' }),
      Transaction.countDocuments({ type: 'withdrawal', status: 'pending', 'paymentDetails.kind': 'prop_payout' }),
      // Paid resets and AI subscriptions are money in too — the dashboard used
      // to show challenge buys alone as the revenue.
      Transaction.aggregate([
        { $match: { type: 'challenge_reset', status: { $in: ['approved', 'completed'] } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),
      Transaction.aggregate([
        { $match: { type: 'ai_subscription', status: { $in: ['approved', 'completed'] } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),
      Transaction.countDocuments({ type: 'challenge_reset', status: 'pending' }),
      ChallengeAccount.countDocuments({ status: 'ACTIVE', accountType: { $ne: 'DEMO' } }),
      ChallengeAccount.countDocuments({ status: 'FUNDED', accountType: { $ne: 'DEMO' } }),
      ChallengeAccount.countDocuments({ status: 'PASSED', accountType: { $ne: 'DEMO' } }),
      ChallengeAccount.countDocuments({ status: 'FAILED', accountType: { $ne: 'DEMO' } }),
      ibStatsP,
      User.find({ role: { $ne: 'admin' } }).sort({ createdAt: -1 }).limit(10).select('oderId name email isActive createdAt').lean(),
      Trade.find({}).sort({ executedAt: -1 }).limit(10).select('userId symbol side volume entryPrice profit type executedAt').lean()
    ]);

    const closedTrades = totalTrades; // same collection — no need to count twice

    // ── Challenge Buys revenue — batch the linked-transaction lookup (was N+1).
    const txIds = completedAccounts.map(a => a.pendingPurchaseTransactionId).filter(Boolean);
    const txById = {};
    if (txIds.length) {
      const txs = await Transaction.find({ _id: { $in: txIds } }).select('amount').lean();
      txs.forEach(t => { txById[String(t._id)] = t; });
    }
    let totalChallengeBuys = 0;
    for (const a of completedAccounts) {
      let fee = 0;
      const tx = a.pendingPurchaseTransactionId ? txById[String(a.pendingPurchaseTransactionId)] : null;
      if (tx?.amount > 0) fee = Number(tx.amount);
      if (!fee && a.couponSnapshot?.finalFee > 0) fee = Number(a.couponSnapshot.finalFee);
      if (!fee) {
        const ch = a.challengeId;
        if (ch?.tiers?.length) fee = Number(ch.tiers[a.tierIndex || 0]?.challengeFee || 0);
        if (!fee && ch?.challengeFee) fee = Number(ch.challengeFee);
      }
      totalChallengeBuys += fee;
    }
    const challengeBuyCount = completedAccounts.length;

    const totalPayouts = payouts[0]?.total || 0;
    const payoutCount = payouts[0]?.count || 0;
    const totalResets = resets[0]?.total || 0;
    const resetCount = resets[0]?.count || 0;
    const totalAiSubs = aiSubs[0]?.total || 0;
    const aiSubCount = aiSubs[0]?.count || 0;
    // Every rupee collected: evaluation fees, paid resets and AI subscriptions.
    const totalRevenue = totalChallengeBuys + totalResets + totalAiSubs;
    const { ibTotalRevenue, ibPendingWithdrawals, ibTotalWithdrawals } = ibStats;

    res.json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        blockedUsers,
        totalTrades,
        openPositions,
        closedTrades,
        // Prop-only money metrics
        totalChallengeBuys,
        challengeBuyCount,
        totalResets,
        resetCount,
        totalAiSubs,
        aiSubCount,
        totalRevenue,
        totalPayouts,
        payoutCount,
        pendingChallengeBuys,
        pendingResets,
        pendingPayouts,
        // Account status snapshot
        activeAccounts,
        fundedAccounts,
        passedAccounts,
        failedAccounts,
        // IB stats
        ibTotalRevenue,
        ibPendingWithdrawals,
        ibTotalWithdrawals
      },
      recentUsers,
      recentTrades
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get all users with pagination and filters
app.get('/api/admin/users', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      search,
      city,
      state,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Tenant scope: super-admin sees the platform pool, an admin sees its own
    // pool. Merged into the query so the count and the page always agree.
    const query = {
      role: { $nin: ['admin', 'subadmin', 'broker'] }, // Only show regular users
      ...(await scopeUserFilter(req.admin)),
    };

    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'blocked') {
      query.isActive = false;
    }

    // City and State filters
    if (city) {
      query['profile.city'] = { $regex: city, $options: 'i' };
    }
    if (state) {
      query['profile.state'] = { $regex: state, $options: 'i' };
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { oderId: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .select('-password');

    res.json({
      success: true,
      users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Search users by name, email, or order ID
app.get('/api/admin/users/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json({ success: true, users: [] });
    const regex = new RegExp(q.trim(), 'i');
    const users = await User.find({
      $and: [
        await scopeUserFilter(req.admin),
        { $or: [
          { name: regex },
          { email: regex },
          { oderId: regex },
          { phone: regex }
        ] },
      ]
    })
      .select('_id name email oderId phone wallet isActive')
      .limit(20)
      .lean();
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Get single user details
app.get('/api/admin/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const mongoose = require('mongoose');
    const isValidObjectId = mongoose.Types.ObjectId.isValid(userId);
    
    let query;
    if (isValidObjectId) {
      query = { $or: [{ _id: userId }, { oderId: userId }] };
    } else {
      query = { oderId: userId };
    }
    
    const user = await User.findOne(query).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's trades
    const trades = await Trade.find({ userId: user.oderId || user._id })
      .sort({ executedAt: -1 })
      .limit(50);

    // Get user's transactions
    const transactions = await Transaction.find({ userId: user.oderId || user._id })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      user,
      trades,
      transactions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Update user
app.put('/api/admin/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, phone, isActive, wallet, allowedTradeModes } = req.body;

    const user = await User.findOne({
      $or: [{ _id: userId }, { oderId: userId }]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (phone) user.phone = phone;
    if (typeof isActive === 'boolean') user.isActive = isActive;
    if (wallet) {
      user.wallet = { ...user.wallet.toObject(), ...wallet };
    }
    if (allowedTradeModes) {
      user.allowedTradeModes = { ...user.allowedTradeModes, ...allowedTradeModes };
    }

    await user.save();

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Update user trade mode settings
app.put('/api/admin/users/:userId/trade-modes', async (req, res) => {
  try {
    const { userId } = req.params;
    const { hedging, netting, binary, allowedCurrencyDisplay } = req.body;

    const user = await User.findOne({
      $or: [{ _id: userId }, { oderId: userId }]
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Initialize if not exists
    if (!user.allowedTradeModes) {
      user.allowedTradeModes = { hedging: true, netting: true, binary: true };
    }

    if (typeof hedging === 'boolean') user.allowedTradeModes.hedging = hedging;
    if (typeof netting === 'boolean') user.allowedTradeModes.netting = netting;
    if (typeof binary === 'boolean') user.allowedTradeModes.binary = binary;
    
    user.allowedCurrencyDisplay = 'INR';

    await user.save();

    res.json({ 
      success: true, 
      user: {
        _id: user._id,
        oderId: user.oderId,
        name: user.name,
        email: user.email,
        allowedTradeModes: user.allowedTradeModes
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Update user currency permissions (INR-only platform — endpoint is a no-op kept for legacy clients)
app.put('/api/admin/users/:userId/currency-permissions', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOne({
      $or: [{ _id: userId }, { oderId: userId }]
    });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({
      success: true,
      user: {
        _id: user._id,
        oderId: user.oderId,
        name: user.name,
        walletINR: user.walletINR
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Block/Unblock user
app.patch('/api/admin/users/:userId/status', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    const user = await User.findOne({
      $or: [{ _id: userId }, { oderId: userId }]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Use isActive boolean instead of status string
    user.isActive = status !== 'blocked';
    await user.save();

    res.json({ success: true, user, message: `User ${status === 'blocked' ? 'blocked' : 'activated'} successfully` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Delete user
app.delete('/api/admin/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({
      $or: [{ _id: userId }, { oderId: userId }]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user's trades
    await Trade.deleteMany({ userId: user.oderId || user._id });

    // Delete user's transactions
    await Transaction.deleteMany({ userId: user.oderId || user._id });

    // Delete user
    await User.deleteOne({ _id: user._id });

    res.json({ success: true, message: 'User and all related data deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Change user password
app.put('/api/admin/users/:userId/password', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOne({
      $or: [{ _id: userId }, { oderId: userId }]
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Accept both 'password' and 'newPassword' from request body
    const password = req.body.newPassword || req.body.password;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    user.password = password; // Will be hashed by pre-save hook
    await user.save();
    
    // Log password change activity
    await UserActivityLog.logActivity({
      userId: user._id.toString(),
      oderId: user.oderId,
      activityType: 'password_change',
      description: 'Password changed by admin',
      metadata: { changedBy: 'admin' },
      ipAddress: req.ip,
      status: 'success'
    });
    
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Login as user (impersonate)
app.post('/api/admin/users/:userId/login-as', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOne({
      $or: [{ _id: userId }, { oderId: userId }]
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Generate JWT token for the user
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'BharatFundedTrade-secret-key-2024';
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });

    // Every impersonation is auditable - who, whom, when, from where. Scope
    // was already enforced by the /users/:userId chokepoint guard.
    if (req.admin) {
      await logScopedChange({
        req, admin: req.admin, activityType: 'impersonate_user',
        description: `Logged in as user ${user.oderId}`,
        metadata: { userId: String(user._id), oderId: user.oderId },
      });
    }

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        oderId: user.oderId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        wallet: user.wallet,
        role: user.role,
        allowedTradeModes: user.allowedTradeModes || { hedging: true, netting: true, binary: true }
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Download user report (CSV)
app.post('/api/admin/users/:userId/download-report', async (req, res) => {
  try {
    const { userId } = req.params;
    const { allTime, fromDate, toDate, reportTypes } = req.body;
    
    if (!reportTypes || reportTypes.length === 0) {
      return res.status(400).json({ error: 'Report types are required' });
    }
    
    if (!allTime && (!fromDate || !toDate)) {
      return res.status(400).json({ error: 'Date range is required when not using All Time' });
    }
    
    const user = await User.findOne({
      $or: [{ _id: userId }, { oderId: userId }]
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // For allTime, use user creation date as start and now as end
    let startDate, endDate;
    if (allTime) {
      startDate = new Date(user.createdAt || '2020-01-01');
      endDate = new Date();
    } else {
      startDate = new Date(fromDate);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(toDate);
    }
    endDate.setHours(23, 59, 59, 999);
    
    const dateRangeStr = allTime ? 'All Time' : `${fromDate} to ${toDate}`;
    
    let csvContent = '';
    const userInfo = `User Report: ${user.name || 'N/A'} (${user.oderId})\nEmail: ${user.email}\nPhone: ${user.phone || 'N/A'}\nDate Range: ${dateRangeStr}\nGenerated: ${new Date().toISOString()}\n\n`;
    csvContent += userInfo;
    
    // Login Activity
    if (reportTypes.includes('loginActivity')) {
      csvContent += '=== LOGIN/LOGOUT ACTIVITY ===\n';
      csvContent += 'Date,Time,Activity,IP Address,Device\n';
      
      const loginLogs = await UserActivityLog.find({
        userId: user._id.toString(),
        activityType: { $in: ['login', 'logout'] },
        timestamp: { $gte: startDate, $lte: endDate }
      }).sort({ timestamp: -1 });
      
      if (loginLogs.length > 0) {
        loginLogs.forEach(log => {
          const date = new Date(log.timestamp);
          const deviceStr = [log.browser, log.os, log.device].filter(Boolean).join(' / ') || log.userAgent || 'N/A';
          csvContent += `${date.toLocaleDateString()},${date.toLocaleTimeString()},${log.activityType},${log.ipAddress || 'N/A'},${String(deviceStr).replace(/,/g, ';')}\n`;
        });
      } else {
        csvContent += 'No login activity found in this date range\n';
      }
      csvContent += '\n';
    }
    
    // Trade History (Trade.userId stores the user's oderId, same as HedgingEngine)
    if (reportTypes.includes('trades')) {
      csvContent += '=== TRADE HISTORY ===\n';
      csvContent += 'Date,Time,Symbol,Side,Quantity,Price,P&L,Type\n';
      
      const trades = await Trade.find({
        userId: user.oderId,
        createdAt: { $gte: startDate, $lte: endDate }
      }).sort({ createdAt: -1 });
      
      if (trades.length > 0) {
        trades.forEach(trade => {
          const date = new Date(trade.createdAt || trade.executedAt);
          const qty = trade.quantity ?? trade.volume ?? trade.amount ?? '';
          const price = trade.closePrice != null ? trade.closePrice : trade.entryPrice;
          csvContent += `${date.toLocaleDateString()},${date.toLocaleTimeString()},${trade.symbol},${trade.side},${qty},${price},${trade.profit ?? 0},${trade.type || 'N/A'}\n`;
        });
      } else {
        csvContent += 'No trades found in this date range\n';
      }
      csvContent += '\n';
    }
    
    // Deposit / withdrawal requests (retail users use Transaction, not FundRequest)
    if (reportTypes.includes('funds')) {
      csvContent += '=== DEPOSIT/WITHDRAWAL HISTORY ===\n';
      csvContent += 'Date,Time,Type,Amount,Currency,Status,Method\n';
      
      const fundTxs = await Transaction.find({
        oderId: user.oderId,
        type: { $in: ['deposit', 'withdrawal'] },
        createdAt: { $gte: startDate, $lte: endDate }
      }).sort({ createdAt: -1 });
      
      if (fundTxs.length > 0) {
        fundTxs.forEach(t => {
          const date = new Date(t.createdAt);
          csvContent += `${date.toLocaleDateString()},${date.toLocaleTimeString()},${t.type},${t.amount},INR,${t.status},${t.paymentMethod || 'N/A'}\n`;
        });
      } else {
        csvContent += 'No fund transactions found in this date range\n';
      }
      csvContent += '\n';
    }
    
    // Position History (Position.userId is user's oderId; times are openTime / closeTime)
    if (reportTypes.includes('positions')) {
      csvContent += '=== POSITION HISTORY ===\n';
      csvContent += 'Date,Symbol,Side,Volume,Entry Price,Exit Price,P&L,Status\n';
      
      const positionDateOr = [
        { openTime: { $gte: startDate, $lte: endDate } },
        { closeTime: { $gte: startDate, $lte: endDate } }
      ];
      
      const hedgingPositions = await HedgingPosition.find({
        userId: user.oderId,
        $or: positionDateOr
      }).sort({ openTime: -1 });
      
      const nettingPositions = await NettingPosition.find({
        userId: user.oderId,
        $or: positionDateOr
      }).sort({ openTime: -1 });
      
      const allPositions = [...hedgingPositions, ...nettingPositions];
      
      if (allPositions.length > 0) {
        allPositions.forEach(pos => {
          const date = new Date(pos.openTime || pos.createdAt);
          const entry = pos.entryPrice ?? pos.avgPrice ?? '';
          const exitPx = pos.closePrice != null ? pos.closePrice : 'Open';
          const pnl = pos.profit ?? 0;
          csvContent += `${date.toLocaleDateString()},${pos.symbol},${pos.side},${pos.volume},${entry},${exitPx},${pnl},${pos.status}\n`;
        });
      } else {
        csvContent += 'No positions found in this date range\n';
      }
      csvContent += '\n';
    }
    
    // Transaction History (Wallet Transactions)
    if (reportTypes.includes('ledger')) {
      csvContent += '=== TRANSACTION HISTORY ===\n';
      csvContent += 'Date,Time,Type,Description,Amount,Balance After\n';
      
      const WalletTransaction = require('./models/WalletTransaction');
      const ledgerEntries = await WalletTransaction.find({
        oderId: user.oderId,
        createdAt: { $gte: startDate, $lte: endDate }
      }).sort({ createdAt: -1 });
      
      if (ledgerEntries.length > 0) {
        ledgerEntries.forEach(entry => {
          const date = new Date(entry.createdAt);
          csvContent += `${date.toLocaleDateString()},${date.toLocaleTimeString()},${entry.type},${(entry.description || '').replace(/,/g, ';')},${entry.amount},${entry.balanceAfter || 'N/A'}\n`;
        });
      } else {
        csvContent += 'No ledger entries found in this date range\n';
      }
      csvContent += '\n';
    }
    
    const safeBase = String(user.name || user.oderId || 'user').replace(/[^\w\-]+/g, '_');
    const fileRange = allTime ? 'all_time' : `${fromDate}_to_${toDate}`;
    const filename = `${safeBase}_report_${fileRange}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
    
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Login as Sub-Admin (impersonate)
app.post('/api/admin/subadmins/:adminId/login-as', async (req, res) => {
  try {
    const { adminId } = req.params;
    const admin = await Admin.findOne({
      $or: [{ _id: adminId }, { oderId: adminId }],
      role: 'sub_admin'
    });
    
    if (!admin) {
      return res.status(404).json({ error: 'Sub-Admin not found' });
    }

    // Only someone who actually manages this admin may wear their account.
    if (req.admin && typeof req.admin.canManage === 'function' && !req.admin.canManage(admin)) {
      return res.status(403).json({ error: 'Not authorized to impersonate this admin' });
    }

    if (req.admin) {
      await logScopedChange({
        req, admin: req.admin, activityType: 'impersonate_admin',
        description: `Logged in as admin ${admin.oderId} (${admin.name})`,
        metadata: { targetAdminId: String(admin._id), oderId: admin.oderId },
      });
    }

    // Generate JWT token for the sub-admin
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'BharatFundedTrade-secret-key-2024';
    const token = jwt.sign({ id: admin._id, role: admin.role }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({
      success: true,
      token,
      admin: {
        _id: admin._id,
        id: admin._id,
        oderId: admin.oderId,
        name: admin.name,
        email: admin.email,
        phone: admin.phone,
        role: admin.role,
        wallet: admin.wallet,
        permissions: admin.permissions
      },
      redirectUrl: '/subadmin'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Login as Broker (impersonate)
app.post('/api/admin/brokers/:brokerId/login-as', async (req, res) => {
  try {
    const { brokerId } = req.params;
    const broker = await Admin.findOne({
      $or: [{ _id: brokerId }, { oderId: brokerId }],
      role: 'broker'
    });
    
    if (!broker) {
      return res.status(404).json({ error: 'Broker not found' });
    }

    // Bug 4 fix: parent-scope check. Sub-admins should only be able to log
    // in as brokers they created. Super-admin's canManage() returns true.
    if (req.admin && typeof req.admin.canManage === 'function' && !req.admin.canManage(broker)) {
      return res.status(403).json({ error: 'Not authorized to impersonate this broker' });
    }
    
    // Generate JWT token for the broker
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'BharatFundedTrade-secret-key-2024';
    const token = jwt.sign({ id: broker._id, role: broker.role }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({
      success: true,
      token,
      admin: {
        _id: broker._id,
        id: broker._id,
        oderId: broker.oderId,
        name: broker.name,
        email: broker.email,
        phone: broker.phone,
        role: broker.role,
        wallet: broker.wallet,
        permissions: broker.permissions
      },
      redirectUrl: '/broker'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =================== BONUS MANAGEMENT (Fix 21) ===================
// MT5-style bonus templates + per-user grants. Admin defines templates in
// Bonus Management → Templates tab, then grants them to users via the
// Add/Deduct tab. Granting bumps user.wallet.credit (Fix 20). All amounts
// in INR.

// List all bonus templates
app.get('/api/admin/bonus-templates', async (req, res) => {
  try {
    const BonusTemplate = require('./models/BonusTemplate');
    const templates = await BonusTemplate.find().sort({ createdAt: -1 });
    res.json({ success: true, templates });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create a bonus template
app.post('/api/admin/bonus-templates', async (req, res) => {
  try {
    const BonusTemplate = require('./models/BonusTemplate');
    const {
      name, type, bonusType, bonusValue,
      minDeposit, maxBonus, maxWithdrawal,
      wagerRequirement, duration,
      usageLimit, endDate, status, description
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }
    if (bonusValue == null || Number(bonusValue) < 0) {
      return res.status(400).json({ success: false, error: 'bonusValue must be >= 0' });
    }

    const template = await BonusTemplate.create({
      name: String(name).trim(),
      type: type || 'first_deposit',
      bonusType: bonusType || 'percentage',
      bonusValue: Number(bonusValue),
      minDeposit: Number(minDeposit) || 0,
      maxBonus: maxBonus != null && maxBonus !== '' ? Number(maxBonus) : null,
      maxWithdrawal: maxWithdrawal != null && maxWithdrawal !== '' ? Number(maxWithdrawal) : null,
      wagerRequirement: Number(wagerRequirement) || 0,
      duration: Number(duration) || 30,
      usageLimit: usageLimit != null && usageLimit !== '' ? Number(usageLimit) : null,
      endDate: endDate ? new Date(endDate) : null,
      status: status || 'active',
      description: description || ''
    });
    res.json({ success: true, template });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update a bonus template
app.put('/api/admin/bonus-templates/:id', async (req, res) => {
  try {
    const BonusTemplate = require('./models/BonusTemplate');
    const updates = { ...req.body };
    delete updates._id;
    delete updates.usedCount;       // never let admin overwrite the running counter
    delete updates.createdAt;
    if (updates.maxBonus === '') updates.maxBonus = null;
    if (updates.maxWithdrawal === '') updates.maxWithdrawal = null;
    if (updates.usageLimit === '') updates.usageLimit = null;
    if (updates.endDate === '') updates.endDate = null;
    updates.updatedAt = Date.now();

    const template = await BonusTemplate.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });
    res.json({ success: true, template });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a bonus template (does NOT touch existing UserBonus rows that
// reference it — those keep their snapshot fields and become "orphaned"
// but still display correctly).
app.delete('/api/admin/bonus-templates/:id', async (req, res) => {
  try {
    const BonusTemplate = require('./models/BonusTemplate');
    const template = await BonusTemplate.findByIdAndDelete(req.params.id);
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });
    res.json({ success: true, message: `Deleted template ${template.name}` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// List user bonuses (paginated, optional filters by userId / status / type)
app.get('/api/admin/user-bonuses', async (req, res) => {
  try {
    const UserBonus = require('./models/UserBonus');
    const { userId, status, type, page = 1, limit = 50 } = req.query;
    const q = {};
    if (userId) q.userId = String(userId);
    if (status) q.status = String(status);
    if (type) q.type = String(type);

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [rows, total] = await Promise.all([
      UserBonus.find(q).sort({ grantedAt: -1 }).skip(skip).limit(limitNum),
      UserBonus.countDocuments(q)
    ]);
    res.json({
      success: true,
      bonuses: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Grant a bonus to a user. Two modes:
//   1) From a template (templateId + depositAmount) → server computes the
//      bonus amount via percentage/fixed + maxBonus cap.
//   2) Custom (templateId omitted, amount provided directly) → admin-entered
//      fixed INR amount, no template association.
// Either way, server bumps user.wallet.credit by amount/liveUsdInrRate and
// creates a UserBonus row.
app.post('/api/admin/user-bonuses/grant', async (req, res) => {
  try {
    const BonusTemplate = require('./models/BonusTemplate');
    const UserBonus = require('./models/UserBonus');
    const { getCachedUsdInrRate } = require('./services/currencyRateService');

    const { userId: userIdRaw, templateId, depositAmount, amount: customAmount, notes } = req.body;
    if (!userIdRaw) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const user = await User.findOne({
      $or: [{ _id: userIdRaw.match(/^[0-9a-fA-F]{24}$/) ? userIdRaw : null }, { oderId: String(userIdRaw) }]
    });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    let template = null;
    let amountInr = 0;
    let snapshotType = 'special';
    let snapshotName = '';
    let snapshotWager = 0;
    let snapshotDurationDays = 30;

    if (templateId) {
      template = await BonusTemplate.findById(templateId);
      if (!template) return res.status(404).json({ success: false, error: 'Template not found' });
      if (template.status !== 'active') {
        return res.status(400).json({ success: false, error: 'Template is not active' });
      }
      if (template.endDate && new Date() > template.endDate) {
        return res.status(400).json({ success: false, error: 'Template has expired' });
      }
      if (template.usageLimit != null && template.usedCount >= template.usageLimit) {
        return res.status(400).json({ success: false, error: 'Template usage limit reached' });
      }

      const dep = Number(depositAmount) || 0;
      if (template.minDeposit > 0 && dep < template.minDeposit) {
        return res.status(400).json({
          success: false,
          error: `Deposit amount (₹${dep}) is below template minimum (₹${template.minDeposit})`
        });
      }

      // Compute bonus
      if (template.bonusType === 'percentage') {
        amountInr = (dep * Number(template.bonusValue)) / 100;
      } else {
        amountInr = Number(template.bonusValue);
      }
      // Cap by maxBonus if set
      if (template.maxBonus != null && template.maxBonus > 0) {
        amountInr = Math.min(amountInr, template.maxBonus);
      }
      if (!(amountInr > 0)) {
        return res.status(400).json({ success: false, error: 'Computed bonus amount is 0' });
      }

      snapshotType = template.type;
      snapshotName = template.name;
      snapshotWager = template.wagerRequirement;
      snapshotDurationDays = template.duration;
    } else {
      // Custom grant — no template
      const a = Number(customAmount) || 0;
      if (!(a > 0)) {
        return res.status(400).json({ success: false, error: 'amount must be > 0 (custom grant)' });
      }
      amountInr = a;
      snapshotName = 'Custom Bonus';
    }

    const currentCredit = Number(user.wallet.credit || 0);
    user.wallet.credit = currentCredit + amountInr;
    user.wallet.creditInr = user.wallet.credit;
    const floatingPnl = (Number(user.wallet.equity || 0)) - (Number(user.wallet.balance || 0)) - currentCredit;
    user.updateEquity(floatingPnl);
    await user.save();

    // Create the UserBonus row
    const expiresAt = new Date(Date.now() + (snapshotDurationDays * 24 * 60 * 60 * 1000));
    const bonus = await UserBonus.create({
      userId: user.oderId,
      templateId: template ? template._id : null,
      templateName: snapshotName,
      type: snapshotType,
      amount: amountInr,
      depositAmount: Number(depositAmount) || 0,
      wagerRequirement: snapshotWager,
      wagerProgress: 0,
      status: 'active',
      grantedAt: new Date(),
      expiresAt,
      notes: notes || ''
    });

    // Bump template usedCount
    if (template) {
      template.usedCount = (template.usedCount || 0) + 1;
      await template.save();
    }

    res.json({
      success: true,
      bonus,
      wallet: user.wallet,
      message: `Granted ₹${amountInr.toFixed(2)} bonus to ${user.name || user.oderId}`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cancel a user bonus — subtracts the same INR amount back from
// user.wallet.credit (clamped to 0 if the user has already used some).
app.post('/api/admin/user-bonuses/:id/cancel', async (req, res) => {
  try {
    const UserBonus = require('./models/UserBonus');
    const { getCachedUsdInrRate } = require('./services/currencyRateService');

    const bonus = await UserBonus.findById(req.params.id);
    if (!bonus) return res.status(404).json({ success: false, error: 'Bonus not found' });
    if (bonus.status === 'cancelled' || bonus.status === 'expired') {
      return res.status(400).json({ success: false, error: `Bonus is already ${bonus.status}` });
    }

    const user = await User.findOne({ oderId: bonus.userId });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const currentCredit = Number(user.wallet.credit || 0);
    user.wallet.credit = Math.max(0, currentCredit - Number(bonus.amount));
    user.wallet.creditInr = user.wallet.credit;
    const floatingPnl = (Number(user.wallet.equity || 0)) - (Number(user.wallet.balance || 0)) - currentCredit;
    user.updateEquity(floatingPnl);
    await user.save();

    bonus.status = 'cancelled';
    bonus.cancelledAt = new Date();
    bonus.notes = (bonus.notes || '') + (req.body.reason ? `\nCancelled: ${req.body.reason}` : '');
    await bonus.save();

    res.json({
      success: true,
      bonus,
      wallet: user.wallet,
      message: `Cancelled ₹${bonus.amount.toFixed(2)} bonus`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// User-facing endpoint — Fix 21c. Computes the bonus a user WOULD receive if
// they deposited the given amount right now. Used by WalletPage to show the
// "🎁 Eligible bonus: ₹X" hint as the user types in the deposit input.
// Returns 0 if no template matches (no bonus configured for first/regular).
app.get('/api/user/eligible-bonus', async (req, res) => {
  try {
    const BonusTemplate = require('./models/BonusTemplate');
    const userId = req.query.userId ? String(req.query.userId) : null;
    const depositAmount = Number(req.query.amount) || 0;
    if (!userId || !(depositAmount > 0)) {
      return res.json({ success: true, bonus: 0, templateName: null });
    }

    const user = await User.findOne({ oderId: userId });
    if (!user) return res.json({ success: true, bonus: 0, templateName: null });

    const isFirstDeposit = !user.firstDepositAt;
    const now = new Date();

    // Helper — find newest active template of given type matching the amount.
    const findTemplate = (type) => BonusTemplate.findOne({
      type,
      status: 'active',
      minDeposit: { $lte: depositAmount },
      $or: [
        { endDate: null },
        { endDate: { $exists: false } },
        { endDate: { $gte: now } }
      ]
    }).sort({ createdAt: -1 });

    const computeBonus = (template) => {
      let b = 0;
      if (template.bonusType === 'percentage') {
        b = (depositAmount * Number(template.bonusValue)) / 100;
      } else {
        b = Number(template.bonusValue);
      }
      if (template.maxBonus != null && template.maxBonus > 0) {
        b = Math.min(b, template.maxBonus);
      }
      return b;
    };

    // Mirrors bonusAutoTrigger.service logic exactly so the preview matches
    // what will actually be granted on approval:
    //   1. First deposit → try first_deposit first.
    //   2. Always fall back to regular_deposit if no first_deposit matched
    //      (or if this isn't a first deposit).
    let template = null;
    if (isFirstDeposit) {
      template = await findTemplate('first_deposit');
    }
    if (!template) {
      template = await findTemplate('regular_deposit');
    }

    if (template) {
      return res.json({
        success: true,
        bonus: computeBonus(template),
        templateName: template.name,
        type: template.type,
        isFirstDeposit
      });
    }

    // Genuinely nothing matches — either no active templates, or the deposit
    // amount is below the min of every template. Tell the user the latter
    // when we can detect it (a template exists but its minDeposit is higher).
    const anyTemplate = await BonusTemplate.findOne({
      $or: [{ type: 'first_deposit' }, { type: 'regular_deposit' }],
      status: 'active'
    }).sort({ minDeposit: 1 });

    return res.json({
      success: true,
      bonus: 0,
      templateName: null,
      type: null,
      isFirstDeposit,
      belowMinimum: !!(anyTemplate && Number(anyTemplate.minDeposit) > depositAmount),
      minimumRequired: anyTemplate ? Number(anyTemplate.minDeposit) : null,
      minimumTemplateName: anyTemplate ? anyTemplate.name : null
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =================== END BONUS MANAGEMENT ===================

app.post('/api/admin/users/:userId/wallet', async (req, res) => {
  try {
    const { userId } = req.params;
    const { type, amount, reason, target: targetRaw = 'balance' } = req.body;

    const user = await User.findOne({
      $or: [{ _id: userId }, { oderId: userId }]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const typeNorm = String(type || '').toLowerCase();
    if (!['add', 'subtract', 'set'].includes(typeNorm)) {
      return res.status(400).json({ error: 'type must be add, subtract, or set' });
    }

    const target = String(targetRaw || 'balance').toLowerCase();
    if (target !== 'balance' && target !== 'credit') {
      return res.status(400).json({ error: "target must be 'balance' or 'credit'" });
    }

    const adjustAmount = parseFloat(amount);
    if (isNaN(adjustAmount) || adjustAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (!user.walletINR) user.walletINR = { balance: 0, totalDeposits: 0, totalWithdrawals: 0 };

    if (target === 'credit') {
      const currentCredit = Number(user.wallet.credit || 0);
      let newCredit;
      if (typeNorm === 'add') {
        newCredit = currentCredit + adjustAmount;
      } else if (typeNorm === 'subtract') {
        if (currentCredit < adjustAmount) {
          return res.status(400).json({
            error: `Insufficient credit. Available: ₹${currentCredit.toFixed(2)}, Required: ₹${adjustAmount.toFixed(2)}`
          });
        }
        newCredit = currentCredit - adjustAmount;
      } else {
        newCredit = adjustAmount;
      }
      user.wallet.credit = newCredit;
      user.wallet.creditInr = newCredit;
      const floatingPnl = (Number(user.wallet.equity || 0)) - (Number(user.wallet.balance || 0)) - currentCredit;
      user.updateEquity(floatingPnl);
      await user.save();
      return res.json({
        success: true,
        wallet: user.wallet,
        message: `${typeNorm === 'add' ? 'Added' : typeNorm === 'subtract' ? 'Deducted' : 'Set'} ₹${adjustAmount.toFixed(2)} bonus credit`,
        target: 'credit'
      });
    }

    if (typeNorm === 'add') {
      user.wallet.balance += adjustAmount;
      user.wallet.equity += adjustAmount;
      user.wallet.freeMargin += adjustAmount;
      user.walletINR.balance += adjustAmount;
      user.walletINR.totalDeposits += adjustAmount;
    } else if (typeNorm === 'subtract') {
      const avail = Number(user.wallet?.balance || 0);
      if (avail < adjustAmount) {
        return res.status(400).json({
          error: `Insufficient balance. Available: ₹${avail.toFixed(2)}, Required: ₹${adjustAmount.toFixed(2)}`
        });
      }
      user.wallet.balance -= adjustAmount;
      user.wallet.equity -= adjustAmount;
      user.wallet.freeMargin -= adjustAmount;
      user.walletINR.balance = Math.max(0, user.walletINR.balance - adjustAmount);
      user.walletINR.totalWithdrawals += adjustAmount;
    } else if (typeNorm === 'set') {
      user.wallet.balance = adjustAmount;
      user.wallet.equity = adjustAmount;
      user.wallet.freeMargin = adjustAmount;
    }

    let autoBonus = null;
    if (typeNorm === 'add') {
      const isFirstDeposit = !user.firstDepositAt;
      if (isFirstDeposit) {
        user.firstDepositAt = new Date();
      }
      try {
        const { maybeGrantDepositBonus } = require('./services/bonusAutoTrigger.service');
        autoBonus = await maybeGrantDepositBonus(user, adjustAmount, isFirstDeposit, 1);
        if (autoBonus) {
          console.log(`[BonusAutoTrigger] Granted ₹${autoBonus.amount.toFixed(2)} ${autoBonus.type} bonus to ${user.oderId}`);
        }
      } catch (bonusErr) {
        console.error('[BonusAutoTrigger] Failed to grant bonus:', bonusErr.message);
      }
    }

    await user.save();

    const transaction = new Transaction({
      oderId: user.oderId || user._id,
      type: typeNorm === 'subtract' ? 'withdrawal' : 'deposit',
      amount: adjustAmount,
      currency: 'INR',
      paymentMethod: 'admin_transfer',
      status: 'approved',
      adminNote: reason || 'Admin wallet adjustment',
      processedBy: 'admin',
      processedAt: new Date()
    });
    await transaction.save();

    await UserActivityLog.logActivity({
      userId: user._id.toString(),
      oderId: user.oderId,
      activityType: typeNorm === 'add' ? 'wallet_credit' : 'wallet_debit',
      description: `Admin ${typeNorm === 'add' ? 'credited' : 'debited'} ₹${adjustAmount} ${reason ? `(${reason})` : ''}`,
      metadata: { amount: adjustAmount, currency: 'INR', type: typeNorm, reason, transactionId: transaction._id },
      status: 'success'
    });

    logAdminSettingsChange({
      req,
      activityType: typeNorm === 'add' ? 'wallet_credit' : 'wallet_debit',
      description: `Manual wallet ${typeNorm === 'add' ? 'credit' : 'debit'}: ₹${adjustAmount} to user ${user.oderId}${reason ? ' — ' + reason : ''}`,
      metadata: { userId: user.oderId, amount: adjustAmount, currency: 'INR', type: typeNorm, reason }
    });

    const verb =
      typeNorm === 'add' ? 'credited' : typeNorm === 'subtract' ? 'debited' : 'set to';
    let msg =
      typeNorm === 'set'
        ? `Trading wallet set to ₹${adjustAmount.toFixed(2)}`
        : `${verb} ₹${adjustAmount.toFixed(2)}`;
    if (autoBonus) {
      msg += `\n🎁 Bonus auto-applied: ₹${autoBonus.amount.toFixed(2)} (${autoBonus.templateName})`;
    }

    res.json({
      success: true,
      user,
      wallet: user.wallet,
      message: msg,
      autoBonus
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== ADMIN TRADE MANAGEMENT ==============

// Admin: Place trade on behalf of a user
app.post('/api/admin/trades/place', async (req, res) => {
  try {
    const { userId, symbol, side, type, volume, price, tradeMode, instrument } = req.body;
    
    if (!userId || !symbol || !side || !volume) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Find the user
    const user = await User.findOne({
      $or: [{ _id: userId }, { oderId: userId }]
    });
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const { HedgingPosition, NettingPosition } = require('./models/Position');
    const entryPrice = price || 0;
    const lotSize = instrument?.lotSize || 1;
    // Volume is already in lots from admin, don't multiply by lotSize
    const actualVolume = parseFloat(volume);
    
    // Calculate required margin
    const leverage = instrument?.leverage || 100;
    const tradeValue = actualVolume * lotSize * entryPrice;
    const requiredMargin = tradeValue / leverage;
    
    // Check if user has sufficient wallet balance
    const userBalance = user.wallet?.balance || 0;
    if (userBalance < requiredMargin) {
      return res.status(400).json({ 
        success: false, 
        error: `Insufficient funds. Required margin: $${requiredMargin.toFixed(2)}, Available: $${userBalance.toFixed(2)}` 
      });
    }

    if (tradeMode === 'netting') {
      // Netting mode - check for existing position
      let position = await NettingPosition.findOne({
        userId: user.oderId || user._id.toString(),
        symbol,
        status: 'open'
      });

      if (position) {
        // Update existing position
        const oldVolume = position.volume;
        const oldSide = position.side;
        
        if (oldSide === side) {
          // Same direction - add to position
          const totalCost = (position.avgPrice * oldVolume) + (entryPrice * actualVolume);
          position.volume = oldVolume + actualVolume;
          position.quantity = position.volume;
          position.avgPrice = totalCost / position.volume;
          position.entryPrice = position.avgPrice;
          // Update marginUsed
          const leverage = position.leverage || instrument?.leverage || 100;
          position.marginUsed = (position.volume * position.avgPrice) / leverage;
        } else {
          // Opposite direction - reduce or flip
          if (actualVolume >= oldVolume) {
            // Close and possibly flip
            const pnl = oldSide === 'buy' 
              ? (entryPrice - position.avgPrice) * oldVolume
              : (position.avgPrice - entryPrice) * oldVolume;
            
            if (actualVolume > oldVolume) {
              // Flip position
              position.side = side;
              position.volume = actualVolume - oldVolume;
              position.quantity = position.volume;
              position.avgPrice = entryPrice;
              position.entryPrice = entryPrice;
              // Update marginUsed for flipped position
              const leverage = position.leverage || instrument?.leverage || 100;
              position.marginUsed = (position.volume * position.avgPrice) / leverage;
            } else {
              // Close position
              position.status = 'closed';
              position.closePrice = entryPrice;
              position.closeTime = new Date();
              position.pnl = pnl;
            }
            
            // Update user wallet
            user.wallet.balance += pnl;
            user.wallet.equity = user.wallet.balance;
            await user.save();
          } else {
            // Reduce position
            position.volume = oldVolume - actualVolume;
            position.quantity = position.volume;
            // Update marginUsed for reduced position
            const leverage = position.leverage || instrument?.leverage || 100;
            position.marginUsed = (position.volume * position.avgPrice) / leverage;
          }
        }
        await position.save();
        return res.json({ success: true, position, message: 'Position updated' });
      } else {
        // Create new netting position
        const positionOderId = `NT${Date.now()}`;
        
        // Calculate commission from segment settings for Indian instruments
        let commissionAmount = 0;
        const category = instrument?.category || '';
        let segmentName = null;
        if (category.startsWith('nse_')) segmentName = category.includes('fut') ? 'NSE_FUT' : (category.includes('opt') ? 'NSE_OPT' : 'NSE_EQ');
        else if (category.startsWith('bse_')) segmentName = category.includes('fut') ? 'BSE_FUT' : 'BSE_OPT';
        else if (category.startsWith('mcx_')) segmentName = category.includes('fut') ? 'MCX_FUT' : 'MCX_OPT';
        
        if (segmentName) {
          const segment = await Segment.findOne({ name: segmentName });
          if (segment && segment.commission > 0) {
            const lots = parseFloat(volume) || 1;
            if (segment.commissionType === 'per_lot') {
              commissionAmount = segment.commission * lots;
            } else if (segment.commissionType === 'per_crore') {
              const tradeValue = actualVolume * entryPrice;
              commissionAmount = (segment.commission * tradeValue) / 10000000;
            } else if (segment.commissionType === 'percentage') {
              const tradeValue = actualVolume * entryPrice;
              commissionAmount = (segment.commission / 100) * tradeValue;
            } else {
              commissionAmount = segment.commission;
            }
          }
        }
        
        // Deduct commission from user if applicable
        if (commissionAmount > 0) {
          user.wallet.balance -= commissionAmount;
          await user.save();
        }
        
        // Calculate margin used (value / leverage) - use lotSize for proper calculation
        const posLeverage = instrument?.leverage || leverage;
        const posTradeValue = actualVolume * lotSize * entryPrice;
        const marginUsed = posTradeValue / posLeverage;
        
        position = new NettingPosition({
          oderId: positionOderId,
          userId: user.oderId || user._id.toString(),
          symbol,
          side,
          volume: actualVolume,
          quantity: actualVolume,
          lotSize: lotSize,
          entryPrice,
          avgPrice: entryPrice,
          currentPrice: entryPrice,
          openTime: new Date(),
          status: 'open',
          pnl: 0,
          marginUsed: marginUsed,
          leverage: leverage,
          commission: commissionAmount,
          exchange: instrument?.exchange || '',
          segment: instrument?.segment || '',
          instrument
        });
        await position.save();
        
        return res.json({ success: true, position, commission: commissionAmount, message: 'Position opened' });
      }
    } else {
      // Hedging mode - always create new position
      const position = new HedgingPosition({
        oderId: `HG${Date.now()}`,
        oderId: `HG${Date.now()}`,
        userId: user.oderId || user._id.toString(),
        symbol,
        side,
        type: type || 'market',
        volume: actualVolume,
        entryPrice,
        currentPrice: entryPrice,
        openTime: new Date(),
        status: type === 'limit' || type === 'stop' ? 'pending' : 'open',
        pnl: 0,
        instrument
      });
      await position.save();
      return res.json({ success: true, position, message: 'Position opened' });
    }
  } catch (error) {
    console.error('Admin place trade error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Resolve a free-text admin search term to the user identifiers that appear on
// trade/position documents. These `userId` fields store either the User's mongo
// _id (challenge positions) or their oderId (legacy positions) as strings —
// NEVER the display name shown in the admin table. So searching by name/email
// must first resolve to those identifiers; otherwise the regex runs against an
// id and matches nothing (this was the "search shows nothing" bug).
// Demo accounts are a free practice sandbox for users — nothing about them is
// business data, so their positions and P&L must not reach any admin view.
// Looked up per request rather than flagged on the position document, so it
// covers trades placed before demo accounts existed as a concept.
let _demoAccCache = { ids: [], at: 0 };
async function demoAccountIds() {
  if (Date.now() - _demoAccCache.at < 60000) return _demoAccCache.ids;
  const ChallengeAccount = require('./models/ChallengeAccount');
  const rows = await ChallengeAccount.find({ accountType: 'DEMO' }).select('_id').lean();
  _demoAccCache = { ids: rows.map(r => r._id), at: Date.now() };
  return _demoAccCache.ids;
}

async function resolveUserSearchIds(search) {
  const term = String(search || '').trim();
  if (!term) return [];
  const rx = { $regex: term, $options: 'i' };
  const users = await User.find({
    $or: [{ name: rx }, { email: rx }, { oderId: rx }, { phone: rx }]
  }).select('_id oderId').limit(1000).lean();
  const ids = new Set();
  for (const u of users) {
    if (u._id) ids.add(String(u._id));
    if (u.oderId) ids.add(String(u.oderId));
  }
  return [...ids];
}

// Build a Mongo $or clause that matches the symbol, the trade-id, OR any user the
// search term resolves to. Returns null when there is no search term. Pass the
// result of resolveUserSearchIds() as `userIds`, and the collection's trade-id
// field name as `idField` (ChallengePosition → 'positionId', Trade / Position
// models → 'tradeId') so admins can search by Trade ID too.
function buildTradeSearchOr(search, userIds, idField) {
  const term = String(search || '').trim();
  if (!term) return null;
  const rx = { $regex: term, $options: 'i' };
  const or = [{ symbol: rx }];
  if (idField) or.push({ [idField]: rx });
  if (userIds && userIds.length) or.push({ userId: { $in: userIds } });
  return or;
}

// Admin: Get all active trades/positions across all users
app.get('/api/admin/trades/active', async (req, res) => {
  try {
    const { search, symbol, mode } = req.query;
    const { HedgingPosition, NettingPosition, BinaryTrade } = require('./models/Position');
    const ChallengePosition = require('./models/ChallengePosition');
    const ChallengeAccount = require('./models/ChallengeAccount');

    // Get list of demo user IDs to exclude
    const demoUserIds = [];

    // Resolve the search term to user/symbol/trade-id match clauses (see helper).
    // ChallengePosition's id field is `positionId`; the legacy Position models
    // use `tradeId`.
    const searchUserIds = await resolveUserSearchIds(search);
    const searchOrCp = buildTradeSearchOr(search, searchUserIds, 'positionId');
    const searchOr = buildTradeSearchOr(search, searchUserIds, 'tradeId');

    let allPositions = [];

    // Fetch challenge positions (prop-trading — primary source on this platform)
    if (!mode || mode === 'netting' || mode === 'challenge' || mode === 'all') {
      const challengeQuery = { status: 'open', challengeAccountId: { $nin: await demoAccountIds() } };
      if (symbol) challengeQuery.symbol = { $regex: symbol, $options: 'i' };
      if (searchOrCp) challengeQuery.$or = searchOrCp;
      const challengeRows = await ChallengePosition.find(challengeQuery).sort({ openTime: -1 }).limit(500).lean();
      // Enrich with challenge account ID for display
      const accIds = [...new Set(challengeRows.map(p => String(p.challengeAccountId)))];
      const accMap = {};
      if (accIds.length) {
        const accs = await ChallengeAccount.find({ _id: { $in: accIds } }).select('accountId').lean();
        for (const a of accs) accMap[String(a._id)] = a.accountId;
      }
      // Enrich with userName from User collection — ChallengePosition.userId
      // is the User's mongo _id (ObjectId), not their oderId.
      const cpUserIdsList = [...new Set(challengeRows.map(p => String(p.userId)).filter(Boolean))];
      const userNameMap = {};
      if (cpUserIdsList.length) {
        const validIds = cpUserIdsList.filter(id => mongoose.Types.ObjectId.isValid(id));
        const users = await User.find({ _id: { $in: validIds } }).select('_id oderId name email').lean();
        for (const u of users) userNameMap[String(u._id)] = u.name || u.email || u.oderId || String(u._id);
      }
      allPositions.push(...challengeRows.map(p => ({
        ...p,
        mode: 'netting',
        positionType: 'ChallengePosition',
        challengeAccountCode: accMap[String(p.challengeAccountId)] || '',
        userName: userNameMap[String(p.userId)] || String(p.userId),
        holdTime: p.openTime ? Math.round((Date.now() - new Date(p.openTime).getTime()) / 1000) : 0
      })));
    }

    // Fetch hedging positions (exclude demo users)
    if (!mode || mode === 'hedging' || mode === 'all') {
      const hedgingQuery = { status: 'open', userId: { $nin: demoUserIds } };
      if (symbol) hedgingQuery.symbol = { $regex: symbol, $options: 'i' };
      if (searchOr) hedgingQuery.$or = searchOr;
      const hedging = await HedgingPosition.find(hedgingQuery).sort({ openTime: -1 }).limit(200);
      allPositions.push(...hedging.map(p => ({ ...p.toObject(), mode: 'hedging', positionType: 'HedgingPosition' })));
    }

    // Fetch netting positions (exclude demo users)
    if (!mode || mode === 'netting' || mode === 'all') {
      const nettingQuery = { status: 'open', userId: { $nin: demoUserIds } };
      if (symbol) nettingQuery.symbol = { $regex: symbol, $options: 'i' };
      if (searchOr) nettingQuery.$or = searchOr;
      const netting = await NettingPosition.find(nettingQuery).sort({ openTime: -1 }).limit(200);
      allPositions.push(...netting.map(p => ({ ...p.toObject(), mode: 'netting', entryPrice: p.avgPrice, positionType: 'NettingPosition' })));
    }

    // Fetch binary trades (exclude demo users)
    if (!mode || mode === 'binary' || mode === 'all') {
      const binaryQuery = { status: 'active', userId: { $nin: demoUserIds } };
      if (symbol) binaryQuery.symbol = { $regex: symbol, $options: 'i' };
      if (searchOr) binaryQuery.$or = searchOr;
      const binary = await BinaryTrade.find(binaryQuery).sort({ createdAt: -1 }).limit(200);
      allPositions.push(...binary.map(p => ({ ...p.toObject(), mode: 'binary', side: p.direction, volume: p.amount, entryPrice: p.entryPrice, positionType: 'BinaryTrade' })));
    }

    // Calculate summary
    const totalUnrealizedPnL = allPositions.reduce((sum, p) => sum + (p.profit || 0), 0);
    const totalVolume = allPositions.reduce((sum, p) => sum + (Number(p.volume) || 0), 0);

    res.json({
      success: true,
      positions: allPositions,
      summary: {
        total: allPositions.length,
        challenge: allPositions.filter(p => p.positionType === 'ChallengePosition').length,
        hedging: allPositions.filter(p => p.positionType === 'HedgingPosition').length,
        netting: allPositions.filter(p => p.positionType === 'NettingPosition').length,
        binary: allPositions.filter(p => p.positionType === 'BinaryTrade').length,
        totalUnrealizedPnL,
        totalVolume
      }
    });
  } catch (error) {
    console.error('Error fetching active trades:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get composed/aggregated positions by symbol
app.get('/api/admin/trades/composed', async (req, res) => {
  try {
    const { mode, includeDemo } = req.query;
    const { HedgingPosition, NettingPosition, BinaryTrade } = require('./models/Position');

    // Get list of demo user IDs to exclude (unless includeDemo is true)
    let demoUserIds = [];
    if (includeDemo !== 'true') {
      demoUserIds = [];
    }

    // Aggregation results by symbol
    const composedData = {};

    // Helper to add position to composed data
    const addToComposed = (symbol, side, volume, entryPrice, pnl, userId, tradeMode) => {
      if (!composedData[symbol]) {
        composedData[symbol] = {
          symbol,
          totalBuyLots: 0,
          totalSellLots: 0,
          netLots: 0,
          buyCount: 0,
          sellCount: 0,
          totalCount: 0,
          uniqueUsers: new Set(),
          avgBuyPrice: 0,
          avgSellPrice: 0,
          totalBuyValue: 0,
          totalSellValue: 0,
          totalPnL: 0,
          byMode: {
            hedging: { buyLots: 0, sellLots: 0, count: 0, pnl: 0 },
            netting: { buyLots: 0, sellLots: 0, count: 0, pnl: 0 },
            binary: { upAmount: 0, downAmount: 0, count: 0, pnl: 0 }
          }
        };
      }

      const data = composedData[symbol];
      data.uniqueUsers.add(userId);
      data.totalCount++;
      data.totalPnL += pnl || 0;

      if (tradeMode === 'binary') {
        if (side === 'up') {
          data.byMode.binary.upAmount += volume;
        } else {
          data.byMode.binary.downAmount += volume;
        }
        data.byMode.binary.count++;
        data.byMode.binary.pnl += pnl || 0;
      } else {
        if (side === 'buy') {
          data.totalBuyLots += volume;
          data.buyCount++;
          data.totalBuyValue += volume * entryPrice;
          data.byMode[tradeMode].buyLots += volume;
        } else {
          data.totalSellLots += volume;
          data.sellCount++;
          data.totalSellValue += volume * entryPrice;
          data.byMode[tradeMode].sellLots += volume;
        }
        data.byMode[tradeMode].count++;
        data.byMode[tradeMode].pnl += pnl || 0;
      }
    };

    // Fetch challenge positions (prop-trading — primary on this platform)
    if (!mode || mode === 'netting' || mode === 'challenge' || mode === 'all') {
      const ChallengePosition = require('./models/ChallengePosition');
      const challengeRows = await ChallengePosition.find({
        status: 'open',
        challengeAccountId: { $nin: await demoAccountIds() }
      }).lean();
      challengeRows.forEach(p => {
        addToComposed(p.symbol, p.side, p.volume || 1, p.entryPrice || 0, p.profit || 0, p.userId, 'netting');
      });
    }

    // Fetch hedging positions
    if (!mode || mode === 'hedging' || mode === 'all') {
      const hedgingQuery = { status: 'open' };
      if (demoUserIds.length > 0) hedgingQuery.userId = { $nin: demoUserIds };
      const hedging = await HedgingPosition.find(hedgingQuery).lean();
      hedging.forEach(p => {
        addToComposed(p.symbol, p.side, p.volume || 0.01, p.entryPrice || 0, p.profit || 0, p.userId, 'hedging');
      });
    }

    // Fetch netting positions
    if (!mode || mode === 'netting' || mode === 'all') {
      const nettingQuery = { status: 'open' };
      if (demoUserIds.length > 0) nettingQuery.userId = { $nin: demoUserIds };
      const netting = await NettingPosition.find(nettingQuery).lean();
      netting.forEach(p => {
        addToComposed(p.symbol, p.side, p.volume || p.quantity || 1, p.avgPrice || 0, p.profit || 0, p.userId, 'netting');
      });
    }

    // Fetch binary trades
    if (!mode || mode === 'binary' || mode === 'all') {
      const binaryQuery = { status: 'active' };
      if (demoUserIds.length > 0) binaryQuery.userId = { $nin: demoUserIds };
      const binary = await BinaryTrade.find(binaryQuery).lean();
      binary.forEach(p => {
        addToComposed(p.symbol, p.direction, p.amount || 0, p.entryPrice || 0, 0, p.userId, 'binary');
      });
    }

    // Calculate averages and convert Sets to counts
    const result = Object.values(composedData).map(data => {
      return {
        ...data,
        uniqueUsers: data.uniqueUsers.size,
        netLots: data.totalBuyLots - data.totalSellLots,
        avgBuyPrice: data.buyCount > 0 ? data.totalBuyValue / data.totalBuyLots : 0,
        avgSellPrice: data.sellCount > 0 ? data.totalSellValue / data.totalSellLots : 0
      };
    });

    // Sort by total count descending
    result.sort((a, b) => b.totalCount - a.totalCount);

    // Calculate totals
    const totals = {
      totalSymbols: result.length,
      totalPositions: result.reduce((sum, r) => sum + r.totalCount, 0),
      totalBuyLots: result.reduce((sum, r) => sum + r.totalBuyLots, 0),
      totalSellLots: result.reduce((sum, r) => sum + r.totalSellLots, 0),
      totalPnL: result.reduce((sum, r) => sum + r.totalPnL, 0),
      totalUniqueUsers: result.reduce((sum, r) => sum + (r.uniqueUsers || 0), 0)
    };

    res.json({
      success: true,
      composed: result,
      totals
    });
  } catch (error) {
    console.error('Error fetching composed positions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get all pending orders across all users
app.get('/api/admin/trades/pending', async (req, res) => {
  try {
    const { search, symbol } = req.query;
    const { HedgingPosition } = require('./models/Position');

    // Get list of demo user IDs to exclude
    const demoUserIds = [];

    const query = { status: 'pending', userId: { $nin: demoUserIds } };
    if (symbol) query.symbol = { $regex: symbol, $options: 'i' };
    const searchUserIds = await resolveUserSearchIds(search);
    const searchOr = buildTradeSearchOr(search, searchUserIds, 'tradeId');
    if (searchOr) query.$or = searchOr;

    const pendingOrders = await HedgingPosition.find(query).sort({ createdAt: -1 }).limit(200);

    res.json({
      success: true,
      orders: pendingOrders.map(o => ({ ...o.toObject(), mode: 'hedging' })),
      total: pendingOrders.length
    });
  } catch (error) {
    console.error('Error fetching pending orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get trade history (all closed trades) with pagination
app.get('/api/admin/trades/history', async (req, res) => {
  try {
    const { page = 1, limit = 50, search, symbol, mode, dateFrom, dateTo } = req.query;
    const ChallengePosition = require('./models/ChallengePosition');
    const ChallengeAccount = require('./models/ChallengeAccount');

    // Get list of demo user IDs to exclude
    const demoUserIds = [];
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));

    // Resolve the search term to user/symbol/trade-id match clauses (see helper).
    const searchUserIds = await resolveUserSearchIds(search);
    const searchOrCp = buildTradeSearchOr(search, searchUserIds, 'positionId');
    const searchOr = buildTradeSearchOr(search, searchUserIds, 'tradeId');

    // ── 1) Closed ChallengePositions (primary on this prop-only platform) ──
    const cpQuery = { status: 'closed', challengeAccountId: { $nin: await demoAccountIds() } };
    if (symbol) cpQuery.symbol = { $regex: symbol, $options: 'i' };
    if (searchOrCp) cpQuery.$or = searchOrCp;
    if (dateFrom || dateTo) {
      cpQuery.closeTime = {};
      if (dateFrom) cpQuery.closeTime.$gte = new Date(dateFrom);
      if (dateTo) cpQuery.closeTime.$lte = new Date(dateTo + 'T23:59:59.999Z');
    }
    const [cpTotal, cpRows] = await Promise.all([
      ChallengePosition.countDocuments(cpQuery),
      ChallengePosition.find(cpQuery).sort({ closeTime: -1 }).skip((pageNum - 1) * pageSize).limit(pageSize).lean()
    ]);
    // Enrich with challenge account code
    const accIds = [...new Set(cpRows.map(p => String(p.challengeAccountId)))];
    const accMap = {};
    if (accIds.length) {
      const accs = await ChallengeAccount.find({ _id: { $in: accIds } }).select('accountId').lean();
      for (const a of accs) accMap[String(a._id)] = a.accountId;
    }
    // Enrich with userName — ChallengePosition.userId stores the User's
    // mongo _id (ObjectId), not their oderId. Look up by _id then build a
    // map keyed by the stringified _id so the row mapping below finds it.
    const cpUserIds = [...new Set(cpRows.map(p => String(p.userId)).filter(Boolean))];
    const cpUserMap = {};
    if (cpUserIds.length) {
      const validIds = cpUserIds.filter(id => mongoose.Types.ObjectId.isValid(id));
      const users = await User.find({ _id: { $in: validIds } }).select('_id oderId name email').lean();
      for (const u of users) cpUserMap[String(u._id)] = u.name || u.email || u.oderId || String(u._id);
    }
    const challengeTrades = cpRows.map(p => ({
      ...p,
      _id: p._id,
      tradeId: p.positionId,
      mode: 'netting',
      type: 'close',
      positionType: 'ChallengePosition',
      challengeAccountCode: accMap[String(p.challengeAccountId)] || '',
      userName: cpUserMap[String(p.userId)] || String(p.userId),
      closePrice: p.closePrice || p.currentPrice,
      executedAt: p.closeTime || p.updatedAt,
      closedAt: p.closeTime
    }));

    // ── 2) Legacy Trade collection (hedging / netting / binary) ──
    const tQuery = { type: { $in: ['close', 'partial_close', 'binary'] }, userId: { $nin: demoUserIds } };
    if (symbol) tQuery.symbol = { $regex: symbol, $options: 'i' };
    if (searchOr) tQuery.$or = searchOr;
    if (mode && mode !== 'all') tQuery.mode = mode;
    if (dateFrom || dateTo) {
      tQuery.executedAt = {};
      if (dateFrom) tQuery.executedAt.$gte = new Date(dateFrom);
      if (dateTo) tQuery.executedAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
    }
    const [tTotal, tRows] = await Promise.all([
      Trade.countDocuments(tQuery),
      Trade.find(tQuery).sort({ executedAt: -1 }).skip((pageNum - 1) * pageSize).limit(pageSize).lean()
    ]);

    // ── 3) Merge, sort, paginate ──
    const merged = [...challengeTrades, ...tRows].sort((a, b) => {
      const ta = new Date(a.executedAt || a.closeTime || a.closedAt || 0);
      const tb = new Date(b.executedAt || b.closeTime || b.closedAt || 0);
      return tb - ta;
    }).slice(0, pageSize);
    const total = cpTotal + tTotal;

    // Summary: aggregate all challenge closed + all Trade closed for totals
    const cpSummary = await ChallengePosition.aggregate([
      { $match: { ...cpQuery } },
      { $group: { _id: null, totalPnL: { $sum: '$profit' }, count: { $sum: 1 }, wins: { $sum: { $cond: [{ $gt: ['$profit', 0] }, 1, 0] } }, losses: { $sum: { $cond: [{ $lt: ['$profit', 0] }, 1, 0] } } } }
    ]);
    const cpStats = cpSummary[0] || { totalPnL: 0, count: 0, wins: 0, losses: 0 };

    const tSummaryRows = await Trade.find(tQuery).select('profit symbol').lean();
    const tPnL = tSummaryRows.reduce((s, t) => s + (t.profit || 0), 0);
    const tWins = tSummaryRows.filter(t => (t.profit || 0) > 0).length;
    const tLosses = tSummaryRows.filter(t => (t.profit || 0) < 0).length;

    const totalPnL = cpStats.totalPnL + tPnL;
    const totalTrades = cpStats.count + tSummaryRows.length;
    const winningTrades = cpStats.wins + tWins;
    const losingTrades = cpStats.losses + tLosses;

    res.json({
      success: true,
      trades: merged,
      pagination: {
        total,
        page: pageNum,
        limit: pageSize,
        pages: Math.ceil(total / pageSize)
      },
      summary: {
        totalTrades,
        totalPnL,
        winningTrades,
        losingTrades,
        winRate: totalTrades > 0 ? ((winningTrades / totalTrades) * 100).toFixed(1) : 0
      }
    });
  } catch (error) {
    console.error('Error fetching trade history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Force close a position
app.post('/api/admin/trades/:id/close', async (req, res) => {
  try {
    const { id } = req.params;
    const { positionType, currentPrice } = req.body;
    const { HedgingPosition, NettingPosition, BinaryTrade } = require('./models/Position');
    const { assertUserInAdminScope } = require('./utils/adminScopeGuard');

    let position;
    let Model;

    if (positionType === 'ChallengePosition') {
      const ChallengePosition = require('./models/ChallengePosition');
      Model = ChallengePosition;
      position = await ChallengePosition.findById(id);
    } else if (positionType === 'HedgingPosition') {
      Model = HedgingPosition;
      position = await HedgingPosition.findById(id);
    } else if (positionType === 'NettingPosition') {
      Model = NettingPosition;
      position = await NettingPosition.findById(id);
    } else if (positionType === 'BinaryTrade') {
      Model = BinaryTrade;
      position = await BinaryTrade.findById(id);
    }

    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }
    if (!(await assertUserInAdminScope(req, res, position.userId))) return;

    const closeP = currentPrice || position.currentPrice || position.entryPrice;

    // ChallengePosition: use challengePropEngine to close properly
    // (updates challenge account wallet, drawdown, profit targets, etc.)
    if (positionType === 'ChallengePosition') {
      const challengePropEngine = require('./services/challengePropEngine.service');
      const result = await challengePropEngine.closePosition(position.positionId, closeP, 'admin');
      return res.json({ success: true, message: 'Challenge position closed by admin', profit: result?.profit || 0 });
    }

    // Calculate profit
    let profit = 0;
    if (positionType === 'BinaryTrade') {
      position.status = 'completed';
      position.result = 'lose';
      position.exitPrice = closeP;
      position.completedAt = new Date();
    } else {
      const priceDiff = position.side === 'buy'
        ? closeP - position.entryPrice
        : position.entryPrice - closeP;
      const sym = position.symbol || '';
      const vol = position.volume || 0;
      profit = priceDiff * vol;

      position.status = 'closed';
      position.closePrice = closeP;
      position.closeTime = new Date();
      position.profit = profit;
      position.closedBy = 'admin';
    }

    await position.save();

    // Record in trade history
    const trade = new Trade({
      tradeId: `ADM-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      oderId: position.oderId || position.tradeId,
      userId: position.userId,
      mode: positionType === 'HedgingPosition' ? 'hedging' : positionType === 'NettingPosition' ? 'netting' : 'binary',
      symbol: position.symbol,
      side: position.side || position.direction,
      volume: position.volume || position.amount,
      entryPrice: position.entryPrice || position.avgPrice,
      closePrice: closeP,
      type: 'close',
      profit: profit,
      commission: position.commission || 0,
      swap: position.swap || 0,
      closedBy: 'admin',
      remark: 'Admin',
      executedAt: new Date(),
      closedAt: new Date()
    });
    await trade.save();

    // Update user wallet
    const user = await User.findOne({ oderId: position.userId });
    if (user) {
      user.settlePnL(profit);
      if (position.marginUsed) user.releaseMargin(position.marginUsed);
      await user.save();
    }

    await saveAdminTradeEditLog(req, {
      userDoc: user,
      tradeUserId: position.userId,
      tradeId: position.oderId || position.tradeId || id,
      action: 'FORCE_CLOSE',
      remark: `Forced close position with exit price ${closeP}`
    });

    res.json({ success: true, message: 'Position closed by admin', profit });
  } catch (error) {
    console.error('Error force closing position:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Run netting F&O option expiry settlement (intrinsic value + cancel expired pending)
app.post('/api/admin/netting/option-expiry-settlement', async (req, res) => {
  try {
    const result = await triggerOptionExpirySettlement();
    res.json({ success: true, result });
  } catch (error) {
    console.error('[Admin] Option expiry settlement:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Cancel a pending order
app.post('/api/admin/trades/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { HedgingPosition } = require('./models/Position');
    const { assertUserInAdminScope } = require('./utils/adminScopeGuard');

    const order = await HedgingPosition.findById(id);
    if (!order || order.status !== 'pending') {
      return res.status(404).json({ error: 'Pending order not found' });
    }
    if (!(await assertUserInAdminScope(req, res, order.userId))) return;

    // Find user for margin release and activity logging
    const user = await User.findOne({ oderId: order.userId });

    // Release margin if held
    if (order.marginUsed && user) {
      user.releaseMargin(order.marginUsed);
      await user.save();
    }

    // Record cancellation
    const trade = new Trade({
      tradeId: `CAN-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      oderId: order.oderId,
      userId: order.userId,
      mode: 'hedging',
      symbol: order.symbol,
      side: order.side,
      volume: order.volume,
      entryPrice: order.entryPrice,
      type: 'cancelled',
      profit: 0,
      executedAt: new Date()
    });
    await trade.save();

    await HedgingPosition.findByIdAndDelete(id);

    // Log activity for order cancellation
    if (user) {
      const cancelUserAgent = req.get('User-Agent') || '';
      await UserActivityLog.logActivity({
        userId: user._id.toString(),
        oderId: order.userId,
        activityType: 'order_cancelled',
        description: `Pending ${order.side.toUpperCase()} order cancelled: ${order.volume} lot(s) ${order.symbol} @ ${order.entryPrice}`,
        metadata: { orderId: order._id, symbol: order.symbol, side: order.side, volume: order.volume, entryPrice: order.entryPrice },
        ipAddress: req.ip,
        userAgent: cancelUserAgent,
        device: cancelUserAgent.includes('Mobile') ? 'mobile' : 'desktop',
        os: parseOS(cancelUserAgent),
        browser: parseBrowser(cancelUserAgent),
        status: 'success'
      });
    }

    await saveAdminTradeEditLog(req, {
      userDoc: user,
      tradeUserId: order.userId,
      tradeId: order.oderId || id,
      action: 'CANCEL_PENDING',
      remark: `Cancelled pending order (Sym: ${order.symbol}, Vol: ${order.volume})`
    });

    res.json({ success: true, message: 'Order cancelled by admin' });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Reopen a closed trade and reverse P/L from wallet
app.post('/api/admin/trades/:id/reopen', async (req, res) => {
  try {
    const { id } = req.params;
    const { mode, userId, pnl } = req.body;
    const TradeModel = require('./models/Trade');

    let position = null;
    let historyTrade = null;

    // Check ChallengePosition first (primary on this prop-only platform)
    const ChallengePosition = require('./models/ChallengePosition');
    position = await ChallengePosition.findById(id);

    if (!position && (mode === 'hedging' || !mode)) {
      position = await HedgingPosition.findById(id);
    }
    if (!position && (mode === 'netting' || !mode)) {
      position = await NettingPosition.findById(id);
    }
    if (!position && (mode === 'binary' || !mode)) {
      position = await BinaryTrade.findById(id);
    }

    // Closed Positions / Trade History list uses Trade _id — resolve real position via oderId
    if (!position) {
      historyTrade = await TradeModel.findById(id);
      if (historyTrade && ['close', 'partial_close'].includes(historyTrade.type)) {
        const tMode = historyTrade.mode || mode;
        if (tMode === 'hedging') {
          position = await HedgingPosition.findOne({
            oderId: historyTrade.oderId,
            userId: historyTrade.userId,
            status: 'closed'
          });
        } else if (tMode === 'netting') {
          position = await NettingPosition.findOne({
            oderId: historyTrade.oderId,
            userId: historyTrade.userId,
            status: 'closed'
          });
        }
      } else if (historyTrade && historyTrade.mode === 'binary' && historyTrade.type === 'binary') {
        position = await BinaryTrade.findOne({
          tradeId: historyTrade.oderId,
          userId: historyTrade.userId,
          status: 'completed'
        });
      }
    }

    if (!position) {
      return res.status(404).json({
        success: false,
        error:
          'Position not found. For history rows, the original closed position must still exist (same oderId).'
      });
    }
    {
      const { assertUserInAdminScope } = require('./utils/adminScopeGuard');
      if (!(await assertUserInAdminScope(req, res, position.userId))) return;
    }

    const uid = String(position.userId || userId || '');
    const userOr = [{ oderId: uid }];
    if (mongoose.Types.ObjectId.isValid(uid)) {
      try {
        userOr.push({ _id: new mongoose.Types.ObjectId(uid) });
      } catch (_) {
        /* ignore */
      }
    }
    const user = await User.findOne({ $or: userOr });

    const oldPnL = historyTrade
      ? Number(historyTrade.profit ?? pnl ?? 0)
      : Number(position.profit ?? position.pnl ?? pnl ?? 0);

    if (user && oldPnL !== 0) {
      user.wallet.balance -= oldPnL;
      user.wallet.equity = user.wallet.balance + user.wallet.credit;
      user.wallet.freeMargin = user.wallet.equity - user.wallet.margin;

      if (oldPnL > 0) {
        user.stats.totalProfit = Math.max(0, (user.stats.totalProfit || 0) - oldPnL);
        user.stats.winningTrades = Math.max(0, (user.stats.winningTrades || 0) - 1);
      } else if (oldPnL < 0) {
        user.stats.totalLoss = Math.max(0, (user.stats.totalLoss || 0) - Math.abs(oldPnL));
        user.stats.losingTrades = Math.max(0, (user.stats.losingTrades || 0) - 1);
      }
      user.stats.totalTrades = Math.max(0, (user.stats.totalTrades || 0) - 1);
      user.stats.netPnL = (user.stats.totalProfit || 0) - (user.stats.totalLoss || 0);
    }

    const marginToRestore = Number(position.marginUsed) || 0;
    if (user && marginToRestore > 0) {
      user.useMargin(marginToRestore);
    }

    if (user) await user.save();

    const modelName = position.constructor?.modelName;
    if (modelName === 'BinaryTrade') {
      position.status = 'active';
      position.result = null;
      position.exitPrice = null;
      position.payout = 0;
      position.completedAt = null;
    } else {
      position.status = 'open';
      position.closePrice = null;
      position.closeTime = null;
      position.profit = 0;
    }

    await position.save();

    await saveAdminTradeEditLog(req, {
      userDoc: user,
      tradeUserId: uid,
      tradeId: position.oderId || position.tradeId || id,
      action: 'REOPEN',
      remark: `Reopened closed position (reversed P/L: ${oldPnL})`
    });

    res.json({
      success: true,
      message: 'Trade reopened and P/L reversed from wallet',
      reversedPnL: oldPnL,
      newWalletBalance: user?.wallet?.balance,
      positionId: position._id
    });
  } catch (error) {
    console.error('Error reopening trade:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Delete trade permanently (no wallet impact)
app.delete('/api/admin/trades/:id/delete', async (req, res) => {
  try {
    const { id } = req.params;
    const { tradeType } = req.body;
    const { HedgingPosition, NettingPosition, BinaryTrade } = require('./models/Position');
    const Trade = require('./models/Trade');

    let doc = null;
    let isChallenge = false;

    const ChallengePosition = require('./models/ChallengePosition');
    if (tradeType === 'open' || !tradeType) {
      doc = await ChallengePosition.findById(id);
      if (doc) isChallenge = true;
      if (!doc) doc = await HedgingPosition.findById(id);
      if (!doc) doc = await NettingPosition.findById(id);
      if (!doc) doc = await BinaryTrade.findById(id);
    }
    if ((tradeType === 'pending' || !tradeType) && !doc) {
      doc = await HedgingPosition.findOne({ _id: id, status: 'pending' });
    }
    if ((tradeType === 'history' || !tradeType) && !doc) {
      doc = await ChallengePosition.findById(id);
      if (doc) isChallenge = true;
      if (!doc) doc = await Trade.findById(id);
    }

    if (!doc) {
      return res.status(404).json({ error: 'Trade not found' });
    }
    {
      const { assertUserInAdminScope } = require('./utils/adminScopeGuard');
      if (!(await assertUserInAdminScope(req, res, doc.userId))) return;
    }

    const tradeUserId = doc.userId;
    const tradeIdForLog = doc.oderId || doc.tradeId || id;
    const wasClosed = doc.status === 'closed';
    const positionPnl = Number(doc.profit ?? doc.pnl ?? 0);

    // ── For CLOSED challenge positions: fully reverse the trade's effect
    //    on the ChallengeAccount BEFORE deleting. This means:
    //    1. Subtract the P/L from wallet balance + equity (give back the
    //       money the trade took, or take back the money it gave).
    //    2. Subtract from dailyPnlMap entry for the close date.
    //    3. Reset DD watermarks to the new currentEquity so the deleted
    //       loss no longer drags down lowestEquityOverall.
    //    4. Recompute DD %, profit %, daily DD % against new equity.
    //    5. If account was FAILED and the reversal brings DDs under the
    //       limits, restore status → ACTIVE and clear FAIL violations
    //       so the user can resume trading.
    let reverted = null;
    if (isChallenge && wasClosed && doc.challengeAccountId) {
      const ChallengeAccount = require('./models/ChallengeAccount');
      const Challenge = require('./models/Challenge');
      const acc = await ChallengeAccount.findById(doc.challengeAccountId).populate('challengeId');
      if (acc) {
        const pnlDiff = -positionPnl; // reversing
        acc.walletBalance = Number(acc.walletBalance || 0) + pnlDiff;
        acc.walletEquity = Number(acc.walletEquity || 0) + pnlDiff;
        acc.currentBalance = Number(acc.currentBalance || 0) + pnlDiff;
        acc.currentEquity = Number(acc.currentEquity || 0) + pnlDiff;
        acc.walletFreeMargin = Math.max(0, Number(acc.walletEquity) - Number(acc.walletMargin || 0));
        acc.totalProfitLoss = Number(acc.totalProfitLoss || 0) + pnlDiff;
        acc.totalTrades = Math.max(0, Number(acc.totalTrades || 0) - 1);

        // dailyPnlMap: subtract this trade's PnL from the close date bucket
        const closeDay = (doc.closeTime ? new Date(doc.closeTime) : new Date()).toISOString().slice(0, 10);
        if (!acc.dailyPnlMap) acc.dailyPnlMap = new Map();
        const prev = acc.dailyPnlMap.get(closeDay) || 0;
        const next = prev - positionPnl;
        if (Math.abs(next) < 0.01) acc.dailyPnlMap.delete(closeDay);
        else acc.dailyPnlMap.set(closeDay, next);
        acc.markModified('dailyPnlMap');

        // Reset DD watermarks to current equity — admin's intent on delete
        // is "make it as if this trade never happened". Subsequent ticks
        // will re-tighten the watermarks naturally.
        acc.lowestEquityToday = acc.currentEquity;
        acc.lowestEquityOverall = acc.currentEquity;
        if (Number(acc.currentEquity) > Number(acc.highestEquity || 0)) {
          acc.highestEquity = acc.currentEquity;
        }
        if (acc.dayStartEquity && Number(acc.dayStartEquity) < Number(acc.currentEquity)) {
          // day-start was lower than the new equity — leave it (legit)
        } else {
          acc.dayStartEquity = acc.currentEquity;
        }

        // Recompute drawdown / profit percentages against the new equity
        const initial = Number(acc.initialBalance) || 0;
        const phaseStart = Number(acc.phaseStartBalance) || initial;
        const newDailyDD = acc.dayStartEquity > 0
          ? Math.max(0, ((Number(acc.dayStartEquity) - Number(acc.lowestEquityToday)) / Number(acc.dayStartEquity)) * 100)
          : 0;
        const newOverallDD = initial > 0
          ? Math.max(0, ((initial - Number(acc.lowestEquityOverall)) / initial) * 100)
          : 0;
        acc.currentDailyDrawdownPercent = newDailyDD;
        acc.currentOverallDrawdownPercent = newOverallDD;
        if (phaseStart > 0) {
          acc.currentProfitPercent = ((Number(acc.currentEquity) - phaseStart) / phaseStart) * 100;
        }

        // If FAILED, check whether the reversal puts DDs back under limits.
        // If yes → restore to ACTIVE silently. Clear ALL violations and
        // failure metadata so the user sees a clean account (no trace of
        // the deleted trade or the failure it caused).
        let restored = false;
        if (acc.status === 'FAILED') {
          const ddRules = acc.challengeId?.rules || {};
          const maxDailyDD = Number(ddRules.maxDailyDrawdownPercent || 0);
          const maxOverallDD = Number(ddRules.maxOverallDrawdownPercent || 0);
          const dailyOk = !maxDailyDD || newDailyDD < maxDailyDD;
          const overallOk = !maxOverallDD || newOverallDD < maxOverallDD;
          if (dailyOk && overallOk) {
            // Restore to the account's REAL live status: a funded account goes
            // back to FUNDED, an evaluation to ACTIVE. Hardcoding 'ACTIVE' here
            // demoted funded accounts (accountType FUNDED) out of the Passed
            // Challenges page and blocked withdrawals.
            acc.status = acc.accountType === 'FUNDED' ? 'FUNDED' : 'ACTIVE';
            acc.failedAt = null;
            acc.failReason = '';
            acc.violations = [];   // ← wipe ALL warnings + fails
            restored = true;
          }
        } else {
          // Even when not restoring, drop any violation tagged to this
          // specific trade so the user doesn't see orphaned warnings.
          if (Array.isArray(acc.violations) && doc._id) {
            const removedId = String(doc._id);
            acc.violations = acc.violations.filter(v => {
              if (!v.tradeId) return true;
              return String(v.tradeId) !== removedId;
            });
          }
        }

        await acc.save();
        reverted = {
          accountId: acc.accountId,
          pnlReversed: positionPnl,
          newBalance: acc.walletBalance,
          newDailyDD: newDailyDD,
          newOverallDD: newOverallDD,
          statusRestored: restored
        };
      }
    }

    await doc.deleteOne();

    await saveAdminTradeEditLog(req, {
      userDoc: null,
      tradeUserId,
      tradeId: tradeIdForLog,
      action: 'DELETE_TRADE',
      remark: `Permanently deleted trade (list: ${tradeType || 'auto'}, symbol: ${doc.symbol || 'n/a'}, pnl reversed: ${positionPnl}${reverted?.statusRestored ? ', account restored ACTIVE' : ''})`
    });

    res.json({
      success: true,
      message: reverted?.statusRestored
        ? `Trade deleted. ₹${positionPnl.toFixed(2)} P/L reversed and account ${reverted.accountId} restored to ACTIVE.`
        : reverted
          ? `Trade deleted. ₹${positionPnl.toFixed(2)} P/L reversed on account ${reverted.accountId}.`
          : 'Trade deleted permanently.',
      reverted
    });
  } catch (error) {
    console.error('Error deleting trade:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Close trade with custom P/L and sync with user wallet
app.post('/api/admin/trades/:id/close-with-pnl', async (req, res) => {
  try {
    const { id } = req.params;
    const { entryPrice, closePrice, volume, pnl, mode, userId } = req.body;
    const { HedgingPosition, NettingPosition, BinaryTrade } = require('./models/Position');
    const Trade = require('./models/Trade');

    let position;

    // Check ChallengePosition first (primary on this prop-only platform)
    const ChallengePosition = require('./models/ChallengePosition');
    position = await ChallengePosition.findById(id);
    if (position) {
      // For challenge positions, use challengePropEngine to close properly
      const { assertUserInAdminScope } = require('./utils/adminScopeGuard');
      if (!(await assertUserInAdminScope(req, res, position.userId))) return;
      // Update entry price if changed before closing
      if (entryPrice !== undefined) position.entryPrice = entryPrice;
      if (volume !== undefined) position.volume = volume;
      await position.save();
      const challengePropEngine = require('./services/challengePropEngine.service');
      const closeP = closePrice || position.currentPrice || position.entryPrice;
      const result = await challengePropEngine.closePosition(position.positionId, closeP, 'admin');
      return res.json({ success: true, message: 'Challenge trade closed & synced to challenge account', profit: result?.profit || 0, walletSynced: false });
    }

    // Try to find position in different collections based on mode
    if (mode === 'hedging' || !mode) {
      position = await HedgingPosition.findById(id);
    }
    if (!position && (mode === 'netting' || !mode)) {
      position = await NettingPosition.findById(id);
    }
    if (!position && (mode === 'binary' || !mode)) {
      position = await BinaryTrade.findById(id);
    }

    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }
    {
      const { assertUserInAdminScope } = require('./utils/adminScopeGuard');
      if (!(await assertUserInAdminScope(req, res, position.userId))) return;
    }

    // Update position with new values and close it
    if (entryPrice !== undefined) {
      position.entryPrice = entryPrice;
      if (position.avgPrice !== undefined) position.avgPrice = entryPrice;
    }
    if (closePrice !== undefined) {
      position.closePrice = closePrice;
    }
    if (volume !== undefined) {
      position.volume = volume;
      if (position.lotSize !== undefined) position.lotSize = volume;
    }
    
    position.profit = pnl || 0;
    position.pnl = pnl || 0;
    position.status = 'closed';
    position.closeTime = new Date();
    position.closedAt = new Date();

    await position.save();

    // Update user wallet with P/L
    // position.userId may be an ObjectId (ChallengePosition) or a string
    // oderId (legacy collections). Coerce to string before matching so the
    // optional-chain regex doesn't blow up on a non-string value.
    const userOderId = String(position.userId || userId || '');
    const isObjectIdLike = /^[0-9a-fA-F]{24}$/.test(userOderId);
    const user = await User.findOne({
      $or: [
        { oderId: userOderId },
        ...(isObjectIdLike ? [{ _id: userOderId }] : [])
      ]
    });
    
    if (user) {
      // Add P/L to wallet balance
      user.wallet.balance += (pnl || 0);
      user.wallet.equity = user.wallet.balance + user.wallet.credit;
      
      // Release margin
      const marginUsed = position.marginUsed || position.margin || 0;
      user.wallet.margin = Math.max(0, (user.wallet.margin || 0) - marginUsed);
      user.wallet.freeMargin = user.wallet.equity - user.wallet.margin;
      
      // Update stats
      user.stats.totalTrades = (user.stats.totalTrades || 0) + 1;
      if (pnl > 0) {
        user.stats.winningTrades = (user.stats.winningTrades || 0) + 1;
        user.stats.totalProfit = (user.stats.totalProfit || 0) + pnl;
      } else if (pnl < 0) {
        user.stats.losingTrades = (user.stats.losingTrades || 0) + 1;
        user.stats.totalLoss = (user.stats.totalLoss || 0) + Math.abs(pnl);
      }
      
      await user.save();
    }

    // Record in trade history
    const trade = new Trade({
      tradeId: `ADM-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      oderId: position.oderId || position.tradeId,
      userId: position.userId,
      mode: mode || 'hedging',
      symbol: position.symbol,
      side: position.side || position.direction,
      volume: volume || position.volume,
      entryPrice: entryPrice || position.entryPrice,
      closePrice: closePrice,
      type: 'close',
      profit: pnl || 0,
      closedBy: 'admin',
      remark: 'Admin',
      executedAt: new Date(),
      closedAt: new Date()
    });
    await trade.save();

    await saveAdminTradeEditLog(req, {
      userDoc: user,
      tradeUserId: position.userId || userId,
      tradeId: position.oderId || position.tradeId || id,
      action: 'FORCE_CLOSE',
      remark: `Closed position with custom P/L ${pnl} (entry ${entryPrice ?? position.entryPrice}, close ${closePrice}, vol ${volume ?? position.volume})`
    });

    res.json({ 
      success: true, 
      message: 'Trade closed and wallet synced',
      profit: pnl,
      newWalletBalance: user?.wallet?.balance
    });
  } catch (error) {
    console.error('Error closing trade with P/L:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Edit trade (entry price, close price, P/L) and sync with user wallet
app.put('/api/admin/trades/:id/edit', async (req, res) => {
  try {
    const { id } = req.params;
    const { entryPrice, closePrice, volume, pnl, mode, userId } = req.body;
    const { HedgingPosition, NettingPosition, BinaryTrade } = require('./models/Position');
    const Trade = require('./models/Trade');

    let position;
    let Model;
    let oldPnL = 0;
    let isTradeHistory = false;

    // Try to find position in different collections based on mode
    // Check ChallengePosition first (primary on this prop-only platform)
    const ChallengePosition = require('./models/ChallengePosition');
    let isChallengePosition = false;
    position = await ChallengePosition.findById(id);
    if (position) {
      Model = ChallengePosition;
      isChallengePosition = true;
    }
    if (!position && (mode === 'hedging' || !mode)) {
      position = await HedgingPosition.findById(id);
      Model = HedgingPosition;
    }
    if (!position && (mode === 'netting' || !mode)) {
      position = await NettingPosition.findById(id);
      Model = NettingPosition;
    }
    if (!position && (mode === 'binary' || !mode)) {
      position = await BinaryTrade.findById(id);
      Model = BinaryTrade;
    }
    
    // Also check Trade history collection
    if (!position) {
      position = await Trade.findById(id);
      Model = Trade;
      isTradeHistory = true;
    }

    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }
    {
      const { assertUserInAdminScope } = require('./utils/adminScopeGuard');
      if (!(await assertUserInAdminScope(req, res, position.userId))) return;
    }

    // Determine if the trade is closed (only sync wallet for closed trades)
    const isClosed = position.status === 'closed' || isTradeHistory;

    // Store old P/L for wallet adjustment (only relevant for closed trades)
    oldPnL = position.profit || position.pnl || 0;

    // Update position fields
    if (entryPrice !== undefined) {
      position.entryPrice = entryPrice;
      if (position.avgPrice !== undefined) position.avgPrice = entryPrice;
      if (position.openPrice !== undefined) position.openPrice = entryPrice;
    }
    if (closePrice !== undefined) {
      position.closePrice = closePrice;
      position.currentPrice = closePrice;
    }
    if (volume !== undefined) {
      position.volume = volume;
      if (position.lotSize !== undefined) position.lotSize = volume;
    }
    if (pnl !== undefined) {
      position.profit = pnl;
      position.pnl = pnl;
      // Only set unrealizedPnL for open trades; for closed trades P/L is realized
      if (!isClosed) {
        position.unrealizedPnL = pnl;
      }
    }

    await position.save();

    // Only sync P/L to wallet for CLOSED trades
    // Open trades should NOT affect wallet balance — their P/L is unrealized
    let pnlDiff = 0;
    let walletSynced = false;
    // position.userId may be an ObjectId (ChallengePosition) or a string
    // oderId (legacy collections). Coerce to string before matching so the
    // optional-chain regex doesn't blow up on a non-string value.
    const userOderId = String(position.userId || userId || '');
    const isObjectIdLike = /^[0-9a-fA-F]{24}$/.test(userOderId);
    const user = await User.findOne({
      $or: [
        { oderId: userOderId },
        ...(isObjectIdLike ? [{ _id: userOderId }] : [])
      ]
    });

    // Challenge positions use the isolated sub-wallet on ChallengeAccount,
    // NOT the user's main wallet — skip main-wallet sync for them.
    if (isClosed && user && !isChallengePosition) {
      // Calculate P/L difference for wallet sync
      pnlDiff = (pnl || 0) - oldPnL;

      if (pnlDiff !== 0) {
        // Adjust wallet balance with P/L difference
        user.wallet.balance += pnlDiff;
        user.wallet.equity = user.wallet.balance + user.wallet.credit;
        user.wallet.freeMargin = user.wallet.equity - user.wallet.margin;

        // Update stats
        if (pnl > 0) {
          user.stats.totalProfit = (user.stats.totalProfit || 0) + Math.max(0, pnlDiff);
        } else if (pnl < 0) {
          user.stats.totalLoss = (user.stats.totalLoss || 0) + Math.abs(Math.min(0, pnlDiff));
        }

        await user.save();
        walletSynced = true;
      }
    }

    // For closed Challenge positions: sync the P/L diff into the
    // ChallengeAccount's sub-wallet (walletBalance, currentBalance,
    // currentEquity) and the dailyPnlMap entry, then recompute DD
    // watermarks so the Objectives panel reflects the edited P/L.
    if (isClosed && isChallengePosition) {
      pnlDiff = (pnl || 0) - oldPnL;
      if (pnlDiff !== 0) {
        const ChallengeAccount = require('./models/ChallengeAccount');
        const acc = await ChallengeAccount.findById(position.challengeAccountId);
        if (acc) {
          acc.walletBalance = Number(acc.walletBalance || 0) + pnlDiff;
          acc.walletEquity = Number(acc.walletEquity || 0) + pnlDiff;
          acc.currentBalance = Number(acc.currentBalance || 0) + pnlDiff;
          acc.currentEquity = Number(acc.currentEquity || 0) + pnlDiff;
          acc.walletFreeMargin = Math.max(0, Number(acc.walletEquity) - Number(acc.walletMargin || 0));
          acc.totalProfitLoss = (Number(acc.totalProfitLoss) || 0) + pnlDiff;

          // Update dailyPnlMap for the trade's close date
          const closeDay = (position.closeTime ? new Date(position.closeTime) : new Date()).toISOString().slice(0, 10);
          if (!acc.dailyPnlMap) acc.dailyPnlMap = new Map();
          const prev = acc.dailyPnlMap.get(closeDay) || 0;
          acc.dailyPnlMap.set(closeDay, prev + pnlDiff);
          acc.markModified('dailyPnlMap');

          // Recompute DD watermarks against the new equity
          if (Number(acc.currentEquity) < Number(acc.lowestEquityToday || acc.currentEquity)) {
            acc.lowestEquityToday = acc.currentEquity;
          }
          if (Number(acc.currentEquity) < Number(acc.lowestEquityOverall || acc.currentEquity)) {
            acc.lowestEquityOverall = acc.currentEquity;
          }
          if (Number(acc.currentEquity) > Number(acc.highestEquity || 0)) {
            acc.highestEquity = acc.currentEquity;
          }

          // Recompute current DD / profit percent so the Objectives panel
          // shows up-to-date numbers immediately.
          const initial = Number(acc.initialBalance) || 0;
          const phaseStart = Number(acc.phaseStartBalance) || initial;
          if (initial > 0) {
            acc.currentOverallDrawdownPercent = Math.max(0,
              ((initial - Number(acc.lowestEquityOverall)) / initial) * 100
            );
          }
          if (acc.dayStartEquity && Number(acc.dayStartEquity) > 0) {
            acc.currentDailyDrawdownPercent = Math.max(0,
              ((Number(acc.dayStartEquity) - Number(acc.lowestEquityToday)) / Number(acc.dayStartEquity)) * 100
            );
          }
          if (phaseStart > 0) {
            acc.currentProfitPercent = ((Number(acc.currentEquity) - phaseStart) / phaseStart) * 100;
          }

          await acc.save();
          walletSynced = true;
        }
      }
    }

    // Also update Trade history if exists (Trade already required above)
    await Trade.updateMany(
      { $or: [{ tradeId: position.tradeId }, { oderId: position.oderId }] },
      { 
        $set: { 
          entryPrice: entryPrice || position.entryPrice,
          closePrice: closePrice || position.closePrice,
          profit: pnl || 0
        }
      }
    );

    await saveAdminTradeEditLog(req, {
      userDoc: user,
      tradeUserId: position.userId || userId,
      tradeId: position.oderId || position.tradeId || id,
      action: 'EDIT_PRICE_VOLUME',
      remark: `Updated trade — entry: ${entryPrice ?? '-'}, close: ${closePrice ?? '-'}, volume: ${volume ?? '-'}, P/L: ${pnl ?? '-'}, symbol: ${position.symbol || 'n/a'}, ${isClosed ? 'closed' : 'open'}`
    });

    res.json({ 
      success: true, 
      message: isClosed 
        ? 'Trade updated and wallet synced' 
        : 'Trade updated (wallet not affected — trade is still open)',
      position: position.toObject(),
      walletSynced,
      walletAdjustment: pnlDiff,
      newWalletBalance: user?.wallet?.balance
    });
  } catch (error) {
    console.error('Error editing trade:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fetch admin trade edit logs
app.get('/api/admin/trade-edit-logs', async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      query = {
        $or: [
          { adminName: { $regex: search, $options: 'i' } },
          { userName: { $regex: search, $options: 'i' } },
          { action: { $regex: search, $options: 'i' } },
          { remark: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const AdminTradeEditLog = require('./models/AdminTradeEditLog');
    const logs = await AdminTradeEditLog.find(query)
      .sort({ timestamp: -1 })
      .skip(Number(skip))
      .limit(Number(limit));
    const total = await AdminTradeEditLog.countDocuments(query);

    res.json({ success: true, logs, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    console.error('Error fetching trade edit logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== KYC MANAGEMENT ENDPOINTS ==============

// User: Submit KYC
app.post('/api/kyc/submit', async (req, res) => {
  try {
    const { userId, oderId, documentType, documentNumber, frontImage, backImage, selfieImage, fullName, dateOfBirth, address } = req.body;

    // Explicit per-field validation so the client gets a clear "which field
    // failed" message instead of a generic Mongoose 500. (These match the
    // required fields on the KYC model.)
    const missing = [];
    if (!userId) missing.push('userId');
    if (!oderId) missing.push('oderId');
    if (!documentType) missing.push('documentType');
    if (!documentNumber) missing.push('documentNumber');
    if (!fullName) missing.push('fullName');
    if (!frontImage) missing.push('frontImage');
    if (missing.length) {
      return res.status(400).json({ success: false, error: `Missing required field(s): ${missing.join(', ')}` });
    }
    const allowedDocs = ['aadhaar', 'pan', 'passport', 'driving_license', 'voter_id'];
    if (!allowedDocs.includes(documentType)) {
      return res.status(400).json({ success: false, error: `Invalid documentType '${documentType}'. Allowed: ${allowedDocs.join(', ')}` });
    }

    // Check if user already has pending/approved KYC
    const existingKyc = await KYC.findOne({ userId, status: { $in: ['pending', 'approved'] } });
    if (existingKyc) {
      if (existingKyc.status === 'approved') {
        return res.status(400).json({ error: 'KYC already approved' });
      }
      return res.status(400).json({ error: 'KYC verification already pending' });
    }
    
    const kyc = new KYC({
      userId,
      oderId,
      documentType,
      documentNumber,
      frontImage,
      backImage,
      selfieImage,
      fullName,
      dateOfBirth,
      address,
      status: 'pending',
      submittedAt: new Date()
    });
    
    await kyc.save();
    
    // Log activity
    await UserActivityLog.logActivity({
      userId,
      oderId,
      activityType: 'kyc_submitted',
      description: `KYC submitted with ${documentType}`,
      metadata: { kycId: kyc._id, documentType },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    res.json({ success: true, message: 'KYC submitted successfully', kyc });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User: Get KYC status
app.get('/api/kyc/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const kyc = await KYC.findOne({ $or: [{ userId }, { oderId: userId }] }).sort({ submittedAt: -1 });
    
    if (!kyc) {
      return res.json({ success: true, status: 'not_submitted', kyc: null });
    }
    
    res.json({ success: true, status: kyc.status, kyc });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get all KYC submissions with pagination
app.get('/api/admin/kyc', async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { oderId: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } },
        { documentNumber: { $regex: search, $options: 'i' } }
      ];
    }
    
    const total = await KYC.countDocuments(query);
    const kycs = await KYC.find(query)
      .sort({ submittedAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    // Get user details for each KYC - query by oderId only to avoid ObjectId cast errors
    const kycWithUsers = await Promise.all(kycs.map(async (kyc) => {
      let user = null;
      try {
        user = await User.findOne({ oderId: kyc.oderId }).select('name email phone oderId');
      } catch (err) {
        console.error('Error fetching user for KYC:', err.message);
      }
      return { ...kyc.toObject(), user };
    }));
    
    res.json({
      success: true,
      kycs: kycWithUsers,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get pending KYC count
app.get('/api/admin/kyc/pending-count', async (req, res) => {
  try {
    const count = await KYC.countDocuments({ status: 'pending' });
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Approve KYC
app.put('/api/admin/kyc/:kycId/approve', async (req, res) => {
  try {
    const { kycId } = req.params;
    const { adminNotes, reviewedBy } = req.body;
    
    const kyc = await KYC.findById(kycId);
    if (!kyc) {
      return res.status(404).json({ error: 'KYC not found' });
    }
    
    kyc.status = 'approved';
    kyc.reviewedBy = reviewedBy || 'Admin';
    kyc.reviewedAt = new Date();
    kyc.adminNotes = adminNotes;
    await kyc.save();
    
    // Update user's KYC status
    await User.findOneAndUpdate(
      { $or: [{ _id: kyc.userId }, { oderId: kyc.oderId }] },
      { kycVerified: true, kycStatus: 'approved' }
    );
    
    // Log activity
    await UserActivityLog.logActivity({
      userId: kyc.userId,
      oderId: kyc.oderId,
      activityType: 'kyc_approved',
      description: 'KYC verification approved',
      metadata: { kycId: kyc._id, reviewedBy }
    });
    
    res.json({ success: true, message: 'KYC approved', kyc });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Reject KYC
app.put('/api/admin/kyc/:kycId/reject', async (req, res) => {
  try {
    const { kycId } = req.params;
    const { rejectionReason, adminNotes, reviewedBy } = req.body;
    
    const kyc = await KYC.findById(kycId);
    if (!kyc) {
      return res.status(404).json({ error: 'KYC not found' });
    }
    
    kyc.status = 'rejected';
    kyc.rejectionReason = rejectionReason;
    kyc.reviewedBy = reviewedBy || 'Admin';
    kyc.reviewedAt = new Date();
    kyc.adminNotes = adminNotes;
    await kyc.save();
    
    // Update user's KYC status
    await User.findOneAndUpdate(
      { $or: [{ _id: kyc.userId }, { oderId: kyc.oderId }] },
      { kycVerified: false, kycStatus: 'rejected' }
    );
    
    // Log activity
    await UserActivityLog.logActivity({
      userId: kyc.userId,
      oderId: kyc.oderId,
      activityType: 'kyc_rejected',
      description: `KYC verification rejected: ${rejectionReason}`,
      metadata: { kycId: kyc._id, rejectionReason, reviewedBy }
    });
    
    res.json({ success: true, message: 'KYC rejected', kyc });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Request KYC resubmission
app.put('/api/admin/kyc/:kycId/resubmit', async (req, res) => {
  try {
    const { kycId } = req.params;
    const { rejectionReason, adminNotes, reviewedBy } = req.body;
    
    const kyc = await KYC.findById(kycId);
    if (!kyc) {
      return res.status(404).json({ error: 'KYC not found' });
    }
    
    kyc.status = 'resubmit';
    kyc.rejectionReason = rejectionReason;
    kyc.reviewedBy = reviewedBy || 'Admin';
    kyc.reviewedAt = new Date();
    kyc.adminNotes = adminNotes;
    await kyc.save();
    
    // Update user's KYC status
    await User.findOneAndUpdate(
      { $or: [{ _id: kyc.userId }, { oderId: kyc.oderId }] },
      { kycVerified: false, kycStatus: 'resubmit' }
    );
    
    res.json({ success: true, message: 'KYC resubmission requested', kyc });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get user's KYC documents
app.get('/api/admin/kyc/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const kycs = await KYC.find({ $or: [{ userId }, { oderId: userId }] }).sort({ submittedAt: -1 });
    res.json({ success: true, kycs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== ADMIN WATCHLIST ENDPOINTS ==============

const AdminWatchlist = require('./models/AdminWatchlist');

// Admin: Get watchlist for a segment
app.get('/api/admin/watchlist/:segment', async (req, res) => {
  try {
    const { segment } = req.params;
    const watchlist = await AdminWatchlist.findOne({ segment });
    res.json({ success: true, instruments: watchlist?.instruments || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Add instrument to watchlist
app.post('/api/admin/watchlist', async (req, res) => {
  try {
    const { segment, instrument } = req.body;
    if (!segment || !instrument) {
      return res.status(400).json({ success: false, error: 'Segment and instrument required' });
    }
    
    let watchlist = await AdminWatchlist.findOne({ segment });
    
    if (!watchlist) {
      watchlist = new AdminWatchlist({ segment, instruments: [] });
    }
    
    const key = instrument.token || instrument.symbol;
    const exists = watchlist.instruments.some(w => (w.token || w.symbol) === key);
    if (!exists) {
      watchlist.instruments.push(instrument);
      await watchlist.save();
    }
    
    res.json({ success: true, instruments: watchlist.instruments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Remove instrument from watchlist
app.delete('/api/admin/watchlist', async (req, res) => {
  try {
    const { segment, symbol } = req.body;
    if (!segment || !symbol) {
      return res.status(400).json({ success: false, error: 'Segment and symbol required' });
    }
    
    const watchlist = await AdminWatchlist.findOne({ segment });
    if (watchlist) {
      watchlist.instruments = watchlist.instruments.filter(w => w.symbol !== symbol);
      await watchlist.save();
    }
    
    res.json({ success: true, instruments: watchlist?.instruments || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== USER ACTIVITY LOG ENDPOINTS ==============

// Admin: Get all activity logs with pagination
app.get('/api/admin/activity-logs', async (req, res) => {
  try {
    const { userId, activityType, search, page = 1, limit = 20, startDate, endDate } = req.query;
    const query = {};
    
    if (userId && userId !== 'all') {
      query.$or = [{ userId }, { oderId: userId }];
    }
    
    if (activityType && activityType !== 'all') {
      query.activityType = activityType;
    }
    
    // Date filter
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.timestamp.$lte = end;
      }
    }
    
    if (search) {
      const searchQuery = [
        { oderId: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchQuery }];
        delete query.$or;
      } else {
        query.$or = searchQuery;
      }
    }
    
    const total = await UserActivityLog.countDocuments(query);
    const logs = await UserActivityLog.find(query)
      .sort({ timestamp: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    const logsWithUsers = await Promise.all(logs.map(async (log) => {
      const user = await User.findOne({ $or: [{ _id: log.userId }, { oderId: log.oderId }] })
        .select('name email phone oderId');
      return { ...log.toObject(), user };
    }));
    
    res.json({
      success: true,
      logs: logsWithUsers,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Export activity logs as CSV/Excel
app.get('/api/admin/activity-logs/export', async (req, res) => {
  try {
    const { userId, activityType, startDate, endDate, format = 'csv' } = req.query;
    const query = {};
    
    if (userId && userId !== 'all') {
      query.$or = [{ userId }, { oderId: userId }];
    }
    
    if (activityType && activityType !== 'all') {
      query.activityType = activityType;
    }
    
    // Date filter
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.timestamp.$lte = end;
      }
    }
    
    const logs = await UserActivityLog.find(query).sort({ timestamp: -1 }).limit(10000);
    
    // Get user details for each log
    const logsWithUsers = await Promise.all(logs.map(async (log) => {
      const user = await User.findOne({ $or: [{ _id: log.userId }, { oderId: log.oderId }] })
        .select('name email phone oderId');
      return { ...log.toObject(), user };
    }));
    
    // Generate CSV
    const headers = ['Date', 'Time', 'User ID', 'User Name', 'Email', 'Activity Type', 'Description', 'Status', 'IP Address', 'OS', 'Browser', 'Device'];
    const rows = logsWithUsers.map(log => {
      const date = new Date(log.timestamp);
      return [
        date.toLocaleDateString(),
        date.toLocaleTimeString(),
        log.oderId || log.userId,
        log.user?.name || '-',
        log.user?.email || '-',
        log.activityType?.replace(/_/g, ' '),
        `"${(log.description || '').replace(/"/g, '""')}"`,
        log.status || '-',
        log.ipAddress || '-',
        log.os || '-',
        log.browser || '-',
        log.device || '-'
      ].join(',');
    });
    
    const csv = [headers.join(','), ...rows].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=activity-logs-${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get user's activity logs with pagination
app.get('/api/admin/activity-logs/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { activityType, page = 1, limit = 20 } = req.query;
    
    const query = { $or: [{ userId }, { oderId: userId }] };
    
    if (activityType && activityType !== 'all') {
      query.activityType = activityType;
    }
    
    const total = await UserActivityLog.countDocuments(query);
    const logs = await UserActivityLog.find(query)
      .sort({ timestamp: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    res.json({
      success: true,
      logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get activity stats
app.get('/api/admin/activity-logs/stats', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayLogins = await UserActivityLog.countDocuments({ activityType: 'login', timestamp: { $gte: today } });
    const todayTrades = await UserActivityLog.countDocuments({ activityType: { $in: ['trade_open', 'trade_close'] }, timestamp: { $gte: today } });
    const todayDeposits = await UserActivityLog.countDocuments({ activityType: 'deposit_request', timestamp: { $gte: today } });
    const todayWithdrawals = await UserActivityLog.countDocuments({ activityType: 'withdrawal_request', timestamp: { $gte: today } });
    
    res.json({
      success: true,
      stats: {
        todayLogins,
        todayTrades,
        todayDeposits,
        todayWithdrawals
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to log user activity (can be called from other routes)
const logUserActivity = async (data) => {
  try {
    await UserActivityLog.logActivity(data);
  } catch (error) {
    console.error('Error logging activity:', error);
  }
};

// ============== ADMIN ACTIVITY LOG ENDPOINTS ==============

// Parse OS from User-Agent
const parseOS = (userAgent) => {
  if (!userAgent) return 'Unknown';
  // APK identifies itself as "BharatFundedMobile/1.0.0 (android 33; Mobile)"
  if (/BharatFundedMobile/i.test(userAgent)) {
    if (/android/i.test(userAgent)) return 'Android';
    if (/ios/i.test(userAgent)) return 'iOS';
    return 'Mobile';
  }
  if (userAgent.includes('Windows NT 10')) return 'Windows 10';
  if (userAgent.includes('Windows NT 11')) return 'Windows 11';
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac OS X') || userAgent.includes('Macintosh')) return 'macOS';
  if (userAgent.includes('Linux') && userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('Linux')) return 'Linux';
  if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';
  if (userAgent.includes('Android')) return 'Android';
  return 'Unknown';
};

// Parse Browser from User-Agent
const parseBrowser = (userAgent) => {
  if (!userAgent) return 'Unknown';
  if (/BharatFundedMobile/i.test(userAgent)) return 'DhanFunded App';
  if (userAgent.includes('Edg/')) return 'Edge';
  if (userAgent.includes('OPR/') || userAgent.includes('Opera')) return 'Opera';
  if (userAgent.includes('Brave')) return 'Brave';
  if (userAgent.includes('Vivaldi')) return 'Vivaldi';
  if (userAgent.includes('Firefox/')) return 'Firefox';
  if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) return 'Safari';
  if (userAgent.includes('Chrome/')) return 'Chrome';
  return 'Unknown';
};

// Resolve a useful UA string: prefer X-Client-UA (set by mobile app) when the
// browser/native http client doesn't send a real User-Agent.
const resolveUA = (req) => req.get('X-Client-UA') || req.get('User-Agent') || '';
// Determine device from custom client header first, then UA fallback.
const resolveDevice = (req) => {
  const ua = resolveUA(req);
  if (req.get('X-Client') === 'mobile-app' || /BharatFundedMobile|Mobile|Android|iPhone|iPad/i.test(ua)) return 'mobile';
  return 'desktop';
};

// Admin: Get SubAdmin activity logs
app.get('/api/admin/subadmin-activity-logs', async (req, res) => {
  try {
    const { adminId, activityType, search, page = 1, limit = 20, startDate, endDate } = req.query;
    const query = { role: 'sub_admin' };
    
    if (adminId && adminId !== 'all') {
      query.$or = [{ adminId }, { oderId: adminId }];
    }
    
    if (activityType && activityType !== 'all') {
      query.activityType = activityType;
    }
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.timestamp.$lte = end;
      }
    }
    
    if (search) {
      const searchQuery = [
        { oderId: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchQuery }];
        delete query.$or;
      } else {
        query.$or = searchQuery;
      }
    }
    
    const total = await AdminActivityLog.countDocuments(query);
    const logs = await AdminActivityLog.find(query)
      .sort({ timestamp: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    // Get admin details for each log
    const logsWithAdmins = await Promise.all(logs.map(async (log) => {
      const admin = await Admin.findOne({ $or: [{ _id: log.adminId }, { oderId: log.oderId }] })
        .select('name email phone oderId role');
      return { ...log.toObject(), admin };
    }));
    
    res.json({
      success: true,
      logs: logsWithAdmins,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get Broker activity logs
app.get('/api/admin/broker-activity-logs', async (req, res) => {
  try {
    const { adminId, activityType, search, page = 1, limit = 20, startDate, endDate } = req.query;
    const query = { role: 'broker' };
    
    if (adminId && adminId !== 'all') {
      query.$or = [{ adminId }, { oderId: adminId }];
    }
    
    if (activityType && activityType !== 'all') {
      query.activityType = activityType;
    }
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.timestamp.$lte = end;
      }
    }
    
    if (search) {
      const searchQuery = [
        { oderId: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchQuery }];
        delete query.$or;
      } else {
        query.$or = searchQuery;
      }
    }
    
    const total = await AdminActivityLog.countDocuments(query);
    const logs = await AdminActivityLog.find(query)
      .sort({ timestamp: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    // Get admin details for each log
    const logsWithAdmins = await Promise.all(logs.map(async (log) => {
      const admin = await Admin.findOne({ $or: [{ _id: log.adminId }, { oderId: log.oderId }] })
        .select('name email phone oderId role');
      return { ...log.toObject(), admin };
    }));
    
    res.json({
      success: true,
      logs: logsWithAdmins,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// TEST: Create a test admin activity log entry (remove after debugging)
app.post('/api/admin/test-activity-log', async (req, res) => {
  try {
    const log = await AdminActivityLog.logActivity({
      adminId: 'test',
      oderId: 'test',
      role: 'admin',
      activityType: 'settings_change',
      description: 'TEST LOG ENTRY — if you see this, logging works',
      metadata: { test: true, time: new Date().toISOString() },
      ipAddress: req.ip || '',
      status: 'success'
    });
    const count = await AdminActivityLog.countDocuments();
    res.json({ success: true, log, totalLogsInDB: count });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, stack: err.stack });
  }
});

// Admin: Get combined activity logs for ALL admin roles (admin + sub_admin + broker)
app.get('/api/admin/all-activity-logs', async (req, res) => {
  try {
    const { role, activityType, search, page = 1, limit = 30, startDate, endDate } = req.query;
    const query = {};

    if (role && role !== 'all') query.role = role;
    if (activityType && activityType !== 'all') query.activityType = activityType;

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.timestamp.$lte = end;
      }
    }

    if (search) {
      query.$or = [
        { oderId: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await AdminActivityLog.countDocuments(query);
    const logs = await AdminActivityLog.find(query)
      .sort({ timestamp: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    // Resolve admin details for each log. Super Admin lives in User collection,
    // Sub-Admin/Broker live in Admin collection. Try both, never crash on invalid ObjectId.
    const logsWithAdmins = logs.map((log) => {
      const obj = log.toObject();
      // admin details will be populated below
      obj.admin = null;
      return obj;
    });

    for (const logObj of logsWithAdmins) {
      try {
        const isValidId = /^[a-f\d]{24}$/i.test(logObj.adminId);
        if (isValidId) {
          // Try Admin collection first (sub-admin/broker)
          let found = await Admin.findById(logObj.adminId).select('name email oderId role').lean();
          if (!found) {
            // Fall back to User collection (super admin)
            found = await User.findById(logObj.adminId).select('name email oderId role').lean();
          }
          if (found) logObj.admin = found;
        }
        // If adminId is not a valid ObjectId (e.g. 'system'), try by oderId
        if (!logObj.admin && logObj.oderId && logObj.oderId !== 'system') {
          const byOder = await Admin.findOne({ oderId: logObj.oderId }).select('name email oderId role').lean()
            || await User.findOne({ oderId: logObj.oderId }).select('name email oderId role').lean();
          if (byOder) logObj.admin = byOder;
        }
      } catch (_) {
        // Skip admin resolution for this log — display what we have
      }
    }

    res.json({
      success: true,
      logs: logsWithAdmins,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    console.error('[all-activity-logs] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Export SubAdmin/Broker activity logs as CSV
app.get('/api/admin/admin-activity-logs/export', async (req, res) => {
  try {
    const { role, adminId, activityType, startDate, endDate } = req.query;
    const query = {};
    
    if (role && role !== 'all') {
      query.role = role;
    }
    
    if (adminId && adminId !== 'all') {
      query.$or = [{ adminId }, { oderId: adminId }];
    }
    
    if (activityType && activityType !== 'all') {
      query.activityType = activityType;
    }
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.timestamp.$lte = end;
      }
    }
    
    const logs = await AdminActivityLog.find(query).sort({ timestamp: -1 }).limit(10000);
    
    const logsWithAdmins = await Promise.all(logs.map(async (log) => {
      const admin = await Admin.findOne({ $or: [{ _id: log.adminId }, { oderId: log.oderId }] })
        .select('name email phone oderId role');
      return { ...log.toObject(), admin };
    }));
    
    const headers = ['Date', 'Time', 'Admin ID', 'Name', 'Email', 'Role', 'Activity Type', 'Description', 'Status', 'IP Address', 'OS', 'Browser', 'Device'];
    const rows = logsWithAdmins.map(log => {
      const date = new Date(log.timestamp);
      return [
        date.toLocaleDateString(),
        date.toLocaleTimeString(),
        log.oderId || log.adminId,
        log.admin?.name || '-',
        log.admin?.email || '-',
        log.role || '-',
        log.activityType?.replace(/_/g, ' '),
        `"${(log.description || '').replace(/"/g, '""')}"`,
        log.status || '-',
        log.ipAddress || '-',
        log.os || '-',
        log.browser || '-',
        log.device || '-'
      ].join(',');
    });
    
    const csv = [headers.join(','), ...rows].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=admin-activity-logs-${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to log admin activity
const logAdminActivity = async (data) => {
  try {
    await AdminActivityLog.logActivity(data);
  } catch (error) {
    console.error('Error logging admin activity:', error);
  }
};

// ============== CHARGE MANAGEMENT ENDPOINTS ==============

// Helper: generic CRUD for charge settings
const createChargeCRUD = (path, Model) => {
  // GET all
  app.get(`/api/admin/charges/${path}`, async (req, res) => {
    try {
      const items = await Model.find({}).sort({ createdAt: -1 });
      res.json({ success: true, items });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST create
  app.post(`/api/admin/charges/${path}`, async (req, res) => {
    try {
      const item = new Model(req.body);
      await item.save();
      res.json({ success: true, item });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ error: 'A setting with this symbol/name already exists' });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // PUT update
  app.put(`/api/admin/charges/${path}/:id`, async (req, res) => {
    try {
      const item = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
      if (!item) return res.status(404).json({ error: 'Setting not found' });
      res.json({ success: true, item });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ error: 'A setting with this symbol/name already exists' });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE
  app.delete(`/api/admin/charges/${path}/:id`, async (req, res) => {
    try {
      const item = await Model.findByIdAndDelete(req.params.id);
      if (!item) return res.status(404).json({ error: 'Setting not found' });
      res.json({ success: true, message: 'Deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
};

createChargeCRUD('spreads', SpreadSetting);
createChargeCRUD('commissions', CommissionSetting);
createChargeCRUD('swaps', SwapSetting);
createChargeCRUD('margins', MarginSetting);
createChargeCRUD('leverages', LeverageSetting);
createChargeCRUD('fees', FeeSetting);

// Public: Get all charges for a symbol (used by OrderPanel before placing trade)
app.get('/api/charges/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const [spread, commission, swap, margin] = await Promise.all([
      SpreadSetting.findOne({ symbol, isActive: true }),
      CommissionSetting.findOne({ symbol, isActive: true }),
      SwapSetting.findOne({ symbol, isActive: true }),
      MarginSetting.findOne({ symbol, isActive: true })
    ]);
    // Get default leverage group or any active
    const leverage = await LeverageSetting.findOne({ isActive: true, isDefault: true }) ||
      await LeverageSetting.findOne({ isActive: true });
    // Check for symbol-specific leverage override
    let maxLeverage = leverage?.maxLeverage || 100;
    if (leverage?.symbolOverrides?.length > 0) {
      const override = leverage.symbolOverrides.find(o => o.symbol === symbol);
      if (override) maxLeverage = override.maxLeverage;
    }
    // Get active fees
    const fees = await FeeSetting.find({ isActive: true });

    res.json({
      success: true,
      symbol,
      spread: spread ? {
        type: spread.spreadType,
        pips: spread.spreadPips,
        markup: spread.markupPips,
        totalPips: spread.spreadPips + spread.markupPips,
        min: spread.minSpread,
        max: spread.maxSpread
      } : null,
      commission: commission ? {
        type: commission.commissionType,
        open: commission.openCommission,
        close: commission.closeCommission,
        min: commission.minCommission,
        max: commission.maxCommission,
        currency: commission.currency
      } : null,
      swap: swap ? {
        type: swap.swapType,
        long: swap.swapLong,
        short: swap.swapShort,
        tripleDay: swap.tripleSwapDay,
        swapFree: swap.swapFreeEnabled
      } : null,
      margin: margin ? {
        mode: margin.marginMode,
        initial: margin.initialMarginRate,
        maintenance: margin.maintenanceMarginRate,
        hedged: margin.hedgedMarginRate,
        callLevel: margin.marginCallLevel,
        stopOut: margin.stopOutLevel
      } : null,
      leverage: { max: maxLeverage, group: leverage?.groupName || 'Default' },
      fees: fees.map(f => ({ name: f.feeName, type: f.feeType, charge: f.chargeType, amount: f.amount, rate: f.percentageRate, frequency: f.frequency }))
    });
  } catch (error) {
    console.error('Error fetching charges:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============== MT5-STYLE TRADE EXECUTION ==============

// Helper: Get contract size for a symbol
function getContractSize(symbol) {
  const sym = symbol.toUpperCase();
  if (sym.includes('XAU')) return 100;       // 1 lot gold = 100 oz
  if (sym.includes('XAG')) return 5000;      // 1 lot silver = 5000 oz
  if (sym.includes('BTC')) return 1;          // 1 lot BTC = 1 BTC
  if (sym.includes('ETH')) return 1;          // 1 lot ETH = 1 ETH
  if (sym.includes('SOL') || sym.includes('BNB') || sym.includes('XRP')) return 1;
  if (sym.endsWith('JPY')) return 100000;     // Forex JPY pairs
  if (sym.length <= 7 && /^[A-Z]{6}$/.test(sym)) return 100000; // Forex standard = 100K
  return 1; // Default for crypto / others
}

// Helper: Get pip value for P/L calculation
function getPipValueForPL(symbol) {
  const sym = symbol.toUpperCase();
  if (sym.includes('XAU')) return 0.01;
  if (sym.includes('XAG')) return 0.001;
  if (sym.includes('JPY')) return 0.01;
  return 0.0001;
}

// POST /api/trade/open - Open a new position with MT5 margin check
app.post('/api/trade/open', async (req, res) => {
  try {
    const { userId, symbol, side, volume, leverage, orderType, stopLoss, takeProfit, session, mode: tradeOpenMode, challengeAccountId, quantity, lotSize, exchange, segment } = req.body;

    if (!userId || !symbol || !side || !volume) {
      return res.status(400).json({ error: 'userId, symbol, side, and volume are required' });
    }

    // 1. Get user
    const user = await User.findOne({ oderId: userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.isActive) return res.status(403).json({ error: 'Account is suspended' });

    // Challenge-account trades are routed to the isolated prop engine so they
    // debit the virtual sub-wallet on the ChallengeAccount, not User.wallet.
    if (challengeAccountId) {
      // Resolve a live entry price (same resolution order as the main flow below).
      let cEntryPrice = 0;
      try {
        const zp = zerodhaService.getPrice(symbol);
        if (zp && (zp.lastPrice > 0 || zp.last_price > 0)) {
          cEntryPrice = Number(zp.lastPrice || zp.last_price);
        } else if (metaApiStreaming) {
          const cp = metaApiStreaming.getPrice(symbol);
          if (cp) cEntryPrice = side === 'buy' ? Number(cp.ask) : Number(cp.bid);
        }
      } catch (_) { /* ignore */ }
      if (!cEntryPrice || cEntryPrice <= 0) {
        return res.status(400).json({ error: 'Could not get valid price for ' + symbol });
      }

      const challengePropEngine = require('./services/challengePropEngine.service');
      const vol = parseFloat(volume);
      const ls = Number(lotSize) > 0 ? Number(lotSize) : 1;
      const qty = Number(quantity) > 0 ? Number(quantity) : vol * ls;
      const propResult = await challengePropEngine.openPosition(challengeAccountId, {
        symbol,
        side,
        volume: vol,
        quantity: qty,
        lotSize: ls,
        entryPrice: cEntryPrice,
        leverage: leverage || 100,
        stopLoss,
        takeProfit,
        session: session || 'intraday',
        orderType: orderType || 'market',
        exchange: exchange || '',
        segment: segment || ''
      });
      if (!propResult.success) {
        return res.status(400).json({ error: propResult.error, code: propResult.code });
      }
      // Broadcast account update so MyChallenges card + dashboard refresh instantly.
      try {
        io.to(String(user._id)).emit('challengeAccountUpdate', {
          challengeAccountId,
          account: propResult.account,
          position: propResult.position
        });
      } catch (_) { /* optional */ }
      return res.json({
        success: true,
        position: propResult.position,
        account: propResult.account,
        challengeAccountId
      });
    }

    // Prop-only platform: reject main-wallet order placement. Users must
    // trade on a challenge's virtual sub-wallet — not on their real wallet.
    return res.status(403).json({
      error: 'This is a prop-trading platform. Please select an active challenge account before placing orders.',
      code: 'CHALLENGE_REQUIRED'
    });

    // eslint-disable-next-line no-unreachable
    // Check if this is a Delta Exchange instrument (crypto futures/options)
    const isDeltaInstrument = deltaExchangeStreaming && deltaExchangeStreaming.isDeltaSymbol(symbol);
    
    // Check if this is an Indian instrument (no "/" in symbol, not a forex pair, not Delta)
    const isIndianInstrument = !isDeltaInstrument && !symbol.includes('/') && !symbol.match(/^[A-Z]{6}$/);
    
    // 2. Get current price
    let entryPrice;
    
    if (isDeltaInstrument) {
      // For Delta Exchange instruments (crypto futures/options)
      const deltaPrice = deltaExchangeStreaming.getPrice(symbol);
      if (deltaPrice) {
        entryPrice = side === 'buy' ? deltaPrice.ask : deltaPrice.bid;
        // Fallback to last/mark price if bid/ask not available
        if (!entryPrice || entryPrice <= 0) {
          entryPrice = deltaPrice.lastPrice || deltaPrice.mark_price || deltaPrice.last;
        }
      }
      console.log(`[Trade] Delta Exchange price for ${symbol}: ${entryPrice}`);
    } else if (isIndianInstrument) {
      // For Indian instruments, get price from Zerodha cache
      const zerodhaPrice = zerodhaService.getPrice(symbol);
      if (zerodhaPrice) {
        entryPrice = zerodhaPrice.lastPrice;
      }
    } else {
      // For Forex/Crypto, try MetaAPI streaming cache first
      if (metaApiStreaming) {
        const cachedPrice = metaApiStreaming.getPrice(symbol);
        if (cachedPrice) {
          entryPrice = side === 'buy' ? cachedPrice.ask : cachedPrice.bid;
        }
      }
      
      // Fallback to MetaAPI REST API if no cached price
      if (!entryPrice || entryPrice <= 0) {
        const METAAPI_ACCOUNT_ID = process.env.METAAPI_ACCOUNT_ID || '';
        const METAAPI_AUTH_TOKEN = process.env.METAAPI_AUTH_TOKEN || '';
        const METAAPI_BASE_URL = process.env.METAAPI_BASE_URL || 'https://mt-client-api-v1.new-york.agiliumtrade.ai';
        
        try {
          const priceRes = await fetch(
            `${METAAPI_BASE_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}/symbols/${symbol}/current-price`,
            { headers: { 'auth-token': METAAPI_AUTH_TOKEN, 'Content-Type': 'application/json' } }
          );
          const priceData = await priceRes.json();
          entryPrice = side === 'buy' ? priceData.ask : priceData.bid;
        } catch (err) {
          console.warn('MetaAPI price fetch failed, using cached prices only');
        }
      }
    }

    if (!entryPrice || entryPrice <= 0) {
      return res.status(400).json({ error: 'Could not get valid price for ' + symbol });
    }
    
    // Indian segment (NSE/BSE/MCX-style symbols): netting only — ignore requested mode
    if (isIndianInstrument && nettingEngine) {
      try {
        const priceSnapshot = entryPrice;
        const getCurrentPriceCallback = async () => {
          const zp = zerodhaService.getPrice(symbol);
          const lp = zp && (zp.lastPrice > 0 || zp.last_price > 0)
            ? Number(zp.lastPrice || zp.last_price)
            : null;
          return lp != null && lp > 0 ? lp : priceSnapshot;
        };
        const result = await nettingEngine.executeOrder(
          userId,
          {
            symbol,
            side,
            volume: parseFloat(volume),
            price: entryPrice,
            orderType: orderType || 'market',
            session: session || 'intraday',
            leverage: leverage || 100,
            stopLoss,
            takeProfit
          },
          { lastPrice: entryPrice, ltp: entryPrice },
          getCurrentPriceCallback
        );
        
        return res.json({
          success: true,
          position: result.position,
          orderId: result.position?.oderId || result.orderId,
          entryPrice,
          mode: 'netting'
        });
      } catch (nettingErr) {
        return res.status(400).json({ error: nettingErr.message });
      }
    }

    const requestedTradeMode =
      tradeOpenMode === 'netting' || tradeOpenMode === 'hedging' ? tradeOpenMode : 'hedging';

    // Forex / crypto / Delta one-click when UI is in netting mode → NettingEngine (same as POST /api/orders netting)
    if (!isIndianInstrument && requestedTradeMode === 'netting' && nettingEngine) {
      try {
        const priceSnapshot = entryPrice;
        const getCurrentPriceCallback = async () => {
          if (isDeltaInstrument && deltaExchangeStreaming) {
            const dp = deltaExchangeStreaming.getPrice(symbol);
            if (dp) {
              let p = side === 'buy' ? dp.ask : dp.bid;
              if (!p || p <= 0) p = dp.lastPrice || dp.mark_price || dp.last;
              if (p > 0) return Number(p);
            }
          } else if (metaApiStreaming) {
            const pr = metaApiStreaming.getPrice(symbol);
            if (pr && (Number(pr.bid) > 0 || Number(pr.ask) > 0)) {
              return side === 'buy' ? Number(pr.ask) : Number(pr.bid);
            }
          }
          try {
            const METAAPI_ACCOUNT_ID = process.env.METAAPI_ACCOUNT_ID || '';
            const METAAPI_AUTH_TOKEN = process.env.METAAPI_AUTH_TOKEN || '';
            const METAAPI_BASE_URL =
              process.env.METAAPI_BASE_URL || 'https://mt-client-api-v1.new-york.agiliumtrade.ai';
            const priceRes = await fetch(
              `${METAAPI_BASE_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}/symbols/${encodeURIComponent(symbol)}/current-price`,
              { headers: { 'auth-token': METAAPI_AUTH_TOKEN, 'Content-Type': 'application/json' } }
            );
            if (priceRes.ok) {
              const priceData = await priceRes.json();
              const p = side === 'buy' ? Number(priceData.ask) : Number(priceData.bid);
              if (p > 0) return p;
            }
          } catch (_) {
            /* keep snapshot */
          }
          return priceSnapshot;
        };
        const result = await nettingEngine.executeOrder(
          userId,
          {
            symbol,
            side,
            volume: parseFloat(volume),
            price: entryPrice,
            orderType: orderType || 'market',
            session: session || 'intraday',
            leverage: leverage || 100,
            stopLoss,
            takeProfit,
            isMarketOpen: true
          },
          null,
          getCurrentPriceCallback
        );
        const pos = result.position;
        return res.json({
          success: true,
          position: pos,
          orderId: pos?.oderId || result.orderId,
          entryPrice: pos?.avgPrice ?? pos?.entryPrice ?? entryPrice,
          mode: 'netting'
        });
      } catch (nettingErr) {
        return res.status(400).json({ error: nettingErr.message });
      }
    }

    // 2b. Reorder delay for one-click /trade/open (matches POST /api/orders + HedgingEngine)
    if (hedgingEngine) {
      const segmentName = hedgingEngine.getSegmentNameForInstrument(null, '', '', symbol);
      const baseForReorder = entryPrice;
      const getCurrentPriceCallback = async () => {
        if (isDeltaInstrument && deltaExchangeStreaming) {
          const dp = deltaExchangeStreaming.getPrice(symbol);
          if (dp) {
            let p = side === 'buy' ? dp.ask : dp.bid;
            if (!p || p <= 0) p = dp.lastPrice || dp.mark_price || dp.last;
            if (p > 0) return Number(p);
          }
        } else if (metaApiStreaming) {
          const pr = metaApiStreaming.getPrice(symbol);
          if (pr && (Number(pr.bid) > 0 || Number(pr.ask) > 0)) {
            return side === 'buy' ? Number(pr.ask) : Number(pr.bid);
          }
        }
        try {
          const METAAPI_ACCOUNT_ID = process.env.METAAPI_ACCOUNT_ID || '';
          const METAAPI_AUTH_TOKEN = process.env.METAAPI_AUTH_TOKEN || '';
          const METAAPI_BASE_URL =
            process.env.METAAPI_BASE_URL || 'https://mt-client-api-v1.new-york.agiliumtrade.ai';
          const priceRes = await fetch(
            `${METAAPI_BASE_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}/symbols/${encodeURIComponent(symbol)}/current-price`,
            { headers: { 'auth-token': METAAPI_AUTH_TOKEN, 'Content-Type': 'application/json' } }
          );
          if (priceRes.ok) {
            const priceData = await priceRes.json();
            const p = side === 'buy' ? Number(priceData.ask) : Number(priceData.bid);
            if (p > 0) return p;
          }
        } catch (_) {
          /* keep snapshot */
        }
        return baseForReorder;
      };
      const userMongoId = user._id ? user._id.toString() : String(userId);
      const reorderOut = await hedgingEngine.applyReorderDelay(
        userMongoId,
        segmentName,
        baseForReorder,
        side,
        getCurrentPriceCallback
      );
      entryPrice = reorderOut.executionPrice;
    }

    // 3. Apply spread from admin settings
    const spreadSetting = await SpreadSetting.findOne({ symbol: symbol.toUpperCase(), isActive: true });
    if (spreadSetting) {
      const pipSize = getPipValueForPL(symbol);
      const totalSpread = (spreadSetting.spreadPips + spreadSetting.markupPips) * pipSize;
      if (side === 'buy') {
        entryPrice += totalSpread / 2;  // Widen ask up
      } else {
        entryPrice -= totalSpread / 2;  // Widen bid down
      }
      entryPrice = parseFloat(entryPrice.toFixed(6));
    }

    // 4. Look up leverage setting from admin (override user's requested leverage)
    const leverageSetting = await LeverageSetting.findOne({ isActive: true, isDefault: true }) ||
      await LeverageSetting.findOne({ isActive: true });
    let maxLeverage = leverageSetting?.maxLeverage || 100;
    if (leverageSetting?.symbolOverrides?.length > 0) {
      const override = leverageSetting.symbolOverrides.find(o => o.symbol === symbol.toUpperCase());
      if (override) maxLeverage = override.maxLeverage;
    }
    const useLeverage = Math.min(leverage || user.leverage || 100, maxLeverage);

    // 5. Calculate margin required (MT5 formula)
    const contractSize = getContractSize(symbol);
    const notionalValue = volume * contractSize * entryPrice;
    const marginRequired = notionalValue / useLeverage;

    // 6. Look up commission from admin settings
    let commissionAmount = 0;
    const commSetting = await CommissionSetting.findOne({ symbol: symbol.toUpperCase(), isActive: true });
    if (commSetting) {
      if (commSetting.commissionType === 'per-lot') {
        commissionAmount = (commSetting.openCommission + commSetting.closeCommission) * volume;
      } else if (commSetting.commissionType === 'per-trade') {
        commissionAmount = commSetting.openCommission + commSetting.closeCommission;
      } else if (commSetting.commissionType === 'percentage') {
        commissionAmount = (commSetting.openCommission / 100) * notionalValue;
      }
      if (commSetting.minCommission > 0 && commissionAmount < commSetting.minCommission) {
        commissionAmount = commSetting.minCommission;
      }
      if (commSetting.maxCommission > 0 && commissionAmount > commSetting.maxCommission) {
        commissionAmount = commSetting.maxCommission;
      }
      commissionAmount = parseFloat(commissionAmount.toFixed(2));
    }

    // 7. Check margin + commission against free margin
    const totalRequired = marginRequired + commissionAmount;

    // Recalculate unrealized P/L for accurate equity
    const openPositions = await HedgingPosition.find({ userId, status: 'open' });
    let unrealizedPnL = 0;
    for (const pos of openPositions) {
      unrealizedPnL += pos.profit || 0;
    }
    user.updateEquity(unrealizedPnL);

    if (!user.hasSufficientMargin(totalRequired)) {
      return res.status(400).json({
        error: 'Insufficient margin',
        details: {
          freeMargin: parseFloat(user.wallet.freeMargin.toFixed(2)),
          marginRequired: parseFloat(marginRequired.toFixed(2)),
          commission: commissionAmount,
          totalRequired: parseFloat(totalRequired.toFixed(2))
        }
      });
    }

    // 8. Check margin level after trade (MT5: reject if would drop below margin call level)
    const marginSetting = await MarginSetting.findOne({ symbol: symbol.toUpperCase(), isActive: true });
    const marginCallLevel = marginSetting?.marginCallLevel || 100; // Default 100%
    const newTotalMargin = user.wallet.margin + marginRequired;
    const newMarginLevel = newTotalMargin > 0 ? (user.wallet.equity / newTotalMargin) * 100 : 0;
    if (newTotalMargin > 0 && newMarginLevel < marginCallLevel) {
      return res.status(400).json({
        error: `Trade would trigger margin call (level would be ${newMarginLevel.toFixed(1)}%, minimum ${marginCallLevel}%)`,
        details: { currentMarginLevel: user.wallet.marginLevel, projectedMarginLevel: newMarginLevel }
      });
    }

    // 9. Deduct commission from balance & lock margin
    user.wallet.balance -= commissionAmount;
    user.useMargin(marginRequired);
    await user.save();

    // 10. Create position in DB
    const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const position = new HedgingPosition({
      oderId: orderId,
      userId,
      symbol: symbol.toUpperCase(),
      side,
      volume,
      entryPrice,
      currentPrice: entryPrice,
      stopLoss: stopLoss || null,
      takeProfit: takeProfit || null,
      leverage: useLeverage,
      marginUsed: parseFloat(marginRequired.toFixed(2)),
      commission: commissionAmount,
      swap: 0,
      profit: 0,
      orderType: orderType || 'market',
      status: 'open',
      openTime: new Date()
    });
    await position.save();

    // 11. MetaAPI trade mirroring disabled - using MetaAPI only for price feed
    // Trades are handled locally in database only
    // try {
    //   const actionType = side === 'buy' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL';
    //   const metaRes = await fetch(
    //     `${METAAPI_BASE_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}/trade`,
    //     {
    //       method: 'POST',
    //       headers: { 'auth-token': METAAPI_AUTH_TOKEN, 'Content-Type': 'application/json' },
    //       body: JSON.stringify({ symbol, actionType, volume, comment: `DhanFunded ${orderId}` })
    //     }
    //   );
    //   const metaData = await metaRes.json();
    //   if (metaData.positionId) {
    //     position.metaApiPositionId = metaData.positionId;
    //     await position.save();
    //   }
    // } catch (metaErr) {
    //   console.warn('MetaAPI mirror trade failed (position still saved locally):', metaErr.message);
    // }

    // Log trade open activity
    const tradeUserAgent = req.get('User-Agent') || '';
    await UserActivityLog.logActivity({
      userId: user._id.toString(),
      oderId: userId,
      activityType: 'trade_open',
      description: `Opened ${side.toUpperCase()} position: ${volume} lot(s) ${symbol} @ ${entryPrice}`,
      metadata: { positionId: position._id, orderId, symbol, side, volume, entryPrice, leverage: useLeverage },
      ipAddress: req.ip,
      userAgent: tradeUserAgent,
      device: tradeUserAgent.includes('Mobile') ? 'mobile' : 'desktop',
      os: parseOS(tradeUserAgent),
      browser: parseBrowser(tradeUserAgent),
      status: 'success'
    });

    res.json({
      success: true,
      position: {
        id: position._id,
        orderId,
        symbol: position.symbol,
        side, volume,
        entryPrice: position.entryPrice,
        leverage: useLeverage,
        marginUsed: position.marginUsed,
        commission: position.commission,
        status: 'open'
      },
      wallet: {
        balance: parseFloat(user.wallet.balance.toFixed(2)),
        equity: parseFloat(user.wallet.equity.toFixed(2)),
        margin: parseFloat(user.wallet.margin.toFixed(2)),
        freeMargin: parseFloat(user.wallet.freeMargin.toFixed(2)),
        marginLevel: parseFloat(user.wallet.marginLevel.toFixed(2))
      }
    });

  } catch (error) {
    console.error('Trade open error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/trade/close - Close a position with P/L settlement
app.post('/api/trade/close', async (req, res) => {
  try {
    const { userId, positionId } = req.body;

    if (!userId || !positionId) {
      return res.status(400).json({ error: 'userId and positionId are required' });
    }

    // 1. Find position - try by _id first, then by oderId
    let position;
    const mongoose = require('mongoose');
    if (mongoose.Types.ObjectId.isValid(positionId)) {
      position = await HedgingPosition.findOne({ _id: positionId, userId, status: 'open' });
    }
    if (!position) {
      // Try finding by oderId (HED-* format)
      position = await HedgingPosition.findOne({ oderId: positionId, userId, status: 'open' });
    }
    if (!position) return res.status(404).json({ error: 'Open position not found' });

    // 2. Get current price
    const METAAPI_ACCOUNT_ID = process.env.METAAPI_ACCOUNT_ID || '';
    const METAAPI_AUTH_TOKEN = process.env.METAAPI_AUTH_TOKEN || '';
    const METAAPI_BASE_URL = process.env.METAAPI_BASE_URL || 'https://mt-client-api-v1.new-york.agiliumtrade.ai';

    let closePrice;
    try {
      const priceRes = await fetch(
        `${METAAPI_BASE_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}/symbols/${position.symbol}/current-price`,
        { headers: { 'auth-token': METAAPI_AUTH_TOKEN, 'Content-Type': 'application/json' } }
      );
      const priceData = await priceRes.json();
      // Close at opposite price: buy position closes at bid, sell closes at ask
      closePrice = position.side === 'buy' ? priceData.bid : priceData.ask;
    } catch (err) {
      return res.status(500).json({ error: 'Failed to fetch current price' });
    }

    if (!closePrice || closePrice <= 0) {
      return res.status(400).json({ error: 'Could not get valid close price' });
    }

    // Apply spread to close price
    const spreadSetting = await SpreadSetting.findOne({ symbol: position.symbol, isActive: true });
    if (spreadSetting) {
      const pipSize = getPipValueForPL(position.symbol);
      const totalSpread = (spreadSetting.spreadPips + spreadSetting.markupPips) * pipSize;
      if (position.side === 'buy') {
        closePrice -= totalSpread / 2;  // Buy closes at bid (lowered)
      } else {
        closePrice += totalSpread / 2;  // Sell closes at ask (raised)
      }
      closePrice = parseFloat(closePrice.toFixed(6));
    }

    // 3. Calculate P/L
    const contractSize = getContractSize(position.symbol);
    const direction = position.side === 'buy' ? 1 : -1;
    const priceDiff = closePrice - position.entryPrice;
    const pnl = parseFloat((priceDiff * direction * position.volume * contractSize).toFixed(2));

    try {
      await riskManagement.assertTradeHoldAllowed(userId, position.openTime, pnl);
    } catch (holdErr) {
      return res.status(400).json({ error: holdErr.message });
    }

    // 4. Get user and settle
    const user = await User.findOne({ oderId: userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Release margin
    user.releaseMargin(position.marginUsed);

    // Settle P/L to balance (balance + pnl, can go up or down but reflects real P/L)
    user.settlePnL(pnl);

    // Recalculate equity
    const remainingPositions = await HedgingPosition.find({ userId, status: 'open', _id: { $ne: positionId } });
    let unrealizedPnL = 0;
    for (const pos of remainingPositions) {
      unrealizedPnL += pos.profit || 0;
    }
    user.updateEquity(unrealizedPnL);
    await user.save();

    // 5. Update position
    position.status = 'closed';
    position.closePrice = closePrice;
    position.closeTime = new Date();
    position.profit = pnl;
    position.currentPrice = closePrice;
    await position.save();

    // 6. MetaAPI close disabled - using MetaAPI only for price feed
    // if (position.metaApiPositionId) {
    //   try {
    //     const closeAction = position.side === 'buy' ? 'ORDER_TYPE_SELL' : 'ORDER_TYPE_BUY';
    //     await fetch(
    //       `${METAAPI_BASE_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}/trade`,
    //       {
    //         method: 'POST',
    //         headers: { 'auth-token': METAAPI_AUTH_TOKEN, 'Content-Type': 'application/json' },
    //         body: JSON.stringify({ symbol: position.symbol, actionType: closeAction, volume: position.volume, comment: `Close ${position.oderId}` })
    //       }
    //     );
    //   } catch (metaErr) {
    //     console.warn('MetaAPI close failed:', metaErr.message);
    //   }
    // }

    // Log trade close activity
    const closeTradeUserAgent = req.get('User-Agent') || '';
    await UserActivityLog.logActivity({
      userId: user._id.toString(),
      oderId: userId,
      activityType: 'trade_close',
      description: `Closed ${position.side.toUpperCase()} position: ${position.volume} lot(s) ${position.symbol} @ ${closePrice} | P/L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
      metadata: { positionId: position._id, symbol: position.symbol, side: position.side, volume: position.volume, entryPrice: position.entryPrice, closePrice, pnl },
      ipAddress: req.ip,
      userAgent: closeTradeUserAgent,
      device: closeTradeUserAgent.includes('Mobile') ? 'mobile' : 'desktop',
      os: parseOS(closeTradeUserAgent),
      browser: parseBrowser(closeTradeUserAgent),
      status: 'success'
    });

    res.json({
      success: true,
      closedPosition: {
        id: position._id,
        orderId: position.oderId,
        symbol: position.symbol,
        side: position.side,
        volume: position.volume,
        entryPrice: position.entryPrice,
        closePrice,
        pnl,
        commission: position.commission,
        swap: position.swap
      },
      wallet: {
        balance: parseFloat(user.wallet.balance.toFixed(2)),
        equity: parseFloat(user.wallet.equity.toFixed(2)),
        margin: parseFloat(user.wallet.margin.toFixed(2)),
        freeMargin: parseFloat(user.wallet.freeMargin.toFixed(2)),
        marginLevel: parseFloat(user.wallet.marginLevel.toFixed(2))
      }
    });

  } catch (error) {
    console.error('Trade close error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/trade/positions/:userId - Get open positions + wallet
app.get('/api/trade/positions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOne({ oderId: userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const positions = await HedgingPosition.find({ userId, status: 'open' }).sort({ openTime: -1 });

    // Recalculate unrealized P/L for all positions
    let totalUnrealizedPnL = 0;
    for (const pos of positions) {
      totalUnrealizedPnL += pos.profit || 0;
    }
    user.updateEquity(totalUnrealizedPnL);
    await user.save();

    res.json({
      success: true,
      positions: positions.map(p => ({
        id: p._id,
        orderId: p.oderId,
        symbol: p.symbol,
        side: p.side,
        volume: p.volume,
        entryPrice: p.entryPrice,
        currentPrice: p.currentPrice,
        leverage: p.leverage,
        marginUsed: p.marginUsed,
        commission: p.commission,
        swap: p.swap,
        profit: p.profit,
        stopLoss: p.stopLoss,
        takeProfit: p.takeProfit,
        openTime: p.openTime
      })),
      wallet: {
        balance: user.wallet.balance,
        credit: user.wallet.credit,
        equity: user.wallet.equity,
        margin: user.wallet.margin,
        freeMargin: user.wallet.freeMargin,
        marginLevel: user.wallet.marginLevel
      },
      totalPositions: positions.length,
      totalUnrealizedPnL
    });

  } catch (error) {
    console.error('Positions fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/trade/history/:userId - Get closed positions (trade history)
app.get('/api/trade/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, page = 1 } = req.query;
    const total = await HedgingPosition.countDocuments({ userId, status: 'closed' });
    const positions = await HedgingPosition.find({ userId, status: 'closed' })
      .sort({ closeTime: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.json({
      success: true,
      positions: positions.map(p => ({
        id: p._id, orderId: p.oderId, symbol: p.symbol, side: p.side,
        volume: p.volume, entryPrice: p.entryPrice, closePrice: p.closePrice,
        leverage: p.leverage, commission: p.commission, swap: p.swap,
        profit: p.profit, openTime: p.openTime, closeTime: p.closeTime
      })),
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== SYMBOL MANAGEMENT ==============

const Symbol = require('./models/Symbol');

// Get all symbols with filters
app.get('/api/admin/symbols', async (req, res) => {
  try {
    const { category, search, isActive } = req.query;
    const query = {};
    
    if (category && category !== 'all') query.category = category;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) {
      query.$or = [
        { symbol: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } }
      ];
    }
    
    const symbols = await Symbol.find(query).sort({ category: 1, symbol: 1 });
    res.json({ success: true, symbols });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single symbol
app.get('/api/admin/symbols/:symbol', async (req, res) => {
  try {
    const symbol = await Symbol.findOne({ symbol: req.params.symbol.toUpperCase() });
    if (!symbol) return res.status(404).json({ success: false, error: 'Symbol not found' });
    res.json({ success: true, symbol });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create/Update symbol
app.post('/api/admin/symbols', async (req, res) => {
  try {
    const { symbol, ...data } = req.body;
    if (!symbol) return res.status(400).json({ success: false, error: 'Symbol is required' });
    
    const updated = await Symbol.findOneAndUpdate(
      { symbol: symbol.toUpperCase() },
      { symbol: symbol.toUpperCase(), ...data },
      { upsert: true, new: true }
    );
    res.json({ success: true, symbol: updated, message: 'Symbol saved successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update symbol settings
app.put('/api/admin/symbols/:symbol', async (req, res) => {
  try {
    const symbol = await Symbol.findOneAndUpdate(
      { symbol: req.params.symbol.toUpperCase() },
      req.body,
      { new: true }
    );
    if (!symbol) return res.status(404).json({ success: false, error: 'Symbol not found' });
    res.json({ success: true, symbol, message: 'Symbol updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete symbol
app.delete('/api/admin/symbols/:symbol', async (req, res) => {
  try {
    const symbol = await Symbol.findOneAndDelete({ symbol: req.params.symbol.toUpperCase() });
    if (!symbol) return res.status(404).json({ success: false, error: 'Symbol not found' });
    res.json({ success: true, message: 'Symbol deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sync symbols from MetaAPI
app.post('/api/admin/symbols/sync', async (req, res) => {
  try {
    const METAAPI_ACCOUNT_ID = process.env.METAAPI_ACCOUNT_ID;
    const METAAPI_AUTH_TOKEN = process.env.METAAPI_AUTH_TOKEN;
    const METAAPI_BASE_URL = process.env.METAAPI_BASE_URL || 'https://mt-client-api-v1.new-york.agiliumtrade.ai';
    
    if (!METAAPI_ACCOUNT_ID || !METAAPI_AUTH_TOKEN) {
      return res.status(400).json({ success: false, error: 'MetaAPI credentials not configured' });
    }
    
    // Fetch symbols from MetaAPI
    const response = await fetch(
      `${METAAPI_BASE_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}/symbols`,
      { headers: { 'auth-token': METAAPI_AUTH_TOKEN } }
    );
    
    if (!response.ok) {
      return res.status(400).json({ success: false, error: 'Failed to fetch symbols from MetaAPI' });
    }
    
    const apiSymbols = await response.json();
    let synced = 0;
    let updated = 0;
    
    for (const apiSym of apiSymbols) {
      const symbolName = apiSym.symbol || apiSym.name;
      if (!symbolName) continue;
      
      // Determine category
      let category = 'stocks';
      const sym = symbolName.toUpperCase();
      if (sym === 'NIFTY50' || sym === 'NIFTY' || sym === 'BANKNIFTY' || sym === 'FINNIFTY' || sym === 'SENSEX') {
        category = 'indices';
      }
      
      let contractSize = 1;
      let pipSize = 0.05;
      let digits = 2;
      
      const existing = await Symbol.findOne({ symbol: symbolName.toUpperCase() });
      
      if (existing) {
        existing.lastSyncAt = new Date();
        existing.syncedFromApi = true;
        existing.externalSymbol = apiSym.symbol;
        if (apiSym.description) existing.description = apiSym.description;
        await existing.save();
        updated++;
      } else {
        await Symbol.create({
          symbol: symbolName.toUpperCase(),
          name: apiSym.description || symbolName,
          description: apiSym.description || '',
          category,
          contractSize,
          pipSize,
          digits,
          externalSymbol: apiSym.symbol,
          syncedFromApi: true,
          lastSyncAt: new Date(),
          isActive: true
        });
        synced++;
      }
    }
    
    res.json({ 
      success: true, 
      message: `Synced ${synced} new symbols, updated ${updated} existing symbols`,
      total: apiSymbols.length,
      synced,
      updated
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk update symbols
app.post('/api/admin/symbols/bulk-update', async (req, res) => {
  try {
    const { symbols, updates } = req.body;
    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({ success: false, error: 'Symbols array required' });
    }
    
    const result = await Symbol.updateMany(
      { symbol: { $in: symbols.map(s => s.toUpperCase()) } },
      updates
    );
    
    res.json({ success: true, message: `Updated ${result.modifiedCount} symbols` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== SEGMENT MANAGEMENT (Indian Market - Netting Mode Only) ==============

// Seed default segments on startup (for all trading modes)
const seedSegments = async () => {
  try {
    // Seed Netting mode segments (all markets: Indian + Forex + Crypto) - uses Segment model
    await Segment.seedDefaultSegments();
    // Seed Hedging mode segments (only Forex + Crypto)
    await HedgingSegment.seedDefaultSegments();
    await ExpirySettings.seedDefaultsIfMissing();
  } catch (error) {
    console.error('Error seeding segments:', error.message);
  }
};
seedSegments();

// Get all segments
app.get('/api/admin/segments', async (req, res) => {
  try {
    const segments = await Segment.find().sort({ marketType: 1, exchange: 1, segmentType: 1 });
    res.json({ success: true, segments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Force re-seed segments (useful if segments are missing)
app.post('/api/admin/segments/reseed', async (req, res) => {
  try {
    await Segment.seedDefaultSegments();
    const segments = await Segment.find().sort({ marketType: 1, exchange: 1, segmentType: 1 });
    res.json({ success: true, message: `Seeded segments. Total: ${segments.length}`, segments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search instruments from Zerodha for adding to segment (MUST be before /:id route)
app.get('/api/admin/segments/search-instruments', async (req, res) => {
  try {
    const { exchange, search = '', segmentName } = req.query;
    if (!exchange) {
      return res.status(400).json({ success: false, error: 'Exchange required' });
    }

    const exchangeUpper = exchange.toUpperCase();
    const segmentUpper = (segmentName || '').toUpperCase();

    const instrumentMap = {
      'STOCKS':  ['RELIANCE','TCS','INFY','HDFCBANK','ICICIBANK','SBIN','ITC','HINDUNILVR','KOTAKBANK','LT','AXISBANK','BHARTIARTL','ASIANPAINT','MARUTI','BAJFINANCE','WIPRO','HCLTECH','TATAMOTORS','SUNPHARMA'],
      'INDICES': ['NIFTY50','BANKNIFTY','FINNIFTY','SENSEX'],
      'NSE':     ['RELIANCE','TCS','INFY','HDFCBANK','ICICIBANK','SBIN','ITC','HINDUNILVR','KOTAKBANK','LT','AXISBANK','BHARTIARTL','ASIANPAINT','MARUTI','BAJFINANCE','WIPRO','HCLTECH','TATAMOTORS','SUNPHARMA'],
      'BSE':     ['RELIANCE','TCS','INFY','HDFCBANK','ICICIBANK','SBIN','ITC','HINDUNILVR'],
    };

    const knownSegments = Object.keys(instrumentMap).filter(k => instrumentMap[k] !== null);
    const segmentKey = knownSegments.includes(segmentUpper) ? segmentUpper
      : knownSegments.includes(exchangeUpper) ? exchangeUpper
      : null;

    if (segmentKey) {
      const availableInstruments = instrumentMap[segmentKey];
      const searchLower = (search || '').toLowerCase();
      const filtered = availableInstruments
        .filter(symbol => !searchLower || symbol.toLowerCase().includes(searchLower))
        .slice(0, 100)
        .map(symbol => ({
          symbol,
          tradingSymbol: symbol,
          tradingsymbol: symbol,
          name: symbol,
          lotSize: symbol.includes('BTC') || symbol.includes('ETH') ? 1 : (symbol.includes('XAU') ? 100 : 100000),
          exchange: segmentKey
        }));
        
      if (search && search.length >= 2) {
        const searchUpper = search.toUpperCase();
        const prefixCount = availableInstruments.filter(sym => sym.toUpperCase().startsWith(searchUpper)).length;
        if (prefixCount > 0) {
          filtered.unshift({
            symbol: searchUpper,
            tradingSymbol: searchUpper,
            tradingsymbol: searchUpper,
            name: `${searchUpper} (Base Prefix) - Applies to ~${prefixCount} active scripts`,
            lotSize: searchUpper.includes('BTC') || searchUpper.includes('ETH') ? 1 : 100000,
            exchange: segmentKey
          });
        }
      }
        
      return res.json({ success: true, instruments: filtered });
    }
    
    // Use exchange directly if it's a Zerodha exchange code (NSE, NFO, BFO, MCX)
    // Otherwise map segment name to Zerodha exchange
    const zerodhaExchanges = ['NSE', 'NFO', 'BFO', 'MCX', 'BSE'];
    let zerodhaExchange = exchangeUpper;
    
    if (!zerodhaExchanges.includes(zerodhaExchange)) {
      // Map segment name to Zerodha exchange
      const exchangeMap = {
        'NSE_EQ': 'NSE',
        'NSE_FUT': 'NFO',
        'NSE_OPT': 'NFO',
        'BSE_FUT': 'BFO',
        'BSE_OPT': 'BFO',
        'MCX_FUT': 'MCX',
        'MCX_OPT': 'MCX'
      };
      zerodhaExchange = exchangeMap[exchangeUpper];
    }
    
    if (!zerodhaExchange) {
      return res.status(400).json({ success: false, error: 'Invalid exchange' });
    }
    
    // Filter by instrument type based on segment name
    const filterSegment = segmentName || exchange;
    const instrumentTypeFilter = {
      'NSE_FUT': 'FUT',
      'NSE_OPT': ['CE', 'PE'],
      'BSE_FUT': 'FUT',
      'BSE_OPT': ['CE', 'PE'],
      'MCX_FUT': 'FUT',
      'MCX_OPT': ['CE', 'PE']
    };
    
    const typeFilter = instrumentTypeFilter[filterSegment.toUpperCase()];
    
    // Fetch instruments from Zerodha
    const allInstruments = await zerodhaService.getInstruments(zerodhaExchange);
    if (!allInstruments || allInstruments.length === 0) {
      return res.json({ success: true, instruments: [] });
    }
    
    // Filter by search term and instrument type
    const searchLower = search.toLowerCase();
    let working = allInstruments.filter(inst => {
      // Match search term
      const matchesSearch = inst.tradingsymbol?.toLowerCase().includes(searchLower) ||
        inst.name?.toLowerCase().includes(searchLower);

      if (!matchesSearch) return false;

      // Filter by instrument type if specified
      if (typeFilter) {
        const instType = inst.instrumentType || inst.instrument_type;
        if (Array.isArray(typeFilter)) {
          return typeFilter.includes(instType);
        }
        return instType === typeFilter;
      }

      return true;
    });

    // Keep instruments expiring today — tradeable until exchange close (Fix 24).
    const nowISTInst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const todayISTInst = new Date(nowISTInst.getFullYear(), nowISTInst.getMonth(), nowISTInst.getDate()).getTime();
    working = working.filter(inst => {
      if (!inst.expiry) return true;
      const exp = new Date(inst.expiry);
      if (isNaN(exp.getTime())) return true;
      const expIST = new Date(exp.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const expDay = new Date(expIST.getFullYear(), expIST.getMonth(), expIST.getDate()).getTime();
      return expDay >= todayISTInst;
    });

    let expiryKey = mapAdminSegmentToExpirySettingsKey(filterSegment);
    if (!expiryKey) {
      expiryKey = inferExpiryKeyFromExchangeAndType(zerodhaExchange, typeFilter);
    }
    if (expiryKey) {
      working = await filterZerodhaInstrumentsByExpirySettings(working, expiryKey);
    }

    const filtered = working
      .slice(0, 50)
      .map(inst => {
        // Format expiry date if available
        let expiryStr = '';
        if (inst.expiry) {
          const expDate = new Date(inst.expiry);
          expiryStr = expDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        }
        
        // Zerodha uses 'tradingsymbol' (lowercase) - handle both cases
        const tradingSymbol = inst.tradingsymbol || inst.trading_symbol || inst.symbol || '';
        
        return {
          symbol: tradingSymbol,
          tradingSymbol: tradingSymbol,
          name: inst.name || '',
          instrumentToken: inst.instrument_token || inst.instrumentToken,
          lotSize: inst.lot_size || inst.lotSize || 1,
          exchange: inst.exchange,
          instrumentType: inst.instrument_type || inst.instrumentType,
          expiry: expiryStr,
          strike: inst.strike,
          segment: inst.segment
        };
      });
      
    if (search && search.length >= 2) {
      const searchUpper = search.toUpperCase();
      const prefixCount = working.filter(inst => {
        const symbol = inst.tradingsymbol || inst.trading_symbol || inst.symbol || '';
        return symbol.toUpperCase().startsWith(searchUpper);
      }).length;

      if (prefixCount > 0) {
        filtered.unshift({
          symbol: searchUpper,
          tradingSymbol: searchUpper,
          name: `${searchUpper} (Base Prefix) - Applies to ~${prefixCount} active scripts`,
          lotSize: 1,
          exchange: zerodhaExchange
        });
      }
    }
    
    res.json({ success: true, instruments: filtered });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single segment
app.get('/api/admin/segments/:id', async (req, res) => {
  try {
    const segment = await Segment.findById(req.params.id);
    if (!segment) return res.status(404).json({ success: false, error: 'Segment not found' });
    res.json({ success: true, segment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update segment settings
app.put('/api/admin/segments/:id', async (req, res) => {
  try {
    const {
      // Lot Settings
      limitType, maxValue, maxLots, minLots, orderLots,
      // Brokerage Settings
      commissionType, commission, exposureIntraday, exposureCarryForward,
      // Qty Settings
      maxQtyHolding, perOrderQty,
      // Fixed Margin Settings
      intradayHolding, overnightHolding, optionBuyIntraday, optionBuyOvernight, optionSellIntraday, optionSellOvernight,
      // Options Settings
      buyingStrikeFar, sellingStrikeFar,
      buyingStrikeFarPercent, sellingStrikeFarPercent,
      // Limit away (netting)
      limitAwayPoints,
      limitAwayPercent,
      // Spread Settings
      spreadType, spreadPips, markupPips,
      // Commission Settings (open/close)
      openCommission, closeCommission,
      // Swap Settings
      swapType, swapLong, swapShort, tripleSwapDay,
      // Margin/Leverage Settings
      maxLeverage, defaultLeverage, fixedLeverage, leverageOptions, marginMode, marginRate, hedgedMarginRate,
      // Contract Specs
      contractSize, digits, pipSize, pipValue, lotStep,
      // Block Settings
      isActive, tradingEnabled, blockOptions, blockFractionLot, allowOvernight
    } = req.body;
    
    const segment = await Segment.findByIdAndUpdate(
      req.params.id,
      {
        limitType, maxValue, maxLots, minLots, orderLots,
        commissionType, commission, exposureIntraday, exposureCarryForward,
        maxQtyHolding, perOrderQty,
        intradayHolding, overnightHolding, optionBuyIntraday, optionBuyOvernight, optionSellIntraday, optionSellOvernight,
        buyingStrikeFar, sellingStrikeFar,
        buyingStrikeFarPercent, sellingStrikeFarPercent,
        limitAwayPoints,
        limitAwayPercent,
        spreadType, spreadPips, markupPips,
        openCommission, closeCommission,
        swapType, swapLong, swapShort, tripleSwapDay,
        maxLeverage, defaultLeverage, fixedLeverage, leverageOptions, marginMode, marginRate, hedgedMarginRate,
        contractSize, digits, pipSize, pipValue, lotStep,
        isActive, tradingEnabled, blockOptions, blockFractionLot, allowOvernight,
        updatedAt: Date.now()
      },
      { new: true }
    );
    
    if (!segment) return res.status(404).json({ success: false, error: 'Segment not found' });

    // Netting mode reads NettingSegment for lot/risk fields; main admin UI only updates Segment.
    // Keep the parallel NettingSegment row in sync so minLots / maxLots / etc. apply on the client.
    try {
      const NettingSegment = require('./models/NettingSegment');
      const syncKeys = [
        'limitType', 'maxValue', 'maxExchangeLots', 'maxLots', 'minLots', 'orderLots',
        'commissionType', 'commission', 'openCommission', 'closeCommission',
        'exposureIntraday', 'exposureCarryForward',
        'maxQtyHolding', 'perOrderQty',
        'intradayHolding', 'overnightHolding',
        'optionBuyIntraday', 'optionBuyOvernight', 'optionSellIntraday', 'optionSellOvernight',
        'buyingStrikeFar', 'sellingStrikeFar',
        'buyingStrikeFarPercent', 'sellingStrikeFarPercent',
        'limitAwayPoints', 'limitAwayPercent',
        'isActive', 'tradingEnabled', 'blockOptions', 'blockFractionLot',
        'ledgerBalanceClose', 'profitTradeHoldMinSeconds', 'lossTradeHoldMinSeconds',
        'blockLimitAboveBelowHighLow', 'blockLimitBetweenHighLow', 'exitOnlyMode', 'allowOvernight'
      ];
      const $set = { updatedAt: Date.now() };
      for (const k of syncKeys) {
        if (segment[k] !== undefined) $set[k] = segment[k];
      }
      await NettingSegment.findOneAndUpdate({ name: segment.name }, { $set });
    } catch (syncErr) {
      console.error('[admin/segments] NettingSegment sync failed:', segment.name, syncErr.message);
    }

    res.json({ success: true, segment, message: 'Segment settings updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== HEDGING MODE SEGMENT MANAGEMENT ==============

// Get all Hedging segments
app.get('/api/admin/hedging/segments', async (req, res) => {
  try {
    const segments = await HedgingSegment.find().sort({ exchange: 1, segmentType: 1 });
    res.json({ success: true, segments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single Hedging segment
app.get('/api/admin/hedging/segments/:id', async (req, res) => {
  try {
    const segment = await HedgingSegment.findById(req.params.id);
    if (!segment) return res.status(404).json({ success: false, error: 'Hedging segment not found' });
    res.json({ success: true, segment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update Hedging segment settings
app.put('/api/admin/hedging/segments/:id', async (req, res) => {
  try {
    const updateData = { ...req.body, updatedAt: Date.now() };
    delete updateData._id;
    delete updateData.name;
    delete updateData.displayName;
    delete updateData.exchange;
    delete updateData.segmentType;
    delete updateData.marketType;
    
    const segment = await HedgingSegment.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!segment) return res.status(404).json({ success: false, error: 'Hedging segment not found' });

    logAdminSettingsChange({
      req,
      description: `Updated hedging segment settings: ${segment.name}`,
      metadata: { segmentName: segment.name, changes: req.body }
    });

    res.json({ success: true, segment, message: 'Hedging segment settings updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reseed Hedging segments
app.post('/api/admin/hedging/segments/reseed', async (req, res) => {
  try {
    await HedgingSegment.seedDefaultSegments();
    const segments = await HedgingSegment.find().sort({ exchange: 1, segmentType: 1 });
    res.json({ success: true, message: `Seeded Hedging segments. Total: ${segments.length}`, segments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== NETTING SEGMENT SETTINGS API ==============

// Get all Netting segments
app.get('/api/admin/netting-segments', async (req, res) => {
  try {
    const NettingSegment = require('./models/NettingSegment');
    // Ensure segments are seeded
    await NettingSegment.seedDefaultSegments();
    const segments = await NettingSegment.find().sort({ name: 1 });
    res.json({ success: true, segments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single Netting segment
app.get('/api/admin/netting-segments/:id', async (req, res) => {
  try {
    const NettingSegment = require('./models/NettingSegment');
    const segment = await NettingSegment.findById(req.params.id);
    if (!segment) return res.status(404).json({ success: false, error: 'Netting segment not found' });
    res.json({ success: true, segment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper: log an admin settings change to AdminActivityLog (fire-and-forget, never blocks the response).
// Resolves admin identity from the Bearer token — handles BOTH formats:
//   1. JWT token (Super Admin login via signToken) → decode with jwt.verify to get user._id
//   2. `admin-{ObjectId}` token (Sub-Admin / Broker login) → parse ObjectId directly
async function logAdminSettingsChange({ req, activityType = 'settings_change', description, metadata = {} }) {
  try {
    let adminId = 'system';
    let oderId = 'system';
    let role = 'admin';
    let adminName = '';

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];

      if (token && token.startsWith('admin-')) {
        // Sub-admin / Broker token: admin-{ObjectId}
        const objectId = token.slice('admin-'.length);
        if (/^[a-f\d]{24}$/i.test(objectId)) {
          const admin = await Admin.findById(objectId).select('_id oderId name email role').lean();
          if (admin) {
            adminId = admin._id.toString();
            oderId = admin.oderId || admin.email || adminId;
            role = admin.role || 'admin';
            adminName = admin.name || '';
          }
        }
      } else if (token) {
        // JWT token: Super Admin — decode to get user._id, look up in User collection (admin role)
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'BharatFundedTrade-secret-key-2024');
          if (decoded && decoded.id) {
            const user = await User.findById(decoded.id).select('_id oderId name email role').lean();
            if (user) {
              adminId = user._id.toString();
              oderId = user.oderId || user.email || adminId;
              role = user.role || 'admin';
              adminName = user.name || '';
            }
          }
        } catch (_jwtErr) {
          // Invalid/expired JWT — log as system
        }
      }
    }

    const logData = {
      adminId,
      oderId,
      role,
      activityType,
      description: adminName ? `[${adminName}] ${description}` : description,
      metadata,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || '',
      userAgent: req.headers['user-agent'] || '',
      status: 'success'
    };
    console.log('[AdminActivityLog] Creating log:', JSON.stringify({ adminId, oderId, role, activityType, description: logData.description }));
    const result = await AdminActivityLog.logActivity(logData);
    console.log('[AdminActivityLog] Result:', result ? 'OK — _id=' + result._id : 'FAILED (null)');
  } catch (err) {
    console.error('[AdminActivityLog] Failed to log:', err.message, err.stack);
  }
}

// Update Netting segment settings
app.put('/api/admin/netting-segments/:id', async (req, res) => {
  try {
    const NettingSegment = require('./models/NettingSegment');
    const updateData = { ...req.body, updatedAt: Date.now() };
    delete updateData._id;
    delete updateData.name;
    delete updateData.displayName;
    delete updateData.exchange;
    delete updateData.segmentType;
    delete updateData.marketType;

    const segment = await NettingSegment.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!segment) return res.status(404).json({ success: false, error: 'Netting segment not found' });

    // Log to admin activity — awaited so we catch any errors
    try {
      await logAdminSettingsChange({
        req,
        description: `Updated netting segment settings: ${segment.name}`,
        metadata: { segmentName: segment.name, changes: req.body }
      });
      console.log('[NettingSegment] Activity log created for:', segment.name);
    } catch (logErr) {
      console.error('[NettingSegment] Activity log FAILED:', logErr.message, logErr.stack);
    }

    res.json({ success: true, segment, message: 'Netting segment settings updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reseed Netting segments
app.post('/api/admin/netting-segments/reseed', async (req, res) => {
  try {
    const NettingSegment = require('./models/NettingSegment');
    await NettingSegment.seedDefaultSegments();
    const segments = await NettingSegment.find().sort({ name: 1 });
    res.json({ success: true, message: `Seeded Netting segments. Total: ${segments.length}`, segments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Netting script overrides
app.get('/api/admin/netting-scripts', async (req, res) => {
  try {
    const NettingScriptOverride = require('./models/NettingScriptOverride');
    const { search, segment, allSegments, page = 1, limit = 100 } = req.query;

    const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    const query = {};
    const searchTrim = search != null ? String(search).trim() : '';
    if (searchTrim) {
      query.symbol = { $regex: escapeRegExp(searchTrim), $options: 'i' };
    }
    const searchAll = allSegments === '1' || allSegments === 'true';
    if (segment && !(searchTrim && searchAll)) {
      const NettingSegment = require('./models/NettingSegment');
      const segDoc = await NettingSegment.findOne({ name: segment });
      if (segDoc) {
        query.segmentId = segDoc._id;
      }
    }
    
    const scripts = await NettingScriptOverride.find(query)
      .populate('segmentId', 'name displayName')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort({ symbol: 1 });
    
    const total = await NettingScriptOverride.countDocuments(query);
    
    res.json({
      success: true,
      scripts: scripts.map(s => ({
        ...s.toObject(),
        segmentName: s.segmentId?.displayName || s.segmentId?.name,
        segment: s.segmentId?.name
      })),
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create/Update Netting script override
app.post('/api/admin/netting-scripts', async (req, res) => {
  try {
    const NettingScriptOverride = require('./models/NettingScriptOverride');
    const NettingSegment = require('./models/NettingSegment');
    const { symbol, segmentId, ...settings } = req.body;
    delete settings.maxExchangeLots;

    if (!symbol || !segmentId) {
      return res.status(400).json({ success: false, error: 'Symbol and segmentId are required' });
    }

    const segment = await NettingSegment.findById(segmentId);
    if (!segment) {
      return res.status(400).json({ success: false, error: 'Invalid segmentId' });
    }

    const normSymbol = String(symbol).trim().toUpperCase();
    const segmentLabel = segment.displayName || segment.name;

    const script = await NettingScriptOverride.findOneAndUpdate(
      { symbol: normSymbol, segmentId },
      {
        $set: {
          symbol: normSymbol,
          segmentId,
          segmentName: segmentLabel,
          tradingSymbol: normSymbol,
          ...settings,
          updatedAt: Date.now()
        }
      },
      { upsert: true, new: true }
    );
    
    res.json({ success: true, script, message: 'Script override saved' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update Netting script override
app.put('/api/admin/netting-scripts/:id', async (req, res) => {
  try {
    const NettingScriptOverride = require('./models/NettingScriptOverride');
    const updateData = { ...req.body, updatedAt: Date.now() };
    delete updateData._id;
    delete updateData.maxExchangeLots;

    const script = await NettingScriptOverride.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!script) return res.status(404).json({ success: false, error: 'Script override not found' });

    logAdminSettingsChange({
      req,
      description: `Updated netting script override: ${script.tradingSymbol} (${script.segmentName})`,
      metadata: { symbol: script.tradingSymbol, segment: script.segmentName, changes: req.body }
    });

    res.json({ success: true, script, message: 'Script override updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete Netting script override
app.delete('/api/admin/netting-scripts/:id', async (req, res) => {
  try {
    const NettingScriptOverride = require('./models/NettingScriptOverride');
    const script = await NettingScriptOverride.findByIdAndDelete(req.params.id);
    if (!script) return res.status(404).json({ success: false, error: 'Script override not found' });
    res.json({ success: true, message: 'Script override deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Copy netting segment settings from one user to others
app.post('/api/admin/user-segment-settings/copy', async (req, res) => {
  try {
    const UserSegmentSettings = require('./models/UserSegmentSettings');
    const { sourceUserId, targetUserIds, tradeMode = 'netting' } = req.body;
    
    if (!sourceUserId || !targetUserIds || targetUserIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Source user and target users are required' });
    }
    
    // Get source user's settings — netting includes null-mode (legacy) rows, hedging is strict
    const sourceModeQuery = tradeMode === 'hedging'
      ? { tradeMode: 'hedging' }
      : { $or: [{ tradeMode: null }, { tradeMode: { $exists: false } }, { tradeMode: 'netting' }] };
    const sourceSettings = await UserSegmentSettings.find({ userId: sourceUserId, ...sourceModeQuery }).lean();
    
    if (sourceSettings.length === 0) {
      return res.status(404).json({ success: false, error: 'No settings found for source user' });
    }
    
    let copiedCount = 0;
    for (const targetUserId of targetUserIds) {
      for (const setting of sourceSettings) {
        const { _id, userId, createdAt, updatedAt, ...settingData } = setting;
        await UserSegmentSettings.findOneAndUpdate(
          { userId: targetUserId, segmentId: setting.segmentId, tradeMode },
          { $set: { ...settingData, userId: targetUserId, updatedAt: Date.now() } },
          { upsert: true }
        );
        copiedCount++;
      }
    }
    
    res.json({ success: true, message: `Copied ${copiedCount} settings to ${targetUserIds.length} user(s)` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Verify segment settings separation: hedging uses HedgingSegment, netting uses Segment (no mix-up)
app.get('/api/admin/segment-settings-verify', async (req, res) => {
  try {
    const { segmentName = 'FOREX' } = req.query;
    const hedgingDoc = await HedgingSegment.findOne({ name: segmentName }).lean();
    const segmentDoc = await Segment.findOne({ name: segmentName }).lean();
    res.json({
      success: true,
      segmentName,
      hedging: {
        source: 'HedgingSegment',
        usedBy: 'HedgingEngine (hedging mode trades)',
        found: !!hedgingDoc,
        ...(hedgingDoc && {
          contractSize: hedgingDoc.contractSize,
          digits: hedgingDoc.digits,
          pipSize: hedgingDoc.pipSize,
          pipValue: hedgingDoc.pipValue,
          lotStep: hedgingDoc.lotStep,
          maxLots: hedgingDoc.maxLots,
          minLots: hedgingDoc.minLots,
          maxPositionsPerSymbol: hedgingDoc.maxPositionsPerSymbol,
          maxTotalPositions: hedgingDoc.maxTotalPositions,
          marginMode: hedgingDoc.marginMode,
          marginRate: hedgingDoc.marginRate,
          hedgedMarginRate: hedgingDoc.hedgedMarginRate,
          spreadType: hedgingDoc.spreadType,
          spreadPips: hedgingDoc.spreadPips,
          markupPips: hedgingDoc.markupPips,
          openCommission: hedgingDoc.openCommission,
          closeCommission: hedgingDoc.closeCommission,
          commissionType: hedgingDoc.commissionType,
          swapType: hedgingDoc.swapType,
          swapLong: hedgingDoc.swapLong,
          swapShort: hedgingDoc.swapShort,
          tripleSwapDay: hedgingDoc.tripleSwapDay,
          limitType: hedgingDoc.limitType,
          maxValue: hedgingDoc.maxValue,
          isActive: hedgingDoc.isActive,
          tradingEnabled: hedgingDoc.tradingEnabled
        })
      },
      netting: {
        source: 'Segment',
        usedBy: 'NettingEngine (netting mode / Indian trades)',
        found: !!segmentDoc,
        ...(segmentDoc && {
          maxLots: segmentDoc.maxLots,
          minLots: segmentDoc.minLots,
          limitType: segmentDoc.limitType,
          maxValue: segmentDoc.maxValue,
          isActive: segmentDoc.isActive,
          tradingEnabled: segmentDoc.tradingEnabled
        })
      },
      message: 'Hedging and netting use separate segment collections; changing one does not affect the other.'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== HEDGING SCRIPT OVERRIDE MANAGEMENT ==============

// Get all Hedging script overrides
app.get('/api/admin/hedging/scripts', async (req, res) => {
  try {
    const { segmentId, search, page = 1, limit = 50 } = req.query;
    const query = {};
    if (segmentId) query.segmentId = segmentId;
    if (search) {
      query.$or = [
        { symbol: { $regex: search, $options: 'i' } },
        { tradingSymbol: { $regex: search, $options: 'i' } }
      ];
    }
    
    const total = await HedgingScriptOverride.countDocuments(query);
    const scripts = await HedgingScriptOverride.find(query)
      .sort({ segmentName: 1, symbol: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    res.json({ success: true, scripts, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create Hedging script override
app.post('/api/admin/hedging/scripts', async (req, res) => {
  try {
    const { symbol, segmentId } = req.body;
    if (!symbol || !segmentId) {
      return res.status(400).json({ success: false, error: 'Symbol and segmentId are required' });
    }
    
    const existing = await HedgingScriptOverride.findOne({ symbol: symbol.toUpperCase(), segmentId });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Script override already exists' });
    }
    
    const segment = await HedgingSegment.findById(segmentId);
    if (!segment) {
      return res.status(404).json({ success: false, error: 'Hedging segment not found' });
    }
    
    const scriptOverride = new HedgingScriptOverride({
      symbol: symbol.toUpperCase(),
      tradingSymbol: symbol.toUpperCase(),
      segmentId,
      segmentName: segment.name,
      isActive: true
    });
    
    await scriptOverride.save();
    res.json({ success: true, script: scriptOverride, message: 'Hedging script override created' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update Hedging script override
app.put('/api/admin/hedging/scripts/:id', async (req, res) => {
  try {
    const updateData = { ...req.body, updatedAt: Date.now() };
    delete updateData._id;
    delete updateData.symbol;
    delete updateData.segmentId;
    delete updateData.segmentName;
    
    const script = await HedgingScriptOverride.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!script) return res.status(404).json({ success: false, error: 'Hedging script override not found' });
    res.json({ success: true, script, message: 'Hedging script override updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete Hedging script override
app.delete('/api/admin/hedging/scripts/:id', async (req, res) => {
  try {
    const script = await HedgingScriptOverride.findByIdAndDelete(req.params.id);
    if (!script) return res.status(404).json({ success: false, error: 'Hedging script override not found' });
    res.json({ success: true, message: 'Hedging script override deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new script override
app.post('/api/admin/scripts', async (req, res) => {
  try {
    const { symbol, segmentId } = req.body;
    
    console.log('[Create Script] Request body:', JSON.stringify(req.body));

    if (!symbol || !segmentId) {
      return res.status(400).json({ success: false, error: 'Symbol and segmentId are required' });
    }

    // Check if script override already exists
    const existing = await ScriptOverride.findOne({ symbol: symbol.toUpperCase(), segmentId });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Script override already exists for this symbol in this segment' });
    }

    // Get segment info
    const segment = await Segment.findById(segmentId);
    if (!segment) {
      return res.status(404).json({ success: false, error: 'Segment not found' });
    }
    
    console.log('[Create Script] Segment found:', segment.name);

    // Create with only required fields and let defaults handle the rest
    const scriptData = {
      symbol: symbol.toUpperCase(),
      tradingSymbol: symbol.toUpperCase(),
      segmentId,
      segmentName: segment.name || segment.displayName || 'Unknown',
      lotSize: 1,
      isActive: true
    };
    
    console.log('[Create Script] Creating with data:', JSON.stringify(scriptData));

    const scriptOverride = new ScriptOverride(scriptData);
    await scriptOverride.save();
    
    console.log('[Create Script] Success:', scriptOverride._id);
    res.json({ success: true, scriptOverride });
  } catch (error) {
    console.error('[Create Script] Error:', error.message, error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== GLOBAL RISK SETTINGS ==============

// Get global risk settings
app.get('/api/admin/risk-settings', async (req, res) => {
  try {
    const settings = await RiskSettings.getGlobalSettings();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update global risk settings
app.put('/api/admin/risk-settings', async (req, res) => {
  try {
    const {
      ledgerBalanceClose,
      profitTradeHoldMinSeconds,
      lossTradeHoldMinSeconds,
      blockLimitAboveBelowHighLow,
      blockLimitBetweenHighLow,
      exitOnlyMode,
      marginCallLevel,
      stopOutLevel
    } = req.body;
    
    let settings = await RiskSettings.findOne({ type: 'global' });
    if (!settings) {
      settings = new RiskSettings({ type: 'global' });
    }
    
    if (ledgerBalanceClose !== undefined) settings.ledgerBalanceClose = ledgerBalanceClose;
    if (profitTradeHoldMinSeconds !== undefined) settings.profitTradeHoldMinSeconds = profitTradeHoldMinSeconds;
    if (lossTradeHoldMinSeconds !== undefined) settings.lossTradeHoldMinSeconds = lossTradeHoldMinSeconds;
    if (blockLimitAboveBelowHighLow !== undefined) settings.blockLimitAboveBelowHighLow = blockLimitAboveBelowHighLow;
    if (blockLimitBetweenHighLow !== undefined) settings.blockLimitBetweenHighLow = blockLimitBetweenHighLow;
    if (exitOnlyMode !== undefined) settings.exitOnlyMode = exitOnlyMode;
    if (marginCallLevel !== undefined) settings.marginCallLevel = marginCallLevel;
    if (stopOutLevel !== undefined) settings.stopOutLevel = stopOutLevel;
    
    await settings.save();

    logAdminSettingsChange({
      req,
      description: `Updated global risk settings`,
      metadata: { changes: req.body }
    });

    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user-specific risk settings
app.get('/api/admin/user-risk-settings/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const settings = await UserRiskSettings.findOne({ userId });
    const globalSettings = await RiskSettings.getGlobalSettings();
    res.json({ success: true, settings, globalSettings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update user-specific risk settings
app.post('/api/admin/user-risk-settings', async (req, res) => {
  try {
    const {
      userId,
      oderId,
      ledgerBalanceClose,
      profitTradeHoldMinSeconds,
      lossTradeHoldMinSeconds,
      blockLimitAboveBelowHighLow,
      blockLimitBetweenHighLow,
      exitOnlyMode,
      marginCallLevel,
      stopOutLevel
    } = req.body;
    
    if (!userId || !oderId) {
      return res.status(400).json({ success: false, error: 'userId and oderId required' });
    }
    
    const settings = await UserRiskSettings.findOneAndUpdate(
      { userId },
      {
        userId,
        oderId,
        ledgerBalanceClose: ledgerBalanceClose ?? null,
        profitTradeHoldMinSeconds: profitTradeHoldMinSeconds ?? null,
        lossTradeHoldMinSeconds: lossTradeHoldMinSeconds ?? null,
        blockLimitAboveBelowHighLow: blockLimitAboveBelowHighLow ?? null,
        blockLimitBetweenHighLow: blockLimitBetweenHighLow ?? null,
        exitOnlyMode: exitOnlyMode ?? null,
        marginCallLevel: marginCallLevel ?? null,
        stopOutLevel: stopOutLevel ?? null
      },
      { upsert: true, new: true }
    );
    
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete user-specific risk settings (revert to global)
app.delete('/api/admin/user-risk-settings/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    await UserRiskSettings.deleteOne({ userId });
    res.json({ success: true, message: 'User risk settings deleted, will use global defaults' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get effective risk settings for a user (merged global + user)
app.get('/api/admin/user-risk-settings/:userId/effective', async (req, res) => {
  try {
    const { userId } = req.params;
    const effectiveSettings = await UserRiskSettings.getEffectiveSettings(userId);
    res.json({ success: true, settings: effectiveSettings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== EXPIRY SETTINGS ==============

// Get all expiry settings
app.get('/api/admin/expiry-settings', async (req, res) => {
  try {
    const settings = await ExpirySettings.find().sort({ segmentName: 1 });
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get expiry settings for a segment
app.get('/api/admin/expiry-settings/:segmentName', async (req, res) => {
  try {
    const { segmentName } = req.params;
    const settings = await ExpirySettings.getSettingsForSegment(segmentName);
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update expiry settings for a segment
app.put('/api/admin/expiry-settings/:segmentName', async (req, res) => {
  try {
    const { segmentName } = req.params;
    const { show, openNextBeforeDays, scriptSettings } = req.body;
    
    const settings = await ExpirySettings.findOneAndUpdate(
      { segmentName },
      { 
        segmentName,
        show: show ?? 1,
        openNextBeforeDays: openNextBeforeDays ?? 5,
        scriptSettings: scriptSettings || []
      },
      { upsert: true, new: true }
    );
    
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add script to segment expiry settings
app.post('/api/admin/expiry-settings/:segmentName/scripts', async (req, res) => {
  try {
    const { segmentName } = req.params;
    const { scriptName, show, openNextBeforeDays } = req.body;
    
    if (!scriptName) {
      return res.status(400).json({ success: false, error: 'Script name required' });
    }
    
    let settings = await ExpirySettings.findOne({ segmentName });
    if (!settings) {
      settings = new ExpirySettings({ segmentName });
    }
    
    // Check if script already exists
    const existingIndex = settings.scriptSettings.findIndex(s => s.scriptName === scriptName);
    if (existingIndex >= 0) {
      settings.scriptSettings[existingIndex] = { scriptName, show: show ?? 1, openNextBeforeDays: openNextBeforeDays ?? 5 };
    } else {
      settings.scriptSettings.push({ scriptName, show: show ?? 1, openNextBeforeDays: openNextBeforeDays ?? 5 });
    }
    
    await settings.save();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove script from segment expiry settings
app.delete('/api/admin/expiry-settings/:segmentName/scripts/:scriptName', async (req, res) => {
  try {
    const { segmentName, scriptName } = req.params;
    
    const settings = await ExpirySettings.findOne({ segmentName });
    if (settings) {
      settings.scriptSettings = settings.scriptSettings.filter(s => s.scriptName !== scriptName);
      await settings.save();
    }
    
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all script overrides across all segments
app.get('/api/admin/scripts/all', async (req, res) => {
  try {
    const { search, page = 1, limit = 100 } = req.query;
    
    const query = {};
    if (search) {
      query.symbol = { $regex: search, $options: 'i' };
    }
    
    const total = await ScriptOverride.countDocuments(query);
    const scripts = await ScriptOverride.find(query)
      .populate('segmentId', 'displayName name exchange segmentType marketType')
      .sort({ segmentName: 1, symbol: 1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    res.json({
      success: true,
      scripts,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get script overrides for a segment
app.get('/api/admin/segments/:segmentId/scripts', async (req, res) => {
  try {
    const { segmentId } = req.params;
    const { search, page = 1, limit = 50 } = req.query;
    
    const query = { segmentId };
    if (search) {
      query.$or = [
        { symbol: { $regex: search, $options: 'i' } },
        { tradingSymbol: { $regex: search, $options: 'i' } }
      ];
    }
    
    const total = await ScriptOverride.countDocuments(query);
    const scripts = await ScriptOverride.find(query)
      .sort({ symbol: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    res.json({
      success: true,
      scripts,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add script override
app.post('/api/admin/segments/:segmentId/scripts', async (req, res) => {
  try {
    const { segmentId } = req.params;
    const segment = await Segment.findById(segmentId);
    if (!segment) return res.status(404).json({ success: false, error: 'Segment not found' });
    
    const {
      symbol, tradingSymbol, instrumentToken, lotSize,
      // Lot Settings
      limitType, maxValue, maxLots, minLots, orderLots,
      // Brokerage Settings
      commissionType, commission, exposureIntraday, exposureCarryForward,
      // Qty Settings
      maxQtyHolding, perOrderQty,
      // Fixed Margin Settings
      intradayHolding, overnightHolding, optionBuyIntraday, optionBuyOvernight, optionSellIntraday, optionSellOvernight,
      // Options Settings
      buyingStrikeFar, sellingStrikeFar,
      // Limit Points Settings
      limitAwayPoints,
      spreadType, spreadPips, markupPips,
      openCommission, closeCommission,
      swapType, swapLong, swapShort, tripleSwapDay,
      // Block Settings
      isActive, tradingEnabled, blockOptions, blockFractionLot,
      // Risk
      ledgerBalanceClose, profitTradeHoldMinSeconds, lossTradeHoldMinSeconds,
      blockLimitAboveBelowHighLow, blockLimitBetweenHighLow, exitOnlyMode
    } = req.body;
    
    if (!symbol || !tradingSymbol) {
      return res.status(400).json({ success: false, error: 'Symbol and trading symbol required' });
    }
    
    const scriptOverride = await ScriptOverride.findOneAndUpdate(
      { segmentId, symbol: symbol.toUpperCase() },
      {
        segmentId,
        segmentName: segment.name,
        symbol: symbol.toUpperCase(),
        tradingSymbol,
        instrumentToken,
        lotSize: lotSize || 1,
        limitType, maxValue, maxLots, minLots, orderLots,
        commissionType, commission, exposureIntraday, exposureCarryForward,
        maxQtyHolding, perOrderQty,
        intradayHolding, overnightHolding, optionBuyIntraday, optionBuyOvernight, optionSellIntraday, optionSellOvernight,
        buyingStrikeFar, sellingStrikeFar,
        limitAwayPoints,
        spreadType, spreadPips, markupPips,
        openCommission, closeCommission,
        swapType, swapLong, swapShort, tripleSwapDay,
        isActive: isActive !== false,
        tradingEnabled: tradingEnabled !== false,
        blockOptions, blockFractionLot,
        ledgerBalanceClose, profitTradeHoldMinSeconds, lossTradeHoldMinSeconds,
        blockLimitAboveBelowHighLow, blockLimitBetweenHighLow, exitOnlyMode,
        updatedAt: Date.now()
      },
      { upsert: true, new: true }
    );
    
    res.json({ success: true, scriptOverride, message: 'Script override saved' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update script override
app.put('/api/admin/scripts/:id', async (req, res) => {
  try {
    const {
      lotSize,
      // Lot Settings
      limitType, maxValue, maxLots, minLots, orderLots,
      // Brokerage Settings
      commissionType, commission, exposureIntraday, exposureCarryForward,
      // Qty Settings
      maxQtyHolding, perOrderQty,
      // Fixed Margin Settings
      intradayHolding, overnightHolding, optionBuyIntraday, optionBuyOvernight, optionSellIntraday, optionSellOvernight,
      // Options Settings
      buyingStrikeFar, sellingStrikeFar,
      // Limit Points Settings
      limitAwayPoints,
      spreadType, spreadPips, markupPips,
      openCommission, closeCommission,
      swapType, swapLong, swapShort, tripleSwapDay,
      // Block Settings
      isActive, tradingEnabled, blockOptions, blockFractionLot,
      ledgerBalanceClose, profitTradeHoldMinSeconds, lossTradeHoldMinSeconds,
      blockLimitAboveBelowHighLow, blockLimitBetweenHighLow, exitOnlyMode
    } = req.body;
    
    const scriptOverride = await ScriptOverride.findByIdAndUpdate(
      req.params.id,
      {
        lotSize, limitType, maxValue, maxLots, minLots, orderLots,
        commissionType, commission, exposureIntraday, exposureCarryForward,
        maxQtyHolding, perOrderQty,
        intradayHolding, overnightHolding, optionBuyIntraday, optionBuyOvernight, optionSellIntraday, optionSellOvernight,
        buyingStrikeFar, sellingStrikeFar,
        limitAwayPoints,
        spreadType, spreadPips, markupPips,
        openCommission, closeCommission,
        swapType, swapLong, swapShort, tripleSwapDay,
        isActive, tradingEnabled, blockOptions, blockFractionLot,
        ledgerBalanceClose, profitTradeHoldMinSeconds, lossTradeHoldMinSeconds,
        blockLimitAboveBelowHighLow, blockLimitBetweenHighLow, exitOnlyMode,
        updatedAt: Date.now()
      },
      { new: true }
    );
    
    if (!scriptOverride) return res.status(404).json({ success: false, error: 'Script override not found' });
    res.json({ success: true, scriptOverride, message: 'Script override updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete script override
app.delete('/api/admin/scripts/:id', async (req, res) => {
  try {
    const scriptOverride = await ScriptOverride.findByIdAndDelete(req.params.id);
    if (!scriptOverride) return res.status(404).json({ success: false, error: 'Script override not found' });
    res.json({ success: true, message: 'Script override deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get effective settings for a symbol (merges segment + override)
app.get('/api/admin/scripts/effective/:segmentId/:symbol', async (req, res) => {
  try {
    const { segmentId, symbol } = req.params;
    const effectiveSettings = await ScriptOverride.getEffectiveSettings(segmentId, symbol.toUpperCase());
    res.json({ success: true, settings: effectiveSettings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sync lot sizes from Zerodha API for Indian instruments
app.post('/api/admin/segments/sync-lot-sizes', async (req, res) => {
  try {
    const { segmentName } = req.body;
    
    // Get Zerodha settings
    const zerodhaSettings = await ZerodhaSettings.findOne({ isActive: true });
    if (!zerodhaSettings) {
      return res.status(400).json({ success: false, error: 'Zerodha not configured' });
    }
    
    // Map segment to Zerodha exchange
    const exchangeMap = {
      'NSE_EQ': 'NSE',
      'NSE_FUT': 'NFO',
      'NSE_OPT': 'NFO',
      'BSE_FUT': 'BFO',
      'BSE_OPT': 'BFO',
      'MCX_FUT': 'MCX',
      'MCX_OPT': 'MCX'
    };
    
    const exchange = exchangeMap[segmentName];
    if (!exchange) {
      return res.status(400).json({ success: false, error: 'Invalid segment' });
    }
    
    // Get segment
    const segment = await Segment.findOne({ name: segmentName });
    if (!segment) {
      return res.status(404).json({ success: false, error: 'Segment not found' });
    }
    
    // Fetch instruments from Zerodha
    const instruments = await zerodhaService.getInstruments(exchange);
    if (!instruments || instruments.length === 0) {
      return res.status(400).json({ success: false, error: 'No instruments found from Zerodha' });
    }
    
    // Update or create script overrides with lot sizes
    let synced = 0;
    for (const inst of instruments) {
      if (inst.lot_size && inst.lot_size > 0) {
        await ScriptOverride.findOneAndUpdate(
          { segmentId: segment._id, symbol: inst.tradingsymbol },
          {
            segmentId: segment._id,
            segmentName: segment.name,
            symbol: inst.tradingsymbol,
            tradingSymbol: inst.tradingsymbol,
            instrumentToken: inst.instrument_token,
            lotSize: inst.lot_size,
            updatedAt: Date.now()
          },
          { upsert: true }
        );
        synced++;
      }
    }
    
    res.json({
      success: true,
      message: `Synced ${synced} instruments from ${exchange}`,
      synced
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== REORDER SETTINGS (Delayed Trade Execution) ==============

// Get reorder settings
app.get('/api/admin/reorder-settings', async (req, res) => {
  try {
    const settings = await ReorderSettings.getSettings();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update reorder settings
app.put('/api/admin/reorder-settings', async (req, res) => {
  try {
    const { globalDelaySeconds, isEnabled, priceMode, segmentDelays, userDelays } = req.body;
    const settings = await ReorderSettings.getSettings();
    
    if (globalDelaySeconds !== undefined) settings.globalDelaySeconds = globalDelaySeconds;
    if (isEnabled !== undefined) settings.isEnabled = isEnabled;
    if (priceMode !== undefined) settings.priceMode = priceMode;
    if (segmentDelays !== undefined) settings.segmentDelays = segmentDelays;
    if (userDelays !== undefined) settings.userDelays = userDelays;
    
    await settings.save();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get/Set user-specific delay
app.get('/api/admin/reorder-settings/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const settings = await ReorderSettings.getSettings();
    const userDelay = settings.userDelays.find(u => u.userId?.toString() === userId);
    res.json({ success: true, userDelay: userDelay || null });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/admin/reorder-settings/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { delaySeconds, isEnabled, segmentOverrides } = req.body;
    const settings = await ReorderSettings.getSettings();
    
    const existingIndex = settings.userDelays.findIndex(u => u.userId?.toString() === userId);
    if (existingIndex >= 0) {
      settings.userDelays[existingIndex].delaySeconds = delaySeconds;
      settings.userDelays[existingIndex].isEnabled = isEnabled;
      if (segmentOverrides !== undefined) {
        settings.userDelays[existingIndex].segmentOverrides = segmentOverrides;
      }
    } else {
      settings.userDelays.push({ userId, delaySeconds, isEnabled, segmentOverrides: segmentOverrides || [] });
    }
    
    await settings.save();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update user-segment specific delay
app.put('/api/admin/reorder-settings/user/:userId/segment/:segmentName', async (req, res) => {
  try {
    const { userId, segmentName } = req.params;
    const { delaySeconds, isEnabled } = req.body;
    const settings = await ReorderSettings.getSettings();
    
    let userIndex = settings.userDelays.findIndex(u => u.userId?.toString() === userId);
    if (userIndex < 0) {
      // Create user entry if doesn't exist
      settings.userDelays.push({ userId, delaySeconds: 0, isEnabled: true, segmentOverrides: [] });
      userIndex = settings.userDelays.length - 1;
    }
    
    const userDelay = settings.userDelays[userIndex];
    if (!userDelay.segmentOverrides) {
      userDelay.segmentOverrides = [];
    }
    
    const segmentIndex = userDelay.segmentOverrides.findIndex(s => s.segmentName === segmentName);
    if (segmentIndex >= 0) {
      userDelay.segmentOverrides[segmentIndex].delaySeconds = delaySeconds;
      userDelay.segmentOverrides[segmentIndex].isEnabled = isEnabled;
    } else {
      userDelay.segmentOverrides.push({ segmentName, delaySeconds, isEnabled });
    }
    
    await settings.save();
    res.json({ success: true, settings, userDelay });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove user-segment specific delay
app.delete('/api/admin/reorder-settings/user/:userId/segment/:segmentName', async (req, res) => {
  try {
    const { userId, segmentName } = req.params;
    const settings = await ReorderSettings.getSettings();
    
    const userIndex = settings.userDelays.findIndex(u => u.userId?.toString() === userId);
    if (userIndex >= 0 && settings.userDelays[userIndex].segmentOverrides) {
      settings.userDelays[userIndex].segmentOverrides = 
        settings.userDelays[userIndex].segmentOverrides.filter(s => s.segmentName !== segmentName);
      await settings.save();
    }
    
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove user-specific delay
app.delete('/api/admin/reorder-settings/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const settings = await ReorderSettings.getSettings();
    settings.userDelays = settings.userDelays.filter(u => u.userId?.toString() !== userId);
    await settings.save();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== PNL SHARING (Profit/Loss Sharing between Admin Hierarchy) ==============
const pnlSharingService = require('./services/pnlSharing.service');
const { PnlSharingSettings, PnlDistributionLog } = require('./models/PnlSharing');

// Get PnL sharing settings for an admin (Super Admin can view all, others can view own)
app.get('/api/admin/pnl-sharing/settings/:adminOderId', async (req, res) => {
  try {
    const { adminOderId } = req.params;
    const settings = await pnlSharingService.getSettings(adminOderId);
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update PnL sharing settings for an admin (Super Admin or parent can update)
app.put('/api/admin/pnl-sharing/settings/:adminOderId', async (req, res) => {
  try {
    const { adminOderId } = req.params;
    const { configuredByOderId, lossSharePercent, profitSharePercent, segmentOverrides, settlementMode } = req.body;
    
    if (!configuredByOderId) {
      return res.status(400).json({ success: false, error: 'configuredByOderId is required' });
    }
    
    // Verify the configurer has permission (super_admin or parent of target admin)
    // Check Admin model first, then User model for super admin
    let configurer = await Admin.findOne({ oderId: configuredByOderId });
    const target = await Admin.findOne({ oderId: adminOderId });
    
    // If not found in Admin model, check User model (for super admin)
    if (!configurer) {
      const userConfigurer = await User.findOne({ oderId: configuredByOderId, role: 'admin' });
      if (userConfigurer) {
        configurer = { role: 'super_admin', oderId: configuredByOderId };
      }
    }
    
    if (!configurer || !target) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    // Check permission: super_admin can configure anyone, sub_admin can configure their brokers
    const canConfigure = configurer.role === 'super_admin' || configurer.role === 'admin' ||
      (configurer.role === 'sub_admin' && target.parentOderId === configuredByOderId);
    
    if (!canConfigure) {
      return res.status(403).json({ success: false, error: 'No permission to configure this admin' });
    }
    
    const settings = await pnlSharingService.updateSettings(adminOderId, {
      lossSharePercent,
      profitSharePercent,
      segmentOverrides,
      settlementMode
    }, configuredByOderId);
    
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all children with their PnL sharing settings (for super admin or sub-admin)
app.get('/api/admin/pnl-sharing/children/:adminOderId', async (req, res) => {
  try {
    const { adminOderId } = req.params;
    const children = await pnlSharingService.getChildrenWithSettings(adminOderId);
    res.json({ success: true, children });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get my PnL earnings list
app.get('/api/admin/pnl-sharing/earnings/:adminOderId', async (req, res) => {
  try {
    const { adminOderId } = req.params;
    const { dateFrom, dateTo, segment, limit, skip } = req.query;
    
    const result = await pnlSharingService.getEarnings(adminOderId, {
      dateFrom,
      dateTo,
      segment,
      limit: parseInt(limit) || 50,
      skip: parseInt(skip) || 0
    });
    
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get my PnL summary
app.get('/api/admin/pnl-sharing/summary/:adminOderId', async (req, res) => {
  try {
    const { adminOderId } = req.params;
    const { dateFrom, dateTo } = req.query;
    
    const [summary, segmentSummary, userSummary] = await Promise.all([
      pnlSharingService.getSummary(adminOderId, dateFrom, dateTo),
      pnlSharingService.getSegmentSummary(adminOderId, dateFrom, dateTo),
      pnlSharingService.getUserSummary(adminOderId, dateFrom, dateTo)
    ]);
    
    res.json({ success: true, summary, segmentSummary, userSummary });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download my PnL report as CSV
app.get('/api/admin/pnl-sharing/download/:adminOderId', async (req, res) => {
  try {
    const { adminOderId } = req.params;
    const { dateFrom, dateTo, segment } = req.query;
    
    const csv = await pnlSharingService.generateCSV(adminOderId, { dateFrom, dateTo, segment });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=pnl-report-${adminOderId}-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download all distributions CSV (Super Admin only)
app.get('/api/admin/pnl-sharing/download-all', async (req, res) => {
  try {
    const { dateFrom, dateTo, segment, adminOderId } = req.query;
    
    const csv = await pnlSharingService.generateAllDistributionsCSV({ dateFrom, dateTo, segment, adminOderId });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=all-pnl-distributions-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all admins with their PnL sharing settings (Super Admin only)
app.get('/api/admin/pnl-sharing/all-admins', async (req, res) => {
  try {
    const admins = await Admin.find({ role: { $in: ['sub_admin', 'broker'] } }).select('-password');
    
    const adminsWithSettings = await Promise.all(
      admins.map(async (admin) => {
        const settings = await pnlSharingService.getSettings(admin.oderId);
        const summary = await pnlSharingService.getSummary(admin.oderId);
        return {
          ...admin.toObject(),
          pnlSharingSettings: settings,
          pnlSummary: summary
        };
      })
    );
    
    res.json({ success: true, admins: adminsWithSettings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== USER SEGMENT SETTINGS (Leverage, etc.) ==============

// Batch endpoint: get spreadType + spreadPips for ALL segments in a mode (netting or hedging)
// Used by client to apply spread to displayed bid/ask for every watchlist instrument
app.get('/api/user/segment-spreads', async (req, res) => {
  try {
    const mode = String(req.query.mode || 'netting').toLowerCase();
    const result = {};
    const scriptSpreads = {}; // Per-symbol spread overrides

    if (mode === 'hedging') {
      const HedgingSegment = require('./models/HedgingSegment');
      const HedgingScriptOverride = require('./models/HedgingScriptOverride');
      const segments = await HedgingSegment.find({ isActive: true }).select('name spreadType spreadPips').lean();
      segments.forEach(s => {
        result[s.name] = {
          spreadType: s.spreadType || 'fixed',
          spreadPips: Number(s.spreadPips) || 0
        };
      });
      // Fetch script-level spread overrides
      const scriptOverrides = await HedgingScriptOverride.find({
        $or: [
          { spreadPips: { $ne: null, $gt: 0 } },
          { spreadType: { $ne: null } }
        ]
      }).select('symbol segmentName spreadType spreadPips').lean();
      scriptOverrides.forEach(so => {
        scriptSpreads[so.symbol] = {
          spreadType: so.spreadType || result[so.segmentName]?.spreadType || 'fixed',
          spreadPips: so.spreadPips != null ? Number(so.spreadPips) : (result[so.segmentName]?.spreadPips || 0),
          segmentName: so.segmentName
        };
      });
    } else {
      const NettingSegment = require('./models/NettingSegment');
      const NettingScriptOverride = require('./models/NettingScriptOverride');
      const segments = await NettingSegment.find({ isActive: true }).select('name spreadType spreadPips').lean();
      segments.forEach(s => {
        result[s.name] = {
          spreadType: s.spreadType || 'fixed',
          spreadPips: Number(s.spreadPips) || 0
        };
      });
      // Fetch script-level spread overrides
      const scriptOverrides = await NettingScriptOverride.find({
        $or: [
          { spreadPips: { $ne: null, $gt: 0 } },
          { spreadType: { $ne: null } }
        ]
      }).select('symbol segmentName spreadType spreadPips').lean();
      scriptOverrides.forEach(so => {
        scriptSpreads[so.symbol] = {
          spreadType: so.spreadType || result[so.segmentName]?.spreadType || 'fixed',
          spreadPips: so.spreadPips != null ? Number(so.spreadPips) : (result[so.segmentName]?.spreadPips || 0),
          segmentName: so.segmentName
        };
      });
    }

    res.json({ success: true, spreads: result, scriptSpreads });
  } catch (error) {
    console.error('Error fetching segment spreads:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get segment settings for user (leverage, etc.)
// Optional ?symbol=EURUSD merges NettingScriptOverride (+ user overrides) for block flags like segment-settings on the engine.
app.get('/api/user/segment-settings/:segmentName', async (req, res) => {
  try {
    const { segmentName } = req.params;
    const NettingSegment = require('./models/NettingSegment');
    const jwt = require('jsonwebtoken');

    const symbolRaw = req.query.symbol;
    const symbolParam =
      symbolRaw != null && String(symbolRaw).trim() !== ''
        ? String(symbolRaw).toUpperCase().trim()
        : null;

    let rawUserId = req.query.userId ? String(req.query.userId) : null;
    try {
      const h = req.headers.authorization;
      if (h && h.startsWith('Bearer ')) {
        const decoded = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET);
        const u = await User.findById(decoded.id).select('oderId').lean();
        if (u?.oderId != null && String(u.oderId).trim() !== '') {
          rawUserId = String(u.oderId);
        }
      }
    } catch (e) {
      /* optional auth */
    }

    // Try NettingSegment first (primary for netting mode)
    let segment = await NettingSegment.findOne({ name: segmentName }).lean();

    // Fallback to legacy Segment if not found
    if (!segment) {
      segment = await Segment.findOne({ name: segmentName }).lean();
    }

    if (!segment) {
      // Return default settings if segment not found
      return res.json({
        success: true,
        settings: {
          isActive: true,
          tradingEnabled: true,
          exitOnlyMode: false,
          minLots: 0.01,
          orderLots: null,
          maxLots: null,
          minQty: 1,
          perOrderQty: null,
          maxQtyPerScript: null,
          intradayMargin: null,
          overnightMargin: null,
          maxLeverage: 500,
          defaultLeverage: 100,
          fixedLeverage: null,
          leverageOptions: [1, 5, 10, 20, 50, 100, 200, 500],
          limitAwayPoints: null,
          limitAwayPercent: null,
          buyingStrikeFar: null,
          buyingStrikeFarPercent: null,
          sellingStrikeFar: null,
          sellingStrikeFarPercent: null,
          marginCalcMode: 'fixed',
          fixedMarginAsPercent: false,
          fixedMarginIntradayAsPercent: false,
          fixedMarginOvernightAsPercent: false,
          fixedMarginOptionBuyIntradayAsPercent: false,
          fixedMarginOptionBuyOvernightAsPercent: false,
          fixedMarginOptionSellIntradayAsPercent: false,
          fixedMarginOptionSellOvernightAsPercent: false,
          allowOvernight: true
        }
      });
    }
    
    // Parse leverage options
    let leverageOptions = [1, 5, 10, 20, 50, 100, 200, 500];
    if (segment.leverageOptions) {
      try {
        leverageOptions = segment.leverageOptions.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
      } catch (e) {}
    }

    let mergedRow = null;
    if (symbolParam && segment._id) {
      try {
        mergedRow = await UserSegmentSettings.getEffectiveSettingsForUser(
          rawUserId,
          segment._id,
          symbolParam,
          'netting'
        );
      } catch (mergeErr) {
        console.error('[segment-settings] script/user merge', segmentName, symbolParam, mergeErr.message);
      }
    }

    const pick = (effVal, segKey, fallback = null) => {
      if (effVal !== undefined && effVal !== null) return effVal;
      const sv = segment[segKey];
      if (sv !== undefined && sv !== null) return sv;
      return fallback;
    };

    let outLeverageOptions = leverageOptions;
    const loSrc = mergedRow?.leverageOptions ?? segment.leverageOptions;
    if (loSrc) {
      try {
        if (typeof loSrc === 'string') {
          outLeverageOptions = loSrc.split(',').map((v) => parseInt(v.trim(), 10)).filter((v) => !isNaN(v));
        } else if (Array.isArray(loSrc) && loSrc.length) {
          outLeverageOptions = loSrc;
        }
      } catch (e) {
        /* keep parsed segment default */
      }
    }

    // When ?symbol= is present, return full effective settings (user > script > segment) so the trade
    // ticket matches NettingEngine — previously only block flags used mergedRow and lots/margins stayed segment-only.
    if (mergedRow) {
      return res.json({
        success: true,
        settings: {
          isActive: mergedRow.isActive !== false,
          tradingEnabled: mergedRow.tradingEnabled !== false,
          exitOnlyMode: mergedRow.exitOnlyMode === true,
          minLots: pick(mergedRow.minLots, 'minLots', 0.01),
          orderLots: pick(mergedRow.orderLots, 'orderLots', null),
          maxLots: pick(mergedRow.maxLots, 'maxLots', null),
          limitType: pick(mergedRow.limitType, 'limitType', 'lot'),
          maxValue: pick(mergedRow.maxValue, 'maxValue', 0),
          minQty: pick(mergedRow.minQty, 'minQty', 1),
          perOrderQty: pick(mergedRow.perOrderQty, 'perOrderQty', null),
          maxQtyPerScript: pick(mergedRow.maxQtyPerScript, 'maxQtyPerScript', null),
          maxQtyHolding: mergedRow.maxQtyHolding != null ? mergedRow.maxQtyHolding : null,
          intradayMargin:
            mergedRow.intradayHolding != null ? mergedRow.intradayHolding : segment.intradayMargin || null,
          overnightMargin:
            mergedRow.overnightHolding != null ? mergedRow.overnightHolding : segment.overnightMargin || null,
          optionBuyIntraday: pick(mergedRow.optionBuyIntraday, 'optionBuyIntraday', null),
          optionBuyOvernight: pick(mergedRow.optionBuyOvernight, 'optionBuyOvernight', null),
          optionSellIntraday: pick(mergedRow.optionSellIntraday, 'optionSellIntraday', null),
          optionSellOvernight: pick(mergedRow.optionSellOvernight, 'optionSellOvernight', null),
          // Do not pick() fallback to raw segment for these: merged row uses null to mean "not in use"
          // (e.g. segment % active with legacy limitAwayPoints still on the document would wrongly revive points).
          limitAwayPoints: mergedRow.limitAwayPoints ?? null,
          limitAwayPercent: mergedRow.limitAwayPercent ?? null,
          buyingStrikeFar: mergedRow.buyingStrikeFar ?? null,
          buyingStrikeFarPercent: mergedRow.buyingStrikeFarPercent ?? null,
          sellingStrikeFar: mergedRow.sellingStrikeFar ?? null,
          sellingStrikeFarPercent: mergedRow.sellingStrikeFarPercent ?? null,
          // Use merged row only — pick() would revive NettingSegment 0 / defaults when effective merge left field unset.
          spreadType: mergedRow.spreadType ?? null,
          spreadPips: mergedRow.spreadPips ?? null,
          markupPips: mergedRow.markupPips ?? null,
          swapType: mergedRow.swapType ?? null,
          swapLong: mergedRow.swapLong ?? null,
          swapShort: mergedRow.swapShort ?? null,
          tripleSwapDay: mergedRow.tripleSwapDay ?? null,
          commissionType: pick(mergedRow.commissionType, 'commissionType', null),
          commission: pick(mergedRow.commission, 'commission', null),
          chargeOn: mergedRow.chargeOn != null ? mergedRow.chargeOn : segment.chargeOn || 'open',
          hasScriptOverride: !!mergedRow.hasScriptOverride,
          marginCalcMode: mergedRow.marginCalcMode || segment.marginCalcMode || (segment.fixedMarginAsPercent === true ? 'percent' : 'fixed'),
          fixedMarginAsPercent: segment.fixedMarginAsPercent === true,
          fixedMarginIntradayAsPercent: mergedRow.fixedMarginIntradayAsPercent === true,
          fixedMarginOvernightAsPercent: mergedRow.fixedMarginOvernightAsPercent === true,
          fixedMarginOptionBuyIntradayAsPercent: mergedRow.fixedMarginOptionBuyIntradayAsPercent === true,
          fixedMarginOptionBuyOvernightAsPercent: mergedRow.fixedMarginOptionBuyOvernightAsPercent === true,
          fixedMarginOptionSellIntradayAsPercent: mergedRow.fixedMarginOptionSellIntradayAsPercent === true,
          fixedMarginOptionSellOvernightAsPercent: mergedRow.fixedMarginOptionSellOvernightAsPercent === true,
          // Expiry-day margins (Fix 24) — client uses these on expiry day to override regular margins
          expiryDayIntradayMargin: mergedRow.expiryDayIntradayMargin ?? null,
          expiryDayOptionBuyMargin: mergedRow.expiryDayOptionBuyMargin ?? null,
          expiryDayOptionSellMargin: mergedRow.expiryDayOptionSellMargin ?? null,
          // Per-side option brokerage (Fix 22/24)
          optionBuyCommission: mergedRow.optionBuyCommission ?? 0,
          optionSellCommission: mergedRow.optionSellCommission ?? 0,
          allowOvernight: mergedRow.allowOvernight !== false
        }
      });
    }

    // Derive marginCalcMode from the new field first, fall back to deprecated boolean
    const resolvedMarginCalcMode = segment.marginCalcMode || (segment.fixedMarginAsPercent === true ? 'percent' : 'fixed');
    const segFmPct = resolvedMarginCalcMode === 'percent';
    res.json({
      success: true,
      settings: {
        isActive: segment.isActive !== false,
        tradingEnabled: segment.tradingEnabled !== false,
        exitOnlyMode: segment.exitOnlyMode === true,
        minLots: segment.minLots ?? 0.01,
        orderLots: segment.orderLots || null,
        maxLots: segment.maxLots || null,
        limitType: segment.limitType || 'lot',
        maxValue: segment.maxValue ?? 0,
        minQty: segment.minQty || 1,
        perOrderQty: segment.perOrderQty || null,
        maxQtyPerScript: segment.maxQtyPerScript || null,
        maxQtyHolding: null,
        intradayMargin: segment.intradayMargin || null,
        overnightMargin: segment.overnightMargin || null,
        optionBuyIntraday: segment.optionBuyIntraday || null,
        optionBuyOvernight: segment.optionBuyOvernight || null,
        optionSellIntraday: segment.optionSellIntraday || null,
        optionSellOvernight: segment.optionSellOvernight || null,
        limitAwayPoints: segment.limitAwayPoints || null,
        limitAwayPercent: segment.limitAwayPercent ?? null,
        buyingStrikeFar: segment.buyingStrikeFar || null,
        buyingStrikeFarPercent: segment.buyingStrikeFarPercent ?? null,
        sellingStrikeFar: segment.sellingStrikeFar || null,
        sellingStrikeFarPercent: segment.sellingStrikeFarPercent ?? null,
        spreadType: segment.spreadType || null,
        spreadPips: segment.spreadPips ?? null,
        commissionType: segment.commissionType || null,
        commission: segment.commission ?? null,
        chargeOn: segment.chargeOn || 'open',
        hasScriptOverride: false,
        marginCalcMode: resolvedMarginCalcMode,
        fixedMarginAsPercent: segFmPct,
        fixedMarginIntradayAsPercent: !!(segFmPct && segment.intradayMargin != null && segment.intradayMargin > 0),
        fixedMarginOvernightAsPercent: !!(segFmPct && segment.overnightMargin != null && segment.overnightMargin > 0),
        fixedMarginOptionBuyIntradayAsPercent: !!(segFmPct && segment.optionBuyIntraday != null && segment.optionBuyIntraday > 0),
        fixedMarginOptionBuyOvernightAsPercent: !!(segFmPct && segment.optionBuyOvernight != null && segment.optionBuyOvernight > 0),
        fixedMarginOptionSellIntradayAsPercent: !!(segFmPct && segment.optionSellIntraday != null && segment.optionSellIntraday > 0),
        fixedMarginOptionSellOvernightAsPercent: !!(segFmPct && segment.optionSellOvernight != null && segment.optionSellOvernight > 0),
        // Expiry-day margins (Fix 24)
        expiryDayIntradayMargin: segment.expiryDayIntradayMargin ?? null,
        expiryDayOptionBuyMargin: segment.expiryDayOptionBuyMargin ?? null,
        expiryDayOptionSellMargin: segment.expiryDayOptionSellMargin ?? null,
        // Per-side option brokerage (Fix 22/24)
        optionBuyCommission: segment.optionBuyCommission ?? 0,
        optionSellCommission: segment.optionSellCommission ?? 0,
        allowOvernight: segment.allowOvernight !== false
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all segments settings for user (for caching). Optional ?userId=oderId merges UserSegmentSettings like NettingEngine.
// Includes isActive / tradingEnabled per segment for user UI (hide inactive; show but block trades when trading off).
app.get('/api/user/all-segment-settings', async (req, res) => {
  try {
    const NettingSegment = require('./models/NettingSegment');
    const jwt = require('jsonwebtoken');
    let rawUserId = req.query.userId ? String(req.query.userId) : null;
    try {
      const h = req.headers.authorization;
      if (h && h.startsWith('Bearer ')) {
        const token = h.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const u = await User.findById(decoded.id).select('oderId').lean();
        if (u && u.oderId != null && String(u.oderId).trim() !== '') {
          rawUserId = String(u.oderId);
        }
      }
    } catch (e) {
      /* optional auth — keep query userId or null */
    }

    const activeSegments = await Segment.find({ isActive: true }).lean();
    const nettingRows = await NettingSegment.find().lean();
    const nameSet = new Set([
      ...activeSegments.map((x) => x.name),
      ...nettingRows.map((x) => x.name)
    ]);

    const settings = {};

    for (const name of nameSet) {
      const segment = activeSegments.find((x) => x.name === name) || (await Segment.findOne({ name }).lean());
      const netting = nettingRows.find((x) => x.name === name) || (await NettingSegment.findOne({ name }).lean());
      if (!segment && !netting) continue;

      const segmentIdForNetting = netting?._id || segment?._id;
      if (!segmentIdForNetting) continue;

      let row;
      try {
        row = await UserSegmentSettings.getEffectiveSettingsForUser(
          rawUserId,
          segmentIdForNetting,
          null,
          'netting'
        );
      } catch (e) {
        console.error('[all-segment-settings] effective for', name, e.message);
        const lotSrc = netting || segment;
        row = {
          maxLots: lotSrc?.maxLots,
          minLots: lotSrc?.minLots,
          orderLots: lotSrc?.orderLots,
          maxQtyHolding: lotSrc?.maxQtyHolding,
          perOrderQty: lotSrc?.perOrderQty,
          limitType: lotSrc?.limitType,
          maxValue: lotSrc?.maxValue,
          lotStep: lotSrc?.lotStep ?? 0.01,
          isActive: lotSrc?.isActive,
          tradingEnabled: lotSrc?.tradingEnabled
        };
      }

      let leverageOptions = [1, 5, 10, 20, 50, 100, 200, 500];
      const lo = row.leverageOptions ?? segment?.leverageOptions;
      if (lo && typeof lo === 'string') {
        try {
          leverageOptions = lo.split(',').map((v) => parseInt(v.trim(), 10)).filter((v) => !isNaN(v));
        } catch (e) {
          /* keep default */
        }
      } else if (Array.isArray(lo) && lo.length) {
        leverageOptions = lo;
      }

      settings[name] = {
        isActive: row.isActive !== false,
        tradingEnabled: row.tradingEnabled !== false,
        maxLots: row.maxLots,
        minLots: row.minLots,
        orderLots: row.orderLots,
        maxQtyHolding: row.maxQtyHolding,
        perOrderQty: row.perOrderQty,
        limitType: row.limitType,
        maxValue: row.maxValue,
        lotStep: row.lotStep ?? segment?.lotStep ?? netting?.lotStep ?? 0.01
      };
    }

    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== USER INSTRUMENTS (Persist user's added instruments) ==============

// Get all instruments for a user (grouped by category)
app.get('/api/user/instruments/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    let user = await User.findOne({ oderId: userId });
    if (!user) user = await User.findById(userId).catch(() => null);
    if (!user) return res.json({ success: true, instruments: {} });
    
    const { grouped, watchlistPruned } = await UserInstruments.getInstrumentsForUser(user._id);
    res.json({ success: true, instruments: grouped, watchlistPruned });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add instrument for a user
app.post('/api/user/instruments/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { category, instrument } = req.body;
    if (!category || !instrument?.symbol) {
      return res.status(400).json({ success: false, error: 'Category and instrument required' });
    }
    
    let user = await User.findOne({ oderId: userId });
    if (!user) user = await User.findById(userId).catch(() => null);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    
    const result = await UserInstruments.addInstrument(user._id, user.oderId, category, instrument);
    res.json({ success: true, instrument: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove instrument for a user
app.delete('/api/user/instruments/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { category, symbol } = req.body;
    if (!category || !symbol) {
      return res.status(400).json({ success: false, error: 'Category and symbol required' });
    }
    
    let user = await User.findOne({ oderId: userId });
    if (!user) user = await User.findById(userId).catch(() => null);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    
    await UserInstruments.removeInstrument(user._id, category, symbol);
    res.json({ success: true, message: 'Instrument removed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== USER SEGMENT SETTINGS (Per-User Overrides) ==============

// Get users with custom segment settings
app.get('/api/admin/user-segment-settings', async (req, res) => {
  try {
    const { segmentId, search, page = 1, limit = 50 } = req.query;
    
    const query = {};
    if (segmentId) query.segmentId = segmentId;
    
    // Get unique users with settings
    const pipeline = [
      { $match: query },
      { $group: { 
        _id: '$userId',
        oderId: { $first: '$oderId' },
        settingsCount: { $sum: 1 },
        segments: { $addToSet: '$segmentName' }
      }},
      { $sort: { oderId: 1 } },
      { $skip: (parseInt(page) - 1) * parseInt(limit) },
      { $limit: parseInt(limit) }
    ];
    
    const usersWithSettings = await UserSegmentSettings.aggregate(pipeline);
    
    // Get user details
    const userIds = usersWithSettings.map(u => u._id);
    const users = await User.find({ _id: { $in: userIds } }).select('oderId name email phone');
    const userMap = {};
    users.forEach(u => { userMap[u._id.toString()] = u; });
    
    const result = usersWithSettings.map(u => ({
      userId: u._id,
      oderId: u.oderId,
      user: userMap[u._id.toString()] || null,
      settingsCount: u.settingsCount,
      segments: u.segments
    }));
    
    // Get total count
    const totalPipeline = [
      { $match: query },
      { $group: { _id: '$userId' } },
      { $count: 'total' }
    ];
    const totalResult = await UserSegmentSettings.aggregate(totalPipeline);
    const total = totalResult[0]?.total || 0;
    
    res.json({
      success: true,
      users: result,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search users for applying settings (MUST be before :userId route)
app.get('/api/admin/user-segment-settings/search-users', async (req, res) => {
  try {
    const { search, limit = 20 } = req.query;
    
    if (!search || search.length < 2) {
      return res.json({ success: true, users: [] });
    }
    
    const users = await User.find({
      $or: [
        { oderId: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ],
      role: { $ne: 'admin' }
    })
    .select('_id oderId name email phone status')
    .limit(parseInt(limit))
    .sort({ oderId: 1 });
    
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// All segment override rows for a user (must be before :userId — avoids "user" being parsed as id)
app.get('/api/admin/user-segment-settings/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { tradeMode } = req.query;
    const query = { userId };
    if (tradeMode === 'hedging') {
      query.tradeMode = 'hedging';
    } else if (tradeMode === 'netting') {
      query.$or = [
        { tradeMode: null },
        { tradeMode: { $exists: false } },
        { tradeMode: 'netting' }
      ];
    }
    const settings = await UserSegmentSettings.find(query)
      .populate('segmentId', 'name displayName exchange segmentType')
      .sort({ segmentName: 1, symbol: 1 });
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get segment settings for a specific user
app.get('/api/admin/user-segment-settings/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { segmentId, tradeMode } = req.query;
    
    const query = { userId };
    if (segmentId) query.segmentId = segmentId;
    if (tradeMode === 'hedging') {
      query.tradeMode = 'hedging';
    } else if (tradeMode === 'netting') {
      query.$or = [
        { tradeMode: null },
        { tradeMode: { $exists: false } },
        { tradeMode: 'netting' }
      ];
    }
    
    const settings = await UserSegmentSettings.find(query)
      .populate('segmentId', 'name displayName exchange segmentType')
      .sort({ segmentName: 1, symbol: 1 });
    
    // Get user info
    const user = await User.findById(userId).select('oderId name email phone');
    
    res.json({ success: true, user, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Apply segment settings to multiple users
app.post('/api/admin/user-segment-settings/bulk', async (req, res) => {
  try {
    const { userIds, segmentId, segmentName, settings, symbol, tradeMode } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ success: false, error: 'User IDs required' });
    }
    if (!segmentId || !segmentName) {
      return res.status(400).json({ success: false, error: 'Segment required' });
    }
    
    const results = await UserSegmentSettings.applyToMultipleUsers(
      userIds, segmentId, segmentName, settings, symbol, tradeMode
    );
    
    res.json({
      success: true,
      message: `Applied settings to ${results.length} users for ${tradeMode || 'all'} mode`,
      count: results.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Copy all segment overrides from one user to many (netting or hedging)
app.post('/api/admin/user-segment-settings/copy-from-user', async (req, res) => {
  try {
    const { sourceUserId, targetUserIds, tradeMode } = req.body;
    if (!sourceUserId) {
      return res.status(400).json({ success: false, error: 'sourceUserId required' });
    }
    if (!targetUserIds || !Array.isArray(targetUserIds) || targetUserIds.length === 0) {
      return res.status(400).json({ success: false, error: 'targetUserIds (non-empty array) required' });
    }
    const mode = tradeMode === 'hedging' ? 'hedging' : 'netting';
    const summary = await UserSegmentSettings.copyFromUserToUsers(sourceUserId, targetUserIds, mode);
    res.json({
      success: true,
      message: `Copied ${summary.sourceRowCount} setting row(s) to ${summary.targetUserCount} user(s) (${summary.upserts} upserts)`,
      ...summary
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update single user segment setting
app.put('/api/admin/user-segment-settings/:id', async (req, res) => {
  try {
    const {
      // Lot Settings
      limitType, maxValue, maxLots, minLots, orderLots, maxExchangeLots, lotSize,
      maxPositionsPerSymbol, maxTotalPositions,
      contractSize, digits, pipSize, pipValue, lotStep,
      // Brokerage Settings
      commissionType, commission, chargeOn, exposureIntraday, exposureCarryForward,
      // Per-side option brokerage (OPT segments) — was missing here, so Buy/Sell
      // Brokerage saved from the admin User Settings tab was silently dropped.
      optionBuyCommission, optionSellCommission,
      // Qty Settings
      maxQtyHolding, perOrderQty, minQty, maxQtyPerScript,
      // Fixed Margin Settings
      intradayHolding, overnightHolding, optionBuyIntraday, optionBuyOvernight, optionSellIntraday, optionSellOvernight,
      // Options Settings
      buyingStrikeFar, sellingStrikeFar,
      buyingStrikeFarPercent, sellingStrikeFarPercent,
      // Limit away (netting)
      limitAwayPoints,
      limitAwayPercent,
      // Spread Settings
      spreadType, spreadPips, markupPips,
      // Commission Settings
      openCommission, closeCommission,
      // Swap Settings
      swapType, swapLong, swapShort, tripleSwapDay,
      // Leverage / margin
      maxLeverage, defaultLeverage, fixedLeverage, leverageOptions,
      marginMode, marginRate, hedgedMarginRate,
      // Risk
      ledgerBalanceClose, profitTradeHoldMinSeconds, lossTradeHoldMinSeconds,
      expiryProfitHoldMinSeconds, expiryLossHoldMinSeconds, expiryDayIntradayMargin,
      // Per-side option expiry-day margin (Fix 17)
      expiryDayOptionBuyMargin, expiryDayOptionSellMargin,
      blockLimitAboveBelowHighLow, blockLimitBetweenHighLow, exitOnlyMode,
      // Block Settings
      isActive, tradingEnabled, blockOptions, blockFractionLot, allowOvernight
    } = req.body;

    const setting = await UserSegmentSettings.findByIdAndUpdate(
      req.params.id,
      {
        limitType, maxValue, maxLots, minLots, orderLots, maxExchangeLots, lotSize,
        maxPositionsPerSymbol, maxTotalPositions,
        contractSize, digits, pipSize, pipValue, lotStep,
        commissionType, commission, chargeOn, exposureIntraday, exposureCarryForward,
        optionBuyCommission, optionSellCommission,
        maxQtyHolding, perOrderQty, minQty, maxQtyPerScript,
        intradayHolding, overnightHolding, optionBuyIntraday, optionBuyOvernight, optionSellIntraday, optionSellOvernight,
        buyingStrikeFar, sellingStrikeFar,
        buyingStrikeFarPercent, sellingStrikeFarPercent,
        limitAwayPoints,
        limitAwayPercent,
        spreadType, spreadPips, markupPips,
        openCommission, closeCommission,
        swapType, swapLong, swapShort, tripleSwapDay,
        maxLeverage, defaultLeverage, fixedLeverage, leverageOptions,
        marginMode, marginRate, hedgedMarginRate,
        ledgerBalanceClose, profitTradeHoldMinSeconds, lossTradeHoldMinSeconds,
        expiryProfitHoldMinSeconds, expiryLossHoldMinSeconds, expiryDayIntradayMargin,
        expiryDayOptionBuyMargin, expiryDayOptionSellMargin,
        blockLimitAboveBelowHighLow, blockLimitBetweenHighLow, exitOnlyMode,
        isActive, tradingEnabled, blockOptions, blockFractionLot, allowOvernight,
        updatedAt: Date.now()
      },
      { new: true }
    );
    
    if (!setting) return res.status(404).json({ success: false, error: 'Setting not found' });

    logAdminSettingsChange({
      req,
      description: `Updated user segment settings: ${setting.segmentName} for user ${setting.userId}`,
      metadata: { segmentName: setting.segmentName, userId: setting.userId, changes: req.body }
    });

    res.json({ success: true, setting, message: 'User setting updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete user segment setting
app.delete('/api/admin/user-segment-settings/:id', async (req, res) => {
  try {
    const setting = await UserSegmentSettings.findByIdAndDelete(req.params.id);
    if (!setting) return res.status(404).json({ success: false, error: 'Setting not found' });
    res.json({ success: true, message: 'User setting deleted (will use defaults)' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete all settings for a user
app.delete('/api/admin/user-segment-settings/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { segmentId, tradeMode } = req.query;

    const query = { userId };
    if (segmentId) query.segmentId = segmentId;
    // Scope deletion to the correct mode — never delete across modes
    if (tradeMode === 'hedging') {
      query.tradeMode = 'hedging';
    } else if (tradeMode === 'netting') {
      query.$or = [
        { tradeMode: null },
        { tradeMode: { $exists: false } },
        { tradeMode: 'netting' }
      ];
    }
    // If no tradeMode passed, delete all (e.g. full user reset from admin)

    const result = await UserSegmentSettings.deleteMany(query);
    res.json({ 
      success: true, 
      message: `Deleted ${result.deletedCount} settings for user`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get effective settings for a user (for trading)
app.get('/api/admin/user-segment-settings/effective/:userId/:segmentId', async (req, res) => {
  try {
    const { userId, segmentId } = req.params;
    const { symbol } = req.query;
    
    const effectiveSettings = await UserSegmentSettings.getEffectiveSettingsForUser(
      userId, segmentId, symbol
    );
    
    res.json({ success: true, settings: effectiveSettings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// ============== MARKET CONTROL (Indian Market Timing) ==============

// Seed default market configurations on startup
const seedMarketControls = async () => {
  try {
    await MarketControl.seedDefaults();
  } catch (error) {
    console.error('Error seeding market controls:', error.message);
  }
};
seedMarketControls();

// Get all market controls
app.get('/api/admin/market-control', async (req, res) => {
  try {
    const markets = await MarketControl.find().sort({ market: 1 });
    res.json({ success: true, markets });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single market control
app.get('/api/admin/market-control/:market', async (req, res) => {
  try {
    const market = await MarketControl.findOne({ market: req.params.market });
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });
    res.json({ success: true, market });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update market control settings
app.put('/api/admin/market-control/:market', async (req, res) => {
  try {
    const {
      isActive, tradingHours, tradingDays, autoSquareOff,
      bufferTime, closedMessage
    } = req.body;
    
    const market = await MarketControl.findOneAndUpdate(
      { market: req.params.market },
      {
        ...(isActive !== undefined && { isActive }),
        ...(tradingHours && { tradingHours }),
        ...(tradingDays && { tradingDays }),
        ...(autoSquareOff && { autoSquareOff }),
        ...(bufferTime && { bufferTime }),
        ...(closedMessage && { closedMessage }),
        updatedAt: Date.now()
      },
      { new: true }
    );
    
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });

    logAdminSettingsChange({
      req,
      description: `Updated market control settings: ${req.params.market}`,
      metadata: { market: req.params.market, changes: req.body }
    });

    res.json({ success: true, market, message: 'Market settings updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add holiday
app.post('/api/admin/market-control/:market/holidays', async (req, res) => {
  try {
    const { date, description } = req.body;
    if (!date) return res.status(400).json({ success: false, error: 'Date is required' });
    
    const market = await MarketControl.findOne({ market: req.params.market });
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });
    
    market.holidays.push({ date: new Date(date), description });
    await market.save();
    
    res.json({ success: true, market, message: 'Holiday added' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove holiday
app.delete('/api/admin/market-control/:market/holidays/:holidayId', async (req, res) => {
  try {
    const market = await MarketControl.findOne({ market: req.params.market });
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });
    
    market.holidays = market.holidays.filter(h => h._id.toString() !== req.params.holidayId);
    await market.save();
    
    res.json({ success: true, market, message: 'Holiday removed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add special session
app.post('/api/admin/market-control/:market/special-sessions', async (req, res) => {
  try {
    const { date, openTime, closeTime, description } = req.body;
    if (!date || !openTime || !closeTime) {
      return res.status(400).json({ success: false, error: 'Date, openTime, and closeTime are required' });
    }
    
    const market = await MarketControl.findOne({ market: req.params.market });
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });
    
    market.specialSessions.push({ date: new Date(date), openTime, closeTime, description });
    await market.save();
    
    res.json({ success: true, market, message: 'Special session added' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove special session
app.delete('/api/admin/market-control/:market/special-sessions/:sessionId', async (req, res) => {
  try {
    const market = await MarketControl.findOne({ market: req.params.market });
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });
    
    market.specialSessions = market.specialSessions.filter(s => s._id.toString() !== req.params.sessionId);
    await market.save();
    
    res.json({ success: true, market, message: 'Special session removed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check if market is open (public endpoint for trading)
app.get('/api/market-status/:market', async (req, res) => {
  try {
    const status = await MarketControl.getMarketStatus(req.params.market);
    res.json({ success: true, ...status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check all markets status
app.get('/api/market-status', async (req, res) => {
  try {
    const markets = await MarketControl.find();
    const statuses = await Promise.all(
      markets.map(async (m) => ({
        market: m.market,
        displayName: m.displayName,
        ...(await MarketControl.getMarketStatus(m.market))
      }))
    );
    res.json({ success: true, markets: statuses });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== REPORTS & ANALYTICS ==============

// Financial Reports
app.get('/api/admin/reports/financial-reports', async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateQuery = {};
    if (from) dateQuery.$gte = new Date(from);
    if (to) dateQuery.$lte = new Date(to);

    const Transaction = require('./models/Transaction');
    const ChallengeAccount = require('./models/ChallengeAccount');

    // Pull every COMPLETED ChallengeAccount in the period and resolve
    // each one's actual fee. Sources of truth, in order of preference:
    //  1. linked challenge_purchase Transaction.amount (new UPI flow)
    //  2. couponSnapshot.finalFee (coupon-redeemed accounts)
    //  3. challenge.tiers[tierIndex].challengeFee
    //  4. challenge.challengeFee (legacy single-tier)
    // This way old wallet-flow purchases also count toward revenue.
    // DEMO accounts are free and self-served: they are not purchases and must
    // never reach the revenue or the account counts.
    const NOT_DEMO = { accountType: { $ne: 'DEMO' } };
    const accountQuery = { paymentStatus: 'COMPLETED', status: { $ne: 'CANCELLED' }, ...NOT_DEMO };
    if (from || to) accountQuery.createdAt = dateQuery;
    const accounts = await ChallengeAccount.find(accountQuery)
      .populate('challengeId', 'name challengeFee tiers')
      .lean();

    let totalChallengeBuys = 0;
    let challengeBuyCount = 0;
    for (const a of accounts) {
      let fee = 0;
      if (a.pendingPurchaseTransactionId) {
        try {
          const tx = await Transaction.findById(a.pendingPurchaseTransactionId).select('amount').lean();
          if (tx?.amount > 0) fee = Number(tx.amount);
        } catch (e) { /* ignore */ }
      }
      if (!fee && a.couponSnapshot?.finalFee > 0) fee = Number(a.couponSnapshot.finalFee);
      if (!fee) {
        const ch = a.challengeId;
        if (ch?.tiers?.length) fee = Number(ch.tiers[a.tierIndex || 0]?.challengeFee || 0);
        if (!fee && ch?.challengeFee) fee = Number(ch.challengeFee);
      }
      totalChallengeBuys += fee;
      challengeBuyCount += 1;
    }

    // Total payouts — approved funded-account withdrawals
    const payoutQuery = {
      type: 'withdrawal',
      status: { $in: ['approved', 'completed'] },
      'paymentDetails.kind': 'prop_payout'
    };
    if (from || to) payoutQuery.createdAt = dateQuery;
    const payouts = await Transaction.aggregate([
      { $match: payoutQuery },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]);

    // Active / Funded counts (no date filter — point-in-time snapshot)
    const activeCount = await ChallengeAccount.countDocuments({ status: 'ACTIVE', ...NOT_DEMO });
    const fundedCount = await ChallengeAccount.countDocuments({ status: 'FUNDED', ...NOT_DEMO });
    const passedCount = await ChallengeAccount.countDocuments({ status: 'PASSED', ...NOT_DEMO });

    // Paid resets on failed accounts — money collected, so it belongs in the
    // revenue line alongside the buys.
    const resetQuery = { type: 'challenge_reset', status: { $in: ['approved', 'completed'] } };
    if (from || to) resetQuery.createdAt = dateQuery;
    const resets = await Transaction.aggregate([
      { $match: resetQuery },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]);

    const aiSubs = await Transaction.aggregate([
      { $match: { ...(from || to ? { createdAt: dateQuery } : {}), type: 'ai_subscription', status: { $in: ['approved', 'completed'] } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]);

    const totalPayouts = payouts[0]?.total || 0;
    const totalResets = resets[0]?.total || 0;
    const totalAiSubs = aiSubs[0]?.total || 0;

    res.json({
      success: true,
      report: {
        totalChallengeBuys,
        totalResets,
        resetCount: resets[0]?.count || 0,
        totalAiSubs,
        aiSubCount: aiSubs[0]?.count || 0,
        totalPayouts,
        challengeBuyCount,
        payoutCount: payouts[0]?.count || 0,
        netRevenue: totalChallengeBuys + totalResets + totalAiSubs - totalPayouts,
        activeAccounts: activeCount,
        fundedAccounts: fundedCount,
        passedAccounts: passedCount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// User Reports — per-user prop activity breakdown.
//
// Source of truth for "challenge buys" is ChallengeAccount (NOT just
// Transaction): old wallet-flow purchases never created a Transaction
// record, so an aggregate over the Transaction collection misses them.
// We resolve each account's fee from (in priority order):
//   1. linked challenge_purchase Transaction.amount  (new UPI flow)
//   2. couponSnapshot.finalFee                       (coupon redemptions)
//   3. challenge.tiers[0].challengeFee               (multi-tier challenges)
//   4. challenge.challengeFee                        (legacy single-tier)
app.get('/api/admin/reports/user-reports', async (req, res) => {
  try {
    const { from, to } = req.query;
    const User = require('./models/User');
    const Transaction = require('./models/Transaction');
    const ChallengeAccount = require('./models/ChallengeAccount');

    const dateQuery = {};
    if (from) dateQuery.$gte = new Date(from);
    if (to) dateQuery.$lte = new Date(to);

    // Top-level totals (period-scoped)
    const totalUsers = await User.countDocuments({ role: { $ne: 'admin' } });
    const newUsersQuery = { role: { $ne: 'admin' } };
    if (from || to) newUsersQuery.createdAt = dateQuery;
    const newUsers = await User.countDocuments(newUsersQuery);

    // Pull every completed ChallengeAccount in the period.
    // DEMO accounts are free and self-served: they are not purchases and must
    // never reach the revenue or the account counts.
    const NOT_DEMO = { accountType: { $ne: 'DEMO' } };
    const accountQuery = { paymentStatus: 'COMPLETED', status: { $ne: 'CANCELLED' }, ...NOT_DEMO };
    if (from || to) accountQuery.createdAt = dateQuery;
    const accounts = await ChallengeAccount.find(accountQuery)
      .populate('challengeId', 'name challengeFee tiers')
      .lean();

    // Build per-user buy aggregates by walking through the accounts and
    // resolving each one's fee.
    const buyMap = {};   // userId(string) → { count, amount }
    for (const a of accounts) {
      const uid = String(a.userId);
      if (!buyMap[uid]) buyMap[uid] = { count: 0, amount: 0 };
      let fee = 0;
      if (a.pendingPurchaseTransactionId) {
        try {
          const tx = await Transaction.findById(a.pendingPurchaseTransactionId).select('amount').lean();
          if (tx?.amount > 0) fee = Number(tx.amount);
        } catch (e) { /* ignore */ }
      }
      if (!fee && a.couponSnapshot?.finalFee > 0) fee = Number(a.couponSnapshot.finalFee);
      if (!fee) {
        const ch = a.challengeId;
        if (ch?.tiers?.length) fee = Number(ch.tiers[a.tierIndex || 0]?.challengeFee || 0);
        if (!fee && ch?.challengeFee) fee = Number(ch.challengeFee);
      }
      buyMap[uid].count += 1;
      buyMap[uid].amount += fee;
    }

    // Per-user payouts (still Transaction-based since payouts are always
    // created as Transactions in both old and new flows).
    const payoutMatch = {
      type: 'withdrawal',
      status: { $in: ['approved', 'completed'] },
      'paymentDetails.kind': 'prop_payout'
    };
    if (from || to) payoutMatch.createdAt = dateQuery;
    const payoutByUser = await Transaction.aggregate([
      { $match: payoutMatch },
      { $group: { _id: '$oderId', totalPayoutAmount: { $sum: '$amount' }, payoutCount: { $sum: 1 } } }
    ]);
    const payoutMapByOder = {};
    payoutByUser.forEach(r => { payoutMapByOder[r._id] = r; });

    // Account status counts per user (passed / funded / active / failed / pending)
    const accountAgg = await ChallengeAccount.aggregate([
      { $match: {} },
      {
        $group: {
          _id: { userId: '$userId', status: '$status' },
          count: { $sum: 1 }
        }
      }
    ]);
    const accountMap = {};
    accountAgg.forEach(r => {
      const uid = String(r._id.userId);
      if (!accountMap[uid]) accountMap[uid] = { ACTIVE: 0, PASSED: 0, FAILED: 0, FUNDED: 0, EXPIRED: 0, PENDING: 0, CANCELLED: 0 };
      accountMap[uid][r._id.status] = r.count;
    });

    // Pull users with any prop activity (buys OR payouts OR any
    // accounts at all). Falls back to recent users when nothing exists.
    const userIdsWithAccounts = new Set(Object.keys(buyMap));
    const usersFiltered = userIdsWithAccounts.size > 0
      ? await User.find({ _id: { $in: [...userIdsWithAccounts] }, role: { $ne: 'admin' } })
          .select('name email oderId _id createdAt')
          .lean()
      : await User.find({ role: { $ne: 'admin' } })
          .sort({ createdAt: -1 })
          .limit(50)
          .select('name email oderId _id createdAt')
          .lean();

    const userRows = usersFiltered.map(u => {
      const buy = buyMap[String(u._id)] || { count: 0, amount: 0 };
      const payout = payoutMapByOder[u.oderId] || {};
      const acc = accountMap[String(u._id)] || {};
      return {
        _id: u._id,
        name: u.name,
        email: u.email,
        oderId: u.oderId,
        createdAt: u.createdAt,
        challengeBuyCount: buy.count,
        challengeBuyAmount: buy.amount,
        payoutCount: payout.payoutCount || 0,
        payoutAmount: payout.totalPayoutAmount || 0,
        netSpent: buy.amount - (payout.totalPayoutAmount || 0),
        accountsActive: acc.ACTIVE || 0,
        accountsPassed: acc.PASSED || 0,
        accountsFunded: acc.FUNDED || 0,
        accountsFailed: acc.FAILED || 0,
        accountsPending: acc.PENDING || 0
      };
    });

    // Sort by buy amount desc by default
    userRows.sort((a, b) => b.challengeBuyAmount - a.challengeBuyAmount);

    res.json({
      success: true,
      report: {
        totalUsers,
        newUsers: from || to ? newUsers : totalUsers,
        userRows
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Trade Reports
app.get('/api/admin/reports/trade-reports', async (req, res) => {
  try {
    const { from, to } = req.query;
    const HedgingPosition = require('./models/Position').HedgingPosition;
    const NettingPosition = require('./models/Position').NettingPosition;
    const BinaryTrade = require('./models/Position').BinaryTrade;
    
    const dateQuery = {};
    if (from) dateQuery.$gte = new Date(from);
    if (to) dateQuery.$lte = new Date(to);
    
    // Hedging trades
    const hedgingQuery = {};
    if (from || to) hedgingQuery.openTime = dateQuery;
    const hedgingTrades = await HedgingPosition.find(hedgingQuery);
    
    // Netting trades
    const nettingQuery = {};
    if (from || to) nettingQuery.openTime = dateQuery;
    const nettingTrades = await NettingPosition.find(nettingQuery);
    
    // Binary trades
    const binaryQuery = {};
    if (from || to) binaryQuery.createdAt = dateQuery;
    const binaryTrades = await BinaryTrade.find(binaryQuery);
    
    const allTrades = [...hedgingTrades, ...nettingTrades, ...binaryTrades];
    const closedTrades = allTrades.filter(t => t.status === 'closed' || t.result);
    
    const totalVolume = allTrades.reduce((sum, t) => sum + (t.volume || t.amount || 0), 0);
    const totalPnL = closedTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
    const winningTrades = closedTrades.filter(t => (t.profit || 0) > 0).length;
    const losingTrades = closedTrades.filter(t => (t.profit || 0) < 0).length;
    
    // Top symbols
    const symbolStats = {};
    allTrades.forEach(t => {
      const sym = t.symbol || 'UNKNOWN';
      if (!symbolStats[sym]) symbolStats[sym] = { count: 0, volume: 0, pnl: 0 };
      symbolStats[sym].count++;
      symbolStats[sym].volume += t.volume || t.amount || 0;
      symbolStats[sym].pnl += t.profit || 0;
    });
    
    const topSymbols = Object.entries(symbolStats)
      .map(([symbol, stats]) => ({ symbol, ...stats }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    res.json({
      success: true,
      report: {
        totalTrades: allTrades.length,
        openTrades: allTrades.filter(t => t.status === 'open').length,
        closedTrades: closedTrades.length,
        totalVolume,
        totalPnL,
        winningTrades,
        losingTrades,
        winRate: closedTrades.length > 0 ? ((winningTrades / closedTrades.length) * 100).toFixed(1) : 0,
        topSymbols,
        byMode: {
          hedging: hedgingTrades.length,
          netting: nettingTrades.length,
          binary: binaryTrades.length
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Commission Reports
app.get('/api/admin/reports/commission-reports', async (req, res) => {
  try {
    const { from, to } = req.query;

    const dateQuery = {};
    if (from) dateQuery.$gte = new Date(from);
    if (to) dateQuery.$lte = new Date(to + 'T23:59:59');

    const tradeQuery = {};
    if (from || to) tradeQuery.createdAt = dateQuery;

    // Platform commission + swap from Trade records
    const totals = await Trade.aggregate([
      { $match: tradeQuery },
      { $group: {
        _id: null,
        totalCommission: { $sum: '$commission' },
        totalSwap: { $sum: '$swap' },
        count: { $sum: 1 }
      }}
    ]);

    // By mode breakdown
    const byMode = await Trade.aggregate([
      { $match: tradeQuery },
      { $group: {
        _id: '$mode',
        commission: { $sum: '$commission' },
        swap: { $sum: '$swap' },
        count: { $sum: 1 }
      }}
    ]);

    // Top users by commission paid
    const topUsers = await Trade.aggregate([
      { $match: { ...tradeQuery, $or: [{ commission: { $gt: 0 } }, { swap: { $gt: 0 } }] } },
      { $group: {
        _id: '$userId',
        totalCommission: { $sum: '$commission' },
        totalSwap: { $sum: '$swap' },
        tradeCount: { $sum: 1 }
      }},
      { $sort: { totalCommission: -1 } },
      { $limit: 10 }
    ]);

    // Enrich top users with name/email
    const userIds = topUsers.map(u => u._id);
    const userDocs = await User.find({ oderId: { $in: userIds } }).select('oderId name email').lean();
    const userMap = {};
    userDocs.forEach(u => { userMap[u.oderId] = u; });

    // IB commission payouts (what platform owes IBs)
    const IBCommission = require('./models/IBCommission');
    const ibTotals = await IBCommission.aggregate([
      { $match: from || to ? { createdAt: dateQuery } : {} },
      { $group: {
        _id: '$status',
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }}
    ]);
    const ibByStatus = ibTotals.reduce((acc, s) => ({ ...acc, [s._id]: { total: s.total, count: s.count } }), {});

    const data = totals[0] || { totalCommission: 0, totalSwap: 0, count: 0 };
    const byModeMap = {};
    byMode.forEach(m => { byModeMap[m._id] = { commission: m.commission, swap: m.swap, count: m.count }; });

    res.json({
      success: true,
      report: {
        totalCommission: data.totalCommission,
        totalSwap: data.totalSwap,
        totalRevenue: data.totalCommission + data.totalSwap,
        tradeCount: data.count,
        byMode: byModeMap,
        ibPending: ibByStatus['pending']?.total || 0,
        ibCredited: ibByStatus['credited']?.total || 0,
        ibPaid: ibByStatus['paid']?.total || 0,
        ibTotal: Object.values(ibByStatus).reduce((s, v) => s + (v.total || 0), 0),
        topUsers: topUsers.map(u => {
          const user = userMap[u._id] || {};
          return {
            oderId: u._id,
            name: user.name || u._id,
            email: user.email || '',
            totalCommission: u.totalCommission,
            totalSwap: u.totalSwap,
            tradeCount: u.tradeCount
          };
        })
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// User commission trade details — drill-down for commission reports
app.get('/api/admin/reports/user-commission-trades/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { from, to } = req.query;

    const query = { userId, $or: [{ commission: { $gt: 0 } }, { swap: { $gt: 0 } }] };
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to + 'T23:59:59');
    }

    const trades = await Trade.find(query)
      .sort({ createdAt: -1 })
      .limit(200)
      .select('tradeId oderId symbol side mode type volume quantity amount entryPrice closePrice profit commission commissionInr swap leverage session exchange segment closedBy remark executedAt closedAt createdAt')
      .lean();

    res.json({ success: true, trades });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Broker Reports
app.get('/api/admin/reports/broker-reports', async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateQuery = {};
    if (from) dateQuery.$gte = new Date(from);
    if (to) dateQuery.$lte = new Date(to + 'T23:59:59');

    // All brokers
    const brokers = await Admin.find({ role: 'broker' }).select('_id oderId name email isActive createdAt wallet').lean();

    const brokerIds = brokers.map(b => b._id);

    // Users per broker
    const usersByBroker = await User.aggregate([
      { $match: { parentAdminId: { $in: brokerIds } } },
      { $group: {
        _id: '$parentAdminId',
        userCount: { $sum: 1 },
        totalBalance: { $sum: '$wallet.balance' },
        totalDeposits: { $sum: '$wallet.totalDeposits' },
        totalWithdrawals: { $sum: '$wallet.totalWithdrawals' }
      }}
    ]);

    // Trades per broker (via their users)
    const usersByBrokerMap = {};
    usersByBroker.forEach(u => { usersByBrokerMap[u._id.toString()] = u; });

    // Get user IDs per broker
    const allBrokerUsers = await User.find({ parentAdminId: { $in: brokerIds } }).select('_id parentAdminId').lean();
    const userIdsByBroker = {};
    allBrokerUsers.forEach(u => {
      const bid = u.parentAdminId?.toString();
      if (bid) {
        if (!userIdsByBroker[bid]) userIdsByBroker[bid] = [];
        userIdsByBroker[bid].push(u._id);
      }
    });

    // Trade counts per broker
    const tradeQuery = {};
    if (from || to) tradeQuery.createdAt = dateQuery;
    const allUserIds = allBrokerUsers.map(u => u._id);
    const tradesByUser = await Trade.aggregate([
      { $match: { ...tradeQuery, userId: { $in: allUserIds } } },
      { $group: { _id: '$userId', tradeCount: { $sum: 1 }, totalPnL: { $sum: '$profit' } } }
    ]);
    const tradesByUserId = {};
    tradesByUser.forEach(t => { tradesByUserId[t._id.toString()] = t; });

    const tradesByBroker = {};
    allBrokerUsers.forEach(u => {
      const bid = u.parentAdminId?.toString();
      const td = tradesByUserId[u._id.toString()];
      if (bid && td) {
        if (!tradesByBroker[bid]) tradesByBroker[bid] = { tradeCount: 0, totalPnL: 0 };
        tradesByBroker[bid].tradeCount += td.tradeCount;
        tradesByBroker[bid].totalPnL += td.totalPnL;
      }
    });

    const totalBrokers = brokers.length;
    const activeBrokers = brokers.filter(b => b.isActive).length;

    const brokerList = brokers.map(b => {
      const bid = b._id.toString();
      const uData = usersByBrokerMap[bid] || {};
      const tData = tradesByBroker[bid] || {};
      return {
        _id: b._id,
        oderId: b.oderId,
        name: b.name,
        email: b.email,
        isActive: b.isActive,
        createdAt: b.createdAt,
        walletBalance: b.wallet?.balance || 0,
        userCount: uData.userCount || 0,
        totalBalance: uData.totalBalance || 0,
        totalDeposits: uData.totalDeposits || 0,
        totalWithdrawals: uData.totalWithdrawals || 0,
        tradeCount: tData.tradeCount || 0,
        totalPnL: tData.totalPnL || 0
      };
    }).sort((a, b) => b.userCount - a.userCount);

    res.json({
      success: true,
      report: {
        totalBrokers,
        activeBrokers,
        inactiveBrokers: totalBrokers - activeBrokers,
        totalUsers: usersByBroker.reduce((s, u) => s + u.userCount, 0),
        totalBalance: usersByBroker.reduce((s, u) => s + u.totalBalance, 0),
        totalDeposits: usersByBroker.reduce((s, u) => s + u.totalDeposits, 0),
        totalWithdrawals: usersByBroker.reduce((s, u) => s + u.totalWithdrawals, 0),
        totalTrades: Object.values(tradesByBroker).reduce((s, t) => s + t.tradeCount, 0),
        brokerList
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sub-Admin Reports
app.get('/api/admin/reports/subadmin-reports', async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateQuery = {};
    if (from) dateQuery.$gte = new Date(from);
    if (to) dateQuery.$lte = new Date(to + 'T23:59:59');

    // All sub-admins
    const subAdmins = await Admin.find({ role: 'sub_admin' }).select('_id oderId name email isActive createdAt wallet').lean();
    const subAdminIds = subAdmins.map(s => s._id);

    // Brokers per sub-admin
    const brokersBySubAdmin = await Admin.aggregate([
      { $match: { role: 'broker', parentId: { $in: subAdminIds } } },
      { $group: { _id: '$parentId', brokerCount: { $sum: 1 } } }
    ]);
    const brokersBySubAdminMap = {};
    brokersBySubAdmin.forEach(b => { brokersBySubAdminMap[b._id.toString()] = b.brokerCount; });

    // Get all broker IDs under each sub-admin
    const allBrokers = await Admin.find({ role: 'broker', parentId: { $in: subAdminIds } }).select('_id parentId').lean();
    const brokerIdsBySubAdmin = {};
    allBrokers.forEach(b => {
      const sid = b.parentId?.toString();
      if (sid) {
        if (!brokerIdsBySubAdmin[sid]) brokerIdsBySubAdmin[sid] = [];
        brokerIdsBySubAdmin[sid].push(b._id);
      }
    });

    // Users: direct (parentAdminId = sub-admin) + via brokers
    const allBrokerIds = allBrokers.map(b => b._id);

    const usersBySubAdmin = await User.aggregate([
      { $match: { parentAdminId: { $in: [...subAdminIds, ...allBrokerIds] } } },
      {
        $lookup: {
          from: 'admins',
          localField: 'parentAdminId',
          foreignField: '_id',
          as: 'parentAdmin'
        }
      },
      { $unwind: { path: '$parentAdmin', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          effectiveSubAdminId: {
            $cond: [
              { $eq: ['$parentAdmin.role', 'sub_admin'] },
              '$parentAdminId',
              '$parentAdmin.parentId'
            ]
          }
        }
      },
      {
        $group: {
          _id: '$effectiveSubAdminId',
          userCount: { $sum: 1 },
          totalBalance: { $sum: '$wallet.balance' },
          totalDeposits: { $sum: '$wallet.totalDeposits' }
        }
      }
    ]);
    const usersBySubAdminMap = {};
    usersBySubAdmin.forEach(u => { usersBySubAdminMap[u._id?.toString()] = u; });

    const totalSubAdmins = subAdmins.length;
    const activeSubAdmins = subAdmins.filter(s => s.isActive).length;

    const subAdminList = subAdmins.map(s => {
      const sid = s._id.toString();
      const uData = usersBySubAdminMap[sid] || {};
      return {
        _id: s._id,
        oderId: s.oderId,
        name: s.name,
        email: s.email,
        isActive: s.isActive,
        createdAt: s.createdAt,
        walletBalance: s.wallet?.balance || 0,
        brokerCount: brokersBySubAdminMap[sid] || 0,
        userCount: uData.userCount || 0,
        totalBalance: uData.totalBalance || 0,
        totalDeposits: uData.totalDeposits || 0
      };
    }).sort((a, b) => b.userCount - a.userCount);

    res.json({
      success: true,
      report: {
        totalSubAdmins,
        activeSubAdmins,
        inactiveSubAdmins: totalSubAdmins - activeSubAdmins,
        totalBrokers: allBrokers.length,
        totalUsers: usersBySubAdmin.reduce((s, u) => s + u.userCount, 0),
        totalBalance: usersBySubAdmin.reduce((s, u) => s + u.totalBalance, 0),
        subAdminList
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== ADMIN HIERARCHY MANAGEMENT ==============

// Admin Login
app.post('/api/admin/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    
    if (!admin.isActive) {
      return res.status(401).json({ success: false, error: 'Account is disabled' });
    }
    
    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      // Log failed login
      const userAgent = req.get('User-Agent') || '';
      await AdminActivityLog.logActivity({
        adminId: admin._id.toString(),
        oderId: admin.oderId,
        role: admin.role,
        activityType: 'failed_login',
        description: `Failed login attempt for ${admin.name}`,
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: userAgent,
        device: userAgent.includes('Mobile') ? 'mobile' : 'desktop',
        os: parseOS(userAgent),
        browser: parseBrowser(userAgent),
        status: 'failed'
      });
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    
    admin.lastLogin = new Date();
    await admin.save();
    
    // Generate session ID for tracking session duration
    const sessionId = `${admin._id}-${Date.now()}`;
    
    // Log successful login
    const userAgent = req.get('User-Agent') || '';
    await AdminActivityLog.logActivity({
      adminId: admin._id.toString(),
      oderId: admin.oderId,
      role: admin.role,
      activityType: 'login',
      description: `${admin.role === 'sub_admin' ? 'Sub-Admin' : 'Broker'} logged in successfully`,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: userAgent,
      device: userAgent.includes('Mobile') ? 'mobile' : 'desktop',
      os: parseOS(userAgent),
      browser: parseBrowser(userAgent),
      status: 'success',
      sessionId: sessionId
    });
    
    res.json({
      success: true,
      admin: {
        _id: admin._id,
        oderId: admin.oderId,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        permissions: Admin.normalizePermissions(admin.permissions),
        wallet: admin.wallet,
        parentId: admin.parentId,
        parentOderId: admin.parentOderId,
        sessionId: sessionId
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin Logout (SubAdmin/Broker)
// Refresh the signed-in admin's record so the client can pick up permission
// changes made by super-admin without requiring a full re-login.
app.get('/api/admin/auth/me', async (req, res) => {
  try {
    const { resolveAdminFromRequest } = require('./middleware/adminPermission');
    const admin = await resolveAdminFromRequest(req);
    if (!admin) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    res.json({
      success: true,
      admin: {
        _id: admin._id,
        oderId: admin.oderId,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        permissions: Admin.normalizePermissions(admin.permissions),
        wallet: admin.wallet,
        parentId: admin.parentId,
        parentOderId: admin.parentOderId,
        isActive: admin.isActive,
      },
    });
  } catch (err) {
    console.error('[GET /auth/me] error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// One-shot migration — normalize every admin's permissions to the flat-dotted
// shape. Safe to run multiple times (no-op on already-flat docs). Requires
// super-admin auth.
app.post('/api/admin/auth/migrate-permissions', async (req, res) => {
  try {
    const { resolveAdminFromRequest } = require('./middleware/adminPermission');
    const caller = await resolveAdminFromRequest(req);
    if (!caller || caller.role !== 'super_admin') {
      return res.status(403).json({ success: false, error: 'super_admin only' });
    }
    const admins = await Admin.find({}).select('_id role permissions');
    let migrated = 0;
    for (const a of admins) {
      const normalized = Admin.normalizePermissions(a.permissions);
      const sanitized = Admin.sanitizePermissionsForRole(a.role, normalized);
      a.permissions = sanitized;
      a.markModified('permissions');
      await a.save();
      migrated += 1;
    }
    res.json({ success: true, migrated });
  } catch (err) {
    console.error('[migrate-permissions] error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/auth/logout', async (req, res) => {
  try {
    const { adminId, sessionId } = req.body;
    
    if (!adminId) {
      return res.status(400).json({ success: false, error: 'Admin ID required' });
    }
    
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    // Calculate session duration if sessionId provided
    let sessionDuration = null;
    if (sessionId) {
      const loginLog = await AdminActivityLog.findOne({ 
        adminId: admin._id.toString(), 
        activityType: 'login',
        sessionId: sessionId 
      });
      if (loginLog) {
        sessionDuration = Math.floor((Date.now() - new Date(loginLog.timestamp).getTime()) / 1000);
        // Update the login log with session duration
        await AdminActivityLog.updateOne({ _id: loginLog._id }, { sessionDuration });
      }
    }
    
    // Log logout activity
    const userAgent = req.get('User-Agent') || '';
    await AdminActivityLog.logActivity({
      adminId: admin._id.toString(),
      oderId: admin.oderId,
      role: admin.role,
      activityType: 'logout',
      description: `${admin.role === 'sub_admin' ? 'Sub-Admin' : 'Broker'} logged out${sessionDuration ? ` (Session: ${Math.floor(sessionDuration / 60)}m ${sessionDuration % 60}s)` : ''}`,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: userAgent,
      device: userAgent.includes('Mobile') ? 'mobile' : 'desktop',
      os: parseOS(userAgent),
      browser: parseBrowser(userAgent),
      status: 'success',
      sessionId: sessionId,
      sessionDuration: sessionDuration
    });
    
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all admins (for super admin - full hierarchy)
app.get('/api/admin/hierarchy', async (req, res) => {
  try {
    const { adminId } = req.query;
    
    let query = {};
    
    // If adminId provided, get that admin's children
    if (adminId) {
      const requestingAdmin = await Admin.findById(adminId);
      if (!requestingAdmin) {
        return res.status(404).json({ success: false, error: 'Admin not found' });
      }
      
      if (requestingAdmin.role === 'super_admin') {
        // Super admin sees all
        query = {};
      } else if (requestingAdmin.role === 'sub_admin') {
        // Sub admin sees their brokers
        query = { parentId: adminId };
      } else {
        // Broker sees nothing
        query = { _id: null };
      }
    }
    
    const admins = await Admin.find(query).select('-password').sort({ role: 1, createdAt: -1 });
    
    // Get user counts for each admin/broker
    const adminData = await Promise.all(admins.map(async (admin) => {
      const userCount = await User.countDocuments({ parentAdminId: admin._id });
      const childCount = await Admin.countDocuments({ parentId: admin._id });
      return {
        ...admin.toObject(),
        userCount,
        childCount
      };
    }));
    
    res.json({ success: true, admins: adminData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get hierarchy tree (for visualization)
app.get('/api/admin/hierarchy/tree', async (req, res) => {
  try {
    // Get all admins
    const allAdmins = await Admin.find().select('-password').lean();
    
    // Get all users with their parent admin
    const allUsers = await User.find({ parentAdminId: { $ne: null } })
      .select('oderId name email wallet.balance isActive parentAdminId parentAdminOderId')
      .lean();
    
    // Build tree structure
    const buildTree = (parentId = null) => {
      const children = allAdmins.filter(a => 
        parentId === null ? a.parentId === null : a.parentId?.toString() === parentId?.toString()
      );
      
      return children.map(admin => {
        const users = allUsers.filter(u => u.parentAdminId?.toString() === admin._id.toString());
        return {
          ...admin,
          children: buildTree(admin._id),
          users: users
        };
      });
    };
    
    const tree = buildTree();
    
    // Also get users without parent (direct super admin users)
    const directUsers = await User.find({ parentAdminId: null })
      .select('oderId name email wallet.balance isActive')
      .lean();
    
    res.json({ 
      success: true, 
      tree,
      directUsers,
      stats: {
        totalAdmins: allAdmins.length,
        superAdmins: allAdmins.filter(a => a.role === 'super_admin').length,
        subAdmins: allAdmins.filter(a => a.role === 'sub_admin').length,
        brokers: allAdmins.filter(a => a.role === 'broker').length,
        totalUsers: allUsers.length + directUsers.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all subadmins and brokers for user assignment
app.get('/api/admin/hierarchy/subadmins', async (req, res) => {
  try {
    const subadmins = await Admin.find({ 
      role: { $in: ['sub_admin', 'broker'] },
      isActive: true 
    }).select('_id name email role phone').lean();
    
    res.json({ success: true, subadmins });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Create new user
app.post('/api/admin/users/create', async (req, res) => {
  try {
    const { name, email, phone, password, initialBalance } = req.body;

    // The server stamps ownership from the caller. A payload carrying someone
    // else's parentAdminId is ignored - that is how a tenant would otherwise
    // plant a user in another tenant's pool.
    const owner = ['sub_admin', 'broker'].includes(req.admin?.role) ? req.admin : null;
    
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email, and password are required' });
    }
    
    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }
    
    // Generate unique order ID
    const generateOrderId = () => {
      return Math.floor(100000 + Math.random() * 900000).toString();
    };
    
    let oderId = generateOrderId();
    while (await User.findOne({ oderId })) {
      oderId = generateOrderId();
    }
    
    // Hash password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const newUser = new User({
      name,
      email: email.toLowerCase(),
      phone: phone || '',
      password: hashedPassword,
      oderId,
      isActive: true,
      parentAdminId: owner ? owner._id : null,
      parentAdminOderId: owner ? owner.oderId : null,
      parentAdminAssignedAt: owner ? new Date() : null,
      wallet: {
        balance: parseFloat(initialBalance) || 0,
        credit: 0
      },
      allowedTradeModes: { hedging: true, netting: true, binary: true },
      allowedCurrencyDisplay: 'BOTH',
      createdAt: new Date()
    });
    
    await newUser.save();
    
    res.json({ 
      success: true, 
      message: 'User created successfully',
      user: {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        oderId: newUser.oderId
      }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new admin (sub_admin or broker)
app.post('/api/admin/hierarchy/create', async (req, res) => {
  try {
    const { name, email, phone, password, role, parentId, createdBy, permissions } = req.body;
    
    if (!name || !email || !password || !role) {
      return res.status(400).json({ success: false, error: 'Name, email, password, and role are required' });
    }
    
    if (!['sub_admin', 'broker', 'bank_user'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role. Must be sub_admin, broker, or bank_user' });
    }

    let cappedPermissions = null;
    // Role-aware permission check. This route is marked `public` in the
    // chokepoint (adminRouteMap.js) precisely so we can pick the right key
    // here based on the target role being created. Super-admin always passes.
    {
      const { resolveAdminFromRequest } = require('./middleware/adminPermission');
      const caller = await resolveAdminFromRequest(req);
      if (!caller) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }
      const requiredPerm = role === 'sub_admin'  ? 'admin.createSubAdmin'
                         : role === 'bank_user'  ? 'admin.createBankUser'
                         : /* broker */            'admin.createBroker';
      if (!caller.hasPermission(requiredPerm)) {
        return res.status(403).json({
          success: false,
          error: `Forbidden: permission '${requiredPerm}' required to create a ${role}`,
        });
      }
      // Cap rule: nobody grants more than they hold. Clip here as well as on
      // update, so a crafted create payload cannot mint a stronger admin.
      if (permissions && typeof permissions === 'object') {
        cappedPermissions = capPermissions(caller, permissions).permissions;
      }
      // Sub-admin creating a broker must set themselves as parent — prevent
      // them from re-parenting brokers under someone else.
      if (caller.role === 'sub_admin' && role === 'broker') {
        const requestedParent = parentId ? String(parentId) : null;
        if (requestedParent && requestedParent !== String(caller._id)) {
          return res.status(403).json({
            success: false,
            error: 'Sub-admins can only create brokers under themselves',
          });
        }
      }
    }

    // Check if email already exists
    const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
    if (existingAdmin) {
      return res.status(400).json({ success: false, error: 'Email already exists' });
    }
    
    // Generate admin ID
    const oderId = await Admin.generateAdminId(role);
    
    // Get parent info if provided
    let parentOderId = null;
    if (parentId) {
      const parent = await Admin.findById(parentId);
      if (parent) {
        parentOderId = parent.oderId;
      }
    }
    
    const admin = new Admin({
      oderId,
      name,
      email: email.toLowerCase(),
      phone,
      password,
      role,
      parentId: parentId || null,
      parentOderId,
      createdBy,
      // permissions (if provided) get merged with role preset and sanitized in the pre-save hook
      permissions: cappedPermissions || undefined,
    });
    
    await admin.save();
    
    res.json({
      success: true,
      admin: {
        _id: admin._id,
        oderId: admin.oderId,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        parentId: admin.parentId,
        parentOderId: admin.parentOderId,
        wallet: admin.wallet,
        permissions: admin.permissions,
        isActive: admin.isActive
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update admin
app.put('/api/admin/hierarchy/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, isActive, permissions, wallet, password } = req.body;
    let clipped = [];

    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }

    // Bug 5 fix: scope check — a sub-admin must not be able to edit an admin
    // that isn't in their subtree, even if they happen to hold the permission
    // key. Super-admin's canManage() always returns true.
    if (req.admin && typeof req.admin.canManage === 'function' && !req.admin.canManage(admin)) {
      return res.status(403).json({ success: false, error: 'Not authorized to manage this admin' });
    }

    if (name) admin.name = name;
    if (email) admin.email = email.toLowerCase();
    if (phone) admin.phone = phone;
    if (typeof isActive === 'boolean') admin.isActive = isActive;
    if (permissions && typeof permissions === 'object') {
      // Bug 11 fix: client's PermissionPicker always submits the full flat map,
      // so a direct replace is the correct semantics — a partial payload with
      // keys omitted would otherwise leak old `true` values through the
      // shallow merge. Pre-save hook normalizes + sanitizes by role.
      // Cap rule, re-checked on the server: the UI greys the rest out, but the
      // UI is assumed bypassed.
      const capped = capPermissions(req.admin, permissions);
      clipped = capped.clipped;
      admin.permissions = capped.permissions;
      admin.markModified('permissions');
    }
    if (wallet) admin.wallet = { ...admin.wallet, ...wallet };
    
    // Update password if provided (min 6 characters)
    if (password && password.length >= 6) {
      admin.password = password; // Will be hashed by pre-save hook
    }
    
    await admin.save();

    res.json({ success: true, admin, clipped });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete admin
app.delete('/api/admin/hierarchy/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    if (admin.role === 'super_admin') {
      return res.status(400).json({ success: false, error: 'Cannot delete super admin' });
    }

    // Bug 5 fix: scope check — sub-admins can only delete admins inside their
    // subtree (their own brokers). Super-admin always passes.
    if (req.admin && typeof req.admin.canManage === 'function' && !req.admin.canManage(admin)) {
      return res.status(403).json({ success: false, error: 'Not authorized to delete this admin' });
    }
    
    // Check if admin has children
    const childCount = await Admin.countDocuments({ parentId: id });
    if (childCount > 0) {
      return res.status(400).json({ success: false, error: 'Cannot delete admin with sub-admins/brokers. Reassign them first.' });
    }
    
    // Check if admin has users
    const userCount = await User.countDocuments({ parentAdminId: id });
    if (userCount > 0) {
      return res.status(400).json({ success: false, error: 'Cannot delete admin with users. Reassign users first.' });
    }
    
    await Admin.findByIdAndDelete(id);
    
    res.json({ success: true, message: 'Admin deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get users under an admin/broker
app.get('/api/admin/hierarchy/:id/users', async (req, res) => {
  try {
    const { id } = req.params;
    
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    let userQuery = {};
    
    if (admin.role === 'super_admin') {
      // Super admin sees all users
      userQuery = {};
    } else if (admin.role === 'sub_admin') {
      // Sub admin sees users under them and their brokers
      const brokerIds = await Admin.find({ parentId: id }).select('_id');
      const brokerIdList = brokerIds.map(b => b._id);
      userQuery = { 
        $or: [
          { parentAdminId: id },
          { parentAdminId: { $in: brokerIdList } }
        ]
      };
    } else {
      // Broker sees only their users
      userQuery = { parentAdminId: id };
    }
    
    const users = await User.find(userQuery)
      .select('oderId name email phone wallet isActive kycStatus parentAdminId parentAdminOderId createdAt')
      .sort({ createdAt: -1 });
    
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Assign user to admin/broker
app.post('/api/admin/hierarchy/assign-user', async (req, res) => {
  try {
    const { userId, adminId } = req.body;

    // Moving a user between pools is a super-admin action: anyone else would
    // be reaching across a tenant boundary in one direction or the other.
    if (req.admin?.role !== 'super_admin') {
      return res.status(403).json({ success: false, error: 'Only the super-admin can move users between pools' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const before = user.parentAdminId ? String(user.parentAdminId) : null;

    if (adminId) {
      const admin = await Admin.findById(adminId);
      if (!admin) {
        return res.status(404).json({ success: false, error: 'Admin not found' });
      }
      user.parentAdminId = admin._id;
      user.parentAdminOderId = admin.oderId;
    } else {
      user.parentAdminId = null;
      user.parentAdminOderId = null;
    }

    // Stamp the cutoff only when the owner actually changed, so re-saving the
    // same assignment cannot quietly erase the new owner's back-history.
    const after = user.parentAdminId ? String(user.parentAdminId) : null;
    if (before !== after) {
      user.parentAdminAssignedAt = after ? new Date() : null;
    }

    await user.save();

    if (before !== after) {
      await logScopedChange({
        req, admin: req.admin, activityType: 'user_assigned',
        description: `User ${user.oderId} moved to ${user.parentAdminOderId || 'platform pool'}`,
        metadata: { userId: String(user._id), from: before, to: after, assignedAt: user.parentAdminAssignedAt },
      });
    }

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin wallet fund request (to parent)
app.post('/api/admin/hierarchy/fund-request', async (req, res) => {
  try {
    const { adminId, amount, type, note } = req.body;
    
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    if (admin.role === 'super_admin') {
      return res.status(400).json({ success: false, error: 'Super admin cannot request funds' });
    }
    
    // Create fund request transaction
    const transaction = new Transaction({
      oderId: admin.oderId,
      userName: admin.name,
      type: type || 'deposit',
      amount,
      paymentMethod: 'wallet',
      status: 'pending',
      userNote: note || '',
      withdrawalInfo: {
        method: 'internal',
        requestedBy: admin.role,
        parentId: admin.parentId,
        parentOderId: admin.parentOderId
      }
    });
    
    await transaction.save();
    
    res.json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Approve fund request (deduct from parent wallet)
app.post('/api/admin/hierarchy/approve-fund', async (req, res) => {
  try {
    const { transactionId, approverId } = req.body;
    
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }
    
    if (transaction.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Transaction already processed' });
    }
    
    // Find the requester (admin/broker or user)
    let requester = null;
    let isAdminRequest = false;
    
    // Check if this is an admin fund request (has adminRequesterId)
    if (transaction.adminRequesterId) {
      requester = await Admin.findById(transaction.adminRequesterId);
      isAdminRequest = true;
    } else {
      // Legacy: find by oderId
      requester = await Admin.findOne({ oderId: transaction.oderId });
      isAdminRequest = !!requester;
      
      if (!requester) {
        requester = await User.findOne({ oderId: transaction.oderId });
      }
    }
    
    if (!requester) {
      return res.status(404).json({ success: false, error: 'Requester not found' });
    }
    
    // Find the parent to deduct from
    let parent = null;
    if (transaction.adminParentId) {
      // For admin fund requests, use the stored parent ID
      parent = await Admin.findById(transaction.adminParentId);
      // If not found in Admin, check User model (legacy super admin)
      if (!parent && transaction.parentType === 'user') {
        parent = await User.findById(transaction.adminParentId);
      }
    } else if (isAdminRequest) {
      parent = await Admin.findById(requester.parentId);
    } else {
      parent = await Admin.findById(requester.parentAdminId);
    }
    
    // If no parent, check if approver is super admin
    let approver = await Admin.findById(approverId);
    let approverIsSuperAdmin = approver?.role === 'super_admin';
    
    // If approver not found in Admin, check User model (legacy super admin)
    if (!approver) {
      const approverUser = await User.findById(approverId);
      if (approverUser && approverUser.role === 'admin') {
        approver = approverUser;
        approverIsSuperAdmin = true;
      } else {
        return res.status(404).json({ success: false, error: 'Approver not found' });
      }
    }
    
    // Determine who pays - for legacy super admin (User model), they don't have wallet deduction
    let payer = parent || approver;
    let payerIsSuperAdmin = approverIsSuperAdmin || payer?.role === 'super_admin' || payer?.role === 'admin';
    
    if (!payerIsSuperAdmin && payer.wallet.balance < transaction.amount) {
      return res.status(400).json({ success: false, error: 'Insufficient balance in parent wallet' });
    }
    
    // Deduct from payer (unless super admin with unlimited)
    if (!payerIsSuperAdmin && payer.wallet) {
      payer.wallet.balance -= transaction.amount;
      payer.wallet.totalWithdrawals = (payer.wallet.totalWithdrawals || 0) + transaction.amount;
      await payer.save();
    }
    
    // Add to requester
    if (isAdminRequest) {
      requester.wallet.balance += transaction.amount;
      requester.wallet.totalDeposits += transaction.amount;
      await requester.save();
    } else {
      requester.wallet.balance += transaction.amount;
      requester.wallet.equity = requester.wallet.balance + requester.wallet.credit;
      requester.wallet.freeMargin = requester.wallet.equity - requester.wallet.margin;
      await requester.save();
    }
    
    // Update transaction
    transaction.status = 'approved';
    transaction.processedBy = approverId;
    transaction.processedAt = new Date();
    await transaction.save();
    
    res.json({ 
      success: true, 
      transaction,
      message: `Approved $${transaction.amount} for ${transaction.oderId}. Deducted from ${payer.oderId}`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get fund requests for an admin (requests from sub-admins and brokers ONLY - not users)
app.get('/api/admin/hierarchy/:id/fund-requests', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.query;
    
    // Check if id is a valid ObjectId or an oderId
    const isObjectId = mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
    
    // First check if this is a super_admin in Admin model
    let admin = null;
    let isSuperAdmin = false;
    let adminUser = null;
    
    if (isObjectId) {
      admin = await Admin.findById(id);
      isSuperAdmin = admin?.role === 'super_admin';
      
      // If not found in Admin model, check User model for legacy super admin
      if (!admin) {
        adminUser = await User.findById(id);
        if (adminUser && adminUser.role === 'admin') {
          isSuperAdmin = true;
        }
      }
    } else {
      // Try to find by oderId
      admin = await Admin.findOne({ oderId: id });
      isSuperAdmin = admin?.role === 'super_admin';
      
      if (!admin) {
        adminUser = await User.findOne({ oderId: id, role: 'admin' });
        if (adminUser) {
          isSuperAdmin = true;
        }
      }
    }
    
    if (!admin && !adminUser) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    // Get the actual MongoDB _id for queries
    const adminMongoId = admin?._id || adminUser?._id;
    
    // This endpoint is for SUB-ADMIN and BROKER fund requests ONLY
    // User deposit/withdrawal requests are handled by /api/admin/transactions
    let adminFundRequestQuery = { type: 'admin_fund_request' };
    
    if (isSuperAdmin) {
      // SuperAdmin sees ALL admin fund requests (from sub-admins and brokers)
      // No additional filter needed
    } else if (admin?.role === 'sub_admin') {
      // Sub-admin sees fund requests from their brokers only
      adminFundRequestQuery.adminParentId = adminMongoId;
    } else {
      // Broker - brokers don't have children who can make fund requests
      // Return empty
      return res.json({ success: true, transactions: [] });
    }
    
    if (status) adminFundRequestQuery.status = status;
    
    // Fetch only admin fund requests (sub-admin and broker requests)
    let transactions = await Transaction.find(adminFundRequestQuery).sort({ createdAt: -1 });
    
    // Populate requester info for admin fund requests
    for (let req of transactions) {
      if (req.adminRequesterId) {
        const requester = await Admin.findById(req.adminRequesterId).select('name oderId role');
        if (requester) {
          req._doc.requesterName = requester.name;
          req._doc.requesterOderId = requester.oderId;
          req._doc.requesterRole = requester.role;
        }
      }
    }
    
    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create super admin (one-time setup)
app.post('/api/admin/setup-super-admin', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    // Check if super admin already exists
    const existingSuperAdmin = await Admin.findOne({ role: 'super_admin' });
    if (existingSuperAdmin) {
      return res.status(400).json({ success: false, error: 'Super admin already exists' });
    }
    
    const oderId = await Admin.generateAdminId('super_admin');
    
    const superAdmin = new Admin({
      oderId,
      email: email.toLowerCase(),
      password,
      name,
      role: 'super_admin'
    });
    
    await superAdmin.save();
    
    res.json({
      success: true,
      admin: {
        _id: superAdmin._id,
        oderId: superAdmin.oderId,
        email: superAdmin.email,
        name: superAdmin.name,
        role: superAdmin.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Adjust admin/broker wallet (add or deduct funds)
app.post('/api/admin/hierarchy/:id/wallet', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, amount } = req.body;
    
    if (!type || !amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid type or amount' });
    }
    
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    const currentBalance = admin.wallet?.balance || 0;
    let newBalance;
    
    if (type === 'add') {
      newBalance = currentBalance + parseFloat(amount);
    } else if (type === 'subtract') {
      if (currentBalance < amount) {
        return res.status(400).json({ success: false, error: 'Insufficient balance' });
      }
      newBalance = currentBalance - parseFloat(amount);
    } else {
      return res.status(400).json({ success: false, error: 'Invalid type. Use "add" or "subtract"' });
    }
    
    admin.wallet = admin.wallet || {};
    admin.wallet.balance = newBalance;
    await admin.save();
    
    res.json({ 
      success: true, 
      message: `Successfully ${type === 'add' ? 'added' : 'deducted'} ₹${amount} ${type === 'add' ? 'to' : 'from'} wallet`,
      newBalance 
    });
  } catch (error) {
    console.error('Error adjusting admin wallet:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get brokers under a sub-admin
app.get('/api/admin/hierarchy/:id/brokers', async (req, res) => {
  try {
    const { id } = req.params;
    
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    let brokers = [];
    
    if (admin.role === 'super_admin') {
      // Super admin sees all brokers
      brokers = await Admin.find({ role: 'broker' }).sort({ createdAt: -1 });
    } else if (admin.role === 'sub_admin') {
      // Sub admin sees only their brokers
      brokers = await Admin.find({ role: 'broker', parentId: id }).sort({ createdAt: -1 });
    }
    
    res.json({ success: true, brokers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get trades under an admin/broker's users
app.get('/api/admin/hierarchy/:id/trades', async (req, res) => {
  try {
    const { id } = req.params;
    const { HedgingPosition, NettingPosition, BinaryTrade } = require('./models/Position');
    
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    // Get user IDs under this admin
    let userQuery = {};
    if (admin.role === 'super_admin') {
      userQuery = {};
    } else if (admin.role === 'sub_admin') {
      const brokerIds = await Admin.find({ parentId: id }).select('_id');
      const brokerIdList = brokerIds.map(b => b._id);
      userQuery = { 
        $or: [
          { parentAdminId: id },
          { parentAdminId: { $in: brokerIdList } }
        ]
      };
    } else {
      userQuery = { parentAdminId: id };
    }
    
    const users = await User.find(userQuery).select('oderId parentAdminAssignedAt').lean();
    const userOderIds = users.map(u => u.oderId);
    
    if (userOderIds.length === 0) {
      return res.json({ success: true, trades: [] });
    }
    
    let allTrades = [];
    
    // Fetch hedging positions
    // Ownership cutoff, same helper the transaction readers use.
    const tradeScope = ownedEventsFilter(users, { key: 'userId', dateField: 'openTime' });
    const hedging = await HedgingPosition.find(tradeScope)
      .sort({ openTime: -1 })
      .limit(100);
    allTrades.push(...hedging.map(p => ({ 
      ...p.toObject(), 
      oderId: p.userId,
      mode: 'hedging',
      profit: p.profit || 0
    })));
    
    // Fetch netting positions
    const netting = await NettingPosition.find(tradeScope)
      .sort({ openTime: -1 })
      .limit(100);
    allTrades.push(...netting.map(p => ({ 
      ...p.toObject(), 
      oderId: p.userId,
      mode: 'netting',
      openPrice: p.avgPrice,
      profit: p.profit || 0
    })));
    
    // Fetch binary trades
    const binary = await BinaryTrade.find(ownedEventsFilter(users, { key: 'userId' }))
      .sort({ createdAt: -1 })
      .limit(100);
    allTrades.push(...binary.map(p => ({ 
      ...p.toObject(), 
      oderId: p.userId,
      mode: 'binary',
      side: p.direction,
      volume: p.amount,
      openPrice: p.entryPrice,
      profit: p.profit || 0
    })));
    
    // Sort all trades by openTime descending
    allTrades.sort((a, b) => new Date(b.openTime || b.createdAt) - new Date(a.openTime || a.createdAt));
    
    res.json({ success: true, trades: allTrades.slice(0, 200) });
  } catch (error) {
    console.error('Error fetching hierarchy trades:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all transactions (deposits + withdrawals) under an admin/broker's users
app.get('/api/admin/hierarchy/:id/all-transactions', async (req, res) => {
  try {
    const { id } = req.params;
    
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    // Get user IDs under this admin
    let userQuery = {};
    if (admin.role === 'super_admin') {
      userQuery = {};
    } else if (admin.role === 'sub_admin') {
      const brokerIds = await Admin.find({ parentId: id }).select('_id');
      const brokerIdList = brokerIds.map(b => b._id);
      userQuery = { 
        $or: [
          { parentAdminId: id },
          { parentAdminId: { $in: brokerIdList } }
        ]
      };
    } else {
      userQuery = { parentAdminId: id };
    }
    
    const users = await User.find(userQuery).select('oderId parentAdminAssignedAt').lean();
    const userOderIds = users.map(u => u.oderId);
    
    // An owner earns only from the moment a user joined them, so the same
    // cutoff that drives payouts drives this list.
    const transactions = await Transaction.find(ownedEventsFilter(users)).sort({ createdAt: -1 }).limit(200);
    
    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get deposits under an admin/broker's users
app.get('/api/admin/hierarchy/:id/deposits', async (req, res) => {
  try {
    const { id } = req.params;
    
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    // Get user IDs under this admin
    let userQuery = {};
    if (admin.role === 'super_admin') {
      userQuery = {};
    } else if (admin.role === 'sub_admin') {
      const brokerIds = await Admin.find({ parentId: id }).select('_id');
      const brokerIdList = brokerIds.map(b => b._id);
      userQuery = { 
        $or: [
          { parentAdminId: id },
          { parentAdminId: { $in: brokerIdList } }
        ]
      };
    } else {
      userQuery = { parentAdminId: id };
    }
    
    const users = await User.find(userQuery).select('oderId parentAdminAssignedAt').lean();
    const userOderIds = users.map(u => u.oderId);
    
    const transactions = await Transaction.find({
      ...ownedEventsFilter(users),
      type: 'deposit'
    }).sort({ createdAt: -1 }).limit(100);
    
    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Assign user to admin/broker
app.put('/api/admin/users/:userId/assign-admin', async (req, res) => {
  try {
    const { userId } = req.params;
    const { parentAdminId } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    let parentAdminOderId = null;
    if (parentAdminId) {
      const parentAdmin = await Admin.findById(parentAdminId);
      if (parentAdmin) {
        parentAdminOderId = parentAdmin.oderId;
      }
    }

    user.parentAdminId = parentAdminId || null;
    user.parentAdminOderId = parentAdminOderId;
    await user.save();

    res.json({ 
      success: true, 
      message: 'User admin assignment updated',
      user: { parentAdminId: user.parentAdminId, parentAdminOderId: user.parentAdminOderId }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single admin details
app.get('/api/admin/hierarchy/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const admin = await Admin.findById(id).select('-password');
    
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    res.json({ success: true, admin });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get my fund requests (for sub-admin/broker)
app.get('/api/admin/hierarchy/:id/my-fund-requests', async (req, res) => {
  try {
    const { id } = req.params;
    
    const transactions = await Transaction.find({
      adminRequesterId: id,
      type: 'admin_fund_request'
    }).sort({ createdAt: -1 });
    
    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Request funds from parent admin
app.post('/api/admin/hierarchy/request-fund', async (req, res) => {
  try {
    const { requesterId, amount } = req.body;
    
    const requester = await Admin.findById(requesterId);
    if (!requester) {
      return res.status(404).json({ success: false, error: 'Requester not found' });
    }
    
    // Determine the parent to request from
    let parentAdminId = requester.parentId;
    let parentType = 'admin'; // Track if parent is in Admin or User model
    
    // If no parentId, SubAdmins request from SuperAdmin
    if (!parentAdminId && requester.role === 'sub_admin') {
      // First try to find super_admin in Admin model
      const superAdmin = await Admin.findOne({ role: 'super_admin' });
      if (superAdmin) {
        parentAdminId = superAdmin._id;
      } else {
        // Fall back to finding admin user in User model (legacy super admin)
        const adminUser = await User.findOne({ role: 'admin' });
        if (adminUser) {
          parentAdminId = adminUser._id;
          parentType = 'user';
        }
      }
    }
    
    // If still no parent found, return error
    if (!parentAdminId) {
      return res.status(400).json({ success: false, error: 'No parent admin to request from' });
    }
    
    const transaction = new Transaction({
      oderId: requester.oderId,
      type: 'admin_fund_request',
      amount,
      status: 'pending',
      adminRequesterId: requester._id,
      adminParentId: parentAdminId,
      parentType: parentType // Track which model the parent is in
    });
    
    await transaction.save();
    
    res.json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== SOCKET.IO ==============

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Join user room for targeted updates
  socket.on('join', (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined room`);
  });

  // Subscribe to price updates
  socket.on('subscribePrices', (symbols) => {
    socket.join('prices');
  });

  // Subscribe to Zerodha live ticks
  socket.on('subscribeZerodhaTicks', async () => {
    socket.join('zerodha-ticks');
    console.log(`Client ${socket.id} subscribed to Zerodha ticks`);
    
    // Immediately fetch and send LTP for all subscribed instruments
    // This ensures prices are shown even when market is closed
    try {
      const ticks = await zerodhaService.fetchAndBroadcastLTP();
      if (ticks && ticks.length > 0) {
        socket.emit('zerodha-tick', ticks.map(({ depth, ...rest }) => rest));
      }
    } catch (error) {
      // Silently ignore - WebSocket will provide live data when market opens
    }
  });

  socket.on('unsubscribeZerodhaTicks', () => {
    socket.leave('zerodha-ticks');
  });

  // Delta Exchange (crypto) prices are opt-in. Nothing on this NSE/BSE-only
  // platform subscribes today; a page that shows crypto prices must emit this.
  socket.on('subscribeDeltaPrices', () => socket.join('delta-prices'));
  socket.on('unsubscribeDeltaPrices', () => socket.leave('delta-prices'));

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Cache for spread settings to avoid DB query on every tick
let spreadSettingsCache = {};
let spreadCacheTime = 0;
const SPREAD_CACHE_DURATION = 60000; // Refresh cache every 60 seconds

// Function to get spread settings with caching
async function getSpreadSettingsForSymbol(symbol) {
  const now = Date.now();
  // Refresh cache if expired
  if (now - spreadCacheTime > SPREAD_CACHE_DURATION) {
    try {
      const allSpreads = await SpreadSetting.find({ isActive: true });
      spreadSettingsCache = {};
      allSpreads.forEach(s => {
        spreadSettingsCache[s.symbol.toUpperCase()] = s;
      });
      spreadCacheTime = now;
    } catch (error) {
      console.error('Error fetching spread settings:', error);
    }
  }
  return spreadSettingsCache[symbol?.toUpperCase()] || null;
}

function getPipSizeForSymbol(symbol) {
  return 0.05; // Indian stocks tick in ₹0.05 paise
}

// ============== ADMIN SETTINGS ==============

// Admin settings — PERSISTED in AppSettings (singleton) so they survive
// restarts. Defaults are applied for any field still unset, so the website
// never shows blank contact info.
const SETTINGS_DEFAULTS = {
  siteName: 'DhanFunded',
  siteUrl: 'https://dhanfunded.com',
  supportEmail: 'support@dhanfunded.com',
  supportPhone: '+91 8367045119',
  supportWhatsapp: '+91 8367045119',
  phoneHours: 'Mon–Sat, 9AM–6PM IST',
  whatsappHours: 'Mon–Sat, 9AM–9PM IST',
  emailResponseNote: 'Response within 2 hours',
  legalEntityName: '',
  registeredAddress: '',
  operationalAddress: '',
  contactPhone: '',
  contactEmail: '',
  socialInstagram: 'https://www.instagram.com/dhanfunded',
  socialFacebook: '',
  socialYoutube: 'https://youtube.com/@dhanfunded',
  socialTelegram: 'https://t.me/dhanfunded',
  maintenanceMode: false,
  registrationEnabled: true,
  demoAccountEnabled: true,
  minDeposit: 100,
  maxWithdrawal: 100000,
};
const SETTINGS_FIELDS = Object.keys(SETTINGS_DEFAULTS);

// Fields where an empty value is a deliberate choice: the admin cleared it to
// HIDE that channel on the website. For these a stored '' must be returned as
// '', not swapped for the default — that swap is what made "remove the
// WhatsApp number and save" silently put the old number back.
const CLEARABLE_FIELDS = new Set([
  'supportPhone', 'supportWhatsapp',
  'socialInstagram', 'socialFacebook', 'socialYoutube', 'socialTelegram',
]);

async function readAdminSettings() {
  const doc = await AppSettings.getSingleton();
  const obj = (doc && doc.toObject) ? doc.toObject() : (doc || {});
  const out = { ...SETTINGS_DEFAULTS };
  for (const k of SETTINGS_FIELDS) {
    // Keep stored value (incl. boolean false / number 0); fall back to default
    // only when truly unset (undefined / null / empty string).
    if (obj[k] === undefined || obj[k] === null) continue;
    if (obj[k] === '' && !CLEARABLE_FIELDS.has(k)) continue;
    out[k] = obj[k];
  }
  return out;
}

// Get admin settings (full set — for the admin Settings page)
app.get('/api/admin/settings', async (req, res) => {
  try {
    res.json({ success: true, settings: await readAdminSettings() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update admin settings — persisted to AppSettings (survives restarts)
app.put('/api/admin/settings', async (req, res) => {
  try {
    const updates = req.body || {};
    const set = {};
    for (const k of SETTINGS_FIELDS) {
      if (k in updates) set[k] = updates[k];
    }
    await AppSettings.findOneAndUpdate({ key: 'global' }, { $set: set }, { upsert: true, new: true });
    res.json({ success: true, settings: await readAdminSettings() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUBLIC contact / site info for the website (no auth — only safe fields).
// The landing components read this instead of hard-coding phone/email/whatsapp.
app.get('/api/settings/public', async (req, res) => {
  try {
    const s = await readAdminSettings();
    res.json({
      success: true,
      settings: {
        siteName: s.siteName,
        siteUrl: s.siteUrl,
        supportEmail: s.supportEmail,
        supportPhone: s.supportPhone,
        supportWhatsapp: s.supportWhatsapp,
        phoneHours: s.phoneHours,
        whatsappHours: s.whatsappHours,
        emailResponseNote: s.emailResponseNote,
        legalEntityName: s.legalEntityName,
        registeredAddress: s.registeredAddress,
        operationalAddress: s.operationalAddress,
        contactPhone: s.contactPhone,
        contactEmail: s.contactEmail,
        socialInstagram: s.socialInstagram,
        socialFacebook: s.socialFacebook,
        socialYoutube: s.socialYoutube,
        socialTelegram: s.socialTelegram,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Register Zerodha tick callback to broadcast raw ticks to clients
// Spread is applied client-side via segment settings (unified spread system)
zerodhaService.onTick(async (ticks) => {
  if (ticks && ticks.length > 0) {
    // Market depth is only used here on the server, to derive bid/ask, which
    // every tick already carries. No page reads it, yet it was most of each
    // tick's size — one browser session was measured at 104 MB of ticks.
    io.to('zerodha-ticks').emit('zerodha-tick', ticks.map(({ depth, ...rest }) => rest));
  }
});

// ==================== NOTIFICATION ENDPOINTS ====================

// Get all notifications (admin)
app.get('/api/admin/notifications', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;
    
    const notifications = await Notification.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'name email')
      .lean();
    
    const total = await Notification.countDocuments();
    
    res.json({
      success: true,
      notifications,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send notification to all users (admin)
app.post('/api/admin/notifications/send', async (req, res) => {
  try {
    const { title, message, type = 'info', priority = 'normal', actionUrl, actionLabel, expiresAt, image, targetUserIds } = req.body;

    if (!title || !message) {
      return res.status(400).json({ success: false, error: 'Title and message are required' });
    }

    // Resolve admin-supplied oderIds (comma-separated) into User ObjectIds.
    // Empty list ⇒ broadcast to everyone.
    let targetUserObjectIds = [];
    if (Array.isArray(targetUserIds) && targetUserIds.length > 0) {
      const oderIds = targetUserIds
        .map(id => String(id || '').trim())
        .filter(Boolean);
      if (oderIds.length > 0) {
        const users = await User.find({ oderId: { $in: oderIds } }).select('_id oderId').lean();
        targetUserObjectIds = users.map(u => u._id);
        if (targetUserObjectIds.length === 0) {
          return res.status(400).json({ success: false, error: 'No matching users found for the provided oderIds' });
        }
      }
    }

    const notification = new Notification({
      title,
      message,
      image: image || null,
      type,
      priority,
      actionUrl,
      actionLabel,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      targetType: targetUserObjectIds.length > 0 ? 'specific' : 'all',
      targetUsers: targetUserObjectIds,
      isActive: true
    });

    await notification.save();

    // Emit real-time notification via Socket.IO
    io.emit('new-notification', {
      _id: notification._id,
      title: notification.title,
      message: notification.message,
      image: notification.image,
      type: notification.type,
      priority: notification.priority,
      targetType: notification.targetType,
      targetUsers: notification.targetUsers,
      createdAt: notification.createdAt
    });

    res.json({ success: true, notification, message: 'Notification sent successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send a real EMAIL to selected users (or everyone) from the support inbox.
// targetUserIds = array of oderIds → those users; empty/omitted → ALL users.
app.post('/api/admin/send-email', async (req, res) => {
  try {
    const { subject, message, targetUserIds } = req.body || {};
    if (!subject || !String(subject).trim()) return res.status(400).json({ success: false, error: 'Subject is required' });
    if (!message || !String(message).trim()) return res.status(400).json({ success: false, error: 'Message is required' });

    const emailService = require('./services/email.service');
    if (!emailService.isSmtpConfigured()) {
      return res.status(503).json({ success: false, error: 'Email is not configured on the server (SMTP). Set SMTP_* env vars first.' });
    }

    // Resolve recipients. Non-empty oderId list → those users; else everyone.
    let users;
    if (Array.isArray(targetUserIds) && targetUserIds.length > 0) {
      const oderIds = targetUserIds.map(x => String(x || '').trim()).filter(Boolean);
      users = await User.find({ oderId: { $in: oderIds } }).select('name email oderId').lean();
    } else {
      users = await User.find({ email: { $exists: true, $ne: '' } }).select('name email oderId').lean();
    }
    const recipients = users.filter(u => u.email && /@/.test(u.email));
    if (recipients.length === 0) {
      return res.status(400).json({ success: false, error: 'No recipients with a valid email address were found.' });
    }

    const safeSubject = String(subject).trim().slice(0, 200);
    const bodyText = String(message);
    // Same branded shell the templates use, so a message sent from the admin
    // panel does not arrive as bare text next to the automated mails.
    const brand = emailService.commonTemplateVars();
    const escaped = bodyText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    const shell = (greetingHtml) => `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F2F8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0D0F1A;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F0F2F8;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(13,15,26,0.08);">
<tr><td style="padding:28px 28px 22px 28px;background:linear-gradient(135deg,#0C0C1D 0%,#1E1E3F 50%,#2B4EFF 100%);text-align:center;">
<img src="${brand.bannerUrl}" alt="DhanFunded" width="64" height="64" style="display:inline-block;width:64px;height:64px;border-radius:16px;background:rgba(255,255,255,0.08);padding:6px;border:0;outline:none;" />
<p style="margin:10px 0 0 0;font-size:11px;font-weight:800;letter-spacing:2.5px;color:#FBBF24;text-transform:uppercase;">DhanFunded</p>
</td></tr>
<tr><td style="padding:26px 28px 8px 28px;font-size:15px;line-height:1.7;color:#2B2F3A;">${greetingHtml}${escaped}</td></tr>
<tr><td style="padding:22px 28px 30px 28px;border-top:1px solid #F0F2F8;">
<p style="margin:14px 0 6px 0;font-size:12px;color:#9499A8;">Need help? <a href="mailto:${brand.supportEmail}" style="color:#2B4EFF;text-decoration:none;">${brand.supportEmail}</a> &middot; <a href="${brand.siteUrl}" style="color:#2B4EFF;text-decoration:none;">${brand.siteUrl}</a></p>
<p style="margin:0;font-size:11px;color:#B6BAC6;line-height:1.5;">Simulated trading environment. Not financial advice. Trading involves risk. T&amp;Cs apply.</p>
<p style="margin:8px 0 0 0;font-size:11px;color:#C7CAD4;">&copy; ${brand.year} DhanFunded. All rights reserved.</p>
</td></tr></table></td></tr></table></body></html>`;

    // Send sequentially (small volumes); collect per-recipient result.
    let sent = 0; const failed = [];
    for (const u of recipients) {
      try {
        const greeting = u.name ? `Hi ${u.name},<br><br>` : '';
        await emailService.sendMail({
          to: u.email,
          subject: safeSubject,
          text: (u.name ? `Hi ${u.name},\n\n` : '') + bodyText,
          html: shell(greeting)
        });
        sent += 1;
      } catch (e) {
        failed.push({ email: u.email, error: e.message });
      }
    }

    res.json({
      success: true,
      message: `Email sent to ${sent} of ${recipients.length} recipient(s)` + (failed.length ? `, ${failed.length} failed` : ''),
      sent, total: recipients.length, failed
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete notification (admin)
app.delete('/api/admin/notifications/:id', async (req, res) => {
  try {
    const notification = await Notification.findByIdAndDelete(req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }
    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Toggle notification active status (admin)
app.patch('/api/admin/notifications/:id/toggle', async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }
    notification.isActive = !notification.isActive;
    await notification.save();
    res.json({ success: true, notification });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== USER NOTIFICATION ENDPOINTS ====================

// Get notifications for a user
// Resolve a user identifier (oderId OR _id) to the user's Mongo ObjectId.
// Client passes `user.id` which is actually the 6-digit oderId — the
// Notification model stores real ObjectIds, so we must translate first.
async function resolveUserObjectId(idOrOderId) {
  if (!idOrOderId) return null;
  const isObjectId = /^[a-f\d]{24}$/i.test(String(idOrOderId));
  if (isObjectId) {
    const byId = await User.findById(idOrOderId).select('_id').lean();
    if (byId) return byId._id;
  }
  const byOder = await User.findOne({ oderId: String(idOrOderId) }).select('_id').lean();
  return byOder ? byOder._id : null;
}

app.get('/api/user/notifications/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, unreadOnly = false } = req.query;

    const objectId = await resolveUserObjectId(userId);
    if (!objectId) return res.json({ success: true, notifications: [] });

    const notifications = await Notification.getForUser(objectId, {
      limit: parseInt(limit),
      unreadOnly: unreadOnly === 'true'
    });

    res.json({ success: true, notifications });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get unread notification count for a user
app.get('/api/user/notifications/:userId/unread-count', async (req, res) => {
  try {
    const { userId } = req.params;
    const objectId = await resolveUserObjectId(userId);
    if (!objectId) return res.json({ success: true, count: 0 });
    const count = await Notification.getUnreadCount(objectId);
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mark notification as read
app.post('/api/user/notifications/:notificationId/read', async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID required' });
    }

    const objectId = await resolveUserObjectId(userId);
    if (!objectId) return res.status(404).json({ success: false, error: 'User not found' });

    await Notification.markAsRead(notificationId, objectId);
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mark all notifications as read for a user
app.post('/api/user/notifications/:userId/read-all', async (req, res) => {
  try {
    const { userId } = req.params;
    const objectId = await resolveUserObjectId(userId);
    if (!objectId) return res.json({ success: true, message: 'Marked 0 notifications as read' });
    const result = await Notification.markAllAsRead(objectId);
    res.json({ success: true, message: `Marked ${result.count} notifications as read` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Global crash guards ──────────────────────────────────────────────
// Without these, a single unhandled error in any background task (a Zerodha
// tick handler, a setInterval, an un-awaited promise, a socket callback)
// terminates the whole Node process. Under PM2 that becomes an endless
// restart loop (the "251 restarts" crash-loop that made the API only
// intermittently reachable → browser "Failed to fetch"). We log the full
// stack so the ROOT cause is visible in `pm2 logs`, then keep the process
// alive so one bad event never takes the trading API down.
process.on('unhandledRejection', (reason, promise) => {
  console.error('🛑 UNHANDLED PROMISE REJECTION (kept alive):', reason);
  if (reason && reason.stack) console.error(reason.stack);
});
process.on('uncaughtException', (err, origin) => {
  console.error(`🛑 UNCAUGHT EXCEPTION (kept alive) [origin=${origin}]:`, err);
  if (err && err.stack) console.error(err.stack);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  console.log(`🚀 DhanFunded Server running on port ${PORT}`);
  console.log(`📊 Trading Engines: Hedging, Netting, Binary`);

  try {
    await zerodhaService.initialize();
    console.log(`📈 Zerodha: Instruments auto-synced`);
  } catch (error) {
    console.log(`📈 Zerodha: Will sync instruments when connected`);
  }
});

module.exports = { app, io };
