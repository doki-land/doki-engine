class DokiPlayer extends HTMLElement {
    private audio: HTMLAudioElement | null = null;
    private isPlaying: boolean = false;
    private currentSong: {
        src: string;
        title: string;
        artist: string;
        album: string;
    } | null = null;

    static get observedAttributes(): string[] {
        return ["src", "title", "artist", "album"];
    }

    attributeChangedCallback(
        name: string,
        _oldValue: string | null,
        newValue: string | null,
    ): void {
        if (name === "src" && newValue) {
            this.currentSong = {
                src: newValue,
                title: this.getAttribute("title") || "Unknown Title",
                artist: this.getAttribute("artist") || "Unknown Artist",
                album: this.getAttribute("album") || "Unknown Album",
            };
            this.setupAudio();
            this.updateSongInfo();
        } else if (["title", "artist", "album"].includes(name)) {
            if (this.currentSong) {
                this.currentSong[name as keyof typeof this.currentSong] =
                    newValue ||
                    `Unknown ${name.charAt(0).toUpperCase() + name.slice(1)}`;
                this.updateSongInfo();
            }
        }
    }

    connectedCallback(): void {
        this.render();
        this.setupEventListeners();
    }

    private render(): void {
        this.attachShadow({ mode: "open" });
        this.shadowRoot!.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          max-width: 400px;
          background: #f5f5f5;
          border-radius: 8px;
          padding: 16px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
          font-family: Arial, sans-serif;
        }

        .song-info {
          margin-bottom: 16px;
        }

        .song-title {
          font-size: 18px;
          font-weight: bold;
          margin: 0 0 4px 0;
          color: #333;
        }

        .song-artist {
          font-size: 14px;
          color: #666;
          margin: 0 0 2px 0;
        }

        .song-album {
          font-size: 12px;
          color: #999;
          margin: 0;
        }

        .controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .play-pause {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: #3498db;
          color: white;
          border: none;
          font-size: 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .play-pause:hover {
          background: #2980b9;
        }

        .progress-container {
          margin-bottom: 12px;
        }

        .progress-bar {
          width: 100%;
          height: 4px;
          background: #ddd;
          border-radius: 2px;
          overflow: hidden;
          cursor: pointer;
        }

        .progress-fill {
          height: 100%;
          background: #3498db;
          width: 0%;
          transition: width 0.1s ease;
        }

        .time-info {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: #666;
          margin-top: 4px;
        }

        .volume-control {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .volume-slider {
          width: 80px;
          height: 4px;
          background: #ddd;
          border-radius: 2px;
          cursor: pointer;
        }

        .volume-fill {
          height: 100%;
          background: #3498db;
          width: 80%;
          transition: width 0.1s ease;
        }
      </style>
      
      <div class="song-info">
        <h3 class="song-title">${this.currentSong?.title || "No Song Selected"}</h3>
        <p class="song-artist">${this.currentSong?.artist || ""}</p>
        <p class="song-album">${this.currentSong?.album || ""}</p>
      </div>
      
      <div class="controls">
        <button class="play-pause" id="playPauseBtn">▶</button>
        <div class="volume-control">
          <span>🔊</span>
          <div class="volume-slider" id="volumeSlider">
            <div class="volume-fill" id="volumeFill"></div>
          </div>
        </div>
      </div>
      
      <div class="progress-container">
        <div class="progress-bar" id="progressBar">
          <div class="progress-fill" id="progressFill"></div>
        </div>
        <div class="time-info">
          <span id="currentTime">0:00</span>
          <span id="duration">0:00</span>
        </div>
      </div>
    `;
    }

    private setupAudio(): void {
        if (this.audio) {
            this.audio.pause();
            this.audio = null;
        }

        this.audio = new Audio(this.currentSong?.src);
        this.audio.addEventListener(
            "timeupdate",
            this.updateProgress.bind(this),
        );
        this.audio.addEventListener("ended", this.onSongEnd.bind(this));
        this.audio.addEventListener(
            "loadedmetadata",
            this.updateDuration.bind(this),
        );
    }

    private setupEventListeners(): void {
        const playPauseBtn = this.shadowRoot?.getElementById("playPauseBtn");
        const progressBar = this.shadowRoot?.getElementById("progressBar");
        const volumeSlider = this.shadowRoot?.getElementById("volumeSlider");

        if (playPauseBtn) {
            playPauseBtn.addEventListener(
                "click",
                this.togglePlayPause.bind(this),
            );
        }

        if (progressBar) {
            progressBar.addEventListener("click", this.seek.bind(this));
        }

        if (volumeSlider) {
            volumeSlider.addEventListener("click", this.setVolume.bind(this));
        }
    }

    private togglePlayPause(): void {
        if (!this.audio) return;

        if (this.isPlaying) {
            this.audio.pause();
            const playPauseBtn =
                this.shadowRoot?.getElementById("playPauseBtn");
            if (playPauseBtn) {
                playPauseBtn.textContent = "▶";
            }
        } else {
            this.audio.play();
            const playPauseBtn =
                this.shadowRoot?.getElementById("playPauseBtn");
            if (playPauseBtn) {
                playPauseBtn.textContent = "⏸";
            }
        }

        this.isPlaying = !this.isPlaying;
    }

    private updateProgress(): void {
        if (!this.audio) return;

        const progress = (this.audio.currentTime / this.audio.duration) * 100;
        const progressFill = this.shadowRoot?.getElementById("progressFill");
        const currentTimeEl = this.shadowRoot?.getElementById("currentTime");

        if (progressFill) {
            progressFill.style.width = `${progress}%`;
        }

        if (currentTimeEl) {
            currentTimeEl.textContent = this.formatTime(this.audio.currentTime);
        }
    }

    private updateDuration(): void {
        if (!this.audio) return;

        const durationEl = this.shadowRoot?.getElementById("duration");
        if (durationEl) {
            durationEl.textContent = this.formatTime(this.audio.duration);
        }
    }

    private updateSongInfo(): void {
        const titleEl = this.shadowRoot?.querySelector(".song-title");
        const artistEl = this.shadowRoot?.querySelector(".song-artist");
        const albumEl = this.shadowRoot?.querySelector(".song-album");

        if (titleEl) {
            titleEl.textContent = this.currentSong?.title || "No Song Selected";
        }

        if (artistEl) {
            artistEl.textContent = this.currentSong?.artist || "";
        }

        if (albumEl) {
            albumEl.textContent = this.currentSong?.album || "";
        }
    }

    private seek(e: MouseEvent): void {
        if (!this.audio) return;

        const progressBar = this.shadowRoot?.getElementById("progressBar");
        if (!progressBar) return;

        const rect = progressBar.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        this.audio.currentTime = pos * this.audio.duration;
    }

    private setVolume(e: MouseEvent): void {
        if (!this.audio) return;

        const volumeSlider = this.shadowRoot?.getElementById("volumeSlider");
        if (!volumeSlider) return;

        const rect = volumeSlider.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        const volume = Math.max(0, Math.min(1, pos));

        this.audio.volume = volume;

        const volumeFill = this.shadowRoot?.getElementById("volumeFill");
        if (volumeFill) {
            volumeFill.style.width = `${volume * 100}%`;
        }
    }

    private onSongEnd(): void {
        this.isPlaying = false;
        const playPauseBtn = this.shadowRoot?.getElementById("playPauseBtn");
        if (playPauseBtn) {
            playPauseBtn.textContent = "▶";
        }
    }

    private formatTime(seconds: number): string {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
    }
}

// 确保在全局作用域中注册组件
if (!customElements.get("doki-player")) {
    customElements.define("doki-player", DokiPlayer);
}

export default DokiPlayer;
