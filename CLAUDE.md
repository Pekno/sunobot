# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Discord bot (TypeScript, discord.js v14 + `@discordjs/voice`) that plays songs from suno.com in a voice channel. It has a queue/player embed and a `/profile` browser. Song and lyrics generation (OpenAI + authenticated Suno API) was removed because Suno now requires a captcha. Remnants of it are still in the tree; see "Leftovers" below.

## Commands

```sh
npm ci
npm run dev            # run from source with tsx (loads src/env/.env)
npm run build          # wipes dist/, runs tsc, copies src/locales -> dist/locales
npm start              # run the build (node dist/main/main.js)
npm run typecheck
npm run lint           # / lint:fix
npm run format         # / format:check (Prettier: tabs, single quotes, width 80)
```

- There are no automated tests; `npm test` just exits 1.
- Runtime requirements:
  - Node ≥22.12, required by `@discordjs/voice` 0.19.
  - FFmpeg on `PATH`. The Docker image installs it.
- TypeScript is pinned to `~6.0`, because typescript-eslint doesn't support TS ≥6.1/7 yet. `tsconfig` uses `module: nodenext`, so with no `"type"` in `package.json` the output is CommonJS.
- npm 11 skips dependency install scripts that aren't allowlisted, e.g. esbuild's postinstall. Nothing needs them so far.

## Configuration

Env vars are read in `src/config/config.ts`. That module first loads `src/env/.env` with dotenv, relative to the compiled file, so the built equivalent would be `dist/env/.env`. Docker passes real env vars instead.

- `LOCALE` must match a filename in `src/locales/`. `DISCORD_TOKEN` and `DISCORD_ID` are required. A failed login logs the error and exits with code 1.
- `SHOULD_SAVE_LOCALY` defaults to true. `false`, `0`, `no`, `off` or an empty string disable it.
- `SAVED_DATA_PATH` defaults to `./suno`, relative to the cwd.
- `LOG_LEVEL` defaults to `warn` (`warning` is accepted). `main.ts` applies it to the `Loggers` logger from `@pekno/simple-discordbot`. That logger writes to the console and to `node_modules/@pekno/simple-discordbot/dist/logs/`, not `src/logs/`.

## Architecture

```
main.ts ── SimpleDiscordBot<AudioService> (@pekno/simple-discordbot)
              │  commands defined inline in main.ts, dispatched to:
              ▼
         AudioService ── SunoPlayer (queue, AudioPlayer, player embed message)
              │
         SunoService ── SunoApi            (unofficial studio-api-prod.suno.com)
                     └─ LocalAudioFileService (optional disk cache)
```

### Interaction routing (lives in the external `@pekno/simple-discordbot` package, by the same author)

Commands are `Command` / `AutoCompleteCommand` objects pushed onto a `CommandList` in `src/main/main.ts`. They are re-registered **globally** through the Discord REST API on every startup. The framework maps each interaction to a command name:

| Interaction | Resolved name | `extraInfo` passed to `execute` |
|---|---|---|
| Slash command | `commandName` | none |
| Autocomplete | `<commandName>_autocomplete` | none |
| String select menu | its `customId` | selected value |
| Button | `button_<customId up to first ';'>`, matched against a command's `name` or `clickAlias` | `key:=value` segments after `;`, parsed into an object |
| Modal submit | `submit_<customId>` | same as buttons, plus fields |

Buttons with customId `prev` or `next` are skipped by the framework, because `PaginatedEmbed` handles them with its own collector. So:

- Player buttons use customId `sunoplayer_<action>` and pair with `clickAlias: 'button_sunoplayer_<action>'`.
- The `PaginatedEmbed` select menu uses customId `play`. It invokes the `play` command with the clip ID as `extraInfo`.

Errors thrown inside `execute`, usually `new LocaleError('i18n.key')`, are caught by the framework and shown to the user as an ephemeral `⚠️ message ⚠️`.

### Playback

- Playback state is per guild. `AudioService._guilds` maps each guild ID to a `GuildAudio`, which holds that guild's `SunoPlayer` (queue, AudioPlayer, player message), `VoiceConnection` and `PlayerSubscription`.
  - A `GuildAudio` is created on the guild's first command and is never removed.
  - Command handlers get their guild's player through `handleInteraction`, so new commands should use that player too, rather than adding state to `AudioService`.
  - `SunoService` and the local cache are shared across guilds.
- `leaveVoiceChannel(guildId)` can be called twice: `stop()` calls it, then the player going idle calls it again. It must stay idempotent.
- The auto-reconnect only acts if the connection that dropped is still the guild's current one.
- `AudioService.handleInteraction` wraps every queue command:
  1. Defer an ephemeral reply.
  2. Run the action.
  3. Join or bind the voice and text channel, unless `preventForceJoinVC` is set. Skip and stop set it, since they can trigger a leave.
  4. Auto-delete the reply after 10 s.
- When the `AudioPlayer` goes `Idle`, `SunoPlayer.next()` runs. An empty queue makes it leave voice and disable the player embed's buttons. A clip that fails to build an audio resource is skipped. `next()` runs inside a player event listener, so it must never throw.
- `SunoClip.audioResource` passes a **URL or file path string** to `createAudioResource`, so FFmpeg opens the source itself. MP4 needs a seekable input; a piped HTTP stream would fail.

### Suno API and audio (state as of Oct 2026)

`src/api/sunoApi.ts` makes unauthenticated calls with a random Chrome user agent. The endpoints are undocumented, so verify them with curl before changing anything.

- `GET /api/clip/{id}` returns one clip.
- `GET /api/profiles/{handle}?page=N&playlists_sort_by=…&clips_sort_by=…`:
  - Both sort params are required; without them the API answers 422.
  - About 20 clips per page, and pages can overlap, so clips are de-duplicated by id.
  - Playlists in this payload come back with **empty `playlist_clips`**.
- `GET /api/playlist/{id}?page=N` is called per playlist to fill those playlists in.
- **Audio:**
  - `audio_url` is now a `…/api/forbidden` placeholder.
  - `media_urls[]` points at `.m4a` files with `"encoding": "1.0.0"`. They are **encrypted** and only Suno's web player can decode them. Do not use them.
  - Playback uses the public `video_url` (`cdn1.suno.ai/<id>.mp4`), which carries a plain AAC track. Not every clip has a rendered video, so `SunoService.isPlayable` checks with a HEAD request before queueing.
- **Links** are parsed in `src/utils/sunoUrl.ts`:
  - Accepted: `suno.com/song/<uuid>`, `/embed/<uuid>`, legacy `app.suno.ai`, and bare UUIDs.
  - `suno.com/s/<code>` share links don't contain the ID. `SunoApi.resolveShareLink` follows their redirects, and unknown codes redirect to `/`.
  - Profiles accept `handle`, `@handle` or `suno.com/@handle`.

### Local cache (`SHOULD_SAVE_LOCALY`)

- Layout: `<SAVED_DATA_PATH>/<handle>/{profile.json, <clipId>.json, <clipId>.mp4}`. Older caches contain `.mp3` files, which still play.
- `SunoService.getClip` checks the cache first, searching recursively for `<id>.json`. A hit becomes a `LocalSunoClip`, which streams the local file when it exists and falls back to the remote video otherwise.
- On a cache miss, the clip is fetched online and `saveClip` runs without being awaited. `saveClip` retries up to 10× every 30 s until the clip is `complete` and its video is reachable. Retries refresh through `SunoApi` directly, because going through `SunoService.getClip` would start another save.
- `profile.json` is only written by `/profile`. Folders created by `/play` don't have one, and the autocomplete skips them. It returns at most 25 choices, which is Discord's limit.

### i18n

- The available locales are whatever files exist in `src/locales/`. `en.json` and `fr.json` must keep identical keys.
- `main.ts` configures the global `i18n`, which app code uses (`i18n.__`, `LocaleError`). The framework creates its own i18n instance but reads the same directory, so the `error.discord.*` keys are consumed by the framework and must stay.
- `updateFiles` keeps its default of `true`: if code references a missing key at runtime, i18n writes that key into the locale JSON.
- Reply strings in `AudioService` and the slash-command descriptions are hard-coded English.

### Leftovers from the removed generation feature

`SunoSession`, `SunoSong`, most `error.suno.*` / `error.openai.*` locale keys, and the `ModalSubmitInteraction` branch in `AudioService.handleInteraction`.

## Release

Pushing a `v*` tag runs `.github/workflows/docker-image.yml`:

1. Builds `dist/` on Node 24.
2. Builds the image. The Dockerfile uses `node:24-slim` plus ffmpeg, runs `npm ci --omit=dev`, copies only `dist/`, and runs `node ./main/main.js`.
3. Pushes `latest` and `<tag-without-v>` to Docker Hub.

The image version comes from the git tag, not from `package.json`. Mount a volume at `/usr/src/app/suno` to persist the cache.
