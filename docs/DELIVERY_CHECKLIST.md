# Delivering a branded panel to a GSM reseller

For you (the operator). Plain steps. Commands are run on your server in the `panel` folder.

## What the reseller gets
Their own panel at their own address (`theirname.yourdomain.com`, or their own domain), with **their** business name, logo and colours, set by them from the Branding screen: no files, no developer. They can import their services from a spreadsheet, add their own customers, set prices per customer group, and see every order and every rupee of credit.

## One-time setup of your server (once, for all customers)
Follow `deploy/README.md`. In short: a small server (DigitalOcean, Linode or Hetzner), Docker, a Cloudflare tunnel, five secrets in `.env`, then `docker compose up -d --build`.
Do these before the first customer:
- [ ] `https://yourdomain.com/api/health` shows `{"status":"ok"}` from your phone
- [ ] `ALLOW_PUBLIC_SIGNUP` is **not** set to true (strangers must not create panels)
- [ ] Backups: `BACKUP_UPLOAD_COMMAND` set so a copy leaves the server, then run the restore check and see `RESTORE CHECK PASSED`
- [ ] The secrets (`.env`, especially `APP_ENCRYPTION_KEY`) are saved in a password manager and one offline copy
- [ ] An uptime alert is set up (for example a free monitor that pings `/api/health` and messages you)
- [ ] Your lawyer has approved the list of services, the terms, the refund policy and the privacy policy (task T-005)

## Creating the reseller's panel (about 5 minutes)
1. Choose the panel address, for example `gsmking`. Then run:
   ```
   docker compose run --rm migrate node scripts/ops.mjs create-panel gsmking "GSM King Unlock" owner@theiremail.com
   ```
   It prints a one-time link. **Send that link to the reseller** (WhatsApp is fine). They choose their own password; nobody else ever knows it.
2. If they have their own domain (for example `panel.gsmking.com`):
   ```
   docker compose run --rm migrate node scripts/ops.mjs add-domain gsmking panel.gsmking.com
   ```
   Then, as the command explains, add that hostname to your Cloudflare tunnel and have them point the domain to it.
3. Check everything: `docker compose run --rm migrate node scripts/ops.mjs list`

## What the reseller does on day one (walk them through it, 30 minutes)
1. Opens the link, chooses a password, signs in. Turns on two-factor (Security) with their phone.
2. **Branding:** uploads their logo, types their business name, picks their brand colour and light or dark, checks the preview, presses **Publish this look**.
3. **Suppliers** tab: adds the supplier names they buy from.
4. **Services** tab: **Import many services from a spreadsheet**. Paste from Excel or upload a CSV with the columns code, name, cost (category, type and delivery time are optional). Press **Check the sheet**, fix anything it flags, then **Import**.
5. **Price groups:** sets the markup for the groups they will have (for example Standard +20%, VIP +10%).
6. **Customers:** invites their customers (each gets a link), chooses each customer's price group, and adds credit after the customer pays them.
7. Places one small test order themselves and works it through the **Order queue**.

## When something goes wrong
| Problem | What to do |
|---|---|
| Someone lost their password or their phone | Reseller owner: Customers, **Reset access**, send the link. If it is the owner: `scripts/ops.mjs reset-access gsmking owner@theiremail.com` |
| Someone leaves | Customers, **Remove**. They are signed out instantly; their history stays; **Restore access** brings them back |
| A customer was charged but the supplier failed | Order queue, **Fail** the order with a reason. The exact amount is refunded automatically |
| Reseller stops paying you | `scripts/ops.mjs suspend gsmking` (and `activate` when they pay) |
| Server problem | Restore from backup (see `deploy/README.md`), after running the restore check on a spare copy first |

## What to tell the reseller honestly
- Orders are fulfilled by their own staff in the queue for now; automatic supplier connections are a planned next step.
- There is no email yet: invitations and reset links are sent by you or them on WhatsApp.
- Credit is a record of payments they have received; the platform never holds or moves money.
- Their data is backed up daily and checked.

## Do not hand over until
- [ ] You have done a full test yourself on the live server: create a panel, brand it, import services, invite a test customer, add credit, place and complete an order, fail an order and see the refund
- [ ] The backup restore check has passed on the live server
- [ ] You have the reseller's written acceptance of the credit model and terms
