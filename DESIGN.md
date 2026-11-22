# Design: CollabSense (PostHog-Inspired Engineering Sketchbook System)

The locked system from user-provided `DESIGN.md`. Every Hallmark run reads this first and all pages share it.

## System
- Genre: modern-minimal
- Shape of the first page: Feature Stack (hero without top navbar, product workbench, deterministic RICE sandbox, 8-stage pipeline, pricing tier calculator, 6-column footer)
- Theme: custom (vibe: "warm cream sketchbook with olive ink and yellow-orange pill")
- Axes: light/grotesk-sans/warm · posture: restrained

## Palette & Surface Roles (from DESIGN.md)
- Canvas (`--color-paper` / `--color-desk`): `#eeefe9` (`oklch(95.1% 0.008 106)`) — warm cream page background end-to-end
- Soft Surface (`--color-paper-2`): `#e5e7e0` (`oklch(92.6% 0.009 108)`) — secondary surface, tab strip, inline code chip
- Surface Card (`--color-cotton`): `#ffffff` (`oklch(99.5% 0.005 106)`) — flat white card on cream canvas with 1px hairline border (`#bfc1b7`), zero drop shadow
- Surface Doc (`--color-paper-3`): `#fcfcfa` (`oklch(98.8% 0.005 106)`) — warm-white doc/PRD article body card
- Surface Dark (`--color-board`): `#23251d` (`oklch(26.1% 0.015 118)`) — inverted deep olive-charcoal code block background with `#ffffff` (`--color-board-type`) text
- Hairline (`--color-rule`): `#bfc1b7` (`oklch(80.8% 0.012 112)`) — 1px card border, table rule, footer divider
- Hairline Soft (`--color-rule-2`): `#dcdfd2` (`oklch(89.8% 0.013 114)`) — in-card row divider
- Primary CTA (`--color-accent`): `#f7a501` (`oklch(78.2% 0.165 73)`) — universal primary CTA pill with deep olive text (`--color-accent-ink`: `#23251d`)
- Primary Pressed (`--color-accent-pressed`): `#dd9001` (`oklch(72.1% 0.155 72)`)
- Primary Active (`--color-accent-active`): `#b17816` (`oklch(62.4% 0.128 73)`)
- Ink (`--color-ink`): `#23251d` (`oklch(26.1% 0.015 118)`) — deep olive-charcoal headlines and primary labels
- Body (`--color-ink-2`): `#4d4f46` (`oklch(42.5% 0.015 115)`) — olive-gray paragraph text
- Mute (`--color-muted`): `#57594f` (`oklch(46.5% 0.015 112)`) — metadata, captions, secondary annotations (WCAG AA on both cream and soft surface)
- Semantic Callout Pastels:
  - Blue Tip (`--color-info` / `--color-info-soft`): `#1d4ed8` / `#dceaf6`
  - Green Success (`--color-success` / `--color-success-soft`): `#216e4e` / `#d9eddf`
  - Red Warning (`--color-error` / `--color-error-soft`): `#a82e26` / `#f7d6d3`
  - Purple Note (`--color-purple` / `--color-purple-soft`): `#63328a` / `#e7d8ee`

## Typography
- Primary Face (`--font-display`, `--font-body`, `--font-ui`): `"IBM Plex Sans", -apple-system, BlinkMacSystemFont, sans-serif` (weights 400, 500, 600, 700, 800)
- Code Face (`--font-outlier`, `--font-mono`): `"Source Code Pro", ui-monospace, monospace` (14px / 1.43 line-height)

## Elevation & Shapes
- Cards sit flat on cream (`#eeefe9`) with `1px solid #bfc1b7` borders and `6px` (`--radius-card`) radius — no drop shadows.
- Hand-drawn hedgehog mascots in lab coats, terminals, magnifying glasses, and lounge chairs anchor feature cards and empty states.
