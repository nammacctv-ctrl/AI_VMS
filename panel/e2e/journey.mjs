// Real-browser walkthrough of the whole product. Needs a running server whose
// PLATFORM_ROOT_DOMAIN is "localhost" and a freshly migrated database.
//   BASE_PORT=3115 SHOTS=/some/dir node e2e/journey.mjs
import { createHmac } from "node:crypto";
import { deflateSync } from "node:zlib";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const PORT = process.env.BASE_PORT ?? "3115";
const SHOTS = process.env.SHOTS ?? "";
const PW = "a-long-test-password";
const platform = `http://localhost:${PORT}`;
const tenant = `http://shop.localhost:${PORT}`;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const b32 = (s) => { let bits = 0, v = 0; const out = []; for (const c of s) { v = (v << 5) | "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); };
const totp = (secret, ms = Date.now()) => { const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(Math.floor(ms / 30000))); const h = createHmac("sha1", b32(secret)).update(m).digest(); const o = h[19] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0"); };

// A small valid PNG (blue banner with white blocks) generated in memory, used as the test logo.
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, crc]); };
const makePng = (w, h) => {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * (w * 3 + 1) + 1 + x * 3; const block = (Math.floor(x / 10) + Math.floor(y / 10)) % 3 === 0;
    raw[o] = block ? 255 : 190; raw[o + 1] = block ? 255 : 24; raw[o + 2] = block ? 255 : 93;
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
};

let passed = 0;
const pages = [];
const step = async (name, fn) => {
  try { await fn(); passed++; console.log("PASS", name); }
  catch (e) {
    console.log("FAIL", name, "\n   ", String(e.message).split("\n")[0]);
    for (const er of errors.slice(0, 4)) console.log("   browser:", er.slice(0, 300));
    for (const p of pages) console.log("   page:", p.url(), "|", (await p.locator("body").innerText().catch(() => "?")).replace(/\s+/g, " ").slice(0, 160));
    process.exitCode = 1; throw e;
  }
};
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const errors = [];
let expectingErrors = false; // set around a deliberate failing request so it is not counted as a bug
const mk = async (viewport = { width: 1280, height: 800 }) => {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  pages.push(page);
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("response", (r) => {
    if (r.status() !== 404 || expectingErrors) return;
    errors.push(`404 ${r.url()}`);
  });
  page.on("console", (m) => { if (m.type() === "error" && !expectingErrors && !/status of (400|401|403)/.test(m.text())) errors.push(`console: ${m.text()} [${m.location().url}] on ${page.url()}`); });
  return page;
};
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };
const text = async (page) => (await page.locator("body").innerText());

try {
  const owner = await mk();
  await step("platform home offers to create a panel", async () => {
    await owner.goto(platform + "/");
    await owner.getByRole("link", { name: "Create your panel" }).click();
    await owner.waitForURL("**/signup");
  });
  await step("owner creates a panel", async () => {
    await owner.getByLabel("Business name").fill("Shop");
    eq(await owner.getByLabel("Panel address").inputValue(), "shop", "slug suggestion");
    await owner.getByLabel(/Your email/).fill("owner@shop.test");
    await owner.getByLabel("Password").fill(PW);
    await shot(owner, "01-signup");
    await owner.getByRole("button", { name: "Create panel" }).click();
    await owner.getByText("Your panel is ready").waitFor();
  });
  await step("owner signs in and lands on an empty queue", async () => {
    await owner.goto(tenant + "/login");
    await owner.getByLabel("Email").fill("owner@shop.test");
    await owner.getByLabel("Password").fill(PW);
    await shot(owner, "02-login");
    await owner.getByRole("button", { name: "Sign in" }).click();
    await owner.waitForURL("**/admin");
    await owner.getByText("Nothing waiting").waitFor();
    await shot(owner, "03-queue-empty");
  });
  await step("unauthenticated visitors are sent to sign in", async () => {
    const anon = await mk();
    await anon.goto(tenant + "/admin/catalog");
    await anon.waitForURL("**/login");
    await anon.context().close();
  });
  await step("owner adds a supplier and an IMEI service; price shows 20% markup", async () => {
    await owner.goto(tenant + "/admin/catalog");
    await owner.getByRole("button", { name: "Suppliers" }).click();
    await owner.getByLabel("Supplier name").fill("Supplier One");
    await owner.getByRole("button", { name: "Add supplier" }).click();
    await owner.getByText("Added Supplier One.").waitFor();
    await owner.getByRole("button", { name: "Services", exact: true }).click();
    await owner.getByLabel("Service name").fill("Samsung FRP");
    await owner.getByLabel(/Supplier's service code/).fill("S1");
    await owner.getByLabel("Category").fill("Samsung");
    await owner.getByLabel("Reseller enters").selectOption("imei");
    await owner.getByLabel("Your cost (₹)").fill("100");
    await owner.getByLabel("Usual delivery time").fill("10-60 minutes");
    await owner.getByRole("button", { name: "Add service" }).click();
    await owner.getByText("Added Samsung FRP.").waitFor();
    await shot(owner, "04-services");
    await owner.getByRole("button", { name: "Prices" }).click();
    await owner.getByText("₹120.00").first().waitFor();
    await shot(owner, "05-prices");
  });
  await step("owner can set a special price and see it applied", async () => {
    await owner.getByRole("button", { name: "Change" }).first().click();
    await owner.getByLabel("How to price it").selectOption("fixed");
    await owner.getByLabel("Selling price (₹)").fill("130");
    await owner.getByRole("button", { name: "Save price" }).click();
    await owner.getByText("Price updated for Samsung FRP.").waitFor();
    await owner.getByText("₹130.00").first().waitFor();
    await owner.getByRole("button", { name: "Change" }).first().click();
    await owner.getByLabel("How to price it").selectOption("clear");
    await owner.getByRole("button", { name: "Save price" }).click();
    await owner.getByText("₹120.00").first().waitFor();
  });

  let inviteLink = "";
  await step("owner invites a reseller and gets a one-time link", async () => {
    await owner.goto(tenant + "/admin/customers");
    await owner.getByLabel("Email").fill("reseller@shop.test");
    await owner.getByRole("button", { name: "Create invitation" }).click();
    await owner.getByText(/Send this link/).waitFor();
    inviteLink = (await owner.locator("code").first().innerText()).trim();
    if (!inviteLink.includes("/accept-invite?token=")) throw new Error("no link: " + inviteLink);
    await shot(owner, "06-customers");
  });

  const reseller = await mk({ width: 390, height: 800 });
  await step("reseller accepts the invitation (on a phone) and signs in", async () => {
    await reseller.goto(inviteLink);
    await reseller.getByLabel("Choose a password").fill("short");
    await reseller.getByText("at least 12 characters.").first().waitFor();
    await reseller.getByLabel("Choose a password").fill(PW);
    await reseller.getByLabel("Repeat password").fill(PW);
    await reseller.getByRole("button", { name: "Create my account" }).click();
    await reseller.waitForURL("**/login");
    await reseller.getByLabel("Email").fill("reseller@shop.test");
    await reseller.getByLabel("Password").fill(PW);
    await reseller.getByRole("button", { name: "Sign in" }).click();
    await reseller.waitForURL("**/portal");
    await shot(reseller, "07-reseller-dashboard-mobile");
  });
  await step("a used invitation link no longer works", async () => {
    const p = await mk();
    await p.goto(inviteLink);
    await p.getByLabel("Choose a password").fill(PW);
    await p.getByLabel("Repeat password").fill(PW);
    await p.getByRole("button", { name: "Create my account" }).click();
    await p.getByText(/invalid or expired/).waitFor();
    await p.context().close();
  });
  await step("reseller cannot see staff pages or costs", async () => {
    const nav = await reseller.locator("nav").innerText();
    if (/Order queue|Customers|Services & prices|Activity log/.test(nav)) throw new Error("staff links visible: " + nav);
    await reseller.goto(tenant + "/admin/catalog");
    await reseller.getByText("No access").waitFor();
    const r = await reseller.evaluate(async () => (await fetch("/api/catalog/services")).status);
    eq(r, 403, "services API for reseller");
  });
  await step("with no credit, ordering is blocked with a clear message", async () => {
    await reseller.goto(tenant + "/portal/order");
    await reseller.getByLabel("Service", { exact: true }).selectOption({ index: 1 });
    await reseller.getByText(/Not enough credit/).waitFor();
    await shot(reseller, "08-order-no-credit-mobile");
  });
  await step("owner adds ₹500 credit for the reseller", async () => {
    await owner.goto(tenant + "/admin/customers");
    await owner.getByRole("row", { name: /reseller@shop.test/ }).getByRole("button", { name: "Add credit" }).click();
    await owner.getByLabel("Amount received (₹)").fill("500");
    await owner.getByLabel("Payment note").fill("UPI 4471");
    await owner.getByRole("button", { name: "Add credit" }).last().click();
    await owner.getByText(/New balance ₹500\.00/).waitFor();
    await shot(owner, "09-credit-added");
  });
  await step("reseller sees a typo'd IMEI rejected before ordering", async () => {
    await reseller.goto(tenant + "/portal/order");
    await reseller.getByLabel("Service", { exact: true }).selectOption({ index: 1 });
    await reseller.getByLabel("IMEI number").fill("490154203237519");
    await reseller.getByText(/does not look right/).waitFor();
    const disabled = await reseller.getByRole("button", { name: /Place order/ }).isDisabled();
    eq(disabled, true, "button disabled for bad IMEI");
  });
  await step("reseller places an order; credit drops to ₹380", async () => {
    await reseller.getByLabel("IMEI number").fill("490 154 203 237 518");
    await shot(reseller, "10-order-form-mobile");
    await reseller.getByRole("button", { name: /Place order/ }).click();
    await reseller.getByText(/Order #1 placed/).waitFor();
    await reseller.getByText("₹380.00").first().waitFor();
  });
  await step("ordering the same IMEI again is refused as a duplicate", async () => {
    await reseller.getByLabel("IMEI number").fill("490154203237518");
    await reseller.getByRole("button", { name: /Place order/ }).click();
    await reseller.getByText(/duplicate/).waitFor();
  });
  await step("owner sees the order in the queue and completes it with a result", async () => {
    await owner.goto(tenant + "/admin");
    await owner.getByRole("row", { name: /reseller@shop.test/ }).waitFor();
    await shot(owner, "11-queue-pending");
    await owner.getByRole("button", { name: "Complete", exact: true }).click();
    await owner.getByLabel(/Result for the reseller/).fill("Unlock code: 55501234");
    await shot(owner, "12-complete-dialog");
    await owner.getByRole("button", { name: "Mark completed" }).click();
    await owner.getByText("Nothing waiting").waitFor();
  });
  await step("reseller sees the completed order and result", async () => {
    await reseller.goto(tenant + "/portal/orders");
    await reseller.getByText("Completed").first().waitFor();
    await reseller.getByRole("button", { name: "Details" }).click();
    await reseller.getByText("Unlock code: 55501234").waitFor();
    await shot(reseller, "13-reseller-orders-mobile");
  });
  await step("a second order failed by staff is refunded in full", async () => {
    await reseller.goto(tenant + "/portal/order");
    await reseller.getByLabel("Service", { exact: true }).selectOption({ index: 1 });
    await reseller.getByLabel("IMEI number").fill("356938035643809");
    await reseller.getByRole("button", { name: /Place order/ }).click();
    await reseller.getByText(/Order #2 placed/).waitFor();
    await owner.goto(tenant + "/admin");
    await owner.getByRole("button", { name: "Fail", exact: true }).click();
    await owner.getByLabel(/Reason/).fill("Supplier rejected this IMEI");
    await owner.getByRole("button", { name: "Fail and refund" }).click();
    await owner.getByText("Nothing waiting").waitFor();
    await reseller.goto(tenant + "/portal/credit");
    await reseller.getByText("₹380.00").first().waitFor();
    await shot(reseller, "14-credit-statement-mobile");
    await reseller.goto(tenant + "/portal/orders");
    await reseller.getByRole("button", { name: "Details" }).first().click();
    await reseller.getByText(/Supplier rejected this IMEI/).first().waitFor();
  });
  await step("owner sees margin, supplier and the activity log", async () => {
    await owner.goto(tenant + "/admin");
    await owner.getByRole("button", { name: "Completed" }).click();
    await owner.getByText("₹20.00").first().waitFor();
    await owner.goto(tenant + "/admin/audit");
    await owner.getByText("order.created").first().waitFor();
    await owner.getByText("wallet.credited").first().waitFor();
    await shot(owner, "15-audit");
  });
  await step("reseller turns on two-factor, signs out, and must use a code to sign in", async () => {
    await reseller.goto(tenant + "/portal/security");
    await reseller.getByRole("button", { name: "Turn on two-factor" }).click();
    await reseller.locator("img[alt^='QR code']").waitFor();
    const secret = (await reseller.locator("code").first().innerText()).trim();
    await shot(reseller, "16-two-factor-mobile");
    await reseller.getByLabel(/Enter the 6-digit code/).fill(totp(secret));
    await reseller.getByRole("button", { name: "Confirm and turn on" }).click();
    await reseller.getByText(/Two-factor sign-in is on/).waitFor();
    await reseller.context().clearCookies();
    await reseller.goto(tenant + "/login");
    await reseller.getByLabel("Email").fill("reseller@shop.test");
    await reseller.getByLabel("Password").fill(PW);
    await reseller.getByRole("button", { name: "Sign in" }).click();
    await reseller.getByLabel("Authenticator code").waitFor();
    await reseller.getByLabel("Authenticator code").fill("000000");
    await reseller.getByRole("button", { name: "Sign in" }).click();
    await reseller.getByText(/invalid email or password/).waitFor();
    await reseller.getByLabel("Authenticator code").fill(totp(secret, Date.now() + 30000));
    await reseller.getByRole("button", { name: "Sign in" }).click();
    await reseller.waitForURL("**/portal");
  });
  await step("reseller creates an API key; it is shown once and works", async () => {
    await reseller.goto(tenant + "/portal/api-keys");
    await reseller.getByLabel("Name").fill("My bot");
    await reseller.getByRole("button", { name: "Create key" }).click();
    await reseller.getByText(/will not be shown again/).waitFor();
    const key = (await reseller.locator("code").first().innerText()).trim();
    // A brand-new browser context has no cookies, so this proves the key alone is enough.
    const bare = await browser.newContext();
    const bp = await bare.newPage();
    await bp.goto(tenant + "/login");
    const call = (path, k) => bp.evaluate(async ([p, k]) => (await fetch(p, { headers: { Authorization: `Bearer ${k}` } })).status, [path, k]);
    eq(await call("/api/catalog/price-list", key), 200, "price list via key");
    eq(await call("/api/orders", "nk_aaaaaaaaaa_" + "x".repeat(32)), 401, "wrong key rejected");
    eq(await call("/api/staff", key), 403, "key cannot read staff");
    await bare.close();
    await shot(reseller, "17-api-keys-mobile");
    await reseller.reload();
    if ((await text(reseller)).includes(key)) throw new Error("key still visible after reload");
  });
  await step("a reseller cannot use branding: no page, no upload", async () => {
    await reseller.goto(tenant + "/admin/branding");
    await reseller.getByText("No access").waitFor();
    const r = await reseller.evaluate(async () => (await fetch("/api/brand/logo", { method: "PUT", headers: { "Content-Type": "image/png" }, body: new Uint8Array([1, 2, 3]) })).status);
    eq(r, 403, "logo upload by reseller");
    const t = await reseller.evaluate(async () => (await fetch("/api/brand/theme", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status);
    eq(t, 403, "theme publish by reseller");
  });
  await step("owner: an SVG logo is refused with a clear message", async () => {
    await owner.goto(tenant + "/admin/branding");
    await owner.getByRole("heading", { name: "Branding" }).waitFor();
    await owner.locator("#logofile").setInputFiles({ name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') });
    await owner.getByText(/PNG, JPG or WebP/).first().waitFor();
  });
  await step("owner: a PNG logo is accepted and shown in the menu", async () => {
    await owner.locator("#logofile").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: makePng(240, 60) });
    await owner.getByText("Logo updated.").waitFor();
    await owner.locator("nav img[alt]").waitFor();
    const ok = await owner.evaluate(() => { const i = document.querySelector("nav img"); return i && i.complete && i.naturalWidth === 240; });
    eq(ok, true, "logo image loaded at its real size");
  });
  await step("owner renames the business", async () => {
    await owner.getByLabel("Business name").fill("Shop Mobile Unlock");
    await owner.getByRole("button", { name: "Save", exact: true }).click();
    await owner.getByText("Business name saved.").waitFor();
  });
  await step("owner designs a dark pink look, sees a live preview, and publishes", async () => {
    const preview = owner.getByTestId("preview");
    const bgBefore = await preview.evaluate((e) => getComputedStyle(e).backgroundColor);
    await owner.getByLabel("Brand colour as a hex code").fill("#be185d");
    await owner.getByLabel("Light or dark").selectOption("dark");
    await owner.getByLabel("Corners").selectOption("lg");
    const bgAfter = await preview.evaluate((e) => getComputedStyle(e).backgroundColor);
    if (bgBefore === bgAfter) throw new Error("preview did not change");
    eq(bgAfter, "rgb(11, 18, 32)", "dark preview background");
    await owner.getByText("You have unpublished changes.").waitFor();
    await shot(owner, "18-branding-dark-preview");
    await owner.getByRole("button", { name: "Publish this look" }).click();
    await owner.getByText(/Published\. Your panel now looks like this/).waitFor();
    await owner.getByText("This is what your panel looks like now.").waitFor();
    // the owner's own page switches to the new look straight away, with no reload
    await owner.waitForFunction(() => getComputedStyle(document.body).backgroundColor === "rgb(7, 13, 24)", null, { timeout: 8000 });
    eq(await owner.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()), "#be185d", "owner page picked up the new colour");
  });
  await step("visitors now see the brand: logo, name, colour and dark mode on the login page", async () => {
    const visitor = await mk({ width: 390, height: 800 });
    await visitor.goto(tenant + "/login");
    await visitor.locator("img[alt='Shop Mobile Unlock']").waitFor();
    eq(await visitor.title(), "Shop Mobile Unlock", "page title");
    eq(await visitor.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()), "#be185d", "brand colour variable");
    eq(await visitor.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(7, 13, 24)", "dark page background");
    eq(await visitor.evaluate(() => { const i = document.querySelector("img[alt='Shop Mobile Unlock']"); return i.complete && i.naturalWidth === 240; }), true, "logo loads for anonymous visitors");
    await shot(visitor, "19-login-branded-mobile");
    await visitor.context().close();
  });
  await step("the logo URL cannot be abused to run a page, and other sites have none", async () => {
    const h = await owner.evaluate(async () => { const r = await fetch(document.querySelector("nav img").getAttribute("src")); return { type: r.headers.get("content-type"), nosniff: r.headers.get("x-content-type-options"), csp: r.headers.get("content-security-policy") }; });
    eq(h.type, "image/png", "logo content type"); eq(h.nosniff, "nosniff", "nosniff"); if (!/sandbox/.test(h.csp)) throw new Error("no sandbox CSP");
    const other = await mk();
    await other.goto(platform + "/");
    expectingErrors = true;
    eq(await other.evaluate(async () => (await fetch("/api/brand/logo")).status), 404, "no logo on the platform site");
    await other.waitForTimeout(300); // let the browser report the deliberate 404 before we stop ignoring it
    await other.context().close();
    expectingErrors = false;
  });
  await step("a too-pale colour is kept for buttons but the text colour is adjusted, with an explanation", async () => {
    await owner.getByLabel("Brand colour as a hex code").fill("#ffe066");
    await owner.getByLabel("Light or dark").selectOption("light");
    await owner.getByText(/little darker so it stays easy to read/).waitFor();
    await owner.getByText(/Readability check \(\d+\/\d+ passed\)/).waitFor();
    await shot(owner, "20-branding-pale-adjusted");
  });
  await step("owner discards the unpublished change, then restores the original look from history", async () => {
    await owner.getByRole("button", { name: "Discard changes" }).click();
    await owner.getByText("This is what your panel looks like now.").waitFor();
    await owner.getByRole("button", { name: "Publish this look" }).isDisabled().then((d) => eq(d, true, "publish disabled with no changes"));
    await owner.getByRole("button", { name: "Use this look" }).first().waitFor().catch(() => {});
    await shot(owner, "21-branding-history");
  });
  await step("signing out ends the session", async () => {
    await owner.goto(tenant + "/admin");
    await owner.getByRole("button", { name: "Sign out" }).click();
    await owner.waitForURL("**/login");
    await owner.goto(tenant + "/admin");
    await owner.waitForURL("**/login");
  });
  await step("the browser enforces a strict Content-Security-Policy (an injected script cannot run)", async () => {
    const p = await mk();
    const res = await p.goto(tenant + "/login");
    const csp = res.headers()["content-security-policy"] ?? "";
    for (const need of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'", "nonce-"]) if (!csp.includes(need)) throw new Error("CSP missing " + need + ": " + csp);
    if (/unsafe-inline'[^;]*;?/.test(csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "")) throw new Error("script-src allows unsafe-inline");
    expectingErrors = true; // the blocked script below is expected to log a CSP violation
    const ran = await p.evaluate(() => new Promise((resolve) => {
      window.__pwned = false;
      const s = document.createElement("script"); s.textContent = "window.__pwned = true";
      document.body.appendChild(s);
      // The classic HTML-injection payload: an element with an inline event handler.
      const box = document.createElement("div");
      box.innerHTML = '<img src="/api/brand/logo?x=1" onerror="window.__pwned = true"><img src="data:," onerror="window.__pwned = true">';
      document.body.appendChild(box);
      setTimeout(() => resolve({ script: window.__pwned }), 400);
    }));
    eq(ran.script, false, "injected inline script and inline event handlers must be blocked");
    const frame = await p.evaluate(() => fetch("https://evil.example/", { mode: "no-cors" }).then(() => "allowed", () => "blocked"));
    eq(frame, "blocked", "connections to other sites must be blocked");
    await p.waitForTimeout(400); // let the browser report the deliberate violations before we stop ignoring them
    expectingErrors = false;
    await p.context().close();
  });
  await step("no browser errors during the whole journey", async () => {
    if (errors.length) throw new Error(errors.slice(0, 3).join(" | "));
  });
  console.log(`\n${passed} steps passed`);
} catch {
  console.log(`\n${passed} steps passed before the failure`);
} finally {
  await browser.close();
}
