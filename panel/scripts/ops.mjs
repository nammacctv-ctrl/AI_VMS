// Operator tool: run by Namma CCTV staff on the server, never exposed to the web.
// Uses the OWNER database login (MIGRATE_DATABASE_URL), the same one used for migrations.
//
//   npm run ops -- create-panel <slug> "<Business name>" <owner-email>
//   npm run ops -- add-domain <slug> <domain>
//   npm run ops -- reset-access <slug> <email>
//   npm run ops -- suspend <slug>      |   npm run ops -- activate <slug>
//   npm run ops -- list
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

const url = process.env.MIGRATE_DATABASE_URL;
const root = process.env.PLATFORM_ROOT_DOMAIN;
const scheme = process.env.OPS_SCHEME ?? "https";
const [cmd, ...args] = process.argv.slice(2);

const fail = (msg) => { console.error(`\nError: ${msg}\n`); process.exit(1); };
if (!url) fail("MIGRATE_DATABASE_URL is required (the database owner login).");
if (!cmd || cmd === "help") {
  console.log(`Commands:
  create-panel <slug> "<Business name>" <owner-email>   create a panel and print the owner's set-password link
  add-domain <slug> <domain>                            let a panel answer on its own domain (e.g. panel.theirbrand.com)
  reset-access <slug> <email>                           print a one-time link to reset a person's password and 2FA
  suspend <slug> | activate <slug>                      switch a panel off or on
  list                                                  show all panels`);
  process.exit(0);
}

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const SLUG = /^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])$/;
const RESERVED = new Set(["www", "app", "api", "admin", "status", "mail"]);
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const DOMAIN = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

const client = new pg.Client({ connectionString: url });
await client.connect();
const tx = async (fn) => { await client.query("BEGIN"); try { const r = await fn(); await client.query("COMMIT"); return r; } catch (e) { await client.query("ROLLBACK"); throw e; } };
const asTenant = (id) => client.query("SELECT set_config('app.tenant_id', $1, true)", [id]);
const link = (slug, token) => `${scheme}://${slug}.${root ?? "<PLATFORM_ROOT_DOMAIN>"}/accept-invite?token=${token}`;

async function findTenant(slug) {
  const { rows } = await client.query("SELECT id, slug, name, status FROM tenants WHERE slug = $1", [slug]);
  if (!rows[0]) fail(`no panel with the address "${slug}".`);
  return rows[0];
}

async function resetInvite(tenant, email, invitedBy = null) {
  return tx(async () => {
    await asTenant(tenant.id);
    const u = (await client.query("SELECT id, role, customer_group_id FROM users WHERE email = $1", [email.toLowerCase()])).rows[0];
    if (!u) fail(`"${email}" is not a person in ${tenant.slug}.`);
    const token = randomBytes(32).toString("base64url");
    await client.query("DELETE FROM user_invites WHERE email = $1 AND accepted_at IS NULL", [email.toLowerCase()]);
    await client.query(
      `INSERT INTO user_invites (tenant_id, email, role, customer_group_id, token_hash, invited_by, expires_at, reset_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, now() + interval '7 days', $7)`,
      [tenant.id, email.toLowerCase(), u.role, u.customer_group_id, sha256(token), invitedBy ?? u.id, u.id]);
    await client.query("INSERT INTO audit_log (tenant_id, actor, action, detail) VALUES ($1, 'operator', 'staff.access_reset_started', $2)",
      [tenant.id, JSON.stringify({ email: email.toLowerCase(), by: "operator" })]);
    return token;
  });
}

try {
  if (cmd === "create-panel") {
    const [slug, name, email] = args;
    if (!slug || !name || !email) fail('usage: create-panel <slug> "<Business name>" <owner-email>');
    if (!SLUG.test(slug) || RESERVED.has(slug)) fail("the address must be 3-32 letters, numbers or dashes (not starting or ending with a dash) and not a reserved word.");
    if (!EMAIL.test(email)) fail("that email address does not look right.");
    if (name.trim().length < 2 || name.length > 80) fail("the business name must be 2 to 80 characters.");
    // The owner is created with a locked password: nobody, including us, knows one. They set it from the link.
    const { rows } = await client.query("SELECT platform_signup_tenant($1, $2, $3, $4) AS id", [slug, name.trim(), email.toLowerCase(), "locked$no-password-set"])
      .catch((e) => (e.code === "23505" ? fail(`the address "${slug}" is already taken.`) : Promise.reject(e)));
    const tenant = { id: rows[0].id, slug };
    const token = await resetInvite(tenant, email);
    console.log(`\nPanel created: ${name.trim()} (${slug})\n\nSend this link to ${email}. It works once, lasts 7 days, and lets them choose their own password:\n\n  ${link(slug, token)}\n`);
  } else if (cmd === "add-domain") {
    const [slug, domainRaw] = args;
    const domain = (domainRaw ?? "").toLowerCase();
    if (!slug || !domain) fail("usage: add-domain <slug> <domain>");
    if (!DOMAIN.test(domain)) fail("that does not look like a domain name, e.g. panel.theirbrand.com");
    if (root && (domain === root || domain.endsWith(`.${root}`))) fail("use a domain that is not under our own platform domain.");
    const t = await findTenant(slug);
    await client.query("INSERT INTO tenant_domains (tenant_id, domain, verified) VALUES ($1, $2, true) ON CONFLICT (domain) DO UPDATE SET verified = true WHERE tenant_domains.tenant_id = $1", [t.id, domain])
      .then((r) => { if (r.rowCount === 0) fail(`${domain} already belongs to another panel.`); });
    console.log(`\n${domain} now opens ${t.name}.\n\nTwo more steps outside this tool:
  1. In Cloudflare Zero Trust > Networks > Tunnels > your tunnel > Public hostname: add ${domain} pointing to http://app:3000
  2. Make sure the customer's DNS for ${domain} is a CNAME to the tunnel (Cloudflare shows the exact target).\n`);
  } else if (cmd === "reset-access") {
    const [slug, email] = args;
    if (!slug || !email) fail("usage: reset-access <slug> <email>");
    const t = await findTenant(slug);
    const token = await resetInvite(t, email);
    console.log(`\nSend this one-time link to ${email} (works once, lasts 7 days). It sets a new password, clears two-factor and ends old sessions:\n\n  ${link(slug, token)}\n`);
  } else if (cmd === "suspend" || cmd === "activate") {
    const [slug] = args;
    if (!slug) fail(`usage: ${cmd} <slug>`);
    const t = await findTenant(slug);
    await client.query("UPDATE tenants SET status = $2 WHERE id = $1", [t.id, cmd === "suspend" ? "suspended" : "active"]);
    console.log(`\n${t.name} (${slug}) is now ${cmd === "suspend" ? "suspended: its address stops working until you activate it" : "active"}.\n`);
  } else if (cmd === "list") {
    const { rows } = await client.query(`
      SELECT t.slug, t.name, t.status, t.plan, t.created_at,
             (SELECT string_agg(d.domain, ', ') FROM tenant_domains d WHERE d.tenant_id = t.id AND d.verified) AS domains
        FROM tenants t ORDER BY t.created_at`);
    if (!rows.length) console.log("\nNo panels yet.\n");
    for (const r of rows) console.log(`${r.slug.padEnd(24)} ${r.status.padEnd(10)} ${r.plan.padEnd(9)} ${r.name}${r.domains ? `   [${r.domains}]` : ""}`);
  } else fail(`unknown command "${cmd}". Run: npm run ops -- help`);
} finally {
  await client.end();
}
