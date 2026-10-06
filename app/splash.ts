// The splash screen is plain HTML/CSS in web/index.html so it appears before any
// JavaScript downloads. The scene calls hideSplash() on its first rendered frame.
export function hideSplash() {
  const splash = document.getElementById('splash');
  if (!splash || splash.dataset.state === 'leaving') return;
  splash.dataset.state = 'leaving';
  splash.setAttribute('aria-busy', 'false');
  // Matches the CSS fade duration in index.html; respects reduced-motion users via CSS.
  window.setTimeout(() => splash.remove(), 700);
}

/** Shows a loading failure on the splash if the app fails before the first frame. */
export function splashError(message: string) {
  const status = document.getElementById('splash-status');
  if (status) status.textContent = message;
}
