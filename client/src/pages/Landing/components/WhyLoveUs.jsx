import { CalendarCheck, Headphones, IndianRupee, Percent, ScrollText, Wallet } from 'lucide-react';

const ITEMS = [
  {
    Icon: CalendarCheck, tile: 'pf-tile--soft', title: 'Biweekly Payouts',
    desc: 'Request a payout every 14 days once you are funded. No waiting for an arbitrary review window.',
  },
  {
    Icon: Wallet, tile: 'pf-tile--ink', title: 'Streamlined Process',
    desc: 'Sign up, clear the assessment, get funded. No sales calls, no interviews, no hidden approval steps.',
  },
  {
    Icon: Percent, tile: 'pf-tile--green', title: 'Up to 80% Share',
    desc: 'You keep the overwhelming majority of your performance. The split is fixed before you start.',
  },
  {
    Icon: IndianRupee, tile: 'pf-tile--amber', title: 'Built for INR',
    desc: 'Indian instruments, Indian market hours, Indian bank payouts. No currency conversion, no FX spread.',
  },
  {
    Icon: ScrollText, tile: 'pf-tile--violet', title: 'Rules in Plain English',
    desc: 'Every target, drawdown limit and payout condition is published on this page before you pay a rupee.',
  },
  {
    Icon: Headphones, tile: 'pf-tile--pink', title: 'Support That Replies',
    desc: 'WhatsApp, email and Telegram — answered by people who actually know the platform.',
  },
];

export default function WhyLoveUs() {
  return (
    <section className="pf-section">
      <div className="pf-wrap">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="pf-eyebrow mb-4">Why participants stay</p>
          <h2 className="pf-h2">Everything is on the table</h2>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map(({ Icon, tile, title, desc }) => (
            <article key={title} className="pf-card pf-card--hover p-7">
              <span className={`pf-tile ${tile} mb-5`}><Icon size={21} /></span>
              <h3 className="pf-h3 mb-2.5">{title}</h3>
              <p className="pf-body">{desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
