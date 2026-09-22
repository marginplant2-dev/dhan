import React from 'react';
import InstrumentsPanel from '../InstrumentsPanel/InstrumentsPanel';
import ChartPanel from '../ChartPanel/ChartPanel';
import OrderPanel from '../OrderPanel/OrderPanel';
import OrderBook from '../OrderBook/OrderBook';
import Header from '../Header/Header';
import StatusBar from '../StatusBar/StatusBar';
import useStore from '../../store/useStore';
import './Layout.css';

const Layout = () => {
  const instrumentsPanelOpen = useStore((state) => state.instrumentsPanelOpen);
  const orderPanelOpen = useStore((state) => state.orderPanelOpen);

  return (
    <div className="layout">
      <Header />
      <div className="layout-main">
        {instrumentsPanelOpen && <InstrumentsPanel />}
        <div className="layout-center">
          <ChartPanel />
          <OrderBook />
        </div>
        {orderPanelOpen && <OrderPanel />}
      </div>
      <StatusBar />
    </div>
  );
};

export default Layout;
