# SUNO Discord Bot

## Description

SUNO Discord Bot is a versatile music bot designed to play SUNO music directly in your Discord server. Simply provide a SUNO URL, and the bot will play the music for you. The bot also allows you to manage the music queue with commands to add, remove, skip, pause, resume, and stop music. Additionally, you can search for local SUNO music and even read Reddit threads aloud. **It can also read Reddit thread if you provide a `GOOGLE_TTS_API_KEY`**

## Commands

| Command      | Description                   | Options                                                                                          |
|--------------|-------------------------------|--------------------------------------------------------------------------------------------------|
| `suno_search`| Search a local SUNO music     | - `filter`: (Optional) Search text                                                               |
| `suno`       | Play a SUNO music             | - `url`: (Required) SUNO URL                                                                     |
| `read`       | Read a Reddit thread (enabled only if `GOOGLE_TTS_API_KEY` is provided)          | - `url`: (Required) Reddit URL                                                                   |
| `skip`       | Skip a sound                  | None                                                                                             |
| `pause`      | Pause sound                   | None                                                                                             |
| `resume`     | Resume sound                  | None                                                                                             |
| `stop`       | Stop sound                    | None                                                                                             |

## Setup

To configure the SUNO Discord Bot, you need to set the following environment variables:

- **Required:**
  - `DISCORD_ID`: Your Discord bot ID.
  - `DISCORD_TOKEN`: Your Discord bot token.

- **Optional:**
  - `GOOGLE_TTS_API_KEY`: API key for Google Text-to-Speech, required if you want the bot to read Reddit threads.

A Docker image is also available via [Docker Hub](https://hub.docker.com/r/pekno/sunobot).

With these configurations, you can start your SUNO Discord Bot and enjoy seamless music playback and Reddit thread reading in your Discord server.