# Mobile + Calls Backend Roadmap

## Current baseline

- Web chat backend uses `Socket.IO` + `Prisma`.
- Message send path had synchronous post-send work (ticket status and notifications), which increased latency for client ack.
- Mobile app did not exist in the repository.

## Stage 1 (implemented now)

### Backend optimization

- In `server/socket-server.ts`, `message:send` now:
  - persists message and emits to room first;
  - returns callback to client immediately;
  - moves non-critical post-send work to background async flow:
    - ticket auto-status transition;
    - chat notifications.

- Added short-lived in-memory caches for:
  - chat access checks (`chatId:userId`);
  - user identity lookup for socket auth (`userId -> display name`).

This reduces synchronous DB round-trips on frequent reconnect/join/send paths.

### React Native foundation

- Added a new Expo app in `mobile/`.
- Added runtime config for backend endpoints:
  - `apiBaseUrl`
  - `socketUrl`
- Added initial mobile service layer:
  - `src/services/chatApi.ts`
  - `src/services/socketClient.ts`

## Stage 2 (next)

1. Shared API/socket contract package for web + mobile (types/events/payload validation).
2. Mobile auth flow with existing NextAuth backend tokens.
3. Chat parity MVP:
   - chat list,
   - message list,
   - send message,
   - realtime updates.
4. Observability for chat latency:
   - p95 ack latency,
   - websocket reconnect rate,
   - callback timeout rate.

## Stage 3 (calls preparation)

1. Add call domain schema:
   - `CallSession`,
   - `CallParticipant`,
   - `CallEventLog`.
2. Add signaling namespace/events:
   - `call:invite`,
   - `call:ringing`,
   - `call:accepted`,
   - `call:ended`,
   - `call:participant-joined/left`.
3. Integrate SFU provider (LiveKit recommended for faster production path).
4. Add TURN for network fallback and call setup reliability.

## Suggested KPIs

- Chat message ack p95: under 300ms.
- Socket reconnect recovery p95: under 5s.
- Call setup success rate: above 98%.
- Call join time p95: under 3s.
