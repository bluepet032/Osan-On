# 오산온 (Osan-On)

성별과 나이만 입력하면 **오산시·경기도·중앙정부의 복지·지원금·정부 혜택 중 나에게 해당할 가능성이 높은 것**을 판정 근거와 함께 보여 주는 정적 웹사이트입니다. 소득·가구 상황·특수 대상·직업을 더 입력하면 판정이 더 정확해집니다.

- 사이트: https://bluepet032.github.io/Osan-On/
- 진행 현황과 남은 작업: [docs/PROGRESS.md](docs/PROGRESS.md)
- 설계: [docs/superpowers/specs/2026-10-16-osan-on-design.md](docs/superpowers/specs/2026-10-16-osan-on-design.md)

## 제공 기능

- 첫 화면 성별·나이 설문 → **가능성 높음 / 확인 필요 / 해당 없음** 판정과 근거(예: "✓ 만 19~34세 ✓ 1인 가구 대상")
- "더 정확하게": 소득(중위소득 구간), 가구 상황, 임신·출산, 직업·학적, 장애·보훈 등 특수 대상
- 소관 탭(오산시·경기도·중앙정부), 혜택 분야 탭, 지원 형태 탭(현금·현물·서비스·이용권·융자·감면), 상세 조건 "신청 방법"
- 기본 정렬 "오산 우선", 초성·동의어·오타 허용 검색, URL로 공유되는 조회 상태
- 주간 요약(이번 주·다음 주 신청 마감, 최근 7일 새 혜택). 맞춤 조건으로 "해당 없음"인 혜택은 뺍니다.
- Google 로그인 시 맞춤 조건·찜·일정·키워드·알림함을 계정에 동기화하고, 조건에 맞는 새 혜택이 올라오면 알립니다.
- 밝게/어둡게/시스템 테마, 모바일 카드 레이아웃
- 관리자만 보는 수집 상태 화면, 매일 자동 수집과 수집 이상 자동 이슈

맞춤 조건과 찜은 로그인하지 않아도 이 브라우저에 저장되어 동작하고(찜은 로그인 시 계정에 합칠 수 있음), 일정 알림·메모·키워드는 로그인이 필요합니다. 판정은 정부24·복지로가 공개한 지원조건을 기준으로 한 안내이며, **최종 자격은 반드시 소관 기관 원문에서 확인**해야 합니다.

## 데이터 출처

| 출처 | 내용 |
|---|---|
| [정부24 공공서비스(혜택) API](https://www.data.go.kr/data/15113968/openapi.do) | 중앙부처·공공기관·경기도·오산시 혜택과 지원조건 코드 |
| [복지로 지자체복지서비스 API](https://www.data.go.kr/data/15108347/openapi.do) | 오산시·경기도 자체 복지서비스(정부24와 겹치는 것은 합침) |

두 API 모두 공공데이터포털의 같은 인증키를 쓰고, API마다 활용신청이 필요합니다. 오산시청 사이트는 robots.txt가 수집 봇을 막고 있어 크롤링하지 않습니다. 자세한 내용은 [docs/COLLECTORS.md](docs/COLLECTORS.md)를 참고하세요.

## 저장소 구조

```text
config/sources.yml      출처 목록(gov24, bokjiro)
manual/                 수동 추가·수정·제외 YAML
pipeline/               Python 수집·정규화·중복 합치기·변경 감지
public/data/            사이트가 읽는 생성 JSON(매일 자동 갱신)
schemas/                공개 데이터 JSON 스키마
src/                    React + TypeScript 사이트 (판정: src/eligibility.ts)
tests/, e2e/            Python·프런트·보안 규칙·브라우저 테스트
.github/workflows/      CI, 매일 수집, Pages 배포
docs/                   진행 현황·배포·운영·수집 정책
firestore.rules         계정별 개인 데이터 접근 규칙
```

## 로컬 실행

권장 환경은 Node.js 24, pnpm(corepack), Python 3.14입니다.

```powershell
corepack pnpm install
py -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
Copy-Item .env.example .env
corepack pnpm dev
```

개발 서버가 표시한 `http://localhost:5173`을 엽니다. 저장소에 커밋된 데이터가 있어서 사이트 확인만 할 때는 API 키가 필요하지 않습니다.

### 데이터 수집

`.env`에 `GOV24_API_KEY=공공데이터포털 인증키`를 넣은 뒤 실행합니다.

```powershell
# 전체 출처
.\.venv\Scripts\python -m pipeline.cli --schedule all

# 특정 출처만, 공개 데이터를 덮어쓰지 않도록 임시 폴더에
.\.venv\Scripts\python -m pipeline.cli --source bokjiro --output "$env:TEMP\osanon-check"

# 생성 데이터 계약 검사
.\.venv\Scripts\python -m pipeline.validate
```

### 테스트와 빌드

```powershell
.\.venv\Scripts\python -m pytest
.\.venv\Scripts\python -m ruff check pipeline tests
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm exec playwright test
```

Firestore 보안 규칙 테스트는 JDK가 필요해 CI(`ci.yml`의 `firestore-rules`)에서 실행합니다.

## 배포와 운영

- 배포 설정(Secret, Firebase, Pages, 관리자 UID): [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- 수동 등록·제외, 장애 대응: [docs/OPERATIONS.md](docs/OPERATIONS.md)
