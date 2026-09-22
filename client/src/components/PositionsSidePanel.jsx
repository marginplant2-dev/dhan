import { useState } from 'react';
import { LuTarget, LuShield, LuLogOut, LuX, LuChevronLeft, LuChevronRight } from 'react-icons/lu';

/**
 * Left-hand positions panel for the trading terminal: Positions / Pending /
 * Closed, each row a compact card.
 *
 * It owns no trading logic. Prices, P&L and formatting come from MarketPage's
 * own helpers (the same ones the bottom table and the mobile cards use), and
 * every action goes through the existing handlers — Exit → handleClosePosition,
 * TP/SL → openEditModal (the SL/TP popup), Cancel → handleCancelPendingOrder.
 * Styles: .psp-* in App.css. Hidden on mobile, where the Positions tab already
 * shows these cards.
 */

const TABS = [
  { key: 'positions', label: 'Positions' },
  { key: 'pending', label: 'Pending' },
  { key: 'closed', label: 'Closed' },
];

const COLLAPSE_KEY = 'pf-pos-panel-collapsed';

function readCollapsed() {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
}

function timeOf(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function Qty({ row }) {
  const lots = Number(row.volume || row.lots || 0);
  const units = Number(row.quantity || 0);
  return (
    <>
      Qty <strong>{lots}</strong> {lots === 1 ? 'lot' : 'lots'}
      {units > 0 && <> · {units} qty</>}
    </>
  );
}

export default function PositionsSidePanel({
  positions = [],
  pending = [],
  closed = [],
  calculateProfit,
  getCurrentPrice,
  formatPrice,
  formatPnL,
  onExit,
  onEditSlTp,
  onCancel,
}) {
  const [tab, setTab] = useState('positions');
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggle = () => {
    setCollapsed((c) => {
      try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* storage blocked */ }
      return !c;
    });
  };

  const counts = { positions: positions.length, pending: pending.length, closed: closed.length };
  const floating = positions.reduce((sum, p) => sum + (Number(calculateProfit(p)) || 0), 0);

  if (collapsed) {
    return (
      <aside className="psp psp--collapsed" aria-label="Positions">
        <button type="button" className="psp-rail-btn" onClick={toggle} title="Show positions" aria-label="Show positions panel">
          <LuChevronRight size={16} />
        </button>
        {counts.positions > 0 && <span className="psp-rail-count" title={`${counts.positions} open`}>{counts.positions}</span>}
      </aside>
    );
  }

  return (
    <aside className="psp" aria-label="Positions">
      <div className="psp-head">
        <div>
          <div className="psp-eyebrow">Trades</div>
          <div className={`psp-float ${floating >= 0 ? 'is-up' : 'is-down'}`}>
            {positions.length > 0 ? formatPnL(floating, positions[0].symbol) : 'No open positions'}
          </div>
        </div>
        <button type="button" className="psp-collapse" onClick={toggle} title="Hide positions" aria-label="Hide positions panel">
          <LuChevronLeft size={16} />
        </button>
      </div>

      <div className="psp-tabs" role="tablist" aria-label="Trade lists">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`psp-tab${tab === t.key ? ' is-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className="psp-tab-count">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <div className="psp-list" role="tabpanel">
        {tab === 'positions' && (positions.length === 0
          ? <Empty text="No open positions on this account" />
          : positions.map((pos) => {
            const side = String(pos.side || 'buy').toLowerCase();
            const profit = Number(calculateProfit(pos)) || 0;
            const entry = pos.openPrice || pos.entryPrice || pos.avgPrice || 0;
            const ltp = getCurrentPrice(pos);
            return (
              <article key={pos.positionId || pos._id || pos.symbol} className={`psp-card is-${side}`}>
                <div className="psp-row1">
                  <span className={`psp-side is-${side}`}>{side.toUpperCase()}</span>
                  <span className="psp-sym" title={pos.symbol}>{pos.symbol}</span>
                  <span className={`psp-pnl ${profit >= 0 ? 'is-up' : 'is-down'}`}>{formatPnL(profit, pos.symbol)}</span>
                </div>
                <div className="psp-meta"><Qty row={pos} />{timeOf(pos.openTime || pos.createdAt) && <> · {timeOf(pos.openTime || pos.createdAt)}</>}</div>
                <div className="psp-kv"><span>Entry</span><strong>{formatPrice(entry, pos.symbol)}</strong></div>
                <div className="psp-kv"><span>LTP</span><strong className={profit >= 0 ? 'is-up' : 'is-down'}>{formatPrice(ltp, pos.symbol)}</strong></div>
                <div className="psp-actions">
                  <button type="button" className="psp-btn is-tp" onClick={() => onEditSlTp(pos)} title="Set take profit">
                    <LuTarget size={14} />
                    {pos.takeProfit ? formatPrice(pos.takeProfit, pos.symbol) : 'TP'}
                  </button>
                  <button type="button" className="psp-btn is-sl" onClick={() => onEditSlTp(pos)} title="Set stop loss">
                    <LuShield size={14} />
                    {pos.stopLoss ? formatPrice(pos.stopLoss, pos.symbol) : 'SL'}
                  </button>
                  <button type="button" className="psp-btn is-exit" onClick={() => onExit(pos)} title="Close this position">
                    <LuLogOut size={14} />
                    EXIT
                  </button>
                </div>
              </article>
            );
          }))}

        {tab === 'pending' && (pending.length === 0
          ? <Empty text="No pending orders" />
          : pending.map((o) => {
            const side = String(o.side || 'buy').toLowerCase();
            const trigger = o.triggerPrice || o.price || o.entryPrice || 0;
            return (
              <article key={o.positionId || o._id} className={`psp-card is-${side}`}>
                <div className="psp-row1">
                  <span className={`psp-side is-${side}`}>{side.toUpperCase()}</span>
                  <span className="psp-sym" title={o.symbol}>{o.symbol}</span>
                  <span className="psp-type">{String(o.orderType || 'limit').replace(/_/g, ' ').toUpperCase()}</span>
                </div>
                <div className="psp-meta"><Qty row={o} />{timeOf(o.createdAt) && <> · {timeOf(o.createdAt)}</>}</div>
                <div className="psp-kv"><span>Trigger</span><strong>{formatPrice(trigger, o.symbol)}</strong></div>
                {(o.takeProfit || o.stopLoss) ? (
                  <div className="psp-kv">
                    <span>TP / SL</span>
                    <strong>{o.takeProfit ? formatPrice(o.takeProfit, o.symbol) : '—'} / {o.stopLoss ? formatPrice(o.stopLoss, o.symbol) : '—'}</strong>
                  </div>
                ) : null}
                <div className="psp-actions">
                  <button type="button" className="psp-btn is-exit psp-btn--wide" onClick={() => onCancel(o)} title="Cancel this order">
                    <LuX size={14} />
                    CANCEL ORDER
                  </button>
                </div>
              </article>
            );
          }))}

        {tab === 'closed' && (closed.length === 0
          ? <Empty text="No closed trades yet" />
          : closed.map((t) => {
            const side = String(t.side || 'buy').toLowerCase();
            const profit = Number(t.profit) || 0;
            return (
              <article key={t.tradeId || t._id} className={`psp-card is-${side} is-closed`}>
                <div className="psp-row1">
                  <span className={`psp-side is-${side}`}>{side.toUpperCase()}</span>
                  <span className="psp-sym" title={t.symbol}>{t.symbol}</span>
                  <span className={`psp-pnl ${profit >= 0 ? 'is-up' : 'is-down'}`}>{formatPnL(profit, t.symbol)}</span>
                </div>
                <div className="psp-meta">
                  <Qty row={t} />{timeOf(t.closeTime) && <> · closed {timeOf(t.closeTime)}</>}
                  {t.remark ? <> · {t.remark}</> : null}
                </div>
                <div className="psp-kv"><span>Entry → Exit</span><strong>{formatPrice(t.entryPrice, t.symbol)} → {formatPrice(t.closePrice, t.symbol)}</strong></div>
              </article>
            );
          }))}
      </div>
    </aside>
  );
}

function Empty({ text }) {
  return <div className="psp-empty">{text}</div>;
}
