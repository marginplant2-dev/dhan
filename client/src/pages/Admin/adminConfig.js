// Admin Configuration - Shared across all admin pages
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

// Icon component names — resolved in AdminLayout.jsx via ADMIN_ICON_MAP.
// We store string keys here (not JSX) so this file stays a plain .js module
// with no React dependency.
export const sidebarMenu = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', path: '/admin' },
  // Prop Evaluation is this platform's flagship section — pulled up right under
  // Dashboard so it stays visible in the primary nav.
  { id: 'prop-trading', label: 'Prop Evaluation', icon: 'trophy', path: '/admin/prop-trading' },
  { id: 'top-traders', label: 'Top Traders', icon: 'trophy', path: '/admin/top-traders' },
  { id: 'user-management', label: 'User Management', icon: 'users', path: '/admin/users' },
  { id: 'trade-management', label: 'Position Management', icon: 'trades', path: '/admin/trades' },
  { id: 'bank-fund-management', label: 'Bank & Fund Management', icon: 'bank', path: '/admin/funds' },
  { id: 'risk-management', label: 'Risk Management', icon: 'shield', path: '/admin/risk-management' },
  { id: 'netting-segment-management', label: 'Netting Segments', icon: 'netting', path: '/admin/netting-segments' },
  { id: 'ib-management', label: 'IB & Coupons', icon: 'users', path: '/admin/ib' },
  { id: 'zerodha-connect', label: 'Zerodha Connect', icon: 'radio', path: '/admin/zerodha' },
  { id: 'reports', label: 'Reports & Analytics', icon: 'reports', path: '/admin/reports' },
  { id: 'activity-logs', label: 'Activity Logs', icon: 'activity', path: '/admin/activity-logs' },
  { id: 'notifications', label: 'Notifications', icon: 'bell', path: '/admin/notifications' },
  { id: 'content-management', label: 'Content (FAQ / Blog)', icon: 'reports', path: '/admin/content' },
  
  { id: 'settings', label: 'Settings', icon: 'settings', path: '/admin/settings' }
];

// Sub-tabs for each main section
export const sectionTabs = {
  'user-management': [
    { id: 'all-users', label: 'All Users', path: '' },
    { id: 'active-users', label: 'Active Users', path: 'active' },
    { id: 'blocked-users', label: 'Blocked Users', path: 'blocked' },
    { id: 'kyc-management', label: 'KYC Verification', path: 'kyc' },
    { id: 'user-logs', label: 'Activity Logs', path: 'logs' }
  ],
  'trade-management': [
    { id: 'combined', label: 'Combined Positions', path: '' },
    { id: 'open-positions', label: 'Open Positions', path: 'open' },
    { id: 'closed-positions', label: 'Closed Positions', path: 'closed' },
    { id: 'pending-orders', label: 'Pending Orders', path: 'pending' },
    { id: 'trade-history', label: 'Activity History', path: 'history' },
    { id: 'edited-trades', label: 'Edited Positions', path: 'edited' }
  ],
  'bank-fund-management': [
    // The platform only takes money for evaluations and paid resets, so these
    // are the only two queues an admin works. The deposit / withdrawal / bank /
    // UPI / crypto / history panels still exist at their URLs, just unlisted.
    { id: 'challenge-buys', label: 'Challenge Buys', path: '' },
    { id: 'challenge-resets', label: 'Challenge Resets', path: 'challenge-resets' },
    { id: 'ai-subscriptions', label: 'AI Subscriptions', path: 'ai-subscriptions' }
  ],
  'netting-segment-management': [
    { id: 'netting-settings', label: 'Segment Settings', path: '' },
    { id: 'netting-scripts', label: 'Script Settings', path: 'scripts' },
    { id: 'netting-user-settings', label: 'User Settings', path: 'users' },
    { id: 'netting-copy-settings', label: 'Copy Settings', path: 'copy' }
  ],
  'reports': [
    { id: 'financial-reports', label: 'Financial Reports', path: '' },
    { id: 'user-reports', label: 'User Reports', path: 'users' },
    { id: 'trade-reports', label: 'Position Reports', path: 'trades' },
    { id: 'commission-reports', label: 'Commission Reports', path: 'commissions' }
  ],
  'notifications': [
    { id: 'push-notifications', label: 'Push Notifications', path: '' },
    { id: 'email-templates', label: 'Email Templates', path: 'email' }
  ],
  'ib-management': [
    { id: 'applications', label: 'Applications', path: '' },
    { id: 'active', label: 'Active IBs', path: 'active' },
    { id: 'coupons', label: 'Coupons', path: 'coupons' },
    { id: 'redemptions', label: 'Redemptions', path: 'redemptions' },
    { id: 'withdrawals', label: 'Withdrawals', path: 'withdrawals' },
    { id: 'commissions', label: 'Commissions', path: 'commissions' },
    { id: 'settings', label: 'Settings', path: 'settings' }
  ],
  'settings': [
    { id: 'general-settings', label: 'General', path: '' },
    { id: 'admin-account', label: 'My account', path: 'account' }
  ]
};
