class AudioGame {
    static #audioContext = null;

    static #getAudioContext() {
        if (!AudioGame.#audioContext) {
            AudioGame.#audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        return AudioGame.#audioContext;
    }

    constructor(url, options = {}) {
        if (!url) {
            throw new Error('AudioGame: URL is required.');
        }

        this.url = url;
        this.context = AudioGame.#getAudioContext();
        this.buffer = null;
        this.source = null;
        this.gainNode = null;
        this.pannerNode = null;

        this._loop = options.loop || false;
        this._volume = typeof options.volume === 'number' ? Math.max(0, Math.min(1, options.volume)) : 1;
        this._pan = typeof options.pan === 'number' ? Math.max(-1, Math.min(1, options.pan)) : 0;
        this._autoplay = options.autoplay || false;

        this._currentTime = 0;
        this._duration = 0;
        this._isPlaying = false;
        this._isLoaded = false;

        this.#loadAudio();
    }

    async #loadAudio() {
        try {
            const response = await fetch(this.url);
            const arrayBuffer = await response.arrayBuffer();
            this.buffer = await this.context.decodeAudioData(arrayBuffer);
            this._duration = this.buffer.duration;
            this._isLoaded = true;

            if (this._autoplay) {
                this.play().catch(e => {
                    console.error(`Autoplay de "${this.url}" falló:`, e.message);
                });
            }

        } catch (error) {
            this.buffer = null;
            this._isLoaded = false;
            throw error;
        }
    }

    #createAndConnectNodes(offset = 0) {
        if (!this.buffer) {
            console.warn(`Cannot create source for "${this.url}". The audio is not loaded.`);
            return null;
        }

        if (this.source) {
            this.source.stop();
            this.source.disconnect();
            this.source = null;
        }

        this.source = this.context.createBufferSource();
        this.source.buffer = this.buffer;
        this.source.loop = this._loop;

        this.gainNode = this.context.createGain();
        this.gainNode.gain.value = this._volume;

        this.pannerNode = this.context.createStereoPanner();
        this.pannerNode.pan.value = this._pan;

        this.source.connect(this.gainNode);
        this.gainNode.connect(this.pannerNode);
        this.pannerNode.connect(this.context.destination);

        this.source.onended = () => {
            this._isPlaying = false;
            if (!this._loop) {
                 this._currentTime = 0;
            }
            this.source.disconnect();
            this.source = null;
            if (typeof this.onended === 'function') {
                this.onended();
            }
        };

        return this.source;
    }

    async play() {
        if (!this.buffer) {
            if (this._isLoaded === false) {
                 return Promise.reject(new Error('Audio not loaded or failed to load.'));
            } else {
                await new Promise(resolve => {
                    const checkBuffer = setInterval(() => {
                        if (this.buffer) {
                            clearInterval(checkBuffer);
                            resolve();
                        }
                    }, 50);
                });
            }
        }

        if (this.context.state === 'suspended') {
            try {
                await this.context.resume();
            } catch (e) {
                return Promise.reject(new Error('AudioContext suspended, user interaction required.'));
            }
        }

        if (!this._isPlaying || !this.source) {
            const currentOffset = this._currentTime;
            this.#createAndConnectNodes(currentOffset);
            this.source.start(0, currentOffset);
            this._isPlaying = true;

            if (!this._loop) {
                this._startTime = this.context.currentTime - currentOffset;
            } else {
                 this._startTime = this.context.currentTime;
            }
        }
        return Promise.resolve();
    }

    pause() {
        if (this.source && this._isPlaying) {
            this.source.stop();
            this._currentTime = (this.context.currentTime - this._startTime) % this.buffer.duration;
            this._isPlaying = false;
            this.source.disconnect();
            this.source = null;
        }
    }

    get loop() { return this._loop; }
    set loop(value) {
        this._loop = !!value;
        if (this.source) { this.source.loop = this._loop; }
    }

    get volume() { return this._volume; }
    set volume(value) {
        this._volume = Math.max(0, Math.min(1, value));
        if (this.gainNode) { this.gainNode.gain.value = this._volume; }
    }

    get pan() { return this._pan; }
    set pan(value) {
        this._pan = Math.max(-1, Math.min(1, value));
        if (this.pannerNode) { this.pannerNode.pan.value = this._pan; }
    }

    get autoplay() { return this._autoplay; }
    set autoplay(value) {
        this._autoplay = !!value;
        if (this._autoplay && this._isLoaded && !this._isPlaying) {
            this.play().catch(e => {});
        }
    }

    get currentTime() {
        if (this._isPlaying && this.source && this.context && this.buffer) {
            return (this.context.currentTime - this._startTime) % this.buffer.duration;
        }
        return this._currentTime;
    }
    set currentTime(value) {
        this._currentTime = Math.max(0, Math.min(value, this._duration));
        if (this._isPlaying) {
            this.pause();
            this.play();
        }
    }

    get duration() { return this._duration; }
    get paused() { return !this._isPlaying; }
    get readyState() { return this._isLoaded ? 4 : 0; }

    dispose() {
        this.pause();
        if (this.source) { this.source.disconnect(); this.source = null; }
        if (this.gainNode) { this.gainNode.disconnect(); this.gainNode = null; }
        if (this.pannerNode) { this.pannerNode.disconnect(); this.pannerNode = null; }
        this.buffer = null;
        this._isLoaded = false;
    }

    static closeAudioContext() {
        if (AudioGame.#audioContext && AudioGame.#audioContext.state !== 'closed') {
            AudioGame.#audioContext.close();
            AudioGame.#audioContext = null;
        }
    }
}
