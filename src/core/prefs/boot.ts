// Server-safe: a plain string, so the root layout can inline it (index.ts is a client module).

/** Inline script run before first paint so the saved theme never flashes. Contains no markup characters. */
export const THEME_BOOT_SCRIPT =
  '(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})()';
