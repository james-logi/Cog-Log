# 원격 조회용 클라우드 대시보드 설정

`cloud-dashboard/`는 로컬 백엔드가 카메라와 통신하며 쌓는 로그를 **읽기 전용으로 복제**해
Cloudflare Workers(+D1)에서 조회할 수 있게 하는 별도 배포물이다. TCP 통신·로컬 저장은
계속 현장 PC의 `backend/`가 전담한다. 정적 대시보드(`public/index.html`)와 API
(`/api/ingest`, `/api/logs`)를 **하나의 Worker**(`src/index.ts`)가 함께 처리한다.

GitHub 저장소(`james-logi/Cog-Log`)와 Cloudflare 프로젝트("cog-log")는 이미
만들어져 있다. 아래는 그 상태에서 정상 배포되도록 마무리하는 절차다 — 계정이
필요한 단계라 Claude가 대신 실행할 수 없다.

## 1. Root directory 설정

Cloudflare 대시보드 → Workers & Pages → **cog-log** → **Settings** →
Build 설정에서 **Root directory**를 `cloud-dashboard`로 지정한다.
(지금은 저장소 루트에서 `npx wrangler deploy`를 실행해서 실패했다 —
`cloud-dashboard/wrangler.toml`을 찾지 못했기 때문.)

빌드 명령은 비워두고, 배포 명령은 그대로 `npx wrangler deploy`를 쓰면 된다.

## 2. D1 데이터베이스 생성 (대시보드에서, CLI 불필요)

1. Cloudflare 대시보드 좌측 메뉴 → **Workers & Pages** → **D1 SQL Database**
   → **Create database**. 이름은 `cog-comm-log`로 만든다.
2. 생성된 데이터베이스의 **Database ID**를 복사한다.
3. 그 데이터베이스의 **Console** 탭에서 `cloud-dashboard/schema.sql` 내용을
   그대로 붙여넣고 실행한다(테이블 생성).
4. 복사해둔 Database ID를 알려주면, `cloud-dashboard/wrangler.toml`의
   `REPLACE_WITH_YOUR_D1_DATABASE_ID` 자리에 채워서 커밋·push하겠다.

## 3. 수신 API 비밀키 설정 (대시보드에서)

1. 32자 정도의 임의 문자열을 하나 정한다(예: 비밀번호 생성기로 만든 값).
2. cog-log 프로젝트 → **Settings** → **Variables and Secrets** →
   **Add** → 이름 `SYNC_API_KEY`, 값은 방금 정한 문자열, 타입 **Secret**으로 저장.
3. 이 값은 `backend/.env`의 `CLOUD_SYNC_API_KEY`에도 그대로 넣어야 한다(6단계).

## 4. 재배포

1~3단계를 마친 뒤 `main` 브랜치에 새 커밋이 push되면 자동으로 재배포된다
(2단계에서 Database ID를 알려주면 그 커밋도 함께 push하겠다).
Deployments 탭에서 최신 배포가 성공(Success)으로 바뀌는지 확인한다.

## 5. 배포 URL 확인

Overview 탭 상단에 나오는 `*.workers.dev` 주소(스크린샷 기준
`cog-log.rudy-jeong.workers.dev`)로 접속해 대시보드 화면이 뜨는지 확인한다.
`/api/logs`를 직접 열어도 `{"log_records": []}` 같은 JSON이 보이면 정상.

## 6. 로컬 백엔드에 연결 정보 입력

`backend/.env`에 다음을 추가하고 백엔드를 재시작한다:

```
CLOUD_SYNC_URL=https://cog-log.rudy-jeong.workers.dev
CLOUD_SYNC_API_KEY=<3단계에서 정한 값>
```

이후 새로 생기는 로그부터 자동으로 클라우드에 복제된다(`backend/src/cloud/sync.ts`).
값을 비워두면 클라우드 전송은 완전히 비활성 상태로 유지된다(기본값).

## 참고

- `/api/logs`는 지금은 인증 없이 공개돼 있다. 사내에서만 보게 하려면
  Cloudflare 프로젝트에 **Cloudflare Access**를 붙이거나 `src/index.ts`의
  `handleLogs`에 별도 인증을 추가한다.
- 중복 방지는 로컬 `log_records.id`(UUID)를 클라우드 쪽 기본키로 그대로 써서
  `ON CONFLICT(id) DO UPDATE`로 처리한다 — 재시도나 여러 백엔드가 동시에
  같은 레코드를 보내도 D1에는 항상 한 행만 남는다.
- CLI로 로컬에서 직접 개발/배포하고 싶다면(선택):
  ```bash
  cd cloud-dashboard
  npm install
  npx wrangler login
  npx wrangler dev            # 로컬 미리보기
  npx wrangler deploy         # 수동 배포
  ```
