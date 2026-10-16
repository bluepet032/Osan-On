# QuestBoard 배포 안내서

현재 운영 중인 사이트는 [https://bluepet032.github.io/QuestBoard/](https://bluepet032.github.io/QuestBoard/)이며, 저장소는 [bluepet032/QuestBoard](https://github.com/bluepet032/QuestBoard)입니다. Pages와 자동 배포가 이미 동작하므로 새 저장소 생성, `git remote` 등록, Pages 소스 설정은 다시 할 필요가 없습니다.

## 현재 운영 설정

- 공고 수집은 기존 `Collect data and deploy` 워크플로가 계속 담당합니다.
- 사이트 배포는 기존 `Deploy site` 워크플로가 담당합니다.
- Firebase 개인 기능은 아래 프로젝트 설정과 저장소 변수가 준비된 뒤 새 코드가 배포되어야 켜집니다.
- 공개 저장소에 `.env.local`, 서비스 계정 키, 관리자 자격 증명을 올리지 마세요. Firebase 웹 앱 설정값은 프런트엔드에 포함되는 공개 식별자이므로 아래 GitHub **Variables**에 둡니다.

## 사용자가 설정할 Firebase 항목

### 1. Firebase 프로젝트와 Firestore 만들기

1. [Firebase Console](https://console.firebase.google.com/)에서 프로젝트를 만들거나 QuestBoard용 기존 프로젝트를 선택합니다. 요금제는 우선 Spark로 둡니다. 무료 사용량을 넘으면 해당 서비스가 그달 말까지 중지되며, 결제 계정을 연결하면 Blaze로 바뀔 수 있습니다. ([Firebase 요금제](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans))
2. **Firestore Database → 데이터베이스 만들기**에서 운영 모드를 선택합니다.
3. 위치는 **서울 `asia-northeast3`**로 선택합니다. [지원 위치 목록](https://firebase.google.com/docs/firestore/locations)을 확인하고 생성 전에 위치를 결정하세요. 이미 데이터베이스를 만들었다면 위치를 바꿀 수 없으니 먼저 현재 위치를 확인합니다.
4. Firestore의 **규칙(Rules)** 탭에 저장소의 [`firestore.rules`](../firestore.rules) 내용을 붙여 넣고 **게시(Publish)**합니다. 테스트 모드의 전체 공개 규칙은 게시하지 마세요.

#### 보안 규칙 검사(게시 전 권장)

`firestore.rules`는 사이트가 실제로 쓰는 필드와 길이만 허용합니다. 규칙을 바꿨다면 게시 전에 에뮬레이터로 확인하세요. JDK 21 이상이 필요하고, 프로젝트 의존성을 건드리지 않도록 별도 폴더(여유 공간이 있는 드라이브)에서 실행합니다.

```powershell
New-Item -ItemType Directory -Force D:\qb-rules-test; Set-Location D:\qb-rules-test
'{"emulators":{"firestore":{"host":"127.0.0.1","port":8080},"ui":{"enabled":false}}}' | Set-Content firebase.json
npm init -y
npm install --legacy-peer-deps firebase-tools @firebase/rules-unit-testing firebase@12
Copy-Item D:\Projects\QuestBoard\tests\firestore\rules.test.mjs .
$env:RULES_PATH = 'D:\Projects\QuestBoard\firestore.rules'
npx firebase emulators:exec --only firestore --project demo-questboard "node rules.test.mjs"
```

마지막 줄에 `20/20 passed`가 나오면 사이트의 저장·수정·삭제는 모두 허용되고, 다른 사용자 접근·알 수 없는 필드·길이 초과는 거부되는 것입니다. 확인 후 폴더는 지워도 됩니다. 같은 검사는 CI(`ci.yml`의 `firestore-rules` job)가 푸시와 PR마다 자동으로 실행합니다.

### 2. Google 로그인 켜기

1. Firebase Console의 **Authentication → 시작하기 → 로그인 방법(Sign-in method) → Google**을 사용 설정하고 지원 이메일을 선택해 저장합니다. ([Google 로그인 공식 안내](https://firebase.google.com/docs/auth/web/google-signin))
2. Authentication **Settings → 승인된 도메인(Authorized domains)**에서 다음 호스트를 추가합니다.
   - `bluepet032.github.io` — 운영 사이트
   - `localhost` — 로컬 로그인 확인용
3. 도메인에는 `https://`, 저장소 경로(`/QuestBoard`) 또는 끝의 `/`를 넣지 않습니다. 최근 Firebase 프로젝트는 `localhost`가 기본 등록되어 있지 않을 수 있으므로 목록에서 확인하세요.

### 3. Firebase 웹 앱 설정값 준비

1. 프로젝트 설정(톱니바퀴) **→ 일반(General) → 내 앱(Your apps) → 웹 앱 추가**에서 QuestBoard 웹 앱을 등록합니다. Firebase Hosting은 추가할 필요가 없습니다.
2. 웹 앱 SDK 설정에서 아래 네 값을 복사합니다. Firebase 웹 설정의 이 값들은 브라우저에 포함되는 공개 식별자입니다. 서비스 계정 JSON이나 관리자 키와 혼동하지 마세요.

| 값 이름 | Firebase 설정에서 복사할 항목 |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_APP_ID` | `appId` |

### 4. 로컬 환경 변수 설정

QuestBoard 프로젝트 루트에서 PowerShell을 열어 예시 파일을 복사하고 편집합니다.

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

`.env.local`의 Firebase 네 항목을 실제 값으로 채웁니다. 이 파일은 Git에 올라가지 않습니다. 값을 채운 뒤 알려 주시면 로컬에서 Google 로그인과 데이터 저장을 확인하겠습니다. 설정값 자체를 채팅으로 보낼 필요는 없습니다.

### 5. GitHub Actions 변수 설정

1. [저장소 Actions 변수 설정](https://github.com/bluepet032/QuestBoard/settings/variables/actions)을 엽니다.
2. **New repository variable**을 눌러 위 표의 이름 네 개를 각각 만듭니다.
3. Firebase 웹 앱 설정에서 복사한 해당 값을 넣고 저장합니다. 이 값은 공개 웹 설정이라 **Variables**에 둡니다. **Secrets**나 서비스 계정 키는 사용하지 않습니다. ([GitHub 변수 설정 안내](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables))

두 배포 워크플로 모두 이 변수들을 빌드에 전달합니다. 따라서 수동 배포와 정기 데이터 수집 뒤 배포에서 Firebase 기능 설정이 빠지지 않습니다. 변수 추가가 끝나면 기존 코드 반영·배포 절차를 진행합니다.

## 기업마당 설정

기업마당은 공개 지원사업·행사 목록을 HTML로 읽으므로 API 키나 GitHub Secret을 등록할 필요가 없습니다.

## 기존 Pages 배포 동작

현재 사이트가 이미 공개되어 있으므로 일반 배포에서는 추가 Pages 설정이 필요하지 않습니다. `main` 변경으로 `Deploy site`가 실행되며, 작업 완료 뒤 같은 운영 주소에서 확인합니다. 아직 사이트에 없는 기능은 코드를 저장소에 반영하기 전까지 배포되지 않습니다.

Vite의 상대 경로 빌드를 사용하므로 저장소명이 무엇이든 기본 Pages 하위 경로에서 동작합니다.

## 자동 수집 일정

`Collect data and deploy` 워크플로는 **하루 한 번, 한국시간 약 03:11**(UTC 18:11)에 모든 출처를 수집하고 배포합니다. GitHub의 부하에 따라 예약 실행이 몇 시간 늦어질 수 있습니다(2026년 10월 실측: 오전 6:37~9:34 시작).

### 수동 갱신

바로 갱신하고 싶을 때는 저장소 관리자가 직접 실행합니다.

1. 사이트의 **수집 상태** 화면에서 **GitHub에서 지금 수집 실행**을 누르거나, [수집 워크플로](https://github.com/bluepet032/QuestBoard/actions/workflows/collect.yml)를 엽니다.
2. **Run workflow**를 누릅니다. 기본값(`all`, 건수 비움)이면 전체 출처를 `sources.yml`의 출처별 건수로 수집합니다. 특정 출처만 다시 받으려면 출처 ID를 넣습니다. 건수 칸은 비워 두세요. 작은 건수를 넣으면 그 결과가 그대로 배포되어, 날짜 미상 공고 일부가 다음 수집 때까지 빠집니다.
3. 수집과 배포에 보통 5~10분이 걸립니다. 끝나면 사이트에서 **다시 불러오기**(목록 화면) 또는 **최신 데이터 다시 불러오기**(수집 상태 화면)를 누릅니다.

터미널에서는 GitHub CLI로도 실행할 수 있습니다.

```powershell
gh workflow run collect.yml -f schedule=all
```

사이트에는 실행 버튼 대신 GitHub 링크만 둡니다. 정적 사이트에 워크플로 실행 토큰을 넣으면 누구나 토큰을 꺼내 쓸 수 있기 때문입니다.

### 수집 이상 자동 이슈

수집이 끝나면 다음 조건에서 GitHub 이슈를 자동으로 엽니다. 같은 제목의 이슈가 열려 있으면 새로 만들지 않고, 상태가 회복되면 자동으로 닫습니다. 저장소의 Issues 기능이 켜져 있어야 합니다.

- `[수집 실패] <출처 ID>`: 2회 연속 실패(하루 한 번 실행 기준 약 이틀)
- `[수집 급감] <출처 ID>`: 직전 성공 때 10건 이상이던 수집 건수가 절반 미만으로 줄어듦. 특정 출처만 또는 150건 미만으로 수동 실행했을 때는 검사하지 않습니다.
- `[필터 정보 급감] <출처 ID>`: 상세 필터 정보(지역·진행 방식·참가비·참가 대상·상금) 중 직전 성공 때 20% 이상이던 항목의 비율이 절반 미만으로 줄어듦. 수집 건수가 10건 미만이면 판단하지 않으며, 수집 급감과 마찬가지로 부분 수동 실행에서는 검사하지 않습니다.

## 배포 확인표

- `CI`의 Python, 데이터 검증, lint, 단위 테스트, 빌드, 브라우저 테스트가 모두 통과했는가
- Pages 첫 화면에서 `data/*.json`이 404 없이 로드되는가
- `수집 상태`에서 키가 필요한 출처와 실패 사유가 예상대로 보이는가
- 원문 링크가 새 탭에서 열리고 도메인이 맞는가
- 모바일·다크 테마와 새로고침 후 URL 필터 복원이 동작하는가
- 저장소 검색에서 실제 API 키 문자열이 발견되지 않는가

## 배포 장애 복구

1. Actions 실패 작업의 첫 실패 단계를 확인합니다.
2. 데이터 검증 실패면 해당 `public/data` 자동 커밋을 되돌리기보다, 원인 수집기/수동 YAML을 고쳐 전체 수집을 다시 실행합니다.
3. Pages 아티팩트 실패면 로컬에서 `pnpm install --frozen-lockfile && pnpm build`를 재현합니다.
4. 자동 커밋 push 거부면 Workflow permissions와 브랜치 보호 규칙을 확인합니다.
5. 수집처 하나의 실패는 사이트 전체 장애가 아닙니다. 마지막 정상 데이터가 유지되는지 확인하고 [운영 안내서](OPERATIONS.md)에 따라 조치합니다.
