import { BarChart3 } from 'lucide-react';

/**
 * Required-style attribution: TradingView supplies embedded advanced charts / widgets
 * under their terms. Keep visible on the marketing site where charts are advertised.
 */
export default function TradingViewLegalNotice() {
  return (
    <div
      id="tradingview-charts-notice"
      className="mb-8 p-5 rounded-xl bg-[#0E2A3A] border-2 border-[rgba(255,255,255,0.08)] scroll-mt-24"
    >
      <div className="flex items-start gap-3">
        <BarChart3 size={18} className="text-[#35DC85] shrink-0 mt-0.5" aria-hidden />
        <div>
          <div className="text-xs font-bold text-white mb-1.5 uppercase tracking-wide">
            Market charts from TradingView
          </div>
          <p className="text-xs text-[#9FB5AB] mb-2">
            <a
              href="https://www.tradingview.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#35DC85] font-semibold hover:underline"
            >
              Stock Heatmap by TradingView
            </a>
            {': '}
            the direct attribution link TradingView requires wherever its widgets are embedded.
          </p>
          <p className="text-xs text-[#9FB5AB] leading-relaxed">
            The advanced charts, the Stock Heatmap and the other market widgets you see on DhanFunded
            are <strong>supplied by TradingView</strong>, and TradingView&apos;s own terms, policies and
            technical rules govern them. TradingView is an independent third party, so DhanFunded cannot
            answer for its data, its uptime or the way its charts behave. When you use these charts and
            widgets, you accept the TradingView terms that apply to them.
          </p>
          <p className="mt-2 text-[11px] text-[#9FB5AB]/60 leading-relaxed">
            Learn more:{' '}
            <a
              href="https://www.tradingview.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#35DC85] font-medium hover:underline"
            >
              TradingView.com
            </a>
            {' · '}
            <a
              href="https://www.tradingview.com/policies/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#35DC85] font-medium hover:underline"
            >
              Policies &amp; terms
            </a>
            {' · '}
            <a
              href="https://www.tradingview.com/widget/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#35DC85] font-medium hover:underline"
            >
              Widgets
            </a>
            . TradingView and its associated marks are trademarks held by their respective owners.
          </p>
        </div>
      </div>
    </div>
  );
}
