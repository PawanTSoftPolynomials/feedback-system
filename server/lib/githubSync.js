'use strict';
/**
 * Keeps a copy of every JSON data file in a private GitHub repository, for hosts without a
 * persistent disk (e.g. Render's free plan, which wipes local files on restart, redeploy and sleep).
 *
 * - Startup: files missing locally are downloaded from GitHub before anything is loaded. If GitHub
 *   cannot be reached, startup fails, so an empty instance can never overwrite the backup.
 * - After each write: changed files are uploaded (debounced, one at a time, retried on failure).
 * - Shutdown (SIGTERM from Render): pending uploads are finished first.
 *
 * Enabled when GITHUB_SYNC_REPO ("owner/repo") and GITHUB_SYNC_TOKEN are set.
 */
const DEBOUNCE_MS = 1500;
const RETRY_MS = 30 * 1000;

function fromEnv(env = process.env) {
  const repo = (env.GITHUB_SYNC_REPO || '').trim();
  const token = (env.GITHUB_SYNC_TOKEN || '').trim();
  if (!repo && !token) return null;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) {
    throw new Error('GitHub backup needs both GITHUB_SYNC_REPO (as "owner/repo") and GITHUB_SYNC_TOKEN.');
  }
  return createGitHubSync({
    repo,
    token,
    branch: (env.GITHUB_SYNC_BRANCH || '').trim() || null,
    folder: (env.GITHUB_SYNC_PATH || 'data').trim().replace(/^\/+|\/+$/g, ''),
    apiUrl: (env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, ''),
  });
}

function createGitHubSync({ repo, token, branch, folder, apiUrl, debounceMs = DEBOUNCE_MS, retryMs = RETRY_MS }) {
  const shas = new Map(); // collection -> blob sha currently on GitHub
  const pushed = new Map(); // collection -> JSON text last uploaded (skips no-op commits)
  const dirty = new Set(); // changed, not yet uploaded
  const inFlight = new Set(); // being uploaded right now
  let getData = null;
  let timer = null;
  let stopped = false;
  let chain = Promise.resolve();
  const status = { enabled: true, repo, branch, folder, lastSyncedAt: null, lastError: null };

  const remotePath = (name) => [folder, `${name}.json`].filter(Boolean).map(encodeURIComponent).join('/');
  const contentsUrl = (name, withRef) => {
    const url = `${apiUrl}/repos/${repo}/contents/${remotePath(name)}`;
    return withRef && branch ? `${url}?ref=${encodeURIComponent(branch)}` : url;
  };

  async function request(url, options = {}, accept = 'application/vnd.github+json') {
    let res;
    try {
      res = await fetch(url, {
        ...options,
        headers: {
          Accept: accept,
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'feedback-system-sync',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
        signal: AbortSignal.timeout(20000),
      });
    } catch (err) {
      throw new Error(`cannot reach GitHub (${err.message})`);
    }
    return res;
  }

  async function errorText(res) {
    const body = await res.json().catch(() => null);
    return `GitHub answered ${res.status}${body && body.message ? `: ${body.message}` : ''}`;
  }

  /** Returns { sha, text } for a file on GitHub, or null if it does not exist. */
  async function fetchRemote(name) {
    const res = await request(contentsUrl(name, true));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await errorText(res));
    const meta = await res.json();
    let text;
    if (meta.encoding === 'base64' && typeof meta.content === 'string') {
      text = Buffer.from(meta.content, 'base64').toString('utf8');
    } else {
      // Files over 1 MB come without inline content; download the raw file instead.
      const raw = await request(contentsUrl(name, true), {}, 'application/vnd.github.raw+json');
      if (!raw.ok) throw new Error(await errorText(raw));
      text = await raw.text();
    }
    return { sha: meta.sha, text };
  }

  /** storage.init beforeLoad hook. */
  async function pull({ names, fileFor, readJson, writeAtomic, hasValidShape }) {
    let restored = 0;
    for (const name of names) {
      let remote;
      try {
        remote = await fetchRemote(name);
      } catch (err) {
        throw new Error(`Could not load ${name}.json from the GitHub backup (${repo}): ${err.message}. Startup stopped so that no data is overwritten; it will be retried.`);
      }
      let local = null;
      try {
        local = await readJson(fileFor(name));
      } catch (err) {
        if (err.code !== 'ENOENT') throw err; // invalid local JSON: let storage report it
      }
      if (!remote) {
        dirty.add(name); // not on GitHub yet: upload once loaded
        continue;
      }
      shas.set(name, remote.sha);
      let remoteData;
      try {
        remoteData = JSON.parse(remote.text.replace(/^﻿/, ''));
      } catch (err) {
        throw new Error(`${name}.json in the GitHub backup is not valid JSON (${err.message}). Fix it on GitHub, then restart.`);
      }
      if (!hasValidShape(name, remoteData)) throw new Error(`${name}.json in the GitHub backup has an unexpected structure.`);
      pushed.set(name, JSON.stringify(remoteData, null, 2));
      if (local === null) {
        await writeAtomic(fileFor(name), remoteData);
        restored += 1;
      } else if (JSON.stringify(local) !== JSON.stringify(remoteData)) {
        console.warn(`[sync] local ${name}.json differs from the GitHub backup; the local copy will be uploaded.`);
        dirty.add(name);
      }
    }
    console.log(`[sync] GitHub backup ${repo}: ${restored} file(s) restored from GitHub.`);
  }

  async function upload(name, text) {
    const put = (sha) => request(contentsUrl(name, false), {
      method: 'PUT',
      body: JSON.stringify({
        message: `Update ${name}.json`,
        content: Buffer.from(text, 'utf8').toString('base64'),
        ...(sha ? { sha } : {}),
        ...(branch ? { branch } : {}),
      }),
    });
    let res = await put(shas.get(name));
    if (res.status === 409 || res.status === 422) {
      // The file changed on GitHub (or our sha is stale): this server is the writer, so take the latest sha and retry.
      const remote = await fetchRemote(name);
      res = await put(remote ? remote.sha : undefined);
    }
    if (!res.ok) throw new Error(await errorText(res));
    const body = await res.json();
    shas.set(name, body.content.sha);
    pushed.set(name, text);
  }

  async function pushDirty() {
    const names = [...dirty];
    dirty.clear();
    names.forEach((n) => inFlight.add(n));
    for (const name of names) {
      const text = JSON.stringify(getData(name), null, 2);
      if (pushed.get(name) === text) {
        inFlight.delete(name);
        continue;
      }
      try {
        await upload(name, text);
        status.lastSyncedAt = new Date().toISOString();
        status.lastError = null;
      } catch (err) {
        dirty.add(name);
        status.lastError = `${name}.json: ${err.message}`;
        console.error(`[sync] upload of ${name}.json failed: ${err.message}. Retrying in ${Math.round(retryMs / 1000)}s.`);
      } finally {
        inFlight.delete(name);
      }
    }
    if (dirty.size) schedule([], retryMs);
  }

  function schedule(names, delay = debounceMs) {
    if (stopped) return;
    names.forEach((n) => dirty.add(n));
    if (!getData || !dirty.size) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      chain = chain.then(pushDirty);
    }, delay);
    timer.unref(); // never keeps the process alive on its own
  }

  /** Uploads everything pending now. */
  function flush() {
    clearTimeout(timer);
    timer = null;
    chain = chain.then(() => (getData && dirty.size ? pushDirty() : undefined));
    return chain;
  }

  /** Starts uploading after storage has loaded. */
  function start(storage) {
    getData = (name) => storage.get(name);
    storage.onWrite((names) => schedule(names));
    if (dirty.size) schedule([]);
  }

  /** Stops scheduling uploads (pending changes stay pending). */
  function stop() {
    stopped = true;
    clearTimeout(timer);
    timer = null;
  }

  function getStatus() {
    return { ...status, pending: new Set([...dirty, ...inFlight]).size };
  }

  return { pull, start, flush, stop, getStatus, schedule };
}

// The running instance, so the admin API can report its status.
let active = null;
const activate = (sync) => { active = sync; };
const activeStatus = () => (active ? active.getStatus() : { enabled: false });

module.exports = { fromEnv, createGitHubSync, activate, activeStatus };
