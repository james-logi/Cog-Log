# Vision Inspection Log Program

비전 검사 결과를 TCP/IP로 송수신하고 웹에서 모니터링·기록하는 프로그램.
전체 요구사항은 [vision-inspection-log-program-spec.md](vision-inspection-log-program-spec.md) 참고.

## 아키텍처 (스펙 4.1)

브라우저는 Raw TCP 소켓을 열 수 없으므로, TCP 통신은 백엔드가 전담하고
웹 브라우저는 HTTPS + WebSocket으로만 백엔드와 통신한다.

```
비전 시스템 ── Raw TCP ── 백엔드(Node/TS) ── HTTPS/WS ── 브라우저(React)
                              │
                          SQLite (MVP)
```

- `backend/` — Express REST API, WebSocket 실시간 허브, TCP 어댑터, SQLite, 파일 Export 큐
- `frontend/` — React + Vite 웹 UI
- `cloud-dashboard/` — (선택) Cloudflare Pages + D1로 배포하는 원격 조회 전용
  읽기 대시보드. 카메라와의 TCP 통신은 절대 여기로 옮기지 않고, `backend/`가
  쌓은 로그를 복제만 한다. 설정 방법은
  [docs/cloud-dashboard-setup.md](docs/cloud-dashboard-setup.md) 참고.
- `docs/pre-development-checklist.md` — 스펙 17장 미확정 항목 추적
- `docs/native-exe-packaging.md` — 현장 PC 배포용 단일 실행파일(.exe) 만들기

## 로컬 실행

Node.js 22.5+ 필요(DB는 별도 설치 없이 Node 내장 `node:sqlite` 사용 — 네이티브 빌드 도구 불필요).

```bash
npm install
npm run migrate   # SQLite 스키마 생성 (backend/data/vision-log.sqlite3)
npm run dev        # backend(4000) + frontend(5173) 동시 실행
```

프런트엔드는 `http://localhost:5173`, 백엔드 health check는
`http://localhost:4000/api/health`.

## 현재 상태

스펙 18장 "권장 개발 순서" 4~5단계(수집 파이프라인/파일 Export) 진행 중.

- 완료: DB 스키마, 로그인/로그아웃/세션(HttpOnly 쿠키 + CSRF), 사용자 CRUD,
  로그인 잠금, 감사 로그, 최초 실행 시 Admin 계정 자동 생성.
- 완료: TCP Server/Client 어댑터(CR/LF/CRLF/사용자 구분자 프레이밍, 재접속
  백오프, TCP keepalive), 통신 설정 화면, 모니터링 화면(실시간 터미널 +
  송신 + TXT/XLSX 저장 상태 표시), 일자별 번호 발급, 연결/로그 DB 기록과
  WebSocket 실시간 브로드캐스트. J1C 프로그램 상대로 TCP Server/Client
  상호 테스트 완료.
- 완료: 저장 설정 화면(폴더 선택기 포함) + TXT/XLSX 파일 Export 큐(실패
  자동/수동 재시도, 수식 주입 방지), 로컬 PC 폴더 브라우징 API.
- 완료(선택 기능): 여러 현장 PC를 구분하는 사이트 ID + 켜기/끄기 토글,
  로컬 로그를 Cloudflare D1 기반 원격 조회 대시보드로 복제하는 큐
  (`backend/src/cloud/sync.ts`, 기본 비활성) + 사이트별 필터/TXT·CSV
  다운로드. 설정 방법은 [docs/cloud-dashboard-setup.md](docs/cloud-dashboard-setup.md).
- 완료: 로그 조회 API(`GET /api/logs`, 기간/방향/상태/문자열 검색) — 모니터링
  화면이 여기서 최근 기록을 다시 불러온다. 검색 전용 화면은 아직 없음.
- 완료: 단일 실행파일(.exe) 패키징(`backend/npm run package:exe`) — Node
  설치 없이 현장 PC에 exe 하나만 복사해서 실행 가능. 자동 시작/재시작(Windows
  서비스 등록), 설치 마법사는 아직 없음. 자세한 내용은
  [docs/native-exe-packaging.md](docs/native-exe-packaging.md).
- 미구현: 일정 관리, 시스템 상태, 보존 정책에 따른 자동 삭제. 고정
  길이/길이 헤더 프레이밍은 17장 항목 확정 후 추가.
