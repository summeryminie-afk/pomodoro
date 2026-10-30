# CLAUDE.md
## FocusFlash — 사무실용 뽀모도로 타이머

이 파일은 Claude가 이 프로젝트를 개발할 때 참조하는 컨텍스트 파일입니다.

> **먼저 읽을 것:** 맨 아래 [작업 현황 & 인수인계](#작업-현황--인수인계-2026-10-30-기준) 섹션에 배포 방식, 지금까지 한 작업, 다음 할 일이 정리되어 있습니다. 아래 초기 설계 내용 중 일부는 실제 코드와 달라졌으니 그 섹션의 "설계 문서와 달라진 점"을 함께 확인하세요.

---

## 프로젝트 개요

사무실에서 소리 없이 사용 가능한 뽀모도로 타이머 웹앱.  
**핵심:** 백그라운드에서도 3중 시각 알림으로 세션 종료를 강력하게 인지시킨다.

---

## 기술 스택 & 구현 방식

### 반드시 지켜야 할 것
- **단일 HTML 파일** — 모든 CSS, JS를 인라인으로 포함. 외부 파일 분리 금지
- **의존성 없음** — npm 패키지, 외부 프레임워크 사용 금지 (Vanilla JS만 사용)
- **CDN 최소화** — 폰트 정도만 CDN 허용, 그 외는 인라인 처리
- **오프라인 동작** — 인터넷 없이도 완전히 동작해야 함

### 타이머 엔진
```javascript
// 반드시 Web Worker를 사용할 것
// setInterval은 백그라운드 탭에서 스로틀링됨 → 타이머 오차 발생
// Web Worker는 백그라운드에서도 정확하게 동작

// worker.js를 Blob URL로 인라인 생성
const workerCode = `
  let interval;
  self.onmessage = (e) => {
    if (e.data === 'start') {
      interval = setInterval(() => self.postMessage('tick'), 1000);
    }
    if (e.data === 'stop') clearInterval(interval);
  };
`;
const blob = new Blob([workerCode], { type: 'application/javascript' });
const worker = new Worker(URL.createObjectURL(blob));
```

### 알림 시스템 (3중 레이어)

#### Layer 1 — OS 알림
```javascript
// 권한 요청
async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

// 알림 발송
function sendNotification(title, body) {
  if (Notification.permission !== 'granted') return;
  new Notification(title, {
    body,
    icon: '/favicon.ico',
    requireInteraction: true  // 사용자가 직접 닫을 때까지 유지
  });
}
```

#### Layer 2 — 탭 제목 깜빡임
```javascript
// Page Visibility API로 탭 상태 감지
let titleFlashInterval = null;
const originalTitle = document.title;

function startTitleFlash(message) {
  let toggle = false;
  titleFlashInterval = setInterval(() => {
    document.title = toggle ? message : originalTitle;
    toggle = !toggle;
  }, 1000);
}

function stopTitleFlash() {
  clearInterval(titleFlashInterval);
  document.title = originalTitle;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && isAlertPending) {
    stopTitleFlash();
    showOverlay(); // Layer 3 발동
  }
});
```

#### Layer 3 — 전체화면 오버레이
```javascript
// 탭 재진입 시 표시, 10초 후 자동 해제
function showOverlay(type) { // type: 'focus-end' | 'break-end'
  const overlay = document.getElementById('alert-overlay');
  overlay.classList.add('active');
  
  // 자동 해제 카운트다운
  let countdown = 10;
  const timer = setInterval(() => {
    countdown--;
    if (countdown <= 0) {
      hideOverlay();
      clearInterval(timer);
    }
  }, 1000);
}
```

---

## 상태 관리

### 앱 상태 구조
```javascript
const state = {
  // 타이머
  mode: 'focus',          // 'focus' | 'short-break' | 'long-break'
  status: 'idle',         // 'idle' | 'running' | 'paused' | 'alert'
  timeLeft: 25 * 60,      // 초 단위
  cycleCount: 0,          // 현재 사이클 (1~4)
  
  // 세션 기록
  todaySessions: 0,
  
  // 설정
  settings: {
    focusTime: 25,         // 분
    shortBreak: 5,         // 분
    longBreak: 15,         // 분
    autoStart: false,
    notifyOS: true,
    notifyTab: true,
    notifyOverlay: true,
    overlayIntensity: 'strong', // 'normal' | 'strong' | 'extreme'
    dailyGoal: 8,
    theme: 'dark',         // 'dark' | 'light'
  }
};
```

### localStorage 키 규칙
```javascript
const STORAGE_KEYS = {
  SETTINGS: 'focusflash_settings',
  TODAY_SESSIONS: 'focusflash_today_sessions',
  TODAY_DATE: 'focusflash_today_date',  // 자정 초기화 기준
};
```

---

## UI/UX 가이드라인

### 디자인 원칙
- **컴팩트 우선** — 작은 창 (200x300px)에서도 타이머가 보여야 함
- **상태가 명확** — 집중 중 / 휴식 중 / 알림 상태를 색상으로 즉시 구분
- **무음 보장** — 어떠한 Audio 객체도 생성하지 않을 것

### 색상 체계
```css
:root {
  /* 집중 모드 */
  --color-focus: #E53E3E;       /* 빨강 */
  --color-focus-light: #FEB2B2;

  /* 짧은 휴식 */
  --color-short-break: #38A169; /* 초록 */
  --color-short-break-light: #C6F6D5;

  /* 긴 휴식 */
  --color-long-break: #3182CE;  /* 파랑 */
  --color-long-break-light: #BEE3F8;

  /* 알림 오버레이 */
  --color-alert-normal: rgba(229, 62, 62, 0.85);
  --color-alert-strong: rgba(229, 62, 62, 0.95);
  --color-alert-extreme: rgba(180, 0, 0, 1);
}
```

### 오버레이 강도별 동작
| 강도 | 배경 투명도 | 애니메이션 | 자동 해제 |
|------|------------|-----------|----------|
| 보통 | 85% | 페이드인 | 10초 |
| 강함 | 95% | 플래시 3회 | 10초 |
| 매우 강함 | 100% | 플래시 5회 + 화면 쉐이크 | 15초 |

---

## 파일 구조

단일 HTML 파일이므로 내부 구조:

```
index.html
├── <head>
│   ├── 메타 태그, 파비콘 (인라인 SVG)
│   └── <style> — 전체 CSS
├── <body>
│   ├── #app — 메인 앱 컨테이너
│   │   ├── #main-screen — 타이머 화면
│   │   ├── #settings-screen — 설정 화면
│   │   └── #alert-overlay — 알림 오버레이 (z-index: 9999)
│   └── <script> — 전체 JS
│       ├── Web Worker (Blob URL로 인라인)
│       ├── 상태 관리
│       ├── 타이머 엔진
│       ├── 알림 시스템 (3중 레이어)
│       ├── UI 렌더링
│       └── localStorage 연동
```

---

## 주요 엣지 케이스

### 반드시 처리해야 할 것

1. **알림 권한 거부** — OS 알림 없이 탭 깜빡임 + 오버레이만으로 동작
2. **Web Worker 미지원** — fallback으로 setInterval 사용, 콘솔에 경고 출력
3. **탭 완전 종료 후 재진입** — localStorage에서 마지막 상태 복원 시도
4. **자정 날짜 변경** — 오늘 세션 수 자동 초기화 (날짜 비교)
5. **설정 변경 중 타이머 실행** — 현재 세션에는 반영 안 하고 다음 세션부터 적용
6. **빠른 연속 클릭** — 시작/정지 버튼 디바운스 처리

### 브라우저 차이점

| 브라우저 | 주의사항 |
|---------|---------|
| Safari | Notification API는 지원하나 requireInteraction 미지원 |
| Firefox | 알림 권한 UI가 다름, 팝업 차단 확인 필요 |
| Chrome | 백그라운드 탭 Web Worker 완벽 지원 |
| Edge | Chrome과 동일 (Chromium 기반) |

---

## 개발 명령어

```bash
# 로컬에서 바로 열기 (파일 프로토콜)
open index.html

# 로컬 서버로 실행 (Notification API는 HTTPS 또는 localhost 필요)
python3 -m http.server 8080
# → http://localhost:8080 접속

# Chrome에서 파일 프로토콜 알림 허용 (개발용)
# chrome://flags/#unsafely-treat-insecure-origin-as-secure
```

---

## 하지 말아야 할 것 (Anti-patterns)

- ❌ `new Audio()` 또는 `AudioContext` 사용 — 사무실 무음 환경
- ❌ `setInterval`을 타이머 엔진으로 직접 사용 — 백그라운드 스로틀링 발생
- ❌ 외부 JS 라이브러리 CDN 로드 — 오프라인 미동작
- ❌ 서버 사이드 로직 — 순수 클라이언트 앱
- ❌ `alert()`, `confirm()` 사용 — 브라우저 팝업은 UX 저해
- ❌ 고정 픽셀 레이아웃 — 작은 창 크기 대응 필요

---

## 완료 체크리스트

### 기능
- [ ] Web Worker 타이머 (백그라운드 정확도)
- [ ] 집중/짧은휴식/긴휴식 시간 설정
- [ ] 시작/정지/리셋 제어
- [ ] 4사이클 자동 전환
- [ ] OS 알림 (권한 요청 포함)
- [ ] 탭 제목 깜빡임
- [ ] 전체화면 오버레이 (강도 3단계)
- [ ] Favicon 동적 변경
- [ ] 설정 localStorage 저장
- [ ] 오늘 세션 기록

### 품질
- [ ] Chrome 최신 버전 동작 확인
- [ ] Edge 최신 버전 동작 확인
- [ ] Firefox 최신 버전 동작 확인
- [ ] Safari 최신 버전 동작 확인
- [ ] 알림 권한 거부 상태 동작 확인
- [ ] 200x300px 최소 창 크기 UI 확인
- [ ] 콘솔 에러 없음
- [ ] 오프라인 동작 확인

---

## 작업 현황 & 인수인계 (2026-10-30 기준)

### 배포 구조
- **배포 주소:** https://pomodoro-kappa-plum.vercel.app (사용자들이 PWA로 설치해서 사용 중)
- **저장소:** https://github.com/summeryminie-afk/pomodoro — `main` 브랜치에 바로 커밋/푸시하면 Vercel이 자동 배포
- **배포 확인 방법:** GitHub 커밋에 "Vercel – Deployment has completed" 상태가 붙는지 확인. 상태가 아예 안 붙으면 Vercel이 푸시를 못 받은 것
- **과거 장애 (2026-10-30):** Vercel ↔ GitHub 연결이 끊겨(`Project Link not found`) 푸시해도 배포가 안 됨 → Vercel 프로젝트 Settings → Git에서 **Reconnect** 후 빈 커밋을 푸시해 해결. 같은 증상이 다시 나면 이곳부터 확인

### 실제 파일 구성
| 파일 | 역할 |
|------|------|
| `index.html` | 앱 전체 (CSS/JS 인라인). JS는 IIFE로 감싸져 있어 콘솔에서 `state` 등에 직접 접근 불가 |
| `sw.js` | 서비스워커 (오프라인 캐시, OS 알림 발송) |
| `manifest.json`, `icon.svg` | PWA 설치용 |
| `README.md` | 저장소 소개 |
| `CLAUDE.md`, `prd.md`, `pomodoro_plan.md`, `sprint.md` | 기획/개발 문서 (공개 저장소에 올라가 있으므로 민감한 정보는 적지 말 것) |

### 서비스워커 규칙 (중요)
- **`index.html`(페이지 이동 요청)은 네트워크 우선**, 실패하면(오프라인) 캐시된 `/index.html`로 대체. 나머지 파일은 캐시 우선
- **`sw.js`를 바꿀 때는 `CACHE` 버전 이름을 올릴 것** (현재 `focusflash-v5`). 아이콘/매니페스트를 바꿨을 때도 캐시 우선이라 버전을 올려야 사용자에게 반영됨
- `index.html`만 바꾼 배포는 앱을 한 번 다시 켜면 반영됨 (v5부터). v4 이전 사용자는 v5로 넘어갈 때 한 번만 두 번 재시작이 필요했음
- 오프라인 동작은 2026-10-30에 실제 PWA에서 와이파이를 끄고 확인 완료

### 지금까지 한 작업 (최근순)
- `02e3b34` 서비스워커가 `index.html`을 네트워크 우선으로 받도록 변경 (업데이트가 재시작 한 번으로 반영되게)
- `3d738ee` **긴 휴식 주기 설정 추가** — 설정 화면 "긴 휴식 주기", 2~8회, 기본 4회 (`settings.longBreakInterval`). 타이머 아래 진행 점 개수도 이 값에 맞춰 생성됨. 진행 중에 주기를 줄이면 다음 집중 후 바로 긴 휴식이 오도록 맞춤
- `74ff7de` 오버레이 자동 해제 제거 — 사용자가 확인을 눌러야 닫힘
- `c6316de` OS 알림을 서비스워커의 `showNotification()`으로 발송
- `301b4b5` PWA 지원 (manifest, 서비스워커, 앱 아이콘 배지 `setAppBadge`)
- `2dc5590` 탭 제목 깜빡임 강화, 파비콘 깜빡임, 1분 전 경고 버그 수정

### 설계 문서와 달라진 점
위쪽 초기 설계(및 `sprint.md`)와 실제 코드가 다른 부분. 수정할 때는 실제 코드 기준으로 판단할 것.
- **단일 HTML 파일 → PWA 파일 추가:** `sw.js`, `manifest.json`, `icon.svg`가 별도 파일로 존재함
- **오버레이 자동 해제 없음:** 설계는 10~15초 후 자동 해제였으나 지금은 확인 버튼으로만 닫힘
- **긴 휴식 주기:** 설계는 4사이클 고정이었으나 설정값(`longBreakInterval`)으로 바뀜
- **탭 깜빡임 간격:** 설계는 1초, 실제는 0.4초. 탭이 보이는 상태에서는 깜빡임 대신 오버레이가 뜸 (의도된 동작)

### 알림 관련 확인된 사실 (사용자 문의 대응용)
- **OS 알림이 안 뜰 때 확인할 것은 두 가지:** ① 브라우저의 사이트 알림 권한 (주소창 왼쪽 아이콘 → 알림 켜기, 또는 `chrome://settings/content/notifications`) ② Windows 설정 → 시스템 → 알림 및 작업에서 브라우저 알림 켜짐 + 포커스 지원(방해 금지) 꺼짐
- PC 포맷/브라우저 재설치 후에는 알림 권한이 초기화되므로 다시 허용해야 함
- 사이트 설정의 다른 권한(웹 앱 설치, 창 관리 등)은 이 앱과 무관
- **작업표시줄 아이콘 깜빡임은 구현 불가.** Windows의 `FlashWindowEx` 같은 기능은 웹/PWA에 노출되지 않음. 웹에서 가능한 최대치는 OS 알림 + 앱 배지 + 탭 깜빡임 + 오버레이 (모두 구현됨)

### 다음에 할 일
1. **알림 권한 차단(denied) 안내 배너** — 지금은 권한이 `default`일 때만 배너가 뜨고(`updateNotifyBanner`), 사용자가 "차단"을 누르면 아무 안내 없이 OS 알림이 조용히 꺼짐. 차단 상태일 때 "브라우저 설정에서 알림을 허용해주세요" 안내를 보여주면 사용자 문의가 줄어듦
2. **설계 문서 정리** — 위 "설계 문서와 달라진 점"을 반영해 위쪽 설계 섹션과 `sprint.md` 체크리스트를 실제 코드에 맞게 고치기
3. **미검증 항목 (`sprint.md` 체크리스트):** 30분 백그라운드 타이머 오차 ±2초, Firefox/Safari에서 알림 동작, 200x300px 작은 창 UI

### 개발 환경 메모
- **푸시 로그인:** Windows용 Git의 Git Credential Manager가 처음 푸시할 때 브라우저로 GitHub 로그인을 요청함. Claude가 실행한 터미널에서는 로그인 창을 띄울 수 없어 실패하므로, **새 컴퓨터에서는 처음 한 번 직접 명령 프롬프트에서 `git push`로 로그인**해야 함
- **로컬 테스트:** 기존 컴퓨터에는 Python/Node가 없었음. 서비스워커는 HTTPS 또는 localhost에서만 동작하므로, 서비스워커 관련 변경은 배포 사이트에서 확인하는 것이 확실함
- **새 컴퓨터로 옮길 때:** OneDrive가 `.git` 폴더까지 동기화하면 가끔 저장소가 깨질 수 있음. 동기화가 완전히 끝난 뒤 열고, 문제가 있으면 `git clone https://github.com/summeryminie-afk/pomodoro.git`으로 새로 받으면 됨 (문서까지 모두 저장소에 있음)
