# 운영 및 장애 대응

## 생성 데이터

`public/data`는 다음 파일로 나뉩니다.

- `active.json`: 모집 예정·진행 중인 공개 공고
- `undated.json`: 마감일이 정확하지 않은 공개 공고
- `closed.json`: 최근 3개월 내 마감 공고
- `review.json`: 점수 50~69점의 비공개 검토 후보
- `sources.json`: 출처별 최근 실행 결과와 오류

모든 파일은 `schema_version`과 `generated_at`을 갖습니다. 직접 JSON을 고치지 말고 수동 YAML을 수정한 뒤 파이프라인을 다시 실행하세요.

## 수동 추가 예시

`manual/opportunities.yml`의 `items`에 추가합니다.

```yaml
schema_version: 1
items:
  - id: organizer-2026-indie-contest
    title: 2026 인디게임 제작 공모
    source_name: 주최기관
    source_url: https://official.example.org/notices/42
    organizer: 예시게임재단
    summary: 인디게임 개발팀을 대상으로 제작비와 멘토링을 지원하는 공모입니다.
    recruit_start: '2026-08-01'
    recruit_end: '2026-08-31'
    date_kind: exact
    eligibility: 인디게임 개발팀
    benefits: 제작지원금과 멘토링
    location: 전국
    mode: hybrid
    fee: free
    is_official: true
    force_publish: true
```

날짜를 확정할 수 없다면 `date_kind`를 `ongoing`, `first_come`, `budget`, `unknown`, `inquiry` 중 하나로 지정하고 불확실한 날짜를 임의로 만들지 않습니다.

## 필드 수정·승인 예시

검토 큐의 원문 URL을 기준으로 `manual/overrides.yml`에 추가합니다.

```yaml
schema_version: 1
items:
  - source_url: https://official.example.org/notices/42
    primary_type: contest
    audience_tags: [대학생]
    field_tags: [게임, 인디, AI]
    force_publish: true
```

강제로 검토 큐에 두려면 `force_review: true`를 사용합니다. 자동 필드를 수정할 수 있는 키는 제목, 기관, 요약, 링크, 날짜, 대상, 혜택, 장소, 방식, 비용, 유형·분야·대상 태그, 확장 기회 여부, 분야 탭(`domain`: `it`, `design_media`, `literature_arts`, `planning_ideas`, `business`)입니다. 다른 탭으로 옮기려면 `domain`과 `force_publish: true`를 함께 지정합니다.

## 제외 예시

```yaml
schema_version: 1
ids:
  - 0123456789abcdef0123
source_urls:
  - https://example.org/unrelated-post
```

수정 후 아래 순서로 확인합니다.

```powershell
python -m pipeline.cli --schedule all
python -m pipeline.validate
python -m pytest
```

## 상태 판정과 대응

- 마지막 성공 후 48시간 초과 또는 3회 연속 실패: 사이트에서 주의가 필요한 출처로 표시(수집이 하루 한 번이므로 약 두 번 놓친 상태)
- 2회 연속 실패, 수집 건수 급감 또는 필터 정보 비율 급감: GitHub 이슈 자동 생성([배포 안내서](DEPLOYMENT.md#수집-이상-자동-이슈) 참고)
- 구조 오류: 저장 HTML 픽스처와 실제 공개 페이지 구조를 비교하고 선택자/구조화 데이터 파서를 수정
- HTTP 403·429: 재시도 횟수를 늘리거나 우회하지 말고 자동 수집을 중지해 정책과 호출 빈도를 재확인
- 인증 오류: Secret 이름과 만료 여부를 확인하고 로그에 키가 출력되지 않았는지 점검
- 잘못된 대량 공고: 해당 출처를 `enabled: false`로 두고 기존 정상 JSON을 유지한 채 분류 규칙과 픽스처를 수정

수집 실패 시 선택된 출처의 마지막 정상 공고를 보존합니다. 한 출처 오류가 다른 출처 실행이나 Pages 빌드를 막지 않으며 오류는 `sources.json`에 기록됩니다.

## 수집처 교체

차단·로그인·약관·기술 구조 때문에 안정적인 자동화가 불가능한 출처는 `config/sources.yml`에서 비활성화합니다. 대체 순서는 콘테스트코리아 → 서울 스타트업플러스 → 모모365입니다. 교체 전 반드시 robots.txt, 이용약관, 공개 데이터 경로, 호출 빈도와 원문 링크 보존을 다시 점검하고 저장 픽스처 계약 테스트를 추가합니다.

## 데이터 복구

생성 JSON이 손상되었으면 마지막 정상 Git 커밋의 `public/data`를 복사해 임시 복구한 뒤, 문제 수집처를 제외한 전체 실행으로 재생성합니다. `git reset --hard`처럼 다른 변경을 함께 지우는 명령은 사용하지 않습니다. 자동 커밋마다 데이터 변경이 분리되므로 GitHub의 해당 커밋 diff로 이상 범위를 먼저 확인할 수 있습니다.

## 개인정보와 저작권

원문 본문, 포스터, 첨부파일, 신청자 개인정보를 저장하거나 재배포하지 않습니다. 분류에 필요한 공개 본문은 실행 중에만 사용합니다. 삭제 요청이나 출처 정책 변경이 확인되면 해당 URL을 강제 제외하고 다음 데이터 생성에서 제거합니다.
