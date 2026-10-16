import { useEffect, useState } from 'react';

const KEY = 'feedback_theme';

function readStored() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function systemTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Applies the saved theme before the first render (called from main.jsx). */
export function applyStoredTheme() {
  const stored = readStored();
  if (stored) document.documentElement.dataset.theme = stored;
}

/** Light / dark switch. Follows the device setting until the user picks one. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => readStored() || systemTheme());

  useEffect(() => {
    if (readStored() || !window.matchMedia) return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setTheme(media.matches ? 'dark' : 'light');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* storage unavailable */ }
  };

  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label={label} title={label}>
      <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>
      <span className="theme-toggle-text">{theme === 'dark' ? 'Light' : 'Dark'}</span>
    </button>
  );
}
