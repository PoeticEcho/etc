# 🍽️ 유튜브 맛집도감(food.lovizu.com) 전수 맛집 DB

`food.lovizu.com`(유튜브 맛집도감)에 등록된 **모든 맛집 포스트 1,943건을 전수 수집**해, 기존 벨루가 맛집 DB(`velooga_restaurants.db`)와 **같은 스키마·뷰·파일 구성**으로 변환한 데이터 세트입니다. 원본 사이트에만 있는 정보(지도 평점·플레이스 링크·영업시간·휴무·주차·대표 메뉴·가격·소개 영상 등)는 `restaurants_extra` 테이블과 JSON의 `extra`에 손실 없이 함께 담았습니다.

| 항목 | 값 |
|---|---|
| 출처 | https://food.lovizu.com/ (유튜브 맛집도감) |
| 수집 기준일 | 2026-11-26 (KST) |
| 수집 범위 | `sitemap.xml`의 `/posts/` URL 1,943건 (= 전체, 색인 페이지 제외) |
| 수집 결과 | 1,943 / 1,943건 (실패 0, 누락 0) |
| 맛집 수 | **1,943곳** |
| 소개 채널(테마) | 15개 유튜브·방송 채널 |
| 지역 | 17개 시도 |
| 음식 종류 | 12개 분류 |
| 좌표 확보 | 1,642건 (84.5%) |
| 제주 / 대구 | 49곳 / 44곳 |

## 파일

| 파일 | 크기 | 내용 |
|---|---|---|
| `lovizu_restaurants.db` | 9.8 MB | SQLite(UTF-8). `themes`·`places`·`restaurants`·`restaurants_extra`·`programs`·`metadata` 테이블 + 뷰 6종 |
| `lovizu_restaurants.csv` | 5.5 MB | 전체 1,943건, 엑셀 호환(UTF-8 BOM). 기본 34열 + 추가 정보 40열 |
| `lovizu_restaurants_jeju.csv` | 0.1 MB | 제주 49건 |
| `lovizu_restaurants_daegu.csv` | 0.1 MB | 대구 44건 |
| `lovizu_restaurants.json` | 7.6 MB | 전체 JSON(`metadata`·`themes`·`restaurants`), 레코드마다 `extra` 포함 |
| `geo_cache.json` | 0.3 MB | `downloads/geo_cache.json`과 같은 형식 `[{id, lat, lng, address, provider}]` 1,642건 |

## 스키마

### 1) 벨루가 DB와 동일한 부분
`themes` · `places` · `restaurants` 세 테이블의 **컬럼 이름·타입·순서가 `downloads/velooga_restaurants.db`와 완전히 같습니다.** 뷰 `v_jeju_restaurants`·`v_daegu_restaurants`·`v_restaurants_by_region`·`v_restaurants_by_theme`도 SQL이 동일해, 기존에 쓰던 쿼리·도구를 그대로 붙일 수 있습니다.

- `themes` : 소개 채널 1개 = 테마 1개. `id`·`slug` = 사이트의 프로그램 슬러그(`yummy`, `tzuyang`, `meogeultende` …), `region`=`korea`, `theme_type`=`방송/유튜브 맛집`, `is_food_theme`=1
- `places` · `restaurants` : 포스트 1건 = 1행(`id` = `lv-0001` ~ `lv-1943`, 사이트의 `No.` 기준). `is_food`=1, `country`=`KR`
- `sido`는 표준 풀네임(`서울특별시`, `부산광역시`, `대구광역시`, `제주특별자치도`, `강원특별자치도`, `전북특별자치도` …), `sido_short`는 약칭(`서울`, `부산`, `대구`, `제주`, `강원`, `전북` …)으로 정규화했습니다. 주소에 `전남광주통합특별시`로 적힌 4건은 지역 표기(`광주 동구` 등)에 맞춰 `광주광역시`/`전라남도`로 나눴습니다.

### 2) 추가 테이블 `restaurants_extra` (1:1)
| 컬럼 | 의미 |
|---|---|
| `lovizu_no` | 사이트 고유 번호 `No.XXXX` (1~1943 연속) |
| `slug` · `post_url` | 포스트 슬러그 / 원문 URL |
| `program_slug` · `program_name` · `program_episode` · `program_tagline` · `intro_date` | 소개 채널, 방송 회차, 한줄 소개, 방송 소개일 |
| `kakao_rating` · `kakao_reviews` · `kakao_url` | 카카오맵 평점·리뷰수·플레이스 링크 |
| `naver_rating` · `naver_reviews` · `naver_url` | 네이버 지도 평점·리뷰수·플레이스 링크 |
| `rating_checked_at` | 평점 확인일(사이트 표기 `2026-11-23 확인`) |
| `signature_menu` · `price_range` | 대표 메뉴 / 가격 |
| `business_hours` · `closed_days` · `parking` · `waiting` · `seating` · `reservation` | 영업시간·휴무·주차·웨이팅·좌석·예약 안내 |
| `headline` · `meta_description` · `keywords` | 포스트 제목·요약·키워드 |
| `image_url` · `published_at` · `modified_at` | 대표 이미지, 발행일·수정일 |
| `info_rows` · `info_pairs` | 본문 정보 표의 모든 행(JSON), 본문 목록형 정보(JSON) — 원문 구조 보존 |
| `cuisine_label` · `region_label` | 사이트 표기 음식 종류/지역 원문 |

`programs` 테이블은 채널별 포스트 수와 소개일 범위를, `metadata` 테이블은 출처·수집일·건수를 담습니다. 뷰 `v_restaurants_by_cuisine`(음식 종류별), `v_lovizu_extra`(기본+추가 정보 조인)를 더했습니다.

## 채널별 통계

| 채널 | 슬러그 | 맛집 수 | 소개일 범위 |
|---|---|---|---|
| 맛있겠다 Yummy | `yummy` | 373 | 2018-03-14 ~ 2026-11-22 |
| 츄릅켠 | `chureupkyeon` | 189 | 2018-11-07 ~ 2026-11-18 |
| 정육왕 | `meatcreator` | 184 | 2018-09-06 ~ 2026-10-28 |
| 쯔양 | `tzuyang` | 170 | 2020-11-06 ~ 2026-11-14 |
| 회사랑 | `rawfisheater` | 168 | 2018-11-19 ~ 2026-11-22 |
| 섬마을훈태 | `huntae` | 135 | 2019-01-25 ~ 2026-11-18 |
| 김사원세끼 | `kim3meals` | 119 | 2020-01-27 ~ 2026-11-23 |
| 또간집 | `ttogan` | 119 | 2022-04-22 ~ 2026-11-20 |
| 줄 서는 맛집 | `julseoneun` | 100 | 2022-11-25 ~ 2026-10-02 |
| 떡볶퀸 | `tteokbokqueen` | 88 | 2019-02-11 ~ 2026-10-20 |
| 더들리 | `dudely` | 81 | 2019-12-20 ~ 2026-10-03 |
| 성시경 먹을텐데 | `meogeultende` | 71 | 2022-03-11 ~ 2026-11-23 |
| 맛있는 녀석들 | `tasty-guys` | 56 | 2020-11-06 ~ 2026-10-30 |
| 비밀이야 | `bimirya` | 51 | 2019-09-15 ~ 2026-11-08 |
| 2TV 생생정보 | `live-info` | 39 | 2026-02-27 ~ 2026-11-20 |

## 지역별 통계

| 시도 | 약칭 | 맛집 수 |
|---|---|---|
| 서울특별시 | 서울 | 803 |
| 부산광역시 | 부산 | 284 |
| 경기도 | 경기 | 215 |
| 경상남도 | 경남 | 95 |
| 인천광역시 | 인천 | 77 |
| 강원특별자치도 | 강원 | 72 |
| 경상북도 | 경북 | 61 |
| 전라남도 | 전남 | 60 |
| 제주특별자치도 | 제주 | 49 |
| 대구광역시 | 대구 | 44 |
| 전북특별자치도 | 전북 | 41 |
| 충청북도 | 충북 | 39 |
| 대전광역시 | 대전 | 36 |
| 충청남도 | 충남 | 32 |
| 광주광역시 | 광주 | 17 |
| 울산광역시 | 울산 | 16 |
| 세종특별자치시 | 세종 | 2 |

많은 시군구: 서울 강남구 96, 서울 마포구 84, 서울 중구 82, 서울 종로구 63, 서울 송파구 47, 부산 수영구 46, 서울 용산구 46, 부산 해운대구 44, 서울 영등포구 44, 서울 동대문구 41

## 음식 종류

| 분류 | 맛집 수 |
|---|---|
| 고기·구이·갈비 | 425 |
| 해산물·회·게·장어 | 333 |
| 국밥·탕·찌개·전골 | 228 |
| 한식·백반·한정식 | 165 |
| 면·국수·냉면·막국수·칼국수 | 146 |
| 일식·돈가스·스시 | 146 |
| 중식 | 138 |
| 분식·김밥·어묵·시장 간식 | 132 |
| 치킨·닭요리·오리 | 90 |
| 양식·버거·피자·바베큐 | 77 |
| 빵·떡·카페·디저트 | 35 |
| 기타 | 28 |

## 필드 확보율 (1,943건 기준)

| 필드 | 확보 | 비고 |
|---|---|---|
| 좌표(latitude/longitude) | 1,642건 (84.5%) | 원본에 좌표가 없는 301건은 비움 |
| 카카오맵 평점 | 1,687건 (86.8%) | 평균 4.21 |
| 네이버 평점 | 958건 (49.3%) | 평균 4.56 (리뷰수만 있는 584건은 평점 없음) |
| 영업시간 | 1,934건 (99.5%) | 표 정보 기준(문장형 안내 포함) |
| 휴무 | 1,900건 (97.8%) |  |
| 주차 | 1,920건 (98.8%) |  |
| 웨이팅 | 1,892건 (97.4%) |  |
| 좌석 | 66건 (3.4%) | 원본이 좌석 항목을 거의 두지 않음 |
| 전화 | 1,448건 (74.5%) |  |
| 가격 | 1,574건 (81.0%) | 대표 메뉴 가격 표기 |
| 대표 메뉴 | 1,943건 (100.0%) |  |
| 소개일 | 1,943건 (100.0%) |  |

## 사용 예

```sql
-- 제주/대구 맛집 (벨루가 DB와 같은 뷰)
SELECT * FROM v_jeju_restaurants;
SELECT * FROM v_daegu_restaurants;

-- 평점·영업시간까지 함께 보기
SELECT r.name, r.address, r.sido_short, r.food_category, r.theme_name,
       e.kakao_rating, e.naver_rating, e.business_hours, e.post_url
FROM restaurants r JOIN restaurants_extra e ON e.id = r.id
WHERE r.sido_short = '대구' AND e.kakao_rating >= 4.5
ORDER BY e.kakao_rating DESC;

-- 좌표가 있는 맛집만 지도용으로
SELECT id, name, address, latitude, longitude FROM restaurants
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
```

```python
import json
data = json.load(open('lovizu_restaurants.json'))
print(data['metadata']['total_restaurants'])            # 1943
print(data['restaurants'][0]['extra']['business_hours'])
```

## 제작 메모

- **수집 방법**: `sitemap.xml`의 `/posts/` 1,943 URL을 브라우저 User-Agent로 병렬 요청(16스레드, 재시도 4회)해 HTML을 받고, ① `application/ld+json`(`Restaurant`·`Article`·`VideoObject`·`BreadcrumbList`) ② `aside.place-sheet`(상호·주소·지도 평점·대표 메뉴·가격·음식 종류·지역·소개 채널) ③ `div.article-body`의 정보 표/목록을 파싱했습니다. 실패 0건.
- **원문 표기 보존**: 가격·영업시간에 섞인 취소선(`<del>`) 표기는 원문 데이터의 일부라 버리지 않고, 시간 범위가 되도록 `~`를 넣어 읽히게 했습니다(예: `매일 09:00~21:00`). 모든 정보 표 행은 `info_rows`에 원형 그대로 남아 있습니다.
- **분류**: `kind`는 `방송 소개` 1,939건 + 사이트가 `시장 먹거리`로 표시한 4건. 음식 종류는 사이트의 12개 분류를 그대로 씁니다.
- **주의**: 사이트도 고지하듯 영업시간·가격·휴무는 방송 소개 이후 바뀔 수 있습니다. 원본의 `확인일`(`rating_checked_at`, `checked_at`)을 함께 두었으니 사용 전 날짜를 확인하세요.
- **권리**: 내용은 유튜브 맛집도감(food.lovizu.com)의 공개 정보를 개인 참고용으로 정리한 것입니다. 재배포 시 출처를 밝혀 주세요.

