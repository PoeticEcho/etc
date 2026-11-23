# 범어자이 (Beomeo Xi) 홍보 페이지

대구 수성구 범어동 **범어자이**(동대구로80길 40)를 소개하는 정적 홍보 페이지입니다.
빌드 도구 없이 HTML·CSS·JS와 JSON 데이터만으로 동작하며, GitHub Pages에서 그대로 열립니다.

- 라이브: <https://poeticecho.github.io/etc/beomeo-xi/>
- 문의 전화·상담 신청 폼은 의도적으로 넣지 않았습니다.

## 폴더 구조

```
beomeo-xi/
├─ index.html            페이지 본문(모든 섹션의 마크업)
├─ css/style.css         디자인 토큰과 전체 스타일
├─ js/app.js             내비게이션, 카운트업, 기사 모달, 갤러리/평면도 탭, 라이트박스
├─ data/
│  ├─ articles.json      주간 기사 (여기에만 추가하면 목록·발행일이 자동 갱신)
│  ├─ gallery.json       뷰 갤러리 사진과 분류(filters)
│  └─ floorplans.json    평면 타입·면적·특징
└─ assets/
   ├─ photos/            최적화된 사진 (파일명은 영문 슬러그)
   ├─ floorplans/        GS건설 공식 평면도 8장
   └─ favicon.svg
```

## 매주 기사 추가하기

`data/articles.json`의 `articles` 배열 **맨 앞**에 객체 하나를 추가하면 됩니다.
페이지의 기사 카드, 발행일, 기사 수가 자동으로 다시 계산됩니다.

```json
{
  "id": "2026-11-30-weekly",
  "date": "2026-11-30",
  "category": "상가 · 생활",
  "title": "기사 제목",
  "excerpt": "목록 카드에 보일 두 줄 요약.",
  "body": [
    { "type": "lead",  "text": "리드 문장(굵게 표시)" },
    { "type": "p",     "text": "본문 문단" },
    { "type": "h",     "text": "소제목" },
    { "type": "quote", "text": "가운데 정렬 인용문" }
  ],
  "sources": ["근거 자료 1", "근거 자료 2"],
  "source": "범어자이 홍보자료"
}
```

- `body` 블록 타입은 `lead` / `p` / `h` / `quote` 네 가지입니다.
- `sources`는 기사 끝 "근거 자료" 목록으로 출력됩니다. **확인된 사실과 추정을 섞지 말고, 추정은 문장에서 완화해 쓰세요.**
- JSON 문법(쉼표, 따옴표)만 지키면 됩니다. 오류가 있으면 페이지에 안내 문구가 뜨고 나머지 섹션은 정상 동작합니다.

## 사진 추가하기

### 뷰 갤러리 (`data/gallery.json`)

```json
{
  "id": "city-3",
  "src": "assets/photos/12-resident-cityview.jpg",
  "alt": "화면 낭독기용 설명",
  "label": "사진 제목",
  "desc": "한두 줄 설명 (선택)",
  "tag": "city",                         // filters의 key 중 하나
  "credit": "호갱노노 입주민 게시",       // 출처 표기 (필수)
  "creditUrl": "https://hogangnono.com/community/apts/apts-7409999",
  "date": "2026-01-12",
  "source_note": "원문 설명 (선택)"
}
```

- `credit`과 `creditUrl`은 캡션 링크로 표시되고, 크게 보기 화면에서도 "원문 보기"로 연결됩니다. **출처 없는 사진은 올리지 마세요.**
- 분류를 새로 만들려면 `filters` 배열에 `{ "key": "…", "label": "…" }`를 추가합니다.
- 사진은 긴 변 1300px 이내, JPEG 품질 82 정도로 줄여 `assets/photos/`에 넣는 것을 권장합니다(원본은 `../../assets/`에 보관).

### 직접 촬영한 세대 실사 사진

고층·저층·시티뷰 등 직접 찍은 사진은 `assets/photos/`에 넣고 `gallery.json` 항목을 추가하면
지금의 입주민 게시 사진과 같은 자리에 바로 표시됩니다.

### 야시골공원 사진

`index.html`의 `.park__grid` 안에 `<li>` 하나를 추가하고, `data-zoom`(원본 경로)·`data-cap`(출처 포함 캡션)을
다른 항목과 같은 형식으로 맞춰 주세요. 라이트박스 이전/다음 이동은 `data-group="park"`으로 묶입니다.

## 평면도 바꾸기

`data/floorplans.json`의 `types` 배열을 수정합니다. `img` 경로만 바꿔도 탭·표·확대 모달이 함께 갱신됩니다.
새 타입을 넣으면 탭과 "타입 한눈에 보기" 표에도 자동으로 추가됩니다(표에는 아파트 타입만 표시).

## 로컬에서 확인하기

JSON을 `fetch`로 읽으므로 파일을 더블클릭하지 말고 간단한 서버로 열어 주세요.

```bash
cd beomeo-xi
python3 -m http.server 8123
# http://127.0.0.1:8123/
```

## 자료 출처

- 단지 개요·배치도·동호수배치도·커뮤니티센터·단지설계·평면도: GS건설 자이 공식 자료
- 뷰 실사: 호갱노노 '입주민 이야기' 게시글(원문 링크 표기)
- 야시골공원 사진: <https://cklee88.tistory.com/537>
- 야간 조감도: 대경일보 / 주간 투시도: 뉴스핌(자료=GS건설)
- 거리·시간: 카카오맵 경로 실측(2026-11-23 조회)

이미지는 소비자의 이해를 돕기 위한 것으로 실제와 다를 수 있으며, 기재 수치는 2026년 11월 23일 기준입니다.
