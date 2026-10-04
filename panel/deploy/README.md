# Running the platform on a server (DigitalOcean, Linode, Hetzner)

Any Linux server with Docker Engine and the Compose plugin works. 2 vCPU / 4 GB RAM is a sensible start.
**Run exactly one copy of the app** (rate limits are kept in memory).

## First install
1. Create a Cloudflare tunnel (Zero Trust > Networks > Tunnels). Add two public hostnames pointing to `http://app:3000`:
   `yourdomain.com` and `*.yourdomain.com`. Copy the tunnel token.
2. On the server: `git clone`, `cd panel`, `cp .env.example .env`, and fill in these five values
   (`openssl rand -base64 32` makes good secrets; keep copies somewhere safe, especially `APP_ENCRYPTION_KEY`, because losing it makes stored two-factor secrets unreadable):
   `DB_OWNER_PASSWORD`, `DB_APP_PASSWORD`, `APP_ENCRYPTION_KEY`, `PLATFORM_ROOT_DOMAIN`, `CLOUDFLARE_TUNNEL_TOKEN`.
3. `docker compose up -d --build`
4. Check: `curl https://yourdomain.com/api/health` returns `{"status":"ok"}`.

Notes
- No ports are published. Firewall inbound to SSH only (ideally keys only, restricted by IP).
- Migrations run automatically on every `up`; they only move forward and are safe to repeat.
- Leave `ALLOW_PUBLIC_SIGNUP` unset. Panels are created by you with the operator tool below.

## Operator tool (creating and managing panels)
Run from the `panel` folder on the server:
```
docker compose run --rm migrate node scripts/ops.mjs help
docker compose run --rm migrate node scripts/ops.mjs create-panel <address> "<Business name>" <owner-email>
docker compose run --rm migrate node scripts/ops.mjs add-domain <address> <domain>
docker compose run --rm migrate node scripts/ops.mjs reset-access <address> <email>
docker compose run --rm migrate node scripts/ops.mjs suspend <address>      # and: activate <address>
docker compose run --rm migrate node scripts/ops.mjs list
```
Full delivery steps for a customer: `../docs/DELIVERY_CHECKLIST.md`.

## Backups (do this before the first customer)
The `backup` service writes a verified backup to `./backups` every 24 hours and keeps 14 days (`BACKUP_KEEP_DAYS`).
A backup that stays on the same server is not enough: if the disk dies, both are gone. Set `BACKUP_UPLOAD_COMMAND` in `.env` to a command that copies the file named in `$1` somewhere else. Examples:
- rclone to Backblaze B2, S3 or any cloud: `rclone copyto "$1" remote:panel-backups/` (rclone must be available where the command runs; simplest is a daily host cron that runs `rclone sync ./backups remote:panel-backups` instead, and leaving this variable empty)
- Hetzner Storage Box over SFTP: `scp "$1" uXXXX@uXXXX.your-storagebox.de:panel-backups/`

The script prints a loud warning when no off-server copy is configured, and exits with an error if the copy fails.

**Prove a backup works** (run this once now, then monthly; it is safe on the live server because it restores into a throwaway database):
```
docker compose exec backup sh /deploy/restore-test.sh
```
You want to see `RESTORE CHECK PASSED`. It also checks that the money records still add up.

**If the server is lost:** make a new server and follow "First install" with the same `.env` values, but stop after step 2. Then, in this order (the database structure and logins must exist before the restore; this order was tested):
```
docker compose up -d db migrate
docker compose exec -T db pg_restore --clean --if-exists --no-owner -U panel_owner -d panel < backups/panel-YYYYMMDDTHHMMSSZ.dump
docker compose up -d
```
Then check `curl https://yourdomain.com/api/health` and sign in to one panel. Do a practice run of this on a spare server before you ever need it, and bring the newest backup from your off-server copy.

## Updating
`git pull && docker compose up -d --build`. Take a backup first (`docker compose exec backup sh /deploy/backup.sh`).
Planned: signed prebuilt images so customers on their own servers cannot fall behind on security patches.
