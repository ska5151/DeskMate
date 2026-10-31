# 상세 기획 및 구현 계획서 (Plan): 채팅방 입장 시 기존 접속자 캐릭터 표시 및 실시간 채팅·상단 버튼 모션 동기화 수정

본 문서는 승인된 [intent.md](file:///c:/project/DeskMate/intent/fix-multiplayer-room-sync/intent.md)를 바탕으로, 멀티플레이어 채팅방 입장 시 기존 접속자 표시 및 실시간 채팅·상단 버튼 모션 동기화를 완성하기 위한 상세 구현 계획입니다.

---

## 1. 세부 기획 및 기능 요구사항 명세

### 1.1 단일 공유 룸 세션 허브(`RoomRealtimeHub`) 도입 (`src/services/socket.ts`)
- 한 브라우저 탭 내에서 `MainWindow`와 `OverlayWindow`가 각각 `createSocketConnection()`을 호출하더라도, 내부적으로 **단일 `RoomRealtimeHub` 인스턴스**의 상태(`roomUsers`, `pomodoro`, `RealtimeChannel`, `BroadcastChannel`)를 공유하도록 재설계합니다.
- 이를 통해 동일 탭 내에서 `supabaseClient.channel('deskmate_room_${roomId}')`가 중복 호출되어 구독이 깨지거나 상단 버튼 이벤트가 누락되는 현상을 원천 차단합니다.

### 1.2 신규 입장 시 양방향 상태 동기화 핸드셰이크 (`requestRoomSync`)
1. **입장 즉시 상태 요청 및 내 캐릭터 전파**:
   - 방 입장(`joinRoom`) 및 Supabase 채널 `SUBSCRIBED` 완료 시(그리고 500ms 후 1회 확인 전송), 신규 입장자가 `requestRoomSync` 이벤트에 자신의 캐릭터 정보(`myChar`)를 담아 `Supabase Realtime`과 `BroadcastChannel`로 전송합니다.
2. **기존 접속자의 즉시 응답**:
   - 이미 방에 접속해 있던 다른 계정이 `requestRoomSync` 또는 Presence `join` 이벤트를 수신하면:
     - 신규 입장자의 캐릭터를 즉시 자신의 `roomUsers`에 반영해 화면에 표시합니다.
     - 자신의 최신 캐릭터 상태(`this.roomUsers[this.myUserId]`)를 `roomStateUpdate` 이벤트로 즉시 브로드캐스트하여, **신규 입장자 화면에 기존 접속자의 캐릭터와 현재 위치가 즉시 나타나도록** 보장합니다.
3. **이동 완료 시 Presence 위치 갱신**:
   - 캐릭터 이동 후 정지(`state === 'idle'`) 시점에 `channel.track(updatedUser)`를 갱신하여, Presence 상태에도 항상 최신 좌표(`x`, `y`, `direction`)가 유지되도록 합니다.

### 1.3 실시간 채팅·상단 버튼(이모트, 주사위, 가위바위보, 타이머) 동기화 강화
- 상단 바의 이모트(`triggerEmote`), 미니게임(`sendMessage`: `/주사위`, `/가위바위보`), 포모도로(`pomodoroControl`) 및 캐릭터 월드 내 채팅·이동 이벤트가 공유 허브의 정상 구독된 단일 채널을 통해 모든 접속자에게 브로드캐스트됩니다.
- 또한 퇴장(`leaveRoom`) 시 `userLeftRoom` 브로드캐스트를 전송하여 다른 접속자 화면에서도 퇴장한 캐릭터가 즉시 제거되도록 처리합니다.

---

## 2. 단계별 구현 계획 (구현 체크리스트)

- [x] **Phase 1: `src/services/socket.ts` 단일 공유 허브 및 양방향 동기화 구현**
  - [x] `MainWindow`와 `OverlayWindow`가 공유하는 `RoomRealtimeHub` 구조로 리팩토링하여 채널 중복 구독 충돌 제거
  - [x] 방 입장 시 `requestRoomSync` 핸드셰이크 및 Presence `sync`/`join`/`leave` 연동 구현
  - [x] `characterEmote`, `receiveMessage`(일반 채팅 및 주사위·가위바위보), `characterMoved`, `characterInteraction`, `pomodoroUpdate`, `userLeftRoom` 실시간 브로드캐스트 연동 검증
- [x] **Phase 2: 프로덕션 빌드(`npm run build`) 및 검증**
  - [x] `npm run build` 실행하여 TypeScript 및 번들 에러 0건 확인

---

## 3. 영향 범위 및 고려사항
- `MainWindow.tsx`와 `OverlayWindow.tsx`의 기존 `socket.on(...)` 및 `socket.emit(...)` 인터페이스는 그대로 유지하면서 `src/services/socket.ts` 내부 멀티플렉싱 구조를 개선하므로 사이드 이펙트가 없습니다.
- 같은 브라우저의 다른 탭(`BroadcastChannel`)뿐만 아니라 시크릿 창, 다른 브라우저, 모바일-PC 간(`Supabase Realtime Broadcast & Presence`)에서도 동일하게 동작합니다.

---

## 4. 검증 및 테스트 계획
1. **기존 접속자 표시 확인**: 계정 A가 방에 입장해 있는 상태에서 계정 B로 같은 방에 입장했을 때, 계정 B 화면에 계정 A 캐릭터가 즉시 표시되고 계정 A 화면에도 계정 B 캐릭터가 표시되는지 확인
2. **상대방 채팅 및 상단 버튼 모션 확인**: 상대방이 채팅을 입력하거나 상단 이모트(인사, 점프, 댄스, 하트, 잠자기) 및 주사위·가위바위보 버튼을 눌렀을 때 내 화면에서도 상대방 캐릭터의 모션과 말풍선이 즉시 표시되는지 확인
3. **프로덕션 빌드 확인**: `npm run build` 성공 확인
