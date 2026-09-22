/**
 * The public website has one look: the logo's navy canvas. The light/dark
 * switch is gone — a white page next to the wordmark never matched the brand,
 * and half the site's surfaces had to be fought into line for it.
 *
 * Kept as a hook (rather than deleted) because LandingShell and Navbar read it
 * through context; returning a constant here is all it takes to bring a switch
 * back later.
 */
export function useLandingTheme() {
  return { theme: 'dark', toggle: () => {} };
}
