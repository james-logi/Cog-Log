# 원격 조회용 클라우드 대시보드 설정

`cloud-dashboard/`는 로컬 백엔드가 카메라와 통신하며 쌓는 로그를 **읽기 전용으로 복제**해
Cloudflare Pages(+D1)에서 조회할 수 있게 하는 별도 배포물이다. TCP 통신·로컬 저장은
계속 현장 PC의 `backend/`가 전담하며, 이 문서의 절차는 계정이 필요한 단계라
Claude가 대신 실행할 수 없다 — 아래 순서대로 직접 진행하면 된다.

## 1. GitHub 저장소 만들기

1. GitHub에서 새 저장소를 만든다(비공개 권장 — 로그에 현장 데이터가 포함될 수 있음).
2. 로컬에서 원격을 연결하고 push:
   ```bash
   git remote add origin https://github.com/<your-account>/<repo-name>.git
   git branch -M main
   git add -A
   git commit -m "Initial commit"
   git push -u origin main
   ```

## 2. Cloudflare 계정 준비

1. https://dash.cloudflare.com 에서 계정을 만든다(무료 플랜으로 충분).
2. 로컬에 Wrangler CLI 로그인:
   ```bash
   cd cloud-dashboard
   npm install
   npx wrangler login
   ```
   브라우저가 열리면 Cloudflare 계정으로 로그인/승인한다.

## 3. D1 데이터베이스 생성

```bash
npx wrangler d1 create cog-comm-log
```

출력된 `database_id`를 `cloud-dashboard/wrangler.toml`의
`REPLACE_WITH_YOUR_D1_DATABASE_ID` 자리에 붙여넣는다.

스키마 적용:

```bash
npx wrangler d1 execute cog-comm-log --remote --file=schema.sql
```

## 4. 수신 API 비밀키 설정

로컬 백엔드가 로그를 보낼 때 쓰는 공유 비밀키를 정하고(예: 32자 랜덤 문자열),
Cloudflare Pages 프로젝트의 secret으로 등록한다(아래 5단계에서 프로젝트를
먼저 만든 뒤 실행):

```bash
npx wrangler pages secret put SYNC_API_KEY --project-name cog-comm-log-dashboard
```

## 5. Cloudflare Pages 배포

가장 간단한 방법은 Cloudflare 대시보드에서 "Pages → Create a project →
Connect to Git"으로 1단계에서 만든 GitHub 저장소를 연결하고, 빌드 설정에서
루트 디렉터리를 `cloud-dashboard`로 지정하는 것이다(빌드 명령 없음,
출력 디렉터리 `public`). 이렇게 연결하면 이후 `main` 브랜치에 push할 때마다
자동 배포된다.

CLI로 수동 배포하려면:

```bash
cd cloud-dashboard
npx wrangler pages deploy public --project-name cog-comm-log-dashboard
```

배포가 끝나면 `https://cog-comm-log-dashboard.pages.dev` 같은 URL이 발급된다.

## 6. 로컬 백엔드에 연결 정보 입력

`backend/.env`에 다음을 추가하고 백엔드를 재시작한다:

```
CLOUD_SYNC_URL=https://cog-comm-log-dashboard.pages.dev
CLOUD_SYNC_API_KEY=<4단계에서 정한 값>
```

이후 새로 생기는 로그부터 자동으로 클라우드에 복제된다(`backend/src/cloud/sync.ts`).
값을 비워두면 클라우드 전송은 완전히 비활성 상태로 유지된다(기본값).

## 참고

- `/api/logs`는 지금은 인증 없이 공개돼 있다. 사내에서만 보게 하려면
  Cloudflare Pages 프로젝트에 **Cloudflare Access**를 붙이거나, `logs.ts`에
  별도 인증을 추가한다.
- 중복 방지는 로컬 `log_records.id`(UUID)를 클라우드 쪽 기본키로 그대로 써서
  `ON CONFLICT(id) DO UPDATE`로 처리한다 — 재시도나 여러 백엔드가 동시에
  같은 레코드를 보내도 D1에는 항상 한 행만 남는다.
