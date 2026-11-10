# Accessibility & Interaction Audit — finance-pwa

Scope: touch targets, contrast (WCAG AA), input font sizes, focus/labels, disabled & loading states, aria on eye button. Static evidence only (CSS/TSX reads + grep). No code changes.

## Method
- Grep: `aria-`, `tabindex`/`tabIndex`, `font-size`, `outline`, `disabled`/`loading`, `Eye`.
- Read: tokens.css, Button.css/.tsx, Input.css/.tsx, overview.css, offline.html, AppShell.css, Notice.css, transactions.css, Modal.css/.tsx, Select.css, Status, Money, MonthStepper, RadioGroup, SegmentedControl, LoadingSpinner.
- Contrast computed with WCAG relative luminance formula.

## Findings (issues)

### A11Y-01 — Button size variants below 44 px touch target
- Evidence: `src/client/shared/ui/Button.css:34` `.ui-btn--sm { min-height: var(--control-h-sm); ... }`; `:35` `.ui-btn--md { min-height: var(--control-h-md); ... }`. `src/client/app/styles/tokens.css:102-103` `--control-h-sm: 32px; --control-h-md: 40px;`.
- Impact: sm (32) and md (40) buttons fall under the 44 px minimum; used for primary actions in dense lists/forms.

### A11Y-02 — IconButton `sm` variant 40×40
- Evidence: `Button.css:166-169` `.ui-icon-btn--sm { width: var(--control-h-md); height: var(--control-h-md); }` (=40 px). Base `.ui-icon-btn` is 44 px (`Button.css:147-148`).
- Impact: edit/archive/delete icon actions in LedgerList, Categories, Accounts, Budgets at 40 px.

### A11Y-03 — Overview "eye" toggle 36×36
- Evidence: `src/client/app/styles/overview.css:104-105` `.overview-hero__eye { width: 36px; height: 36px; }`.
- Note: aria is correct (see Verified). Only size is sub-44.

### A11Y-04 — Notice close button 32×32
- Evidence: `src/client/shared/ui/Notice.css:38-39` `.ui-notice__close { width: 32px; height: 32px; }`.

### A11Y-05 — AppShell more-menu items and sync button 40 px
- Evidence: `src/client/app/layouts/AppShell.css:93` `.ui-appshell__sync-btn { min-height: var(--control-h-md); }` (40); `:287` `.ui-appshell__more-item { min-height: var(--control-h-md); }` (40).

### A11Y-06 — Transaction compact chips 28 px min-height
- Evidence: `src/client/app/styles/transactions.css:315` `.tx-compact-chip { min-height: 28px; }`.

### A11Y-07 — Low contrast in `offline.html`
- Evidence: `public/offline.html:22` `color: #85898b;` on white background (`:10` `background: #ffffff;`); icon `:34` same color. Computed ratio 3.53:1 (<4.5:1 body).
- Also `.offline-container p` line 22.

### A11Y-08 — Placeholder text below contrast threshold
- Evidence: `src/client/app/styles/tokens.css:99` `--color-stone-light: #9b9b9b;`; `src/client/shared/ui/Input.css:56-57` `.ui-field__input::placeholder { color: var(--color-stone-light); }`. Computed 2.78:1 on white.

### A11Y-09 — Disabled button opacity lowers contrast (best-practice; WCAG exempts inactive controls)
- Evidence: `src/client/shared/ui/Button.css:29-31` `.ui-btn:disabled { opacity: 0.45; ... }`. Effective ink-on-white ≈3.2:1. Also `IconButton.css:189` opacity 0.4 for disabled.

### A11Y-10 — No skip-to-content link
- Evidence: grep for `skip`/`saltar` across `*.tsx` and `*.css` returned no matches. No skip link present in AppShell.

## Verified OK (evidence)
- **A11Y-OK-1 Inputs 16 px (iOS zoom)**: `Input.css:48` `font-size: var(--text-input)`; `Select.css:13` same; tokens `--text-input: 1rem`. Evidence grep shows no input/textarea/select using `--text-body`/`--text-caption`.
- **A11Y-OK-2 Eye button aria**: `OverviewPage.tsx:186` `aria-label={showAmounts ? 'Ocultar montos' : 'Mostrar montos'}`; `:187` `aria-pressed={showAmounts}`; icon `aria-hidden="true"`. Labels and pressed state present.
- **A11Y-OK-3 Focus styles**: global `:focus-visible` outline in base.css; components replace outline with border/box-shadow focus ring (e.g. `Input.css:60-64`). No `outline: none` without replacement observed.
- **A11Y-OK-4 Labels on icon buttons**: `Button.tsx:88` `aria-label={label}`; all IconButton call sites pass `label` (LedgerList, Categories, Accounts, Budgets). Modal close `aria-label="Cerrar"` (`Modal.tsx:231`).
- **A11Y-OK-5 Disabled/loading**: Button `aria-busy` + `disabled` (Button.tsx); LoadingSpinner `role="status"` + `aria-label` (LoadingSpinner.tsx:11,20). Modal `busy` disables close/overlay/escape (Modal.tsx).
- **A11Y-OK-6 Semantics**: RadioGroup uses `fieldset`/`legend`; SegmentedControl `role="group"` + `aria-pressed`; Select trigger `aria-haspopup`/`aria-expanded`. `index.html` `lang="es-AR"`.

## Unverified / out of scope
- Color contrast of `--color-stone` (#6e6e6e) on `--color-inset` (#f5f5f5) computed 4.68:1 (pass, borderline) — not flagged.
- Touch targets in Calendar day cells (~51×48) not measured against actual rendered width; CSS min-height 48 px only.
- Screen-reader announcement of censored Money amounts not tested (no live region).
- No automated axe/pa11y run performed (no test infra in repo).
