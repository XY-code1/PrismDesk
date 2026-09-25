# PrismDesk

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md)

PrismDesk는 같은 로컬 이미지 또는 자체 제작 오로라 애니메이션을 Codex 데스크톱과 WorkBuddy에 각각 적용하는 Windows 11용 오픈 소스 외관 도구입니다. 계정, 클라우드, 유료 기능, 테마 마켓을 사용하지 않습니다.

> OpenAI 또는 Tencent와 공식 제휴·승인 관계가 없는 독립 커뮤니티 프로젝트입니다.

![PrismDesk](docs/screenshots/pet-and-settings.png)

## 상태와 기능

현재 버전은 Windows 11 x64용 **`0.1.0-alpha.1`**입니다. Codex 26.917.9434.0과 WorkBuddy 5.5.3.0에서 이미지, 오로라, 재적용, 복원을 실기 검증했으며 WorkBuddy에서는 일시정지도 검증했습니다.

- 설치, 버전, 프로세스, 연결 및 호환 상태 감지.
- PNG/JPEG/WebP와 원격 에셋이 없는 Canvas 오로라.
- 밝기, 투명도, 블러, 속도 및 15/30/60 FPS 조절.
- 클라이언트별 적용, 일시정지, 복원과 중복 없는 주입.
- 임의 스크립트를 실행하지 않는 선언형 테마 검증과 로컬 저장.
- 클릭, 드래그, 투명 영역 클릭 통과, 위치 저장을 지원하는 Prism 데스크톱 펫.
- 설정 창을 닫아도 시스템 트레이에서 계속 실행.

## 보안 경계

설치 파일, `app.asar`, 서명을 수정하지 않습니다. Codex는 `127.0.0.1:9222`의 `app://-/index.html`, WorkBuddy는 `127.0.0.1:9223`의 `renderer/index.html`을 검증한 뒤 연결합니다. 채팅 본문과 인증 정보를 읽거나 로그에 기록하지 않습니다.

## 개발 및 패키징

Windows 11 x64와 Node.js 22+가 필요합니다. Electron 38, TypeScript 5, 네이티브 HTML/CSS/DOM, esbuild, electron-builder를 사용하며 React와 Vite는 사용하지 않습니다.

```powershell
git clone https://github.com/XY-code1/PrismDesk.git
cd PrismDesk
npm install
npm run check
npm test
npm run dev
npm run package:win
```

Windows 결과물은 `release/`의 NSIS 설치 파일과 포터블 EXE이며 이 폴더는 Git에서 제외됩니다.

## 제한

주입은 세션 단위이며 클라이언트 업데이트 후에는 재검증이 필요합니다. 입력, 코드 복사, 긴 스크롤, 모든 대화상자, 깨끗한 시스템에서의 업데이트·제거는 수동 확인 항목입니다. 테스트 빌드는 상용 코드 서명이 없습니다.

[아키텍처](docs/ARCHITECTURE.md) · [호환성](docs/COMPATIBILITY.md) · [테스트](docs/TEST_RECORD.md) · [기여](CONTRIBUTING.md) · [제3자 라이선스](THIRD_PARTY_NOTICES.md)

원본 코드는 [MIT License](LICENSE)로 제공됩니다.
