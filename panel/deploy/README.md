# Deploying on a VPS (DigitalOcean, Linode, Hetzner)

Any Linux VPS with Docker Engine and the Compose plugin works. 2 vCPU / 4 GB RAM is a sensible start.

1. Create a Cloudflare tunnel (Zero Trust > Networks > Tunnels). Add public hostnames
   `panel.example.com` and `*.panel.example.com`, both pointing to service `http://app:3000`.
   Copy the tunnel token.
2. On the VPS: `git clone`, `cd panel`, `cp .env.example .env`, and fill in the five values (`APP_ENCRYPTION_KEY` is `openssl rand -base64 32`; keep a copy somewhere safe).
   Use long random passwords (`openssl rand -base64 32`).
3. `docker compose up -d --build`
4. Check: `curl https://panel.example.com/api/health` returns `{"status":"ok"}`.

Notes
- No ports are published. Firewall inbound to SSH only (ideally key-only, restricted by IP).
- Migrations run automatically on every `up`; they are forward-only and safe to repeat.
- Back up the `dbdata` volume (for example nightly `pg_dump` to object storage) before going live.
- Updating: `git pull && docker compose up -d --build` (planned: signed prebuilt images, see MEMORY.md).
