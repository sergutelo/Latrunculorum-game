/* ============================================
   LUDUS LATRUNCULORUM — Sound Engine
   Web Audio API — No external files needed
   ============================================ */

const SFX = (() => {
    'use strict';

    let ctx = null;
    let enabled = true;
    let volume = 0.5;

    function getCtx() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    function setEnabled(v) { enabled = v; }
    function setVolume(v) { volume = Math.max(0, Math.min(1, v)); }
    function isEnabled() { return enabled; }

    // --- Utility oscillator ---
    function playTone(freq, duration, type = 'sine', gainVal = 0.3, fadeOut = true) {
        if (!enabled) return;
        const c = getCtx();
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, c.currentTime);
        gain.gain.setValueAtTime(gainVal * volume, c.currentTime);
        if (fadeOut) {
            gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
        }
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start(c.currentTime);
        osc.stop(c.currentTime + duration);
    }

    // --- Noise burst (for percussive sounds) ---
    function playNoise(duration, gainVal = 0.2, filterFreq = 3000) {
        if (!enabled) return;
        const c = getCtx();
        const bufferSize = c.sampleRate * duration;
        const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const source = c.createBufferSource();
        source.buffer = buffer;
        const filter = c.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = filterFreq;
        const gain = c.createGain();
        gain.gain.setValueAtTime(gainVal * volume, c.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(c.destination);
        source.start(c.currentTime);
        source.stop(c.currentTime + duration);
    }

    // ====== GAME SOUNDS ======

    /** Piece selected — short wooden tap */
    function select() {
        playTone(800, 0.08, 'square', 0.15);
        playNoise(0.05, 0.08, 4000);
    }

    /** Piece moved — slide/place on board */
    function move() {
        playTone(300, 0.12, 'sine', 0.2);
        playNoise(0.08, 0.1, 2000);
        setTimeout(() => playTone(500, 0.06, 'sine', 0.12), 60);
    }

    /** Enemy piece captured — metallic clash */
    function capture() {
        if (!enabled) return;
        playNoise(0.15, 0.3, 5000);
        playTone(200, 0.2, 'sawtooth', 0.2);
        setTimeout(() => {
            playTone(150, 0.15, 'square', 0.15);
            playNoise(0.1, 0.15, 3000);
        }, 80);
        setTimeout(() => playTone(100, 0.3, 'sine', 0.1), 150);
    }

    /** Dux captured — dramatic deep impact */
    function duxFall() {
        if (!enabled) return;
        playTone(80, 0.5, 'sawtooth', 0.35);
        playNoise(0.3, 0.25, 2000);
        setTimeout(() => playTone(60, 0.6, 'sine', 0.3), 100);
        setTimeout(() => playTone(50, 0.8, 'triangle', 0.2), 300);
        setTimeout(() => playNoise(0.2, 0.15, 1500), 200);
    }

    /** Victory — triumphant brass fanfare */
    function victory() {
        if (!enabled) return;
        const notes = [392, 523, 659, 784]; // G4, C5, E5, G5
        notes.forEach((freq, i) => {
            setTimeout(() => {
                playTone(freq, 0.4, 'square', 0.2);
                playTone(freq * 0.5, 0.4, 'sawtooth', 0.1);
            }, i * 180);
        });
        // Final chord
        setTimeout(() => {
            playTone(523, 0.8, 'square', 0.15);
            playTone(659, 0.8, 'square', 0.12);
            playTone(784, 0.8, 'square', 0.15);
            playTone(262, 0.8, 'sawtooth', 0.08);
        }, 800);
    }

    /** Defeat — somber descending tones */
    function defeat() {
        if (!enabled) return;
        const notes = [400, 350, 300, 200];
        notes.forEach((freq, i) => {
            setTimeout(() => playTone(freq, 0.35, 'sine', 0.18), i * 200);
        });
        setTimeout(() => playTone(100, 1.0, 'triangle', 0.12), 800);
    }

    /** Undo move — rewind blip */
    function undo() {
        playTone(600, 0.08, 'square', 0.12);
        setTimeout(() => playTone(400, 0.1, 'square', 0.1), 60);
    }

    /** Game start — Roman horn */
    function gameStart() {
        if (!enabled) return;
        playTone(262, 0.3, 'sawtooth', 0.15);
        setTimeout(() => playTone(330, 0.25, 'sawtooth', 0.15), 200);
        setTimeout(() => {
            playTone(392, 0.5, 'sawtooth', 0.2);
            playTone(196, 0.5, 'sawtooth', 0.08);
        }, 400);
    }

    /** Button click — subtle UI click */
    function click() {
        playTone(1000, 0.04, 'sine', 0.1);
    }

    /** Invalid action — error buzz */
    function invalid() {
        playTone(200, 0.1, 'square', 0.15);
        setTimeout(() => playTone(180, 0.12, 'square', 0.12), 80);
    }

    return {
        select, move, capture, duxFall,
        victory, defeat, undo, gameStart,
        click, invalid,
        setEnabled, setVolume, isEnabled
    };
})();
