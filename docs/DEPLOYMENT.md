# 오산온 배포 안내서

사이트는 https://bluepet032.github.io/Osan-On/ 이고 저장소는 [bluepet032/Osan-On](https://github.com/bluepet032/Osan-On)입니다. GitHub Pages(GitHub Actions 방식)와 자동 수집은 이미 켜져 있습니다.

## 워크플로

| 워크플로 | 언제 | 하는 일 |
|---|---|---|
| `CI` (`ci.yml`) | PR, main 푸시 | Python 테스트·ruff·데이터 검증, lint·단위 테스트·빌드·e2e, Firestore 보안 규칙 테스트 |
| `Deploy site` (`pages.yml`) | main 푸시(데이터 파일만 바뀐 경우 제외), 수동 | 빌드 후 Pages 배포 |
| `Collect data and deploy` (`collect.yml`) | 매일 03:11(KST), 수동 | 수집 → 검증 → 데이터 커밋 → 빌드 → 배포, 수집 이상 이슈 |

GitHub의 예약 실행은 부하에 따라 몇 시간 늦게 시작할 수 있습니다.

## 저장소 설정값

공개 저장소이므로 비밀 값은 **Secrets**에, 브라우저에 포함되는 공개 설정은 **Variables**에 둡니다. 설정 화면은 [Actions secrets and variables](https://github.com/bluepet032/Osan-On/settings/secrets/actions)입니다.

| 종류 | 이름 | 값 | 필수 |
|---|---|---|---|
| Secret | `GOV24_API_KEY` | 공공데이터포털 인증키(정부24·복지로 공용) | 필수 |
| Variable | `VITE_FIREBASE_API_KEY` | Firebase 웹 앱 `apiKey` | 로그인 기능 |
| Variable | `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` | 로그인 기능 |
| Variable | `VITE_FIREBASE_PROJECT_ID` | `projectId` | 로그인 기능 |
| Variable | `VITE_FIREBASE_APP_ID` | `appId` | 로그인 기능 |
| Variable | `VITE_ADMIN_UIDS` | 수집 상태를 볼 관리자 Firebase UID(쉼표로 여러 명) | 수집 상태 화면 |

터미널에서는 다음처럼 등록합니다. 실행하면 값을 묻습니다.

```bash
gh secret set GOV24_API_KEY -R bluepet032/Osan-On
```

```bash
gh variable set VITE_ADMIN_UIDS -R bluepet032/Osan-On
```

Variables를 바꾼 뒤에는 **Deploy site**를 수동 실행해야 사이트에 반영됩니다(빌드할 때 값이 들어가기 때문입니다).

## 공공데이터포털 인증키

1. [data.go.kr](https://www.data.go.kr/)에 로그인합니다.
2. 아래 두 API에 각각 **활용신청**합니다. 둘 다 자동승인이고, 키는 계정당 하나라 같은 키를 씁니다.
   - [행정안전부_대한민국 공공서비스(혜택) 정보](https://www.data.go.kr/data/15113968/openapi.do)
   - [한국사회보장정보원_지자체복지서비스](https://www.data.go.kr/data/15108347/openapi.do)
3. 마이페이지의 활용신청 현황에서 일반 인증키(Encoding·Decoding 아무거나)를 복사해 `GOV24_API_KEY` Secret과 로컬 `.env`에 넣습니다.

개발계정 호출 한도는 정부24 1만 회/일, 복지로 1,000회/일입니다. 매일 수집은 약 135회를 씁니다.

## Firebase (로그인·찜·알림)

없어도 혜택 검색과 맞춤 판정은 동작하고, 로그인 버튼만 비활성으로 보입니다.

1. [Firebase Console](https://console.firebase.google.com/)에서 프로젝트를 만듭니다. Spark(무료) 요금제로 충분합니다.
2. **Firestore Database**를 운영 모드로 만들고, 위치는 서울 `asia-northeast3`로 정합니다. 위치는 나중에 바꿀 수 없습니다.
3. Firestore **규칙(Rules)** 탭에 저장소의 [`firestore.rules`](../firestore.rules) 내용을 붙여 넣고 게시합니다. 테스트 모드의 전체 공개 규칙은 쓰지 마세요.
4. **Authentication → 로그인 방법 → Google**을 사용 설정합니다.
5. Authentication **설정 → 승인된 도메인**에 `bluepet032.github.io`와 `localhost`를 추가합니다. `https://`와 경로는 넣지 않습니다.
6. **프로젝트 설정 → 내 앱 → 웹 앱 추가**에서 앱을 등록하고, 설정값 4개를 위 표의 Variables로 등록합니다. 이 값들은 브라우저에 포함되는 공개 식별자입니다. 서비스 계정 키와 혼동하지 마세요.
7. 로컬에서 확인하려면 같은 값을 `.env`의 `VITE_FIREBASE_*`에 넣습니다.

### 관리자 UID

1. 사이트에서 관리자로 쓸 Google 계정으로 한 번 로그인합니다.
2. Firebase Console **Authentication → 사용자**에서 그 계정의 **사용자 UID**를 복사합니다.
3. `VITE_ADMIN_UIDS` Variable에 넣고 Deploy site를 수동 실행합니다.

이메일 대신 UID를 쓰는 이유는 빌드에 들어간 값이 공개 JS에 그대로 보이기 때문입니다. 이 설정은 수집 상태 화면을 숨기는 것뿐이고, 상태 데이터(`data/sources.json`)는 공개 파일로 남습니다.

### 보안 규칙을 바꿨을 때

`firestore.rules`를 고치면 PR의 CI가 `tests/firestore/rules.test.mjs`로 검사합니다. 통과를 확인한 뒤 Firebase Console에 같은 내용을 다시 게시하세요. 저장소 파일을 바꿔도 Firebase에 자동으로 반영되지 않습니다.

## 수동 수집

```bash
gh workflow run collect.yml -R bluepet032/Osan-On
```

GitHub의 [수집 워크플로](https://github.com/bluepet032/Osan-On/actions/workflows/collect.yml)에서 **Run workflow**를 눌러도 됩니다. 기본값(`all`, 건수 비움)으로 실행하세요. 작은 건수를 넣으면 그 결과가 그대로 배포됩니다. 보통 5~10분이 걸립니다.

## 수집 이상 자동 이슈

수집이 끝나면 아래 조건에서 이슈를 엽니다. 같은 제목의 이슈가 열려 있으면 새로 만들지 않고, 회복되면 자동으로 닫습니다.

- `[수집 실패] <출처 ID>`: 2회 연속 실패
- `[수집 급감] <출처 ID>`: 직전 성공 때 10건 이상이던 수집 건수가 절반 미만으로 줄어듦(부분 수동 실행 제외)
- `[필터 정보 급감] <출처 ID>`: 신청 방법 정보가 있는 혜택 비율이 직전 성공 대비 절반 미만으로 떨어짐

## 배포 확인표

- CI가 모두 통과했는가
- 첫 화면에서 `data/*.json`이 404 없이 로드되고, 설문 후 판정 탭 건수가 보이는가
- 관리자 계정에서만 메뉴에 "수집 상태"가 보이는가
- 원문 링크가 정부24·복지로 상세 페이지로 열리는가
- 모바일·다크 테마와 새로고침 후 URL 필터 복원이 동작하는가
- 저장소에 인증키 문자열이 없는가(`git grep`)

## 장애 복구

1. Actions에서 실패한 작업의 첫 실패 단계를 확인합니다.
2. 데이터 검증 실패면 자동 데이터 커밋을 되돌리기보다 원인(수집기, 수동 YAML)을 고쳐 다시 수집합니다.
3. 빌드 실패면 로컬에서 `corepack pnpm install --frozen-lockfile` 후 `corepack pnpm build`로 재현합니다.
4. 출처 하나가 실패해도 그 출처의 마지막 정상 데이터가 유지됩니다. 대응은 [운영 안내서](OPERATIONS.md)를 따릅니다.
