import React from 'react';
import { Settings, Sun, Moon, Palette } from 'lucide-react';
import useStore from '../../store/useStore';
import './Header.css';

const themes = [
  { id: 'kimbie-dark', name: 'Kimbie Dark', type: 'dark' },
  { id: 'tomorrow-night-blue', name: 'Tomorrow Night Blue', type: 'dark' },
  { id: 'solarized-light', name: 'Solarized Light', type: 'light' },
  { id: 'tokyo-night-light', name: 'Tokyo Night Light', type: 'light' },
];

const Header = () => {
  const theme = useStore((state) => state.theme);
  const setTheme = useStore((state) => state.setTheme);
  const selectedInstrument = useStore((state) => state.selectedInstrument);
  const [showThemeMenu, setShowThemeMenu] = React.useState(false);

  const currentTheme = themes.find(t => t.id === theme);
  const isDark = currentTheme?.type === 'dark';

  return (
    <header className="header" style={{ minHeight: '40px' }}>
      <div className="header-left">
        <div className="header-logo">
          <span className="logo-text">DhanFunded</span>
        </div>
        <div className="header-tabs">
          <div className="header-tab active">
            <span className="tab-symbol">{selectedInstrument.symbol}</span>
          </div>
          <button className="tab-add">+</button>
        </div>
      </div>

      <div className="header-center">
        <span className="header-charts-label">4 Charts</span>
      </div>

      <div className="header-right">
        <div className="theme-selector">
          <button 
            className="theme-btn"
            onClick={() => setShowThemeMenu(!showThemeMenu)}
          >
            {isDark ? <Moon size={18} /> : <Sun size={18} />}
            <Palette size={14} />
          </button>
          {showThemeMenu && (
            <div className="theme-menu">
              <div className="theme-menu-header">Select Theme</div>
              <div className="theme-menu-section">
                <div className="theme-section-label">Dark Themes</div>
                {themes.filter(t => t.type === 'dark').map(t => (
                  <button
                    key={t.id}
                    className={`theme-option ${theme === t.id ? 'active' : ''}`}
                    onClick={() => { setTheme(t.id); setShowThemeMenu(false); }}
                  >
                    <span className={`theme-preview ${t.id}`}></span>
                    {t.name}
                  </button>
                ))}
              </div>
              <div className="theme-menu-section">
                <div className="theme-section-label">Light Themes</div>
                {themes.filter(t => t.type === 'light').map(t => (
                  <button
                    key={t.id}
                    className={`theme-option ${theme === t.id ? 'active' : ''}`}
                    onClick={() => { setTheme(t.id); setShowThemeMenu(false); }}
                  >
                    <span className={`theme-preview ${t.id}`}></span>
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <button className="header-btn">
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
};

export default Header;
