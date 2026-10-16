# Native 실행 기록

계획: docs/superpowers/plans/2026-10-16-doyun-tcg-admin-plan.md

- Ruling: TCG를 별도 Git 저장소와 codex/admin 브랜치로 초기화. 부모 Android 프로젝트는 보존한다.
- Ruling: 진영 목록은 로그인 사용자에게 공유하고 카드 편집은 제작자만 허용. 진영 공동 사용 요구를 유지한다.
- Ruling: 관리자 자가 가입을 금지하고 운영 명령으로 승격한다. 가입은 일반 계정만 허용한다.
- Ruling: 이미지 5 MiB, PNG/JPEG/WebP, 비공개 R2 + 인증된 API 조회. 이메일 인증과 비밀번호 재설정은 1차 범위 밖이며 공개 운영 전 재검토.
- Pre-flight: domain → API → UI에서 동일한 카드 필드와 준비 조건 사용. API 상태/DB 제약/관리자 UI는 동일한 승인 상태를 사용.

## 실행 결과

- Task 1–5: 로컬 구현 및 통합 검증 완료. 세부 파일명은 원본 계획보다 기능 단위로 통합했다.
- Task 6: CI·배포 설정·운영 문서·dry-run까지 검증. 원격 배포는 R2 미활성화로 대기.
- Ruling: Cloudflare Workers Builds가 이미 연결되어 있으므로 GitHub Actions는 검증 전용. 배포 주체를 중복 만들지 않는다. 잘못된 경우 기존 Cloudflare 빌드 설정 수정 비용이 발생.
- Ruling: 이미지 검증은 MIME/서명/크기를 1차 경계로 사용. 전체 디코딩·차원 검사는 후속 과제. 손상 이미지가 저장될 수 있다는 제한을 STATUS.md에 공개.
- Ruling: 관리자에게 타 제작자 카드 보관 권한을 추가해 공유 진영의 엑조디아 예약을 회수. 오작동 시 카드 사용 중지가 발생하므로 변경 이력과 버전 충돌 검사 유지.
- Ruling: 테스트는 의미 있는 API 통합·브라우저 시나리오에 집중. test runner 자체의 smoke test와 계획의 개별 boilerplate 테스트는 생략.
- Ruling: 초기 빈 저장소의 구현은 검증 후 하나의 기준 커밋으로 보관. 단계별 커밋은 실행하지 않았으며 task별 commit 완료를 주장하지 않음.
- Task 2 RED: 초기 domain import 부재 확인 → 구현 후 도메인 14개 통과.
- Task 3–5 RED: 초기 Worker entry 부재와 API 미구현 확인 → Miniflare API 통합 테스트 통과.
- 환경 수정: Miniflare 4 최신 안정본은 오래된 runtime/의존성 문제 확인. Wrangler가 사용하는 동일 Miniflare 5 버전과 공식 변환 API를 사용. compatibility date 2026-10-01로 런타임 지원 범위 내 고정. npm audit 0개.
- 추가 RED→GREEN: 보관 후 이력 조회, 잘못된 JSON 입력 응답, 진영 상세 조회.
- Final review: 독립 reviewer가 주요 4개와 경미 3개 지적.
- Final fixed: 관리자의 엑조디아 슬롯 회수 — API 테스트 403 실패 → 200 통과, 슬롯 재생성 확인.
- Final fixed: 계정 전환 후 비공개 카드 잔류 — 브라우저 재현 실패 → 계정별 Workspace 재생성으로 통과.
- Final fixed: 지연 승인 응답의 상세 화면 덮어쓰기 — 브라우저 재현 실패 → 선택 세대 검사로 통과.
- Final fixed: 저장 후 목록 갱신 실패의 중복 생성 — 브라우저 재현 실패 → 저장 성공 즉시 편집 종료, 갱신 실패는 부모 화면 처리로 통과.
- Final minor fixed: 보관된 카드의 이력 조회 (제작자/관리자만).
- Final minor deferred: 서버의 전체 이미지 디코딩 및 차원 검증.
- Final minor deferred: R2 삭제 실패 시 고아 객체 재시도/정리.
- 최종 검증: npm run verify 통과 (31 tests, TypeScript, Vite build, Wrangler dry-run), npx playwright test 4/4 통과.
- 외부 상태 변경: 상위 withdoyun/.git 소실 확인. 이 작업의 삭제/이동 대상이 아니며 원인 미확인. 원본 Git 상태 비교는 불가능함을 STATUS.md에 기록.
