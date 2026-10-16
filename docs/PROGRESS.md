# 오산온 진행 현황

마지막 갱신: 2026-10-16 · 기준 커밋: `4f1d4c2` (PR [#9](https://github.com/bluepet032/Osan-On/pull/9) 머지)

오산온은 성별·나이(원하면 소득·가구·특수 대상·직업)를 입력하면 오산시·경기도·중앙정부 혜택 중 **해당 가능성이 높은 것**을 판정 근거와 함께 보여 주는 정적 웹사이트입니다. 공모전·과제 제출용 데모로 만들었고, QuestBoard(공모전 모음 사이트) 복제본에서 UI와 파이프라인 구조를 이어받았습니다.

- 사이트: https://bluepet032.github.io/Osan-On/
- 설계 스펙: [docs/superpowers/specs/2026-10-16-osan-on-design.md](superpowers/specs/2026-10-16-osan-on-design.md)
- P0 구현 계획: [docs/superpowers/plans/2026-10-16-osan-on-p0.md](superpowers/plans/2026-10-16-osan-on-p0.md)

## 1. 지금 상태 한눈에

| 항목 | 상태 |
|---|---|
| 코드 | P0·P1·P2와 리뷰 반영까지 main에 머지됨 |
| 사이트 배포 | GitHub Pages(Actions 방식) 배포 성공 |
| 데이터 | 2026-10-16 로컬에서 수집해 커밋한 1,330건(오산시 38 · 경기도 189 · 중앙 1,103) |
| 자동 수집 | **아직 GitHub에서 한 번도 실행하지 않음.** Secret이 동작하는지 미확인 |
| `GOV24_API_KEY` Secret | 등록됨 |
| Firebase(로그인) | **미설정.** 로그인·찜·알림은 비활성, 검색과 맞춤 판정은 동작 |
| 테스트 | Python 전체, vitest 95개, Playwright e2e 24개(데스크톱·모바일), PR CI 2개 통과 |

## 2. 완료한 작업

### P0: 핵심 흐름
- **정부24 공공서비스(혜택) API 수집기** (`pipeline/collectors/gov24.py`)
  - 혜택 목록과 지원조건 코드를 합칩니다. 조건 코드는 성별, 연령, 중위소득, 개인 특성, 가구, 창업 여부입니다.
  - 오산시·경기도·중앙(중앙행정기관·공공기관) 혜택 중 개인·가구 대상만 남깁니다.
- **데이터 모델 전환**
  - `domain`은 서비스분야 10종으로, `primary_type`은 지원 형태로 바꿨습니다.
  - `jurisdiction`과 `conditions` 필드를 추가했습니다.
- **판정 모듈** (`src/eligibility.ts`): 결과는 가능성 높음 / 확인 필요 / 해당 없음 세 가지이고, 판정 근거(✓ ✗ ?)를 함께 냅니다.
- **첫 화면**: 성별·나이 2문항 설문으로 시작합니다. "더 정확하게"를 누르면 소득, 가구, 특수 대상, 직업·학적을 추가로 입력합니다.
- **정리**: 이름을 오산온으로 바꾸고, 공모전 수집기 12종과 IT 분류기를 삭제했습니다.

### 실데이터로 보정한 것
- **소관 판별**: 오산시 산하 재단·공단, 경기도 산하기관, 공공기관까지 소관에 포함합니다.
- **신청기한 해석**: 연도가 붙은 기간만 날짜로 믿습니다. "5년 이내(2012.7.1. 이후…)" 같은 문장을 마감일로 잘못 읽어 혜택이 숨는 문제를 막았습니다.
- **판정 규칙**:
  - 선택지가 모두 체크된 그룹(예: 소득 5구간 전체)은 제한 없음으로 봅니다.
  - 연령 상한 120은 상한 없음으로 봅니다.
  - 법인·사업자 코드가 붙은 혜택은 확인 필요로 둡니다.
- **정렬**: 기본 정렬을 "오산 우선"(오산시 → 경기도 → 중앙)으로 했습니다.

### P1: 탭·필터·동기화
- **탭**: 소관 탭(전체/오산시/경기도/중앙정부), 분야 탭('모든 분야'가 맨 앞), 지원 형태 탭(융자·감면은 괄호 안 세부 형태를 우선)
- **상세 필터**: "신청 방법"(온라인/방문/신청 불필요) 하나로 바꾸고, 공모전 필드(지역·진행 방식·참가비·상금 등)를 삭제했습니다.
- **로그인 시 맞춤 조건 동기화**:
  - 저장 위치는 `users/{uid}/profile/main`입니다. 보안 규칙과 규칙 테스트를 추가했고, 계정을 삭제하면 함께 지워집니다.

### P2: 오산시 보강과 개인 기능
- **복지로 지자체복지서비스 API 수집기** (`pipeline/collectors/bokjiro.py`)
  - 오산시청 사이트는 robots.txt가 모든 봇을 막고 있어서(`Disallow: /`) 크롤링 대신 이 API를 씁니다.
  - 대상자(장애인·보훈·한부모·다자녀·다문화·저소득)를 조건 코드로 옮깁니다. 판단이 애매하면 "확인 필요"로 둡니다.
  - 정부24와 같은 지역 혜택은 제목 유사도로 합칩니다. 그 결과 오산시는 22건에서 38건으로, 경기도는 133건에서 189건으로 늘었습니다.
- **주간 요약**: 프로필상 "해당 없음"인 혜택은 뺍니다.
- **찜·일정**: 일정 이름을 신청 마감·선정 발표로 바꿨습니다.
- **알림함**: 맞춤 조건을 저장한 뒤 새로 올라온 "가능성 높음" 혜택을 알려 주는 알림을 추가했습니다(최근 20건).

### 리뷰 반영 (Codex 리뷰 3건)
- **계정 간 프로필 유출 차단**: 브라우저 프로필에 출처 계정을 기록하고, 로그아웃하면 계정 프로필을 지웁니다.
- **수동 등록 혜택**: `manual/opportunities.yml`에서 `jurisdiction`과 `conditions`를 지정할 수 있게 했습니다.
- **판정 표시**: 공유 링크 페이지와 주간 요약 행에도 판정 배지와 근거를 표시합니다.

## 3. 주요 파일

| 파일 | 역할 |
|---|---|
| `pipeline/collectors/gov24.py` | 정부24 목록·지원조건 수집, 소관·신청기한·신청방법 해석 |
| `pipeline/collectors/bokjiro.py` | 복지로 지자체복지서비스 수집, 대상자 → 조건 코드 |
| `pipeline/normalize.py` | 서비스분야 → 분야 탭, 지원유형 → 지원 형태 |
| `pipeline/dedupe.py` | 두 포털의 같은 지역 혜택 합치기(`same_local_benefit`) |
| `config/sources.yml` | 출처 목록(gov24, bokjiro) |
| `src/eligibility.ts` | 프로필 × 지원조건 판정 |
| `src/profile.ts`, `src/profileContext.tsx` | 프로필 브라우저 저장과 Firestore 동기화 |
| `src/components/ProfileCard.tsx` | 첫 화면 설문·상세 입력 카드 |
| `src/pages/OpportunityPage.tsx` | 혜택 목록(판정·소관·분야 탭, 필터, 정렬) |
| `firestore.rules`, `tests/firestore/rules.test.mjs` | 계정 데이터 보안 규칙과 규칙 테스트 |

## 4. 바로 해야 할 일

1. **수집 워크플로를 한 번 실행해 Secret을 확인합니다.**
   ```bash
   gh workflow run collect.yml -R bluepet032/Osan-On
   ```
   Actions 탭에서 "Collect opportunities" 단계가 성공하고 수집 상태에 정부24와 복지로가 모두 성공으로 나오면 됩니다. 실패하면 Secret 값의 앞뒤 공백과, `GOV24_API_KEY=` 접두어 없이 키만 넣었는지 확인하세요.
2. **(선택) Firebase 설정.** 로그인·찜·알림을 데모에서 보여 주려면 필요합니다.
   1. Firebase 프로젝트와 웹 앱을 만듭니다.
   2. Authentication에서 Google 로그인을 켜고, 승인 도메인에 `bluepet032.github.io`를 추가합니다.
   3. Firestore를 만들고 `firestore.rules` 내용을 게시합니다.
   4. 저장소 Variables에 `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`를 등록합니다(`gh variable set 이름 -R bluepet032/Osan-On`).
   5. Variables 등록 후 Pages를 다시 배포해야 반영됩니다. Actions 탭에서 "Deploy site"를 수동 실행하면 됩니다.

## 5. 앞으로 할 작업

### P3 (설계에 있던 남은 범위)
- [ ] **수집 상태 페이지를 관리자만 보게**: 관리자 Google 계정으로 로그인했을 때만 메뉴·페이지를 보여 주는 화면 숨김 방식입니다. 상태 데이터(`sources.json`)는 공개 파일로 남습니다.
- [ ] **문서 정리**: `README.md`, `docs/DEPLOYMENT.md`, `docs/OPERATIONS.md`, `docs/COLLECTORS.md`, `docs/PROJECT_REVIEW.md`가 아직 QuestBoard 설명 그대로입니다.
- [ ] **디자인 다듬기**: 로고·색, 설문 카드, 모바일 화면, 혜택 상세 가독성

### 정리하면 좋은 것
- [ ] `config/taxonomy.yml`과 `load_taxonomy()`는 사실상 쓰지 않습니다(공모전 분류용 잔재). `normalize()`의 `taxonomy` 인자도 함께 정리할 수 있습니다.
- [ ] `pipeline/collectors/html.py`(범용 HTML 수집기)는 지금 쓰는 출처가 없습니다. 크롤링 출처를 추가하지 않을 거면 삭제할 수 있습니다.
- [ ] 브라우저 저장 키(`questboard.personal.v1`, `questboard.theme`)와 캘린더 UID(`@questboard`), e2e 파일명 `e2e/questboard.spec.ts`에 옛 이름이 남아 있습니다. 저장 키를 바꾸면 기존 사용자의 브라우저 상태가 사라지므로 바꿀 때는 옮겨 주는 코드가 필요합니다.
- [ ] Dependabot PR 4개 검토(그중 vite 8 업그레이드는 CI 실패)

### 데이터 품질
- [ ] **조건 코드 밖의 제한**: 정부24 조건 코드에 없는 제한(예: 원문에만 있는 "56세")은 판정하지 못합니다. 지원대상 원문에서 나이·대상을 뽑아 보완하는 방법을 검토합니다.
- [ ] **복지로 "확인 필요" 비율**: 복지로 혜택 72건 중 52건은 대상자 정보가 없어 "확인 필요"입니다.
- [ ] **중복 판정 경계**: 제목 유사도 0.8 기준이라 "어린이집 입학준비금 지원"(0.79)처럼 아깝게 안 합쳐진 쌍이 있습니다.
- [ ] **NEW 배지**: 첫 수집이라 지금은 거의 모든 혜택에 NEW 배지가 붙어 있습니다. 72시간이 지나면 자연히 사라집니다.
- [ ] **호출 한도**: 공공데이터포털 개발계정 한도는 정부24 1만 회/일, 복지로 1,000회/일입니다(지금 하루 약 135회). 운영 전환 시 활용사례를 등록해 운영계정으로 바꿉니다.

## 6. 알아 둘 결정과 이유

- **오산시청은 크롤링하지 않습니다.** robots.txt가 네이버 검색 로봇(Yeti) 외 모든 봇을 막고 있습니다(2026-10-16 확인).
- **판정은 규칙 기반입니다.** 비용이 없고, 판정 근거를 그대로 보여 줄 수 있습니다. 화면마다 "최종 자격은 원문에서 확인" 안내를 둡니다.
- **맞춤 조건은 브라우저에 먼저 저장합니다.** 계정 저장이 실패해도 입력한 내용이 남고, 로그인하지 않아도 판정이 됩니다.
- **내부 타입 이름 `Opportunity`는 유지했습니다.** 화면에 드러나지 않는 이름 변경은 비용만 커서, 화면 문구만 "혜택"으로 바꿨습니다.

## 7. 로컬 실행

```powershell
corepack pnpm install
py -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
# .env에 GOV24_API_KEY=공공데이터포털 인증키 (정부24·복지로 둘 다 활용신청 필요)
.\.venv\Scripts\python -m pipeline.cli --schedule all
.\.venv\Scripts\python -m pipeline.validate
corepack pnpm dev
```

테스트:

```powershell
.\.venv\Scripts\python -m pytest
corepack pnpm test
corepack pnpm lint
corepack pnpm build
corepack pnpm exec playwright test
```
