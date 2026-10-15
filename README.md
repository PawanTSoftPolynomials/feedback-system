# Feedback System and Prize Selection Portal

A small feedback website with an admin dashboard, manual winner selection, Brevo winner emails, and a secure prize-selection portal.

- **Frontend:** React (Vite), in `client/`
- **Backend:** Node.js and Express, in `server/`
- **Storage:** JSON files in `DATA_DIR` (no database)
- **Email:** Brevo, using the same `BREVO_API_KEY` and `MAIL_FROM` variables as the Orange Tree LMS backend

| URL | Who | What |
| --- | --- | --- |
| `/` | Students | Enter details, answer questions, give ratings, write their own feedback |
| `/prize/<token>` | Winners | Personal link from the email; choose exactly one prize |
| `/admin` | Admin | Feedback dashboard, questions, rating attributes, winners, prizes, settings and backup |

## Project structure

```
server/
  index.js            startup: loads .env, initialises storage, creates the admin account
  app.js              Express app: API routes, built React app, error handling
  lib/storage.js      central JSON storage (all reads and writes go through it)
  lib/mail.js         Brevo integration (reused from the LMS backend)
  lib/auth.js         admin account (bcrypt hash) and JWT sessions
  routes/public.js    GET /api/form, POST /api/submissions
  routes/portal.js    prize portal API (token verification and selection)
  routes/admin.js     admin API: questions, attributes, prizes, submissions, summary, backup
  routes/winners.js   admin API: declare winners, resend links, allow changes
  scripts/            backup.js and restore.js
  test/api.test.js    end-to-end API test
client/src/           React pages (student form, prize portal, admin)
render.yaml           Render Blueprint (web service and persistent disk)
```

### Data files (in `DATA_DIR`)

`students.json`, `questions.json`, `attributes.json`, `submissions.json`, `prizes.json`, `winners.json`, `selections.json`, `config.json` (form settings) and `admin.json` (admin username and **bcrypt hash only**).

How storage behaves:

- Missing files are created automatically with empty values.
- Existing files are never overwritten at startup.
- If a file contains invalid JSON, the server refuses to start. It names the file and leaves it untouched; it never resets it.
- Data is loaded into memory once. All writes go through one queue, so simultaneous submissions cannot overwrite each other.
- Each write goes to a temporary file, is flushed to disk, and is then renamed over the old file, so a crash never leaves a half-written file.
- Only `client/dist` is served publicly. `DATA_DIR` is never exposed.
- Prize links contain a random 256-bit token. Only its SHA-256 hash is stored.

## Run locally

Requirements: Node.js 20.12 or newer.

```bash
npm install                 # server dependencies
npm install --prefix client # client dependencies
cp .env.example .env        # then set ADMIN_PASSWORD (8+ chars), JWT_SECRET and the Brevo values
```

For local development, set `PUBLIC_BASE_URL=http://localhost:5173` in `.env` so prize links open the Vite dev server.

**Development mode** (two terminals, with hot reload):

```bash
npm run dev          # API on http://localhost:4000
npm run dev:client   # React on http://localhost:5173 (proxies /api to :4000)
```

**Production mode** (one process):

```bash
npm run build        # builds the React app into client/dist
npm start            # serves the app and API on http://localhost:4000
```

Data is stored in `./data`. No persistent disk is needed locally. Open `/admin` and log in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

Run the API test, which uses a temporary data folder and stubs Brevo:

```bash
npm test
```

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATA_DIR` | Render: yes | Data folder. Default `./data`. On Render, set `/data`. |
| `JWT_SECRET` | Recommended | 32+ character random string for admin sessions. If it is missing, sessions end on every restart. |
| `ADMIN_USERNAME` | No | Admin username (default `admin`). Used only when the account is first created. |
| `ADMIN_PASSWORD` | First start | Creates the admin account (8+ characters). Ignored once the account exists; remove it afterwards. |
| `ADMIN_RESET_PASSWORD` | No | Set to `true` together with a new `ADMIN_PASSWORD` to reset the password on the next start. Remove both afterwards. |
| `BREVO_API_KEY` | For emails | Brevo API key (same variable as the LMS backend). |
| `MAIL_FROM` | For emails | Sender email address. It must be a verified sender in Brevo. |
| `MAIL_FROM_NAME` | No | Sender name (default `Orange Tree LMS`). |
| `PUBLIC_BASE_URL` | No | Base URL for prize links. On Render, `RENDER_EXTERNAL_URL` is used automatically. Set this when using a custom domain. |
| `PORT` | No | Set automatically by Render. Default `4000`. |

## Deploy on Render with persistent JSON storage

You can deploy using the included `render.yaml` (Dashboard → **New → Blueprint**) or set the service up manually:

1. Push this folder to a Git repository and create a **Web Service** on Render from it.
2. Use these settings:
   - Runtime: **Node**
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Health check path: `/api/health`
   - Instance type: a **paid** type such as Starter. Persistent disks are not available on the free type.
3. Add a disk under **Advanced → Add Disk** (or **Disks** on an existing service):
   - Mount path: **`/data`**
   - Size: 1 GB is plenty
4. In **Environment**, set:
   - `DATA_DIR=/data`
   - `JWT_SECRET` (a long random value)
   - `ADMIN_USERNAME` and `ADMIN_PASSWORD`
   - `BREVO_API_KEY` and `MAIL_FROM`, plus `MAIL_FROM_NAME` if you want a different sender name
   - `PUBLIC_BASE_URL`, only if you use a custom domain
5. Deploy. The logs should show `data directory: /data` and `Admin account "admin" created.`
6. Log in at `https://<your-service>.onrender.com/admin`, then **remove `ADMIN_PASSWORD`** from the environment. The account stays; only the hash is kept in `/data/admin.json`.

Notes:

- Only files under `/data` survive restarts and redeploys. Everything else in the service filesystem is rebuilt on every deploy, which is why `DATA_DIR` must be `/data`.
- A service with a disk runs as a single instance and redeploys with a short downtime. That suits this app, which keeps its data in one process.
- Restarts and redeploys never delete or reset data. Files are only created when they are missing.

## Backups and restore

**The Render Persistent Disk protects data across normal restarts and redeploys. It is not a backup.** Deleting the disk or service, a bad manual edit, an accidental restore, or an application bug can still lose data. Render's automatic daily disk snapshots help, but you should also keep your own copies, especially before and after collecting feedback.

### Creating a backup

- **Admin dashboard (easiest):** go to **Settings → Download backup**. You get one JSON file with every collection, taken while no writes are in progress.
- **Locally:** run `npm run backup`. This writes `backups/feedback-backup-<time>.json`. Pass a path to choose the location: `npm run backup -- /some/file.json`.
- **On Render:** open the service **Shell** and run `npm run backup -- /data/feedback-backup.json`, then download the file with `scp` (see Render's SSH docs). You can also copy the raw files with `tar -czf /tmp/data.tgz -C /data .`.

Backups contain personal student data. Store them privately.

### Restoring a backup

1. Get the backup file onto the machine. On Render, upload it with `scp` to the service, for example to `/data/upload.json`.
2. Stage it: `npm run restore -- <path-to-backup.json>`. This validates the file and saves it as `DATA_DIR/restore-pending.json`.
3. **Restart the server.** On Render, use **Manual Deploy → Restart service**; locally, stop and start it. On startup the backup replaces the data files before anything is loaded, and the staged file is renamed to `restore-applied-<time>.json`.

Anything submitted between taking the backup and restoring it is replaced, so restore when no one is using the site.

## Admin account

- The account is created from `ADMIN_USERNAME` and `ADMIN_PASSWORD` on the first start. Only a bcrypt hash is stored, and the password is never written to disk or logs.
- **Forgot the password:** set `ADMIN_PASSWORD=<new>` and `ADMIN_RESET_PASSWORD=true`, restart, log in, then remove both variables. Changing the password ends all existing admin sessions.
- Login is rate-limited to 10 attempts per 15 minutes per IP address.

## Winner and prize flow

1. Students submit feedback. Each email address and mobile number can submit only once; this is checked on the server inside the write lock.
2. The admin opens a submission and clicks **Declare as winner**. Winners are never chosen automatically.
3. The server creates a secret token and emails the link `/prize/<token>` through Brevo:
   - The email status shows **Email sent** only after Brevo has accepted the message.
   - Any failure (missing configuration or an error from Brevo) is shown as **Email failed** with the reason, and the admin can **Retry email**.
   - **Resend link** issues a new token, and the previous link stops working.
4. The winner opens the link. The server verifies the token and shows the active prizes, and the winner confirms exactly one. The selection time is recorded, and a second or conflicting selection is rejected.
5. To let a winner change their choice, the admin clicks **Allow change** on the Winners page. This allows one change, after which the selection locks again.

## Brevo setup checklist

- Use the same Brevo account and API key as the LMS (`BREVO_API_KEY`).
- `MAIL_FROM` must be a verified sender or domain in Brevo (**Senders, Domains & Dedicated IPs**).
- If Brevo has **authorised IPs** turned on for API keys, either allow Render's outbound IPs or turn that restriction off. Otherwise emails will show as failed with an "unauthorised IP" reason.
