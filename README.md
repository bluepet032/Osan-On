# QuestBoard

IT·게임을 중심으로 디자인·영상, 문학·예술, 기획·아이디어, 창업·비즈니스 분야의 공모전, 지원사업, 해커톤, 행사, 교육 및 채용 정보를 분야별 탭으로 찾는 정적 웹사이트입니다. Python 수집 파이프라인이 공개 정보만 읽어 공통 JSON으로 정규화하고, React 사이트가 검색·필터·정렬·개인 상태를 제공합니다.

## 제공 기능

- IT·게임(기본), 디자인·영상, 문학·예술, 기획·아이디어, 창업·비즈니스 분야 탭
- 공모전·지원사업·해커톤·행사 등 유형별 탭과 현재 조건 기준 건수
- 대학생·인디·AI·공식 출처·NEW·UPDATED·마감임박 빠른 태그
- 초성(ㄱㅇ)·동의어(game jam = 게임잼)·오타 허용 검색, 세부 분야·상태 필터, 4가지 정렬, URL로 공유 가능한 조회 상태
- 출처 신뢰도 배지(공식기관·공공 포털·전문 플랫폼·모음 사이트)
- 상세 조건 필터: 참가 대상, 지역, 진행 방식(온·오프라인), 참가비, 상금. 정보가 없는 공고는 빠지고 몇 건이 빠졌는지 알려 주며, 원하면 함께 볼 수 있습니다.
- 이번 주·다음 주 마감과 최근 7일 새 공고를 모은 주간 요약
- 날짜 미상 및 최근 3개월 마감 공고 분리
- Google 로그인 후 찜·일정·키워드·알림함을 계정 간 동기화하고, 확인·숨김 상태는 브라우저에 저장
- 출처별 수집 상태와 50~69점 수동 검토 큐
- 마감·행사·합격 발표 일정 알림과 제목·기관·요약·태그 기반 맞춤 공고 목록
- 밝게/어둡게/시스템 테마와 모바일 카드 레이아웃
- 한 출처가 실패해도 계속 실행되는 11개 수집처 파이프라인(온오프믹스·한국콘텐츠진흥원은 robots.txt 정책으로 비활성화)

## 저장소 구조

```text
config/                 출처와 분류 키워드
manual/                 수동 추가·수정·제외 YAML
pipeline/               Python 수집·정규화·중복·변경 감지
public/data/            사이트가 읽는 생성 JSON
schemas/                공개 데이터 JSON 스키마
src/                    React + TypeScript 사이트
tests/, e2e/            Python·프론트·브라우저 테스트
.github/workflows/      CI, 매일 수집, Pages 배포
docs/                   배포·운영·수집 정책
firestore.rules         UID별 개인 데이터 접근 규칙
```

## 로컬 실행

권장 환경은 Node.js 24 LTS, pnpm 11, Python 3.14입니다. Python 코드는 로컬 편의를 위해 3.12 이상에서도 실행됩니다.

```powershell
corepack enable
corepack prepare pnpm@11 --activate
pnpm install
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
Copy-Item .env.example .env
pnpm dev
```

기업마당은 공개 지원사업·행사 목록을 직접 읽으므로 API 키가 필요하지 않습니다.

사이트만 확인할 때는 API 키가 필요하지 않습니다. 개발 서버가 표시한 `http://localhost:5173` 주소를 엽니다.

### 데이터 수집

```powershell
# 자동화 가능한 모든 출처(출처별 최대 건수는 sources.yml의 limit, 없으면 150건)
python -m pipeline.cli --schedule all

# 출처 일부 그룹만(sources.yml의 schedule 값 기준)
python -m pipeline.cli --schedule fast
python -m pipeline.cli --schedule slow

# 특정 출처만 진단: 공개 데이터(public/data)를 덮어쓰지 않도록 임시 폴더에 씁니다
python -m pipeline.cli --schedule all --source dev_event --limit 10 --output "$env:TEMP\questboard-check"

# 생성 데이터 계약 검사
python -m pipeline.validate
```

기업마당은 API 키 없이 공개 HTML 검색을 사용합니다. 별도의 키 발급이나 GitHub Secret 등록은 필요하지 않습니다.

### 테스트와 빌드

```powershell
python -m pytest
python -m pipeline.validate
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

## 분류·표시 원칙

- IT·게임 관련성 70점 이상은 IT·게임 탭에 공개합니다. 70점 미만이어도 제목이나 원본 분류가 다른 분야 주제어(영상, 문학, 아이디어, 창업 등)에 맞으면 해당 분야 탭에 공개합니다.
- 원본 분류에 IT와 사진·영상 등 여러 분야가 섞여 있으면 제목의 명확한 분야를 우선합니다. 제목에 AI·게임·ERP·XR 등 기술 근거가 있거나 게임 형태 출품이 명시된 공고는 IT·게임에 유지합니다. 다른 분야를 정할 때도 제목 주제어를 먼저 사용하고, 제목에 근거가 없을 때 원본 분류를 사용합니다.
- 어느 분야에도 맞지 않으면 50~69점은 검토 큐, 49점 이하는 제외합니다. 입찰·용역·경품 이벤트 같은 제외 문구는 어느 탭에도 공개하지 않습니다.
- 채용·인턴·상업성 유료 교육은 `확장 기회`로 수집하되 기본 전체 목록에서 숨깁니다.
- 최초 발견 후 72시간은 `NEW`, 중요 정보 변경 후 48시간은 `UPDATED`입니다.
- D-7 이하는 마감임박, D-3 이하는 긴급, 당일은 오늘마감입니다.
- 정확한 마감일이 없으면 날짜 미상 화면으로 이동합니다.
- 원문 본문·포스터·첨부파일은 재배포하지 않고 링크, 추출 요약, 분류 결과와 해시성 식별자만 저장합니다.

키워드 점수와 분야 탭 주제어는 [config/taxonomy.yml](config/taxonomy.yml)(`fields`, `weak_title_keywords`, `domains`), 출처는 [config/sources.yml](config/sources.yml)에서 관리합니다. 상세 수집 정책은 [docs/COLLECTORS.md](docs/COLLECTORS.md)를 참고하세요.

## 수동 관리

모든 YAML 변경은 자동 결과보다 우선합니다.

- `manual/opportunities.yml`: 자동 수집되지 않은 공고 추가
- `manual/overrides.yml`: ID 또는 원문 URL 기준 필드 수정·강제 공개·검토
- `manual/exclusions.yml`: ID 또는 원문 URL 강제 제외

예시는 [운영 안내서](docs/OPERATIONS.md)에 있습니다. 수정 후 `python -m pipeline.cli --schedule all`로 다시 생성하고 `python -m pipeline.validate`로 확인합니다.

## GitHub Pages 배포

원격 저장소 생성, Secret, Actions 권한과 Pages 설정은 [배포 안내서](docs/DEPLOYMENT.md)를 순서대로 따르세요. 사이트 코드 변경은 `pages.yml`, 데이터 갱신은 `collect.yml`이 매일 오전(예약 03:11, 실제 시작은 GitHub 사정으로 보통 오전 6~10시)에 수집·빌드·Pages 배포를 담당합니다. 바로 갱신하려면 [배포 안내서의 수동 갱신](docs/DEPLOYMENT.md#수동-갱신)을 따르세요. 자동 데이터 커밋이 다른 워크플로를 다시 발생시키지 않아도 같은 수집 워크플로에서 최신 사이트를 배포합니다.

## 운영상 주의

차단, 로그인, CAPTCHA를 우회하지 않습니다. robots.txt·이용약관·페이지 구조가 바뀌어 허용 여부나 안정성을 확신할 수 없으면 해당 수집처를 비활성화하고 수동 YAML 또는 승인된 대체 출처를 사용하세요. 공개 전 운영자는 출처별 정책을 다시 확인할 책임이 있습니다.

장애, stale 판정, 수집처 교체와 데이터 복구 절차는 [docs/OPERATIONS.md](docs/OPERATIONS.md)에 정리되어 있습니다.
