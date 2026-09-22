export const formatINR = (n, opts = {}) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2, ...opts })}`;

export const formatINRNoSymbol = (n, opts = {}) =>
  `${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2, ...opts })}`;
