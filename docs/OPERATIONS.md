# 운영 및 장애 대응

## 생성 데이터

`public/data`는 다음 파일로 나뉩니다. 직접 JSON을 고치지 말고 수동 YAML을 수정한 뒤 파이프라인을 다시 실행하세요.

- `active.json`: 신청 기간이 정확한 진행·예정 혜택
- `undated.json`: 상시·기간 미정 혜택(사이트는 `active`와 합쳐서 보여 줍니다)
- `closed.json`: 최근 3개월 안에 신청이 마감된 혜택
- `review.json`: 검토 대기(현재 출처들은 모두 공개로 내보내서 보통 비어 있음)
- `sources.json`: 출처별 최근 실행 결과·오류·신청 방법 정보 비율
- `feed*.xml`: 전체·분야별 새 혜택 RSS

모든 JSON은 `schema_version`과 `generated_at`을 갖고, 형식은 `schemas/opportunities.schema.json`과 `pipeline/validate.py`가 검사합니다.

## 혜택 수동 추가

`manual/opportunities.yml`의 `items`에 추가합니다. 공식 원문으로 확인한 내용만 넣으세요.

```yaml
schema_version: 1
items:
  - id: osan-2026-youth-rent
    title: 오산시 청년 월세 지원
    source_name: 경기도 오산시
    source_url: https://www.osan.go.kr/...
    organizer: 경기도 오산시 청년정책과
    summary: 오산시에 사는 무주택 청년의 월세를 매달 지원합니다.
    date_kind: ongoing
    jurisdiction: osan            # osan / gyeonggi / national
    domain: housing               # 분야 탭 slug
    primary_type: cash            # 지원 형태
    apply_methods: [online, visit]
    conditions: {codes: [JA0412], age_min: 19, age_max: 39}
    eligibility: 오산시 거주 만 19~39세 무주택 청년
    benefits: 월 최대 20만원, 최대 12개월
    is_official: true
```

- `conditions`의 코드는 정부24 지원조건 코드입니다(목록은 [설계 문서 §3](superpowers/specs/2026-10-16-osan-on-design.md)). 조건을 모르면 `conditions`를 빼세요. 그러면 "확인 필요"로 표시됩니다.
- 판정은 같은 그룹(소득 JA020x, 개인 특성 JA03xx, 가구 JA04xx, 창업 JA110x) 안의 코드는 "그중 하나", 그룹끼리는 "모두"입니다. 예를 들어 `[JA0404, JA0412]`는 "1인 가구 **또는** 무주택"이 됩니다. "둘 다"는 표현할 수 없으니 이런 혜택은 핵심 조건 하나만 넣거나 `conditions`를 빼세요.
- 날짜가 확실하지 않으면 `date_kind`를 `ongoing` 또는 `inquiry`로 두고, 불확실한 날짜를 지어내지 않습니다.

## 필드 수정·제외

자동 수집된 혜택의 값을 고치려면 `manual/overrides.yml`에 원문 URL 기준으로 적습니다.

```yaml
schema_version: 1
items:
  - source_url: https://www.gov.kr/portal/rcvfvrSvc/dtlEx/000000000000
    jurisdiction: osan
    conditions: {codes: [JA0328], age_min: null, age_max: null}
```

수정할 수 있는 키는 제목, 기관, 요약, 링크, 날짜, 지원 대상·내용, 신청·문의, 지원 형태, 분야, 태그, 신청 방법, 소관, 지원조건입니다.

빼야 할 혜택은 `manual/exclusions.yml`에 적습니다.

```yaml
schema_version: 1
ids:
  - 0123456789abcdef0123
source_urls:
  - https://www.bokjiro.go.kr/...
```

수정한 뒤 확인합니다.

```powershell
.\.venv\Scripts\python -m pipeline.cli --schedule all
.\.venv\Scripts\python -m pipeline.validate
.\.venv\Scripts\python -m pytest
```

## 상태 판정과 대응

- 마지막 성공 후 48시간 초과, 또는 3회 연속 실패: 수집 상태 화면에 주의 출처로 표시
- 2회 연속 실패·건수 급감·신청 방법 정보 급감: GitHub 이슈 자동 생성([배포 안내서](DEPLOYMENT.md#수집-이상-자동-이슈))
- `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`·"등록되지 않은 서비스키": 해당 API의 활용신청이 빠졌거나 승인 직후 반영 전입니다. data.go.kr 활용신청 현황을 확인하세요.
- `LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR`·호출량 초과: 하루 한도를 넘었습니다. 수동 수집을 반복하지 말고 다음 날까지 기다리거나 운영계정 전환을 신청합니다.
- 구조 오류(빈 목록, XML·JSON 아님): API 응답 형식이 바뀐 것입니다. 실제 응답을 확인하고 수집기와 테스트 픽스처를 함께 고칩니다.

수집이 실패한 출처는 마지막 정상 데이터를 유지합니다. 출처 하나의 오류가 다른 출처나 Pages 빌드를 막지 않으며, 오류는 `sources.json`에 기록됩니다(인증키는 오류 문구에서 지워짐).

## 데이터 복구

생성 JSON이 손상되었으면 마지막 정상 커밋의 `public/data`를 가져와 임시로 복구한 뒤, 문제를 고치고 전체 수집으로 다시 만듭니다. 자동 데이터 커밋은 따로 분리되어 있어서 해당 커밋의 diff로 이상 범위를 먼저 확인할 수 있습니다. `git reset --hard`처럼 다른 변경까지 지우는 명령은 쓰지 마세요.

## 개인정보

- 맞춤 조건(성별·나이·소득·가구·특수 대상)은 로그인하지 않으면 브라우저에만 저장됩니다.
- 로그인하면 `users/{uid}/profile/main`에 저장되고, 본인만 읽고 쓸 수 있습니다(`firestore.rules`). 로그아웃하면 브라우저의 계정 사본을 지우고, 계정을 삭제하면 계정 데이터도 함께 지웁니다.
- 수집 데이터에는 공개된 혜택 안내만 담고, 원문 첨부파일이나 담당자 개인정보는 저장하지 않습니다.
