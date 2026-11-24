/**
 * 광주대구선(무안광주대구선 12호선) CCTV + 도로기상(RWIS) 통합 Worker
 * ─ Cloudflare Workers · ES Module 형식 · v2.0
 *
 *   GET /api/status            CCTV(123대) + RWIS(16개 구간)를 한 번에 (권장)
 *   GET /api/cctv              ITS Open API CCTV 목록 + 123대 마스터 매칭 (15분 캐시)
 *   GET /api/rwis              기상청 RWIS 도로살얼음(FSM)·가시거리(VIR) 등급 (5분 캐시)
 *   GET /api/stream?cctvId=…   로드플러스 CCTV 실시간 HLS 주소 + 스냅샷 (2분 캐시)
 *   ?refresh=1                 해당 엔드포인트의 캐시를 무시하고 즉시 갱신
 *   OPTIONS …                  CORS preflight
 *   GET /                      사용 안내(JSON)
 *
 * 환경변수(모두 선택)
 *   ITS_API_KEY       ITS 국가교통정보센터 Open API 키 (wrangler secret put ITS_API_KEY)
 *   CCTV_SOURCE_URL   ITS 대신 같은 형식 JSON을 받아올 주소 (9443 포트가 막힐 때)
 *   RWIS_SOURCE_URL   RWIS 대신 tools/rwis_export.py가 만든 사전 계산 JSON 주소
 *                     (무료 플랜 CPU 한도 때문에 권장 — README 4장)
 *   RWIS_BASE         RWIS 호스트 교체용 (기본 https://rwis.kma.go.kr)
 *
 * 영상 트래픽은 Worker를 지나가지 않습니다. Worker는 목록·주소(JSON)만 중계하고
 * .m3u8/영상 조각은 브라우저의 hls.js가 *.hscdn.com에서 직접 받습니다.
 */

const VERSION = '2.3.0';

const CACHE_TTL = {
  cctv: 900,      // 15분 — ITS 원본 갱신 주기
  rwis: 300,      // 5분  — RWIS 위험등급 갱신 주기
  stream: 120,    // 2분  — 로드플러스 HLS 주소
  conzone: 21600, // 6시간 — 구간·링크 구성(거의 안 바뀜)
};

const UPSTREAM_TIMEOUT_MS = 15000;
const ITS_ENDPOINT = 'https://openapi.its.go.kr:9443/cctvInfo';
const ROADPLUS_ENDPOINT = 'https://www.roadplus.co.kr/api/main/selectCctvInfoAjax';
const ROADPLUS_TIMEOUT_MS = 10000;

// 남원 127.39°E ~ 대구 논공 128.45°E, 35.38°N ~ 35.80°N 전체 커버
const BOUNDS = { minX: 127.25, maxX: 128.65, minY: 35.3, maxY: 35.9 };

// 무안광주대구선 노선 코드 (getConZoneByRoadNo.do 파라미터)
const ROAD = { roadNo: '012', roadNoN1: '12', roadNoN2: '0120', name: '무안광주대구선' };

/**
 * RWIS 방향 코드
 *   E = cdpntTmnlDirDvCd '종점' 방향 = 무안 → 대구 (대구방향)
 *   S = '기점' 방향 = 대구 → 무안 (광주방향)
 */
const RWIS_DIRS = [
  { code: 'E', label: '대구방향', short: '대구' },
  { code: 'S', label: '광주방향', short: '광주' },
];

/** 위험등급 이름(기상청 RWIS 공식): 0 안전 · 1 관심 · 2 주의 · 3 위험 */
const LEVEL_NAME = ['안전', '관심', '주의', '위험'];
const LEVEL_DETAIL = ['0단계 · 안전', '1단계 · 관심', '2단계 · 주의', '3단계 · 위험'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

/* @MASTER_START */
const MASTER = {"route":"광주대구선","routeNo":"012","range":{"startKm":95.0,"endKm":176.0,"startName":"함양IC","endName":"옥포JC"},"zones":[{"suffix":"160","startKm":95.0,"endKm":97.3,"name":"함양IC–함양JC","nearIds":[],"nearNames":[]},{"suffix":"170","startKm":97.3,"endKm":121.1,"name":"함양JC–거창IC","nearIds":[],"nearNames":[]},{"suffix":"180","startKm":121.1,"endKm":131.1,"name":"거창IC–가조IC","nearIds":[],"nearNames":[]},{"suffix":"190","startKm":131.1,"endKm":146.4,"name":"가조IC–해인사IC","nearIds":[],"nearNames":[]},{"suffix":"200","startKm":146.4,"endKm":152.9,"name":"해인사IC–고령IC","nearIds":[],"nearNames":[]},{"suffix":"210","startKm":152.9,"endKm":165.52,"name":"고령IC–동고령IC","nearIds":[],"nearNames":[]},{"suffix":"220","startKm":165.52,"endKm":166.99,"name":"동고령IC–고령JC","nearIds":["p50","p51","p52"],"nearNames":["기산2교","기족교","고령분기점_광주대구"]},{"suffix":"230","startKm":166.99,"endKm":176.0,"name":"고령JC–옥포JC","nearIds":[],"nearNames":[]}],"points":[{"name":"두산","km":95.0,"kmSource":"산출","facility":"일반(마을)","address":"경남 함양군 함양읍 신관리 산 87-6","lat":35.533423,"lon":127.748989,"cctvId":"cctv00001457","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km) / 함양IC 인접(경계)","cams":[{"dir":"G","seq":3,"cctvId":"cctv00001457"}],"id":"p01","zone":"160"},{"name":"함양","km":95.0,"kmSource":"공식","facility":"IC","address":"경남 함양군 함양읍 신관리 산 87-6","lat":35.533199,"lon":127.748835,"cctvId":"cctv00005751","note":"","cams":[{"dir":"D","seq":1,"cctvId":"cctv00005751"},{"dir":"G","seq":2,"cctvId":"cctv00005751"}],"id":"p02","zone":"160"},{"name":"지곡","km":96.23,"kmSource":"산출","facility":"IC","address":"경남 함양군 함양읍 백천리 산 56-1","lat":35.532314,"lon":127.760938,"cctvId":"cctv00005752","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":4,"cctvId":"cctv00005752"},{"dir":"G","seq":5,"cctvId":"cctv00005752"}],"id":"p03","zone":"160"},{"name":"원평교","km":98.19,"kmSource":"공식","facility":"교량","address":"경남 함양군 지곡면 도촌리 241-1","lat":35.538839,"lon":127.777535,"cctvId":"cctv00005754","note":"","cams":[{"dir":"D","seq":6,"cctvId":"cctv00005754"},{"dir":"G","seq":7,"cctvId":"cctv00005754"}],"id":"p04","zone":"170"},{"name":"우명교","km":99.93,"kmSource":"산출","facility":"교량","address":"경남 함양군 수동면 우명리 산 97-1","lat":35.548953,"lon":127.794978,"cctvId":"cctv00005755","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":8,"cctvId":"cctv00005755"},{"dir":"G","seq":9,"cctvId":"cctv00005755"}],"id":"p05","zone":"170"},{"name":"함양산삼골휴게소","km":100.8,"kmSource":"공식","facility":"휴게소","address":"경남 함양군 수동면 하교리 산 12-2","lat":35.550969,"lon":127.808505,"cctvId":"cctv00005756","note":"","cams":[{"dir":"D","seq":10,"cctvId":"cctv00005756"},{"dir":"G","seq":11,"cctvId":"cctv00005756"}],"id":"p06","zone":"170"},{"name":"죽산천교1","km":102.68,"kmSource":"공식","facility":"교량","address":"경남 함양군 수동면 죽산리 1282-15","lat":35.548226,"lon":127.827499,"cctvId":"cctv00005757","note":"","cams":[{"dir":"D","seq":12,"cctvId":"cctv00005757"},{"dir":"G","seq":13,"cctvId":"cctv00005757"}],"id":"p07","zone":"170"},{"name":"죽산교","km":104.75,"kmSource":"공식","facility":"교량","address":"경남 함양군 수동면 죽산리 403","lat":35.554471,"lon":127.834004,"cctvId":"cctv00005758","note":"","cams":[{"dir":"D","seq":14,"cctvId":"cctv00005758"},{"dir":"G","seq":15,"cctvId":"cctv00005758"}],"id":"p08","zone":"170"},{"name":"춘전리","km":107.45,"kmSource":"산출","facility":"일반(마을)","address":"경남 거창군 남상면 춘전리 381-1","lat":35.57966,"lon":127.852194,"cctvId":"cctv00005759","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":16,"cctvId":"cctv00005759"},{"dir":"G","seq":17,"cctvId":"cctv00005759"}],"id":"p09","zone":"170"},{"name":"춘전1육교","km":107.85,"kmSource":"산출","facility":"교량","address":"경남 거창군 남상면 춘전리 293-3","lat":35.582185,"lon":127.854997,"cctvId":"cctv00005760","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":18,"cctvId":"cctv00005760"},{"dir":"G","seq":19,"cctvId":"cctv00005760"}],"id":"p10","zone":"170"},{"name":"춘전재 토석류","km":108.2,"kmSource":"산출","facility":"일반(마을)","address":"경남 거창군 남상면 춘전리 산 89-3","lat":35.586785,"lon":127.859683,"cctvId":"cctv00000110","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":20,"cctvId":"cctv00000110"},{"dir":"G","seq":21,"cctvId":"cctv00000110"}],"id":"p11","zone":"170"},{"name":"남상","km":109.58,"kmSource":"산출","facility":"일반(마을)","address":"경남 거창군 남상면 둔동리 산 50-1","lat":35.593586,"lon":127.873424,"cctvId":"cctv00001458","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":22,"cctvId":"cctv00001458"},{"dir":"G","seq":23,"cctvId":"cctv00001458"}],"id":"p12","zone":"170"},{"name":"둔동리","km":111.37,"kmSource":"산출","facility":"일반(마을)","address":"경남 거창군 남상면 둔동리 산 120-1","lat":35.605886,"lon":127.881771,"cctvId":"cctv00005762","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":24,"cctvId":"cctv00005762"},{"dir":"G","seq":25,"cctvId":"cctv00005762"}],"id":"p13","zone":"170"},{"name":"오계교","km":113.38,"kmSource":"공식","facility":"교량","address":"경남 거창군 남상면 무촌리 1162","lat":35.631986,"lon":127.900542,"cctvId":"cctv00005763","note":"","cams":[{"dir":"D","seq":26,"cctvId":"cctv00005763"},{"dir":"G","seq":27,"cctvId":"cctv00005763"}],"id":"p14","zone":"170"},{"name":"무촌1교","km":114.76,"kmSource":"공식","facility":"교량","address":"경남 거창군 남상면 오계리 279","lat":35.62791,"lon":127.897323,"cctvId":"cctv00005764","note":"","cams":[{"dir":"D","seq":28,"cctvId":"cctv00005764"},{"dir":"G","seq":29,"cctvId":"cctv00005764"}],"id":"p15","zone":"170"},{"name":"무촌2교","km":116.02,"kmSource":"공식","facility":"교량","address":"경남 거창군 남상면 무촌리 1855-114","lat":35.641846,"lon":127.915623,"cctvId":"cctv00005765","note":"","cams":[{"dir":"D","seq":30,"cctvId":"cctv00005765"},{"dir":"G","seq":31,"cctvId":"cctv00005765"}],"id":"p16","zone":"170"},{"name":"송변교","km":117.1,"kmSource":"공식","facility":"교량","address":"경남 거창군 남상면 대산리 984-5","lat":35.648955,"lon":127.924449,"cctvId":"cctv00005766","note":"","cams":[{"dir":"D","seq":32,"cctvId":"cctv00005766"},{"dir":"G","seq":33,"cctvId":"cctv00005766"}],"id":"p17","zone":"170"},{"name":"대산육교","km":117.91,"kmSource":"산출","facility":"교량","address":"경남 거창군 남상면 월평리 산 45-8","lat":35.655854,"lon":127.925911,"cctvId":"cctv00005767","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":34,"cctvId":"cctv00005767"},{"dir":"G","seq":35,"cctvId":"cctv00005767"}],"id":"p18","zone":"170"},{"name":"정장교","km":119.54,"kmSource":"공식","facility":"교량","address":"경남 거창군 거창읍 정장리 266-9","lat":35.674607,"lon":127.930313,"cctvId":"cctv00005768","note":"","cams":[{"dir":"D","seq":36,"cctvId":"cctv00005768"},{"dir":"G","seq":37,"cctvId":"cctv00005768"}],"id":"p19","zone":"170"},{"name":"거창","km":121.1,"kmSource":"공식","facility":"IC","address":"경남 거창군 거창읍 대평리 120","lat":35.679166,"lon":127.93523,"cctvId":"cctv00005769","note":"","cams":[{"dir":"D","seq":38,"cctvId":"cctv00005769"},{"dir":"G","seq":39,"cctvId":"cctv00005769"}],"id":"p20","zone":"180"},{"name":"황강천교","km":121.49,"kmSource":"공식","facility":"교량","address":"경남 거창군 거창읍 대평리 1454-2","lat":35.681873,"lon":127.938929,"cctvId":"cctv00005770","note":"","cams":[{"dir":"D","seq":40,"cctvId":"cctv00005770"},{"dir":"G","seq":41,"cctvId":"cctv00005770"}],"id":"p21","zone":"180"},{"name":"둔마1교","km":124.16,"kmSource":"공식","facility":"교량","address":"경남 거창군 남하면 둔마리 산 83-13","lat":35.699756,"lon":127.94605,"cctvId":"cctv00005771","note":"","cams":[{"dir":"D","seq":42,"cctvId":"cctv00005771"},{"dir":"G","seq":43,"cctvId":"cctv00005771"}],"id":"p22","zone":"180"},{"name":"둔마2교","km":125.34,"kmSource":"공식","facility":"교량","address":"경남 거창군 남하면 둔마리 산 216-4","lat":35.706707,"lon":127.959538,"cctvId":"cctv00005772","note":"","cams":[{"dir":"D","seq":44,"cctvId":"cctv00005772"},{"dir":"G","seq":45,"cctvId":"cctv00005772"}],"id":"p23","zone":"180"},{"name":"살피재터널(외부광주)","km":126.58,"kmSource":"공식","facility":"터널","address":"경남 거창군 가조면 동례리 산 251-4","lat":35.707317,"lon":127.988983,"cctvId":"cctv00000509","note":"터널 등록 이정 기준(갱구 CCTV)","cams":[{"dir":"D","seq":48,"cctvId":"cctv00000509"},{"dir":"G","seq":49,"cctvId":"cctv00000509"}],"id":"p24","zone":"180"},{"name":"살피재터널(외부대구)","km":126.58,"kmSource":"공식","facility":"터널","address":"경남 거창군 남하면 둔마리 산 131-5","lat":35.70834,"lon":127.966184,"cctvId":"cctv00000508","note":"터널 등록 이정 기준(갱구 CCTV)","cams":[{"dir":"D","seq":46,"cctvId":"cctv00000508"},{"dir":"G","seq":47,"cctvId":"cctv00000508"}],"id":"p25","zone":"180"},{"name":"동례교","km":129.51,"kmSource":"공식","facility":"교량","address":"경남 거창군 가조면 동례리 1017-13","lat":35.702633,"lon":128.000653,"cctvId":"cctv00005773","note":"","cams":[{"dir":"D","seq":50,"cctvId":"cctv00005773"},{"dir":"G","seq":51,"cctvId":"cctv00005773"}],"id":"p26","zone":"180"},{"name":"가조","km":131.1,"kmSource":"공식","facility":"IC","address":"경남 거창군 가조면 일부리 1060-3","lat":35.701972,"lon":128.021152,"cctvId":"cctv00005774","note":"","cams":[{"dir":"D","seq":52,"cctvId":"cctv00005774"},{"dir":"G","seq":53,"cctvId":"cctv00005774"}],"id":"p27","zone":"190"},{"name":"일부육교","km":132.58,"kmSource":"산출","facility":"교량","address":"경남 거창군 가조면 일부리 259-2","lat":35.706627,"lon":128.035333,"cctvId":"cctv00005775","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":54,"cctvId":"cctv00005775"},{"dir":"G","seq":55,"cctvId":"cctv00005775"}],"id":"p28","zone":"190"},{"name":"거창휴게소","km":134.4,"kmSource":"공식","facility":"휴게소","address":"경남 거창군 가조면 도리 444-7","lat":35.70725,"lon":128.056167,"cctvId":"cctv00005776","note":"","cams":[{"dir":"D","seq":56,"cctvId":"cctv00005776"},{"dir":"G","seq":57,"cctvId":"cctv00005776"}],"id":"p29","zone":"190"},{"name":"가조터널(외부대구)","km":135.18,"kmSource":"공식","facility":"터널","address":"경남 거창군 가조면 도리 1529-102","lat":35.70675,"lon":128.06404,"cctvId":"cctv00005810","note":"터널 등록 이정 기준(갱구 CCTV)","cams":[{"dir":"D","seq":58,"cctvId":"cctv00005810"},{"dir":"G","seq":59,"cctvId":"cctv00005810"}],"id":"p30","zone":"190"},{"name":"가야1터널(외부광주)","km":137.24,"kmSource":"공식","facility":"터널","address":"경남 합천군 가야면 성기리 산 70-1","lat":35.708827,"lon":128.095382,"cctvId":"cctv00005812","note":"터널 등록 이정 기준(갱구 CCTV)","cams":[{"dir":"D","seq":62,"cctvId":"cctv00005812"},{"dir":"G","seq":63,"cctvId":"cctv00005812"}],"id":"p31","zone":"190"},{"name":"가야1터널(외부대구)","km":137.24,"kmSource":"공식","facility":"터널","address":"경남 합천군 가야면 성기리 산 105-19","lat":35.708448,"lon":128.088435,"cctvId":"cctv00005811","note":"터널 등록 이정 기준(갱구 CCTV)","cams":[{"dir":"D","seq":60,"cctvId":"cctv00005811"},{"dir":"G","seq":61,"cctvId":"cctv00005811"}],"id":"p32","zone":"190"},{"name":"가야2터널(외부대구)","km":139.05,"kmSource":"공식","facility":"터널","address":"경남 합천군 가야면 청현리 535","lat":35.707825,"lon":128.11897,"cctvId":"cctv00005813","note":"터널 등록 이정 기준(갱구 CCTV)","cams":[{"dir":"D","seq":64,"cctvId":"cctv00005813"},{"dir":"G","seq":65,"cctvId":"cctv00005813"}],"id":"p33","zone":"190"},{"name":"가야3터널(외부대구)","km":140.25,"kmSource":"공식","facility":"터널","address":"경남 합천군 야로면 묵촌리 산 34-10","lat":35.70028,"lon":128.13881,"cctvId":"cctv00005814","note":"터널 등록 이정 기준(갱구 CCTV)","cams":[{"dir":"D","seq":66,"cctvId":"cctv00005814"},{"dir":"G","seq":67,"cctvId":"cctv00005814"}],"id":"p34","zone":"190"},{"name":"야로2터널(외부광주)","km":143.43,"kmSource":"공식","facility":"터널","address":"경남 합천군 야로면 정대리 산 19-1","lat":35.692768,"lon":128.15625,"cctvId":"cctv00005815","note":"터널 등록 이정 기준(갱구 CCTV)","cams":[{"dir":"D","seq":68,"cctvId":"cctv00005815"},{"dir":"G","seq":69,"cctvId":"cctv00005815"}],"id":"p35","zone":"190"},{"name":"야로대교1","km":144.58,"kmSource":"공식","facility":"교량","address":"경남 합천군 야로면 정대리 1048-1","lat":35.692831,"lon":128.168477,"cctvId":"cctv00005777","note":"","cams":[{"dir":"D","seq":70,"cctvId":"cctv00005777"},{"dir":"G","seq":72,"cctvId":"cctv00005777"}],"id":"p36","zone":"190"},{"name":"야로대교2","km":144.58,"kmSource":"공식","facility":"교량","address":"경남 합천군 야로면 정대리 1048-1","lat":35.692831,"lon":128.168477,"cctvId":"cctv00005778","note":"","cams":[{"dir":"D","seq":71,"cctvId":"cctv00005778"},{"dir":"G","seq":73,"cctvId":"cctv00005778"}],"id":"p37","zone":"190"},{"name":"해인사","km":146.4,"kmSource":"공식","facility":"IC","address":"경남 합천군 야로면 금평리 산 47-2","lat":35.69651,"lon":128.184314,"cctvId":"cctv00005779","note":"","cams":[{"dir":"D","seq":74,"cctvId":"cctv00005779"},{"dir":"G","seq":75,"cctvId":"cctv00005779"}],"id":"p38","zone":"200"},{"name":"야로3터널(외부대구)","km":147.36,"kmSource":"공식","facility":"터널","address":"경남 합천군 야로면 청계리 산 31","lat":35.699323,"lon":128.200595,"cctvId":"cctv00000515","note":"터널 등록 이정 기준(갱구 CCTV)","cams":[{"dir":"D","seq":76,"cctvId":"cctv00000515"},{"dir":"G","seq":77,"cctvId":"cctv00000515"}],"id":"p39","zone":"200"},{"name":"쌍림터널(외부광주)","km":148.34,"kmSource":"공식","facility":"터널","address":"경북 고령군 쌍림면 월막리 산 42-9","lat":35.705333,"lon":128.215363,"cctvId":"cctv00000516","note":"터널 등록 이정 기준(갱구 CCTV)","cams":[{"dir":"D","seq":78,"cctvId":"cctv00000516"},{"dir":"G","seq":79,"cctvId":"cctv00000516"}],"id":"p40","zone":"200"},{"name":"월막리","km":150.21,"kmSource":"산출","facility":"일반(마을)","address":"경북 고령군 쌍림면 월막리 633-2","lat":35.704485,"lon":128.226124,"cctvId":"cctv00005780","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":80,"cctvId":"cctv00005780"},{"dir":"G","seq":81,"cctvId":"cctv00005780"}],"id":"p41","zone":"200"},{"name":"용동천1교","km":151.6,"kmSource":"공식","facility":"교량","address":"경북 고령군 쌍림면 고곡리 987-89","lat":35.700241,"lon":128.238169,"cctvId":"cctv00005781","note":"","cams":[{"dir":"D","seq":82,"cctvId":"cctv00005781"},{"dir":"G","seq":83,"cctvId":"cctv00005781"}],"id":"p42","zone":"200"},{"name":"고령","km":152.9,"kmSource":"공식","facility":"IC","address":"경북 고령군 쌍림면 고곡리 717-2","lat":35.700934,"lon":128.244782,"cctvId":"cctv00005782","note":"","cams":[{"dir":"D","seq":84,"cctvId":"cctv00005782"},{"dir":"G","seq":85,"cctvId":"cctv00005782"}],"id":"p43","zone":"210"},{"name":"안림천교","km":153.35,"kmSource":"공식","facility":"교량","address":"경북 고령군 대가야읍 외리 847-29","lat":35.707473,"lon":128.264529,"cctvId":"cctv00005783","note":"","cams":[{"dir":"D","seq":86,"cctvId":"cctv00005783"},{"dir":"G","seq":87,"cctvId":"cctv00005783"}],"id":"p44","zone":"210"},{"name":"회천대교","km":156.29,"kmSource":"산출","facility":"교량","address":"경북 고령군 대가야읍 외리 1178-68","lat":35.71189,"lon":128.285993,"cctvId":"cctv00005784","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":88,"cctvId":"cctv00005784"},{"dir":"G","seq":89,"cctvId":"cctv00005784"}],"id":"p45","zone":"210"},{"name":"양전리1","km":156.77,"kmSource":"산출","facility":"일반(마을)","address":"경북 고령군 대가야읍 장기리 산 74","lat":35.713581,"lon":128.291796,"cctvId":"cctv00005785","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":90,"cctvId":"cctv00005785"},{"dir":"G","seq":91,"cctvId":"cctv00005785"}],"id":"p46","zone":"210"},{"name":"양전리2","km":157.28,"kmSource":"산출","facility":"일반(마을)","address":"경북 고령군 개진면 양전리 419-3","lat":35.719463,"lon":128.295286,"cctvId":"cctv00005786","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":92,"cctvId":"cctv00005786"},{"dir":"G","seq":93,"cctvId":"cctv00005786"}],"id":"p47","zone":"210"},{"name":"양전교","km":158.58,"kmSource":"공식","facility":"교량","address":"경북 고령군 개진면 양전리 860-3","lat":35.724719,"lon":128.301446,"cctvId":"cctv00005787","note":"","cams":[{"dir":"D","seq":94,"cctvId":"cctv00005787"},{"dir":"G","seq":95,"cctvId":"cctv00005787"}],"id":"p48","zone":"210"},{"name":"사부1교","km":159.5,"kmSource":"공식","facility":"교량","address":"경북 고령군 성산면 사부리 413-1","lat":35.736026,"lon":128.306395,"cctvId":"cctv00005788","note":"","cams":[{"dir":"D","seq":96,"cctvId":"cctv00005788"},{"dir":"G","seq":97,"cctvId":"cctv00005788"}],"id":"p49","zone":"210"},{"name":"기산2교","km":163.0,"kmSource":"공식","facility":"교량","address":"경북 고령군 성산면 기산리 378","lat":35.745125,"lon":128.334454,"cctvId":"cctv00005790","note":"","cams":[{"dir":"D","seq":98,"cctvId":"cctv00005790"},{"dir":"G","seq":99,"cctvId":"cctv00005790"}],"id":"p50","zone":"210","nearZones":["220"]},{"name":"기족교","km":163.54,"kmSource":"공식","facility":"교량","address":"경북 고령군 성산면 기족리 976","lat":35.747618,"lon":128.346851,"cctvId":"cctv00005791","note":"","cams":[{"dir":"D","seq":100,"cctvId":"cctv00005791"},{"dir":"G","seq":101,"cctvId":"cctv00005791"}],"id":"p51","zone":"210","nearZones":["220"]},{"name":"고령분기점_광주대구","km":166.99,"kmSource":"산출","facility":"JC","address":"경북 고령군 성산면 박곡리 647","lat":35.758949,"lon":128.379322,"cctvId":"cctv00003535","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":102,"cctvId":"cctv00003535"},{"dir":"G","seq":103,"cctvId":"cctv00003535"}],"id":"p52","zone":"230","nearZones":["220"]},{"name":"논공휴게소","km":169.2,"kmSource":"공식","facility":"휴게소","address":"대구 달성군 논공읍 삼리리 458-4","lat":35.766174,"lon":128.402933,"cctvId":"cctv00003534","note":"","cams":[{"dir":"D","seq":104,"cctvId":"cctv00003534"},{"dir":"G","seq":105,"cctvId":"cctv00003534"}],"id":"p53","zone":"230"},{"name":"논공휴게소2","km":169.4,"kmSource":"산출","facility":"휴게소","address":"대구 달성군 논공읍 삼리리 458-4","lat":35.766936,"lon":128.40415,"cctvId":"cctv00000147","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":106,"cctvId":"cctv00000147"},{"dir":"G","seq":107,"cctvId":"cctv00000147"}],"id":"p54","zone":"230"},{"name":"금포2교","km":170.99,"kmSource":"공식","facility":"교량","address":"대구 달성군 논공읍 금포리 산 8-1","lat":35.769926,"lon":128.417653,"cctvId":"cctv00006019","note":"","cams":[{"dir":"D","seq":108,"cctvId":"cctv00006019"},{"dir":"G","seq":109,"cctvId":"cctv00006019"}],"id":"p55","zone":"230"},{"name":"논공교","km":171.84,"kmSource":"공식","facility":"교량","address":"대구 달성군 논공읍 금포리 산 35-11","lat":35.770323,"lon":128.43169,"cctvId":"cctv00003533","note":"","cams":[{"dir":"D","seq":114,"cctvId":"cctv00003533"},{"dir":"G","seq":115,"cctvId":"cctv00003533"}],"id":"p56","zone":"230"},{"name":"논공교2","km":171.84,"kmSource":"공식","facility":"교량","address":"대구 달성군 논공읍 금포리 1665-4","lat":35.767748,"lon":128.426271,"cctvId":"cctv00000191","note":"논공교 일대 개별 카메라(개별 이정은 미고시)","cams":[{"dir":"D","seq":110,"cctvId":"cctv00000191"},{"dir":"G","seq":111,"cctvId":"cctv00000191"}],"id":"p57","zone":"230"},{"name":"논공교3","km":171.84,"kmSource":"공식","facility":"교량","address":"대구 달성군 논공읍 금포리 1635-1","lat":35.768671,"lon":128.428551,"cctvId":"cctv00005595","note":"논공교 일대 개별 카메라(개별 이정은 미고시)","cams":[{"dir":"D","seq":112,"cctvId":"cctv00005595"},{"dir":"G","seq":113,"cctvId":"cctv00005595"}],"id":"p58","zone":"230"},{"name":"논공교4","km":171.84,"kmSource":"공식","facility":"교량","address":"대구 달성군 옥포읍 강림리 1076-4","lat":35.774703,"lon":128.437564,"cctvId":"cctv00000192","note":"논공교 일대 개별 카메라(개별 이정은 미고시)","cams":[{"dir":"D","seq":116,"cctvId":"cctv00000192"},{"dir":"G","seq":117,"cctvId":"cctv00000192"}],"id":"p59","zone":"230"},{"name":"금포리","km":172.14,"kmSource":"산출","facility":"일반(마을)","address":"대구 달성군 논공읍 금포리 산 39-5","lat":35.774215,"lon":128.437093,"cctvId":"cctv00000111","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":118,"cctvId":"cctv00000111"},{"dir":"G","seq":119,"cctvId":"cctv00000111"}],"id":"p60","zone":"230"},{"name":"금포리2","km":172.71,"kmSource":"산출","facility":"일반(마을)","address":"대구 달성군 옥포읍 교항리 산 161-3","lat":35.778109,"lon":128.444047,"cctvId":"cctv00001459","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":120,"cctvId":"cctv00001459"},{"dir":"G","seq":121,"cctvId":"cctv00001459"}],"id":"p61","zone":"230"},{"name":"옥포분기점_광주대구","km":176.0,"kmSource":"공식","facility":"JC","address":"대구 달성군 옥포읍 교항리 산 139-1","lat":35.781373,"lon":128.451706,"cctvId":"cctv00003532","note":"","cams":[{"dir":"D","seq":122,"cctvId":"cctv00003532"},{"dir":"G","seq":123,"cctvId":"cctv00003532"}],"id":"p62","zone":"230"}],"bridgeKm":4.0};
/* @MASTER_END */

/* ─────────────────────────── 유틸 ─────────────────────────── */

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function httpError(code, message, detail = {}) {
  const err = new Error(message);
  err.code = code;
  err.detail = detail;
  return err;
}

function firstString(obj, keys) {
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** CCTV 이름 비교용 정규화: 괄호 주석·공백 제거, 소문자 */
function normalizeName(value) {
  return String(value || '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function isRefresh(url) {
  const value = url.searchParams.get('refresh');
  return value === '1' || value === 'true';
}

/** 캐시 계층: Cloudflare Cache API → 같은 isolate 메모 → 없음 */
const MEMO = (globalThis.__GDC_MEMO = globalThis.__GDC_MEMO || new Map());

function cacheStore() {
  return typeof caches !== 'undefined' && caches.default ? caches.default : null;
}

async function cacheRead(key) {
  const store = cacheStore();
  if (store) {
    try {
      const hit = await store.match(new Request(`https://cache.gdc.invalid/${key}`));
      if (hit) return await hit.json();
    } catch (e) {
      /* 캐시가 깨졌으면 무시하고 새로 만듭니다. */
    }
  }
  const memo = MEMO.get(key);
  if (memo && memo.expires > Date.now()) return memo.data;
  return null;
}

async function cacheWrite(key, data, ttl) {
  const store = cacheStore();
  if (store) {
    try {
      await store.put(
        new Request(`https://cache.gdc.invalid/${key}`),
        new Response(JSON.stringify(data), {
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${ttl}` },
        })
      );
    } catch (e) {
      /* 저장 실패는 응답에 영향을 주지 않습니다. */
    }
  }
  MEMO.set(key, { data, expires: Date.now() + ttl * 1000 });
}

/**
 * 캐시 조회 → 없으면 build() 실행 → 저장.
 * refresh=true 이면 캐시를 건너뜁니다.
 */
async function withCache(key, ttl, refresh, build) {
  if (!refresh) {
    const hit = await cacheRead(key);
    if (hit) return { data: hit, cache: 'HIT' };
  }
  const data = await build();
  await cacheWrite(key, data, ttl);
  return { data, cache: refresh ? 'REFRESH' : 'MISS' };
}

/* ─────────────────────── 업스트림 공통 호출 ─────────────────────── */

async function fetchJson(url, init = {}, timeoutMs = UPSTREAM_TIMEOUT_MS, label = 'upstream', retries = 0) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchJsonOnce(url, init, timeoutMs, label);
    } catch (err) {
      lastError = err;
      const code = err && err.code;
      const retryable = code === 'UPSTREAM_UNREACHABLE' || code === 'UPSTREAM_TIMEOUT' || code === 'UPSTREAM_HTTP_ERROR';
      if (!retryable || attempt === retries) throw err;
      // 로드플러스·기상청 서버가 간헐적으로 연결을 거부합니다. 짧게 쉬고 한 번 더.
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw lastError;
}

async function fetchJsonOnce(url, init, timeoutMs, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: init.method || 'GET',
      headers: { Accept: 'application/json', ...(init.headers || {}) },
      body: init.body,
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw httpError('UPSTREAM_HTTP_ERROR', `${label}가 HTTP ${res.status}로 응답했습니다.`, {
        status: res.status,
        sample: body.slice(0, 300),
      });
    }

    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (parseError) {
      throw httpError('UPSTREAM_BAD_JSON', `${label} 응답을 JSON으로 해석하지 못했습니다.`, {
        sample: text.slice(0, 200),
      });
    }
  } catch (err) {
    if (err && err.code) throw err;
    const aborted = controller.signal.aborted || (err && err.name === 'AbortError');
    throw httpError(
      aborted ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNREACHABLE',
      aborted
        ? `${label} 응답이 ${timeoutMs / 1000}초 안에 오지 않았습니다.`
        : `${label}에 연결하지 못했습니다.`,
      { cause: String((err && err.message) || err) }
    );
  } finally {
    clearTimeout(timer);
  }
}

function postForm(url, params, timeoutMs, label) {
  const body = new URLSearchParams(params).toString();
  return fetchJson(
    url,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body },
    timeoutMs,
    label
  );
}

/* ─────────────────────── ITS 응답 해석 (/api/cctv) ─────────────────────── */

/**
 * ITS 응답은 문서·버전에 따라 item 배열 위치가 다릅니다.
 *   { response: { body: { items: { item: [...] } } } }
 *   { response: { data: [...] } }
 *   { items: [...] } / [...] 등
 * cctvurl을 가진 객체 배열을 찾아낼 때까지 훑습니다.
 */
function findCctvArray(node, depth = 0) {
  const looksLikeCctv = (item) =>
    item &&
    typeof item === 'object' &&
    (firstString(item, ['cctvurl', 'cctvUrl']) || (item.url && (item.name || item.cctvname)));

  if (Array.isArray(node)) {
    return node.some(looksLikeCctv) ? node : null;
  }
  if (!node || typeof node !== 'object' || depth > 6) return null;

  for (const key of ['item', 'items', 'data', 'list', 'body', 'response']) {
    if (key in node) {
      const found = findCctvArray(node[key], depth + 1);
      if (found) return found;
    }
  }
  for (const value of Object.values(node)) {
    const found = findCctvArray(value, depth + 1);
    if (found) return found;
  }
  return null;
}

function readResultHeader(json) {
  const header = json && json.response && json.response.header;
  if (!header) return null;
  return {
    code: firstString(header, ['resultCode', 'resultcode', 'code']),
    message: firstString(header, ['resultMsg', 'resultmsg', 'message']),
  };
}

function normalizeCctv(item) {
  const url = firstString(item, ['cctvurl', 'cctvUrl', 'url']);
  if (!url) return null;
  const name = firstString(item, ['cctvname', 'cctvName', 'name']);
  const format = firstString(item, ['cctvformat', 'cctvFormat', 'format']);
  return {
    name: name || '(이름 없음)',
    url,
    format: format || (url.includes('.m3u8') ? 'HLS' : 'MP4'),
    x: toNumber(firstString(item, ['coordx', 'coordX'])),
    y: toNumber(firstString(item, ['coordy', 'coordY'])),
  };
}

function buildItsUrl(apiKey) {
  const url = new URL(ITS_ENDPOINT);
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('type', 'ex');
  url.searchParams.set('cctvType', '1');
  url.searchParams.set('minX', String(BOUNDS.minX));
  url.searchParams.set('maxX', String(BOUNDS.maxX));
  url.searchParams.set('minY', String(BOUNDS.minY));
  url.searchParams.set('maxY', String(BOUNDS.maxY));
  url.searchParams.set('getType', 'json');
  return url.toString();
}

async function fetchItsList(env) {
  const customSource = String(env.CCTV_SOURCE_URL || '').trim();
  const apiKey = String(env.ITS_API_KEY || '').trim();

  if (!customSource && !apiKey) {
    throw httpError('ITS_API_KEY_MISSING', 'ITS_API_KEY 시크릿이 설정되지 않았습니다.', {
      howTo: [
        '배포: wrangler secret put ITS_API_KEY  (발급받은 키 붙여넣기)',
        '로컬: 프로젝트 루트 .dev.vars 파일에 ITS_API_KEY=발급받은키 한 줄 추가 후 wrangler dev',
        '이 키는 코드에 하드코딩하지 마세요. 저장소에 커밋되면 즉시 노출됩니다.',
      ],
    });
  }

  const json = await fetchJson(customSource || buildItsUrl(apiKey), {}, UPSTREAM_TIMEOUT_MS, 'ITS Open API');
  return { json, source: customSource ? 'CCTV_SOURCE_URL' : 'ITS 국가교통정보센터 Open API' };
}

/**
 * 123대 마스터(points) 기준으로 ITS 목록을 매칭합니다.
 * 같은 이름이 여러 지점에 있으면(예: 논공교2) 후보를 모두 붙입니다.
 */
function matchToMaster(cctvs) {
  const byName = new Map();
  for (const cctv of cctvs) {
    const key = normalizeName(cctv.name);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(cctv);
  }

  const used = new Set();
  const points = MASTER.points.map((point) => {
    const key = normalizeName(point.name);
    const exact = byName.get(key) || [];
    // 괄호 주석·공백을 지운 정확 일치만 매칭합니다. ITS 이름의 (외부) 같은 주석은
    // 이미 정규화에서 빠지므로, '함양'이 '함양산삼골휴게소'에 끌려가지 않습니다.
    const matched = byName.get(key) || [];
    const items = matched.map((c) => {
      used.add(c);
      return { name: c.name, url: c.url, format: c.format, mode: 'exact' };
    });
    return {
      ...point,
      its: items,
      itsMode: items.length ? 'exact' : 'none',
    };
  });

  const unmatched = [...new Set(cctvs.filter((c) => !used.has(c)).map((c) => c.name))].sort((a, b) =>
    a.localeCompare(b, 'ko')
  );

  return { points, unmatched };
}

async function buildCctvPayload(env) {
  const { json, source } = await fetchItsList(env);

  const rawItems = findCctvArray(json) || [];
  const cctvs = [];
  const seen = new Set();
  for (const item of rawItems) {
    if (!item || typeof item !== 'object') continue;
    const cctv = normalizeCctv(item);
    if (!cctv) continue;
    const key = `${cctv.name}|${cctv.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cctvs.push(cctv);
  }

  if (cctvs.length === 0) {
    const header = readResultHeader(json);
    if (header && header.code && !['0', '00', '000', 'SUCCESS'].includes(header.code.toUpperCase())) {
      throw httpError('ITS_API_ERROR', `ITS API가 오류를 반환했습니다. (${header.code})`, {
        resultCode: header.code,
        resultMsg: header.message,
      });
    }
  }

  cctvs.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const { points, unmatched } = matchToMaster(cctvs);

  const matchedPoints = points.filter((p) => p.its.length > 0).length;
  const matchedCameras = points.reduce((sum, p) => sum + p.its.length, 0);

  return {
    ok: true,
    kind: 'cctv',
    source,
    bounds: BOUNDS,
    fetchedAt: new Date().toISOString(),
    cacheTtlSeconds: CACHE_TTL.cctv,
    count: cctvs.length,
    cctvs,
    route: { name: MASTER.route, no: MASTER.routeNo, range: MASTER.range },
    points,
    stats: {
      itsCctvCount: cctvs.length,
      masterPoints: points.length,
      masterCameras: points.reduce((sum, p) => sum + p.cams.length, 0),
      matchedPoints,
      matchedCctvItems: matchedCameras,
      pointsWithoutIts: points.filter((p) => p.its.length === 0).map((p) => p.name),
      itsUnmatchedNames: unmatched,
      // 이전 팝업 대시보드(downloads/cctv_popup_dashboard.html) 호환용 별명
      unmatchedLabels: unmatched,
    },
  };
}

/* ─────────────────────── RWIS (/api/rwis) ─────────────────────── */

function rwisBase(env) {
  const base = String(env.RWIS_BASE || 'https://rwis.kma.go.kr').trim().replace(/\/+$/, '');
  return base;
}

function conzoneIdFor(dirCode, suffix) {
  // 예: E + 170 → 0120CZE170
  return `0120CZ${dirCode}${suffix}`;
}

/** ① 노선의 IC~IC 구간과 구간별 LINK_ID 목록 */
async function fetchConzones(env) {
  const base = rwisBase(env);
  const url = `${base}/comis5/uis/gis/api/getConZoneByRoadNo.do`;
  const map = new Map();

  const results = await Promise.all(
    RWIS_DIRS.map((dir) =>
      postForm(
        url,
        {
          roadNo: ROAD.roadNo,
          roadNoN1: ROAD.roadNoN1,
          roadNoN2: ROAD.roadNoN2,
          cdpntTmnlDirDvCd: dir.code,
        },
        UPSTREAM_TIMEOUT_MS,
        `RWIS 구간조회(${dir.code})`
      )
    )
  );

  results.forEach((res, index) => {
    const dir = RWIS_DIRS[index];
    const items = Array.isArray(res && res.data) ? res.data : [];
    if (!items.length) {
      throw httpError('RWIS_NO_CONZONE', 'RWIS 구간 조회 결과가 비어 있습니다.', { dir: dir.code });
    }
    for (const item of items) {
      const id = firstString(item, ['conzoneId']);
      if (!id) continue;
      map.set(id, {
        id,
        dir: dir.code,
        name: firstString(item, ['conzoneNm']),
        len: toNumber(firstString(item, ['conzoneLen'])),
        links: (firstString(item, ['linkIdArrStr']) || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
    }
  });

  return map;
}

/** ② 최신 유효 기준시각 nrmMaxTm (YYYYMMDDHHmm) */
async function fetchRiskTm(env, riskCd) {
  const base = rwisBase(env);
  const json = await fetchJson(
    `${base}/rrw/algo/info/getNrmRoadRiskTimeSet?riskCd=${encodeURIComponent(riskCd)}`,
    {},
    UPSTREAM_TIMEOUT_MS,
    `RWIS 기준시각(${riskCd})`
  );
  const items = (json && json.body && json.body.items) || [];
  const tm = firstString(items[0] || {}, ['nrmMaxTm']);
  if (!/^\d{12}$/.test(tm)) {
    throw httpError('RWIS_NO_TM', 'RWIS 최신 기준시각(nrmMaxTm)을 받지 못했습니다.', { riskCd, body: json });
  }
  return tm;
}

/** 최신 5분 슬롯 표가 아직 안 올라왔을 때(NODATA_ERROR·빈 표) 5분씩 직전 슬롯으로 후퇴하는 한도 */
const RWIS_SLOT_MINUTES = 5;
const RWIS_FALLBACK_STEPS = 4; // 최신 + 4단계 = 최대 20분 전까지

/** 202611230935 에서 분 단위로 이동한 관측시각 (UTC 연산 — 표기만 KST) */
function shiftTm(tm, minutes) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(tm || ''));
  if (!m) return String(tm || '');
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])));
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

/** ③-1 한 슬롯의 표를 받아 대상 LINK_ID 등급만 추출. 비었으면 empty=true */
async function fetchRiskTableSlot(env, riskCd, tm, field, wantedLinks) {
  const base = rwisBase(env);
  const json = await fetchJson(
    `${base}/rrw/algo/data/getNrmRiskRoadTableAll?riskCd=${encodeURIComponent(riskCd)}&tm=${encodeURIComponent(tm)}`,
    {},
    UPSTREAM_TIMEOUT_MS,
    `RWIS 위험표(${riskCd})`
  );
  const header = (json && json.header) || {};
  const code = firstString(header, ['resultCode', 'resultcode', 'code']);
  const items = (json && json.body && json.body.items) || [];

  const levels = new Map();
  if (Array.isArray(items)) {
    for (const item of items) {
      const id = firstString(item, ['LINK_ID', 'linkId']);
      if (!id || !wantedLinks.has(id)) continue;
      const raw = item[field];
      if (raw === null || raw === undefined || raw === '') continue;
      const value = Number(raw);
      if (!Number.isFinite(value)) continue;
      // 0.0~3.0 사이 값만 등급으로 인정 (그 밖의 값은 결측 취급)
      if (value < 0 || value > 3) continue;
      levels.set(id, Math.round(value));
    }
  }
  return {
    levels,
    tm,
    code,
    itemCount: Array.isArray(items) ? items.length : 0,
    empty: levels.size === 0,
  };
}

/**
 * ③ 위험등급 표 → 대상 LINK_ID만 추출. 최신 슬롯이 비면 5분씩 직전 슬롯으로 후퇴합니다.
 * 기상청 표는 nrmMaxTm 보다 몇 분 늦게 올라오는 일이 있고, 그때 HTTP 200 + resultCode 03
 * (NODATA_ERROR) + 빈 items 로 돌아옵니다. 실제 사용한 관측시각을 tm 으로 돌려줍니다.
 */
async function fetchRiskTable(env, riskCd, tm, field, wantedLinks) {
  const tried = [];
  for (let step = 0; step <= RWIS_FALLBACK_STEPS; step += 1) {
    const slot = shiftTm(tm, -RWIS_SLOT_MINUTES * step);
    const result = await fetchRiskTableSlot(env, riskCd, slot, field, wantedLinks);
    if (!result.empty) return { ...result, latest: tm, steps: step, tried };
    tried.push({ tm: slot, resultCode: result.code || null, items: result.itemCount });
  }
  throw httpError(
    'RWIS_EMPTY_TABLE',
    `RWIS 위험등급 표가 비어 있습니다. 최근 ${RWIS_FALLBACK_STEPS + 1}개 슬롯(${
      RWIS_FALLBACK_STEPS * RWIS_SLOT_MINUTES
    }분 전까지) 모두 비었습니다.`,
    { riskCd, latest: tm, tried }
  );
}

function levelCounts(levelsByLink, links) {
  const counts = [0, 0, 0, 0];
  let known = 0;
  let max = null;
  for (const link of links) {
    if (!levelsByLink.has(link)) continue;
    const level = levelsByLink.get(link);
    counts[level] += 1;
    known += 1;
    if (max === null || level > max) max = level;
  }
  return { level: max, counts: known ? counts : null, known, total: links.length };
}

function riskView(info) {
  return {
    level: info.level,
    levelName: info.level === null ? '결측' : LEVEL_NAME[info.level],
    levelDetail: info.level === null ? '등급 없음' : LEVEL_DETAIL[info.level],
    counts: info.counts, // [0단계,1단계,2단계,3단계] 링크 수
    knownLinks: info.known,
    totalLinks: info.total,
  };
}

async function buildRwisPayload(env) {
  const sourceUrl = String(env.RWIS_SOURCE_URL || '').trim();
  if (sourceUrl) return buildRwisFromSource(sourceUrl);

  const zoneDefs = [];
  for (const zone of MASTER.zones) {
    for (const dir of RWIS_DIRS) {
      const id = conzoneIdFor(dir.code, zone.suffix);
      zoneDefs.push({ id, zone, dir });
    }
  }

  const { data: conzones } = await withCache('rwis:conzones:v1', CACHE_TTL.conzone, false, () => fetchConzones(env));

  const wantedLinks = new Set();
  for (const def of zoneDefs) {
    const conzone = conzones.get(def.id);
    if (conzone) for (const link of conzone.links) wantedLinks.add(link);
  }

  const [frLatest, vrLatest] = await Promise.all([fetchRiskTm(env, 'FR'), fetchRiskTm(env, 'VR')]);
  const [frTable, vrTable] = await Promise.all([
    fetchRiskTable(env, 'FR', frLatest, 'FSM', wantedLinks),
    fetchRiskTable(env, 'VR', vrLatest, 'VIR', wantedLinks),
  ]);
  const frLevels = frTable.levels;
  const vrLevels = vrTable.levels;
  // tm 은 실제로 등급을 읽어 온 관측시각(후퇴했으면 그 슬롯)
  const frTm = frTable.tm;
  const vrTm = vrTable.tm;

  const zones = zoneDefs.map(({ id, zone, dir }) => {
    const conzone = conzones.get(id) || null;
    const links = conzone ? conzone.links : [];
    const fsm = riskView(levelCounts(frLevels, links));
    const vir = riskView(levelCounts(vrLevels, links));
    return {
      id,
      suffix: zone.suffix,
      name: conzone ? conzone.name || zone.name : zone.name,
      dir: dir.code,
      dirLabel: dir.label,
      dirShort: dir.short,
      startKm: zone.startKm,
      endKm: zone.endKm,
      lengthM: conzone ? conzone.len : null,
      linkCount: links.length,
      missing: !conzone,
      fsm,
      vir,
    };
  });

  const summary = {
    fsmMax: zones.reduce((m, z) => (z.fsm.level === null ? m : Math.max(m ?? 0, z.fsm.level)), null),
    virMax: zones.reduce((m, z) => (z.vir.level === null ? m : Math.max(m ?? 0, z.vir.level)), null),
    fsmZoneCounts: [0, 1, 2, 3].map((level) => zones.filter((z) => z.fsm.level === level).length),
    virZoneCounts: [0, 1, 2, 3].map((level) => zones.filter((z) => z.vir.level === level).length),
    missingZones: zones.filter((z) => z.missing).map((z) => z.id),
    zonesWithoutData: zones.filter((z) => !z.missing && z.fsm.level === null && z.vir.level === null).map((z) => z.id),
  };

  const alerts = zones
    .filter((z) => (z.fsm.level !== null && z.fsm.level >= 2) || (z.vir.level !== null && z.vir.level >= 2))
    .map((z) => ({
      id: z.id,
      name: z.name,
      dirLabel: z.dirLabel,
      fsm: z.fsm.level,
      vir: z.vir.level,
      text:
        `${z.name}(${z.dirLabel}) ` +
        [z.fsm.level >= 2 ? `도로살얼음 ${LEVEL_NAME[z.fsm.level]}` : null, z.vir.level >= 2 ? `가시거리 ${LEVEL_NAME[z.vir.level]}` : null]
          .filter(Boolean)
          .join(' · '),
    }));

  return {
    ok: true,
    kind: 'rwis',
    source: 'rwis.kma.go.kr 도로기상정보시스템',
    fetchedAt: new Date().toISOString(),
    cacheTtlSeconds: CACHE_TTL.rwis,
    road: { no: ROAD.roadNo, n2: ROAD.roadNoN2, name: ROAD.name, range: MASTER.range },
    tm: { FR: frTm, VR: vrTm },
    tmLabel: { FR: formatTm(frTm), VR: formatTm(vrTm) },
    tmLatest: { FR: frLatest, VR: vrLatest },
    tmFallbackSteps: { FR: frTable.steps, VR: vrTable.steps },
    tmFallback: {
      FR: frTable.steps > 0,
      VR: vrTable.steps > 0,
      note:
        frTable.steps > 0 || vrTable.steps > 0
          ? `최신 기준시각 표가 아직 없어 ${RWIS_SLOT_MINUTES}분 단위로 직전 슬롯을 씁니다.`
          : null,
    },
    levelNames: LEVEL_NAME,
    levelDetails: LEVEL_DETAIL,
    summary,
    alerts,
    zones,
  };
}

/**
 * 사전 계산 JSON(RWIS_SOURCE_URL) 사용 경로.
 * 표 전체(약 2.8MB×2) 파싱을 Worker가 하지 않으므로 무료 플랜 CPU 한도에서도 안전합니다.
 * JSON 형식은 tools/rwis_export.py 출력(= /api/rwis 응답 형태)과 같습니다.
 */
async function buildRwisFromSource(sourceUrl) {
  const json = await fetchJson(sourceUrl, {}, UPSTREAM_TIMEOUT_MS, 'RWIS_SOURCE_URL');
  const zones = json && json.zones;
  if (!Array.isArray(zones) || zones.length === 0 || !json.tm) {
    throw httpError('RWIS_SOURCE_BAD_SHAPE', 'RWIS_SOURCE_URL 응답이 예상 형식(16개 zones + tm)이 아닙니다.', {
      got: json ? Object.keys(json) : null,
    });
  }
  return {
    ...json,
    ok: true,
    kind: 'rwis',
    via: 'source-url',
    source: json.source || 'RWIS_SOURCE_URL(사전 계산)',
    fetchedAt: json.generatedAt || new Date().toISOString(),
  };
}

/** 202611210020 → 2026-11-21 00:20 (KST) */
function formatTm(tm) {
  const s = String(tm || '');
  if (!/^\d{12}$/.test(s)) return s;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}`;
}

/* ─────────────────────── 스트림 주소 (/api/stream) ─────────────────────── */

async function buildStreamPayload(cctvId) {
  const url = `${ROADPLUS_ENDPOINT}?cctvId=${encodeURIComponent(cctvId)}`;
  const json = await fetchJson(url, {}, ROADPLUS_TIMEOUT_MS, '로드플러스 CCTV API', 1);
  const info = json && Array.isArray(json.cctvInfo) ? json.cctvInfo[0] : null;
  if (!info || !info.CCTVURL) {
    throw httpError('STREAM_NOT_FOUND', '로드플러스에서 이 CCTV의 영상 주소를 받지 못했습니다.', {
      cctvId,
      got: json ? Object.keys(json) : null,
    });
  }
  return {
    ok: true,
    kind: 'stream',
    cctvId,
    name: firstString(info, ['CCTV_NM']),
    streamUrl: firstString(info, ['CCTVURL']),
    snapshotUrl: firstString(info, ['NOWCCTVIMG']),
    prev: { cctvId: firstString(info, ['PREV_CCTV_ID']), name: firstString(info, ['PREVCCTVNM']) },
    next: { cctvId: firstString(info, ['NEXT_CCTV_ID']), name: firstString(info, ['NEXTCCTVNM']) },
    camId: toNumber(info.CAMRID),
    fetchedAt: new Date().toISOString(),
    cacheTtlSeconds: CACHE_TTL.stream,
  };
}

/* ─────────────────────────── 핸들러 ─────────────────────────── */

function errorPayload(err, kind) {
  const code = (err && err.code) || 'UNKNOWN_ERROR';
  return {
    ok: false,
    kind,
    error: code,
    message: (err && err.message) || '알 수 없는 오류',
    detail: (err && err.detail) || null,
    at: new Date().toISOString(),
  };
}

function hintsFor(code, kind) {
  if (kind === 'cctv') {
    if (code === 'ITS_API_KEY_MISSING') return 'Worker 시크릿 ITS_API_KEY를 설정한 뒤 다시 호출하세요. (wrangler secret put ITS_API_KEY)';
    return 'Cloudflare Workers에서 openapi.its.go.kr:9443 연결이 막히는 경우가 있습니다. 그때는 NAS나 GitHub Actions에서 같은 JSON을 주기적으로 받아 KV/R2/정적 호스팅에 올리고, Worker 환경변수 CCTV_SOURCE_URL 에 그 주소를 지정하세요. (README.md 참고)';
  }
  if (kind === 'rwis') {
    return 'rwis.kma.go.kr 응답이 일시적으로 비어 있을 수 있습니다. 잠시 뒤 ?refresh=1 로 다시 호출해 보세요. 계속 실패하면 RWIS_BASE 환경변수와 기상청 점검 공지를 확인하세요. (무료 플랜 CPU 한도가 걱정되면 tools/rwis_export.py + RWIS_SOURCE_URL 방식을 쓰세요 — README 4장)';
  }
  return null;
}

async function handleCctv(url, env) {
  const refresh = isRefresh(url);
  try {
    const { data, cache } = await withCache('cctv:v2', CACHE_TTL.cctv, refresh, () => buildCctvPayload(env));
    return jsonResponse({ ...data, cache }, 200, {
      'X-Cache': cache,
      'Cache-Control': `public, max-age=${CACHE_TTL.cctv}`,
    });
  } catch (err) {
    const code = (err && err.code) || 'UNKNOWN_ERROR';
    const status = code === 'ITS_API_KEY_MISSING' ? 500 : 502;
    return jsonResponse(
      { ...errorPayload(err, 'cctv'), hint: hintsFor(code, 'cctv') },
      status,
      { 'X-Cache': 'BYPASS' }
    );
  }
}

async function handleRwis(url, env) {
  const refresh = isRefresh(url);
  try {
    const { data, cache } = await withCache('rwis:v2:all', CACHE_TTL.rwis, refresh, () => buildRwisPayload(env));
    return jsonResponse({ ...data, cache }, 200, {
      'X-Cache': cache,
      'Cache-Control': `public, max-age=${CACHE_TTL.rwis}`,
    });
  } catch (err) {
    const code = (err && err.code) || 'UNKNOWN_ERROR';
    return jsonResponse(
      { ...errorPayload(err, 'rwis'), hint: hintsFor(code, 'rwis') },
      502,
      { 'X-Cache': 'BYPASS' }
    );
  }
}

async function handleStatus(url, env) {
  const refresh = isRefresh(url);
  const [cctvResult, rwisResult] = await Promise.allSettled([
    withCache('cctv:v2', CACHE_TTL.cctv, refresh, () => buildCctvPayload(env)),
    withCache('rwis:v2:all', CACHE_TTL.rwis, refresh, () => buildRwisPayload(env)),
  ]);

  const errors = {};
  let cctv = null;
  let rwis = null;

  if (cctvResult.status === 'fulfilled') {
    cctv = { ...cctvResult.value.data, cache: cctvResult.value.cache };
  } else {
    const err = cctvResult.reason;
    errors.cctv = { ...errorPayload(err, 'cctv'), hint: hintsFor((err && err.code) || '', 'cctv') };
  }

  if (rwisResult.status === 'fulfilled') {
    rwis = { ...rwisResult.value.data, cache: rwisResult.value.cache };
  } else {
    const err = rwisResult.reason;
    errors.rwis = { ...errorPayload(err, 'rwis'), hint: hintsFor((err && err.code) || '', 'rwis') };
  }

  const ok = Boolean(cctv || rwis);
  return jsonResponse(
    {
      ok,
      version: VERSION,
      fetchedAt: new Date().toISOString(),
      master: { route: MASTER.route, no: MASTER.routeNo, range: MASTER.range, zones: MASTER.zones },
      cctv,
      rwis,
      errors,
    },
    ok ? 200 : 502,
    { 'X-Cache': refresh ? 'REFRESH' : 'MIXED' }
  );
}

async function handleStream(url, env) {
  const cctvId = String(url.searchParams.get('cctvId') || '').trim().toLowerCase();
  if (!/^cctv\d{8}$/.test(cctvId)) {
    return jsonResponse(
      {
        ok: false,
        kind: 'stream',
        error: 'INVALID_CCTV_ID',
        message: 'cctvId는 cctv + 8자리 숫자 형식이어야 합니다. 예: ?cctvId=cctv00005751',
      },
      400
    );
  }

  const refresh = isRefresh(url);
  try {
    const { data, cache } = await withCache(`stream:v1:${cctvId}`, CACHE_TTL.stream, refresh, () =>
      buildStreamPayload(cctvId)
    );
    return jsonResponse({ ...data, cache }, 200, {
      'X-Cache': cache,
      'Cache-Control': `public, max-age=${CACHE_TTL.stream}`,
    });
  } catch (err) {
    return jsonResponse(
      {
        ...errorPayload(err, 'stream'),
        hint: '로드플러스 CCTV API가 일시적으로 응답하지 않을 수 있습니다. 잠시 뒤 다시 시도하세요.',
      },
      502,
      { 'X-Cache': 'BYPASS' }
    );
  }
}

function handleIndex(env) {
  const cameraCount = MASTER.points.reduce((sum, p) => sum + p.cams.length, 0);
  return jsonResponse({
    ok: true,
    service: '광주대구선 CCTV + RWIS 통합 Worker',
    version: VERSION,
    route: { name: MASTER.route, no: MASTER.routeNo, range: MASTER.range },
    master: { points: MASTER.points.length, cameras: cameraCount, rwisZones: MASTER.zones.length * RWIS_DIRS.length },
    endpoints: {
      'GET /api/status': 'CCTV(123대) + RWIS(16개 구간) 통합 응답 (권장)',
      'GET /api/cctv': 'ITS Open API CCTV 목록 + 123대 마스터 매칭 (15분 캐시)',
      'GET /api/cctv?refresh=1': '캐시를 무시하고 ITS에서 즉시 갱신',
      'GET /api/rwis': 'RWIS 도로살얼음(FSM)·가시거리(VIR) 16개 구간 등급 (5분 캐시)',
      'GET /api/rwis?refresh=1': 'RWIS 캐시 무시',
      'GET /api/stream?cctvId=cctv00005751': '로드플러스 CCTV HLS 주소 + 스냅샷 (2분 캐시)',
      'OPTIONS *': 'CORS preflight',
    },
    coverage: BOUNDS,
    env: {
      ITS_API_KEY: Boolean(String(env.ITS_API_KEY || '').trim()),
      CCTV_SOURCE_URL: Boolean(String(env.CCTV_SOURCE_URL || '').trim()),
      RWIS_SOURCE_URL: Boolean(String(env.RWIS_SOURCE_URL || '').trim()),
      RWIS_BASE: String(env.RWIS_BASE || 'https://rwis.kma.go.kr'),
      rwisMode: String(env.RWIS_SOURCE_URL || '').trim() ? 'source-url(사전 계산 JSON)' : 'direct(3단계 API 직접 호출)',
    },
  });
}

export default {
  async fetch(request, env = {}) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...CORS_HEADERS, 'Content-Length': '0' } });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return jsonResponse(
        { ok: false, error: 'METHOD_NOT_ALLOWED', message: 'GET과 OPTIONS만 지원합니다.' },
        405,
        { Allow: 'GET, HEAD, OPTIONS' }
      );
    }

    if (path === '/api/cctv') return handleCctv(url, env);
    if (path === '/api/rwis') return handleRwis(url, env);
    if (path === '/api/status') return handleStatus(url, env);
    if (path === '/api/stream') return handleStream(url, env);
    if (path === '/' || path === '') return handleIndex(env);

    return jsonResponse(
      { ok: false, error: 'NOT_FOUND', message: `${path} 경로는 없습니다. /api/status, /api/cctv, /api/rwis, /api/stream 을 사용하세요.` },
      404
    );
  },
};
