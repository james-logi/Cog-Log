# 단일 실행파일(.exe) 패키징

현장 PC에 Node.js를 따로 설치하지 않아도 되도록, 백엔드 + 웹 화면 전체를
실행파일 하나(`CogCommLog.exe`)로 묶는다. TCP 통신, DB, 웹 UI가 모두 이
파일 하나 안에서 실행된다.

## 빌드 방법

```bash
npm install          # 저장소 루트에서 한 번
cd backend
npm run package:exe
```

완료되면 `backend/dist-exe/CogCommLog.exe`가 생긴다(약 90MB — Node 런타임
전체가 들어있어서 이 정도 크기가 정상이다).

내부적으로는:
1. `frontend`를 프로덕션 빌드(`vite build`)하고 그 결과물 전체를 실행파일
   안에 내장 자산으로 넣는다.
2. `backend/src/db/migrations/*.sql`도 함께 내장한다(최초 실행 시 자동으로
   스키마를 만들기 때문에 별도 `npm run migrate`가 필요 없다).
3. esbuild로 백엔드를 단일 CJS 번들로 묶는다.
4. Node의 Single Executable Applications 기능(`--experimental-sea-config`)과
   `postject`로 Node 실행파일에 번들을 주입한다.

## 배포/실행

1. `CogCommLog.exe` 하나만 현장 PC의 원하는 폴더에 복사한다.
2. 더블클릭하면(또는 터미널에서 실행하면) 그 폴더 안에 `data/` 폴더가
   생기면서 SQLite DB와 초기 Admin 계정이 자동으로 만들어진다 — 콘솔에
   ID/비밀번호가 한 번 출력된다.
3. 브라우저로 `http://localhost:4000` 접속(포트는 `PORT` 환경 변수로 변경
   가능. exe와 같은 폴더에 `.env` 파일을 두면 `backend/.env.example`과
   동일한 방식으로 읽는다).
4. 통신 설정에서 "사이트 ID"를 그 현장 이름으로 지정해두면, 클라우드
   동기화를 켰을 때 원격 대시보드에서 현장별로 구분해 볼 수 있다
   (docs/cloud-dashboard-setup.md 참고).

## 알아둘 점

- **서명 없음**: 이 exe는 코드 서명이 안 되어 있어서, 처음 실행할 때 Windows
  SmartScreen이 "알 수 없는 게시자" 경고를 띄울 수 있다. "추가 정보 → 실행"
  으로 넘어가면 된다. 여러 PC에 반복 배포할 거면 코드 서명 인증서 구매를
  고려할 수 있다(비용 발생, 지금은 적용 안 함).
- **자동 시작/재시작은 아직 없음**: 지금은 exe를 수동으로 실행해야 하고,
  껐다 켜져도 자동으로 다시 뜨지 않는다. PC 부팅 시 자동 실행 + 비정상
  종료 시 자동 재시작(스펙 13.3)이 필요하면 Windows 서비스로 등록하는
  다음 단계가 필요하다(별도 요청 시 진행).
- **바탕화면 아이콘/설치 마법사 없음**: 지금은 exe 파일 하나를 그냥
  복사해서 실행하는 방식이다. "다음, 다음"으로 설치되는 인스톨러가
  필요하면 이것도 다음 단계다.
- **경로에 한글/공백이 있으면**: 패키징 자체(`npm run package:exe`)는
  저장소 경로에 한글/공백이 있어도 잘 되도록 만들었지만(postject를 셸 대신
  API로 직접 호출), 배포된 exe를 실행할 PC의 폴더 경로는 일반적인 실행
  파일과 동일하게 아무 경로에 둬도 된다.
