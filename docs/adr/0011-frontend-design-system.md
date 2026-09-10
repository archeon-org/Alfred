# ADR 0011: One Local Frontend Design System

- Status: Accepted
- Date: 2026-09-05
- Appearance restrictions superseded by: [ADR 0019](0019-browser-appearance-preferences.md)
- Complements: [ADR 0009](0009-application-and-test-topology.md)

## Context

The workspace preview and authentication views used separate color vocabularies, while local
primitives mixed shadcn components and earlier bespoke equivalents. The architecture target also
pointed at both `features/*` and responsibility-based folders, and at an unneeded shared UI package.
This made routine presentation changes introduce more overrides and competing conventions.

## Decision

- Use locally owned shadcn/ui primitives in `apps/web/src/components/ui` as the common starting
  point. Customize through semantic tokens and typed variants, preserving accessible behavior.
- When no shadcn component fits, compose existing primitives or build a local component with
  Tailwind. Do not install another UI library solely to supply a missing widget.
- Keep the implementation dependencies of shadcn primitives, such as Radix and
  `react-resizable-panels`. They are not competing visual systems. New dependencies still need a
  concrete justification; generated code is reviewed before adoption.
- Centralize colors and shared visual scales in `apps/web/src/styles.css`. JSX consumes semantic
  role tokens, not raw colors or palette names. Plain CSS is reserved for documented global rules,
  theme scope and complex effects such as keyframes.
- Preserve the current light sage appearance, dimensional surfaces and responsive feedback.
  A dark OS preference must not activate partial dark styles. Additional themes remain future work.
- Group workspace UI under `components/workspace/{conversation,navigation,context,header}`;
  retain hooks, services and pure types under their responsibility/domain boundaries. Introduce
  neither a parallel `features` root nor `packages/ui` without a concrete shared consumer.
- Keep preview data explicitly in `src/mock` while the product remains a presentation preview.
  It is not an error fallback. Local hooks remain appropriate; no speculative client-state library
  or persistence is introduced.

## Consequences

A shared primitive behaves consistently on authentication and workspace surfaces. Domain components
can remain custom without creating a second design system. Color and motion changes have one
controlled entry point; reduced motion, focus visibility and press feedback remain part of the
component contract.

The [frontend guidelines](../development/frontend-guidelines.md) are the implementation reference.
They supersede conflicting UI-placement, theme and styling assumptions in the earlier architecture
target. This decision does not implement future AG-UI, editors, branding presets or real workspace
persistence, and does not claim a full accessibility certification.
