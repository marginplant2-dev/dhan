import { CalendarCheck, Headphones, IndianRupee, Percent, ScrollText, Wallet } from 'lucide-react';

const ITEMS = [
  {
    Icon: CalendarCheck, tile: 'pf-tile--soft', title: 'A fixed payout clock',
    desc: 'Fourteen days, every time. The conditions are written down, so you know the date you become eligible before you start.',
  },
  {
    Icon: Wallet, tile: 'pf-tile--ink', title: 'Nobody to convince',
    desc: 'No interview, no call, no discretionary review. Your numbers decide, and they are the only thing that does.',
  },
  {
    Icon: Percent, tile: 'pf-tile--green', title: 'Up to 80% is yours',
    desc: 'Eighty per cent on evaluated accounts, seventy on Instant. The split is set the day you buy and does not move.',
  },
  {
    Icon: IndianRupee, tile: 'pf-tile--amber', title: 'Rupees, start to finish',
    desc: 'Indian indices, Indian hours, Indian bank. Nothing is priced in dollars, so nothing is lost converting it back.',
  },
  {
    Icon: ScrollText, tile: 'pf-tile--violet', title: 'Limits you can quote',
    desc: 'Every target and limit is a rupee figure on the pricing page, and the same figure in your dashboard while you trade.',
  },
  {
    Icon: Headphones, tile: 'pf-tile--pink', title: 'Answers from people who trade',
    desc: 'WhatsApp, email or phone, answered by people who can read your account and tell you what actually happened.',
  },
];

export default function WhyLoveUs() {
  return (
    <section className="pf-section">
      <div className="pf-wrap">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="pf-eyebrow mb-4">Why participants stay</p>
          <h2 className="pf-h2">Why traders stay</h2>
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
