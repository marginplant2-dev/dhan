import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries } from 'lightweight-charts';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/** UI interval key → MetaApi market-data timeframe */
const META_TIMEFRAME = {
  minute: '1m',
  '5minute': '5m',
  '15minute': '15m',
  '60minute': '1h',
  day: '1d'
};

/** UI interval → Delta resolution + lookback (seconds) */
const DELTA_RESOLUTION = {
  minute: '1m',
  '5minute': '5m',
  '15minute': '15m',
  '60minute': '1h',
  day: '1d'
};
const DELTA_LOOKBACK_SEC = {
  minute: 172800,
  '5minute': 604800,
  '15minute': 1209600,
  '60minute': 2592000,
  day: 31536000
};

const IndianChart = ({
  symbol,
  isDark,
  selectedInstrument,
  dataSource = 'zerodha',
  formatLivePrice
}) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const currentCandleRef = useRef(null); // Track current candle for live updates
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [interval, setInterval] = useState('minute');

  // Get interval duration in seconds
  const getIntervalSeconds = (int) => {
    switch (int) {
      case 'minute': return 60;
      case '5minute': return 300;
      case '15minute': return 900;
      case '60minute': return 3600;
      case 'day': return 86400;
      default: return 60;
    }
  };

  // Round timestamp to interval boundary
  const roundToInterval = (timestamp, int) => {
    const seconds = getIntervalSeconds(int);
    return Math.floor(timestamp / seconds) * seconds;
  };

  const fetchHistoricalData = async () => {
    setLoading(true);
    setError(null);
    try {
      let url;
      if (dataSource === 'zerodha') {
        url = `${API_URL}/api/zerodha/historical/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}`;
      } else if (dataSource === 'metaapi') {
        const tf = META_TIMEFRAME[interval] || '1h';
        url = `${API_URL}/api/metaapi/historical/${encodeURIComponent(symbol)}?timeframe=${encodeURIComponent(tf)}&limit=500`;
      } else if (dataSource === 'delta') {
        const res = DELTA_RESOLUTION[interval] || '5m';
        const lb = DELTA_LOOKBACK_SEC[interval] || 604800;
        url = `${API_URL}/api/delta/history/${encodeURIComponent(symbol)}?resolution=${encodeURIComponent(res)}&lookbackSec=${lb}`;
      } else {
        setLoading(false);
        return null;
      }

      const response = await fetch(url);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const msg = data.error || data.message || `HTTP ${response.status}`;
        setError(typeof msg === 'string' ? msg : 'Failed to load chart data');
        return null;
      }

      if (data.success && Array.isArray(data.candles)) {
        if (data.candles.length > 0) return data.candles;
        setError('No candle data for this range');
        return null;
      }

      setError(data.error || 'Failed to load chart data');
      return null;
    } catch (err) {
      console.error('Error fetching historical data:', err);
      setError('Failed to load chart data');
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart - match TradingView dark theme exactly
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#000000' : '#ffffff' },
        textColor: isDark ? '#787b86' : '#374151',
      },
      grid: {
        vertLines: { color: isDark ? '#1e222d' : '#e5e7eb' },
        horzLines: { color: isDark ? '#1e222d' : '#e5e7eb' },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: isDark ? '#1e222d' : '#e5e7eb',
      },
      rightPriceScale: {
        borderColor: isDark ? '#1e222d' : '#e5e7eb',
      },
      crosshair: {
        mode: 1,
      },
    });

    // Add candlestick series (v4+ API)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    // Add volume series (v4+ API)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#6366f1',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
    });
    
    // Set scale margins for volume
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [isDark]);

  // Load data when symbol or interval changes
  useEffect(() => {
    const loadData = async () => {
      const candles = await fetchHistoricalData();
      
      if (candles && candles.length > 0 && candleSeriesRef.current && volumeSeriesRef.current) {
        candleSeriesRef.current.setData(candles);
        
        // Initialize current candle reference with the last candle
        const lastCandle = candles[candles.length - 1];
        currentCandleRef.current = { ...lastCandle };
        
        // Set volume data
        const volumeData = candles.map(c => ({
          time: c.time,
          value: c.volume || 0,
          color: c.close >= c.open ? '#22c55e80' : '#ef444480',
        }));
        volumeSeriesRef.current.setData(volumeData);
        
        // Fit content
        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }
      }
    };

    // Reset current candle when interval changes
    currentCandleRef.current = null;
    
    if (chartRef.current) {
      loadData();
    }
  }, [symbol, interval, dataSource]);

  useEffect(() => {
    if (!candleSeriesRef.current || !selectedInstrument) return;

    // Use mid of spread-adjusted bid/ask for chart consistency with order panel prices
    const sBid = selectedInstrument.bid || 0;
    const sAsk = selectedInstrument.ask || 0;
    const lastPrice = (sBid > 0 && sAsk > 0)
      ? (sBid + sAsk) / 2
      : selectedInstrument.last_price ||
        selectedInstrument.last ||
        selectedInstrument.mark_price ||
        sBid || sAsk ||
        selectedInstrument.close;
    if (!lastPrice || lastPrice <= 0) return;

    const now = Math.floor(Date.now() / 1000);
    const candleTime = roundToInterval(now, interval);
    
    // Check if we're still in the same candle period
    if (currentCandleRef.current && currentCandleRef.current.time === candleTime) {
      // Update existing candle - adjust high/low/close
      const candle = currentCandleRef.current;
      candle.high = Math.max(candle.high, lastPrice);
      candle.low = Math.min(candle.low, lastPrice);
      candle.close = lastPrice;
      
      candleSeriesRef.current.update(candle);
    } else {
      // New candle period - create new candle
      const newCandle = {
        time: candleTime,
        open: lastPrice,
        high: lastPrice,
        low: lastPrice,
        close: lastPrice,
      };
      currentCandleRef.current = newCandle;
      candleSeriesRef.current.update(newCandle);
    }
  }, [
    selectedInstrument?.last_price,
    selectedInstrument?.last,
    selectedInstrument?.mark_price,
    selectedInstrument?.bid,
    selectedInstrument?.ask,
    interval,
    dataSource
  ]);

  return (
    <div 
      style={{ position: 'relative', width: '100%', height: '100%', background: isDark ? '#000000' : '#ffffff' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Interval selector */}
      <div style={{ 
        position: 'absolute', 
        top: '10px', 
        left: '10px', 
        zIndex: 10, 
        display: 'flex', 
        gap: '4px',
        background: isDark ? '#1e222d' : '#f3f4f6',
        padding: '4px',
        borderRadius: '6px'
      }}>
        {['minute', '5minute', '15minute', '60minute', 'day'].map(int => (
          <button
            key={int}
            onClick={() => setInterval(int)}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              background: interval === int ? '#6366f1' : 'transparent',
              color: interval === int ? '#fff' : (isDark ? '#d1d5db' : '#374151'),
            }}
          >
            {int === 'minute' ? '1m' : int === '5minute' ? '5m' : int === '15minute' ? '15m' : int === '60minute' ? '1H' : '1D'}
          </button>
        ))}
      </div>

      {/* Symbol info - positioned to not overlap with Y-axis price scale */}
      <div style={{ 
        position: 'absolute', 
        top: '10px', 
        right: '80px', 
        zIndex: 10,
        textAlign: 'right',
        color: isDark ? '#d1d5db' : '#374151',
        background: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)',
        padding: '6px 10px',
        borderRadius: '6px'
      }}>
        <div style={{ fontSize: '13px', fontWeight: 'bold' }}>{symbol}</div>
        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#6366f1' }}>
          {(() => {
            const b = selectedInstrument?.bid ?? 0;
            const a = selectedInstrument?.ask ?? 0;
            const mid = (b > 0 && a > 0) ? (b + a) / 2 : b || a;
            if (formatLivePrice) return formatLivePrice(mid);
            if (dataSource === 'zerodha') return `₹${mid.toFixed(2)}`;
            return mid.toFixed(mid > 0 && mid < 10 ? 5 : 2);
          })()}
        </div>
        <div style={{ 
          fontSize: '11px', 
          color: (selectedInstrument?.change || 0) >= 0 ? '#22c55e' : '#ef4444' 
        }}>
          {(selectedInstrument?.change || 0) >= 0 ? '▲' : '▼'} {Math.abs(selectedInstrument?.change || 0).toFixed(2)}%
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 5,
          color: isDark ? '#d1d5db' : '#374151',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px'
        }}>
          <div style={{ 
            width: '32px', 
            height: '32px', 
            border: '3px solid #6366f1', 
            borderTopColor: 'transparent', 
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <span>Loading chart...</span>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 5,
          color: '#ef4444',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</div>
          <div>{error}</div>
          <div style={{ fontSize: '12px', marginTop: '8px', color: isDark ? '#9ca3af' : '#6b7280' }}>
            {dataSource === 'zerodha' && 'Make sure the instrument is subscribed in Zerodha'}
            {dataSource === 'metaapi' && 'Check MetaApi credentials, market-data URL, and symbol'}
            {dataSource === 'delta' && 'Check Delta symbol and /api/delta/history response'}
          </div>
        </div>
      )}

      {/* Chart container */}
      <div 
        ref={chartContainerRef} 
        style={{ width: '100%', height: '100%' }}
      />

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default IndianChart;
