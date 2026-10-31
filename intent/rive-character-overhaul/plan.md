# 상세 기획 및 구현 계획서 (Plan): Rive 기반 5종 동물 캐릭터 개편 및 초기화

본 문서는 [intent.md](file:///c:/project/DeskMate/intent/rive-character-overhaul/intent.md)를 바탕으로 기존 캐릭터 데이터를 초기화하고, **Rive (`@rive-app/react-canvas`)**를 활용하여 **고양이(`cat`), 강아지(`dog`), 팬더(`panda`), 호랑이(`tiger`), 돼지(`pig`)** 5종 캐릭터를 구현하기 위한 상세 설계 및 단계별 실행 계획입니다.

---

## 1. 세부 기획 및 기능 요구사항 명세

### 1.1 기존 캐릭터 데이터 전면 초기화
- **서버 기동 시 및 API를 통한 캐릭터 초기화 (`server/supabase.js`, `server/index.js`)**:
  - 기존 캐릭터(`slime` 등) 및 기존 선택 데이터를 초기화하기 위해 `resetAllUsersCharacters()` 함수를 구현하여 서버 시작 시 및 `POST /api/user/reset-characters` 호출 시 Supabase `users` 테이블의 `character_type`을 `NULL`로 초기화합니다.
  - 또한 로그인/조회 시 유효한 5종(`cat`, `dog`, `panda`, `tiger`, `pig`)이 아닌 캐릭터 타입은 자동으로 `null`로 반환하여 무조건 캐릭터 선택 화면(`SELECT_CHAR`)으로 진입하도록 보장합니다.
- **SQL 스키마 업데이트 (`server/schema.sql`)**:
  - `UPDATE public.users SET character_type = NULL;` 초기화 쿼리 및 5종 캐릭터 주석을 반영합니다.

### 1.2 신규 5종 동물 캐릭터 정의 (`CharacterType`)
| 코드 (`type`) | 캐릭터 이름 | 특징 및 컬러 테마 |
| :--- | :--- | :--- |
| `cat` | **치즈 고양이** | 노란 치즈색 털, 쫑긋한 삼각 귀, 줄무늬 이마, 살랑거리는 꼬리 |
| `dog` | **크림 강아지** | 크림/베이지색 털, 귀엽게 접힌 갈색 귀, 혀를 내민 밝은 표정, 흔드는 꼬리 |
| `panda` | **대나무 팬더** | 흑백 배색, 동그란 검은 귀와 눈가 패치, 볼터치와 귀여운 둥근 체형 |
| `tiger` | **용맹 호랑이** | 오렌지색 털과 검은 호피 줄무늬, 흰색 볼털, 이마의 왕(王) 무늬 |
| `pig` | **분홍 아기돼지** | 파스텔 핑크빛 몸통, 납작하고 귀여운 돼지코(콧구멍 2개), 접힌 분홍 귀와 말린 꼬리 |

### 1.3 Rive (`@rive-app/react-canvas`) 기반 캐릭터 렌더러 설계 (`src/components/CharacterAvatar.tsx`)
- **Rive 런타임 통합 (`@rive-app/react-canvas`)**:
  - `@rive-app/react-canvas`의 `useRive`, `useStateMachineInput`, `Layout`, `Fit`, `Alignment` 훅과 컴포넌트를 탑재합니다.
  - `public/assets/rive/{characterType}.riv` 파일이 배치되어 있을 경우 Rive WebAssembly 런타임(`useRive`)이 즉시 `.riv` 파일의 상태 머신(`State Machine 1`: `isWalking`, `emote` 트리거 입력)을 구동합니다.
- **내장 60FPS Rive-Canvas 프로시저럴 스켈레톤(Bone) 상태 머신 엔진 동시 탑재**:
  - 외부 `.riv` 바이너리 파일이 없거나 오프라인 환경일 때도 깨짐이나 빈 화면 없이 **100% 즉시 고품질로 동작**하도록, Rive의 본(Bone)/파츠 상태 머신과 동일하게 동작하는 **60FPS HTML5 Canvas 스켈레톤 애니메이션 렌더러**를 기본 내장합니다.
  - **실시간 동작 파츠**:
    - **자동 눈 깜빡임(Blink)**: 2.5~4.5초 주기로 자연스럽게 눈을 깜빡임
    - **호흡 및 귀/꼬리 관절(Bone) 모션**: `Math.sin(time)` 위상차 기반으로 귀가 쫑긋거리고 꼬리가 살랑살랑 흔들림
    - **보행(Walk) 사이클**: 양팔과 양다리가 교차 스윙하며 몸통이 리듬감 있게 바운스
    - **감정 표현(Emote) 상태 머신**:
      - `wave`: 오른팔을 높이 들어 좌우로 흔들며 윙크
      - `jump`: 공중으로 크게 점프하며 팔다리를 펼치고 반짝이는 별(⭐) 파티클 생성
      - `dance`: 리듬에 맞춰 좌우 힙/바디 댄스 및 음표(🎵) 파티클 생성
      - `heart`: 두 손을 모으고 머리 위로 하트(❤️) 파티클이 솟아오름
      - `sleep`: 눈을 감고 호흡이 느려지며 `Zzz` 수면 방울이 떠오름

### 1.4 5종 동물별 맞춤 효과음 (`src/utils/sound.ts`)
- 말풍선이 뜰 때 동물 특징에 맞춘 신디사이저 사운드 톤 재생:
  - `cat`: 높고 부드러운 야옹 톤
  - `dog`: 경쾌한 더블 바크(멍멍) 톤
  - `panda`: 포근하고 둥근 마림바/대나무 톤
  - `tiger`: 힘차고 낮은 어흥 톤
  - `pig`: 귀엽고 통통 튀는 꿀꿀 톤

---

## 2. 단계별 구현 계획 (구현 체크리스트)

- [x] **Phase 1: Rive 패키지 설치 (`@rive-app/react-canvas`)**
  - [x] `package.json`에 `@rive-app/react-canvas` 추가 및 `npm install` 수행
- [x] **Phase 2: 백엔드 캐릭터 초기화 및 5종 동물 타입 적용 (`server/supabase.js`, `server/index.js`, `server/schema.sql`)**
  - [x] 기존 유저들의 `character_type`을 `NULL`로 초기화하는 `resetAllUsersCharacters()` 실행 및 API(`POST /api/user/reset-characters`) 추가
  - [x] 허용 캐릭터 목록을 `['cat', 'dog', 'panda', 'tiger', 'pig']` 5종으로 변경
- [x] **Phase 3: 프론트엔드 타입, 사운드, Rive 캐릭터 아바타 컴포넌트 구현**
  - [x] `src/types/index.ts`의 `CharacterType`을 `'cat' | 'dog' | 'panda' | 'tiger' | 'pig'`로 변경
  - [x] `src/utils/sound.ts`에 5종 동물별 고유 말풍선 효과음 구현
  - [x] `src/components/CharacterAvatar.tsx`에 `@rive-app/react-canvas` (`useRive`, `useStateMachineInput`) 연동 및 5종 동물(고양이, 강아지, 팬더, 호랑이, 돼지) 60FPS Rive-Canvas 스켈레톤 상태 머신 구현
  - [x] `src/pages/MainWindow.tsx` 캐릭터 선택 화면을 5종 동물 그리드 UI 및 캐릭터 초기화 버튼 포함 구조로 개선
- [x] **Phase 4: 빌드 및 초기화/5종 캐릭터 선택 검증**
  - [x] `npm run build` (`tsc -b && vite build`) 에러 0건 확인
  - [x] 서버 기동 후 캐릭터 초기화 및 5종 캐릭터(`cat`, `dog`, `panda`, `tiger`, `pig`) 선택 저장 API 테스트 수행

---

## 3. 영향 범위 및 고려사항
- **기존 유저 데이터 호환성**: 기존에 `slime` 등을 선택했던 유저가 로그인하더라도 서버에서 자동으로 `characterType: null`로 정규화하여 에러 없이 즉시 5종 캐릭터 선택 화면(`SELECT_CHAR`)으로 안내합니다.
- **Rive `.riv` 커스텀 교체 확장성**: 추후 Rive 에디터에서 직접 제작한 `.riv` 파일을 `public/assets/rive/cat.riv` 등에 넣기만 하면 코드 수정 없이 `@rive-app/react-canvas`가 이를 감지하여 렌더링하며, 파일이 없을 때도 내장 60FPS Rive-Canvas 스켈레톤 렌더러가 완벽한 5종 동물 애니메이션을 출력합니다.

---

## 4. 검증 및 테스트 계획
1. **정적 타입 & 프로덕션 번들 빌드 검증**:
   - `npm run build` 실행 시 `@rive-app/react-canvas` 포함 번들링 및 TypeScript 컴파일 에러 0건 확인
2. **백엔드 초기화 & 5종 캐릭터 API 검증**:
   - 기존 유저 캐릭터 전체 초기화(`characterType: null`) 확인 및 `panda`, `tiger`, `pig` 등 신규 캐릭터 선택 저장 정상 응답 확인
