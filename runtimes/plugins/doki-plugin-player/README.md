# 🎵 Doki Player

A Web Component music player for static sites (Doki Engine, Hexo, Hugo, plain HTML, and more).

## ✨ Features

- Native Web Component
- Play / pause
- Seekable progress
- Volume control
- Title / artist / album display
- Responsive layout

## 📦 Install

```bash
pnpm install
pnpm build
```

## 🚀 Usage

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Doki Player</title>
</head>
<body>
  <doki-player
    src="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
    title="Sample track"
    artist="Artist"
    album="Album"
  ></doki-player>

  <script type="module" src="./dist/doki-player.js"></script>
</body>
</html>
```

### Attributes

- `src` — audio URL
- `title` — track title
- `artist` — artist name
- `album` — album name

## 🛠 Develop

```bash
pnpm dev
pnpm build
pnpm preview
```

## 📁 Layout

```
doki-player/
├── dist/
├── src/doki-player.ts
├── package.json
├── tsconfig.json
├── vite.config.js
└── README.md
```

## 🌐 In static frameworks

Drop the built script into your templates (Doki, Hexo, Hugo, etc.) and use `<doki-player>`:

```html
<script type="module" src="/path/to/doki-player.js"></script>
<doki-player
  src="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
  title="Sample track"
  artist="Artist"
  album="Album"
></doki-player>
```

## 🧱 Stack

- Web Components
- Vite
- TypeScript

## 🌍 Browsers

Modern Chromium, Firefox, Safari, and Edge.

## 📄 License

MIT
