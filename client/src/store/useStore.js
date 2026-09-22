import { create } from 'zustand';

const useStore = create((set, get) => ({
  // Theme — light is the only mode now. setTheme/initTheme are kept so existing
  // call-sites still compile, but they always force 'light' regardless of input
  // or any value previously persisted in localStorage.
  theme: 'light',
  setTheme: () => {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('dhanfunded-theme', 'light');
    set({ theme: 'light' });
  },
  initTheme: () => {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('dhanfunded-theme', 'light');
    set({ theme: 'light' });
  },

  // Selected Instrument (no mock prices - will be populated from live feed)
  selectedInstrument: {
    symbol: 'XAUUSD',
    name: 'Gold',
    bid: 0,
    ask: 0,
    change: 0,
    changePercent: 0,
    category: 'commodity'
  },
  setSelectedInstrument: (instrument) => set({ selectedInstrument: instrument }),

  // Instruments List (only symbols available from broker)
  instruments: [
    { symbol: 'XAUUSD', name: 'Gold', category: 'commodity' },
    { symbol: 'XAGUSD', name: 'Silver', category: 'commodity' },
    { symbol: 'BTCUSD', name: 'Bitcoin', category: 'Crypto Perpetual' },
    { symbol: 'ETHUSD', name: 'Ethereum', category: 'Crypto Perpetual' },
    { symbol: 'EURUSD', name: 'Euro/USD', category: 'forex' },
    { symbol: 'GBPUSD', name: 'GBP/USD', category: 'forex' },
    { symbol: 'USDJPY', name: 'USD/JPY', category: 'forex' },
    { symbol: 'US30', name: 'Dow Jones', category: 'indices' },
  ],
  updateInstrumentPrice: (symbol, bid, ask) => {
    set((state) => ({
      instruments: state.instruments.map((inst) =>
        inst.symbol === symbol ? { ...inst, bid, ask } : inst
      ),
      selectedInstrument: state.selectedInstrument.symbol === symbol
        ? { ...state.selectedInstrument, bid, ask }
        : state.selectedInstrument
    }));
  },

  // Order Form State
  orderType: 'market', // 'market' or 'pending'
  orderSide: 'buy', // 'buy' or 'sell'
  volume: 0.01,
  leverage: '1:100',
  takeProfit: null,
  stopLoss: null,
  setOrderType: (type) => set({ orderType: type }),
  setOrderSide: (side) => set({ orderSide: side }),
  setVolume: (vol) => set({ volume: vol }),
  setLeverage: (lev) => set({ leverage: lev }),
  setTakeProfit: (tp) => set({ takeProfit: tp }),
  setStopLoss: (sl) => set({ stopLoss: sl }),

  // Positions & Orders
  positions: [],
  pendingOrders: [],
  orderHistory: [],
  addPosition: (position) => set((state) => ({ positions: [...state.positions, position] })),
  removePosition: (id) => set((state) => ({ positions: state.positions.filter((p) => p.id !== id) })),
  addPendingOrder: (order) => set((state) => ({ pendingOrders: [...state.pendingOrders, order] })),
  removePendingOrder: (id) => set((state) => ({ pendingOrders: state.pendingOrders.filter((o) => o.id !== id) })),
  addToHistory: (order) => set((state) => ({ orderHistory: [...state.orderHistory, order] })),

  // Account
  balance: 5917.20,
  credit: 0.00,
  equity: 5917.20,
  margin: 0.00,
  freeMargin: 5917.20,

  // UI State
  instrumentsPanelOpen: true,
  orderPanelOpen: true,
  activeBottomTab: 'positions',
  setInstrumentsPanelOpen: (open) => set({ instrumentsPanelOpen: open }),
  setOrderPanelOpen: (open) => set({ orderPanelOpen: open }),
  setActiveBottomTab: (tab) => set({ activeBottomTab: tab }),

  // Instrument Filter
  instrumentFilter: 'All',
  setInstrumentFilter: (filter) => set({ instrumentFilter: filter }),
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
}));

export default useStore;
