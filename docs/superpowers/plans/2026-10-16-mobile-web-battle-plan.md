# 모바일웹 두 계정 대전 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 서로 다른 두 계정이 한 휴대폰에서 교대하며 서버 판정으로 대전하고 재접속할 수 있는 첫 게임 버전을 만든다.

**Architecture:** 순수 TypeScript 엔진과 공개 상태 변환기를 Worker 게임 라우트에 연결한다. 기존 D1에 게임/참가자/기기 권한/행동/사진 참조 테이블만 추가하고 version CAS로 원자적 갱신한다. React 게임 화면은 기존 어드민과 분리하고 두 계정 순차 로그인 및 서버 상태를 표시한다.

**Tech Stack:** 기존 React, TypeScript, Hono, Cloudflare Workers/D1, Vitest/Miniflare, Playwright. 신규 유료 서비스·제품 의존성 없음.

**Spec:** docs/superpowers/specs/2026-10-16-mobile-web-battle-design.md

**Execution status:** 사용자 승인 후 native 직접 실행. Task1~4 구현, Task5 독립리뷰 Important3건 수정·서버75/브라우저14 검증·운영 배포/읽기 확인. 운영 종단 대전은 계정·카드 부족으로 미실행이며 추가 운영 테스트 데이터 승인은 대기. STATUS.md 및 docs/PROGRESS.md에 결과와 rulings/deferred minors를 보존한다.

## Global Constraints

- 정확히 두 개의 서로 다른 실제 계정. 한 계정 두 자리·게스트·관리자 참가 우회 금지.
- 한 기기 교대, 서버 판정, 매 턴 비밀번호 요구 없음. 게임 인증은 어드민 인증으로 사용할 수 없음.
- 기존 카드/계정/이미지 보존. 승인·활성·미보관 카드 20장 이상: 엑조디아 5 + 비엑조디아 랜덤15.
- 게임 시작 카드/효과/덱 스냅샷. 새로고침·재시도 재추첨 금지. rules_version = "family-v1".
- 오픈/공격 택1, 수비자가 피해 카드 선택, 사망당 보충1장, 엑조디아 판정 우선, 특수1회·재생3회.
- 피해 최소1, 정수 비율 계산, 원본 비공개 덱·버림 정보 응답/로그 금지.
- 상태 최대256 KiB, 목록/로그 최대50개. 대전 쿠키 최대7일·HttpOnly·SameSite Strict·HTTPS Secure.
- 무료 D1 방식 유지, R2·AI·실시간 매칭·오프라인·랭킹·앱 패키징 제외.
- 사용자가 지정한 TCG 저장소에서 작업. 구현 전에 branch/worktree 상태와 기존 변경 보존 확인. worktree를 새로 만들 경우 사용자 동의 필요.
- 실행 방식: 기존 native 선택 유지. 직접 구현 후 신선한 컨텍스트의 독립 whole-branch 리뷰1회. 구현 계획은 사용자 검토 전 실행하지 않음.

## Review Focus

- 두 번째 로그인으로 일반 쿠키가 바뀌어도 첫 계정 게임 권한은 유지하고, 첫 계정 어드민 권한은 노출하지 않아야 함 → Task3/4 인증·계정 전환 테스트.
- 서버는 성공했지만 응답이 유실된 생성/참가/공격은 같은 request_id 재시도로 한 번만 적용 → Task2/4 재시도 테스트.
- 마지막 전투 카드 사망 후 무료 보충의 다섯 번째 엑조디아는 전투 패배보다 우선 → Task1 판정 테스트.
- 게임 중 원본 카드 이미지 교체/보관 후에도 참가자는 스냅샷 사진 조회 가능, 비참가자는 불가 → Task3 이미지 통합 테스트.
- 수비 선택 대기 중 새로고침·권한 만료·동시 탭은 공격을 재실행하거나 다른 대상에 중복 적용하면 안 됨 → Task2/3/4 복원·동시성 테스트.

## 파일과 공통 인터페이스

- src/game/types.ts: Slot = "attack" | "defense", Seat = 0 | 1, SnapshotCard, GameState, GameAction, GameEvent, GameView 타입. 공개 GameView에 미공개 카드 배열/덱 순서 없음.
- src/game/engine.ts: createGame(decks: [SnapshotCard[],SnapshotCard[]], first: Seat): GameState; applyAction(state: GameState, actor: Seat, action: GameAction): {state: GameState; events: GameEvent[]}. 입력 상태를 변경하지 않음.
- src/game/view.ts: gameView(state: GameState): GameView. 공개 카드·수·단계·합법 행동·피해 예상만 반환.
- worker/game-repository.ts: 생성/참가/행동 저장, 참가자 조회, CAS와 재시도. 엔진 상태와 DB 행 변환 책임.
- worker/game-auth.ts: requireGameDevice(c,gameId): Promise<AuthorizedDevice>; 발급/복구/세션 유효성 검사. 토큰 원문은 쿠키 외 응답/로그에 금지.
- worker/routes/games.ts: 설계 API 계약 구현. 기존 worker/index.ts 인증 미들웨어 뒤 등록.
- src/game/api.ts: GameHttpError(status), typed 게임 요청, request_id 유지. 기존 src/api.ts 어드민 동작 유지.
- src/ui/game/: GameWorkspace.tsx(목록/라우팅), Lobby.tsx(생성·두 번째 로그인/참가·복구), BattleBoard.tsx(공개 전장/교대/행동), game.css.

---

### Task 1: 전투 엔진과 공개 상태

**Files:** Create src/game/{types,engine,view}.ts, tests/game-engine.test.ts. Modify src/domain.ts의 효과 설명.

**Interfaces:** Consumes 기존 CardInput/효과 코드. Produces 공통 인터페이스의 GameState/GameAction/GameView와 엔진3함수. SnapshotCard는 원본id/버전/사진key/이름/수치/효과 및 자리별 고유 instance_id를 포함. GameState는 deck·slots·waiting·discard·dead·special_used·regen_uses, active_seat, pending_attack, winner, turn을 저장.

- [x] **Step 1: 실패 테스트 작성**: test('사망 보충의 다섯 번째 엑조디아가 전투 패배보다 우선')에서 방어자 마지막 전투 카드 HP1, 대기4장, 덱 엑조디아1장으로 공격 후 winner===1 검증. test('공개 응답은 덱과 비공개 버림 이름을 숨긴다')에서 JSON 문자열에 숨긴 이름/instance_id가 없는지 검증. 나머지 설계 §9 엔진 시나리오를 작은 독립 fixtures로 작성.
- [x] **Step 2: RED 실행**: npm test -- tests/game-engine.test.ts. Expected: 미구현 엔진으로 실패. 구현 뒤 테스트가 바로 통과한 것으로 대체 금지.
- [x] **Step 3: 최소 구현**: 최초 각1장·일반 공격 칸/엑조디아 대기, 배치·공격·수비 대기·보충·판정·턴 시작 재생·자동 패스 구현. 전체20장 셔플은 서버 생성 계층 책임. 효과 대상/계산은 설계 §5 그대로. GameView의 합법 행동과 피해 예상도 동일 엔진 계산 사용.
- [x] **Step 4: GREEN 검증**: npm test 및 npm run typecheck. Expected: 기존37개와 신규 엔진 테스트 전부 통과, 입력 상태 불변·특수 재사용/재생4회 차단 포함.
- [x] **Step 5: scoped commit**: git add src/game src/domain.ts tests/game-engine.test.ts; git commit -m "feat: implement deterministic family battle engine".

### Task 2: D1 게임 저장·원자적 전환·재시도

**Files:** Create db/migrations/0005_games.sql, worker/game-repository.ts, tests/game-repository.test.ts.

**Interfaces:** Consumes Task1 GameState/엔진. Produces createLobby(db,creatorId,sessionHash,factionId,requestId), joinGame(db,gameId,userId,sessionHash,factionId,requestId,expectedVersion), saveAction(db,gameId,expectedVersion,requestId,nextState,events), getMemberGame(db,gameId,userId). 입력 DB는 D1Database. 반환 레코드에는 gameId/version/status/state/duplicate 포함. 기기 토큰 발급은 Task3 책임.

- [x] **Step 1: 실패 테스트 작성**: 동일 소유자 생성 request_id 두 번→동일 gameId; 참가 중 진영이 준비 미달이면 waiting 유지·두 번째 member/스냅샷 미저장; 동시 version 행동→성공1/충돌1·이벤트1. 응답 유실 재시도는 version 증가 없음. JOIN 재시도는 덱 byte-identical. 마지막 INSERT 강제 실패 시 전체 rollback.
- [x] **Step 2: RED 실행**: npm test -- tests/game-repository.test.ts. Expected: 마이그레이션/저장 계층 미구현 실패.
- [x] **Step 3: 최소 구현**: games/game_members/game_devices/game_actions/game_images 생성. create request_id 생성자별 unique, member 자리·사용자 unique. 실제 카드 풀을 한 쿼리로 읽어 양 진영 조건·효과 코드 확인 후 독립 덱 선정/전체 셔플. CAS 성공 조건으로만 후속 INSERT를 실행하고, batch 실패는 모두 rollback. 같은 진영도 서로 다른 instance_id. 상태256KiB 초과와 미지원 효과는 입력 오류.
- [x] **Step 4: GREEN 검증**: npm test 및 npm run typecheck. Expected: 전체 green, 기존 데이터가 보존되는 추가 마이그레이션 확인.
- [x] **Step 5: scoped commit**: git add db/migrations/0005_games.sql worker/game-repository.ts tests/game-repository.test.ts; git commit -m "feat: persist battle sessions with atomic versioned actions".

### Task 3: 두 계정 인증·게임 API·스냅샷 이미지 권한

**Files:** Create worker/game-auth.ts, worker/routes/games.ts, tests/game-api.test.ts. Modify worker/index.ts, worker/routes/uploads.ts. 기존 auth 함수 재사용; 필요 시 worker/auth.ts에서 현재 세션 해시 조회만 추출.

**Interfaces:** Consumes Task2 repository 및 Task1 engine/view. Produces 설계 §7 API와 requireGameDevice. AuthorizedDevice는 gameId와 검증된 두 participant userId/seat만 포함, 원문 토큰/비밀번호 없음. 게임 쿠키 tcg_game_device를 /api/games/:id 경로로 발급. JSON 반환에는 기기 권한 준비 여부만 포함.

- [x] **Step 1: 실패 테스트 작성**: 두 계정 순차 로그인 후 시작; 첫 계정과 같은 계정 참가409; 생성 기기 토큰 없이 상대 참가403; 세 번째 계정/관리자 열람404; 일반 로그인으로만 행동403; 기기 토큰을 일반 로그인으로 사용401. logout 또는 participant session 만료/정지 후 행동401/403, 각 참가자 재인증 후 복구. 생성/참가/행동 재시도 및 수비 대기 조회. 카드 이미지 교체/보관 후 두 참가자 조회200, 비참가자403, 게임 참조 이미지 삭제409.
- [x] **Step 2: RED 실행**: npm test -- tests/game-api.test.ts. Expected: API404/미구현 인증 실패.
- [x] **Step 3: 최소 구현**: 게임 라우트를 기존 세션 인증 뒤 등록. create/join은 현재 실제 로그인 계정으로 검증, 게임 쿠키 해시와 연결된 두 원래 sessions/users가 유효해야 행동 허용. actor_seat는 검증된 게임 단계와 결합. 일반 logout이 해당 session을 삭제하면 게임 권한도 효력을 잃음. 복구는 원래 member만 허용하고 쿠키가 없으면 새 기기 권한을 한 계정부터 재구축. 이미지 읽기는 game_members/game_images로 추가 허용, 삭제는 FK 및 명시 검사로 차단. 오류 응답/로그에 비공개 상태 금지.
- [x] **Step 4: GREEN 검증**: npm run verify. Expected: 전부 green, dry-run bindings는 DB/ASSETS만 유지. 종료 게임 행동409, 페이지 한도50 및 타인 로그 접근 거부 포함.
- [x] **Step 5: scoped commit**: 해당 파일만 stage; git commit -m "feat: authorize two-account shared-device battles".

### Task 4: 모바일 대기방·순차 로그인·전장 UI

**Files:** Create src/game/api.ts, src/ui/game/{GameWorkspace,Lobby,BattleBoard}.tsx, src/ui/game/game.css, e2e/battle.spec.ts, e2e/battle-retry.spec.ts. Modify src/ui/App.tsx와 필요 시 src/ui/Login.tsx(로그인 재사용 인터페이스만).

**Interfaces:** Consumes Task3 API의 공개 GameView, waiting/active/finished 상태, device authorization readiness. Produces 기존 어드민 ‘대전’ 메뉴 및 /?game=<id> 복원 경로. onAccountChanged(User)로 App 현재 사용자 갱신, Workspace는 계속 user.id별 격리. src/game/api.ts는 GameHttpError.status를 제공하고 pending request_id/body는 해결될 때까지 유지.

- [x] **Step 1: 실패 브라우저 테스트 작성**: 격리 E2E DB에서 서로 다른 두 계정과 승인카드20장 fixtures 준비; 390px 세로 화면에서 1번 로그인·진영·생성, 2번 로그인·참가, 일반 공격·수비 선택·교대·새로고침 복원·결과 조회 검증. 별도 테스트로 join/action 서버 성공 후 응답 유실→같은 ID 재시도·한 번만 적용, 오래된 응답이 새 게임을 덮지 않음, 두 번째 로그인 실패 때 시작되지 않음.
- [x] **Step 2: RED 실행**: npx playwright test e2e/battle.spec.ts e2e/battle-retry.spec.ts. Expected: 대전 메뉴/화면 미구현으로 실패.
- [x] **Step 3: 최소 구현**: 어드민 보존하고 게임컴포넌트만 추가. 사용자 계정 변경을 App까지 전달하고 공개 gameId만 URL에 유지. 일반 로그인 전환에서 첫 계정 권한을 확대하지 않음. 수비 선택 대기 UI·HP/예상 피해·교대 안내·결과·복구 안내 구현. 재시도는 같은 request_id; 충돌/성공 여부 불명확 상태에서는 신규 행동 차단. 비밀번호는 로그인 완료 후 state에서 제거. API 응답 세대 검사와 요청 중 버튼 비활성화.
- [x] **Step 4: GREEN 검증**: npm run verify 및 npx playwright test 전체. Expected: 기존5개 브라우저 회귀와 새 대전 모두 green, 390px 가로 넘침 없음. 종료 시 양쪽 계정 목록에 동일 gameId·winner 연결 확인.
- [x] **Step 5: scoped commit**: 해당 파일만 stage; git commit -m "feat: add mobile shared-device battle interface".

### Task 5: 독립 리뷰·최종 검증·운영 연결

**Files:** Modify STATUS.md, QUESTIONS.md, CHANGELOG.md, docs/PROGRESS.md, docs/runbook.md. 결정 로그는 /Users/kwonmj/Dropbox/Project-Logs/card-game/ 별도 저장. 운영 자격 증명은 문서/로그/Git에 기록하지 않음.

**Interfaces:** Consumes Task1~4 검증 결과와 diff. Produces 사용자에게 로컬/운영/미확인 상태를 분리한 결과.

- [ ] **Step 1: 독립 whole-branch 리뷰**: fresh-context reviewer에게 spec/plan/diff/ledger/Review Focus 전달. Critical/Important를 판정하고 한 번의 수정 패스에서 각각 RED→GREEN 검증. Minor는 문서화.
- [ ] **Step 2: 최종 로컬 검증**: npm run verify && npx playwright test. Expected: 전체 green. 승인된 규칙과 API/인증/이미지/어드민 회귀 체크리스트 확인.
- [ ] **Step 3: 문서·로그 갱신 및 scoped commit**: 테스트 수와 실제 범위 기록. 전체 밸런스/승률 검증 완료라고 표현하지 않음.
- [ ] **Step 4: 운영 연결**: 기존 원격 반영 권한 범위를 확인하고, 부족하면 승인 요청. additive 0005 적용 전 대상 DB와 기존 스키마 확인. 검증된 코드만 GitHub/Worker 반영. 사용자 계정을 테스트용으로 변경하지 않음. 별도 테스트 계정/데이터가 필요하면 로컬 검증과 구분하고 생성 권한을 먼저 확인.
- [ ] **Step 5: 최종 보고**: 실제 운영 health/로그인/대전 확인 결과와 운영 카드 준비 부족 등 미검증 항목을 구분. 작업 상태와 남은 제한을 보고.

## 자체 검토 결과와 실행 대기

- 설계 §1~10을 Task1~5에 매핑. 게임 계정·이미지 참조·응답 유실·회복 제한·초기 배치·숨긴 정보·재접속 포함.
- 엔진 상태/공개 view는 Task1, 원자적 저장 Task2, 계정권한 Task3, 모바일 표시 Task4로 책임 분리. 후기 작업은 이전 Interfaces의 이름을 사용.
- 설계의 ‘사진 보호까지 게임 생성 성공’은 실제 덱 생성 시점인 두 번째 참가·시작 원자적 전환으로 구현. waiting 생성 단계에는 사진 스냅샷 없음.
- 명시적 로그아웃 후 원래 session이 삭제되어 대전 권한이 무효화되는지 반드시 Task3에서 검증. 기기 공유와 물리적 교대 신원 검증은 구분.
- 사용자 검토 대기. 이 문서를 생성했다는 이유로 구현 계획까지 승인됐다고 간주하지 않음.
