import React from 'react';
import useStore from '../../store/useStore';
import './StatusBar.css';

const StatusBar = () => {
  const selectedInstrument = useStore((state) => state.selectedInstrument);
  const balance = useStore((state) => state.balance);
  const credit = useStore((state) => state.credit);
  const equity = useStore((state) => state.equity);
  const margin = useStore((state) => state.margin);
  const freeMargin = useStore((state) => state.freeMargin);

  return (
    <div className="status-bar">
      <div className="status-left">
        <span className="status-symbol">{selectedInstrument.symbol}</span>
        <span className="status-item">
          <span className="status-label">Bal:</span>
          <span className="status-value">₹{balance.toFixed(2)}</span>
        </span>
        <span className="status-item">
          <span className="status-label">Credit:</span>
          <span className="status-value">₹{credit.toFixed(2)}</span>
        </span>
        <span className="status-item">
          <span className="status-label">Eq:</span>
          <span className="status-value">₹{equity.toFixed(2)}</span>
        </span>
        <span className="status-item">
          <span className="status-label">Margin:</span>
          <span className="status-value">₹{margin.toFixed(2)}</span>
        </span>
        <span className="status-item">
          <span className="status-label">Free:</span>
          <span className="status-value">₹{freeMargin.toFixed(2)}</span>
        </span>
      </div>
      <div className="status-right">
        <span className="status-connection">Standard - 57872193</span>
        <span className="status-live">● Live</span>
      </div>
    </div>
  );
};

export default StatusBar;
