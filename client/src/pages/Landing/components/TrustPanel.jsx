import { Link } from 'react-router-dom';
import {
  ArrowRight, BarChart3, Building2, FlaskConical, IndianRupee, ListChecks, Lock, ShieldCheck,
} from 'lucide-react';
import { useSiteSettings } from '../hooks/useSiteSettings';

const PILLARS = [
  { Icon: Building2, label: 'Registered\nIndian Entity' },
  { Icon: FlaskConical, label: 'Simulation-only\nPlatform' },
  { Icon: ListChecks, label: 'Structured\nEvaluations' },
  { Icon: BarChart3, label: 'Analytics and\nJournaling' },
  { Icon: Lock, label: 'Secure Payment\nGateway' },
  { Icon: IndianRupee, label: 'INR Payouts\nto Your Bank' },
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
                <h2 className="text-[1.15rem] font-extrabold mb-1" style={{ color: 'var(--pf-text)' }}>Built for trust</h2>
                <p className="pf-body">
                  Built by <strong style={{ color: 'var(--pf-text)' }}>{site.legalEntityName}</strong> for Indian participants.
                </p>
              </div>
            </div>
            <span className="pf-chip">Controlled simulated research environment</span>
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
            <strong style={{ color: 'var(--pf-text)' }}>Note:</strong> DhanFunded provides a simulated,
            controlled-environment evaluation experience. Orders are not placed on NSE or BSE. Programme
            access and payouts are governed by our documented rules and terms.
          </p>
        </div>

        <div className="text-center mt-10">
          <Link to="/pricing" className="pf-btn pf-btn--primary pf-btn--lg">
            Begin Assessment <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    </section>
  );
}
