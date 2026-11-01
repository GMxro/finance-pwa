---
name: User Preferences
description: User's expectations for audit depth, evidence-based reporting, and fix verification
type: feedback
date: 2026-10-31
review_after: 2027-05-01
---

## Communication Style

- **Language**: Spanish (Argentine dialect). Use "criollo" — plain everyday language, no unnecessary technical jargon.
- **Recaps**: Direct, simple, well-structured. If technical, re-explain in plain terms.
- **Tone**: User uses informal/affectionate nicknames ("papito", "papá") — **agent must NOT mirror these**. Keep professional but warm.

## Audit & Investigation Expectations

- **Depth**: Not superficial. "Investigá el funcionamiento real... siguiendo cada funcionalidad desde la interfaz hasta el servidor y la base de datos."
- **Evidence**: Every finding must cite file:line. Distinguish "confirmed in code" from "risk not reproducible statically."
- **No assumptions**: "No des por segura una operación simplemente porque la interfaz impida realizarla." "No inventes vulnerabilidades ni afirmes que algo funciona sin evidencia."
- **Static-first**: Prioritize code analysis over runtime tests. No destructive tests against production. Never claim runtime verification when only static inspection was done.
- **Prioritization**: Classify by severity, impact, estimated fix difficulty. Propose concrete correction plan.
- **Parallel coordination**: Up to 6 subagents, assigned by screen/related interfaces, balanced by real complexity. Avoid concurrent edits to the same file; centralize shared-component fixes in the main agent; main agent consolidates and resolves cross-interface issues.
- **Per-element diagnosis**: For every interactive element follow the full flow (event → final effects), including blocking conditions, silent errors, and post-update UI. A handler attached ≠ functional.
- **Regression focus**: When recent security/perf/arch changes broke things, investigate validations/permissions blocking legit ops, auth/session, endpoint/contract changes, state not updating, shared hooks/contexts, error handling, async silent failures, sync/persistence, visually-enabled-but-inert elements, and overlays blocking interaction.
- **Correction priority**: Restore full functionality before optimizations/refactors. Respect architecture; keep security protections; don't disable necessary validations. No unnecessary compatibility, temp code, artificial fallbacks, or superficial fixes. Centralize shared-component fixes.
- **Final review**: No screen left unaudited; interaction inventory; which were broken vs working; verify corrections by code inspection; cross-screen consistency; document residual uncertainty.

## Fix Ownership & Verification

- **End-to-end ownership**: "Arreglátelas como puedas" — fix in source code (rebuild + restart) and verify live. Don't offload manual steps (cache purge, hard refresh, token requests) to user.
- **Evidence-based reporting**: PASS/FAIL tables, exact outputs, log evidence. Never blind retries; show errors and offer rollback paths.
- **Credentials**: When given (e.g., sudo), use ONLY for authorized action. Never save/reference in files or memory.
- **Sudo in this env**: Works via `echo PASSWORD | sudo -S <cmd>`. If "Sorry, try again" → piped password failed PAM. Stop and report (watch lockout). Fresh `sudo -k` validates truly.

## Autonomous Operation Preferences

- **Continuous loop**: "No te detengas, quiero un loop indeterminado." Keep scanning/analyzing without stopping.
- **Human intervention only for blockers**: Missing secrets, irreversible actions, security limits.
- **High vigilance when FLAT**: 10–15 min scan intervals (not 90 min). Goal: reduce blind time, more observations, better reaction — NOT more trading.
- **Strict risk management**: No FOMO, R:R >= 2:1. Never relax filters/criteria.

## Technical Environment (User's Homelab)

- **Hardware**: AMD A12-9700P (4 cores @ 2.5 GHz), 11 GB RAM (~8.6 GB free), 207 GB disk (131 GB free), no dedicated GPU, x86_64
- **Docker**: User in `docker` group (no sudo for containers)
- **Network**: LAN `192.168.0.167` (DHCP, was `.118` until 2026-10-21 — check `hostname -I` if CORS breaks), Tailscale `100.84.42.97`
- **Coder**: Runs as `coder-web.service` systemd unit
- **PhotoCraft**: MCP server `photocraft` (headless CLI), web UI on `:8091` (Docker)
- **OpenDesign**: Daemon `od` on `:7456` (Docker), MCP tools `open-design_*`, web auth disabled (`OPEN_DESIGN_DISABLE_API_AUTH=1`), token in `~/open-design/deploy/.env` — **never store in memory**

## Project-Specific (finance-pwa)

- **Scope**: Personal finance PWA — transactions, budgets, categories, accounts, transfers, statistics, sync, export, account deletion
- **Stack**: Cloudflare Workers + D1 + R2, React + TypeScript + Vite, IndexedDB (Dexie) for offline
- **Quality gates**: `npm test` (99 tests), `npm run typecheck`, `npm run lint` (`--max-warnings 0`)
- **Current state**: Two static functional audits completed (no builds/tests/browser). Pass 1: 24 corrections (onboarding redirect, session bootstrap, legal acceptance state, CSV download, "Más" menu close, modal backdrop, currency input render loop, USD locale, Overview server summary + error propagation, Statistics 20-page cap, account totals overflow guards + save loading, delete loading, pending badge, categories empty state, DangerZone busy, error-handler HTTP mapping, account-delete status session/ownership, sync fullSync tombstones). Pass 2: 26 additional corrections, including TS errors introduced by pass 1 (Overview `currentSummary`/`loading`), getMonthlySummary overflow guards, MonthStepper limits, Modal `busy` prop, cross-currency transfer validation (client+server+contract refine), account-deletion recovery-key ordering, syncNow error state, SettingsPage object URL, error-handler HTTPException `name`, account route user cast. Runtime verification still pending.
- **Unverified**: Browser E2E (UI behavior, focus, modals, touch/mobile), multi-device sync, production D1 (concurrency of slug race), concurrent load, PWA update flow, timezone runtime behavior of `todayLocalISO`, D1 schema/migrations remote state, offline sync of budgets/categories (no client sync for these entities), APP_VERSION in dev resolving to `0.0.0` vs MIN_APP_VERSION. (DangerZone/Settings flows now confirmed by code inspection in pass 2, not by browser.)
- **Known gaps / pending decisions (not yet implemented)**: transfers have no UI in TransactionsPage; offline edit/delete of transactions not queued (only create); Overview import toggle has state without setter; `getMonthlySummary` returns only first currency when none specified; no overdraft control in transfers (allows negative balances); totals include archived accounts (debatable); transfer note 120 chars client vs 500 server; `domain/budget.ts` unused (dead code, divergence risk); `MARKER_FAILED` not mapped in error-handler; `pushOutbox` doesn't handle specific error codes; `pullChanges` merge strategy pending; StatisticsPage rejects exactly 2000 movements as incomplete; Overview `previousSummary` unused (lint warning); server `byCategory` unused in Overview.

## Things User Dislikes / Red Flags

- ❌ "Parches superficiales" / "soluciones provisionales"
- ❌ Duplicación innecesaria de lógica
- ❌ Sacrificar funcionamiento offline para simplificar
- ❌ Descartar operaciones pendientes legítimas
- ❌ Complejidad arquitectónica sin justificación
- ❌ Dependencias/servicios externos sin razón clara
- ❌ Afirmar que algo está verificado sin evidencia (navegador real, entorno desplegado)
- ❌ Cifrado superficial que da falsa sensación de seguridad

## Things User Values

- ✅ Corrección de causas, no solo síntomas
- ✅ Preservar funcionalidades y datos existentes
- ✅ Compatibilidad y migración al cambiar datos persistidos
- ✅ Servidor como autoridad, sin perder capacidad offline
- ✅ Errores/conflictos tratados explícitamente (no operaciones fallidas como exitosas)
- ✅ Pruebas de regresión para lo corregido
- ✅ Honestidad sobre límites: "dejarlo identificado como pendiente en lugar de afirmar que está verificado"