import React, { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';
import { 
  TrendingUp, 
  Crosshair, 
  PenTool, 
  Type, 
  Ruler, 
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2
} from 'lucide-react';
import useStore from '../../store/useStore';
import './ChartPanel.css';

const timeframes = ['1m', '30m', '1h', '5m', '15m', '4h', '1D', '1W'];

const ChartPanel = () => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const selectedInstrument = useStore((state) => state.selectedInstrument);
  const theme = useStore((state) => state.theme);
  const [activeTimeframe, setActiveTimeframe] = React.useState('5m');

  const getThemeColors = () => {
    const isDark = theme === 'kimbie-dark' || theme === 'tomorrow-night-blue';
    
    const colors = {
      'kimbie-dark': {
        background: '#221a0f',
        textColor: '#d3af86',
        gridColor: '#362712',
        upColor: '#889b4a',
        downColor: '#dc3958',
        borderUpColor: '#889b4a',
        borderDownColor: '#dc3958',
        wickUpColor: '#889b4a',
        wickDownColor: '#dc3958',
      },
      'tomorrow-night-blue': {
        background: '#002451',
        textColor: '#ffffff',
        gridColor: '#003366',
        upColor: '#99cc99',
        downColor: '#ff9da4',
        borderUpColor: '#99cc99',
        borderDownColor: '#ff9da4',
        wickUpColor: '#99cc99',
        wickDownColor: '#ff9da4',
      },
      'solarized-light': {
        background: '#fdf6e3',
        textColor: '#073642',
        gridColor: '#eee8d5',
        upColor: '#859900',
        downColor: '#dc322f',
        borderUpColor: '#859900',
        borderDownColor: '#dc322f',
        wickUpColor: '#859900',
        wickDownColor: '#dc322f',
      },
      'tokyo-night-light': {
        background: '#d5d6db',
        textColor: '#343b58',
        gridColor: '#cbccd1',
        upColor: '#485e30',
        downColor: '#8c4351',
        borderUpColor: '#485e30',
        borderDownColor: '#8c4351',
        wickUpColor: '#485e30',
        wickDownColor: '#8c4351',
      },
    };
    
    return colors[theme] || colors['tomorrow-night-blue'];
  };

  const generateCandleData = () => {
    const data = [];
    let basePrice = selectedInstrument.bid;
    const now = Math.floor(Date.now() / 1000);
    
    for (let i = 200; i >= 0; i--) {
      const time = now - i * 300;
      const volatility = basePrice * 0.002;
      const open = basePrice + (Math.random() - 0.5) * volatility;
      const close = open + (Math.random() - 0.5) * volatility;
      const high = Math.max(open, close) + Math.random() * volatility * 0.5;
      const low = Math.min(open, close) - Math.random() * volatility * 0.5;
      
      data.push({ time, open, high, low, close });
      basePrice = close;
    }
    return data;
  };

  const generateVolumeData = (candleData) => {
    return candleData.map(candle => ({
      time: candle.time,
      value: Math.random() * 10000 + 1000,
      color: candle.close >= candle.open 
        ? getThemeColors().upColor + '80' 
        : getThemeColors().downColor + '80'
    }));
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const colors = getThemeColors();

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const containerWidth = chartContainerRef.current.clientWidth || 800;
    const containerHeight = chartContainerRef.current.clientHeight || 400;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: 'solid', color: colors.background },
        textColor: colors.textColor,
      },
      grid: {
        vertLines: { color: colors.gridColor },
        horzLines: { color: colors.gridColor },
      },
      width: containerWidth,
      height: containerHeight,
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: colors.gridColor,
      },
      timeScale: {
        borderColor: colors.gridColor,
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: colors.upColor,
      downColor: colors.downColor,
      borderUpColor: colors.borderUpColor,
      borderDownColor: colors.borderDownColor,
      wickUpColor: colors.wickUpColor,
      wickDownColor: colors.wickDownColor,
    });

    candleSeriesRef.current = candleSeries;

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    volumeSeriesRef.current = volumeSeries;

    const candleData = generateCandleData();
    const volumeData = generateVolumeData(candleData);

    candleSeries.setData(candleData);
    volumeSeries.setData(volumeData);

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth || 800,
          height: chartContainerRef.current.clientHeight || 400,
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
  }, [theme, selectedInstrument.symbol]);

  const colors = getThemeColors();
  const priceChange = selectedInstrument.change;
  const priceChangePercent = selectedInstrument.changePercent;
  const isPositive = priceChange >= 0;

  return (
    <div className="chart-panel" onContextMenu={(e) => e.preventDefault()}>
      <div className="chart-toolbar">
        <div className="chart-toolbar-left">
          <div className="chart-symbol-info">
            <span className="chart-symbol">● {selectedInstrument.name}</span>
            <span className="chart-ohlc">
              O<span className="ohlc-value">{selectedInstrument.bid.toFixed(3)}</span>
              H<span className="ohlc-value">{(selectedInstrument.bid * 1.001).toFixed(3)}</span>
              L<span className="ohlc-value">{(selectedInstrument.bid * 0.999).toFixed(3)}</span>
              C<span className="ohlc-value">{selectedInstrument.ask.toFixed(3)}</span>
              <span className={`ohlc-change ${isPositive ? 'positive' : 'negative'}`}>
                {isPositive ? '+' : ''}{priceChange.toFixed(3)} ({isPositive ? '+' : ''}{priceChangePercent.toFixed(2)}%)
              </span>
            </span>
          </div>
        </div>

        <div className="chart-toolbar-center">
          <div className="timeframe-selector">
            {timeframes.map(tf => (
              <button
                key={tf}
                className={`timeframe-btn ${activeTimeframe === tf ? 'active' : ''}`}
                onClick={() => setActiveTimeframe(tf)}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        <div className="chart-toolbar-right">
          <button className="chart-tool-btn">Indicators</button>
        </div>
      </div>

      <div className="chart-container">
        <div className="chart-tools-sidebar">
          <button className="tool-btn"><Crosshair size={16} /></button>
          <button className="tool-btn"><TrendingUp size={16} /></button>
          <button className="tool-btn"><PenTool size={16} /></button>
          <button className="tool-btn"><Type size={16} /></button>
          <button className="tool-btn"><Ruler size={16} /></button>
          <div className="tool-divider"></div>
          <button className="tool-btn"><ZoomIn size={16} /></button>
          <button className="tool-btn"><ZoomOut size={16} /></button>
          <button className="tool-btn"><Maximize2 size={16} /></button>
          <div className="tool-divider"></div>
          <button className="tool-btn"><Trash2 size={16} /></button>
        </div>
        <div className="chart-area" ref={chartContainerRef}>
          <div className="chart-watermark">TV</div>
        </div>
        <div className="chart-price-line">
          <span 
            className="current-price-tag"
            style={{ backgroundColor: isPositive ? colors.upColor : colors.downColor }}
          >
            {selectedInstrument.bid.toFixed(selectedInstrument.bid < 100 ? 5 : 3)}
          </span>
        </div>
      </div>

      <div className="chart-footer">
        <div className="chart-timeframes-quick">
          <button className="quick-tf">1D</button>
          <button className="quick-tf">5D</button>
          <button className="quick-tf">1M</button>
          <button className="quick-tf">3M</button>
          <button className="quick-tf">6M</button>
          <button className="quick-tf">YTD</button>
          <button className="quick-tf">1Y</button>
          <button className="quick-tf">5Y</button>
          <button className="quick-tf">All</button>
        </div>
        <div className="chart-time-display">
          {new Date().toLocaleTimeString('en-US', { hour12: false, timeZone: 'Asia/Kolkata' })} IST
        </div>
      </div>
    </div>
  );
};

export default ChartPanel;
