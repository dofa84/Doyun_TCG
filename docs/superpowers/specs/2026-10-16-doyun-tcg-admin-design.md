# 도윤 TCG 어드민 1차 설계

## 1. 목표

도윤 TCG의 카드와 진형을 운영할 수 있는 웹 어드민을 구축한다. 초기 목표는 게임 자체가 아니라 카드 제작·검수·활성화에 필요한 최소 운영 기반을 만드는 것이다.

성공 기준:

- 일반 사용자가 계정을 만들고 진형과 카드를 작성할 수 있다.
- 관리자가 카드를 승인·반려·비활성화할 수 있다.
- 승인된 카드만 이후 게임 클라이언트가 조회할 수 있다.
- 진형별 카드 수와 엑조디아 수 제한이 서버에서 강제된다.
- 이미지와 권한 검증을 클라이언트가 아닌 Worker/API에서 수행한다.
- GitHub에서 Worker로 자동 배포되는 구조를 복구한다.

## 2. 현재 상태와 제약

- GitHub 저장소 `dofa84/Doyun_TCG`는 2026-10-16 확인 기준 빈 저장소다.
- Cloudflare Worker `doyun-tcg`에는 수동 배포본이 있으나 최신 GitHub 자동 배포 빌드는 실패했다.
- Worker 바인딩은 0개다.
- `workers.dev` URL은 비활성화되어 있다.
- D1, R2, KV 연결이 아직 확인되지 않았다.
- 따라서 기존 코드에 기능을 추가하는 작업이 아니라 최소 실행 구조를 새로 세우는 작업으로 취급한다.

## 3. 권장 아키텍처

### 3.1 구성

- 웹 어드민: React + TypeScript + Vite
- API 및 인증: Cloudflare Worker
- 관계형 데이터: Cloudflare D1
- 카드 이미지: Cloudflare R2
- 세션: Worker가 발급·검증하는 HttpOnly, Secure, SameSite 세션 쿠키
- 배포: GitHub main 브랜치 → Cloudflare Workers 자동 배포

초기에는 외부 인증·외부 데이터베이스를 추가하지 않는다. Worker·D1·R2를 한 운영 경계에 두어 초기 인증, 권한, 이미지 URL, 배포 추적을 단순화한다.

### 3.2 권한

- `user`: 자신의 진형·카드 생성, 수정, 삭제 요청, 밸런스 조회
- `admin`: 모든 카드 조회, 승인·반려, 활성화·비활성화, 진형 운영 상태 확인

관리자 권한은 회원가입 입력으로 부여하지 않는다. 초기 관리자 계정은 별도 운영 절차로 지정한다.

## 4. 도메인 모델

### users

- `id`
- `email`
- `password_hash`
- `role` (`user` 또는 `admin`)
- `status` (`active`, `suspended`)
- `created_at`, `updated_at`

### factions

- `id`
- `owner_user_id`
- `name`
- `description`
- `status` (`draft`, `ready`, `disabled`)
- `created_at`, `updated_at`

### cards

- `id`
- `faction_id`
- `owner_user_id`
- `name`
- `rarity` (`legendary`, `hero`, `rare`, `common`)
- `hp` (10~10,000)
- `attack` (1~1,000)
- `passive_type` (`attack`, `defense`, `special`, nullable)
- `passive_code` (사전 정의 효과 코드, nullable)
- `special_attack_code` (사전 정의 효과 코드, nullable)
- `image_key`
- `is_exodia`
- `review_status` (`draft`, `pending`, `approved`, `rejected`)
- `is_usable`
- `rejection_reason` (nullable)
- `created_at`, `updated_at`

### card_audit_logs

- `id`
- `card_id`
- `actor_user_id`
- `action`
- `from_status`, `to_status`
- `reason` (nullable)
- `created_at`

카드는 물리 삭제보다 비활성화를 기본으로 한다. 승인된 카드의 수정은 다시 심사 대기로 되돌린다. 그래야 게임 중인 데이터와 운영 이력을 잃지 않는다.

## 5. 서버 검증 규칙

Worker가 다음을 강제한다.

- 진형은 반드시 존재해야 한다.
- 카드 소유자만 자신의 초안 카드를 수정할 수 있다.
- HP는 10~10,000 정수다.
- 공격력은 1~1,000 정수다.
- 진형과 등급은 필수다.
- 이미지는 필수이며 허용 MIME·파일 크기를 제한한다.
- 한 진형의 엑조디아 카드는 최대 5장이다.
- 게임 가능 진형은 승인·사용 가능 카드가 총 20장 이상이어야 하며, 엑조디아 5장이 모두 포함되어야 한다.
- 게임 시작 시 엑조디아 5장은 확정 포함한다.
- 엑조디아를 제외한 승인·사용 가능 카드 중 15장을 랜덤으로 선택해 사용한다.
- 비엑조디아 카드가 15장을 초과하면 초과분은 해당 게임의 후보에서 제외될 수 있다.
- 카드 수정·이미지 변경·효과 변경 시 승인 상태를 재심사로 변경한다.
- 승인된 카드만 게임 API에 노출한다.

진형 선택 가능 여부는 `총 카드 수 >= 20`이고 `엑조디아 카드 수 = 5`인 경우로 서버에서 계산한다. 클라이언트가 카드 수를 세어 임의로 게임 진입을 허용하지 않는다.

## 6. API 초안

### 인증

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### 진형

- `GET /api/factions`
- `POST /api/factions`
- `PATCH /api/factions/:id`
- `GET /api/factions/:id`

### 카드

- `GET /api/cards`
- `POST /api/cards`
- `GET /api/cards/:id`
- `PATCH /api/cards/:id`
- `DELETE /api/cards/:id` (실제 삭제가 아니라 비활성화 또는 삭제 요청)
- `POST /api/cards/:id/submit`

### 관리자

- `GET /api/admin/cards?status=pending`
- `POST /api/admin/cards/:id/approve`
- `POST /api/admin/cards/:id/reject`
- `POST /api/admin/cards/:id/enable`
- `POST /api/admin/cards/:id/disable`
- `GET /api/admin/factions/readiness`

### 이미지

- `POST /api/uploads/card-image`
- `DELETE /api/uploads/card-image/:key`

이미지는 R2에 저장하고, 클라이언트가 임의의 R2 키를 제출하지 못하도록 업로드 API가 소유권과 확장자·크기를 검증한다. 공개 URL을 영구 저장할지, 짧은 만료 URL을 발급할지는 실제 앱 접근 모델을 확정한 뒤 결정한다.

## 7. 어드민 화면

1차 화면:

- 로그인
- 대시보드
- 내 진형 목록
- 진형 편집
- 내 카드 목록
- 카드 생성·편집
- 카드 상세 및 심사 상태
- 관리자 검수 큐
- 관리자 카드 상세·승인·반려
- 진형 준비 상태

진형 준비 상태에는 승인·사용 가능 카드 총수, 엑조디아 수, 비엑조디아 수, 게임 진입 가능 여부를 표시한다.

밸런스 화면은 1차에서 수치 비교와 유효성 검증만 제공한다. 실제 승률·평균 턴·카드 선택률은 전투 로그가 생긴 뒤 별도 기능으로 만든다. 데이터 없이 “밸런스 분석” 화면부터 만드는 것은 숫자 장식이다.

## 8. 오류·보안 원칙

- 비밀번호는 원문 저장 금지
- 세션 쿠키는 HttpOnly·Secure 적용
- 모든 변경 API는 역할과 리소스 소유권을 서버에서 확인
- 반려 사유와 상태 변경 이력을 기록
- 이미지 업로드 MIME, 크기, 파일명 검증
- 에러 응답에 비밀번호·토큰·내부 키를 포함하지 않음
- 카드 승인과 활성화는 관리자 권한 필요
- 전투 API는 이후 동일한 서버 권위형 판정 모델을 사용

## 9. 1차 제외 범위

- 실시간 대전
- 비동기 대전
- 모바일 앱
- 자유 문장 기반 패시브 생성
- 카드별 실제 승률 분석
- 결제·과금
- 다인전
- 공개 커뮤니티·친구 기능

## 10. 미확인 사항

- D1/R2가 이미 존재하는지, 새로 생성할지
- 회원가입에 이메일 인증이 필요한지
- 카드 이미지 공개 범위와 허용 파일 크기
- 관리자 계정을 어떤 운영 절차로 지정할지
- 진형 이름 중복 허용 여부

이 미확인 사항은 구현 전에 기본값을 정하거나 사용자 결정을 받아야 한다.
