// Keeps open pages up to date without manual refreshes.
// Every few seconds (and whenever the tab becomes visible again) the page asks the server for its
// data version (GET /api/live). When the version changes, a 'data-changed' event tells every page
// to reload its data quietly. When the frontend build changes (a new deploy), 'app-updated' fires.
import { useEffect, useRef } from 'react';

const POLL_MS = 5000;
let lastVersion = null;
let firstBuild = null;
let updateAnnounced = false;
let started = false;
let checking = false;

async function check() {
  if (checking) return;
  checking = true;
  try {
    const res = await fetch('/api/live', { cache: 'no-store' });
    if (!res.ok) return;
    const { version, build } = await res.json();
    if (lastVersion !== null && version !== lastVersion) window.dispatchEvent(new Event('data-changed'));
    lastVersion = version;
    if (!firstBuild) firstBuild = build;
    else if (build !== firstBuild && !updateAnnounced) {
      updateAnnounced = true;
      window.dispatchEvent(new Event('app-updated'));
    }
  } catch {
    // Offline or server restarting: try again on the next tick.
  } finally {
    checking = false;
  }
}

/** Starts the background check once for the whole app (called from main.jsx). */
export function startLiveUpdates() {
  if (started) return;
  started = true;
  check();
  setInterval(() => {
    if (!document.hidden) check();
  }, POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) check();
  });
  window.addEventListener('focus', check);
}

/** Calls `reload` whenever data changed on the server (from this or any other browser or server). */
export function useLiveRefresh(reload) {
  const ref = useRef(reload);
  ref.current = reload;
  useEffect(() => {
    const onChange = () => ref.current();
    window.addEventListener('data-changed', onChange);
    return () => window.removeEventListener('data-changed', onChange);
  }, []);
}
