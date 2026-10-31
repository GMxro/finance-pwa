---
name: User Preferences
description: User's expectations for audit depth, evidence-based reporting, and fix verification
type: feedback
date: 2026-10-31
review_after: 2027-04-30
---

## Communication Style

- **Language**: Spanish (Argentine dialect). Use "criollo" — plain everyday language, no unnecessary technical jargon.
- **Recaps**: Direct, simple, well-structured. If technical, re-explain in plain terms.
- **Tone**: User uses informal/affectionate nicknames ("papito", "papá") — **agent must NOT mirror these**. Keep professional but warm.

## Audit & Investigation Expectations

- **Depth**: Not superficial. "Investigá el funcionamiento real... siguiendo cada funcionalidad desde la interfaz hasta el servidor y la base de datos."
- **Evidence**: Every finding must cite file:line. Distinguish "confirmed in code" from "risk not reproducible statically."
- **No assumptions**: "No des por segura una operación simplemente porque la interfaz impida realizarla." "No inventes vulnerabilidades ni afirmes que algo funciona sin evidencia."
- **Static-first**: Prioritize code analysis over runtime tests. No destructive tests against production.
- **Prioritization**: Classify by severity, impact, estimated fix difficulty. Propose concrete correction plan.

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
- **Current state**: All tests pass, typecheck passes, lint passes (after F-01..F-18 fixes)
- **Unverified**: Browser E2E, multi-device sync, production D1/R2, concurrent load, PWA update flow

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