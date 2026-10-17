import { useEffect, useState } from 'react';

/**
 * Shown when a new version of the site has been deployed. If the tab is in the background the page
 * reloads by itself; otherwise the user chooses when, so nothing they are typing is lost.
 */
export default function UpdateBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onUpdate = () => {
      if (document.hidden) window.location.reload();
      else setVisible(true);
    };
    const onHidden = () => {
      if (document.hidden && visible) window.location.reload();
    };
    window.addEventListener('app-updated', onUpdate);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('app-updated', onUpdate);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [visible]);

  if (!visible) return null;
  return (
    <div className="update-banner" role="status">
      <span>A new version of this site is available.</span>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>Reload now</button>
    </div>
  );
}
