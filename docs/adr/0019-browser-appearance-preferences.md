# ADR 0019: Browser Appearance Preferences

- Status: Accepted
- Date: 2026-09-10
- Complements: [ADR 0011](0011-frontend-design-system.md)
- Architecture constraints: ALF-DEC-001, ALF-DEC-004 and ALF-DEC-049 (`accepted`).

## Decision

Keep non-sensitive visual preferences in the browser under `alfred.appearance.v1`. This bounded
record contains the theme, accent preset, navigation density, reading width, reduced motion and
context-panel default. It contains no identity, credentials, conversation content or personal
instructions. Product authorization and server-owned context documents keep their existing paths;
local preferences confer no permissions and do not depend on gateway deployment.

A reusable React `useLocalStorage` hook subscribes to an injectable storage adapter. A domain
parser validates supported versions and allowed values. The adapter publishes changes to consumers
in the same tab and observes storage events from other tabs. Corrupt records use safe defaults;
unavailable storage retains volatile state and surfaces the persistence limitation. Reset removes
only the appearance key. These settings belong to the browser profile, not an authenticated account.

Root semantic tokens apply themes to the complete application, including portal-mounted menus and
dialogs. The default remains light sage. System mode is an explicit opt-in. OS reduced motion takes
precedence over the application toggle. Reading width remains bounded and compact navigation
preserves touch hit areas. No UI or state-management dependency is added.

The protected settings route owns its full viewport, with dedicated section navigation and no
conversation/context panels. It shares `SidebarFrame` with the ordinary workspace, retaining the
same brand, personal-space identity and bottom footer; only navigation content changes. Accent
presets tint neutral surfaces and the full sidebar palette in light mode. Dark mode uses one
layered charcoal achromatic surface palette; accents are limited to action details and focus indicators. Personal instructions remain server-backed in their own section.
This supersedes ADR 0011's temporary light-only and non-persistent appearance restrictions.

## Verification and Limits

Verify storage failure/corruption, cross-tab synchronization, reset, OS theme changes, actual layout
changes, responsive routing, portal themes and semantic contrast pairs. The contract adds no account
synchronization, remote branding, product flags, or runtime configuration. The existing discrepancy
between DEC-049's opaque-session target and ADR 0003 remains outside this presentation slice.
