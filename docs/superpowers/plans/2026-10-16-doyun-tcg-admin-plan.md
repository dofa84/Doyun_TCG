# Doyun TCG Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable web admin for Doyun TCG under `/Users/kwonmj/Dropbox/Project/withdoyun/TCG`, with server-enforced card approval, faction readiness, and card-image storage.

**Architecture:** A Vite React TypeScript admin client calls a Cloudflare Worker API. The Worker owns authentication, authorization, validation, D1 persistence, and R2 image storage. The first release supports accounts, factions, cards, review workflow, and readiness; it does not implement battles or online matchmaking.

**Tech Stack:** React, TypeScript, Vite, Vitest, Cloudflare Workers, D1, R2, Wrangler.

**Spec:** `docs/superpowers/specs/2026-10-16-doyun-tcg-admin-design.md`

## Global Constraints

- A faction is game-selectable only when approved and usable cards total at least 20 and exactly 5 are Exodia cards.
- A game selection contains the 5 Exodia cards plus 15 randomly selected non-Exodia cards.
- Card HP is an integer from 10 through 10,000.
- Card attack is an integer from 1 through 1,000.
- Card edits after approval return the card to review-pending.
- Admin privileges are never self-assigned through public registration.
- Physical card deletion is not the default; disable/archive behavior preserves audit history.
- The implementation must not modify the parent Android app outside `TCG`.

## Review Focus

- A user cannot read or mutate another user's draft faction/card: ownership tests in the Worker API task.
- A faction with 19 cards or fewer, or not exactly 5 Exodia cards, is not ready: readiness tests in the domain task.
- A sixth Exodia card is rejected server-side: card validation tests in the domain task.
- Editing an approved card invalidates approval: workflow tests in the Worker API task.
- An image upload cannot escape its allowed MIME/size/key policy: upload tests in the R2 task.

### Task 1: Repository scaffold and test harness

**Files:**

- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`
- Create: `src/`, `tests/`, `worker/`, `wrangler.toml`, `.env.example`, `README.md`
- Create: `db/migrations/0001_initial.sql`

**Interfaces:**

- Produces npm scripts `dev`, `build`, `test`, `test:watch`, `typecheck`, `worker:dev`.
- Produces TypeScript types shared by domain tests and API/client code.

- [ ] Write the failing smoke test proving the test runner discovers a TypeScript test.
- [ ] Run `npm test -- --run` and verify the expected missing-scaffold failure.
- [ ] Add the minimal Vite/Vitest/TypeScript scaffold and D1 migration skeleton.
- [ ] Run `npm test -- --run`, `npm run typecheck`, and `npm run build` and verify all pass.
- [ ] Commit `chore: scaffold tcg admin project`.

### Task 2: Domain validation and faction readiness

**Files:**

- Create: `src/domain/card.ts`, `src/domain/faction.ts`, `src/domain/readiness.ts`
- Test: `tests/domain/card.test.ts`, `tests/domain/readiness.test.ts`

**Interfaces:**

- Produces `validateCardInput(input): ValidationResult`.
- Produces `getFactionReadiness(input): FactionReadiness`.
- Produces `selectGameCards(cards, random): SelectedGameCards`, selecting exactly 5 Exodia and 15 non-Exodia cards after readiness is true.

- [ ] Write failing tests for HP/attack bounds, required faction/rarity/image, and the sixth Exodia rejection.
- [ ] Run the focused domain tests and verify they fail for missing functions.
- [ ] Implement the smallest pure validation functions.
- [ ] Write failing tests for readiness at 19 cards, exactly 20 cards, missing Exodia, and more than 20 cards.
- [ ] Implement readiness and deterministic injectable random selection.
- [ ] Run all domain tests and the full test suite.
- [ ] Commit `feat: add card and faction domain rules`.

### Task 3: D1 schema, repository, and authentication primitives

**Files:**

- Modify: `db/migrations/0001_initial.sql`
- Create: `worker/db.ts`, `worker/auth/password.ts`, `worker/auth/session.ts`, `worker/repositories/users.ts`
- Test: `tests/worker/auth.test.ts`, `tests/worker/repositories.test.ts`

**Interfaces:**

- Produces tables `users`, `sessions`, `factions`, `cards`, `card_audit_logs` with indexes and status constraints.
- Produces `hashPassword`, `verifyPassword`, `createSession`, and `readSession` interfaces.
- Produces repository methods for user lookup, faction ownership, and card persistence.

- [ ] Write failing tests for password verification, session expiry, and role lookup.
- [ ] Run focused tests and verify failure is due to missing auth/repository behavior.
- [ ] Implement password hashing and opaque, expiring sessions without storing raw passwords.
- [ ] Add D1 repository functions and migration constraints.
- [ ] Run unit tests and a local Wrangler D1 migration check.
- [ ] Commit `feat: add d1 schema and session auth`.

### Task 4: Worker API and authorization

**Files:**

- Create: `worker/index.ts`, `worker/routes/auth.ts`, `worker/routes/factions.ts`, `worker/routes/cards.ts`, `worker/routes/admin.ts`, `worker/http.ts`
- Test: `tests/worker/api.test.ts`

**Interfaces:**

- Implements `POST /api/auth/register`, `/login`, `/logout`, and `GET /api/auth/me`.
- Implements faction and card CRUD plus submit-for-review.
- Implements admin approve, reject, enable, disable, and readiness endpoints.
- Returns consistent JSON errors without secrets.

- [ ] Write failing request tests for registration/login and authenticated ownership checks.
- [ ] Verify the tests fail before route implementation.
- [ ] Implement auth routes and session cookie handling.
- [ ] Write failing request tests proving users cannot mutate another owner’s data and admins can review it.
- [ ] Implement faction/card/admin routes using the domain validators and repositories.
- [ ] Write failing workflow tests proving approved-card edits return to pending and audit logs are recorded.
- [ ] Run the full Worker test suite and local API smoke test.
- [ ] Commit `feat: add worker admin api`.

### Task 5: R2 image upload and card workflow UI

**Files:**

- Create: `worker/routes/uploads.ts`, `src/api/client.ts`, `src/app/`, `src/components/`
- Test: `tests/worker/uploads.test.ts`, `tests/ui/card-form.test.tsx`

**Interfaces:**

- Implements `POST /api/uploads/card-image` and controlled image deletion.
- Produces client screens for login, dashboard, factions, cards, card form, and review status.

- [ ] Write failing upload tests for allowed image types, size limit, and rejected spoofed MIME/key input.
- [ ] Implement R2 upload validation and ownership checks.
- [ ] Write failing UI tests for required fields, numeric bounds, Exodia count feedback, and pending status.
- [ ] Implement the card/faction screens using API client functions, not direct storage access.
- [ ] Run UI tests, typecheck, and production build.
- [ ] Commit `feat: add admin card workflow ui`.

### Task 6: Local verification and Cloudflare deployment wiring

**Files:**

- Modify: `wrangler.toml`, `.github/workflows/deploy.yml`, `.env.example`, `README.md`
- Create: `scripts/check-env.ts`, `docs/runbook.md`

**Interfaces:**

- Defines D1 and R2 binding names without committing secrets.
- Defines GitHub-to-Cloudflare deployment checks and local setup commands.

- [ ] Write a failing environment-check test for missing required bindings/configuration.
- [ ] Implement the check and document local D1/R2 setup.
- [ ] Run `npm test -- --run`, `npm run typecheck`, `npm run build`, and `wrangler deploy --dry-run`.
- [ ] Inspect the existing failed Cloudflare build cause before enabling automatic deployment.
- [ ] Enable deployment only after the dry run and test suite pass.
- [ ] Commit `chore: wire cloudflare deployment`.

## Final Verification

- [ ] Run the complete test suite, typecheck, production build, and Worker dry run.
- [ ] Verify no files outside `/Users/kwonmj/Dropbox/Project/withdoyun/TCG` changed.
- [ ] Verify no secrets, passwords, or API tokens are present in tracked files.
- [ ] Record local verification separately from Cloudflare deployment and live-account confirmation.

## 실제 실행 현황 (2026-10-16)

Task 1–5의 로컬 기능을 구현했다. 상세 검증 결과와 계획 조정은 docs/PROGRESS.md 및 STATUS.md에 기록한다. 테스트는 tests/domain.test.ts, tests/api.test.ts와 e2e/에 통합했다. 초기 저장소는 한 개 기준 커밋으로 남긴다. Cloudflare Workers Builds가 배포를 담당하므로 GitHub Actions는 ci.yml 검증 전용이다. Task 6의 원격 연결·배포는 계정의 R2 미활성화 때문에 대기 중이다. 위 체크리스트는 원본 계획을 보존하며, 실행하지 않은 커밋·원격 단계까지 완료 표시하지 않는다.
