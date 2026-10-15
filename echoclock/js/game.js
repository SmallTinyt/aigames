/* =====================================================================
 * game.js — 《回聲時鐘》主遊戲邏輯、回聲錄製回放與狀態機
 * ---------------------------------------------------------------------
 * 蒸氣龐克 2D 解謎平台：
 * - 60 FPS 固定物理更新循環
 * - 玩家每幀軌跡錄製、倒流回帶與回聲分身（Echo）生成回放
 * - 步數與時間記錄、1~3 星判定、localStorage 進度儲存
 * - 主選單、關卡選擇、暫停與結算 UI 控制
 * ===================================================================== */

(function (EC) {
  'use strict';

  const MAX_REWIND_SECONDS = 5.0; // 最多可倒流 5 秒
  const FPS = 60;
  const DT = 1 / FPS;
  const MAX_HISTORY_FRAMES = Math.round(MAX_REWIND_SECONDS * FPS); // 300 幀

  /**
   * 玩家實體類別
   */
  class Player {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.w = EC.PLAYER_W;
      this.h = EC.PLAYER_H;
      this.facing = 1;
      this.onGround = false;
      this.isDead = false;

      // 跳躍緩衝與郊狼時間手感優化
      this.jumpBuffer = 0;
      this.coyoteTimer = 0;
    }

    /**
     * 擷取當前物理快照
     */
    captureSnapshot() {
      return {
        x: this.x,
        y: this.y,
        vx: this.vx,
        vy: this.vy,
        facing: this.facing,
        onGround: this.onGround,
        isDead: this.isDead,
      };
    }

    /**
     * 從快照還原狀態
     */
    applySnapshot(s) {
      this.x = s.x;
      this.y = s.y;
      this.vx = s.vx;
      this.vy = s.vy;
      this.facing = s.facing;
      this.onGround = s.onGround;
      this.isDead = s.isDead;
    }
  }

  /**
   * 回聲分身實體類別 (回放過去的玩家軌跡)
   */
  class Echo {
    constructor(frames) {
      this.frames = frames; // 軌跡影格陣列
      this.frameIndex = 0;
      this.w = EC.PLAYER_W;
      this.h = EC.PLAYER_H;
      this.x = frames[0] ? frames[0].x : 0;
      this.y = frames[0] ? frames[0].y : 0;
      this.vx = 0;
      this.vy = 0;
      this.facing = 1;
      this.onGround = true;
      this.isDead = false;
    }

    update() {
      if (this.frameIndex < this.frames.length) {
        const s = this.frames[this.frameIndex];
        this.x = s.x;
        this.y = s.y;
        this.vx = s.vx;
        this.vy = s.vy;
        this.facing = s.facing;
        this.onGround = s.onGround;
        this.isDead = s.isDead;
        this.frameIndex++;
      } else {
        // 回放結束後，持續定格停留在最後一幀（維持踩住機關）
        const last = this.frames[this.frames.length - 1];
        if (last) {
          this.x = last.x;
          this.y = last.y;
          this.vx = 0;
          this.vy = 0;
          this.facing = last.facing;
          this.onGround = last.onGround;
        }
      }
    }
  }

  /**
   * 遊戲核心控制器
   */
  class GameApp {
    constructor() {
      this.canvas = document.getElementById('game-canvas');
      this.renderer = new EC.GameRenderer(this.canvas);

      // 輸入狀態
      this.keys = {};
      this.prevKeys = {};

      // 遊戲狀態 (MENU, LEVEL_SELECT, PLAYING, PAUSED, VICTORY)
      this.state = 'MENU';
      this.currentLevelIndex = 0;
      this.world = null;
      this.player = null;
      this.echoes = [];

      // 玩家軌跡錄製緩衝區
      this.history = [];
      this.isRewinding = false;
      this.rewindEnergy = MAX_REWIND_SECONDS;
      this.recordedDuringRewind = [];

      // 計時與統計
      this.levelTime = 0;
      this.levelSteps = 0;
      this.lastTickTime = 0;
      this.prevMoveDir = 0;

      // 本地儲存資料
      this.saveData = this.loadSaveData();

      this.initInput();
      this.initUI();
      this.buildLevelGrid();

      // 啟動 60 FPS 迴圈
      this.lastTimestamp = performance.now();
      requestAnimationFrame(this.loop.bind(this));
    }

    /**
     * 讀取存檔
     */
    loadSaveData() {
      try {
        const d = localStorage.getItem('echoclock_save');
        if (d) return JSON.parse(d);
      } catch (e) {}
      return {
        unlockedLevel: 0, // 預設解鎖第 1 關 (索引 0)
        levelStats: {},    // { [idx]: { stars, time, steps } }
      };
    }

    /**
     * 寫入存檔
     */
    saveProgress() {
      try {
        localStorage.setItem('echoclock_save', JSON.stringify(this.saveData));
      } catch (e) {}
    }

    /**
     * 鍵盤輸入事件註冊
     */
    initInput() {
      window.addEventListener('keydown', (e) => {
        EC.Sound.init();
        EC.Sound.resume();

        // 避免特定功能鍵捲動頁面
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
          e.preventDefault();
        }

        this.keys[e.code] = true;

        if (e.code === 'Escape') {
          if (this.state === 'PLAYING') {
            this.setPause(true);
          } else if (this.state === 'PAUSED') {
            this.setPause(false);
          }
        }

        // 快速鍵 R 在死亡或非倒流時短按提示，按住則在遊戲循環處理
        if (e.code === 'KeyC' && this.state === 'PLAYING') {
          // 清除所有回聲分身
          this.clearEchoes();
        }
        if (e.code === 'KeyT' && this.state === 'PLAYING') {
          // 重新開始當前關卡
          this.loadLevel(this.currentLevelIndex);
        }
      });

      window.addEventListener('keyup', (e) => {
        this.keys[e.code] = false;
      });

      // 視窗失焦時暫停
      window.addEventListener('blur', () => {
        if (this.state === 'PLAYING') {
          this.setPause(true);
        }
      });
    }

    /**
     * UI 元素綁定
     */
    initUI() {
      // 主選單按鈕
      document.getElementById('btn-play').addEventListener('click', () => {
        EC.Sound.init();
        const startLvl = this.saveData.unlockedLevel || 0;
        this.loadLevel(startLvl);
      });
      document.getElementById('btn-level-select').addEventListener('click', () => {
        EC.Sound.init();
        this.showScreen('LEVEL_SELECT');
      });

      // 關卡選擇返回按鈕
      document.getElementById('btn-back-menu').addEventListener('click', () => {
        this.showScreen('MENU');
      });

      // 暫停介面按鈕
      document.getElementById('btn-resume').addEventListener('click', () => {
        this.setPause(false);
      });
      document.getElementById('btn-restart-pause').addEventListener('click', () => {
        this.setPause(false);
        this.loadLevel(this.currentLevelIndex);
      });
      document.getElementById('btn-pause-menu').addEventListener('click', () => {
        this.setPause(false);
        this.showScreen('MENU');
      });

      // 通關介面按鈕
      document.getElementById('btn-next-level').addEventListener('click', () => {
        const next = this.currentLevelIndex + 1;
        if (next < EC.LEVELS.length) {
          this.loadLevel(next);
        } else {
          this.showScreen('LEVEL_SELECT');
        }
      });
      document.getElementById('btn-replay-level').addEventListener('click', () => {
        this.loadLevel(this.currentLevelIndex);
      });
      document.getElementById('btn-win-menu').addEventListener('click', () => {
        this.showScreen('LEVEL_SELECT');
      });

      // 頂部 HUD 按鈕
      document.getElementById('hud-btn-pause').addEventListener('click', () => {
        if (this.state === 'PLAYING') this.setPause(true);
      });
      document.getElementById('hud-btn-restart').addEventListener('click', () => {
        if (this.state === 'PLAYING') this.loadLevel(this.currentLevelIndex);
      });
      document.getElementById('hud-btn-clear-echo').addEventListener('click', () => {
        if (this.state === 'PLAYING') this.clearEchoes();
      });
      document.getElementById('hud-btn-mute').addEventListener('click', () => {
        const muted = EC.Sound.toggleMute();
        document.getElementById('hud-btn-mute').textContent = muted ? '🔇 靜音' : '🔊 音效';
      });
    }

    /**
     * 建立 30 關關卡選擇卡片網格
     */
    buildLevelGrid() {
      const grid = document.getElementById('level-grid');
      grid.innerHTML = '';

      EC.LEVELS.forEach((lvl, idx) => {
        const card = document.createElement('div');
        card.className = 'level-card';

        const isUnlocked = idx <= (this.saveData.unlockedLevel || 0);
        if (!isUnlocked) {
          card.classList.add('locked');
        }

        const stat = this.saveData.levelStats[idx];
        const starsCount = stat ? stat.stars : 0;
        let starStr = '☆☆☆';
        if (starsCount === 1) starStr = '★☆☆';
        else if (starsCount === 2) starStr = '★★☆';
        else if (starsCount === 3) starStr = '★★★';

        card.innerHTML = `
          <div class="lvl-num">${idx + 1}</div>
          <div class="lvl-name">${lvl.name}</div>
          <div class="lvl-stars ${starsCount > 0 ? 'has-stars' : ''}">${isUnlocked ? starStr : '🔒'}</div>
        `;

        if (isUnlocked) {
          card.addEventListener('click', () => {
            this.loadLevel(idx);
          });
        }

        grid.appendChild(card);
      });
    }

    /**
     * 切換顯示全螢幕視窗
     */
    showScreen(screenName) {
      this.state = screenName;
      document.querySelectorAll('.screen-overlay').forEach((el) => el.classList.remove('active'));

      if (screenName === 'MENU') {
        document.getElementById('menu-screen').classList.add('active');
      } else if (screenName === 'LEVEL_SELECT') {
        this.buildLevelGrid();
        document.getElementById('level-select-screen').classList.add('active');
      } else if (screenName === 'PAUSED') {
        document.getElementById('pause-screen').classList.add('active');
      } else if (screenName === 'VICTORY') {
        document.getElementById('win-screen').classList.add('active');
      }
    }

    setPause(pause) {
      if (pause) {
        if (this.state === 'PLAYING') {
          this.state = 'PAUSED';
          if (this.isRewinding) {
            this.isRewinding = false;
            EC.Sound.stopRewind();
          }
          document.getElementById('pause-screen').classList.add('active');
        }
      } else {
        if (this.state === 'PAUSED') {
          this.state = 'PLAYING';
          document.getElementById('pause-screen').classList.remove('active');
        }
      }
    }

    /**
     * 清除所有分身
     */
    clearEchoes() {
      this.echoes = [];
      this.updateHud();
    }

    /**
     * 載入指定關卡
     */
    loadLevel(index) {
      if (index < 0 || index >= EC.LEVELS.length) return;
      this.currentLevelIndex = index;
      const lvlData = EC.LEVELS[index];

      this.world = new EC.PhysicsWorld(lvlData);
      this.player = new Player(this.world.spawnPos.x, this.world.spawnPos.y);
      this.echoes = [];
      this.history = [];
      this.recordedDuringRewind = [];
      this.isRewinding = false;
      this.rewindEnergy = MAX_REWIND_SECONDS;

      this.levelTime = 0;
      this.levelSteps = 0;
      this.lastTickTime = 0;
      this.prevMoveDir = 0;

      // 提示文字更新
      document.getElementById('level-hint-bar').textContent = lvlData.hint || '';
      document.getElementById('hud-level-num').textContent = `關卡 ${index + 1} - ${lvlData.name}`;

      this.showScreen('PLAYING');
      this.updateHud();
    }

    /**
     * 主遊戲循環
     */
    loop(timestamp) {
      const elapsed = (timestamp - this.lastTimestamp) / 1000;
      this.lastTimestamp = timestamp;

      if (this.state === 'PLAYING') {
        this.updateGame(DT);
      }

      // 渲染畫面
      if (this.world && this.player) {
        this.renderer.updateCamera(this.player, this.world.width, this.world.height);
        this.renderer.render(
          DT,
          this.world,
          this.player,
          this.echoes,
          this.isRewinding,
          this.rewindEnergy / MAX_REWIND_SECONDS
        );
      }

      requestAnimationFrame(this.loop.bind(this));
    }

    /**
     * 遊戲邏輯與時間倒流核心處理
     */
    updateGame(dt) {
      const isRKeyDown = !!(this.keys['KeyR']);

      // 1. 處理時間倒流模式 (Hold R)
      if (isRKeyDown && this.rewindEnergy > 0.05 && this.history.length > 2) {
        if (!this.isRewinding) {
          this.isRewinding = true;
          this.recordedDuringRewind = [];
          EC.Sound.startRewind();
        }

        // 倒流消耗沙漏能量
        this.rewindEnergy = Math.max(0, this.rewindEnergy - dt * 1.4);

        // 倒退歷史影格（以 2 倍速倒退，手感乾脆爽快）
        const rewindSteps = 2;
        for (let i = 0; i < rewindSteps; i++) {
          if (this.history.length > 0) {
            const snap = this.history.pop();
            this.recordedDuringRewind.unshift(snap); // 記錄剛才被倒退的影格
            this.player.applySnapshot(snap);
          }
        }

        // 逆時齒輪專屬推進
        this.world.stepRgear(dt * 1.5);

        // 若能量耗盡或歷史紀錄已倒退到起點，自動結束倒流
        if (this.rewindEnergy <= 0.02 || this.history.length <= 1) {
          this.finishRewind();
        }
      } else {
        // 常態時間前進
        if (this.isRewinding) {
          this.finishRewind();
        }

        // 沙漏常態慢慢回充
        if (this.rewindEnergy < MAX_REWIND_SECONDS) {
          this.rewindEnergy = Math.min(MAX_REWIND_SECONDS, this.rewindEnergy + dt * 0.9);
        }

        this.levelTime += dt;

        // 常態指針滴答聲 (每秒 1 次)
        if (this.levelTime - this.lastTickTime >= 1.0) {
          this.lastTickTime = this.levelTime;
          EC.Sound.playTick();
        }

        // 玩家輸入與物理移動
        this.handlePlayerInput(dt);

        // 整合角色名單 (本體 + 回聲)
        const allActors = [this.player, ...this.echoes];

        // 物理碰撞更新 (包含分身疊羅漢相互碰撞)
        this.world.resolveActorPhysics(this.player, this.echoes);

        // 更新回聲分身回放動作
        this.echoes.forEach((echo) => {
          echo.update();
        });

        // 更新環境機關、平台與開關
        this.world.update(dt, false, allActors);

        // 記錄本幀玩家快照進歷史佇列
        this.history.push(this.player.captureSnapshot());
        if (this.history.length > MAX_HISTORY_FRAMES) {
          this.history.shift();
        }

        // 檢查尖刺死亡
        if (!this.player.isDead && this.world.checkSpikeHit(this.player)) {
          this.player.isDead = true;
          EC.Sound.playDeath();
          // 提示玩家按住 R 倒流修復失誤
          document.getElementById('level-hint-bar').textContent = '⚠️ 你受傷了！按住 R 讓時間倒流回到安全之處！';
        }

        // 檢查通關出口時鐘門
        if (!this.player.isDead && this.world.checkExitReached(this.player)) {
          this.triggerVictory();
        }
      }

      this.updateHud();
    }

    /**
     * 結束倒流並生成回聲分身
     */
    finishRewind() {
      this.isRewinding = false;
      EC.Sound.stopRewind();

      // 如果倒流了一定長度的有效動作（超過 12 幀，約 0.2 秒），將其轉化為回聲分身
      if (this.recordedDuringRewind.length >= 12) {
        const echoFrames = this.recordedDuringRewind.slice();
        const newEcho = new Echo(echoFrames);
        this.echoes.push(newEcho);
        EC.Sound.playEchoSpawn();
      }
      this.recordedDuringRewind = [];
    }

    /**
     * 處理玩家常態控制輸入
     */
    handlePlayerInput(dt) {
      if (this.player.isDead) {
        this.player.vx = 0;
        this.player.vy += EC.GRAVITY;
        return;
      }

      const left = this.keys['ArrowLeft'] || this.keys['KeyA'];
      const right = this.keys['ArrowRight'] || this.keys['KeyD'];
      const jump = this.keys['Space'] || this.keys['ArrowUp'] || this.keys['KeyW'];

      // 水平移動
      let moveDir = 0;
      if (left && !right) moveDir = -1;
      else if (right && !left) moveDir = 1;

      if (moveDir !== 0) {
        this.player.vx = moveDir * EC.MOVE_SPEED;
        this.player.facing = moveDir;

        // 計算步數 (改變方向或起步時累加)
        if (moveDir !== this.prevMoveDir) {
          this.levelSteps++;
          this.prevMoveDir = moveDir;
        }
      } else {
        this.player.vx = 0;
        this.prevMoveDir = 0;
      }

      // 重力加速度
      this.player.vy = Math.min(EC.MAX_FALL_SPEED, this.player.vy + EC.GRAVITY);

      // 郊狼時間 (離開邊緣仍有數幀可跳躍)
      if (this.player.onGround) {
        this.player.coyoteTimer = 0.1;
      } else {
        this.player.coyoteTimer = Math.max(0, this.player.coyoteTimer - dt);
      }

      // 跳躍緩衝 (提前按下跳躍鍵仍有效)
      if (jump && !this.prevKeys['Space'] && !this.prevKeys['ArrowUp'] && !this.prevKeys['KeyW']) {
        this.player.jumpBuffer = 0.12;
      } else {
        this.player.jumpBuffer = Math.max(0, this.player.jumpBuffer - dt);
      }

      // 執行跳躍
      if (this.player.jumpBuffer > 0 && this.player.coyoteTimer > 0) {
        this.player.vy = EC.JUMP_SPEED;
        this.player.jumpBuffer = 0;
        this.player.coyoteTimer = 0;
        this.player.onGround = false;
        this.levelSteps++;
        EC.Sound.playJump();
      }

      // 記錄前一幀鍵位狀態
      this.prevKeys['Space'] = !!this.keys['Space'];
      this.prevKeys['ArrowUp'] = !!this.keys['ArrowUp'];
      this.prevKeys['KeyW'] = !!this.keys['KeyW'];
    }

    /**
     * 更新頂部 HUD 與沙漏條
     */
    updateHud() {
      const fill = document.getElementById('hourglass-fill');
      const pct = Math.max(0, Math.min(100, (this.rewindEnergy / MAX_REWIND_SECONDS) * 100));
      fill.style.width = `${pct}%`;
      if (this.isRewinding) {
        fill.classList.add('rewinding');
      } else {
        fill.classList.remove('rewinding');
      }

      document.getElementById('hud-time').textContent = `⏱️ ${this.levelTime.toFixed(1)}s`;
      document.getElementById('hud-steps').textContent = `👟 ${this.levelSteps}`;
      document.getElementById('hud-echoes').textContent = `👥 回聲: ${this.echoes.length}`;
    }

    /**
     * 觸發通關結算
     */
    triggerVictory() {
      this.state = 'VICTORY';
      EC.Sound.playWin();

      const lvlData = EC.LEVELS[this.currentLevelIndex];
      const par = lvlData.par || { time: 30, steps: 15 };

      // 計算星數
      let stars = 1; // 通關 1 星
      if (this.levelTime <= par.time) stars++;
      if (this.levelSteps <= par.steps) stars++;

      // 儲存進度
      const oldStat = this.saveData.levelStats[this.currentLevelIndex];
      const bestStars = oldStat ? Math.max(oldStat.stars, stars) : stars;
      const bestTime = oldStat ? Math.min(oldStat.time, this.levelTime) : this.levelTime;
      const bestSteps = oldStat ? Math.min(oldStat.steps, this.levelSteps) : this.levelSteps;

      this.saveData.levelStats[this.currentLevelIndex] = {
        stars: bestStars,
        time: bestTime,
        steps: bestSteps,
      };

      // 解鎖下一關
      if (this.currentLevelIndex + 1 > (this.saveData.unlockedLevel || 0)) {
        this.saveData.unlockedLevel = Math.min(EC.LEVELS.length - 1, this.currentLevelIndex + 1);
      }
      this.saveProgress();

      // 填充彈窗數據
      const starContainer = document.getElementById('win-stars');
      starContainer.innerHTML = '';
      for (let i = 1; i <= 3; i++) {
        const span = document.createElement('span');
        span.textContent = i <= stars ? '★' : '☆';
        if (i <= stars) span.className = 'active-star';
        starContainer.appendChild(span);
      }

      document.getElementById('win-time').textContent = `${this.levelTime.toFixed(1)} 秒 (標準: ${par.time}s)`;
      document.getElementById('win-steps').textContent = `${this.levelSteps} 步 (標準: ${par.steps}步)`;

      this.showScreen('VICTORY');
    }
  }

  // DOM 載入後啟動
  window.addEventListener('DOMContentLoaded', () => {
    window.game = new GameApp();
  });
})(typeof globalThis !== 'undefined' ? (globalThis.EC = globalThis.EC || {}) : (window.EC = window.EC || {}));
