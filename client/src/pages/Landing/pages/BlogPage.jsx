import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Clock, BookOpen } from 'lucide-react';
import LandingShell from '../components/LandingShell';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Fallback shown only if the admin-managed API returns nothing (or is down) —
// live content comes from GET /api/blog (managed in Admin → Content).
const FALLBACK_POSTS = [
  {
    slug: 'best-prop-firm-india-2026',
    category: 'Prop Firm Guide',
    title: 'Best Prop Firm in India 2026: How to Choose a Funded Evaluation Challenge',
    excerpt: 'Looking for the best prop firm in India and the best prop challenge to get funded? Here is an honest, no-hype guide to what actually matters — INR payouts, transparent rules, and reliable funding — so you pick the right platform.',
    body: [
      'If you are searching for the best prop firm in India or the best prop evaluation challenge in 2026, you have probably noticed there are dozens of options and almost no honest comparisons. Most "top prop firm" lists are paid placements. This guide is different — it explains exactly what to look for so you can judge any Indian prop firm, including DhanFunded, on facts rather than marketing.',
      'First, what is a prop evaluation challenge? A proprietary capital firm gives skilled people access to its capital. You pay a one-time evaluation fee, take a challenge with clear rules (a profit target, a maximum loss, and a minimum number of market days), and if you pass you get a funded account. You then participate and keep the majority of the profits as a payout. For Indian people, the key is that the best prop firm pays in INR directly to an Indian bank account — no USD conversion, no foreign gateways.',
      'What makes a prop firm "the best" for India? Five things. One: INR-based fees and payouts, so you are not losing money to currency conversion. Two: instruments you actually follow — NIFTY, BANKNIFTY and SENSEX futures and options, not just forex. Three: transparent, plainly-written rules with no hidden consistency or hedging traps. Four: a published, reliable payout process with a fixed profit split. Five: account sizes that can scale your edge — from ₹1 Lakh up to ₹50 Lakhs.',
      'Equally important is what to avoid. Be cautious of firms that hide their rules until after you pay, that bury a "consistency rule" or "hedging restriction" that disqualifies most people, that delay payouts beyond their published timeline, or that only show influencer screenshots instead of a clear, repeatable payout process. A good prop firm publishes its rules, its profit split, and its payout timeline up front and does not change them after you pass.',
      'How does DhanFunded fit this checklist? It is a fully INR-based evaluation platform built specifically for Indian intraday people. You practise on NIFTY, BANKNIFTY and SENSEX in a structured simulated environment using real market data, with 1-Step, 2-Step and Instant funding options and account sizes up to ₹50 Lakhs. The rules — profit target, daily drawdown, overall drawdown, minimum active days, and the one-day-profit cap — are written in plain English and visible before you buy. Payouts are in INR to your verified Indian bank account on a published timeline.',
      'Our honest advice: do not choose a prop firm because an influencer recommended it. Read the full rule set, make sure you can afford the evaluation fee, and confirm the payout terms before you commit a single rupee. The best prop challenge for you is the one whose rules match your learning style and whose payout process you can verify. If you follow Indian indices intraday and want INR funding with transparent rules, DhanFunded is built exactly for that — but the right move is always to read the rules first and start with a plan you have already tested.',
    ],
    readTime: '10 min read',
    date: 'June 6, 2026',
  },
  {
    slug: 'best-nifty-prop-trading-challenge-india',
    category: 'NIFTY Markets',
    title: 'Best NIFTY Prop Evaluation Challenge: How to Get a Funded NIFTY Account in India',
    excerpt: 'Want a funded NIFTY account? This guide covers the best NIFTY prop evaluation challenge format, the exact rules you need to pass, and how to participate on NIFTY, BANKNIFTY and SENSEX in a simulated account with INR payouts.',
    body: [
      'NIFTY is the single most-followed index in India, so it is no surprise that "best NIFTY prop evaluation challenge" and "NIFTY funded account India" are among the most common searches from serious intraday people. The idea is simple: instead of risking your own savings on NIFTY, you pass an evaluation that proves your skill and follow the index on a firm-funded account, keeping most of the profit.',
      'A NIFTY prop challenge is a structured evaluation. You get a simulated account of a fixed size — say ₹5 Lakhs or ₹10 Lakhs — and a set of rules. A typical rule set is: hit a profit target (often 8-10%), never breach the daily drawdown (3-4%) or the overall drawdown (10%), and stay active for a minimum number of days. Pass cleanly and the account converts to a funded account that pays real performance payouts.',
      'To pass a NIFTY challenge, strategy matters far less than discipline. The people who pass are not the ones with the best entries — they are the ones who size positions correctly and respect the daily loss cap. On a ₹10 Lakh account with a 4% daily limit, that is ₹40,000 of room; smart people stop themselves at half of that. Focus on one instrument well rather than opening NIFTY, BANKNIFTY and SENSEX at once — Indian indices are correlated, and a single news event can move all three against you.',
      'What should the best NIFTY funded account offer in India? INR fees and INR payouts, the actual NSE/BSE index products (NIFTY, BANKNIFTY, SENSEX futures and options), leverage and lot sizes that match the exchange, transparent rules with no hidden disqualifiers, and a published payout timeline. If a firm cannot show you these clearly before you pay, keep looking.',
      'DhanFunded runs exactly this kind of evaluation for Indian index people. You participate on NIFTY, BANKNIFTY and SENSEX in a simulated environment driven by real market data, choose from 1-Step, 2-Step or Instant funding, and scale up to a ₹50 Lakh account. Every rule — profit target, daily and overall drawdown, minimum active days, and the per-day profit cap — is shown up front, and approved payouts are paid in INR straight to your Indian bank account.',
      'If you are an Indian intraday participant with a tested NIFTY or BANKNIFTY strategy, a funded challenge is the most efficient way to scale your edge without risking your own capital. Start with an account size you are comfortable with, read the rules end to end, follow your plan, and treat the daily drawdown as a hard line you never cross. That discipline — not a magic indicator — is what turns a NIFTY prop challenge into a funded account and a steady INR payout.',
    ],
    readTime: '9 min read',
    date: 'June 10, 2026',
  },
  {
    slug: 'how-prop-firms-work',
    category: 'Prop Firm Basics',
    title: 'How Prop Firms Work — A Complete Guide for Indian People',
    excerpt: 'Prop firms give skilled people access to a simulated account instead of forcing them to risk their own savings. The person passes a structured evaluation that proves their discipline, the firm provides the capital, and they share the profits.',
    body: [
      'A proprietary capital firm — or "prop firm" — is a company that gives people access to its own capital. Instead of using your savings, you participate with firm money. In return, the firm keeps a share of the profits and the person keeps the rest. This model has existed for decades on Wall Street; the modern retail prop firm simply opened it up to anyone who can prove their skill.',
      'The way it works is simple. You pay a one-time evaluation fee to take a challenge. The challenge has clear rules — a profit target you have to hit, a maximum loss you cannot cross, and a minimum number of market days. If you pass, you get a funded account. If you do not, you can buy another evaluation and try again.',
      'For Indian people specifically, prop firms solve a real problem: most retail people never have enough capital to scale their strategy. A person with a ₹50,000 account who makes 5% a month is doing well, but ₹2,500 a month does not change anyone\'s life. The same person on a ₹10,00,000 funded account is making ₹50,000 a month — and now we are talking about a real income.',
      'At DhanFunded, the entire evaluation is simulated. We do not place real orders on NSE or BSE. The market data is real, the rules are real, the payouts are real — but the environment is a simulator built specifically for evaluating skill. That is why we can offer this service legally as an educational and evaluation platform.',
    ],
    readTime: '8 min read',
    date: 'April 22, 2025',
  },
  {
    slug: 'risk-management-funded-learners',
    category: 'Risk Management',
    title: 'Best Risk Management Practices for Funded People',
    excerpt: 'The people who pass evaluations and keep their funded accounts are not the ones with the best entries. They are the ones who never let a single position ruin their day. Risk management is the only edge that compounds.',
    body: [
      'Every funded person who has held an account for more than three months will tell you the same thing: the goal is not to make the most money on a winning day. The goal is to lose the least on a losing day. Drawdown limits exist for a reason, and the people who respect them are the ones who survive.',
      'The first rule we recommend is the 1% rule. Never risk more than 1% of your account on a single position. On a ₹10,00,000 funded account, that is ₹10,000 of risk. If your stop-loss is 20 points away on NIFTY futures, that math forces a smaller position size — which is exactly the point.',
      'The second rule is the daily loss cap. Every challenge at DhanFunded has a Daily Drawdown limit (3-4%). Hit that limit and you are out. Smart people set their personal daily stop at half the official limit. If the rule is 4%, you stop at 2%. That margin of safety is what protects you from one bad day turning into a disqualified evaluation.',
      'The third — and least talked about — rule is position concentration. Never have more than two open positions at once during evaluation. We see people open NIFTY long, BANKNIFTY long, and SENSEX long simultaneously, then watch all three move against them on a single news event. Diversification is a myth in correlated Indian indices. Focus on one thing well.',
      'Risk management is boring. That is the entire point. Boring people pass evaluations. Exciting people blow them up.',
    ],
    readTime: '10 min read',
    date: 'April 18, 2025',
  },
  {
    slug: 'why-learners-fail-challenges',
    category: 'Mindset',
    title: 'Common Reasons People Fail Prop Firm Challenges',
    excerpt: 'After watching hundreds of evaluations, the same patterns keep showing up. Most failures have nothing to do with strategy. They are mistakes of impatience, oversizing, and ignoring the rules everyone agreed to before starting.',
    body: [
      'We track every evaluation that runs on the platform. After 312 successful passes and several hundred failures, the patterns are remarkably consistent. The vast majority of people fail for one of five reasons — and almost none of them involve a bad strategy.',
      'Reason one: oversizing. A person gets two losses in a row, doubles their position size to "make it back," and breaches the daily drawdown on the third position. This is the single most common failure mode. The fix is mechanical — your position size is locked at the start of the day, and you do not change it until the next session.',
      'Reason two: revenge entries. After a losing position, the person immediately enters another position without setup confirmation. Their next move is emotional, not technical. By the third revenge entry, they have crossed the daily limit. The fix is to walk away from the screen for 30 minutes after any loss bigger than 1%.',
      'Reason three: ignoring the time-of-day pattern. Indian intraday markets have rhythms. The first 15 minutes are choppy, lunchtime is dead, and the last hour can be violent. People who try to scalp at 1:30 PM almost always overreach and lose to commissions and noise.',
      'Reason four: not reading the rules. We have had people breach the consistency rule on Instant accounts because they did not know it existed. They had one massive day that contributed 60% of their total profit. The 30% consistency cap kicked in and the account was disqualified. Read the rules. They are short. They are written in plain English.',
      'Reason five: chasing news events. RBI policy day, budget day, results — these are not days for evaluation activity. The volatility looks like opportunity but is actually a tax on people who think they can predict the unpredictable. Stay flat or use tiny size.',
    ],
    readTime: '11 min read',
    date: 'April 14, 2025',
  },
  {
    slug: 'how-payouts-work',
    category: 'Payouts',
    title: 'How Payouts Work at DhanFunded',
    excerpt: 'You passed the evaluation. Now what? Here is exactly how payouts work — KYC, processing time, profit split, and how the money gets to your bank account. No marketing fluff, just the actual process.',
    body: [
      'The payout process at DhanFunded begins the moment you finish your evaluation with a passing result. You will get a notification on your registered email and inside the dashboard. From there, the process is in four clear stages.',
      'Stage one is KYC verification. We need a self-attested copy of your PAN card, your Aadhaar card, and a cancelled cheque or bank statement showing your name and account number. This usually takes 24 to 48 hours to verify. We do this digitally — there is no in-person meeting, no notarisation, nothing complicated. Once verified, your KYC stays on file for all future payouts.',
      'Stage two is the cooling period. After your evaluation passes, there is a 7-day cooling period before the first payout becomes available. This exists to make sure the result is genuine and not the outcome of a single lucky session. If you stay active during this period and stay within the rules, the cooling period is part of your performance record.',
      'Stage three is the profit split. DhanFunded pays out up to 80% of simulated profits depending on your plan tier. The split is fixed and visible in your dashboard from day one. We do not change it after you pass. We do not have hidden fees that reduce the payout amount.',
      'Stage four is the bank transfer. Payouts go directly to your verified Indian bank account through IMPS or NEFT. The money usually lands in 24 to 48 hours after we initiate the transfer. We do not use foreign payment gateways, we do not deduct USD conversion fees, and we do not delay payouts beyond the published timeline. To date, every single payout we have promised has been paid on time.',
      'Your evaluation fee is also credited back as part of your first approved payout. So if you paid ₹12,600 for the 5L 1-Step plan, that ₹12,600 comes back to you on the first payout cycle. After that, every subsequent payout is pure profit share.',
    ],
    readTime: '9 min read',
    date: 'April 8, 2025',
  },
  {
    slug: 'psychology-consistent-learners',
    category: 'Mindset',
    title: 'The Psychology of Consistent People',
    excerpt: 'Consistency in the markets is 90% mental and 10% technical. The people who survive and thrive are not the ones who found the perfect indicator. They are the ones who learned to manage themselves before managing the market.',
    body: [
      'In the markets, consistency is rarer than profitability. Plenty of people make money. Very few do it consistently for years. The difference is almost entirely psychological — the ability to follow your own rules even when your emotions are screaming at you to break them.',
      'The first habit of consistent people is process orientation. They do not measure success by the P&L of a single day. They measure it by whether they followed their plan. A losing day where they followed their rules is a good day. A winning day where they got lucky is a warning sign. This sounds backwards until you have lived it for a year.',
      'The second habit is journaling. Every consistent person we have worked with keeps a written record. Not a fancy spreadsheet — just notes after each session. What did I plan to take? What did I actually take? Why did I deviate? The patterns become obvious after 30 days of honest journaling.',
      'The third habit is detachment from individual positions. Consistent people do not get attached to outcomes. They take the setup, place the order, and accept whatever the market delivers. If they win, fine. If they lose, fine. The next setup gets the same treatment. This emotional flatness is not natural — it is built through deliberate repetition.',
      'The fourth habit is acceptance of small wins. Consistent people are happy with 0.5% to 1% per day on average. They do not chase 5% days. They know that compounding 0.5% over 200 market days produces a return that no single big day can match — and it does so without the drawdown that big swings always bring.',
      'The hardest part is patience with the process. Most people who fail in the first three months would have made it if they had stayed disciplined for six. The market does not reward speed. It rewards staying power.',
    ],
    readTime: '12 min read',
    date: 'April 2, 2025',
  },
  {
    slug: 'funded-vs-personal-capital',
    category: 'Strategy',
    title: 'Funded Capital vs Personal Capital — Which Is Right for You?',
    excerpt: 'Deploying your own money feels different from using a simulated account. The risk is real, the emotions are sharper, the constraints are different. Here is an honest comparison so you can choose what fits your situation.',
    body: [
      'Most retail people eventually face this question: should I use my own money, or should I get funded? Both paths have real advantages and real costs. The right choice depends on your capital position, your risk tolerance, and your discipline level.',
      'Using your own capital gives you complete control. There are no rules except the ones you set. You can hold positions overnight, you can scale into them, you can take a 5% loss and recover next month. The downside is obvious — every loss is real, and most retail people do not have the capital base to compound meaningfully. A 30% return on a ₹2,00,000 account is ₹60,000 a year. Useful, but not life-changing.',
      'Funded capital flips this. You get access to capital you could not afford to deploy yourself, but you operate under rules. Daily drawdown caps, profit targets, intraday-only restrictions on most plans. The freedom is constrained, but the upside is multiplied. A 30% return on a ₹10,00,000 funded account at 80% profit split is ₹2,40,000 a year — for the person. That is meaningful income.',
      'There is also a psychological layer. When you risk your own money, every loss feels personal. It is your savings, your bills, your future. That emotional weight makes most retail people worse, not better. Funded capital removes this weight. You still want to perform well — your livelihood depends on staying funded — but a single losing day does not threaten your family\'s grocery budget. That separation often makes people more disciplined, not less.',
      'The honest answer is most serious people do both. They keep a personal account for long-term positions and full creative freedom, and they use a funded account to scale their best intraday strategies. The funded account becomes a cash flow stream. The personal account becomes a wealth-building stream. Different goals, different tools.',
      'If you are an Indian intraday participant with a tested strategy and the discipline to follow rules, a funded account is the most efficient way to scale your edge. If you are still learning, work on your own capital first. The rules of a prop firm will expose any weakness in your strategy faster than the market alone ever will.',
    ],
    readTime: '13 min read',
    date: 'March 26, 2025',
  },
];

export default function BlogPage() {
  const { slug } = useParams();
  const [posts, setPosts] = useState(FALLBACK_POSTS);
  const [activePost, setActivePost] = useState(slug ? (FALLBACK_POSTS.find((p) => p.slug === slug) || null) : null);

  // Live, admin-managed list (falls back to the hardcoded copy if API is empty).
  useEffect(() => {
    fetch(`${API_URL}/api/blog`)
      .then((r) => r.json())
      .then((d) => { if (d?.success && Array.isArray(d.posts) && d.posts.length) setPosts(d.posts); })
      .catch(() => { /* keep fallback */ });
  }, []);

  // Detail post — fetch the full body for the open slug (fallback first so the
  // page paints instantly, then the live copy replaces it).
  useEffect(() => {
    if (!slug) { setActivePost(null); return; }
    let cancelled = false;
    setActivePost(FALLBACK_POSTS.find((p) => p.slug === slug) || null);
    fetch(`${API_URL}/api/blog/${slug}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d?.success && d.post) setActivePost(d.post); })
      .catch(() => { /* keep fallback */ });
    return () => { cancelled = true; };
  }, [slug]);

  // Title/description/canonical are owned by <Seo> via LandingShell — setting
  // document.title here too would race it.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug, activePost]);

  if (activePost) {
    return (
      <LandingShell
        seo={{
          path: `/blog/${activePost.slug || slug}`,
          title: `${activePost.title} | DhanFunded`,
          description: activePost.excerpt || activePost.title,
        }}
      >
        <Navbar />

        {/* Not one of the eight articles carried structured data, so search
            engines saw them as anonymous pages rather than dated, authored
            articles. `date` is prose ("June 6, 2026"); Date.parse handles that
            format, and an unparseable value is left out rather than guessed. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'BlogPosting',
              headline: activePost.title,
              description: activePost.excerpt || activePost.title,
              mainEntityOfPage: `https://dhanfunded.com/blog/${activePost.slug || slug}`,
              ...(Number.isFinite(Date.parse(activePost.date))
                ? { datePublished: new Date(activePost.date).toISOString().slice(0, 10) }
                : {}),
              author: { '@type': 'Organization', name: 'DhanFunded', url: 'https://dhanfunded.com' },
              publisher: {
                '@type': 'Organization',
                name: 'DhanFunded',
                url: 'https://dhanfunded.com',
                logo: { '@type': 'ImageObject', url: 'https://dhanfunded.com/landing/img/dhanfunded-og.png' },
              },
              inLanguage: 'en-IN',
              about: ['Prop trading in India', 'Funded trading accounts', 'NIFTY and BANKNIFTY index options'],
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://dhanfunded.com/' },
                { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://dhanfunded.com/blog' },
                {
                  '@type': 'ListItem',
                  position: 3,
                  name: activePost.title,
                  item: `https://dhanfunded.com/blog/${activePost.slug || slug}`,
                },
              ],
            }),
          }}
        />

        <article className="pt-28 pb-14 md:pt-44 md:pb-24 px-6">
          <div className="max-w-3xl mx-auto">
            <Link
              to="/blog"
              className="text-sm font-semibold text-[color:var(--pf-brand)] hover:underline mb-6 inline-flex items-center gap-1"
            >
              ← Back to all articles
            </Link>

            <div className="flex flex-wrap items-center gap-3 mb-5">
              <span className="text-xs font-semibold text-[color:var(--pf-brand)] bg-[rgba(31,216,122,0.06)] px-3 py-1 rounded-full uppercase tracking-wider">{activePost.category}</span>
              <span className="text-xs text-[color:var(--pf-muted)] flex items-center gap-1"><Clock size={12} /> {activePost.readTime}</span>
              <span className="text-xs text-[color:var(--pf-muted)]">{activePost.date}</span>
            </div>

            <h1 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.02em' }} className="text-[color:var(--pf-text)] mb-6">
              {activePost.title}
            </h1>

            <p className="text-lg sm:text-xl text-[color:var(--pf-muted)] leading-relaxed mb-10 italic border-l-4 border-[#1FD87A] pl-5">
              {activePost.excerpt}
            </p>

            <div className="space-y-6 text-base sm:text-lg text-[color:var(--pf-text)] leading-relaxed">
              {(Array.isArray(activePost.body)
                ? activePost.body
                : String(activePost.body || '').split(/\n{2,}/)
              ).map((para, i) => (para.trim() ? <p key={i}>{para}</p> : null))}
            </div>

            <div className="mt-12 pt-8 border-t border-[color:var(--pf-border)]">
              <p className="text-sm text-[color:var(--pf-muted)] mb-4">Ready to apply this in your own evaluation?</p>
              <Link to="/pricing" className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[color:var(--pf-brand)] text-white font-semibold text-sm hover:bg-[color:var(--pf-brand-2)] transition-all">
                View Plans <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </article>

        <Footer />
      </LandingShell>
    );
  }

  return (
    <LandingShell>
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-12 md:pt-44 md:pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">Resources</p>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em' }} className="text-[color:var(--pf-text)] mb-6">
            Honest insights for <span className="text-[color:var(--pf-brand)]">Indian funded people</span>
          </h1>
          <p className="text-base sm:text-lg text-[color:var(--pf-muted)] max-w-2xl mx-auto leading-relaxed">
            Long-form articles written by people, not marketers. We cover the parts of prop evaluation that matter — risk, psychology, payouts, and what actually works in Indian markets.
          </p>
        </div>
      </section>

      {/* Posts */}
      <section className="pb-16 md:pb-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {posts.map((post, i) => (
              <Link
                key={post.slug}
                to={`/blog/${post.slug}`}
                className={`group cursor-pointer block bg-[color:var(--pf-card)] border border-[color:var(--pf-border)] rounded-2xl p-6 sm:p-8 shadow-[0_2px_16px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)] hover:border-[color:var(--pf-brand)] transition-all ${i === 0 ? 'md:col-span-2' : ''}`}
              >
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <span className="text-xs font-semibold text-[color:var(--pf-brand)] bg-[rgba(31,216,122,0.06)] px-3 py-1 rounded-full uppercase tracking-wider">{post.category}</span>
                  <span className="text-xs text-[color:var(--pf-muted)] flex items-center gap-1"><Clock size={12} /> {post.readTime}</span>
                  <span className="text-xs text-[color:var(--pf-muted)]">{post.date}</span>
                </div>

                <h2 className={`font-bold text-[color:var(--pf-text)] mb-3 leading-tight group-hover:text-[color:var(--pf-brand)] transition-colors ${i === 0 ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'}`} style={{ letterSpacing: '-0.02em' }}>
                  {post.title}
                </h2>

                <p className="text-base text-[color:var(--pf-muted)] leading-relaxed mb-5">
                  {post.excerpt}
                </p>

                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--pf-brand)]">
                  <BookOpen size={14} /> Read full article <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Subscribe */}
      <section className="py-14 md:py-20 px-6 bg-[color:var(--pf-card-alt)]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.02em' }} className="text-[color:var(--pf-text)] mb-4">
            Want market insights in your inbox?
          </h2>
          <p className="text-base text-[color:var(--pf-muted)] mb-8 max-w-xl mx-auto">
            We publish one article a week. No promotional emails, no upsells — just the kind of stuff we wish someone had told us when we started.
          </p>
          <form onSubmit={(e) => e.preventDefault()} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <input
              type="email"
              placeholder="your@email.com"
              className="flex-1 px-5 py-3.5 rounded-full bg-[color:var(--pf-card)] border border-[color:var(--pf-border)] text-[color:var(--pf-text)] text-sm focus:outline-none focus:border-[#1FD87A] transition-all"
            />
            <button
              type="submit"
              className="px-6 py-3.5 rounded-full bg-[color:var(--pf-brand)] text-white font-semibold text-sm hover:bg-[color:var(--pf-brand-2)] transition-all shrink-0"
            >
              Subscribe
            </button>
          </form>
        </div>
      </section>

      <Footer />
    </LandingShell>
  );
}
