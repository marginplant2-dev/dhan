import React from 'react';
import { Search, X } from 'lucide-react';
import useStore from '../../store/useStore';
import './InstrumentsPanel.css';

const categories = ['All', 'Starred', 'NSE', 'BSE', 'Indices'];

const InstrumentsPanel = () => {
  const instruments = useStore((state) => state.instruments);
  const selectedInstrument = useStore((state) => state.selectedInstrument);
  const setSelectedInstrument = useStore((state) => state.setSelectedInstrument);
  const instrumentFilter = useStore((state) => state.instrumentFilter);
  const setInstrumentFilter = useStore((state) => state.setInstrumentFilter);
  const searchQuery = useStore((state) => state.searchQuery);
  const setSearchQuery = useStore((state) => state.setSearchQuery);
  const setInstrumentsPanelOpen = useStore((state) => state.setInstrumentsPanelOpen);

  const filteredInstruments = instruments.filter(inst => {
    const matchesFilter = instrumentFilter === 'All' || inst.category === instrumentFilter;
    const matchesSearch = inst.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          inst.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="instruments-panel">
      <div className="instruments-header">
        <span className="instruments-title">Instruments</span>
        <button className="close-btn" onClick={() => setInstrumentsPanelOpen(false)}>
          <X size={16} />
        </button>
      </div>

      <div className="instruments-search">
        <Search size={14} className="search-icon" />
        <input
          type="text"
          placeholder="Search instruments"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="instruments-filters">
        {categories.map(cat => (
          <button
            key={cat}
            className={`filter-btn ${instrumentFilter === cat ? 'active' : ''}`}
            onClick={() => setInstrumentFilter(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="instruments-list">
        {filteredInstruments.map(inst => (
          <div
            key={inst.symbol}
            className={`instrument-item ${selectedInstrument.symbol === inst.symbol ? 'selected' : ''}`}
            onClick={() => setSelectedInstrument(inst)}
          >
            <div className="instrument-info">
              <span className="instrument-symbol">{inst.symbol}</span>
              <span className="instrument-change" data-positive={inst.changePercent >= 0}>
                {inst.changePercent >= 0 ? '+' : ''}{inst.changePercent.toFixed(2)}%
              </span>
            </div>
            <div className="instrument-prices">
              <span className="bid-price">
                <span className="price-label">Bid</span>
                <span className="price-value">{inst.bid.toFixed(inst.bid < 10 ? 5 : 2)}</span>
              </span>
              <span className="ask-price">
                <span className="price-label">Ask</span>
                <span className="price-value">{inst.ask.toFixed(inst.ask < 10 ? 5 : 2)}</span>
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="instruments-footer">
        <span>{filteredInstruments.length} instruments</span>
        <span className="live-indicator">● Live</span>
      </div>
    </div>
  );
};

export default InstrumentsPanel;
