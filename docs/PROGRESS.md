# Native 실행 기록

## 최신 후속: 무료 사진 저장 전환

- R2 제거, D1 image_data 추가. 기존 API URL·접근 권한 유지.
- 사진 기기 내 압축 및 서버 512 KiB 제한. 기존 로컬 사진 1개 이전 및 바이트 일치 검증, 원본 보존.
- RED: R2 없는 환경 업로드 500 재현. GREEN: 서버·도메인 37개 통과.
- RED: 큰 사진 업로드 413 재현. GREEN: 자동 압축 저장 및 손상 파일 거부 포함 브라우저 5개 통과.
- 브라우저 전체 디코딩으로 기존 손상 PNG/문자열 테스트 픽스처가 드러남. 정상 캔버스 PNG로 교체 후 통과. 서버 직접 호출은 여전히 MIME·서명 검사 범위.
- 타입 검사·빌드·배포 dry-run 통과. 운영 마이그레이션 0004·배포 성공.
- 실제 운영 관리자 로그인·사진 업로드·바이트 동일 조회·비인증 차단·테스트 사진 삭제·로그아웃 확인. 이하 과거 R2 배포 차단 기록은 현재 상태가 아님.
- 독립 코드 리뷰: Critical/Important 없음. 후속 테스트 보완 제안: 두 번째 INSERT 실패 시 배치 롤백, 입력 10 MiB·40MP 및 저장 512 KiB 경계값. 정상·초과 업로드·삭제 경로는 현재 테스트로 검증.

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

## 계정·운영 연결 후속 작업

- 최신 사용자 요청: 로컬 관리자 계정 생성, 운영 강한 임시 비밀번호 분리, GitHub 업로드·Cloudflare 계정 연결 실행.
- 최신 사용자 결정: 진영 이름 중복 불가, 제작자 수정 가능. 이전 중복 허용 기본값 폐기.
- 운영 D1 생성 및 0001~0003 마이그레이션 적용. 기존 로컬 DB ID 보존.
- 로컬 관리자 실제 API 200/admin 및 브라우저 검수 메뉴 노출 확인. 운영 계정은 DB에 생성했으나 서비스 로그인은 배포 전이라 미검증.
- 자격 증명은 Git 제외 .local/의 파일 권한 600으로 저장. 출력·문서·Git에는 비밀번호를 기록하지 않음.
- 테스트 중복 진영 2개만 구분 이름으로 변경. 카드/진영 ID와 관계 보존.
- 신규 기능 RED→GREEN: 관리자 아이디 로그인, 운영 짧은 비밀번호 생성 거부, 진영 중복/동시 생성 제한과 제작자 수정 권한.
- 로컬 전체 verify 및 브라우저 테스트 통과, GitHub main push 완료. 원격 CI 35개 + 브라우저 4개 통과.
- Cloudflare 빌드 명령 npm run build 저장. 사용자 GitHub 앱 접근 업데이트 후 disconnected 경고 소멸 확인.
- Cloudflare main 빌드 b2f339ba는 웹 빌드까지 성공, 배포는 R2 버킷 미존재 10085로 실패. 구독은 사용자가 직접 활성화하기로 선택했고 아직 10042 확인.
- 첨부 상세 답변 재검토로 확인한 기존 규칙 누락과 추가 결정 항목은 docs/game-rules-audit.md에 기록. 제안은 미승인으로 표시.
