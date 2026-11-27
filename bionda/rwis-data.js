// 광주대구선(12호선) 함양IC~옥포JC 도로살얼음상황판(RWIS) 마스터 · 지리 경계 · 기상청 도로정보/13개소 단기예보 연계 모듈
// - 4개 광역 지명(전북·경남·경북·대구) 및 5개 핵심 시·군 지명(함양군·거창군·합천군·고령군·달성군)은 실제 통계청 경계 폴리곤 내부(Point-in-Polygon) 검증 좌표 사용

export const RWIS_MASTER = {"route":"광주대구선","routeNo":"012","range":{"startKm":95.0,"endKm":176.0,"startName":"함양IC","endName":"옥포JC"},"zones":[{"suffix":"160","startKm":95.0,"endKm":97.3,"name":"함양IC–함양JC","nearIds":[],"nearNames":[]},{"suffix":"170","startKm":97.3,"endKm":121.1,"name":"함양JC–거창IC","nearIds":[],"nearNames":[]},{"suffix":"180","startKm":121.1,"endKm":131.1,"name":"거창IC–가조IC","nearIds":[],"nearNames":[]},{"suffix":"190","startKm":131.1,"endKm":146.4,"name":"가조IC–해인사IC","nearIds":[],"nearNames":[]},{"suffix":"200","startKm":146.4,"endKm":152.9,"name":"해인사IC–고령IC","nearIds":[],"nearNames":[]},{"suffix":"210","startKm":152.9,"endKm":165.52,"name":"고령IC–동고령IC","nearIds":[],"nearNames":[]},{"suffix":"220","startKm":165.52,"endKm":166.99,"name":"동고령IC–고령JC","nearIds":["p50","p51","p52"],"nearNames":["기산2교","기족교","고령분기점_광주대구"]},{"suffix":"230","startKm":166.99,"endKm":176.0,"name":"고령JC–옥포JC","nearIds":[],"nearNames":[]}],"points":[{"name":"두산","km":95.0,"kmSource":"산출","facility":"일반(마을)","address":"경남 함양군 함양읍 신관리 산 87-6","lat":35.533423,"lon":127.748989,"cctvId":"cctv00001457","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km) / 함양IC 인접(경계)","cams":[{"dir":"G","seq":3,"cctvId":"cctv00001457"}],"id":"p01","zone":"160"},{"name":"함양","km":95.0,"kmSource":"공식","facility":"IC","address":"경남 함양군 함양읍 신관리 산 87-6","lat":35.533199,"lon":127.748835,"cctvId":"cctv00005751","note":"","cams":[{"dir":"D","seq":1,"cctvId":"cctv00005751"},{"dir":"G","seq":2,"cctvId":"cctv00005751"}],"id":"p02","zone":"160"},{"name":"지곡","km":96.23,"kmSource":"산출","facility":"IC","address":"경남 함양군 함양읍 백천리 산 56-1","lat":35.532314,"lon":127.760938,"cctvId":"cctv00005752","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":4,"cctvId":"cctv00005752"},{"dir":"G","seq":5,"cctvId":"cctv00005752"}],"id":"p03","zone":"160"},{"name":"원평교","km":98.19,"kmSource":"공식","facility":"교량","address":"경남 함양군 지곡면 도촌리 241-1","lat":35.538839,"lon":127.777535,"cctvId":"cctv00005754","note":"","cams":[{"dir":"D","seq":6,"cctvId":"cctv00005754"},{"dir":"G","seq":7,"cctvId":"cctv00005754"}],"id":"p04","zone":"170"},{"name":"우명교","km":99.93,"kmSource":"산출","facility":"교량","address":"경남 함양군 수동면 우명리 산 97-1","lat":35.548953,"lon":127.794978,"cctvId":"cctv00005755","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":8,"cctvId":"cctv00005755"},{"dir":"G","seq":9,"cctvId":"cctv00005755"}],"id":"p05","zone":"170"},{"name":"함양산삼골휴게소","km":100.8,"kmSource":"공식","facility":"휴게소","address":"경남 함양군 수동면 하교리 산 12-2","lat":35.550969,"lon":127.808505,"cctvId":"cctv00005756","note":"","cams":[{"dir":"D","seq":10,"cctvId":"cctv00005756"},{"dir":"G","seq":11,"cctvId":"cctv00005756"}],"id":"p06","zone":"170"},{"name":"죽산천교1","km":102.68,"kmSource":"공식","facility":"교량","address":"경남 함양군 수동면 죽산리 1282-15","lat":35.548226,"lon":127.827499,"cctvId":"cctv00005757","note":"","cams":[{"dir":"D","seq":12,"cctvId":"cctv00005757"},{"dir":"G","seq":13,"cctvId":"cctv00005757"}],"id":"p07","zone":"170"},{"name":"죽산교","km":104.75,"kmSource":"공식","facility":"교량","address":"경남 함양군 수동면 죽산리 403","lat":35.554471,"lon":127.834004,"cctvId":"cctv00005758","note":"","cams":[{"dir":"D","seq":14,"cctvId":"cctv00005758"},{"dir":"G","seq":15,"cctvId":"cctv00005758"}],"id":"p08","zone":"170"},{"name":"춘전리","km":107.45,"kmSource":"산출","facility":"일반(마을)","address":"경남 거창군 남상면 춘전리 381-1","lat":35.57966,"lon":127.852194,"cctvId":"cctv00005759","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":16,"cctvId":"cctv00005759"},{"dir":"G","seq":17,"cctvId":"cctv00005759"}],"id":"p09","zone":"170"},{"name":"춘전1육교","km":107.85,"kmSource":"산출","facility":"교량","address":"경남 거창군 남상면 춘전리 293-3","lat":35.582185,"lon":127.854997,"cctvId":"cctv00005760","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":18,"cctvId":"cctv00005760"},{"dir":"G","seq":19,"cctvId":"cctv00005760"}],"id":"p10","zone":"170"},{"name":"춘전재 토석류","km":108.2,"kmSource":"산출","facility":"일반(마을)","address":"경남 거창군 남상면 춘전리 산 89-3","lat":35.586785,"lon":127.859683,"cctvId":"cctv00000110","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":20,"cctvId":"cctv00000110"},{"dir":"G","seq":21,"cctvId":"cctv00000110"}],"id":"p11","zone":"170"},{"name":"남상","km":109.58,"kmSource":"산출","facility":"일반(마을)","address":"경남 거창군 남상면 둔동리 산 50-1","lat":35.593586,"lon":127.873424,"cctvId":"cctv00001458","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":22,"cctvId":"cctv00001458"},{"dir":"G","seq":23,"cctvId":"cctv00001458"}],"id":"p12","zone":"170"},{"name":"둔동리","km":111.37,"kmSource":"산출","facility":"일반(마을)","address":"경남 거창군 남상면 둔동리 산 120-1","lat":35.605886,"lon":127.881771,"cctvId":"cctv00005762","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":24,"cctvId":"cctv00005762"},{"dir":"G","seq":25,"cctvId":"cctv00005762"}],"id":"p13","zone":"170"},{"name":"오계교","km":113.38,"kmSource":"공식","facility":"교량","address":"경남 거창군 남상면 무촌리 1162","lat":35.631986,"lon":127.900542,"cctvId":"cctv00005763","note":"","cams":[{"dir":"D","seq":26,"cctvId":"cctv00005763"},{"dir":"G","seq":27,"cctvId":"cctv00005763"}],"id":"p14","zone":"170"},{"name":"무촌1교","km":114.76,"kmSource":"공식","facility":"교량","address":"경남 거창군 남상면 오계리 279","lat":35.62791,"lon":127.897323,"cctvId":"cctv00005764","note":"","cams":[{"dir":"D","seq":28,"cctvId":"cctv00005764"},{"dir":"G","seq":29,"cctvId":"cctv00005764"}],"id":"p15","zone":"170"},{"name":"무촌2교","km":116.02,"kmSource":"공식","facility":"교량","address":"경남 거창군 남상면 무촌리 1855-114","lat":35.641846,"lon":127.915623,"cctvId":"cctv00005765","note":"","cams":[{"dir":"D","seq":30,"cctvId":"cctv00005765"},{"dir":"G","seq":31,"cctvId":"cctv00005765"}],"id":"p16","zone":"170"},{"name":"송변교","km":117.1,"kmSource":"공식","facility":"교량","address":"경남 거창군 남상면 대산리 984-5","lat":35.648955,"lon":127.924449,"cctvId":"cctv00005766","note":"","cams":[{"dir":"D","seq":32,"cctvId":"cctv00005766"},{"dir":"G","seq":33,"cctvId":"cctv00005766"}],"id":"p17","zone":"170"},{"name":"대산육교","km":117.91,"kmSource":"산출","facility":"교량","address":"경남 거창군 남상면 월평리 산 45-8","lat":35.655854,"lon":127.925911,"cctvId":"cctv00005767","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":34,"cctvId":"cctv00005767"},{"dir":"G","seq":35,"cctvId":"cctv00005767"}],"id":"p18","zone":"170"},{"name":"정장교","km":119.54,"kmSource":"공식","facility":"교량","address":"경남 거창군 거창읍 정장리 266-9","lat":35.674607,"lon":127.930313,"cctvId":"cctv00005768","note":"","cams":[{"dir":"D","seq":36,"cctvId":"cctv00005768"},{"dir":"G","seq":37,"cctvId":"cctv00005768"}],"id":"p19","zone":"170"},{"name":"거창","km":121.1,"kmSource":"공식","facility":"IC","address":"경남 거창군 거창읍 대평리 120","lat":35.679166,"lon":127.93523,"cctvId":"cctv00005769","note":"","cams":[{"dir":"D","seq":38,"cctvId":"cctv00005769"},{"dir":"G","seq":39,"cctvId":"cctv00005769"}],"id":"p20","zone":"180"},{"name":"황강천교","km":121.49,"kmSource":"공식","facility":"교량","address":"경남 거창군 거창읍 대평리 1454-2","lat":35.681873,"lon":127.938929,"cctvId":"cctv00005770","note":"","cams":[{"dir":"D","seq":40,"cctvId":"cctv00005770"},{"dir":"G","seq":41,"cctvId":"cctv00005770"}],"id":"p21","zone":"180"},{"name":"둔마1교","km":124.16,"kmSource":"공식","facility":"교량","address":"경남 거창군 남하면 둔마리 산 83-13","lat":35.699756,"lon":127.94605,"cctvId":"cctv00005771","note":"","cams":[{"dir":"D","seq":42,"cctvId":"cctv00005771"},{"dir":"G","seq":43,"cctvId":"cctv00005771"}],"id":"p22","zone":"180"},{"name":"둔마2교","km":125.34,"kmSource":"공식","facility":"교량","address":"경남 거창군 남하면 둔마리 산 216-4","lat":35.706707,"lon":127.959538,"cctvId":"cctv00005772","note":"","cams":[{"dir":"D","seq":44,"cctvId":"cctv00005772"},{"dir":"G","seq":45,"cctvId":"cctv00005772"}],"id":"p23","zone":"180"},{"name":"살피재터널(외부광주)","km":126.58,"kmSource":"공식","facility":"터널","address":"경남 거창군 가조면 동례리 산 251-4","lat":35.707317,"lon":127.988983,"cctvId":"cctv00000509","note":"터널 등록 이정 기준(갱구 CCTV)","cams":[{"dir":"D","seq":48,"cctvId":"cctv00000509"},{"dir":"G","seq":49,"cctvId":"cctv00000509"}],"id":"p24","zone":"180"},{"name":"살피재터널(외부대구)","km":126.58,"kmSource":"공식","facility":"터널","address":"경남 거창군 남하면 둔마리 산 131-5","lat":35.70834,"lon":127.966184,"cctvId":"cctv00000508","note":"터널 등록 이정 기준(갱구 CCTV)","cams":[{"dir":"D","seq":46,"cctvId":"cctv00000508"},{"dir":"G","seq":47,"cctvId":"cctv00000508"}],"id":"p25","zone":"180"},{"name":"동례교","km":129.51,"kmSource":"공식","facility":"교량","address":"경남 거창군 가조면 동례리 1017-13","lat":35.702633,"lon":128.000653,"cctvId":"cctv00005773","note":"","cams":[{"dir":"D","seq":50,"cctvId":"cctv00005773"},{"dir":"G","seq":51,"cctvId":"cctv00005773"}],"id":"p26","zone":"180"},{"name":"가조","km":131.1,"kmSource":"공식","facility":"IC","address":"경남 거창군 가조면 일부리 1060-3","lat":35.701972,"lon":128.021152,"cctvId":"cctv00005774","note":"","cams":[{"dir":"D","seq":52,"cctvId":"cctv00005774"},{"dir":"G","seq":53,"cctvId":"cctv00005774"}],"id":"p27","zone":"190"},{"name":"일부육교","km":132.58,"kmSource":"산출","facility":"교량","address":"경남 거창군 가조면 일부리 259-2","lat":35.706627,"lon":128.035333,"cctvId":"cctv00005775","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":54,"cctvId":"cctv00005775"},{"dir":"G","seq":55,"cctvId":"cctv00005775"}],"id":"p28","zone":"190"},{"name":"거창휴게소","km":134.4,"kmSource":"공식","facility":"휴게소","address":"경남 거창군 가조면 도리 444-7","lat":35.70725,"lon":128.056167,"cctvId":"cctv00005776","note":"","cams":[{"dir":"D","seq":56,"cctvId":"cctv00005776"},{"dir":"G","seq":57,"cctvId":"cctv00005776"}],"id":"p29","zone":"190"},{"name":"가조터널(외부대구)","km":135.18,"kmSource":"공식","facility":"터널","address":"경남 거창군 가조면 도리 1529-102","lat":35.70675,"lon":128.06404,"cctvId":"cctv00005810","note":"터널 등록 이정 기준(갱구 CCTV)","cams":[{"dir":"D","seq":58,"cctvId":"cctv00005810"},{"dir":"G","seq":59,"cctvId":"cctv00005810"}],"id":"p30","zone":"190"},{"name":"가야1터널(외부광주)","km":137.24,"kmSource":"공식","facility":"터널","address":"경남 합천군 가야면 성기리 산 70-1","lat":35.708827,"lon":128.095382,"cctvId":"cctv00005812","note":"터널 등록 이정 기준(갱구 CCTV)","cams":[{"dir":"D","seq":62,"cctvId":"cctv00005812"},{"dir":"G","seq":63,"cctvId":"cctv00005812"}],"id":"p31","zone":"190"},{"name":"가야1터널(외부대구)","km":137.24,"kmSource":"공식","facility":"터널","address":"경남 합천군 가야면 성기리 산 105-19","lat":35.708448,"lon":128.088435,"cctvId":"cctv00005811","note":"터널 등록 이정 기준(갱구 CCTV)","cams":[{"dir":"D","seq":60,"cctvId":"cctv00005811"},{"dir":"G","seq":61,"cctvId":"cctv00005811"}],"id":"p32","zone":"190"},{"name":"가야2터널(외부대구)","km":139.05,"kmSource":"공식","facility":"터널","address":"경남 합천군 가야면 청현리 535","lat":35.707825,"lon":128.11897,"cctvId":"cctv00005813","note":"터널 등록 이정 기준(갱구 CCTV)","cams":[{"dir":"D","seq":64,"cctvId":"cctv00005813"},{"dir":"G","seq":65,"cctvId":"cctv00005813"}],"id":"p33","zone":"190"},{"name":"가야3터널(외부대구)","km":140.25,"kmSource":"공식","facility":"터널","address":"경남 합천군 야로면 묵촌리 산 34-10","lat":35.70028,"lon":128.13881,"cctvId":"cctv00005814","note":"터널 등록 이정 기준(갱구 CCTV)","cams":[{"dir":"D","seq":66,"cctvId":"cctv00005814"},{"dir":"G","seq":67,"cctvId":"cctv00005814"}],"id":"p34","zone":"190"},{"name":"야로2터널(외부광주)","km":143.43,"kmSource":"공식","facility":"터널","address":"경남 합천군 야로면 정대리 산 19-1","lat":35.692768,"lon":128.15625,"cctvId":"cctv00005815","note":"터널 등록 이정 기준(갱구 CCTV)","cams":[{"dir":"D","seq":68,"cctvId":"cctv00005815"},{"dir":"G","seq":69,"cctvId":"cctv00005815"}],"id":"p35","zone":"190"},{"name":"야로대교1","km":144.58,"kmSource":"공식","facility":"교량","address":"경남 합천군 야로면 정대리 1048-1","lat":35.692831,"lon":128.168477,"cctvId":"cctv00005777","note":"","cams":[{"dir":"D","seq":70,"cctvId":"cctv00005777"},{"dir":"G","seq":72,"cctvId":"cctv00005777"}],"id":"p36","zone":"190"},{"name":"야로대교2","km":144.58,"kmSource":"공식","facility":"교량","address":"경남 합천군 야로면 정대리 1048-1","lat":35.692831,"lon":128.168477,"cctvId":"cctv00005778","note":"","cams":[{"dir":"D","seq":71,"cctvId":"cctv00005778"},{"dir":"G","seq":73,"cctvId":"cctv00005778"}],"id":"p37","zone":"190"},{"name":"해인사","km":146.4,"kmSource":"공식","facility":"IC","address":"경남 합천군 야로면 금평리 산 47-2","lat":35.69651,"lon":128.184314,"cctvId":"cctv00005779","note":"","cams":[{"dir":"D","seq":74,"cctvId":"cctv00005779"},{"dir":"G","seq":75,"cctvId":"cctv00005779"}],"id":"p38","zone":"200"},{"name":"야로3터널(외부대구)","km":147.36,"kmSource":"공식","facility":"터널","address":"경남 합천군 야로면 청계리 산 31","lat":35.699323,"lon":128.200595,"cctvId":"cctv00000515","note":"터널 등록 이정 기준(갱구 CCTV)","cams":[{"dir":"D","seq":76,"cctvId":"cctv00000515"},{"dir":"G","seq":77,"cctvId":"cctv00000515"}],"id":"p39","zone":"200"},{"name":"쌍림터널(외부광주)","km":148.34,"kmSource":"공식","facility":"터널","address":"경북 고령군 쌍림면 월막리 산 42-9","lat":35.705333,"lon":128.215363,"cctvId":"cctv00000516","note":"터널 등록 이정 기준(갱구 CCTV)","cams":[{"dir":"D","seq":78,"cctvId":"cctv00000516"},{"dir":"G","seq":79,"cctvId":"cctv00000516"}],"id":"p40","zone":"200"},{"name":"월막리","km":150.21,"kmSource":"산출","facility":"일반(마을)","address":"경북 고령군 쌍림면 월막리 633-2","lat":35.704485,"lon":128.226124,"cctvId":"cctv00005780","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":80,"cctvId":"cctv00005780"},{"dir":"G","seq":81,"cctvId":"cctv00005780"}],"id":"p41","zone":"200"},{"name":"용동천1교","km":151.6,"kmSource":"공식","facility":"교량","address":"경북 고령군 쌍림면 고곡리 987-89","lat":35.700241,"lon":128.238169,"cctvId":"cctv00005781","note":"","cams":[{"dir":"D","seq":82,"cctvId":"cctv00005781"},{"dir":"G","seq":83,"cctvId":"cctv00005781"}],"id":"p42","zone":"200"},{"name":"고령","km":152.9,"kmSource":"공식","facility":"IC","address":"경북 고령군 쌍림면 고곡리 717-2","lat":35.700934,"lon":128.244782,"cctvId":"cctv00005782","note":"","cams":[{"dir":"D","seq":84,"cctvId":"cctv00005782"},{"dir":"G","seq":85,"cctvId":"cctv00005782"}],"id":"p43","zone":"210"},{"name":"안림천교","km":153.35,"kmSource":"공식","facility":"교량","address":"경북 고령군 대가야읍 외리 847-29","lat":35.707473,"lon":128.264529,"cctvId":"cctv00005783","note":"","cams":[{"dir":"D","seq":86,"cctvId":"cctv00005783"},{"dir":"G","seq":87,"cctvId":"cctv00005783"}],"id":"p44","zone":"210"},{"name":"회천대교","km":156.29,"kmSource":"산출","facility":"교량","address":"경북 고령군 대가야읍 외리 1178-68","lat":35.71189,"lon":128.285993,"cctvId":"cctv00005784","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":88,"cctvId":"cctv00005784"},{"dir":"G","seq":89,"cctvId":"cctv00005784"}],"id":"p45","zone":"210"},{"name":"양전리1","km":156.77,"kmSource":"산출","facility":"일반(마을)","address":"경북 고령군 대가야읍 장기리 산 74","lat":35.713581,"lon":128.291796,"cctvId":"cctv00005785","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":90,"cctvId":"cctv00005785"},{"dir":"G","seq":91,"cctvId":"cctv00005785"}],"id":"p46","zone":"210"},{"name":"양전리2","km":157.28,"kmSource":"산출","facility":"일반(마을)","address":"경북 고령군 개진면 양전리 419-3","lat":35.719463,"lon":128.295286,"cctvId":"cctv00005786","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":92,"cctvId":"cctv00005786"},{"dir":"G","seq":93,"cctvId":"cctv00005786"}],"id":"p47","zone":"210"},{"name":"양전교","km":158.58,"kmSource":"공식","facility":"교량","address":"경북 고령군 개진면 양전리 860-3","lat":35.724719,"lon":128.301446,"cctvId":"cctv00005787","note":"","cams":[{"dir":"D","seq":94,"cctvId":"cctv00005787"},{"dir":"G","seq":95,"cctvId":"cctv00005787"}],"id":"p48","zone":"210"},{"name":"사부1교","km":159.5,"kmSource":"공식","facility":"교량","address":"경북 고령군 성산면 사부리 413-1","lat":35.736026,"lon":128.306395,"cctvId":"cctv00005788","note":"","cams":[{"dir":"D","seq":96,"cctvId":"cctv00005788"},{"dir":"G","seq":97,"cctvId":"cctv00005788"}],"id":"p49","zone":"210"},{"name":"기산2교","km":163.0,"kmSource":"공식","facility":"교량","address":"경북 고령군 성산면 기산리 378","lat":35.745125,"lon":128.334454,"cctvId":"cctv00005790","note":"","cams":[{"dir":"D","seq":98,"cctvId":"cctv00005790"},{"dir":"G","seq":99,"cctvId":"cctv00005790"}],"id":"p50","zone":"210","nearZones":["220"]},{"name":"기족교","km":163.54,"kmSource":"공식","facility":"교량","address":"경북 고령군 성산면 기족리 976","lat":35.747618,"lon":128.346851,"cctvId":"cctv00005791","note":"","cams":[{"dir":"D","seq":100,"cctvId":"cctv00005791"},{"dir":"G","seq":101,"cctvId":"cctv00005791"}],"id":"p51","zone":"210","nearZones":["220"]},{"name":"고령분기점_광주대구","km":166.99,"kmSource":"산출","facility":"JC","address":"경북 고령군 성산면 박곡리 647","lat":35.758949,"lon":128.379322,"cctvId":"cctv00003535","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":102,"cctvId":"cctv00003535"},{"dir":"G","seq":103,"cctvId":"cctv00003535"}],"id":"p52","zone":"230","nearZones":["220"]},{"name":"논공휴게소","km":169.2,"kmSource":"공식","facility":"휴게소","address":"대구 달성군 논공읍 삼리리 458-4","lat":35.766174,"lon":128.402933,"cctvId":"cctv00003534","note":"","cams":[{"dir":"D","seq":104,"cctvId":"cctv00003534"},{"dir":"G","seq":105,"cctvId":"cctv00003534"}],"id":"p53","zone":"230"},{"name":"논공휴게소2","km":169.4,"kmSource":"산출","facility":"휴게소","address":"대구 달성군 논공읍 삼리리 458-4","lat":35.766936,"lon":128.40415,"cctvId":"cctv00000147","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":106,"cctvId":"cctv00000147"},{"dir":"G","seq":107,"cctvId":"cctv00000147"}],"id":"p54","zone":"230"},{"name":"금포2교","km":170.99,"kmSource":"공식","facility":"교량","address":"대구 달성군 논공읍 금포리 산 8-1","lat":35.769926,"lon":128.417653,"cctvId":"cctv00006019","note":"","cams":[{"dir":"D","seq":108,"cctvId":"cctv00006019"},{"dir":"G","seq":109,"cctvId":"cctv00006019"}],"id":"p55","zone":"230"},{"name":"논공교","km":171.84,"kmSource":"공식","facility":"교량","address":"대구 달성군 논공읍 금포리 산 35-11","lat":35.770323,"lon":128.43169,"cctvId":"cctv00003533","note":"","cams":[{"dir":"D","seq":114,"cctvId":"cctv00003533"},{"dir":"G","seq":115,"cctvId":"cctv00003533"}],"id":"p56","zone":"230"},{"name":"논공교2","km":171.84,"kmSource":"공식","facility":"교량","address":"대구 달성군 논공읍 금포리 1665-4","lat":35.767748,"lon":128.426271,"cctvId":"cctv00000191","note":"논공교 일대 개별 카메라(개별 이정은 미고시)","cams":[{"dir":"D","seq":110,"cctvId":"cctv00000191"},{"dir":"G","seq":111,"cctvId":"cctv00000191"}],"id":"p57","zone":"230"},{"name":"논공교3","km":171.84,"kmSource":"공식","facility":"교량","address":"대구 달성군 논공읍 금포리 1635-1","lat":35.768671,"lon":128.428551,"cctvId":"cctv00005595","note":"논공교 일대 개별 카메라(개별 이정은 미고시)","cams":[{"dir":"D","seq":112,"cctvId":"cctv00005595"},{"dir":"G","seq":113,"cctvId":"cctv00005595"}],"id":"p58","zone":"230"},{"name":"논공교4","km":171.84,"kmSource":"공식","facility":"교량","address":"대구 달성군 옥포읍 강림리 1076-4","lat":35.774703,"lon":128.437564,"cctvId":"cctv00000192","note":"논공교 일대 개별 카메라(개별 이정은 미고시)","cams":[{"dir":"D","seq":116,"cctvId":"cctv00000192"},{"dir":"G","seq":117,"cctvId":"cctv00000192"}],"id":"p59","zone":"230"},{"name":"금포리","km":172.14,"kmSource":"산출","facility":"일반(마을)","address":"대구 달성군 논공읍 금포리 산 39-5","lat":35.774215,"lon":128.437093,"cctvId":"cctv00000111","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":118,"cctvId":"cctv00000111"},{"dir":"G","seq":119,"cctvId":"cctv00000111"}],"id":"p60","zone":"230"},{"name":"금포리2","km":172.71,"kmSource":"산출","facility":"일반(마을)","address":"대구 달성군 옥포읍 교항리 산 161-3","lat":35.778109,"lon":128.444047,"cctvId":"cctv00001459","note":"이정 산출(좌표→노선 투영, 오차 ±0.5km)","cams":[{"dir":"D","seq":120,"cctvId":"cctv00001459"},{"dir":"G","seq":121,"cctvId":"cctv00001459"}],"id":"p61","zone":"230"},{"name":"옥포분기점_광주대구","km":176.0,"kmSource":"공식","facility":"JC","address":"대구 달성군 옥포읍 교항리 산 139-1","lat":35.781373,"lon":128.451706,"cctvId":"cctv00003532","note":"","cams":[{"dir":"D","seq":122,"cctvId":"cctv00003532"},{"dir":"G","seq":123,"cctvId":"cctv00003532"}],"id":"p62","zone":"230"}],"bridgeKm":4.0};

export const RWIS_ROUTE_GEO = {"source":"kostat 2013 시도·시군 경계 단순화 (southkorea/southkorea-maps)","proj":{"lonC":128.1003,"latC":35.6573,"cosLat":0.81254,"scale":1900.0,"x0":800.0,"y0":455.0,"mapTop":112.0,"mapBottom":792.0},"provinces":[{"name":"경상남도","d":"M1221.0 548.4L1237.8 556.8L1314.8 526.2L1337.8 496.7L1397.0 502.3L1428.3 495.5L1434.6 427.9L1461.3 413.1L1478.8 472.0L1476.8 524.7L1510.6 541.6L1551.4 595.9L1585.5 606.8L1630.0 588.3L1630.0 812.0L87.1 812.0L87.7 800.6L112.3 786.9L71.5 712.9L68.2 695.3L17.1 656.7L11.5 635.8L47.3 598.4L50.1 556.4L74.3 535.2L62.1 489.2L74.5 450.7L91.0 436.8L100.2 382.7L125.4 360.5L125.9 267.9L185.9 210.6L215.5 194.5L255.7 107.4L296.7 115.6L321.0 91.5L351.0 88.0L596.9 88.0L604.2 92.4L612.3 88.0L629.6 88.0L644.5 117.8L667.3 134.7L697.3 121.7L727.0 134.0L757.2 112.3L840.2 147.1L836.4 182.1L847.4 209.8L883.7 216.0L902.2 260.4L937.6 276.7L959.7 336.3L960.5 409.3L925.9 429.6L901.9 430.4L901.3 468.0L934.0 459.8L958.9 486.4L1012.4 492.2L1024.6 463.9L1051.6 488.5L1078.4 471.3L1121.0 464.8L1196.5 488.9Z"},{"name":"경상북도","d":"M1630.0 88.0L1630.0 588.3L1585.5 606.8L1551.4 595.9L1510.6 541.6L1476.8 524.7L1478.8 472.0L1461.3 413.1L1488.1 343.3L1544.1 305.3L1600.6 309.1L1590.7 331.2L1610.5 373.1L1630.0 369.2L1630.0 88.0L1249.3 88.0L1250.8 93.9L1301.3 92.2L1358.9 111.2L1385.7 137.9L1372.8 173.6L1297.4 171.8L1277.5 196.2L1245.2 259.2L1254.7 293.1L1316.3 331.4L1317.3 373.9L1293.6 392.7L1203.8 365.3L1190.5 374.0L1197.4 415.9L1237.7 464.6L1270.6 490.0L1243.6 546.7L1221.0 548.4L1196.5 488.9L1121.0 464.8L1078.4 471.3L1051.6 488.5L1024.6 463.9L1012.4 492.2L958.9 486.4L934.0 459.8L901.3 468.0L901.9 430.4L925.9 429.6L960.5 409.3L959.7 336.3L937.6 276.7L902.2 260.4L883.7 216.0L847.4 209.8L836.4 182.1L840.2 147.1L757.2 112.3L727.0 134.0L697.3 121.7L667.3 134.7L644.5 117.8L629.6 88.0L612.3 88.0L604.2 92.4L596.9 88.0Z"},{"name":"전라북도","d":"M351.0 88.0L321.0 91.5L296.7 115.6L255.7 107.4L215.5 194.5L185.9 210.6L125.9 267.9L125.4 360.5L100.2 382.7L91.0 436.8L74.5 450.7L62.1 489.2L74.3 535.2L50.1 556.4L47.3 598.4L11.5 635.8L17.1 656.7L68.2 695.3L71.5 712.9L112.3 786.9L87.7 800.6L87.1 812.0L-30.0 812.0L-30.0 88.0Z"},{"name":"대구광역시","d":"M1461.3 413.1L1434.6 427.9L1428.3 495.5L1397.0 502.3L1337.8 496.7L1314.8 526.2L1237.8 556.8L1221.0 548.4L1243.6 546.7L1270.6 490.0L1237.7 464.6L1197.4 415.9L1190.5 374.0L1203.8 365.3L1293.6 392.7L1317.3 373.9L1316.3 331.4L1254.7 293.1L1245.2 259.2L1277.5 196.2L1297.4 171.8L1372.8 173.6L1385.7 137.9L1358.9 111.2L1301.3 92.2L1250.8 93.9L1249.3 88.0L1630.0 88.0L1630.0 369.2L1610.5 373.1L1590.7 331.2L1600.6 309.1L1544.1 305.3L1488.1 343.3Z"}],"counties":[{"name":"합천군","d":"M901.8 233.2L902.2 260.4L937.6 276.7L959.7 336.3L960.5 409.3L901.9 430.4L901.3 468.0L934.0 459.8L958.9 486.4L1051.6 488.5L1078.4 471.3L1121.0 464.8L1196.5 488.9L1208.0 547.0L1191.8 556.8L1207.0 611.4L1189.3 658.9L1193.2 693.3L1223.2 723.6L1222.7 756.0L1183.5 759.0L1136.2 730.6L1064.2 738.7L1042.2 771.6L971.9 792.1L970.8 812.0L609.5 812.0L590.3 759.4L579.1 664.8L616.9 639.0L645.2 516.1L680.3 471.1L717.2 452.8L726.3 421.1L789.4 413.8L716.7 280.5L727.1 231.0L703.5 215.9L732.8 178.6L755.7 177.9L788.5 131.0L840.2 147.1L847.4 209.8Z"},{"name":"거창군","d":"M770.0 115.6L788.5 131.0L755.7 177.9L732.8 178.6L703.5 215.9L727.1 231.0L716.7 280.5L789.4 413.8L726.3 421.1L717.2 452.8L680.3 471.1L645.2 516.1L616.9 639.0L579.1 664.8L586.5 724.3L533.0 730.5L500.6 694.5L468.7 703.0L459.5 663.7L426.7 627.7L396.3 598.7L435.5 559.3L458.8 494.9L458.4 437.8L428.4 460.2L398.3 453.8L345.0 406.5L315.9 369.6L259.3 321.1L238.0 343.5L208.4 320.5L200.0 289.8L152.9 248.0L184.8 212.0L215.5 194.5L255.7 107.4L296.7 115.6L321.0 91.5L351.0 88.0L596.9 88.0L604.2 92.4L612.3 88.0L631.6 88.0L667.3 134.7L697.3 121.7L727.0 134.0Z"},{"name":"함양군","d":"M152.9 248.0L200.0 289.8L208.4 320.5L238.0 343.5L259.3 321.1L315.9 369.6L345.0 406.5L398.3 453.8L428.4 460.2L458.4 437.8L458.8 494.9L435.5 559.3L396.3 598.7L426.7 627.7L377.3 703.9L375.7 760.2L348.1 778.9L361.9 812.0L90.2 812.0L87.7 800.6L112.3 786.9L68.2 695.3L8.4 655.9L22.7 618.7L47.3 598.4L50.1 556.4L74.3 535.2L62.1 489.2L91.0 436.8L100.2 382.7L125.4 360.5L125.9 267.9Z"},{"name":"산청군","d":"M426.7 627.7L459.5 663.7L468.7 703.0L500.6 694.5L533.0 730.5L586.5 724.3L590.3 759.4L609.5 812.0L361.9 812.0L348.1 778.9L375.7 760.2L377.3 703.9Z"},{"name":"창녕군","d":"M1461.3 413.1L1478.8 472.0L1476.8 524.7L1510.6 541.6L1512.5 563.0L1564.8 599.4L1552.2 608.0L1559.5 676.2L1530.2 774.3L1539.8 812.0L1286.5 812.0L1306.8 785.3L1291.6 765.3L1223.2 723.6L1193.2 693.3L1189.3 658.9L1207.0 611.4L1191.8 556.8L1208.0 547.0L1221.0 548.4L1237.8 556.8L1314.8 526.2L1337.8 496.7L1397.0 502.3L1428.3 495.5L1434.6 427.9Z"},{"name":"의령군","d":"M1223.2 723.6L1291.6 765.3L1306.8 785.3L1286.5 812.0L970.8 812.0L971.9 792.1L1042.2 771.6L1064.2 738.7L1136.2 730.6L1183.5 759.0L1222.7 756.0Z"},{"name":"성주군","d":"M1249.3 88.0L1253.5 116.0L1218.9 169.9L1218.1 202.0L1178.9 196.9L1139.5 164.0L1071.7 143.9L1069.5 208.6L1049.8 199.7L1018.6 223.5L985.5 204.9L974.2 160.8L922.0 154.1L895.7 173.5L925.1 211.8L901.8 233.2L847.4 209.8L840.2 147.1L788.5 131.0L770.0 115.6L761.1 94.3L763.1 88.0Z"},{"name":"고령군","d":"M1250.8 93.9L1301.3 92.2L1358.9 111.2L1375.2 126.9L1390.3 155.9L1372.8 173.6L1297.4 171.8L1245.2 259.2L1254.7 293.1L1316.3 331.4L1317.3 373.9L1293.6 392.7L1203.8 365.3L1197.4 415.9L1237.7 464.6L1270.6 490.0L1243.6 546.7L1221.0 548.4L1208.0 547.0L1196.5 488.9L1121.0 464.8L1078.4 471.3L1051.6 488.5L958.9 486.4L934.0 459.8L901.3 468.0L901.9 430.4L960.5 409.3L959.7 336.3L937.6 276.7L902.2 260.4L901.8 233.2L925.1 211.8L895.7 173.5L922.0 154.1L974.2 160.8L985.5 204.9L1018.6 223.5L1049.8 199.7L1069.5 208.6L1071.7 143.9L1139.5 164.0L1178.9 196.9L1218.1 202.0L1218.9 169.9L1253.5 116.0Z"},{"name":"청도군","d":"M1630.0 590.4L1618.7 595.9L1564.8 599.4L1512.5 563.0L1510.6 541.6L1476.8 524.7L1478.8 472.0L1461.3 413.1L1488.1 343.3L1544.1 305.3L1600.6 309.1L1590.7 331.2L1610.5 373.1L1630.0 363.2Z"},{"name":"김천시","d":"M763.1 88.0L761.1 94.3L770.0 115.6L727.0 134.0L697.3 121.7L667.3 134.7L631.6 88.0L612.3 88.0L604.2 92.4L596.9 88.0Z"},{"name":"장수군","d":"M184.8 212.0L152.9 248.0L125.9 267.9L125.4 360.5L100.2 382.7L91.0 436.8L62.1 489.2L74.3 535.2L50.1 556.4L47.3 598.4L22.7 618.7L8.4 655.9L-9.9 672.0L-17.9 712.1L0.3 755.8L-25.5 781.8L-30.0 800.0L-30.0 190.2L-1.0 201.4L35.0 167.1L61.5 114.1L77.0 161.6L140.9 170.8Z"},{"name":"남원시","d":"M-30.0 812.0L-30.0 800.0L-25.5 781.8L0.3 755.8L-17.9 712.1L-9.9 672.0L8.4 655.9L68.2 695.3L112.3 786.9L87.7 800.6L90.2 812.0Z"},{"name":"달성군","d":"M1552.7 174.9L1560.5 171.0L1630.0 185.4L1630.0 363.2L1610.5 373.1L1590.7 331.2L1600.6 309.1L1544.1 305.3L1488.1 343.3L1461.3 413.1L1434.6 427.9L1428.3 495.5L1397.0 502.3L1337.8 496.7L1314.8 526.2L1237.8 556.8L1221.0 548.4L1243.6 546.7L1270.6 490.0L1237.7 464.6L1197.4 415.9L1203.8 365.3L1293.6 392.7L1317.3 373.9L1316.3 331.4L1254.7 293.1L1245.2 259.2L1297.4 171.8L1372.8 173.6L1390.3 155.9L1441.3 170.7L1445.6 191.2L1504.1 241.0L1529.5 227.3L1528.0 194.0ZM1378.7 88.0L1375.2 126.9L1358.9 111.2L1301.3 92.2L1250.8 93.9L1249.3 88.0Z"}],"labels":[{"name":"경남","x":711.7,"y":524.8,"area":783922},{"name":"경북","x":1171.0,"y":295.8,"area":196920},{"name":"대구","x":1423.3,"y":282.3,"area":117212},{"name":"전북","x":59.3,"y":366.7,"area":103786}]};

export const LEVEL_NAME = ['안전', '관심', '주의', '위험'];
export const LEVEL_DETAIL = ['0단계 · 안전', '1단계 · 관심', '2단계 · 주의', '3단계 · 위험'];

// 100% 실제 경계 폴리곤 내부(Point-in-Polygon) 검증 완료 광역 지명 좌표 (base map 좌표계)
export const PROVINCE_LABELS_FIXED = {
  전북: { x: 75, y: 315 },
  경남: { x: 675, y: 608 },
  경북: { x: 1168, y: 175 },
  대구: { x: 1535, y: 255 }
};

// 첨부 참고 지도 기준 5개 핵심 시·군 지명 (100% 각 시·군 폴리곤 내부 검증 좌표)
export const COUNTY_LABELS = [
  { name: '함양군', prov: '경남', x: 225, y: 565 },
  { name: '거창군', prov: '경남', x: 458, y: 330 },
  { name: '합천군', prov: '경남', x: 855, y: 565 },
  { name: '고령군', prov: '경북', x: 1030, y: 242 },
  { name: '달성군', prov: '대구', x: 1395, y: 435 }
];

// 주요 노선 이정 노드 (함양IC 95.0k ~ 옥포JC 176.0k)
export const ROUTE_NODES = [
  { km: 95.0, name: '함양IC', kind: 'ic', side: 1, point: '함양', sub: '95.0km · 기점' },
  { km: 97.3, name: '함양JC', kind: 'jc', side: -1, sub: '통영대전선 분기', branch: { a: [262, 84], label: '통영대전선' } },
  { km: 121.1, name: '거창IC', kind: 'ic', side: 1, point: '거창' },
  { km: 126.58, name: '살피재TN', kind: 'tn', side: 1, point: '살피재터널(외부광주)' },
  { km: 131.1, name: '가조IC', kind: 'ic', side: 1, point: '가조' },
  { km: 135.18, name: '가조TN', kind: 'tn', side: -1, point: '가조터널(외부대구)' },
  { km: 137.24, name: '가야1TN', kind: 'tn', side: 1, point: '가야1터널(외부대구)' },
  { km: 140.25, name: '가야3TN', kind: 'tn', side: 1, point: '가야3터널(외부대구)' },
  { km: 146.4, name: '해인사IC', kind: 'ic', side: -1, point: '해인사' },
  { km: 152.9, name: '고령IC', kind: 'ic', side: -1, point: '고령' },
  { km: 165.52, name: '동고령IC', kind: 'ic', side: 1 },
  { km: 166.99, name: '고령JC', kind: 'jc', side: -1, point: '고령분기점_광주대구', sub: '중부내륙선 분기', branch: { a: [252, 74], label: '중부내륙선' } },
  { km: 176.0, name: '옥포JC', kind: 'jc', side: -1, point: '옥포분기점_광주대구', sub: '중부내륙선지선 분기', branch: { a: [244, 62], label: '중부내륙선지선' } }
];

// 광주대구선 관내 핵심 도로기상관측소 (노선 대각선 균형 배치: 상단좌측 2 · 하단중앙 2 · 상단 1 · 하단우측 2)
export const CORRIDOR_MAP_STATIONS = [
  { stnId: '14206', label: '함양(도)', shortName: '함양', km: 95.0, lat: 35.5327, lon: 127.7495, type: '기본', dock: { cx: 148, cy: 110, row: 'top' } },
  { stnId: '14409', label: '죽산천교', shortName: '죽산천교', km: 102.9, lat: 35.5486, lon: 127.8289, type: '결빙', dock: { cx: 390, cy: 110, row: 'top' } },
  { stnId: '14207', label: '남상졸음', shortName: '남상졸음', km: 115.3, lat: 35.6366, lon: 127.9066, type: '기본', dock: { cx: 596, cy: 638, row: 'bottom' } },
  { stnId: '14208', label: '거창휴', shortName: '거창휴', km: 134.1, lat: 35.7074, lon: 128.0541, type: '기본', dock: { cx: 838, cy: 638, row: 'bottom' } },
  { stnId: '14209', label: '양전교', shortName: '양전교', km: 158.2, lat: 35.7247, lon: 128.2979, type: '기본', dock: { cx: 960, cy: 110, row: 'top' } },
  { stnId: '14103', label: '논공휴', shortName: '논공휴', km: 169.2, lat: 35.7653, lon: 128.4015, type: '거점', dock: { cx: 1204, cy: 638, row: 'bottom' } },
  { stnId: '14410', label: '논공교', shortName: '논공교', km: 171.3, lat: 35.7681, lon: 128.4230, type: '결빙', dock: { cx: 1446, cy: 638, row: 'bottom' } }
];

// 13개 단기예보 읍·면·동 실제 지리 좌표 및 TV 대형 '아이콘+온도' 캡슐 무충돌 오프셋 (48개 전 요소 12px 여유 검증 완료)
export const SHORT13_MAP_LOCATIONS = [
  { id: 'hamyang',  name: '함양읍', county: '함양군', lat: 35.5166,   lon: 127.7288,   dx: -124, dy: -20 },
  { id: 'jigok',    name: '지곡면', county: '함양군', lat: 35.5632,   lon: 127.7764,   dx: -145, dy: -145 },
  { id: 'sudong',   name: '수동면', county: '함양군', lat: 35.5191,   lon: 127.7899,   dx: 176,  dy: -82 },
  { id: 'geochang', name: '거창읍', county: '거창군', lat: 35.6849,   lon: 127.9060,   dx: -145, dy: -6 },
  { id: 'namsang',  name: '남상면', county: '거창군', lat: 35.6402,   lon: 127.9122,   dx: 84,   dy: 56 },
  { id: 'namha',    name: '남하면', county: '거창군', lat: 35.6647,   lon: 127.9458,   dx: 112,  dy: 28 },
  { id: 'gajo',     name: '가조면', county: '거창군', lat: 35.7080,   lon: 128.0169,   dx: -8,   dy: -104 },
  { id: 'gaya',     name: '가야면', county: '합천군', lat: 35.762683, lon: 128.139463, dx: -56,  dy: -14 },
  { id: 'yaro',     name: '야로면', county: '합천군', lat: 35.7022,   lon: 128.1699,   dx: -84,  dy: 124 },
  { id: 'ssangnim', name: '쌍림면', county: '고령군', lat: 35.6768,   lon: 128.2441,   dx: 36,   dy: 84 },
  { id: 'daegaya',  name: '대가야읍', county: '고령군', lat: 35.7305, lon: 128.2679,   dx: -132, dy: -36 },
  { id: 'seongsan', name: '성산면', county: '고령군', lat: 35.7469,   lon: 128.3621,   dx: 46,   dy: 94 },
  { id: 'okpo',     name: '옥포읍', county: '달성군', lat: 35.7866,   lon: 128.4660,   dx: 96,   dy: 124 }
];

/**
 * 구간 카드 노면 기준 관측소 표기 포맷
 * - '함양(도)' -> '함양(도) 기준' (함양군/함양IC와 구분 유지)
 * - '죽산천교(도)' -> '죽산천교 기준'
 */
export function formatStationBasisLabel(stationName = '') {
  const raw = String(stationName || '').trim();
  if (!raw) return '';
  const cleaned = raw === '함양(도)' ? '함양(도)' : raw.replace(/\(도\)$/, '');
  return `${cleaned} 기준`;
}

/**
 * 지도 위 RWIS 콜아웃 카드 2줄 문구 생성 (단위 테스트 가능 순수 함수)
 * - 1줄 좌: '함양(95k)', 1줄 우: '3.0°' (기온 결측 교량센서는 '교량')
 * - 2줄: '노면 5.1° - 건조 (40%)' (습도가 없으면 괄호 생략: '노면 4.3° - 건조')
 */
export function formatRwisCalloutLines(stnMeta, obs) {
  const shortName = stnMeta?.shortName || String(stnMeta?.label || '').replace(/\(도\)$/, '');
  const kmVal = Number.isFinite(stnMeta?.km) ? Math.round(stnMeta.km) : null;
  const titleLeft = kmVal !== null ? `${shortName}(${kmVal}k)` : shortName;
  const hasAir = Number.isFinite(obs?.temp);
  const titleRight = hasAir ? `${obs.temp.toFixed(1)}°` : '교량';

  const trTxt = Number.isFinite(obs?.roadTemp) ? `노면 ${obs.roadTemp.toFixed(1)}°` : '노면 —';
  const surfTxt = (obs?.surfaceState && obs.surfaceState !== '관측중') ? obs.surfaceState : '건조';
  const hasHum = Number.isFinite(obs?.humidity) && obs.humidity > 0;
  const humPart = hasHum ? ` (${Math.round(obs.humidity)}%)` : '';
  const subLine = `${trTxt} - ${surfTxt}${humPart}`;

  return { titleLeft, titleRight, hasAir, subLine, hasHum };
}

// 8개 RWIS 구간 ↔ 기존 기상청 도로기상관측소(/api/road-obs, /api/road-risk) & 13개 단기예보(/api/short-term-12) 연계 매핑
export const ZONE_INTEGRATION_MAP = {
  '160': { county: '함양군', stnIds: ['14206'], regionIds: ['hamyang', 'jigok'] },
  '170': { county: '함양·거창군', stnIds: ['14409', '14207'], regionIds: ['sudong', 'namsang', 'geochang'] },
  '180': { county: '거창군', stnIds: ['14207', '14208'], regionIds: ['geochang', 'namha', 'gajo'] },
  '190': { county: '거창·합천군', stnIds: ['14208'], regionIds: ['gajo', 'gaya', 'yaro'] },
  '200': { county: '합천·고령군', stnIds: ['14208', '14209'], regionIds: ['yaro', 'ssangnim'] },
  '210': { county: '고령군', stnIds: ['14209'], regionIds: ['daegaya', 'seongsan'] },
  '220': { county: '고령군', stnIds: ['14209', '14103'], regionIds: ['seongsan'] },
  '230': { county: '달성군', stnIds: ['14103', '14410'], regionIds: ['okpo'] }
};

// 서→동(함양읍 → 옥포읍) 순 13개 단기예보 정렬 순서
export const SHORT13_ROUTE_ORDER = [
  'hamyang', 'jigok', 'sudong', 'namsang', 'geochang', 'namha',
  'gajo', 'gaya', 'yaro', 'ssangnim', 'daegaya', 'seongsan', 'okpo'
];

export function extractRwisZoneSuffix(zoneId) {
  const m = String(zoneId || '').match(/(\d{3})$/);
  return m ? m[1] : '';
}

export function normalizeZoneGrade(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 && v <= 3 ? v : null;
  const s = String(v).trim();
  return /^[0-3]$/.test(s) ? Number(s) : null;
}

/**
 * /api/road-risk 응답의 stationRisks(배열 또는 객체)를 stnId 기준 Map으로 정규화
 */
export function indexStationRisks(roadRisk) {
  const map = new Map();
  const raw = roadRisk?.stationRisks;
  if (!raw) return map;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && item.stnId != null) {
        map.set(String(item.stnId), item);
      }
    }
    return map;
  }
  if (typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if (v && typeof v === 'object') {
        map.set(String(v.stnId ?? k), v);
      }
    }
  }
  return map;
}

/**
 * RWIS 16개(양방향) 구간이 응답 실패일 때 기존 기상청 012 도로위험(/api/road-risk)으로 8개 구간 등급 폴백 구성
 * - 결측(null)을 0('안전')으로 허위 강등하지 않음 (No False Safety)
 */
export function buildFallbackZonesFromRoadRisk(roadRisk) {
  const stnMap = indexStationRisks(roadRisk);
  const zones = [];
  for (const z of RWIS_MASTER.zones) {
    const mapInfo = ZONE_INTEGRATION_MAP[z.suffix] || { stnIds: [] };
    let maxIce = null;
    let maxFog = null;
    for (const stnId of mapInfo.stnIds) {
      const sr = stnMap.get(String(stnId));
      if (!sr) continue;
      const ice = normalizeZoneGrade(sr.iceLevel);
      const fog = normalizeZoneGrade(sr.fogLevel);
      if (ice !== null) maxIce = maxIce === null ? ice : Math.max(maxIce, ice);
      if (fog !== null) maxFog = maxFog === null ? fog : Math.max(maxFog, fog);
    }
    for (const dir of ['E', 'S']) {
      zones.push({
        id: `0120CZ${dir}${z.suffix}`,
        suffix: z.suffix,
        name: z.name,
        dir,
        fsm: {
          level: maxIce,
          label: maxIce === null ? '정보 없음' : (LEVEL_NAME[maxIce] || '안전'),
          levelDetail: maxIce === null ? '미수신 · 정보 없음' : (LEVEL_DETAIL[maxIce] || LEVEL_DETAIL[0])
        },
        vir: {
          level: maxFog,
          label: maxFog === null ? '정보 없음' : (LEVEL_NAME[maxFog] || '안전'),
          levelDetail: maxFog === null ? '미수신 · 정보 없음' : (LEVEL_DETAIL[maxFog] || LEVEL_DETAIL[0])
        },
        fromRoadRiskFallback: true
      });
    }
  }
  return zones;
}

/**
 * 13개 단기예보 지역 1곳의 향후 12시간 핵심 지표 요약
 */
export function summarizeShortRegion12h(region) {
  const hours = Array.isArray(region?.hours) ? region.hours.slice(0, 12) : [];
  let minTemp = null;
  let maxPop = 0;
  let firstWet = null;
  let firstFreeze = null;      // 엄격 영하 (< 0°C, hourly.html / 6H 표와 100% 통일)
  let firstZeroOrBelow = null; // 0°C 이하 결빙경계 (<= 0°C)
  let firstOverlap = null;
  let curTemp = null;

  for (let i = 0; i < hours.length; i++) {
    const h = hours[i];
    const t = Number(h?.temp);
    if (Number.isFinite(t)) {
      if (i === 0) curTemp = t;
      if (minTemp === null || t < minTemp) minTemp = t;
    }
    const pop = Number(h?.chance ?? h?.pop ?? 0);
    if (Number.isFinite(pop) && pop > maxPop) maxPop = pop;
    const isWet = Boolean(h?.wet || (Number.isFinite(h?.rainMm) && h.rainMm > 0) || (Number.isFinite(h?.snowCm) && h.snowCm > 0));
    const isFreeze = Number.isFinite(t) && t < 0;
    const isZeroOrBelow = Number.isFinite(t) && t <= 0;
    const hourNum = Number.isFinite(h?.hourKst) ? h.hourKst : Number(String(h?.time || '').slice(11, 13));
    if (isWet && !firstWet) {
      firstWet = {
        hour: hourNum,
        type: h?.type && h.type !== '없음' ? h.type : '강수',
        time: h?.time || ''
      };
    }
    if (isFreeze && !firstFreeze) {
      firstFreeze = {
        hour: hourNum,
        temp: t,
        time: h?.time || ''
      };
    }
    if (isZeroOrBelow && !firstZeroOrBelow) {
      firstZeroOrBelow = {
        hour: hourNum,
        temp: t,
        time: h?.time || ''
      };
    }
    if (isWet && isFreeze && !firstOverlap) {
      firstOverlap = {
        hour: hourNum,
        type: h?.type && h.type !== '없음' ? h.type : '강수',
        temp: t
      };
    }
  }

  return {
    id: region?.id || '',
    name: region?.name || '',
    group: region?.group || '',
    curTemp,
    minTemp,
    maxPop,
    firstWet,
    firstFreeze,
    firstZeroOrBelow,
    firstOverlap
  };
}

/**
 * 8개 RWIS 구간에 기존 기상청 도로기상관측(/api/road-obs), 012 도로위험(/api/road-risk), 13개 단기예보(/api/short-term-12)를 통합 매핑
 */
export function enrichZonesWithBionda({ rwisZones = [], roadStations = [], roadRisk = null, shortTerm13 = null, rwisTm = null } = {}) {
  const stnById = new Map();
  for (const s of roadStations || []) {
    if (s && s.stnId) stnById.set(String(s.stnId), s);
  }
  const regionById = new Map();
  for (const r of shortTerm13?.regions || []) {
    if (r && r.id) regionById.set(String(r.id), summarizeShortRegion12h(r));
  }
  const stnMap = indexStationRisks(roadRisk);

  const rwisFrDigits = String(typeof rwisTm === 'string' ? rwisTm : (rwisTm?.FR || '')).replace(/\D/g, '').slice(0, 12);
  const roadRiskFrgDigits = String(roadRisk?.sources?.frgTmKst || roadRisk?.tmKst || '').replace(/\D/g, '').slice(0, 12);
  const apiHubNotOlder = !rwisFrDigits || !roadRiskFrgDigits || roadRiskFrgDigits >= rwisFrDigits;

  const effectiveZones = (rwisZones && rwisZones.length)
    ? rwisZones
    : (roadRisk ? buildFallbackZonesFromRoadRisk(roadRisk) : []);

  const rwisByKey = new Map();
  for (const z of effectiveZones) {
    const suffix = z.suffix || extractRwisZoneSuffix(z.id);
    const dir = z.dir || (String(z.id || '').includes('CZE') ? 'E' : String(z.id || '').includes('CZS') ? 'S' : '');
    if (suffix && dir) rwisByKey.set(`${suffix}:${dir}`, z);
  }

  const enriched = RWIS_MASTER.zones.map(zone => {
    const mapInfo = ZONE_INTEGRATION_MAP[zone.suffix] || { county: '', stnIds: [], regionIds: [] };
    const eZone = rwisByKey.get(`${zone.suffix}:E`) || null;
    const sZone = rwisByKey.get(`${zone.suffix}:S`) || null;

    const fsmE = normalizeZoneGrade(eZone?.fsm?.level);
    const fsmS = normalizeZoneGrade(sZone?.fsm?.level);
    const virE = normalizeZoneGrade(eZone?.vir?.level);
    const virS = normalizeZoneGrade(sZone?.vir?.level);

    // 012 도로위험정보(5분 주기 API허브) 보조 확인 및 주의(2)·위험(3) 상향 즉시 반영
    let fallbackIce = null;
    let fallbackFog = null;
    for (const stnId of mapInfo.stnIds) {
      const sr = stnMap.get(String(stnId));
      if (!sr) continue;
      const ice = normalizeZoneGrade(sr.iceLevel);
      const fog = normalizeZoneGrade(sr.fogLevel);
      if (ice !== null) fallbackIce = fallbackIce === null ? ice : Math.max(fallbackIce, ice);
      if (fog !== null) fallbackFog = fallbackFog === null ? fog : Math.max(fallbackFog, fog);
    }

    const mergeIce = (rwisVal) => {
      if (rwisVal === null) return fallbackIce;
      if (fallbackIce !== null && fallbackIce >= 2 && apiHubNotOlder) return Math.max(rwisVal, fallbackIce);
      return rwisVal;
    };
    const rawFsmE = mergeIce(fsmE);
    const rawFsmS = mergeIce(fsmS);
    const rawFsmMax = (rawFsmE === null && rawFsmS === null)
      ? null
      : Math.max(rawFsmE ?? 0, rawFsmS ?? 0);

    const rawVirE = virE ?? fallbackFog;
    const rawVirS = virS ?? fallbackFog;
    const rawVirMax = (rawVirE === null && rawVirS === null)
      ? null
      : Math.max(rawVirE ?? 0, rawVirS ?? 0);

    const levelFsmE = rawFsmE ?? 0;
    const levelFsmS = rawFsmS ?? 0;
    const levelVirE = rawVirE ?? 0;
    const levelVirS = rawVirS ?? 0;

    // 도로기상관측소 실측 노면온도(TR1) / 대기온도 / 노면상태 (보수적으로 최저 노면온도 우선)
    const matchedStations = mapInfo.stnIds.map(id => stnById.get(id)).filter(Boolean);
    let minRoadTemp = null;
    let minAirTemp = null;
    let worstSurface = null;
    let primaryStation = matchedStations[0] || null;

    const sfsSeverity = (code) => ({
      1: 1, 10: 2, 14: 3, 7: 4, 12: 4, 2: 5, 11: 6, 3: 7, 6: 7, 5: 8, 13: 8, 4: 9, 15: 9
    }[Number(code)] || 0);

    for (const s of matchedStations) {
      if (Number.isFinite(s.roadTemp) && (minRoadTemp === null || s.roadTemp < minRoadTemp)) {
        minRoadTemp = s.roadTemp;
        primaryStation = s;
      }
      if (Number.isFinite(s.temp) && (minAirTemp === null || s.temp < minAirTemp)) {
        minAirTemp = s.temp;
      }
      if (s.surfaceState && s.surfaceState !== '관측중') {
        if (!worstSurface || sfsSeverity(s.surfaceCode) > sfsSeverity(worstSurface.code)) {
          worstSurface = { code: s.surfaceCode, label: s.surfaceState };
        }
      }
    }

    // 13개 단기예보 연계 요약
    const matchedRegions = mapInfo.regionIds.map(id => regionById.get(id)).filter(Boolean);
    let fcstMinTemp = null;
    let fcstFirstWet = null;
    let fcstFirstFreeze = null;
    let fcstFirstZeroOrBelow = null;
    let fcstHasOverlap = false;
    for (const r of matchedRegions) {
      if (r.minTemp !== null && (fcstMinTemp === null || r.minTemp < fcstMinTemp)) fcstMinTemp = r.minTemp;
      if (r.firstWet && (!fcstFirstWet || r.firstWet.hour < fcstFirstWet.hour)) fcstFirstWet = r.firstWet;
      if (r.firstFreeze && (!fcstFirstFreeze || r.firstFreeze.hour < fcstFirstFreeze.hour)) fcstFirstFreeze = r.firstFreeze;
      if (r.firstZeroOrBelow && (!fcstFirstZeroOrBelow || r.firstZeroOrBelow.hour < fcstFirstZeroOrBelow.hour)) fcstFirstZeroOrBelow = r.firstZeroOrBelow;
      if (r.firstOverlap) fcstHasOverlap = true;
    }

    return {
      ...zone,
      county: mapInfo.county,
      fsm: {
        E: levelFsmE,
        S: levelFsmS,
        max: Math.max(levelFsmE, levelFsmS),
        rawE: rawFsmE,
        rawS: rawFsmS,
        rawMax: rawFsmMax,
        missing: rawFsmMax === null,
        statusLabel: rawFsmMax === null ? '정보 없음' : (LEVEL_NAME[rawFsmMax] || '안전'),
        hasLive: fsmE !== null || fsmS !== null
      },
      vir: {
        E: levelVirE,
        S: levelVirS,
        max: Math.max(levelVirE, levelVirS),
        rawE: rawVirE,
        rawS: rawVirS,
        rawMax: rawVirMax,
        missing: rawVirMax === null,
        statusLabel: rawVirMax === null ? '정보 없음' : (LEVEL_NAME[rawVirMax] || '안전'),
        hasLive: virE !== null || virS !== null
      },
      roadObs: {
        stationId: primaryStation?.stnId ? String(primaryStation.stnId) : (mapInfo.stnIds[0] || ''),
        stationName: primaryStation?.name || '',
        minRoadTemp,
        minAirTemp,
        surfaceCode: worstSurface?.code ?? primaryStation?.surfaceCode ?? null,
        surfaceState: worstSurface?.label || (primaryStation?.surfaceState && primaryStation.surfaceState !== '관측중' ? primaryStation.surfaceState : ''),
        stations: matchedStations
      },
      shortForecast: {
        regionNames: matchedRegions.map(r => r.name),
        minTemp: fcstMinTemp,
        firstWet: fcstFirstWet,
        firstFreeze: fcstFirstFreeze,
        firstZeroOrBelow: fcstFirstZeroOrBelow,
        hasOverlap: fcstHasOverlap,
        regions: matchedRegions
      }
    };
  });

  // 전체 KPI 요약
  const validRoadTemps = (roadStations || [])
    .filter(s => Number.isFinite(s?.roadTemp))
    .sort((a, b) => a.roadTemp - b.roadTemp);
  const coldestRoadStation = validRoadTemps[0] || null;

  const orderedShort13 = SHORT13_ROUTE_ORDER
    .map(id => regionById.get(id))
    .filter(Boolean);
  for (const [id, r] of regionById.entries()) {
    if (!SHORT13_ROUTE_ORDER.includes(id)) orderedShort13.push(r);
  }

  return {
    zones: enriched,
    coldestRoadStation,
    short13List: orderedShort13,
    short13Summary: {
      total: orderedShort13.length,
      wetCount: orderedShort13.filter(r => Boolean(r.firstWet)).length,
      freezeCount: orderedShort13.filter(r => Boolean(r.firstFreeze)).length,
      overlapCount: orderedShort13.filter(r => Boolean(r.firstOverlap)).length
    }
  };
}

/**
 * 5개 핵심 관할 시·군 특보 조회 목록 (/api/warnings?places=... 1회 일괄 조회)
 */
export const WATCH_WARNING_REGIONS = [
  { id: 'hamyang', name: '함양군', shortName: '함양', lat: 35.520, lon: 127.725 },
  { id: 'geochang', name: '거창군', shortName: '거창', lat: 35.687, lon: 127.910 },
  { id: 'hapcheon', name: '합천군', shortName: '합천', lat: 35.706, lon: 128.168 },
  { id: 'goryeong', name: '고령군', shortName: '고령', lat: 35.728, lon: 128.263 },
  { id: 'dalseong', name: '달성군', shortName: '달성', lat: 35.697, lon: 128.447 }
];

const SIX_HOURS_MS = 6 * 3600 * 1000;

/**
 * KMA 12자리 시각 문자열(YYYYMMDDHHmm, KST)을 epoch ms로 변환
 */
export function parseKmaStampMs(stamp) {
  const s = String(stamp || '').trim();
  if (!/^\d{12}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const mo = Number(s.slice(4, 6)) - 1;
  const d = Number(s.slice(6, 8));
  const h = Number(s.slice(8, 10));
  const mi = Number(s.slice(10, 12));
  return Date.UTC(y, mo, d, h - 9, mi);
}

function formatHmKst(msOrIso) {
  if (!msOrIso) return '';
  if (typeof msOrIso === 'string' && msOrIso.length >= 16 && msOrIso.includes('T')) {
    return msOrIso.slice(11, 16);
  }
  const ms = typeof msOrIso === 'number' ? msOrIso : Date.parse(msOrIso);
  if (!Number.isFinite(ms)) return '';
  const k = new Date(ms + 9 * 3600000);
  return `${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')}`;
}

/**
 * /api/warnings?places=... 응답을 5개 관할 지역 기준으로 정규화
 */
export function extractRegionWarningsMap(warningsPayload) {
  const map = new Map();
  for (const r of WATCH_WARNING_REGIONS) map.set(r.name, []);
  if (!warningsPayload?.items || typeof warningsPayload.items !== 'object') return map;

  for (const item of Object.values(warningsPayload.items)) {
    if (!item) continue;
    const name = String(item.name || '').trim();
    const matched = WATCH_WARNING_REGIONS.find(r => r.name === name || name.includes(r.shortName));
    if (matched) {
      map.set(matched.name, Array.isArray(item.warnings) ? item.warnings : []);
    }
  }
  return map;
}

/**
 * 특보 발효/해제 이력 갱신 (6시간 이내 특보 해제 감지용)
 */
export function updateWarningHistory(prevHistory, warningsPayload, nowMs = Date.now()) {
  const base = (prevHistory && typeof prevHistory === 'object')
    ? prevHistory
    : { activeByRegion: {}, lifted: [] };
  const prevActive = base.activeByRegion && typeof base.activeByRegion === 'object'
    ? base.activeByRegion
    : {};
  const prevLifted = Array.isArray(base.lifted) ? base.lifted : [];

  // 6시간 지난 해제 이력은 정리
  let lifted = prevLifted.filter(x => Number.isFinite(x?.liftedAtMs) && (nowMs - x.liftedAtMs) >= 0 && (nowMs - x.liftedAtMs) <= SIX_HOURS_MS);

  // warningsConfirmed === true 일 때만 해제 판정(오탐 방지)
  if (!warningsPayload?.ok || !warningsPayload?.warningsConfirmed) {
    return { activeByRegion: prevActive, lifted };
  }

  const byRegion = extractRegionWarningsMap(warningsPayload);
  const nextActive = {};

  for (const reg of WATCH_WARNING_REGIONS) {
    const curList = byRegion.get(reg.name) || [];
    const curByTitle = new Map();
    for (const w of curList) {
      const title = String(w?.title || `${w?.kind || ''}${w?.level || ''}`).trim();
      if (!title) continue;
      curByTitle.set(title, {
        title,
        kind: w?.kind || '',
        level: w?.level || '',
        tmFc: w?.tmFc || '',
        tmEf: w?.tmEf || ''
      });
    }

    const oldList = Array.isArray(prevActive[reg.name]) ? prevActive[reg.name] : [];
    for (const oldW of oldList) {
      const t = String(oldW?.title || '').trim();
      if (!t) continue;
      if (!curByTitle.has(t)) {
        // 기존 발효 중이던 특보가 해제됨!
        const dup = lifted.some(x => x.regionName === reg.name && x.title === t && (nowMs - x.liftedAtMs) < 30 * 60 * 1000);
        if (!dup) {
          lifted.push({
            regionName: reg.name,
            shortName: reg.shortName,
            title: t,
            kind: oldW.kind || '',
            level: oldW.level || '',
            liftedAtMs: nowMs
          });
        }
      }
    }

    nextActive[reg.name] = [...curByTitle.values()];
  }

  return { activeByRegion: nextActive, lifted };
}

/**
 * 5개 지역 특보 카드 묶음 규칙:
 *  - 1개 지역: 1장 단독 카드
 *  - 2개 지역: 각각 1장씩 2장 카드
 *  - 3개 이상 지역: 1장의 묶음 카드로 통합
 */
function expandWarningGroupByCount(entries, buildSingle, buildMerged) {
  if (!entries.length) return [];
  if (entries.length === 1) return [buildSingle(entries[0])];
  if (entries.length === 2) return [buildSingle(entries[0]), buildSingle(entries[1])];
  return [buildMerged(entries)];
}

function summarizeRegionNames(names, maxShow = 4) {
  if (!names.length) return '';
  if (names.length <= maxShow) return names.join('·');
  return `${names.slice(0, maxShow).join('·')} 외 ${names.length - maxShow}곳`;
}

/**
 * 13개소 6시간 단기예보 표 + 24시간 요약 데이터 정렬
 */
export function alignShortTerm6hMatrix(shortTerm13) {
  const rawRegions = Array.isArray(shortTerm13?.regions) ? shortTerm13.regions : [];
  if (!rawRegions.length) return { headerHours: [], rows: [] };

  const byId = new Map(rawRegions.map(r => [String(r.id), r]));
  const ordered = SHORT13_ROUTE_ORDER.map(id => byId.get(id)).filter(Boolean);
  for (const r of rawRegions) {
    if (!SHORT13_ROUTE_ORDER.includes(String(r.id))) ordered.push(r);
  }

  const colMap = new Map();
  for (const r of ordered) {
    for (const h of r?.hours || []) {
      const k = String(h?.time || '').slice(0, 13);
      if (k && !colMap.has(k)) colMap.set(k, h);
    }
  }
  const allCols = [...colMap.values()].sort((a, b) => String(a.time).localeCompare(String(b.time)));
  const startMs = Date.parse(ordered.find(r => r.windowStart)?.windowStart || allCols[0]?.time || '');
  const headerHours = Number.isFinite(startMs)
    ? allCols.filter(h => Date.parse(h.time) < startMs + 6 * 3600000).slice(0, 6)
    : allCols.slice(0, 6);

  const summarizeSlice = (slice) => {
    let minTemp = null, maxTemp = null, maxPop = 0;
    let wetHours = 0, freezingHours = 0, overlapHours = 0;
    let firstWetTime = null, firstFreezingTime = null, firstOverlapTime = null;
    let maxRainMm = 0, maxSnowCm = 0, hasSnow = false, hasSleet = false;
    for (const h of slice) {
      if (!h) continue;
      if (Number.isFinite(h.temp)) {
        minTemp = minTemp === null ? h.temp : Math.min(minTemp, h.temp);
        maxTemp = maxTemp === null ? h.temp : Math.max(maxTemp, h.temp);
      }
      if (Number.isFinite(h.pop)) maxPop = Math.max(maxPop, h.pop);
      const isFrz = Number.isFinite(h.temp) && h.temp < 0;
      const isWet = Boolean(h.wet);
      if (isWet) {
        wetHours++;
        if (!firstWetTime) firstWetTime = h.time;
        if (Number.isFinite(h.rainMm)) maxRainMm = Math.max(maxRainMm, h.rainMm);
        if (Number.isFinite(h.snowCm)) maxSnowCm = Math.max(maxSnowCm, h.snowCm);
        const pty = String(h.pty || '0');
        if (pty === '3' || pty === '7' || h.snowCm > 0) hasSnow = true;
        else if (pty === '2' || pty === '6') hasSleet = true;
      }
      if (isFrz) {
        freezingHours++;
        if (!firstFreezingTime) firstFreezingTime = h.time;
      }
      if (isWet && isFrz) {
        overlapHours++;
        if (!firstOverlapTime) firstOverlapTime = h.time;
      }
    }
    return {
      minTemp, maxTemp, maxPop,
      wetHours, freezingHours, overlapHours,
      firstWetTime, firstFreezingTime, firstOverlapTime,
      maxRainMm, maxSnowCm, hasSnow, hasSleet
    };
  };

  const rows = ordered.map((r, idx) => {
    const rMap = new Map();
    for (const h of r?.hours || []) {
      const k = String(h?.time || '').slice(0, 13);
      if (k) rMap.set(k, h);
    }
    const cells6 = headerHours.map(c => rMap.get(String(c.time).slice(0, 13)) || null);
    const hours24 = (r?.hours || []).filter(h => {
      if (!Number.isFinite(startMs)) return true;
      const t = Date.parse(h?.time || '');
      return Number.isFinite(t) && t >= startMs - 60000 && t < startMs + 24 * 3600000;
    }).slice(0, 24);
    const hours6 = cells6.filter(Boolean);
    return {
      region: r,
      routeIndex: idx + 1,
      cells6,
      sum6: summarizeSlice(hours6),
      sum24: summarizeSlice(hours24.length ? hours24 : hours6)
    };
  });

  return { headerHours, rows };
}

// 관할(95~176k) vs 서쪽 선행지표(50~86k) 도로기상관측소 메타
const CORRIDOR_STN_IDS = new Set(['14206', '14409', '14207', '14208', '14209', '14103', '14410']);
const WEST_LEAD_STN_IDS = new Set(['14205', '14407', '14102', '14408']);
const STN_TO_REGION_IDS = {
  '14206': ['hamyang', 'jigok'],
  '14409': ['sudong'],
  '14207': ['namsang'],
  '14208': ['gajo', 'geochang'],
  '14209': ['daegaya', 'seongsan'],
  '14103': ['okpo', 'seongsan'],
  '14410': ['okpo'],
  '14205': ['hamyang'],
  '14407': ['hamyang'],
  '14102': ['hamyang'],
  '14408': ['hamyang']
};

/**
 * 실측 도로기상관측소(TR1·기온·노면상태) + 012 도로위험 + 단기예보 기반
 * 한국도로공사 [예비살포 조건 도달] 자동 판정
 * - 기준 1: 실측 결빙·적설(surfaceCode 5·6) 또는 서리(4)+노면≤2℃
 * - 기준 2: 대기 ≤ 4℃(미측정 시 허용) & 노면(TR1) ≤ 2℃ & 습윤/강수/안개/결빙 우려(노면 습윤·강수·012 주의 이상·2h내 강수시작)
 * - 기준 3: 새벽(00~08시 KST) 영하→0℃ 상승 어는비 우려 + 노면 ≤ 2℃
 */
export function evaluateMeasuredPresaltAlerts({ roadStations = [], roadRisk = null, shortTerm13 = null, nowMs = Date.now() } = {}) {
  const corridorHits = [];
  const westLeadHits = [];
  if (!Array.isArray(roadStations) || !roadStations.length) {
    return { corridorHits, westLeadHits };
  }

  const kstHour = new Date(nowMs + 9 * 3600000).getUTCHours();
  const isDawnWindow = kstHour >= 0 && kstHour <= 8;
  const stnMap = indexStationRisks(roadRisk);
  const regionMap = new Map((shortTerm13?.regions || []).map(r => [String(r.id), r]));

  for (const s of roadStations) {
    if (!s?.stnId) continue;
    const id = String(s.stnId);
    const isCorridor = CORRIDOR_STN_IDS.has(id);
    const isWestLead = WEST_LEAD_STN_IDS.has(id);
    if (!isCorridor && !isWestLead) continue;

    const tr = Number.isFinite(s.roadTemp) ? s.roadTemp : null;
    const ta = Number.isFinite(s.temp) ? s.temp : null;
    const sc = Number.isFinite(s.surfaceCode) ? s.surfaceCode : Number(s.surfaceCode || 0);
    const sr = stnMap.get(id) || null;
    const iceLv = normalizeZoneGrade(sr?.iceLevel) ?? 0;
    const fogLv = normalizeZoneGrade(sr?.fogLevel) ?? 0;

    // 인접 13개소 예보에서 향후 2시간 내 강수 시작 / 새벽 영하→0℃ 어는비 여부 확인
    const nearRegions = (STN_TO_REGION_IDS[id] || []).map(rid => regionMap.get(rid)).filter(Boolean);
    let rainSoon = false;
    let dawnFreezingRain = false;
    for (const r of nearRegions) {
      const hrs = Array.isArray(r.hours) ? r.hours : [];
      const h0 = hrs[0], h1 = hrs[1], h2 = hrs[2];
      if (h0?.wet || h1?.wet || h2?.wet) rainSoon = true;
      if (isDawnWindow && h0 && h1) {
        const warmingNearZero =
          Number.isFinite(h0.temp) && Number.isFinite(h1.temp) &&
          h0.temp < 0 && h1.temp >= h0.temp && h1.temp <= 1.5;
        if (warmingNearZero && (h0.wet || h1.wet)) dawnFreezingRain = true;
      }
    }

    const isMoistSfs = [2, 3, 4, 5, 6, 7, 11, 12, 13, 14, 15].includes(sc);
    const wetOrPrecip = isMoistSfs || (Number.isFinite(s.dayPrecip) && s.dayPrecip > 0) || rainSoon;
    const riskHigh = iceLv >= 2 || fogLv >= 2;
    const airOk = ta === null || ta <= 4.0;
    const roadCold = tr !== null && tr <= 2.0;

    let reason = '';
    let severity = 0; // 2=crit(결빙/적설 또는 노면≤0.5), 1=warn(예비살포)

    if (sc === 4 || sc === 15) {
      reason = sc === 15 ? '실측 눈·결빙 감지' : '실측 결빙 감지';
      severity = 2;
    } else if (sc === 3 || sc === 6) {
      reason = '실측 적설·슬러시';
      severity = 2;
    } else if ((sc === 5 || sc === 13) && (tr === null || roadCold)) {
      reason = sc === 13 ? '노면 임계습윤·≤2℃' : '노면 서리·≤2℃';
      severity = 2;
    } else if (dawnFreezingRain && roadCold) {
      reason = '새벽(00~08시) 어는비 우려';
      severity = 2;
    } else if (roadCold && airOk && (wetOrPrecip || riskHigh)) {
      reason = isMoistSfs ? `노면 ${s.surfaceState || '습윤'}·≤2℃` : rainSoon ? '노면≤2℃·강수임박' : '노면≤2℃·012위험';
      severity = tr <= 0.5 || iceLv >= 3 ? 2 : 1;
    }

    if (!reason) continue;

    const hit = {
      stnId: id,
      name: String(s.name || id).replace(/\(도\)$/, ''),
      roadTemp: tr,
      airTemp: ta,
      surfaceCode: sc,
      surfaceState: s.surfaceState && s.surfaceState !== '관측중' ? s.surfaceState : '',
      reason,
      severity
    };
    if (isCorridor) corridorHits.push(hit);
    else westLeadHits.push(hit);
  }

  const byColdest = (a, b) => (a.roadTemp ?? 99) - (b.roadTemp ?? 99);
  corridorHits.sort(byColdest);
  westLeadHits.sort(byColdest);
  return { corridorHits, westLeadHits };
}

/**
 * 상단 [특이사항 속보] 카드 생성 (실측 예비살포 + 24시간 이내 특이사항 + 5개 지역 특보 묶음 규칙)
 * - 최우선: 실측 도로관측 기반 예비살포 조건 도달 (관할 95~176k & 서쪽 선행 50~86k)
 * - 6시간 이내: 강수+영하 겹침 / 주의보·경보 발표 / 특보 발효 해제 / 강우·강설 예고 / 영하 진입
 * - 6~24시간 이내 예고: 야간/익일 결빙·강수·영하 진입 미리 알림
 * - 5개 지역 특보 묶음: 1개 지역=1장, 2개 지역=각각 2장, 3개 이상=1장 묶음
 */
export function buildSpecialBulletinCards({
  shortTerm13 = null,
  warningsPayload = null,
  warningHistory = null,
  roadStations = [],
  roadRisk = null,
  enrichedZones = [],
  nowMs = Date.now()
} = {}) {
  const cards = [];

  // 0-A. 한국도로공사 공식 대응기준: 고령지사 감시구간(95.0~176.0k) 도로살얼음 주의(2)·위험(3) 격상 최우선 속보
  const stnMap = indexStationRisks(roadRisk);
  const stnObsById = new Map((roadStations || []).map(s => [String(s?.stnId || ''), s]));
  const escalatedZones = [];
  if (Array.isArray(enrichedZones) && enrichedZones.length) {
    for (const z of enrichedZones) {
      const lv = normalizeZoneGrade(z?.fsm?.rawMax ?? z?.fsm?.max);
      if (lv !== null && lv >= 2) {
        escalatedZones.push({
          name: String(z.name || '').replace('–', '↔'),
          level: lv,
          roadTemp: Number.isFinite(z.roadObs?.minRoadTemp) ? z.roadObs.minRoadTemp : null,
          airTemp: Number.isFinite(z.roadObs?.minAirTemp) ? z.roadObs.minAirTemp : null,
          surfaceState: z.roadObs?.surfaceState || ''
        });
      }
    }
  } else {
    for (const stnId of CORRIDOR_STN_IDS) {
      const sr = stnMap.get(stnId);
      const lv = normalizeZoneGrade(sr?.iceLevel);
      if (lv !== null && lv >= 2) {
        const obs = stnObsById.get(stnId);
        escalatedZones.push({
          name: String(sr?.name || obs?.name || stnId).replace(/\(도\)$/, ''),
          level: lv,
          roadTemp: Number.isFinite(obs?.roadTemp) ? obs.roadTemp : null,
          airTemp: Number.isFinite(obs?.temp) ? obs.temp : null,
          surfaceState: obs?.surfaceState && obs.surfaceState !== '관측중' ? obs.surfaceState : ''
        });
      }
    }
  }
  if (escalatedZones.length) {
    escalatedZones.sort((a, b) => (b.level - a.level) || ((a.roadTemp ?? 99) - (b.roadTemp ?? 99)));
    const maxEscLv = escalatedZones[0].level;
    const topZ = escalatedZones[0];
    const names = summarizeRegionNames(escalatedZones.map(z => z.name), 3);
    const metaBits = [];
    if (topZ.airTemp !== null) metaBits.push(`대기 ${topZ.airTemp.toFixed(1)}°C`);
    if (topZ.roadTemp !== null) metaBits.push(`노면 ${topZ.roadTemp.toFixed(1)}°C`);
    if (topZ.surfaceState) metaBits.push(topZ.surfaceState);
    const metaStr = metaBits.length ? ` (${metaBits.join(' · ')})` : '';
    if (maxEscLv >= 3) {
      cards.push({
        id: 'kec-ice-escalation-danger',
        category: 'kec-ice-escalation',
        priority: 1,
        tone: 'crit',
        icon: '🚨',
        badge: '도로살얼음 위험 격상',
        title: `도로살얼음 위험정보 위험 격상 · 예비살포 실시`,
        detail: `${names}${metaStr} · 선(先)예비살포, 후(後)상황판단회의`,
        count: escalatedZones.length,
        regions: escalatedZones.map(z => z.name)
      });
    } else {
      cards.push({
        id: 'kec-ice-escalation-caution',
        category: 'kec-ice-escalation',
        priority: 2,
        tone: 'warn',
        icon: '⬆',
        badge: '도로살얼음 주의 격상',
        title: `도로살얼음 위험정보 주의 격상 · 온도·노면 확인 후 예비살포`,
        detail: `${names}${metaStr} · 고정식 기상정보 확인 후 예비살포 실시`,
        count: escalatedZones.length,
        regions: escalatedZones.map(z => z.name)
      });
    }
  }

  // 0. 실측 도로기상관측소 기반 [예비살포 조건 도달] 카드 (관할 95~176k + 서쪽 선행 50~86k)
  const presalt = evaluateMeasuredPresaltAlerts({ roadStations, roadRisk, shortTerm13, nowMs });
  if (presalt.corridorHits.length) {
    const top = presalt.corridorHits[0];
    const hasCrit = presalt.corridorHits.some(h => h.severity >= 2);
    const names = summarizeRegionNames(presalt.corridorHits.map(h => h.name), 3);
    const trStr = top.roadTemp !== null ? `노면 ${top.roadTemp.toFixed(1)}°C` : '';
    const taStr = top.airTemp !== null ? `대기 ${top.airTemp.toFixed(1)}°C` : '';
    const tempMeta = [trStr, taStr, top.reason].filter(Boolean).join(' · ');
    cards.push({
      id: 'measured-presalt-corridor',
      category: 'measured-presalt',
      priority: 3,
      tone: hasCrit ? 'crit' : 'warn',
      icon: '🧂',
      badge: '실측 제설판단',
      title: presalt.corridorHits.length === 1
        ? `예비살포 조건 도달 · ${top.name}`
        : `예비살포 조건 도달 · ${presalt.corridorHits.length}개소`,
      detail: `${names} (${tempMeta}) · 예비살포 지시 검토`,
      count: presalt.corridorHits.length,
      regions: presalt.corridorHits.map(h => h.name)
    });
  }
  if (presalt.westLeadHits.length) {
    const top = presalt.westLeadHits[0];
    const names = summarizeRegionNames(presalt.westLeadHits.map(h => h.name), 3);
    const trStr = top.roadTemp !== null ? `노면 ${top.roadTemp.toFixed(1)}°C` : '';
    const taStr = top.airTemp !== null ? `대기 ${top.airTemp.toFixed(1)}°C` : '';
    const tempMeta = [trStr, taStr, top.reason].filter(Boolean).join(' · ');
    cards.push({
      id: 'measured-presalt-westlead',
      category: 'measured-presalt-west',
      priority: 7,
      tone: 'warn',
      icon: '🧂',
      badge: '서쪽 선행(50~86k)',
      title: `서쪽 선행구간 결빙·예비살포 감지 · ${presalt.westLeadHits.length}개소`,
      detail: `${names} (${tempMeta}) · 서→동 유입 대비`,
      count: presalt.westLeadHits.length,
      regions: presalt.westLeadHits.map(h => h.name)
    });
  }

  // 1. 5개 관할 지역 기상특보 발표 / 발효 중
  const warnByRegion = extractRegionWarningsMap(warningsPayload);
  const activeGroups = new Map();
  for (const reg of WATCH_WARNING_REGIONS) {
    const list = warnByRegion.get(reg.name) || [];
    for (const w of list) {
      const title = String(w?.title || `${w?.kind || ''}${w?.level || ''}`).trim();
      if (!title) continue;
      const fcMs = parseKmaStampMs(w.tmFc);
      const efMs = parseKmaStampMs(w.tmEf);
      const recentFc = Number.isFinite(fcMs) && (nowMs - fcMs) >= -60000 && (nowMs - fcMs) <= SIX_HOURS_MS;
      const soonEf = Number.isFinite(efMs) && efMs >= nowMs && (efMs - nowMs) <= SIX_HOURS_MS;
      const isWithin6h = recentFc || soonEf;
      const groupKey = `${title}|${isWithin6h ? '6h' : 'active'}`;
      if (!activeGroups.has(groupKey)) activeGroups.set(groupKey, []);
      activeGroups.get(groupKey).push({
        regionName: reg.name,
        shortName: reg.shortName,
        title,
        level: w.level || '',
        kind: w.kind || '',
        isWithin6h,
        announcedText: w.announcedText || (fcMs ? formatHmKst(fcMs) : ''),
        effectiveText: w.effectiveText || (efMs ? formatHmKst(efMs) : '')
      });
    }
  }

  for (const entries of activeGroups.values()) {
    const first = entries[0];
    const isSevere = first.level === '경보';
    const tone = isSevere ? 'crit' : first.level === '주의보' ? 'warn' : 'info';
    const badge = first.isWithin6h ? '6h 특보 발표' : '특보 발효 중';
    const expanded = expandWarningGroupByCount(
      entries,
      (e) => ({
        id: `warn-${e.title}-${e.regionName}`,
        category: 'warning-issued',
        priority: (e.isWithin6h ? 10 : 20) + (isSevere ? 0 : 2),
        tone,
        icon: isSevere ? '🚨' : '⚠️',
        badge,
        title: `${e.title} · ${e.regionName}`,
        detail: e.effectiveText ? `발효 ${e.effectiveText}` : (e.announcedText ? `발표 ${e.announcedText}` : '기상특보 발효 중'),
        count: 1,
        regions: [e.regionName]
      }),
      (list) => ({
        id: `warn-${first.title}-merged`,
        category: 'warning-issued',
        priority: (first.isWithin6h ? 10 : 20) + (isSevere ? 0 : 2),
        tone,
        icon: isSevere ? '🚨' : '⚠️',
        badge,
        title: `${first.title} · ${list.length === WATCH_WARNING_REGIONS.length ? '전 구간 5개 지역' : `${list.length}개 지역`}`,
        detail: `${list.map(x => x.shortName).join('·')}${first.effectiveText ? ` · 발효 ${first.effectiveText}` : ''}`,
        count: list.length,
        regions: list.map(x => x.regionName)
      })
    );
    cards.push(...expanded);
  }

  // 2. 6시간 이내 특보 발효 해제 (5개 지역 묶음 규칙 동일 적용)
  const liftedRaw = (warningHistory?.lifted || []).filter(
    x => Number.isFinite(x?.liftedAtMs) && (nowMs - x.liftedAtMs) >= 0 && (nowMs - x.liftedAtMs) <= SIX_HOURS_MS
  );
  const liftedGroups = new Map();
  for (const item of liftedRaw) {
    const key = String(item.title || '').trim();
    if (!key) continue;
    if (!liftedGroups.has(key)) liftedGroups.set(key, []);
    // 같은 지역 중복 제거
    if (!liftedGroups.get(key).some(x => x.regionName === item.regionName)) {
      liftedGroups.get(key).push(item);
    }
  }
  for (const entries of liftedGroups.values()) {
    const first = entries[0];
    const liftHm = formatHmKst(Math.max(...entries.map(x => x.liftedAtMs)));
    const expanded = expandWarningGroupByCount(
      entries,
      (e) => ({
        id: `lifted-${e.title}-${e.regionName}`,
        category: 'warning-lifted',
        priority: 32,
        tone: 'clear',
        icon: '✅',
        badge: '6h 특보 해제',
        title: `${e.title} 해제 · ${e.regionName}`,
        detail: `${formatHmKst(e.liftedAtMs)} 해제 확인 · 대기 차량 복귀 검토`,
        count: 1,
        regions: [e.regionName]
      }),
      (list) => ({
        id: `lifted-${first.title}-merged`,
        category: 'warning-lifted',
        priority: 32,
        tone: 'clear',
        icon: '✅',
        badge: '6h 특보 해제',
        title: `${first.title} 해제 · ${list.length === WATCH_WARNING_REGIONS.length ? '전 구간 5개 지역' : `${list.length}개 지역`}`,
        detail: `${list.map(x => x.shortName).join('·')} · ${liftHm} 해제 · 복귀 검토`,
        count: list.length,
        regions: list.map(x => x.regionName)
      })
    );
    cards.push(...expanded);
  }

  // 3. 13개소 단기예보 (6시간 이내 우선 + 24시간 이내 예고, 같은 유형끼리 묶음)
  const matrix = alignShortTerm6hMatrix(shortTerm13);
  const rows = matrix.rows;
  if (rows.length) {
    // 3-A. 6시간 이내 강수+영하 동시 겹침 (결빙 최우선)
    const ov6 = rows.filter(x => x.sum6.overlapHours > 0);
    if (ov6.length) {
      const earliest = ov6.map(x => x.sum6.firstOverlapTime).filter(Boolean).sort()[0];
      cards.push({
        id: 'fcst-overlap-6h',
        category: 'overlap-6h',
        priority: 5,
        tone: 'crit',
        icon: '🚨',
        badge: '6h 결빙 겹침',
        title: `강수+영하 동시 겹침 · ${ov6.length}개소`,
        detail: `${summarizeRegionNames(ov6.map(x => x.region.name))} · 최초 ${formatHmKst(earliest)}~`,
        count: ov6.length,
        regions: ov6.map(x => x.region.name)
      });
    }

    // 3-B. 6시간 이내 강우/강설 예고
    const wet6 = rows.filter(x => x.sum6.wetHours > 0);
    if (wet6.length) {
      const earliest = wet6.map(x => x.sum6.firstWetTime).filter(Boolean).sort()[0];
      const hasSnow = wet6.some(x => x.sum6.hasSnow);
      const hasSleet = wet6.some(x => x.sum6.hasSleet);
      const pType = hasSnow ? '강설' : hasSleet ? '비·눈' : '강우';
      const maxMm = Math.max(...wet6.map(x => x.sum6.maxRainMm || 0));
      const maxCm = Math.max(...wet6.map(x => x.sum6.maxSnowCm || 0));
      const amtTxt = maxCm > 0 ? ` · 최대 ${maxCm}cm` : maxMm > 0 ? ` · 최대 ${maxMm.toFixed(1)}mm` : '';
      cards.push({
        id: 'fcst-wet-6h',
        category: 'wet-6h',
        priority: 15,
        tone: hasSnow ? 'warn' : 'wet',
        icon: hasSnow ? '🌨️' : '🌧️',
        badge: '6h 이내 강수',
        title: `6시간 이내 ${pType} 예고 · ${wet6.length}개소`,
        detail: `${summarizeRegionNames(wet6.map(x => x.region.name))} · ${formatHmKst(earliest)}~${amtTxt}`,
        count: wet6.length,
        regions: wet6.map(x => x.region.name)
      });
    }

    // 3-C. 6시간 이내 영하 진입
    const frz6 = rows.filter(x => x.sum6.freezingHours > 0);
    if (frz6.length) {
      const earliest = frz6.map(x => x.sum6.firstFreezingTime).filter(Boolean).sort()[0];
      const minT = Math.min(...frz6.map(x => x.sum6.minTemp).filter(Number.isFinite));
      cards.push({
        id: 'fcst-freeze-6h',
        category: 'freeze-6h',
        priority: 18,
        tone: 'freeze',
        icon: '❄️',
        badge: '6h 이내 영하',
        title: `6시간 이내 영하 진입 · ${frz6.length}개소`,
        detail: `${summarizeRegionNames(frz6.map(x => x.region.name))} · ${formatHmKst(earliest)}↓ · 최저 ${minT}°C`,
        count: frz6.length,
        regions: frz6.map(x => x.region.name)
      });
    }

    // 3-D. 6~24시간 이내 예고 (6시간 내 이미 발령된 동일 유형이 없을 때 24시간 특이사항으로 표출)
    const ov24 = rows.filter(x => x.sum24.overlapHours > 0);
    if (!ov6.length && ov24.length) {
      const earliest = ov24.map(x => x.sum24.firstOverlapTime).filter(Boolean).sort()[0];
      cards.push({
        id: 'fcst-overlap-24h',
        category: 'overlap-24h',
        priority: 40,
        tone: 'warn',
        icon: '⚠️',
        badge: '24h 결빙 예고',
        title: `24시간 이내 강수+영하 겹침 · ${ov24.length}개소`,
        detail: `${summarizeRegionNames(ov24.map(x => x.region.name))} · 최초 ${formatHmKst(earliest)}~`,
        count: ov24.length,
        regions: ov24.map(x => x.region.name)
      });
    }

    const wet24 = rows.filter(x => x.sum24.wetHours > 0);
    if (!wet6.length && wet24.length) {
      const earliest = wet24.map(x => x.sum24.firstWetTime).filter(Boolean).sort()[0];
      const hasSnow = wet24.some(x => x.sum24.hasSnow);
      const pType = hasSnow ? '강설' : '강수';
      cards.push({
        id: 'fcst-wet-24h',
        category: 'wet-24h',
        priority: 45,
        tone: 'info',
        icon: hasSnow ? '🌨️' : '🌧️',
        badge: '24h 이내 강수',
        title: `24시간 이내 ${pType} 예고 · ${wet24.length}개소`,
        detail: `${summarizeRegionNames(wet24.map(x => x.region.name))} · 최초 ${formatHmKst(earliest)}~`,
        count: wet24.length,
        regions: wet24.map(x => x.region.name)
      });
    }

    const frz24 = rows.filter(x => x.sum24.freezingHours > 0);
    if (!frz6.length && frz24.length) {
      const earliest = frz24.map(x => x.sum24.firstFreezingTime).filter(Boolean).sort()[0];
      const minT = Math.min(...frz24.map(x => x.sum24.minTemp).filter(Number.isFinite));
      cards.push({
        id: 'fcst-freeze-24h',
        category: 'freeze-24h',
        priority: 50,
        tone: 'cold',
        icon: '❄️',
        badge: '24h 이내 영하',
        title: `24시간 이내 영하 진입 · ${frz24.length}개소`,
        detail: `${summarizeRegionNames(frz24.map(x => x.region.name))} · 최초 ${formatHmKst(earliest)}↓ · 최저 ${minT}°C`,
        count: frz24.length,
        regions: frz24.map(x => x.region.name)
      });
    }
  }

  return cards.sort((a, b) => a.priority - b.priority);
}

/* ───────────────────── Phase P2.5: 6h 실측 + 2h 예측 인라인 스파크라인 엔진 ───────────────────── */
function clampNum(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

function extractShortTermNearDelta(shortTerm13, regionIds = [], nowMs = Date.now()) {
  const allRegions = Array.isArray(shortTerm13?.regions) ? shortTerm13.regions : [];
  const matched = regionIds
    .map(id => allRegions.find(r => r && r.id === id))
    .filter(r => r && Array.isArray(r.hours) && r.hours.length);
  if (!matched.length) return { fcst0: null, fcst1: null, fcst2: null, dTa1: null, dTa2: null };

  const curHourMs = Math.floor(nowMs / 3600000) * 3600000;
  const pickTempAtOffset = (hours, targetHoursAhead) => {
    const targetMs = curHourMs + targetHoursAhead * 3600000;
    let best = null;
    let bestDiff = Infinity;
    for (const h of hours) {
      const t = Number(h?.temp);
      if (!Number.isFinite(t)) continue;
      const hMs = Date.parse(h?.time || '');
      if (Number.isFinite(hMs)) {
        const diff = Math.abs(hMs - targetMs);
        if (diff <= 45 * 60000 && diff < bestDiff) {
          best = t;
          bestDiff = diff;
        }
      }
    }
    if (best !== null) return best;
    const fallback = hours[targetHoursAhead];
    return fallback && Number.isFinite(Number(fallback.temp)) ? Number(fallback.temp) : null;
  };

  const avgAt = (off) => {
    const vals = matched.map(r => pickTempAtOffset(r.hours, off)).filter(v => v !== null);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const fcst0 = avgAt(0);
  const fcst1 = avgAt(1);
  const fcst2 = avgAt(2);
  return {
    fcst0: fcst0 !== null ? round1(fcst0) : null,
    fcst1: fcst1 !== null ? round1(fcst1) : null,
    fcst2: fcst2 !== null ? round1(fcst2) : null,
    dTa1: (fcst0 !== null && fcst1 !== null) ? round1(fcst1 - fcst0) : null,
    dTa2: (fcst0 !== null && fcst2 !== null) ? round1(fcst2 - fcst0) : null
  };
}

function estimateRecentHourlySlope(points = []) {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  // 최근 1.2h ~ 3.5h 사이에서 2.0h에 가장 가까운 기준점을 우선 선택해 단발 잡음을 완화
  let bestAnchor = null;
  let bestScore = Infinity;
  for (let i = points.length - 2; i >= 0; i--) {
    const dtHours = (last.ms - points[i].ms) / 3600000;
    if (dtHours < 0.4) continue;
    if (dtHours >= 1.2 && dtHours <= 3.5) {
      const score = Math.abs(dtHours - 2.0);
      if (score < bestScore) {
        bestScore = score;
        bestAnchor = points[i];
      }
    }
  }
  if (!bestAnchor) {
    for (let i = points.length - 2; i >= 0; i--) {
      if ((last.ms - points[i].ms) >= 0.4 * 3600000) {
        bestAnchor = points[i];
        break;
      }
    }
  }
  if (!bestAnchor) return null;
  const dtHours = (last.ms - bestAnchor.ms) / 3600000;
  if (dtHours <= 0) return null;
  return clampNum((last.v - bestAnchor.v) / dtHours, -3.5, 3.5);
}

/**
 * 1개 구간의 노면온도(TR1) · 기온(TA) 6시간 실측 + 2시간 예측 시계열을 계산한다.
 * - 6h 실측: /api/road-obs-trend 관측소 이력 + 최신 실황 값(curVal) 동기화
 * - +2h 예측: 기온은 단기예보(+1h, +2h) 변화량 반영, 노면은 단기예보 ΔTA + 최근 노면 냉각/상승 기울기 결합
 */
export function buildZoneTempTrendSeries({ zone, roadTrend = null, shortTerm13 = null, nowMs = Date.now() } = {}) {
  const mapInfo = ZONE_INTEGRATION_MAP[zone?.suffix] || { stnIds: [], regionIds: [] };
  const trendStations = roadTrend?.stations || {};
  const trendTimes = Array.isArray(roadTrend?.times) ? roadTrend.times : [];
  const candidateIds = [...new Set([zone?.roadObs?.stationId, ...(mapInfo.stnIds || [])].filter(Boolean).map(String))];
  const hasAnyFinite = (arr) => Array.isArray(arr) && arr.some(Number.isFinite);
  const trStnId = candidateIds.find(id => hasAnyFinite(trendStations[id]?.tr))
    || candidateIds.find(id => trendStations[id])
    || candidateIds[0]
    || '';
  // 교량 결빙감시 관측소(죽산천교 14409, 논공교 14410 등)는 TR1만 있고 TA가 null이므로 동일 구간의 기온 보유 관측소(남상졸음 14207, 논공휴 14103)로 자동 보완
  const taStnId = candidateIds.find(id => hasAnyFinite(trendStations[id]?.ta)) || trStnId;
  const trStnSeries = trStnId ? trendStations[trStnId] : null;
  const taStnSeries = taStnId ? trendStations[taStnId] : null;

  const hoursWindow = Math.max(1, Number(roadTrend?.hours) || 6);
  const windowMs = hoursWindow * 3600000;

  const parsedTimes = trendTimes.map(iso => Date.parse(iso));
  const validTimeMs = parsedTimes.filter(Number.isFinite);
  const endMs = validTimeMs.length ? Math.max(validTimeMs[validTimeMs.length - 1], nowMs - 5 * 60000) : nowMs;
  const startMs = endMs - windowMs;

  const buildObs = (rawArr, liveCur) => {
    const pts = [];
    if (Array.isArray(rawArr) && rawArr.length) {
      for (let i = 0; i < rawArr.length; i++) {
        const v = rawArr[i];
        const ms = parsedTimes[i];
        if (!Number.isFinite(v) || !Number.isFinite(ms)) continue;
        if (ms < startMs - 15 * 60000) continue;
        const ratio = clampNum((ms - startMs) / windowMs, 0, 1);
        pts.push({ ratio, ms, v: round1(v) });
      }
    }
    if (Number.isFinite(liveCur)) {
      const roundedLive = round1(liveCur);
      if (pts.length && (endMs - pts[pts.length - 1].ms) <= 12 * 60000) {
        pts[pts.length - 1] = { ratio: 1, ms: endMs, v: roundedLive };
      } else {
        pts.push({ ratio: 1, ms: endMs, v: roundedLive });
      }
    }
    return pts;
  };

  const liveTr = Number.isFinite(zone?.roadObs?.minRoadTemp) ? zone.roadObs.minRoadTemp : null;
  const liveTa = Number.isFinite(zone?.roadObs?.minAirTemp) ? zone.roadObs.minAirTemp : null;
  const obsTr = buildObs(trStnSeries?.tr, liveTr);
  const obsTa = buildObs(taStnSeries?.ta, liveTa);

  const fcstDelta = extractShortTermNearDelta(shortTerm13, mapInfo.regionIds || [], nowMs);
  const slopeTr = estimateRecentHourlySlope(obsTr);
  const slopeTa = estimateRecentHourlySlope(obsTa);

  const curTr = obsTr.length ? obsTr[obsTr.length - 1].v : liveTr;
  const curTa = obsTa.length ? obsTa[obsTa.length - 1].v : liveTa;

  // 기온(TA) +1h, +2h 예측 (실측 기준점 보정)
  const predTa = [];
  if (curTa !== null) {
    let p1 = null;
    let p2 = null;
    if (fcstDelta.dTa1 !== null) {
      p1 = round1(curTa + clampNum(fcstDelta.dTa1, -5.0, 5.0));
      const d2 = fcstDelta.dTa2 !== null ? fcstDelta.dTa2 : fcstDelta.dTa1 * 1.75;
      p2 = round1(curTa + clampNum(d2, -7.5, 7.5));
    } else if (slopeTa !== null) {
      p1 = round1(curTa + clampNum(slopeTa * 0.8, -3.5, 3.5));
      p2 = round1(curTa + clampNum(slopeTa * 1.35, -5.5, 5.5));
    }
    if (p1 !== null) predTa.push({ h: 1, v: p1 });
    if (p2 !== null) predTa.push({ h: 2, v: p2 });
  } else if (fcstDelta.fcst1 !== null) {
    predTa.push({ h: 1, v: fcstDelta.fcst1 });
    if (fcstDelta.fcst2 !== null) predTa.push({ h: 2, v: fcstDelta.fcst2 });
  }

  // 노면온도(TR1) +1h, +2h 예측 (단기예보 기온변화 + 최근 노면 냉각/상승 관성 결합 · 일출/일몰 반전 시 관성 신속 감쇠)
  const predTr = [];
  if (curTr !== null) {
    let d1 = null;
    let d2 = null;
    if (fcstDelta.dTa1 !== null) {
      const m1 = slopeTr !== null ? slopeTr : fcstDelta.dTa1;
      const sameDir1 = fcstDelta.dTa1 === 0 || (fcstDelta.dTa1 * m1 >= 0);
      const wM1 = sameDir1 ? 0.35 : 0.15;
      d1 = clampNum((1 - wM1) * fcstDelta.dTa1 + wM1 * m1, -4.0, 4.0);
      const step2Ta = fcstDelta.dTa2 !== null ? (fcstDelta.dTa2 - fcstDelta.dTa1) : fcstDelta.dTa1 * 0.75;
      const sameDir2 = step2Ta === 0 || (step2Ta * m1 >= 0);
      const wM2 = sameDir2 ? 0.20 : 0.0;
      const wTa2 = sameDir2 ? 0.70 : 0.90;
      d2 = clampNum(d1 + wTa2 * step2Ta + wM2 * m1, -6.5, 6.5);
    } else if (slopeTr !== null) {
      d1 = clampNum(0.75 * slopeTr, -3.5, 3.5);
      d2 = clampNum(d1 + 0.45 * slopeTr, -5.5, 5.5);
    }
    if (d1 !== null) predTr.push({ h: 1, v: round1(curTr + d1) });
    if (d2 !== null) predTr.push({ h: 2, v: round1(curTr + d2) });
  }

  const finalize = (obs, pred, curVal) => {
    const startVal = obs.length >= 2 ? obs[0].v : null;
    const pred1h = pred[0]?.v ?? null;
    const pred2h = pred[1]?.v ?? pred1h;
    const delta6h = (startVal !== null && curVal !== null) ? round1(curVal - startVal) : null;
    const deltaPred2h = (pred2h !== null && curVal !== null) ? round1(pred2h - curVal) : null;
    const minFuture = [curVal, pred1h, pred2h].filter(v => v !== null);
    const minVal = minFuture.length ? Math.min(...minFuture) : null;
    const crossesZeroSoon = Boolean(
      (curVal !== null && curVal <= 0)
      || (pred1h !== null && pred1h <= 0)
      || (pred2h !== null && pred2h <= 0)
    );
    return {
      obs,
      pred,
      startVal,
      curVal,
      pred1h,
      pred2h,
      delta6h,
      deltaPred2h,
      minFuture: minVal,
      crossesZeroSoon
    };
  };

  return {
    stationId: trStnId,
    stationName: trStnSeries?.name || zone?.roadObs?.stationName || '',
    airStationName: taStnSeries?.name || '',
    tr: finalize(obsTr, predTr, curTr),
    ta: finalize(obsTa, predTa, curTa)
  };
}

/**
 * 초소형 인라인 SVG 스파크라인 (좌 75% 6h 실측 실선 + 현재점 ● + 우 25% +2h 점선 예측 + 조건부 0°C 기준선)
 */
export function renderMicroSparklineSvg(series, { kind = 'road', uid = 'sp' } = {}) {
  const W = 122;
  const H = 28;
  const X_LEFT = 2;
  const X_NOW = 89;
  const X_P1 = 104;
  const X_P2 = 119;
  const Y_TOP = 3.5;
  const Y_BOT = 24.5;

  const obs = Array.isArray(series?.obs) ? series.obs : [];
  const pred = Array.isArray(series?.pred) ? series.pred : [];
  const allVals = [
    ...obs.map(p => p.v),
    ...pred.map(p => p.v)
  ].filter(Number.isFinite);

  if (!allVals.length) {
    return `<svg class="rzc-spark-svg is-empty" viewBox="0 0 ${W} ${H}" aria-hidden="true">`
      + `<rect x="${X_NOW}" y="1" width="${W - X_NOW - 1}" height="${H - 2}" rx="2" fill="rgba(148,163,184,0.05)"/>`
      + `<line x1="${X_LEFT}" y1="${(H / 2).toFixed(1)}" x2="${X_P2}" y2="${(H / 2).toFixed(1)}" stroke="rgba(148,163,184,0.22)" stroke-width="1" stroke-dasharray="2 3"/>`
      + `</svg>`;
  }

  let rawMin = Math.min(...allVals);
  let rawMax = Math.max(...allVals);
  const showZero = rawMin <= 3.5 && rawMax >= -2.5;
  if (showZero) {
    rawMin = Math.min(rawMin, 0);
    rawMax = Math.max(rawMax, 0);
  }
  let span = rawMax - rawMin;
  if (span < 4.0) {
    const mid = (rawMin + rawMax) / 2;
    rawMin = mid - 2.0;
    rawMax = mid + 2.0;
    span = 4.0;
  }
  const padY = span * 0.12;
  const yMin = rawMin - padY;
  const yMax = rawMax + padY;
  const yOf = (v) => Number((Y_BOT - ((v - yMin) / (yMax - yMin)) * (Y_BOT - Y_TOP)).toFixed(1));
  const xObs = (ratio) => Number((X_LEFT + clampNum(ratio, 0, 1) * (X_NOW - X_LEFT)).toFixed(1));

  const minKey = series?.minFuture;
  let stroke = '#38dbf8';
  if (kind === 'road') {
    stroke = (minKey !== null && minKey <= 0.5) ? '#fb7185'
      : (minKey !== null && minKey <= 2.5) ? '#fb923c'
      : '#38dbf8';
  } else {
    stroke = (minKey !== null && minKey < 0) ? '#fb7185'
      : (minKey !== null && minKey <= 0.5) ? '#60a5fa'
      : '#9bc4e6';
  }

  const obsCoords = obs.map(p => [xObs(p.ratio), yOf(p.v)]);
  const anchor = obsCoords.length ? obsCoords[obsCoords.length - 1] : [X_NOW, yOf(pred[0].v)];
  const predCoords = [anchor];
  for (const p of pred) {
    predCoords.push([p.h === 1 ? X_P1 : X_P2, yOf(p.v)]);
  }

  const gradId = `spg-${String(uid).replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const parts = [];
  parts.push(`<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${stroke}" stop-opacity="0.24"/><stop offset="100%" stop-color="${stroke}" stop-opacity="0.01"/></linearGradient></defs>`);

  // 우측 +2h 예측 영역 음영 및 현재 시각 경계선
  parts.push(`<rect x="${X_NOW}" y="1" width="${W - X_NOW - 1}" height="${H - 2}" rx="2" fill="rgba(148,163,184,0.06)"/>`);
  parts.push(`<line x1="${X_NOW}" y1="2" x2="${X_NOW}" y2="${H - 2}" stroke="rgba(148,163,184,0.22)" stroke-width="0.8" stroke-dasharray="1.5 2"/>`);

  // 0°C 결빙 기준선 (영상 3.5°C 이하 접근 시 표시)
  if (yMin <= 0 && yMax >= 0) {
    const y0 = yOf(0);
    parts.push(`<line x1="${X_LEFT}" y1="${y0}" x2="${X_P2}" y2="${y0}" stroke="rgba(96,165,250,0.48)" stroke-width="0.9" stroke-dasharray="2 2"/>`);
    const lblY = y0 > H - 7 ? y0 - 2 : y0 + 7;
    parts.push(`<text x="${X_LEFT + 1}" y="${lblY.toFixed(1)}" font-size="7" font-weight="700" fill="rgba(147,197,253,0.75)">0°</text>`);
  }

  // 6h 실측 영역 그라데이션 채우기 + 실선
  if (obsCoords.length >= 2) {
    const linePts = obsCoords.map(([x, y]) => `${x},${y}`).join(' ');
    const firstX = obsCoords[0][0];
    const lastX = obsCoords[obsCoords.length - 1][0];
    const areaD = `M${obsCoords.map(([x, y]) => `${x} ${y}`).join(' L')} L${lastX} ${H - 1} L${firstX} ${H - 1} Z`;
    parts.push(`<path d="${areaD}" fill="url(#${gradId})"/>`);
    parts.push(`<polyline class="sp-obs" points="${linePts}" fill="none" stroke="${stroke}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`);
  }

  // +2h 예측 점선 + 끝점 링
  if (predCoords.length >= 2) {
    const pPts = predCoords.map(([x, y]) => `${x},${y}`).join(' ');
    const endPt = predCoords[predCoords.length - 1];
    parts.push(`<polyline class="sp-pred" points="${pPts}" fill="none" stroke="${stroke}" stroke-width="1.45" stroke-opacity="0.88" stroke-dasharray="2.6 2" stroke-linecap="round" stroke-linejoin="round"/>`);
    parts.push(`<circle cx="${endPt[0]}" cy="${endPt[1]}" r="1.7" fill="#07111e" stroke="${stroke}" stroke-width="1.1"/>`);
  }

  // 현재 시점 앵커 점
  if (obsCoords.length >= 1) {
    parts.push(`<circle class="sp-now" cx="${anchor[0]}" cy="${anchor[1]}" r="2.3" fill="${stroke}" stroke="#07111e" stroke-width="1"/>`);
  }

  return `<svg class="rzc-spark-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">${parts.join('')}</svg>`;
}

/**
 * 모바일·태블릿(<= 1320px) [지도 크게] 전체화면 모드의 SVG 확대·슬라이드 및 90° 가로회전 레이아웃 계산
 */
export function computeMobileBigMapLayout({
  stageW = 390,
  stageH = 640,
  zoom = null,
  rotZoom = 1,
  rotated = false,
  svgW = 1600,
  svgH = 745
} = {}) {
  const ar = svgW / svgH;
  const sw = Math.max(240, Number(stageW) || 390);
  const sh = Math.max(200, Number(stageH) || 640);

  if (rotated) {
    const rotFitW = Math.max(260, Math.floor(Math.min(sh - 12, (sw - 8) * ar)));
    const activeZoom = Math.min(3.0, Math.max(1.0, Number.isFinite(rotZoom) && rotZoom > 0 ? rotZoom : 1.0));
    const renderW = Math.round(rotFitW * activeZoom);
    const renderH = Math.round(renderW / ar);
    const sizerW = renderH;
    const sizerH = renderW;
    const padY = Math.max(0, Math.floor((sh - sizerH) / 2));
    const padX = Math.max(0, Math.floor((sw - sizerW) / 2));
    return {
      rotated: true,
      defaultZoom: 1.0,
      activeZoom,
      scalePct: Math.round(activeZoom * 100),
      renderW,
      renderH,
      sizerW,
      sizerH,
      padX,
      padY
    };
  }

  const fitW = Math.max(240, Math.floor(Math.min(sw, (sh - 8) * ar)));
  const isPortrait = sw < sh;
  const heightFillZoom = ((sh - 16) * ar * 0.94) / fitW;
  const defaultZoom = isPortrait
    ? Math.round(Math.min(3.4, Math.max(2.2, heightFillZoom)) * 10) / 10
    : 1.4;
  const activeZoom = Math.min(4.5, Math.max(1.0, Number.isFinite(zoom) && zoom > 0 ? zoom : defaultZoom));
  const renderW = Math.round(fitW * activeZoom);
  const renderH = Math.round(renderW / ar);
  const padY = Math.max(0, Math.floor((sh - renderH) / 2));
  const padX = Math.max(0, Math.floor((sw - renderW) / 2));

  return {
    rotated: false,
    defaultZoom,
    activeZoom,
    scalePct: Math.round(activeZoom * 100),
    renderW,
    renderH,
    sizerW: renderW,
    sizerH: renderH,
    padX,
    padY
  };
}
