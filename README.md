# WonderWave

WonderWave is an AI-powered video automation pipeline that generates and publishes YouTube Shorts from ClickUp tasks.

## Features

- ClickUp integration
- AI image generation
- Kokoro TTS narration
- Subtitle generation
- FFmpeg video rendering
- Automatic YouTube publishing
- Job queue and retry system
- Thumbnail upload support

## Pipeline

ClickUp Task
      ↓
Parse Script
      ↓
Generate Images
      ↓
Generate Narration
      ↓
Create Subtitles
      ↓
Render Video
      ↓
Upload to YouTube
      ↓
Update ClickUp Status

## Tech Stack

- Node.js
- FFmpeg
- Kokoro TTS
- ClickUp API
- YouTube Data API v3

## Installation

```bash
npm install
cp .env.example .env
npm start
```

## Project Structure

```
api/
config/
core/
jobs/
pipeline/
publishers/
services/
workers/
scripts/
```

## Status

Currently supports:

- ✅ ClickUp
- ✅ YouTube
- ✅ Automatic publishing
- ✅ Subtitle rendering
- ✅ Retry system
