/**
 * Browser entry — exposes start/stop on window.__destroySite for use
 * via <script> tag without a bundler. Useful for the Astro integration
 * which lazy-loads this file from /public.
 */

import { start, stop, isActive } from "./index";

declare global {
  interface Window {
    __destroySite?: () => void;
    __destroySiteStop?: () => void;
    __destroySiteActive?: () => boolean;
  }
}

window.__destroySite = () => start();
window.__destroySiteStop = stop;
window.__destroySiteActive = isActive;
