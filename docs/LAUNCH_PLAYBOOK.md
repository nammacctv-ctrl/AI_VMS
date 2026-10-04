# Launch Playbook: delivering to your first 15 resellers

Written for the owner of Namma CCTV Private Limited. Plain language, no technical knowledge needed.

## The honest starting point

Do not pretend to be a veteran of the industry. Resellers can tell, and being caught pretending costs more trust than being new. Your real strengths are enough:

- You are a **registered company** (Namma CCTV Private Limited), not an anonymous Telegram seller.
- You have **15 resellers** who already agreed to talk to you.
- You have **two working suppliers**.
- You are building a **modern panel** with things old panels lack: live order status, bulk ordering, an activity log, two-factor login and a clean look.

Say it like this: *"We are a new platform from an established company. We are starting with a small group of founding partners so we can give each of you personal attention."* A small, careful launch looks confident. A big, loud launch that breaks looks new.

## What the platform can and cannot do today

| Ready and tested | Not ready yet |
|---|---|
| Sign up, log in, two-factor, staff and reseller accounts by invitation | Password reset by email (for now you reset access by removing and re-inviting a person) |
| Placing orders with IMEI checking, duplicate protection and automatic refund on failure | Connecting to your two suppliers automatically (staff fulfil orders by hand for now) |
| Reseller credit that staff add after a payment (no money passes through the platform) | Bulk ordering, order notifications, emailed invitations (you send the link yourself) |
| Service catalog, your cost, per-group prices, per-service overrides | Password reset by email, backups |
| API keys for resellers who want to connect their own bots | Billing for your own subscriptions |
| Activity log of every important action | |
| Screens for resellers (phone and desktop) and for you: order queue, customers and credit, prices, activity log | A real server, a domain, backups |
| Branding: your business name, logo, colours and look, with live preview and one-click restore (no files, no developer) | |
| Deployment files for a VPS | |

**Do not take real customer money or real orders until the "not ready" column is built and tested.** Next build steps, in order: (1) the two supplier connections, (2) password reset, backups and putting it on a real server, (3) bulk ordering and notifications.

## Before you contact anyone: your 10 minutes of credibility

Have these ready. Each one makes a new business look established.

1. **A logo.** Upload it under Branding (PNG, JPG or WebP, under 200 KB, ideally wide with a transparent background) and pick your brand colour. This single step makes the panel look like *your* company.
2. **A domain and email**, for example `panel.yourbrand.in` and `support@yourbrand.in`. Not a Gmail address.
3. **A one-page price list** per customer group (Gold, Standard) with delivery times written as ranges ("usually 10 to 60 minutes"), never a promise of exact minutes.
4. **Terms of service, refund policy and privacy policy.** Ask your lawyer. These also answer the legal question about which services you may list. Do not skip this.
5. **GST-registered invoices** with your company name, address and GSTIN.
6. **A support promise you can keep**, for example "Replies within 2 hours, 10am to 10pm, Monday to Saturday". Keep it small and keep it.
7. **A WhatsApp support group** per cohort of resellers, and a named person who answers.

## Rollout in three waves

**Wave 0 (before building is finished): the conversation.**
Call or meet all 15. Ask, do not sell:
- Which services do you sell most? Which suppliers do you use today?
- What annoys you about your current panel?
- What would make you move 20% of your volume to us?
- What would make you trust a new platform?

Write the answers down. They are the best product guide you have. Offer a **founding-partner deal**: for example 3 months at half price, a say in new features, and direct access to you. Ask for a small deposit from those who are serious.

**Wave 1: five resellers, two weeks.**
Pick the five friendliest. Onboard them yourself, one by one, on a call. Process their first orders personally and watch each one finish. Fix every problem the same day and tell them what you fixed. Five happy resellers are your reference.

**Wave 2: the other ten.**
Only after wave 1 runs two weeks without a serious incident. Use the wave 1 resellers as references ("ask them about us"). Send each new reseller a short welcome message and a 5-minute video of the panel.

## The onboarding call (30 minutes)

1. Create their account (you send the invitation, they choose their password).
2. Turn on two-factor login together. Tell them it protects their balance.
3. Show the price list and how bulk ordering works.
4. Place one small real order together and watch the status change.
5. Show how to reach you, and what a normal delivery time is.
6. Ask: "What is one thing you would change?" and write it down.

## How to look experienced from day one

- **Be fast and calm with problems.** Say "I am checking with the supplier, I will update you in 30 minutes", then do. Speed of reply matters more than never failing.
- **Never overpromise.** "Usually 10 to 60 minutes" beats "instant". Late is a broken promise; early is a pleasant surprise.
- **Refund quickly and without argument** when a supplier fails. A fast refund builds more trust than a perfect record.
- **Check supplier balances every morning** so a service never fails just because credit ran out.
- **Keep a status message ready**: "Supplier X is slow today, expected back by 4pm". Telling resellers first prevents angry messages.
- **Write down every incident** (what happened, what you did, what you changed). Share a short summary with resellers. This is how professional operators behave.
- **Use industry words correctly.** Learn the five terms your resellers use daily (service, credit, supplier, API key, refund) and use them. Ask when unsure; resellers respect a person who asks.
- **Show the activity log and security.** Two-factor login and a record of every action are things old panels often lack. Mention them.

## Things not to do

- Do not claim years of experience, big numbers or customers you do not have.
- Do not promise a feature that is not built. Say "planned for next month" and give a date you can meet.
- Do not give discounts so deep that you sell below cost. The platform raises any price below cost to cost, but your own side deals are your responsibility.
- Do not list a service until your lawyer approves the category.
- Do not give anyone the owner login. Create admin or support accounts instead.

## Go-live checklist (all must be yes)

- [ ] You have placed and fulfilled small real orders yourself on the live server
- [ ] Both suppliers connected, and one failed order tested end to end with a refund
- [ ] Daily database backup running, and a restore tested once
- [ ] Encryption key and passwords saved in a safe place (password manager plus offline copy)
- [ ] Terms, refund policy and privacy policy published; lawyer has approved the service list
- [ ] Support email and WhatsApp group working; someone assigned each day
- [ ] You have placed 20 small test orders yourself without a problem
- [ ] A plan if something breaks: who to call, and a message ready to send to resellers

## First 30 days: what to measure weekly

- Orders per day and percent completed successfully (target 95% or better)
- Average delivery time per service
- Support messages per day and average reply time (target under 2 hours)
- Refunds and the reasons for each
- One sentence from each reseller: "What would you change?"

If success rate drops below 90% or replies take over half a day, pause wave 2 and fix the cause first.
