import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import useStore from '../../store/useStore';
import './OrderBook.css';

const OrderBook = () => {
  const activeBottomTab = useStore((state) => state.activeBottomTab);
  const setActiveBottomTab = useStore((state) => state.setActiveBottomTab);
  const positions = useStore((state) => state.positions);
  const pendingOrders = useStore((state) => state.pendingOrders);
  const orderHistory = useStore((state) => state.orderHistory);

  const tabs = [
    { id: 'positions', label: 'Positions', count: positions.length },
    { id: 'pending', label: 'Pending', count: pendingOrders.length },
    { id: 'history', label: 'History', count: 40 },
    { id: 'cancelled', label: 'Cancelled', count: 0 },
  ];

  const renderPositionsTable = () => (
    <table className="order-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Symbol</th>
          <th>Side</th>
          <th>Lots</th>
          <th>Entry</th>
          <th>Current</th>
          <th>SL</th>
          <th>TP</th>
          <th>Charges</th>
          <th>Swap</th>
          <th>P/L</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {positions.length === 0 ? (
          <tr>
            <td colSpan="12" className="empty-message">No open positions</td>
          </tr>
        ) : (
          positions.map((pos, idx) => (
            <tr key={idx}>
              <td>{pos.time}</td>
              <td>{pos.symbol}</td>
              <td className={pos.side}>{pos.side}</td>
              <td>{pos.lots}</td>
              <td>{pos.entry}</td>
              <td>{pos.current}</td>
              <td>{pos.sl || '-'}</td>
              <td>{pos.tp || '-'}</td>
              <td>{pos.charges}</td>
              <td>{pos.swap}</td>
              <td className={pos.pnl >= 0 ? 'profit' : 'loss'}>{pos.pnl}</td>
              <td><button className="action-btn"><MoreHorizontal size={14} /></button></td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );

  const renderPendingTable = () => (
    <table className="order-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Symbol</th>
          <th>Type</th>
          <th>Side</th>
          <th>Lots</th>
          <th>Price</th>
          <th>SL</th>
          <th>TP</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {pendingOrders.length === 0 ? (
          <tr>
            <td colSpan="9" className="empty-message">No pending orders</td>
          </tr>
        ) : (
          pendingOrders.map((order, idx) => (
            <tr key={idx}>
              <td>{order.time}</td>
              <td>{order.symbol}</td>
              <td>{order.type}</td>
              <td className={order.side}>{order.side}</td>
              <td>{order.lots}</td>
              <td>{order.price}</td>
              <td>{order.sl || '-'}</td>
              <td>{order.tp || '-'}</td>
              <td><button className="action-btn"><MoreHorizontal size={14} /></button></td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );

  const renderHistoryTable = () => (
    <table className="order-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Symbol</th>
          <th>Side</th>
          <th>Lots</th>
          <th>Entry</th>
          <th>Exit</th>
          <th>P/L</th>
        </tr>
      </thead>
      <tbody>
        {orderHistory.length === 0 ? (
          <tr>
            <td colSpan="7" className="empty-message">No order history</td>
          </tr>
        ) : (
          orderHistory.map((order, idx) => (
            <tr key={idx}>
              <td>{order.time}</td>
              <td>{order.symbol}</td>
              <td className={order.side}>{order.side}</td>
              <td>{order.lots}</td>
              <td>{order.entry}</td>
              <td>{order.exit}</td>
              <td className={order.pnl >= 0 ? 'profit' : 'loss'}>{order.pnl}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );

  return (
    <div className="order-book">
      <div className="order-book-header">
        <div className="order-book-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`order-tab ${activeBottomTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveBottomTab(tab.id)}
            >
              {tab.label}({tab.count})
            </button>
          ))}
        </div>

        <div className="order-book-controls">
          <label className="one-click-toggle">
            <span>One Click</span>
            <input type="checkbox" defaultChecked />
            <span className="toggle-slider"></span>
          </label>
          <button className="quick-sell-btn">S</button>
          <input type="number" className="quick-lot-input" defaultValue="0.01" step="0.01" />
          <button className="quick-buy-btn">B</button>
          <span className="pnl-display">P/L: +$0.00</span>
        </div>
      </div>

      <div className="order-book-content">
        {activeBottomTab === 'positions' && renderPositionsTable()}
        {activeBottomTab === 'pending' && renderPendingTable()}
        {activeBottomTab === 'history' && renderHistoryTable()}
        {activeBottomTab === 'cancelled' && (
          <div className="empty-state">No cancelled orders</div>
        )}
      </div>
    </div>
  );
};

export default OrderBook;
