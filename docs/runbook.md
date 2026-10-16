# 운영 및 검증

## Cloudflare 연결 순서

1. 기존 Worker의 실패 빌드 로그와 실제 빌드 설정 확인.
2. D1 `doyun-tcg-db`와 비공개 R2 `doyun-tcg-images` 생성 또는 기존 리소스 확인.
3. D1 ID를 wrangler.toml에 입력. 바인딩명은 DB / IMAGES.
4. 운영 마이그레이션: `npx wrangler d1 migrations apply DB --remote`.
5. 빌드 명령 `npm run build`, 배포 명령 `npx wrangler deploy`, 루트 경로는 저장소 루트.
6. workers.dev 또는 별도 도메인 활성화. API와 정적 웹은 같은 Worker에서 제공.
7. 운영 가입 후 D1에서 대상 계정만 관리자 승격. 비밀번호·세션 원문을 로그에 기록하지 않는다.
8. 실제 로그인·카드 저장·이미지 조회·심사·진영 준비 조건을 운영에서 별도 확인.

Cloudflare Workers Builds를 배포 주체로 사용하고 GitHub Actions는 검증 전용으로 유지한다. 중복 배포 파이프라인을 만들지 않는다.

## 로컬 UI 확인

`npm run build && npm run db:local` 후 `npm run worker:dev` 실행.

Playwright E2E는 localhost:8799와 별도 .wrangler/e2e 저장소에서 새 테스트 계정을 생성하고 로그인·진영 생성·사진 업로드·카드 저장 흐름을 확인한다. 기본 미리보기(8787)의 DB와 운영 데이터에는 접근하지 않는다. 브라우저가 없으면 먼저 npx playwright install chromium을 실행한다.

```sh
npx playwright test
```

## 이미지 정책

PNG/JPEG/WebP 5 MiB 이하. MIME과 파일 서명을 확인한다. 파일 서명 확인은 악성 파일 전체 분석을 의미하지 않는다. 원본 R2 객체는 비공개이며 API가 제작자/관리자 또는 승인·활성 카드 여부를 확인한다. 카드에서 참조 중인 이미지는 삭제 불가. 사용하지 않는 업로드의 자동 정리는 후속 운영 과제다.

## 범위와 미완료

실제 전투·랜덤 덱 DB 고정·게임 세션은 후속 단계다. 현재 selectGameCards 함수는 덱 선별 규칙만 검증한다. 게임 시작 API와 재접속 고정은 아직 미구현이다. 통계는 카드 수치 비교만 제공한다.
