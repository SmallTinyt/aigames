/* =====================================================================
 * audio.js — 《回聲時鐘》Web Audio API 純程式合成音效引擎
 * ---------------------------------------------------------------------
 * 蒸氣龐克風格：齒輪運轉、指針滴答、倒流時空雜訊、金屬機械鎖、鐘樓和弦
 * 完全不依賴外部音訊檔案，跨瀏覽器自給自足
 * ===================================================================== */

(function (EC) {
  'use strict';

  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.muted = false;
      this.tickToggle = false;
      this.rewindLoop = null;
      this.rewindGain = null;
      this.gearAmbience = null;
      this.initialized = false;
    }

    /**
     * 初始化 AudioContext (需在使用者點擊或按鍵互動後啟動)
     */
    init() {
      if (this.initialized) return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(0.4, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
        this.initialized = true;
      } catch (e) {
        console.warn('AudioContext 初始化失敗:', e);
      }
    }

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    toggleMute() {
      this.muted = !this.muted;
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setValueAtTime(this.muted ? 0 : 0.4, this.ctx.currentTime);
      }
      return this.muted;
    }

    /**
     * 時鐘滴答聲 (Tick / Tock 交替)
     */
    playTick() {
      if (this.muted || !this.ctx) return;
      this.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      // Tick 與 Tock 頻率不同
      const freq = this.tickToggle ? 920 : 740;
      this.tickToggle = !this.tickToggle;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(120, t + 0.035);

      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.04);
    }

    /**
     * 跳躍音效（彈簧與蒸氣噴射感）
     */
    playJump() {
      if (this.muted || !this.ctx) return;
      this.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(480, t + 0.12);

      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.15);
    }

    /**
     * 著地音效
     */
    playLand() {
      if (this.muted || !this.ctx) return;
      this.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);

      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.09);
    }

    /**
     * 壓力板觸發 / 彈起 (金屬齒輪卡扣聲)
     */
    playPlate(isPressed) {
      if (this.muted || !this.ctx) return;
      this.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'square';
      const f1 = isPressed ? 440 : 660;
      const f2 = isPressed ? 220 : 330;
      osc.frequency.setValueAtTime(f1, t);
      osc.frequency.exponentialRampToValueAtTime(f2, t + 0.05);

      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.06);
    }

    /**
     * 鐵柵門開啟（低沉機械滑動聲）
     */
    playDoorOpen() {
      if (this.muted || !this.ctx) return;
      this.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.linearRampToValueAtTime(260, t + 0.25);

      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.3);
    }

    /**
     * 計時開關急促警告音
     */
    playTimerWarning() {
      if (this.muted || !this.ctx) return;
      this.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1100, t);

      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.05);
    }

    /**
     * 啟動時間倒流音效（持續奇幻滑音與雜訊波）
     */
    startRewind() {
      if (this.muted || !this.ctx || this.rewindLoop) return;
      this.resume();
      try {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(260, t);
        osc.frequency.linearRampToValueAtTime(700, t + 1.2);

        // 加上低頻振盪 (LFO) 做出時間波動的颤音
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.frequency.setValueAtTime(16, t);
        lfoGain.gain.setValueAtTime(50, t);
        lfo.connect(osc.frequency);
        lfo.start(t);

        gain.gain.setValueAtTime(0.02, t);
        gain.gain.linearRampToValueAtTime(0.25, t + 0.15);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(t);

        this.rewindLoop = { osc, lfo, gain };
      } catch (e) {
        console.warn('startRewind error:', e);
      }
    }

    /**
     * 停止時間倒流音效
     */
    stopRewind() {
      if (!this.rewindLoop || !this.ctx) return;
      try {
        const t = this.ctx.currentTime;
        const { osc, lfo, gain } = this.rewindLoop;
        gain.gain.linearRampToValueAtTime(0.001, t + 0.08);
        setTimeout(() => {
          try {
            osc.stop();
            lfo.stop();
          } catch (e) {}
        }, 90);
      } catch (e) {}
      this.rewindLoop = null;
    }

    /**
     * 回聲分身凝結形成音效 (發光水晶鐘鳴)
     */
    playEchoSpawn() {
      if (this.muted || !this.ctx) return;
      this.resume();
      const t = this.ctx.currentTime;
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + idx * 0.05);

        gain.gain.setValueAtTime(0.2, t + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.05 + 0.35);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(t + idx * 0.05);
        osc.stop(t + idx * 0.05 + 0.38);
      });
    }

    /**
     * 死亡音效 (崩解時鐘碎裂)
     */
    playDeath() {
      if (this.muted || !this.ctx) return;
      this.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, t);
      osc.frequency.exponentialRampToValueAtTime(50, t + 0.3);

      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.36);
    }

    /**
     * 通關勝利音效 (鐘樓鐘鳴大和弦)
     */
    playWin() {
      if (this.muted || !this.ctx) return;
      this.resume();
      const chords = [523.25, 659.25, 783.99, 1046.50]; // C Major
      chords.forEach((freq, i) => {
        const t = this.ctx.currentTime + i * 0.12;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0.28, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(t);
        osc.stop(t + 1.25);
      });
    }
  }

  EC.Sound = new SoundEngine();
})(typeof globalThis !== 'undefined' ? (globalThis.EC = globalThis.EC || {}) : (window.EC = window.EC || {}));
