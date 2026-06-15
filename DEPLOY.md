# DEPLOY — TACET

> How TACET reaches a judge. **This repo is PUBLIC** — no secret (IP, SSH key,
> live secret) is ever inline here. Concrete values live in `.env` (gitignored)
> and are referenced by variable name.

There are two paths, and the first is the one that counts.

---

## 0. The primary "deploy" is the repo, not a server

TACET's reproducibility target is **fresh clone → running in ~5 min, offline**:

```bash
git clone https://github.com/tmulab/tacet && cd tacet
npm install
npm run demo:replay      # replays the frozen case: deterministic, zero-GPU, no key
```

The judge sees the whole method — convergence/divergence map, the empty chair,
the reliability profile — with **no server, no account, no key**. This is the
deliverable. The hosted demo below is a convenience, not a requirement.

---

## 1. What is hostable today vs. what needs E3

- **Today:** TACET is a TypeScript domain core + CLI pipeline. There is **no web
  app yet** — the demo UI and the live `POST` endpoint are **E3**. So there is
  nothing web to host; only the CLI replay, which runs locally.
- **E3 (later):** the demo UI + the live endpoint (gated by `TACET_LIVE_SECRET`,
  see [E3-AUTH in `src/live/gate.ts`](src/live/gate.ts)). Once that lands, host
  it on the VPS below by the same pattern the rest of the ecosystem uses.

**So §2–§3 are the PLAN + infra for the hosted demo — execute them when the E3
web app exists.** Until then, nothing here runs.

---

## 2. Infra (target)

The same **Hostinger VPS + Cloudflare** that hosts `tmulab.org`; TACET would be
one more PM2 app on the `tacet.tmulab.org` subdomain. Concrete values are in
`.env` (gitignored), referenced here by name only:

| Item            | `.env` var             | Notes                                              |
| --------------- | ---------------------- | -------------------------------------------------- |
| Host (public IP)| `TACET_DEPLOY_HOST`    | Hostinger VPS                                      |
| SSH port        | `TACET_DEPLOY_PORT`    |                                                    |
| SSH user        | `TACET_DEPLOY_USER`    |                                                    |
| SSH key         | `TACET_DEPLOY_SSH_KEY` | **path** to the private key (a file, never copied here) |
| Source path     | `TACET_DEPLOY_PATH`    | `/var/www/tacet.tmulab.org/source`                 |
| Public URL      | `TACET_PUBLIC_URL`     | `https://tacet.tmulab.org`                         |
| Process manager | —                      | PM2 (root)                                         |
| TLS             | —                      | Cloudflare Origin Cert in `/etc/ssl/cloudflare/` (shared, valid to 2041) |

**Differences from the tmu-ecosystem apps** (don't copy their steps blindly):

- TACET is a **standalone repo**, not the pnpm monorepo. It uses **npm**, and the
  whole repo is self-contained — there is no `shared/` to sync.
- **No database, no Redis, no auth backend.** Live mode needs only
  `OPENROUTER_API_KEY` + `TACET_LIVE_SECRET` in the server env. Replay needs none.

---

## 3. Procedure (run only once the E3 web app exists)

Premise: changes are committed to `main`. The VPS source is **not** a git repo —
sync via `tar | ssh` (`rsync` isn't available in Git Bash on Windows).

Load the deploy vars first (they're in `.env`, never echoed into a commit):

```bash
set -a; source .env; set +a   # exports TACET_DEPLOY_* etc.
SSHV="-i $TACET_DEPLOY_SSH_KEY -p $TACET_DEPLOY_PORT $TACET_DEPLOY_USER@$TACET_DEPLOY_HOST"
```

### 3.1 First-time setup (once)

- Cloudflare: add an `A`/proxied record for `tacet.tmulab.org` → the VPS IP.
- nginx: a vhost mirroring an existing `*.tmulab.org.conf`, `proxy_pass` to
  TACET's internal port (pick a free one, e.g. `5275`).
- Server env at `$TACET_DEPLOY_PATH/.env`: `NODE_ENV=production`,
  `PORT=<internal>`, `OPENROUTER_API_KEY=…`, `TACET_LIVE_SECRET=…`
  (**server env only** — fail-closed: unset ⇒ the live endpoint returns 503).

### 3.2 Each deploy — sync, build, restart

```bash
# transfer the repo (skip the heavy/derived dirs)
tar --exclude=node_modules --exclude=dist --exclude=.git --exclude=corpus -cf - . \
  | ssh $SSHV "mkdir -p $TACET_DEPLOY_PATH && tar -xf - -C $TACET_DEPLOY_PATH"

# install + build ON the VPS (never deploy a local build)
ssh $SSHV "cd $TACET_DEPLOY_PATH && npm ci && npm run build"

# (re)start under PM2
ssh $SSHV "pm2 restart tacet || pm2 start node --name tacet \
  --cwd $TACET_DEPLOY_PATH -- dist/app/server.js"   # E3 entrypoint, TBD
ssh $SSHV "pm2 save"
```

### 3.3 Smoke — and verify the gate

```bash
# local on the VPS
ssh $SSHV "curl -sS -o /dev/null -w 'local=%{http_code}\n' http://127.0.0.1:<port>/"

# public (Git Bash needs --ssl-no-revoke for the Cloudflare revocation check)
curl -sS --ssl-no-revoke -o /dev/null -w 'public=%{http_code}\n' "$TACET_PUBLIC_URL/"
```

The gate must hold (E3-AUTH, tested in `tests/live-gate.test.ts`):

- **replay / home → open** (200, no secret): they spend no LLM.
- **live `POST` without the secret → 401**, no model called.
- **live `POST` with `TACET_LIVE_SECRET` unset on the server → 503** (fail-closed).
- abuse past the limit → **429 + `Retry-After`**.

---

## 4. Gotchas (inherited from the ecosystem)

- `curl` on Git Bash (Windows): add `--ssl-no-revoke` — schannel can't check
  Cloudflare revocation (`CRYPT_E_NO_REVOCATION_CHECK` otherwise).
- Cloudflare cache can retain an old bundle → `Ctrl+Shift+R` / purge.
- Live scripts/SSH from this machine: see the `--use-system-ca` note in
  `CLAUDE.md` (TLS behind the MITM proxy) if any `node` call hits HTTPS.
- **Never commit `.env`, the server env, or the SSH key. This repo is PUBLIC.**

---

## 5. Roadmap

- [ ] **E3 web app** (Next UI + live `POST` endpoint) — prerequisite for ANY
      hosted demo. The E3-AUTH gate (`src/live/gate.ts`) is already built/tested.
- [ ] **CI/CD** — a GitHub Action doing `tar | ssh` on push to `main` (manual today).
- [ ] **systemd/PM2 resurrect** for 24/7 (the GPU-backed pieces drop when the box sleeps).
- [ ] Decide whether the hosted demo is worth it at all, given §0 — the local
      clone already gives the judge the full method.
