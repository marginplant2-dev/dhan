import { useEffect, useRef, useLayoutEffect } from 'react';
import * as am5 from '@amcharts/amcharts5';
import * as am5xy from '@amcharts/amcharts5/xy';
import * as am5stock from '@amcharts/amcharts5/stock';
import am5themes_Dark from '@amcharts/amcharts5/themes/Dark';
import am5themes_Animated from '@amcharts/amcharts5/themes/Animated';

// Candle interval in milliseconds (1 second candles for real-time visibility)
const CANDLE_INTERVAL = 1000;

// Store price history per symbol for building candles
const priceHistoryStore = {};

function AmStockChart({ 
  symbol = 'EURUSD', 
  isDark = true, 
  livePrice = null,
  displayCurrency = 'USD',
  usdInrRate = 83,
  usdMarkup = 0
}) {
  const chartRef = useRef(null);
  const rootRef = useRef(null);
  const seriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const sbSeriesRef = useRef(null);
  const dataRef = useRef([]);
  const lastCandleTimeRef = useRef(null);
  const initializedWithPriceRef = useRef(false);
  const lastSymbolRef = useRef(null);
  
  // Get conversion rate
  const getConversionRate = () => displayCurrency === 'INR' ? (usdInrRate + usdMarkup) : 1;
  
  // Initialize or get price history for symbol
  const getPriceHistory = (sym) => {
    if (!priceHistoryStore[sym]) {
      priceHistoryStore[sym] = [];
    }
    return priceHistoryStore[sym];
  };
  
  // Build initial candles from price history or create empty starting data
  const buildInitialData = (currentPrice) => {
    const now = Date.now();
    const candleTime = Math.floor(now / CANDLE_INTERVAL) * CANDLE_INTERVAL;
    const conversionRate = getConversionRate();
    const price = currentPrice * conversionRate;
    
    // Create initial candle with current price
    const data = [];
    
    // Add historical candles for context (last 60 seconds = 60 candles at 1-sec interval)
    for (let i = 60; i >= 0; i--) {
      const time = candleTime - (i * CANDLE_INTERVAL);
      // Smaller variations for 1-second candles
      const variation = (Math.random() - 0.5) * (price * 0.0002);
      const open = price + variation;
      const close = i === 0 ? price : open + (Math.random() - 0.5) * (price * 0.0001);
      const high = Math.max(open, close) + Math.random() * (price * 0.00005);
      const low = Math.min(open, close) - Math.random() * (price * 0.00005);
      
      data.push({
        Date: time,
        Open: open,
        High: high,
        Low: low,
        Close: close,
        Volume: Math.floor(Math.random() * 1000) + 100
      });
    }
    
    lastCandleTimeRef.current = candleTime;
    return data;
  };

  useLayoutEffect(() => {
    if (!chartRef.current) return;

    // Dispose existing root if any
    if (rootRef.current) {
      rootRef.current.dispose();
      rootRef.current = null;
    }

    // Create root
    const root = am5.Root.new(chartRef.current);
    rootRef.current = root;

    // Set themes
    const themes = [am5themes_Animated.new(root)];
    if (isDark) {
      themes.push(am5themes_Dark.new(root));
    }
    root.setThemes(themes);

    // Create stock chart
    const stockChart = root.container.children.push(
      am5stock.StockChart.new(root, {
        paddingRight: 0
      })
    );

    // Set global number format based on currency
    root.numberFormatter.set("numberFormat", displayCurrency === 'INR' ? "₹#,###.00" : "$#,###.0000");

    // Create main stock panel
    const mainPanel = stockChart.panels.push(
      am5stock.StockPanel.new(root, {
        wheelY: "zoomX",
        panX: true,
        panY: true
      })
    );

    // Create value axis
    const valueAxis = mainPanel.yAxes.push(
      am5xy.ValueAxis.new(root, {
        renderer: am5xy.AxisRendererY.new(root, {
          pan: "zoom"
        }),
        extraMin: 0.1,
        tooltip: am5.Tooltip.new(root, {}),
        numberFormat: displayCurrency === 'INR' ? "₹#,###.00" : "#,###.0000",
        extraTooltipPrecision: 2
      })
    );

    // Create date axis - 1 second interval for real-time
    const dateAxis = mainPanel.xAxes.push(
      am5xy.GaplessDateAxis.new(root, {
        baseInterval: {
          timeUnit: "second",
          count: 1
        },
        renderer: am5xy.AxisRendererX.new(root, {}),
        tooltip: am5.Tooltip.new(root, {})
      })
    );

    // Create candlestick series
    const valueSeries = mainPanel.series.push(
      am5xy.CandlestickSeries.new(root, {
        name: symbol,
        clustered: false,
        valueXField: "Date",
        valueYField: "Close",
        highValueYField: "High",
        lowValueYField: "Low",
        openValueYField: "Open",
        calculateAggregates: true,
        xAxis: dateAxis,
        yAxis: valueAxis,
        legendValueText: displayCurrency === 'INR' 
          ? "O: ₹{openValueY} H: ₹{highValueY} L: ₹{lowValueY} C: ₹{valueY}"
          : "O: {openValueY} H: {highValueY} L: {lowValueY} C: {valueY}"
      })
    );

    // Set colors
    valueSeries.columns.template.setAll({
      strokeWidth: 1
    });

    valueSeries.columns.template.adapters.add("fill", (fill, target) => {
      const dataItem = target.dataItem;
      if (dataItem) {
        const open = dataItem.get("openValueY");
        const close = dataItem.get("valueY");
        return close >= open ? am5.color(0x26a69a) : am5.color(0xef5350);
      }
      return fill;
    });

    valueSeries.columns.template.adapters.add("stroke", (stroke, target) => {
      const dataItem = target.dataItem;
      if (dataItem) {
        const open = dataItem.get("openValueY");
        const close = dataItem.get("valueY");
        return close >= open ? am5.color(0x26a69a) : am5.color(0xef5350);
      }
      return stroke;
    });

    seriesRef.current = valueSeries;

    // Add cursor
    mainPanel.set("cursor", am5xy.XYCursor.new(root, {
      yAxis: valueAxis,
      xAxis: dateAxis,
      snapToSeries: [valueSeries],
      snapToSeriesBy: "y!"
    }));

    // Add scrollbar
    const scrollbar = mainPanel.set("scrollbarX", am5xy.XYChartScrollbar.new(root, {
      orientation: "horizontal",
      height: 50
    }));
    stockChart.toolsContainer.children.push(scrollbar);

    // Add scrollbar series
    const sbDateAxis = scrollbar.chart.xAxes.push(
      am5xy.GaplessDateAxis.new(root, {
        baseInterval: { timeUnit: "second", count: 1 },
        renderer: am5xy.AxisRendererX.new(root, {})
      })
    );

    const sbValueAxis = scrollbar.chart.yAxes.push(
      am5xy.ValueAxis.new(root, {
        renderer: am5xy.AxisRendererY.new(root, {})
      })
    );

    const sbSeries = scrollbar.chart.series.push(
      am5xy.LineSeries.new(root, {
        valueYField: "Close",
        valueXField: "Date",
        xAxis: sbDateAxis,
        yAxis: sbValueAxis
      })
    );

    sbSeries.fills.template.setAll({
      visible: true,
      fillOpacity: 0.3
    });

    // Create volume panel
    const volumePanel = stockChart.panels.push(
      am5stock.StockPanel.new(root, {
        wheelY: "zoomX",
        panX: true,
        panY: true,
        height: am5.percent(30)
      })
    );

    volumePanel.panelControls.closeButton.set("forceHidden", true);

    const volumeValueAxis = volumePanel.yAxes.push(
      am5xy.ValueAxis.new(root, {
        renderer: am5xy.AxisRendererY.new(root, {}),
        numberFormat: "#.0a"
      })
    );

    const volumeDateAxis = volumePanel.xAxes.push(
      am5xy.GaplessDateAxis.new(root, {
        baseInterval: { timeUnit: "second", count: 1 },
        renderer: am5xy.AxisRendererX.new(root, {})
      })
    );

    const volumeSeries = volumePanel.series.push(
      am5xy.ColumnSeries.new(root, {
        name: "Volume",
        clustered: false,
        valueXField: "Date",
        valueYField: "Volume",
        xAxis: volumeDateAxis,
        yAxis: volumeValueAxis
      })
    );

    volumeSeries.columns.template.setAll({
      strokeOpacity: 0,
      fillOpacity: 0.5
    });

    volumeSeries.columns.template.adapters.add("fill", (fill, target) => {
      const dataItem = target.dataItem;
      if (dataItem) {
        const dataContext = dataItem.dataContext;
        return dataContext.Close >= dataContext.Open ? am5.color(0x26a69a) : am5.color(0xef5350);
      }
      return fill;
    });

    // Store refs for live updates
    volumeSeriesRef.current = volumeSeries;
    sbSeriesRef.current = sbSeries;
    
    // Initialize with current live price - use actual price from feed
    const initialPrice = livePrice?.bid || livePrice?.ask || 100;
    
    console.log('[AmStockChart] Initializing with price:', initialPrice, 'livePrice:', livePrice);
    
    // Always build initial data - use price or fallback
    const data = buildInitialData(initialPrice);
    initializedWithPriceRef.current = true;
    dataRef.current = data;
    lastSymbolRef.current = symbol;
    
    console.log('[AmStockChart] Built data with', data.length, 'candles, first:', data[0], 'last:', data[data.length-1]);

    valueSeries.data.setAll(data);
    sbSeries.data.setAll(data);
    volumeSeries.data.setAll(data);

    // Add stock toolbar
    const toolbar = am5stock.StockToolbar.new(root, {
      container: document.getElementById("chartcontrols") || chartRef.current,
      stockChart: stockChart,
      controls: [
        am5stock.IndicatorControl.new(root, {
          stockChart: stockChart,
          legend: mainPanel.children.push(am5stock.StockLegend.new(root, {
            stockChart: stockChart
          }))
        }),
        am5stock.DateRangeSelector.new(root, {
          stockChart: stockChart
        }),
        am5stock.PeriodSelector.new(root, {
          stockChart: stockChart,
          periods: [
            { timeUnit: "minute", count: 15, name: "15m" },
            { timeUnit: "hour", count: 1, name: "1H" },
            { timeUnit: "hour", count: 4, name: "4H" },
            { timeUnit: "day", count: 1, name: "1D" },
            { timeUnit: "week", count: 1, name: "1W" },
            { timeUnit: "month", count: 1, name: "1M" },
            { timeUnit: "max", name: "Max" }
          ]
        }),
        am5stock.DrawingControl.new(root, {
          stockChart: stockChart
        }),
        am5stock.ResetControl.new(root, {
          stockChart: stockChart
        }),
        am5stock.SettingsControl.new(root, {
          stockChart: stockChart
        })
      ]
    });

    // Make stuff animate on load
    valueSeries.appear(1000);
    stockChart.appear(1000, 100);

    return () => {
      if (root) {
        root.dispose();
      }
      rootRef.current = null;
      seriesRef.current = null;
      initializedWithPriceRef.current = false;
    };
  }, [symbol, isDark, displayCurrency, usdInrRate, usdMarkup]);

  // Update chart with live price feed
  useEffect(() => {
    if (!seriesRef.current || !livePrice) return;
    
    const price = (livePrice.bid || livePrice.ask);
    if (!price || price <= 0) return;
    
    const conversionRate = getConversionRate();
    const convertedPrice = price * conversionRate;
    const now = Date.now();
    const currentCandleTime = Math.floor(now / CANDLE_INTERVAL) * CANDLE_INTERVAL;
    
    const series = seriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const sbSeries = sbSeriesRef.current;
    let data = dataRef.current;
    
    // If chart was initialized without data (no price available), initialize now with actual price
    if (data.length === 0 && !initializedWithPriceRef.current) {
      data = buildInitialData(price);
      dataRef.current = data;
      initializedWithPriceRef.current = true;
      
      // Set data to all series
      series.data.setAll(data);
      if (volumeSeries) volumeSeries.data.setAll(data);
      if (sbSeries) sbSeries.data.setAll(data);
      return;
    }
    
    if (data.length === 0) return;
    
    // Check if we need to create a new candle
    if (lastCandleTimeRef.current && currentCandleTime > lastCandleTimeRef.current) {
      // Create new candle
      const newCandle = {
        Date: currentCandleTime,
        Open: convertedPrice,
        High: convertedPrice,
        Low: convertedPrice,
        Close: convertedPrice,
        Volume: Math.floor(Math.random() * 5000) + 500
      };
      
      data.push(newCandle);
      dataRef.current = data;
      lastCandleTimeRef.current = currentCandleTime;
      
      // Update all series
      series.data.push(newCandle);
      if (volumeSeries) volumeSeries.data.push(newCandle);
      if (sbSeries) sbSeries.data.push(newCandle);
      
      // Remove old candles to prevent memory issues (keep last 200)
      if (data.length > 200) {
        data.shift();
        series.data.removeIndex(0);
        if (volumeSeries) volumeSeries.data.removeIndex(0);
        if (sbSeries) sbSeries.data.removeIndex(0);
      }
    } else {
      // Update current candle with new price
      const lastIndex = data.length - 1;
      const lastCandle = data[lastIndex];
      
      if (lastCandle) {
        const updatedCandle = {
          ...lastCandle,
          Close: convertedPrice,
          High: Math.max(lastCandle.High, convertedPrice),
          Low: Math.min(lastCandle.Low, convertedPrice),
          Volume: lastCandle.Volume + Math.floor(Math.random() * 100)
        };
        
        data[lastIndex] = updatedCandle;
        
        // Update series data
        series.data.setIndex(lastIndex, updatedCandle);
        if (volumeSeries) volumeSeries.data.setIndex(lastIndex, updatedCandle);
        if (sbSeries) sbSeries.data.setIndex(lastIndex, updatedCandle);
      }
    }
  }, [livePrice, displayCurrency, usdInrRate, usdMarkup]);

  return (
    <div 
      ref={chartRef} 
      style={{ 
        width: '100%', 
        height: '100%',
        background: isDark ? '#000000' : '#ffffff'
      }} 
    />
  );
}

export default AmStockChart;
