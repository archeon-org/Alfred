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

## Revision History

- 2026-09-16: keyboard shortcut bindings reuse this pattern under their own key
  `alfred.shortcuts.v1` (`version: 1`, at most one bounded `{ code, shift, label }` per known
  action, decoded by `decodeShortcutPreferences`). Same store factory, cross-tab synchronization,
  reset and storage-failure behaviour; the record still holds no identity or content. Bindings are
  validated against a reserved-key table before they are stored (`checkBinding`).

## Revision 2026-09-16: chat display preferences

Validated with the product owner on 2026-09-16 (stored in the browser, Standard by default). A
second bounded record, `alfred.chat.v1`, holds how much of an answer's work the transcript shows:
a detail level (`simple`, `standard`, `detailed`) and four display switches (reasoning,
intermediate messages, empty generations, folding the work log once the answer is complete). It
follows this ADR's model unchanged: versioned parser with safe defaults, shared store with
cross-tab updates, volatile fallback when storage is unavailable, reset of its own key only, no
account synchronization. It changes display only: the API still records and streams the whole
work log (ADR 0023), so a person can switch mode at any time, including for stored answers.
ALF-DEC-037 (`accepted-with-risk`) governs what is recorded and is unaffected; ALF-DEC-008
(`in-discussion`) is not decided by a presentation filter. The register's direction that user
preferences are canonical at the Product boundary targets preferences that shape the agent; like
appearance, these presentation choices stay browser-local, and account synchronization would need
a Product API and a new decision.

### Revision 2026-09-17: presets as combinations, Alfred and specialists apart

On the owner's review, choosing a preset had no visible effect on the switches and a settled answer
looked the same in Simple and Standard. The record becomes version 2 under the same key: ten
switches (open the log while working, open reasoning while it is written, fold at the end;
Alfred's reasoning, intermediate messages, tools and empty generations; the specialists'
reasoning, messages and tools) and a `detail` that names the preset whose switches it holds,
or `custom`. Choosing Simple, Standard or Détaillé sets all ten switches; changing one switch
turns the detail into Personnalisé unless the result matches a preset exactly. Specialists
themselves always stay listed. Standard (default) shows Alfred's reasoning, messages and tools
and the specialists' messages and tools, without specialist reasoning or empty generations.
Version 1 records are migrated (their shared switches apply to Alfred and specialists alike).
