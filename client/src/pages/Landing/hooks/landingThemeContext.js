import { createContext, useContext } from 'react';

/** Website light/dark, provided by LandingShell and read by the Navbar. */
export const LandingThemeContext = createContext({ theme: 'light', toggle: () => {} });

export const useLandingThemeCtx = () => useContext(LandingThemeContext);
