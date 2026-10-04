# DESIGN

Design system and theme specification for the reseller panel. Companion to [ARCHITECTURE.md](ARCHITECTURE.md) section 9.

## 1. Design goals
- **Fast for power users:** resellers place many orders daily; density and keyboard flow beat decoration.
- **Trustworthy:** it handles money; clear states, no ambiguity about balances and order status.
- **Brandable without breakage:** tenants change look through tokens; layout and behavior stay consistent.
- **Mobile-ready:** most resellers work from phones.

## 2. Token model
Three layers, stored as a JSON document (W3C Design Tokens format) and compiled to CSS variables.

1. **Primitive:** raw values (`color.blue.600`, `space.4`, `radius.md`).
2. **Semantic:** meaning (`surface.default`, `text.muted`, `accent.primary`, `state.danger`).
3. **Component:** per-component choices (`button.radius`, `table.row-height`).

Tenants edit only a curated subset (see section 4). Platform-level tokens (focus ring, minimum touch target) are locked.

## 3. Default token set
| Group | Tokens |
|---|---|
| Color | `surface.default`, `surface.raised`, `surface.sunken`, `text.default`, `text.muted`, `text.inverse`, `border.default`, `accent.primary`, `accent.primary-hover`, `state.success`, `state.warning`, `state.danger`, `state.info` |
| Type | `font.sans`, `font.mono`, scale 12/14/16/18/20/24/30/36, weights 400/500/600/700, line heights 1.25/1.5 |
| Space | 4-pt scale: 0, 4, 8, 12, 16, 24, 32, 48, 64 |
| Radius | `none`, `sm` 4, `md` 8, `lg` 12, `full` |
| Elevation | `none`, `sm`, `md`, `lg` (subtle; no heavy shadows) |
| Motion | `fast` 120 ms, `base` 200 ms, easing `ease-out`; respects `prefers-reduced-motion` |
| Density | `comfortable` (row 48 px), `compact` (row 36 px), `trader` (row 28 px) |

Starting palette (adjustable; must pass contrast): primary indigo `#4F46E5`, success `#16A34A`, warning `#D97706`, danger `#DC2626`, neutrals from slate.

## 4. What a tenant can change
| Allowed | Locked |
|---|---|
| Logo, favicon, name | Layout skeleton and navigation structure |
| Accent color and neutral tint | Focus ring, error and success semantics |
| Font from approved list | Minimum contrast and touch-target sizes |
| Radius, density preset | Order status colors' meaning |
| Light, dark or auto mode | Security-related UI (auth, step-up prompts) |
| Landing blocks (hero, pricing, FAQ, contact) from approved set | Any custom script or CSS injection |

## 5. Presets
- **Light**: default, high legibility.
- **Dark**: true dark surfaces, same accent logic.
- **Trader**: compact density, mono numerals, high-contrast tables, minimal animation.
Premium themes (paid) are additional token documents plus approved block layouts.

## 6. Validation rules (run on save)
- Text on surface contrast at least 4.5:1; large text and UI components at least 3:1.
- Accent on `accent.primary` text at least 4.5:1.
- Reject unknown tokens, out-of-range values and non-approved fonts.
- Show a live preview and a pass/fail contrast report before publish; keep version history with one-click rollback.

## 7. Layout and navigation
- **Reseller app:** top bar (balance, notifications, account), left rail on desktop and bottom tab bar on mobile: Dashboard, New order, Orders, Wallet/Funds, API, Support.
- **Tenant admin:** left rail: Overview, Orders, Customers, Services and pricing, Suppliers, Themes, Billing, Settings, Audit log.
- Breakpoints: 360, 640, 1024, 1440.

## 8. Key screens
1. **Dashboard:** balance, today's orders, success rate, supplier health strip.
2. **New order:** service search (fuzzy), single form, bulk paste/CSV with row-level validation.
3. **Orders:** filterable, sortable, virtualized table; live status chips; export.
4. **Order detail:** timeline of state changes, refund status, supplier reference.
5. **Services and pricing (admin):** markup rules per customer group, bulk edit with preview of margin.
6. **Theme editor:** token controls, preview, contrast report, publish and rollback.
7. **Suppliers:** connection status, health score, failover rules.

## 9. Components (v1)
Button, Input, Select, Combobox, Textarea, Checkbox, Switch, Table (virtualized), Tabs, Dialog, Drawer, Toast, Badge/Status chip, Card, Skeleton, Empty state, Pagination, Date range, CSV uploader, Code block (API key and webhook samples).

## 10. States and content
- Every screen defines loading (skeleton), empty (with next action), error (with retry) and success.
- Status chips: `Pending`, `Processing`, `Completed`, `Rejected`, `Refunded`, always with an icon and text, never color alone.
- Money always shows currency and uses tabular numerals; negative and zero are visually distinct.
- Tone: short, direct, no jargon; English first, i18n-ready strings (Hindi and Kannada next).

## 11. Accessibility
- WCAG 2.2 AA; full keyboard navigation; logical focus order; 2 px visible focus ring.
- Touch targets at least 44 px on mobile.
- Screen-reader labels for icon buttons and live regions for status updates.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.

## 12. Performance budget
- Largest contentful paint under 2.5 s on mid-range mobile over 4G.
- Initial JS under 170 KB gzipped for the reseller dashboard.
- Theme CSS under 10 KB, cached at the edge.
