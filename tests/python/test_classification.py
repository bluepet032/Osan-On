from pipeline.classification import classify
from pipeline.config import load_taxonomy
from pipeline.models import RawOpportunity
import pytest


def raw(**values):
    base = dict(source_id="test", source_name="테스트", source_url="https://example.com/1", title="테스트")
    base.update(values)
    return RawOpportunity(**base)


def test_direct_game_contest_is_published():
    primary, fields, audiences, relevance, adjacent = classify(raw(
        title="대학생 인디게임 개발 공모전",
        summary="게임 개발자가 팀으로 참여하는 소프트웨어 경진대회",
    ), load_taxonomy())
    assert primary == "contest"
    assert "게임" in fields and "인디" in fields
    assert "대학생" in audiences
    assert relevance.score >= 70
    assert relevance.decision == "publish"
    assert not adjacent


def test_promotional_event_is_excluded():
    _, _, _, relevance, _ = classify(raw(
        title="모바일 게임 경품 이벤트",
        summary="상품 할인 행사와 단순 체험단 모집",
    ), load_taxonomy())
    assert relevance.decision == "exclude"


def test_employment_is_adjacent():
    primary, _, _, _, adjacent = classify(raw(
        title="게임 클라이언트 개발자 신입 채용",
        summary="게임 프로그래밍 직무 채용",
    ), load_taxonomy())
    assert primary == "employment"
    assert adjacent


def test_short_english_keywords_require_word_boundaries():
    _, fields, _, relevance, _ = classify(raw(
        title="WITH WORSHIP CREATIVE TEAM",
        summary="청년들을 위한 찬양 집회와 공연",
        source_kind="specialist",
    ), load_taxonomy())
    assert "소프트웨어" not in fields
    assert "AI" not in fields
    assert relevance.decision == "exclude"


def test_single_ai_keyword_contest_reaches_publish_boundary():
    primary, fields, _, relevance, _ = classify(raw(
        title="대학생 AI 영상 공모전",
        summary="대학생이 참여해 영상을 출품하는 공모전입니다.",
    ), load_taxonomy())
    assert primary == "contest"
    assert "AI" in fields
    assert relevance.score >= 70
    assert relevance.decision == "publish"


def test_known_ai_compounds_are_not_lost_to_word_boundaries():
    _, fields, _, relevance, _ = classify(raw(
        title="AIEngineering 소모임 - 실전 GenAI 애플리케이션 만들기",
        source_kind="specialist",
    ), load_taxonomy())
    assert "AI" in fields
    assert relevance.decision == "publish"


def test_body_only_navigation_noise_cannot_auto_publish():
    _, _, _, relevance, _ = classify(raw(
        title="2026 대한민국 부동산 시장 흐름 이해",
        body_text="사이트 메뉴 AI IT 게임 데이터 공모전",
        source_kind="specialist",
    ), load_taxonomy())
    assert relevance.score <= 69
    assert relevance.decision != "publish"


def test_title_hackathon_is_a_direct_format_signal():
    primary, _, _, relevance, _ = classify(raw(
        title="공공데이터 활용 해커톤 참가자 모집",
        body_text="개발자와 기획자가 데이터 서비스를 만드는 행사",
        source_kind="specialist",
    ), load_taxonomy())
    assert primary == "hackathon"
    assert relevance.decision == "publish"


def test_procurement_contract_is_excluded():
    _, _, _, relevance, _ = classify(raw(
        title="생성형 AI 콘텐츠 제작 서비스 공급 및 운영 용역",
        body_text="AI 시스템 개발 입찰 공고",
    ), load_taxonomy())
    assert relevance.decision == "exclude"


def test_authoritative_game_category_publishes_generic_title():
    _, fields, _, relevance, _ = classify(raw(
        title="제17회 국토기술대전",
        original_category="기획/아이디어, 게임/소프트웨어, 과학/공학",
    ), load_taxonomy())
    assert "게임" in fields
    assert relevance.decision == "publish"


def test_generic_title_words_alone_go_to_review():
    # Each case published at exactly 70 before the weak-keyword rule (summaries as collected).
    cases = [
        ("2026 대한민국 SF판타지 웹소설 공모전", "aggregate", ""),
        ("[서울] 2026년 3차 B the B 뷰티 기반 융복합 콘텐츠 전시(다운타운) 팝업 참여기업 모집 공고", "government", "기업마당 공개 지원사업 · 경영 · 검색어 콘텐츠"),
        ("[경기] 부천시 2026년 공공배달앱 배달특급 개별 가맹점 홍보물 제작 지원 공고", "government", "기업마당 공개 지원사업 · 내수 · 검색어 앱"),
    ]
    for title, kind, summary in cases:
        _, _, _, relevance, _ = classify(raw(title=title, source_kind=kind, summary=summary), load_taxonomy())
        assert relevance.score == 69, title
        assert relevance.decision == "review", title


def test_generic_title_words_still_publish_from_specialist_sources_or_with_strong_keywords():
    _, _, _, specialist, _ = classify(raw(title="스위프 앱 6기 데모데이 & 네트워킹 행사", source_kind="specialist"), load_taxonomy())
    _, _, _, strong, _ = classify(raw(title="2026 관광데이터 활용 공모전(웹ㆍ앱 구현 부문)", source_kind="aggregate"), load_taxonomy())
    assert specialist.decision == "publish"
    assert strong.decision == "publish"


def test_concrete_tech_terms_keep_generic_sounding_titles_published():
    titles = [
        "2026년 전주MBC K-하이테크 플랫폼 제2회 가상현실 공간 창작 공모전",
        "[전국] 언리얼엔진5 시퀀서를 활용한 산업현장 교육 콘텐츠 제작 과정",
        "[경남ㆍ부산ㆍ울산] Claude를 활용한 웹서비스 아키텍처 개발 과정 교육생 모집 안내",
        "2026년 실감콘텐츠 스튜디오 프로젝트 현물지원기업 모집 공고",
        "[경북] 2026년 도쿄디지털콘텐츠박람회(DCEXPO) 경북 공동관 참여기업 모집 공고",
    ]
    for title in titles:
        _, _, _, relevance, _ = classify(raw(
            title=title, source_kind="government", summary="기업마당 공개 지원사업 · 기술 · 검색어 콘텐츠",
        ), load_taxonomy())
        assert relevance.decision == "publish", title


def domain_of(title: str, **values):
    from pipeline.classification import assign_domain

    item = raw(title=title, **values)
    _, _, _, relevance, _ = classify(item, load_taxonomy())
    return assign_domain(item, load_taxonomy(), relevance)


def test_non_it_contests_are_published_in_their_own_field_tab():
    cases = {
        "2026 남원시 영상 공모전": ("design_media", ["영상"]),
        "제2회 강남구 세계청소년 백일장": ("literature_arts", ["문학"]),
        "2026년 하반기 용인시 정책 아이디어 공모전": ("planning_ideas", ["아이디어", "정책·사회"]),
        "「민관협력 오픈이노베이션 지원」 참여기업 모집공고": ("business", ["창업"]),
    }
    for title, (domain, topics) in cases.items():
        assigned, assigned_topics, relevance = domain_of(title, source_kind="aggregate")
        assert (assigned, assigned_topics) == (domain, topics), title
        assert relevance.decision == "publish"


def test_it_qualifying_items_stay_in_the_it_tab():
    domain, topics, relevance = domain_of("AI 숏폼 영상 생성 해커톤", source_kind="aggregate")
    assert domain == "it" and topics == [] and relevance.decision == "publish"


def test_items_without_a_known_topic_or_with_excluded_phrases_stay_out():
    assert domain_of("전국 한미 버거 콘테스트", source_kind="aggregate")[2].decision == "exclude"
    assert domain_of("홍보 영상 제작 용역 입찰 공고", source_kind="aggregate")[2].decision != "publish"


def test_substring_traps_do_not_pick_the_wrong_field():
    # "교통안전시설" contains "전시"; the arts topic uses "전시회" to avoid this.
    domain, topics, _ = domain_of("도민과 함께 만드는 교통안전시설 개선 아이디어 공모전", source_kind="aggregate")
    assert domain == "planning_ideas" and topics == ["아이디어"]


def test_source_category_can_place_an_item():
    domain, topics, _ = domain_of("2026년 업사이클 공모전", source_kind="aggregate", original_category="과학, 디자인, 미술")
    assert domain == "design_media" and topics == ["디자인", "미술"]


@pytest.mark.parametrize("title,category,expected_domain,expected_topics", [
    ("LG 대국민 미소 사진 공모전 - 스마일 모먼트 SPECIAL IDEA", "광고/마케팅, 영상/UCC/사진, 웹/모바일/IT, 예체능/미술/음악, 대외활동/서포터즈", "design_media", ["사진"]),
    ("2026 0924영상제 영상 공모전 SPECIAL IDEA", "광고/마케팅, 영상/UCC/사진, 웹/모바일/IT, 예체능/미술/음악, 기타", "design_media", ["영상"]),
    ("우리 동네 병원과 가까워지는 한마디 슬로건 공모전", "기획/아이디어, 광고/마케팅, 웹/모바일/IT, 네이밍/슬로건, 기타", "planning_ideas", ["마케팅"]),
    ("7th Da-Ho Award 단편영화 공모전", "광고/마케팅, 영상/UCC/사진, 웹/모바일/IT, 예체능/미술/음악", "design_media", ["영상"]),
    ("2026 성평등 영상 콘텐츠 공모전", "광고/마케팅, 영상/UCC/사진, 디자인/캐릭터/웹툰, 웹/모바일/IT, 예체능/미술/음악", "design_media", ["영상"]),
    ("2026 대한민국 SF판타지 웹소설 공모전", "영상/UCC/사진, 웹/모바일/IT, 문학/소설, 예체능/미술/음악", "literature_arts", ["문학"]),
])
def test_mixed_it_categories_do_not_override_clear_non_it_titles(title, category, expected_domain, expected_topics):
    from datetime import datetime
    from pipeline.normalize import normalize

    item = normalize(raw(title=title, original_category=category, body_text=category), load_taxonomy(), datetime(2026, 10, 13))
    assert item.domain == expected_domain
    assert item.field_tags == expected_topics
    assert item.relevance.decision == "publish"
    assert item.relevance.score < 70


@pytest.mark.parametrize("title,category", [
    ("2026 추계학술대회 대학생 ERP 아이디어 공모전", "웹/모바일/IT"),
    ("2026 서든어택 무기 스킨 아이디어 공모전", "게임/소프트웨어"),
    ("2026 HACKSIUM BUSAN (동남권 특화산업 시나리오 기반 해킹방어대회)", "웹/모바일/IT"),
    ("대학생 AI 영상 공모전", "영상/UCC/사진, 웹/모바일/IT"),
    ("언리얼 XR 영상 제작 공모전", "영상/UCC/사진, 게임/소프트웨어"),
])
@pytest.mark.parametrize("mixed", [False, True])
def test_real_it_opportunities_stay_published_with_category_evidence(title, category, mixed):
    if mixed:
        category += ", 기획/아이디어, 영상/UCC/사진"
    domain, _, relevance = domain_of(title, original_category=category, body_text=category)
    assert domain == "it"
    assert relevance.decision == "publish"
    assert relevance.score >= 70


def test_explicit_game_submission_format_keeps_a_mixed_category_notice_in_it():
    domain, _, relevance = domain_of(
        "자유주제 영상 공모전", original_category="영상/UCC/사진, 게임/소프트웨어",
        summary="게임 형태로 출품하는 인터랙티브 콘텐츠도 참가할 수 있습니다.",
    )
    assert domain == "it" and relevance.decision == "publish"


def test_mixed_category_procurement_stays_excluded():
    assert domain_of("홍보 영상 제작 용역 입찰 공고", original_category="영상/UCC/사진, 웹/모바일/IT")[2].decision == "exclude"
