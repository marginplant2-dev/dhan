import { create } from 'zustand';

// Shared state so the Navbar knows whether the blue offer bar (TopBanner) is
// on screen. When the banner is showing, the Navbar sits below it; once the
// user closes it the Navbar sticks to the very top. `dismissed` is global so
// closing the banner keeps it closed while navigating between landing pages.
export const useTopBannerStore = create((set) => ({
  hasBanner: true,    // an offer is available (a default banner always exists)
  dismissed: false,   // user clicked the close (X) button
  setHasBanner: (v) => set({ hasBanner: !!v }),
  dismiss: () => set({ dismissed: true }),
}));

// Convenience selector: is the banner actually visible right now?
export const selectBannerVisible = (s) => s.hasBanner && !s.dismissed;
