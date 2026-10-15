/* =====================================================================
 * physics.js — 《回聲時鐘》物理模擬、碰撞偵測與機關邏輯
 * ---------------------------------------------------------------------
 * 處理 2D 平台物理、實心牆／單向板碰撞、動態平台、齒輪吊台、
 * 壓力板、計時開關、閘門與回聲分身疊羅漢碰撞。
 * ===================================================================== */

(function (EC) {
  'use strict';

  const TILE_SIZE = 32;
  const GRAVITY = 0.52;
  const MAX_FALL_SPEED = 12;
  const MOVE_SPEED = 3.6;
  const JUMP_SPEED = -8.6;
  const PLAYER_W = 20;
  const PLAYER_H = 28;

  class PhysicsWorld {
    constructor(levelData) {
      this.levelData = levelData;
      this.tileSize = TILE_SIZE;
      this.width = 0;
      this.height = 0;
      this.cols = 0;
      this.rows = 0;

      // 地圖元件清單
      this.solidGrid = [];       // 二維布林陣列 (實心牆)
      this.oneWays = [];         // 單向平台 [{x, y, w}]
      this.spikes = [];          // 尖刺清單 [{x, y, w, h}]
      this.plates = [];          // 壓力板清單 [{id, ch, x, y, w, h, pressed}]
      this.timerSwitches = [];   // 計時開關 [{id, ch, x, y, w, h}]
      this.doors = [];           // 閘門清單 [{id, chs, invert, x, y, w, h, isOpen, openRatio}]
      this.platforms = [];       // 動態平台清單
      this.exitDoor = null;      // 終點時鐘門 {x, y, w, h}
      this.spawnPos = { x: 64, y: 64 };

      // 機關頻道計時器與狀態
      this.channelActive = { a: false, b: false, c: false, d: false };
      this.channelTimers = { a: 0, b: 0, c: 0, d: 0 };
      this.timerDurations = Object.assign({ a: 2, b: 2, c: 2, d: 2 }, levelData.timers || {});

      // 動態平台時間計時
      this.platformTime = 0;
      this.rgearOffset = 0;      // 逆時齒輪專用位移

      this.parseMap();
      this.initPlatforms();
    }

    /**
     * 解析關卡地圖字元
     */
    parseMap() {
      const map = this.levelData.map;
      this.rows = map.length;
      this.cols = 0;
      for (let r = 0; r < this.rows; r++) {
        if (map[r].length > this.cols) this.cols = map[r].length;
      }
      this.width = this.cols * TILE_SIZE;
      this.height = this.rows * TILE_SIZE;

      // 初始化實心網格
      this.solidGrid = Array.from({ length: this.rows }, () => Array(this.cols).fill(false));

      const legend = this.levelData.legend || {};

      for (let r = 0; r < this.rows; r++) {
        const line = map[r];
        for (let c = 0; c < line.length; c++) {
          const char = line[c];
          const x = c * TILE_SIZE;
          const y = r * TILE_SIZE;

          if (char === '#') {
            this.solidGrid[r][c] = true;
          } else if (char === '=') {
            this.oneWays.push({ x, y, w: TILE_SIZE, h: 8 });
          } else if (char === '^') {
            this.spikes.push({ x: x + 4, y: y + 14, w: TILE_SIZE - 8, h: TILE_SIZE - 14 });
          } else if (char === 'P') {
            this.spawnPos = { x: x + (TILE_SIZE - PLAYER_W) / 2, y: y + (TILE_SIZE - PLAYER_H) };
          } else if (char === 'E') {
            this.exitDoor = { x: x + 2, y: y - 4, w: TILE_SIZE - 4, h: TILE_SIZE + 4 };
          } else if (char >= 'a' && char <= 'd') {
            // 壓力板（置於地面上方 6px）
            this.plates.push({
              id: `${c}_${r}`,
              ch: char,
              x: x + 4,
              y: y + TILE_SIZE - 6,
              w: TILE_SIZE - 8,
              h: 6,
              pressed: false,
            });
          } else if (char >= '1' && char <= '4') {
            // 計時開關 (1->a, 2->b, 3->c, 4->d)
            const ch = String.fromCharCode('a'.charCodeAt(0) + (parseInt(char, 10) - 1));
            this.timerSwitches.push({
              id: `${c}_${r}`,
              ch,
              x: x + 6,
              y: y + 8,
              w: TILE_SIZE - 12,
              h: TILE_SIZE - 8,
              active: false,
            });
          } else if ((char >= 'A' && char <= 'D') || (char >= 'H' && char <= 'K')) {
            // 閘門 (A~D 對應 a~d；H~K 對應 a~d 反向門)
            let ch = char.toLowerCase();
            let invert = false;
            let needList = null;

            if (char >= 'H' && char <= 'K') {
              ch = String.fromCharCode('a'.charCodeAt(0) + (char.charCodeAt(0) - 'H'.charCodeAt(0)));
              invert = true;
            }

            // 自訂圖例覆寫
            if (legend[char]) {
              const leg = legend[char];
              needList = leg.need;
              invert = !!leg.invert;
            } else {
              needList = [ch];
            }

            this.doors.push({
              id: `${c}_${r}`,
              char,
              chs: needList,
              invert,
              c,
              r,
              x,
              y,
              w: TILE_SIZE,
              h: TILE_SIZE,
              isOpen: false,
              openRatio: 0,
            });
          }
        }
      }
    }

    /**
     * 初始化動態平台
     */
    initPlatforms() {
      const list = this.levelData.platforms || [];
      this.platforms = list.map((p, idx) => {
        const item = Object.assign({}, p, { id: `plat_${idx}` });
        if (item.type === 'move') {
          item.startX = item.x * TILE_SIZE;
          item.startY = item.y * TILE_SIZE;
          item.targetX = item.to[0] * TILE_SIZE;
          item.targetY = item.to[1] * TILE_SIZE;
          item.currX = item.startX;
          item.currY = item.startY;
          item.width = item.w * TILE_SIZE;
          item.height = 14;
          item.vx = 0;
          item.vy = 0;
        } else if (item.type === 'wheel') {
          item.centerPx = item.cx * TILE_SIZE + 16;
          item.centerPy = item.cy * TILE_SIZE + 16;
          item.radiusPx = item.r * TILE_SIZE;
          item.cabWidth = item.w * TILE_SIZE;
          item.cabHeight = 12;
          item.angle = 0;
        } else if (item.type === 'lift') {
          item.startX = item.x * TILE_SIZE;
          item.startY = item.y * TILE_SIZE;
          item.targetX = item.to[0] * TILE_SIZE;
          item.targetY = item.to[1] * TILE_SIZE;
          item.currX = item.startX;
          item.currY = item.startY;
          item.width = item.w * TILE_SIZE;
          item.height = 14;
          item.progress = 0; // 0 為起點，1 為終點
          item.vx = 0;
          item.vy = 0;
        } else if (item.type === 'rgear') {
          item.startX = item.x * TILE_SIZE;
          item.startY = item.y * TILE_SIZE;
          item.targetX = item.to[0] * TILE_SIZE;
          item.targetY = item.to[1] * TILE_SIZE;
          item.currX = item.startX;
          item.currY = item.startY;
          item.width = item.w * TILE_SIZE;
          item.height = 14;
          item.dist = Math.hypot(item.targetX - item.startX, item.targetY - item.startY);
          item.progress = 0;
          item.vx = 0;
          item.vy = 0;
        }
        return item;
      });
    }

    /**
     * 更新環境物理（平台位移、計時開關倒數、機關判斷）
     * @param {number} dt 秒
     * @param {boolean} isRewinding 是否處於倒流狀態
     * @param {Array} actors 包含玩家與所有回聲分身
     */
    update(dt, isRewinding, actors) {
      if (!isRewinding) {
        this.platformTime += dt;

        // 倒數計時開關
        for (const ch in this.channelTimers) {
          if (this.channelTimers[ch] > 0) {
            this.channelTimers[ch] = Math.max(0, this.channelTimers[ch] - dt);
            if (this.channelTimers[ch] > 0 && this.channelTimers[ch] < 0.8) {
              if (Math.random() < 0.15) EC.Sound.playTimerWarning();
            }
          }
        }
      }

      // 更新動態平台位置
      this.updatePlatforms(dt, isRewinding);

      // 檢查壓力板與計時開關觸發
      this.checkTriggers(actors, dt, isRewinding);

      // 判定頻道啟動狀態
      this.evaluateChannels();

      // 更新閘門開合動畫
      this.updateDoors(dt);
    }

    /**
     * 專門推進逆時齒輪 (在倒流時呼叫)
     */
    stepRgear(dt) {
      this.platforms.forEach((plat) => {
        if (plat.type === 'rgear') {
          const speedPx = plat.speed * TILE_SIZE * dt;
          if (plat.dist > 0) {
            plat.progress = Math.min(1, plat.progress + speedPx / plat.dist);
            plat.currX = plat.startX + (plat.targetX - plat.startX) * plat.progress;
            plat.currY = plat.startY + (plat.targetY - plat.startY) * plat.progress;
          }
        }
      });
    }

    /**
     * 更新各類動態平台
     */
    updatePlatforms(dt, isRewinding) {
      this.platforms.forEach((plat) => {
        const prevX = plat.currX;
        const prevY = plat.currY;

        if (plat.type === 'move') {
          // 來回平滑移動
          const p = (this.platformTime / plat.period + (plat.phase || 0)) % 1;
          // 使用正弦波做出起伏平滑
          const ease = (1 - Math.cos(p * Math.PI * 2)) / 2;
          plat.currX = plat.startX + (plat.targetX - plat.startX) * ease;
          plat.currY = plat.startY + (plat.targetY - plat.startY) * ease;
          plat.vx = (plat.currX - prevX) / dt;
          plat.vy = (plat.currY - prevY) / dt;
        } else if (plat.type === 'wheel') {
          // 摩天輪時鐘大齒輪
          plat.angle = ((this.platformTime / plat.period) * Math.PI * 2) % (Math.PI * 2);
        } else if (plat.type === 'lift') {
          // 升降梯：需要頻道全部啟動時往 to 移動，否則回歸 start
          const needSatisfied = plat.need.every((ch) => this.channelActive[ch]);
          const targetProg = needSatisfied ? 1 : 0;
          const speed = (plat.speed * TILE_SIZE * dt) / Math.max(1, Math.hypot(plat.targetX - plat.startX, plat.targetY - plat.startY));
          if (plat.progress < targetProg) {
            plat.progress = Math.min(targetProg, plat.progress + speed);
          } else if (plat.progress > targetProg) {
            plat.progress = Math.max(targetProg, plat.progress - speed);
          }
          plat.currX = plat.startX + (plat.targetX - plat.startX) * plat.progress;
          plat.currY = plat.startY + (plat.targetY - plat.startY) * plat.progress;
          plat.vx = (plat.currX - prevX) / dt;
          plat.vy = (plat.currY - prevY) / dt;
        }
      });
    }

    /**
     * 檢查壓力板與開關觸發
     */
    checkTriggers(actors, dt, isRewinding) {
      // 1. 壓力板觸發檢測
      this.plates.forEach((plate) => {
        let isPressed = false;
        for (const actor of actors) {
          if (actor.isDead) continue;
          // 踩在壓力板頂部區域
          if (
            actor.x + actor.w > plate.x &&
            actor.x < plate.x + plate.w &&
            actor.y + actor.h >= plate.y - 2 &&
            actor.y + actor.h <= plate.y + plate.h + 8
          ) {
            isPressed = true;
            break;
          }
        }
        if (isPressed !== plate.pressed) {
          plate.pressed = isPressed;
          if (!isRewinding) EC.Sound.playPlate(isPressed);
        }
      });

      // 2. 計時開關檢測（僅常態時間踩踏觸發）
      if (!isRewinding) {
        this.timerSwitches.forEach((sw) => {
          for (const actor of actors) {
            if (actor.isDead) continue;
            if (this.checkAABB(actor, sw)) {
              const dur = this.timerDurations[sw.ch] || 2.0;
              if (this.channelTimers[sw.ch] < 0.2) {
                EC.Sound.playPlate(true);
              }
              this.channelTimers[sw.ch] = dur;
            }
          }
        });
      }
    }

    /**
     * 計算每個頻道的總體啟動狀態
     */
    evaluateChannels() {
      ['a', 'b', 'c', 'd'].forEach((ch) => {
        // 該頻道的壓力板清單
        const chPlates = this.plates.filter((p) => p.ch === ch);
        let platesReady = true;
        if (chPlates.length > 0) {
          // 若有壓力板，必須全部被踩住
          platesReady = chPlates.every((p) => p.pressed);
        } else {
          platesReady = false;
        }

        // 計時器狀態
        const timerReady = (this.channelTimers[ch] || 0) > 0;

        // 若無壓力板只有計時器，則以計時器為主；兩者皆有則任一或組合
        if (chPlates.length > 0) {
          this.channelActive[ch] = platesReady || timerReady;
        } else {
          this.channelActive[ch] = timerReady;
        }
      });
    }

    /**
     * 更新閘門開閉比例
     */
    updateDoors(dt) {
      this.doors.forEach((door) => {
        // 判斷門所需的頻道是否皆啟動
        let satisfied = door.chs.every((ch) => this.channelActive[ch]);
        if (door.invert) {
          satisfied = !satisfied;
        }

        const wasOpen = door.isOpen;
        door.isOpen = satisfied;

        if (!wasOpen && door.isOpen) {
          EC.Sound.playDoorOpen();
        }

        // 開門動畫進度 (0: 關閉, 1: 全開)
        const targetRatio = door.isOpen ? 1 : 0;
        if (door.openRatio < targetRatio) {
          door.openRatio = Math.min(1, door.openRatio + dt * 4);
        } else if (door.openRatio > targetRatio) {
          door.openRatio = Math.max(0, door.openRatio - dt * 4);
        }
      });
    }

    /**
     * AABB 碰撞檢測輔助函式
     */
    checkAABB(a, b) {
      return (
        a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y
      );
    }

    /**
     * 檢查特定方格是否為阻擋實體（磚塊或未完全開啟的門）
     */
    isCellBlocked(c, r) {
      if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return true;
      if (this.solidGrid[r][c]) return true;

      // 檢查此處是否有關閉的門 (若開啟度超過 0.7 則視為可通過)
      for (const door of this.doors) {
        if (door.c === c && door.r === r && door.openRatio < 0.7) {
          return true;
        }
      }
      return false;
    }

    /**
     * 獲取所有目前可踩踏的平台頂面（包括動態平台與時鐘大齒輪吊台）
     */
    getPlatformSurfaces() {
      const surfaces = [];

      // 1. 單向平台
      this.oneWays.forEach((ow) => {
        surfaces.push({
          x1: ow.x,
          x2: ow.x + ow.w,
          y: ow.y,
          vx: 0,
          vy: 0,
          isOneWay: true,
        });
      });

      // 2. 移動平台與升降梯、逆時齒輪
      this.platforms.forEach((plat) => {
        if (plat.type === 'move' || plat.type === 'lift' || plat.type === 'rgear') {
          surfaces.push({
            x1: plat.currX,
            x2: plat.currX + plat.width,
            y: plat.currY,
            vx: plat.vx || 0,
            vy: plat.vy || 0,
            isOneWay: false,
          });
        } else if (plat.type === 'wheel') {
          // 摩天輪吊台
          const n = plat.n || 4;
          for (let i = 0; i < n; i++) {
            const th = plat.angle + (i * Math.PI * 2) / n;
            const cabX = plat.centerPx + Math.cos(th) * plat.radiusPx - plat.cabWidth / 2;
            const cabY = plat.centerPy + Math.sin(th) * plat.radiusPx;
            // 吊台切線速度
            const angVel = (Math.PI * 2) / plat.period;
            const vx = -Math.sin(th) * plat.radiusPx * angVel;
            const vy = Math.cos(th) * plat.radiusPx * angVel;
            surfaces.push({
              x1: cabX,
              x2: cabX + plat.cabWidth,
              y: cabY,
              vx,
              vy,
              isOneWay: false,
            });
          }
        }
      });

      return surfaces;
    }

    /**
     * 玩家／實體全身移動與精確物理碰撞更新
     * @param {Object} actor 玩家或分身 {x, y, vx, vy, w, h, onGround...}
     * @param {Array} otherActors 其他角色（用以實作踩在分身頭頂的疊羅漢）
     */
    resolveActorPhysics(actor, otherActors = []) {
      // 1. 水平移動與地圖實心磚/關門碰撞
      actor.x += actor.vx;
      let leftTile = Math.floor(actor.x / TILE_SIZE);
      let rightTile = Math.floor((actor.x + actor.w - 0.01) / TILE_SIZE);
      let topTile = Math.floor(actor.y / TILE_SIZE);
      let bottomTile = Math.floor((actor.y + actor.h - 0.01) / TILE_SIZE);

      if (actor.vx > 0) {
        // 向右移動
        for (let r = topTile; r <= bottomTile; r++) {
          if (this.isCellBlocked(rightTile, r)) {
            actor.x = rightTile * TILE_SIZE - actor.w;
            actor.vx = 0;
            break;
          }
        }
      } else if (actor.vx < 0) {
        // 向左移動
        for (let r = topTile; r <= bottomTile; r++) {
          if (this.isCellBlocked(leftTile, r)) {
            actor.x = (leftTile + 1) * TILE_SIZE;
            actor.vx = 0;
            break;
          }
        }
      }

      // 2. 垂直移動與天花板／地面碰撞
      const prevY = actor.y;
      actor.y += actor.vy;
      leftTile = Math.floor(actor.x / TILE_SIZE);
      rightTile = Math.floor((actor.x + actor.w - 0.01) / TILE_SIZE);
      topTile = Math.floor(actor.y / TILE_SIZE);
      bottomTile = Math.floor((actor.y + actor.h - 0.01) / TILE_SIZE);

      let landed = false;
      let attachedPlatform = null;

      if (actor.vy < 0) {
        // 向上頂天花板
        for (let c = leftTile; c <= rightTile; c++) {
          if (this.isCellBlocked(c, topTile)) {
            actor.y = (topTile + 1) * TILE_SIZE;
            actor.vy = 0;
            break;
          }
        }
      } else if (actor.vy >= 0) {
        // 向下落，檢查實心磚塊地面
        for (let c = leftTile; c <= rightTile; c++) {
          if (this.isCellBlocked(c, bottomTile)) {
            actor.y = bottomTile * TILE_SIZE - actor.h;
            actor.vy = 0;
            landed = true;
            break;
          }
        }

        // 若尚未著地，檢查動態平台與單向板頂部
        if (!landed) {
          const surfaces = this.getPlatformSurfaces();
          const oldBottom = prevY + actor.h;
          const newBottom = actor.y + actor.h;

          for (const s of surfaces) {
            // 水平重疊判定
            if (actor.x + actor.w > s.x1 + 2 && actor.x < s.x2 - 2) {
              // 上一幀在平台上方，本幀穿透或落在表面（容差 8px）
              if (oldBottom <= s.y + 6 && newBottom >= s.y - 2) {
                actor.y = s.y - actor.h;
                actor.vy = 0;
                landed = true;
                attachedPlatform = s;
                break;
              }
            }
          }
        }

        // 3. 疊羅漢：檢查是否踩在其他回聲分身或角色的頭頂！
        if (!landed && otherActors.length > 0) {
          const oldBottom = prevY + actor.h;
          const newBottom = actor.y + actor.h;
          for (const other of otherActors) {
            if (other === actor || other.isDead) continue;
            // 水平重疊
            if (actor.x + actor.w > other.x + 3 && actor.x < other.x + other.w - 3) {
              const headY = other.y;
              if (oldBottom <= headY + 7 && newBottom >= headY - 3) {
                actor.y = headY - actor.h;
                actor.vy = 0;
                landed = true;
                break;
              }
            }
          }
        }
      }

      // 隨踩住的動態平台水平位移
      if (landed && attachedPlatform && attachedPlatform.vx) {
        actor.x += attachedPlatform.vx * (1 / 60);
      }

      actor.onGround = landed;
    }

    /**
     * 檢查角色是否觸碰尖刺
     */
    checkSpikeHit(actor) {
      for (const sp of this.spikes) {
        if (this.checkAABB(actor, sp)) {
          return true;
        }
      }
      return false;
    }

    /**
     * 檢查角色是否到達出口時鐘門
     */
    checkExitReached(actor) {
      if (!this.exitDoor) return false;
      return this.checkAABB(actor, this.exitDoor);
    }
  }

  EC.PhysicsWorld = PhysicsWorld;
  EC.TILE_SIZE = TILE_SIZE;
  EC.GRAVITY = GRAVITY;
  EC.MAX_FALL_SPEED = MAX_FALL_SPEED;
  EC.MOVE_SPEED = MOVE_SPEED;
  EC.JUMP_SPEED = JUMP_SPEED;
  EC.PLAYER_W = PLAYER_W;
  EC.PLAYER_H = PLAYER_H;
})(typeof globalThis !== 'undefined' ? (globalThis.EC = globalThis.EC || {}) : (window.EC = window.EC || {}));
