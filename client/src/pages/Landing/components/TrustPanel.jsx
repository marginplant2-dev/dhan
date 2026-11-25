import { Link } from 'react-router-dom';
import {
  ArrowRight, Clock, FlaskConical, Gauge, IndianRupee, ListChecks, Receipt, ShieldCheck,
} from 'lucide-react';
import { useSiteSettings } from '../hooks/useSiteSettings';

const PILLARS = [
  { Icon: FlaskConical, label: 'Simulated capital,\nno exchange orders' },
  { Icon: ListChecks, label: 'Targets and limits\nquoted in ₹' },
  { Icon: Gauge, label: 'Limits tracked\nlive on screen' },
  { Icon: Clock, label: 'Intraday only, squared\noff by 3:15 PM' },
  { Icon: Receipt, label: 'One-time fee,\nno subscription' },
  { Icon: IndianRupee, label: 'Payouts to a bank\nin your name' },
];

export default function TrustPanel() {
  const site = useSiteSettings();

  return (
    <section className="pf-section pf-section--alt">
      <div className="pf-wrap">
        <div
          className="pf-card p-6 sm:p-9"
          style={{ background: 'linear-gradient(135deg, var(--pf-brand-soft), var(--pf-card) 58%)' }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4 mb-7">
            <div className="flex items-start gap-3.5">
              <span className="pf-tile pf-tile--brand" style={{ width: 38, height: 38, borderRadius: 11 }}>
                <ShieldCheck size={19} />
              </span>
              <div>
                <h2 className="text-[1.15rem] font-extrabold mb-1" style={{ color: 'var(--pf-text)' }}>Who DhanFunded is for</h2>
                <p className="pf-body">
                  Retail traders in India who already trade index options and want a larger account
                  without putting their savings on the line.
                  {site.legalEntityName && (
                    <> Operated by <strong style={{ color: 'var(--pf-text)' }}>{site.legalEntityName}</strong>.</>
                  )}
                </p>
              </div>
            </div>
            <span className="pf-chip">Practice money in, real rupees out</span>
          </div>

          <hr className="pf-divider mb-8" />

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
            {PILLARS.map(({ Icon, label }) => (
              <div key={label} className="flex flex-col items-center text-center gap-3">
                <span
                  className="grid place-items-center w-[52px] h-[52px] rounded-full"
                  style={{ background: 'var(--pf-card)', border: '1px solid var(--pf-border)', color: 'var(--pf-brand)' }}
                >
                  <Icon size={21} />
                </span>
                <span className="text-[.82rem] font-semibold leading-snug whitespace-pre-line" style={{ color: 'var(--pf-text)' }}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          <p className="pf-inset mt-8 p-4 text-[.82rem] leading-relaxed" style={{ color: 'var(--pf-muted)' }}>
            <strong style={{ color: 'var(--pf-text)' }}>Please read:</strong> every trade on DhanFunded
            happens in a simulation, and no order ever reaches NSE or BSE. DhanFunded is not a broker or a
            SEBI-registered intermediary, and nothing on this site is investment advice. Who may join a
            programme and what is paid out are decided only by our{' '}
            <Link to="/terms" className="font-semibold underline underline-offset-2" style={{ color: 'var(--pf-text)' }}>terms</Link>
            {' '}and{' '}
            <Link to="/risk-disclaimer" className="font-semibold underline underline-offset-2" style={{ color: 'var(--pf-text)' }}>risk disclaimer</Link>.
          </p>
        </div>

        <div className="text-center mt-10">
          <Link to="/pricing" className="pf-btn pf-btn--primary pf-btn--lg">
            Compare the programmes <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    </section>
  );
}
