/* =====================================================================
 * render.js — 《回聲時鐘》蒸氣龐克風格 Canvas 繪圖引擎
 * ---------------------------------------------------------------------
 * 純程式繪圖（不依賴外部圖片）：
 * - 蒸氣龐克背景磚牆、大型慢速旋轉背景齒輪、蒸氣粒子
 * - 黃銅金屬磚、鉚釘、木質平台、銳利尖刺、多色壓力板與指示燈
 * - 摩天輪大齒輪、動態升降台、藍色逆時晶石齒輪
 * - 天文鐘樓出口時鐘門（旋轉指針與暖金光渦）
 * - 鐘錶匠學徒主角（護目鏡、圍巾、齒輪飾品、流暢動畫）
 * - 回聲分身（半透明青金發光幽靈殘影、時間環）
 * - 時間倒流濾鏡（懷舊復古棕褐濾鏡、掃描線、邊緣光暈、倒轉指針）
 * - 橫向捲軸平滑跟隨攝影機 (Camera)
 * ===================================================================== */

(function (EC) {
  'use strict';

  class GameRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.viewW = canvas.width;
      this.viewH = canvas.height;

      // 攝影機鏡頭
      this.camX = 0;
      this.camY = 0;

      // 背景裝飾齒輪
      this.bgGears = [
        { x: 120, y: 150, r: 80, teeth: 16, speed: 0.15, color: '#312317' },
        { x: 260, y: 120, r: 50, teeth: 12, speed: -0.24, color: '#3d2c1c' },
        { x: 480, y: 380, r: 110, teeth: 24, speed: 0.09, color: '#271c12' },
        { x: 700, y: 180, r: 70, teeth: 14, speed: -0.18, color: '#342618' },
        { x: 880, y: 320, r: 90, teeth: 18, speed: 0.12, color: '#2b1f15' },
      ];

      // 蒸氣粒子
      this.particles = [];
      for (let i = 0; i < 28; i++) {
        this.particles.push({
          x: Math.random() * this.viewW,
          y: Math.random() * this.viewH,
          r: 1 + Math.random() * 2.5,
          vx: (Math.random() - 0.5) * 0.4,
          vy: -0.3 - Math.random() * 0.5,
          alpha: 0.1 + Math.random() * 0.25,
        });
      }

      // 時間計數器
      this.animTime = 0;
    }

    /**
     * 更新攝影機目標（平滑跟隨玩家本體）
     */
    updateCamera(player, worldWidth, worldHeight) {
      const targetCamX = player.x + player.w / 2 - this.viewW / 2;
      const targetCamY = player.y + player.h / 2 - this.viewH / 2;

      // 平滑內插
      this.camX += (targetCamX - this.camX) * 0.1;
      this.camY += (targetCamY - this.camY) * 0.1;

      // 邊界限制
      const maxCamX = Math.max(0, worldWidth - this.viewW);
      const maxCamY = Math.max(0, worldHeight - this.viewH);
      this.camX = Math.max(0, Math.min(maxCamX, this.camX));
      this.camY = Math.max(0, Math.min(maxCamY, this.camY));
    }

    /**
     * 主繪製流程
     */
    render(dt, world, player, echoes, isRewinding, rewindRatio) {
      this.animTime += dt;
      const ctx = this.ctx;

      // 1. 清空畫布
      ctx.fillStyle = '#110d0a';
      ctx.fillRect(0, 0, this.viewW, this.viewH);

      // 2. 繪製深層背景與蒸氣粒子 (帶有視差滾動 Parallax)
      this.drawBackground(ctx, dt);

      // 3. 進入世界座標系
      ctx.save();
      ctx.translate(-Math.round(this.camX), -Math.round(this.camY));

      // 繪製地圖磚塊、單向板、尖刺
      this.drawMapTiles(ctx, world);

      // 繪製壓力板、計時開關與閘門
      this.drawTriggersAndDoors(ctx, world);

      // 繪製動態平台與齒輪吊台
      this.drawPlatforms(ctx, world);

      // 繪製出口時鐘門
      this.drawExitDoor(ctx, world.exitDoor);

      // 繪製回聲分身 (Echoes)
      echoes.forEach((echo, idx) => {
        this.drawEchoActor(ctx, echo, idx);
      });

      // 繪製玩家本體
      this.drawPlayer(ctx, player);

      ctx.restore();

      // 4. 繪製全螢幕蒸氣龐克濾鏡與時間倒流特殊視覺效果
      if (isRewinding) {
        this.drawRewindOverlay(ctx, rewindRatio);
      } else {
        this.drawAmbientVignette(ctx);
      }
    }

    /**
     * 繪製蒸氣龐克背景與旋轉齒輪
     */
    drawBackground(ctx, dt) {
      // 漸層磚壁底色
      const grad = ctx.createLinearGradient(0, 0, 0, this.viewH);
      grad.addColorStop(0, '#1c1510');
      grad.addColorStop(0.5, '#140f0c');
      grad.addColorStop(1, '#0e0a08');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.viewW, this.viewH);

      // 繪製背景大型暗黃銅齒輪 (視差慢動)
      this.bgGears.forEach((g) => {
        const px = g.x - this.camX * 0.15;
        const py = g.y - this.camY * 0.15;
        const ang = this.animTime * g.speed;
        this.drawGear(ctx, px, py, g.r, g.teeth, ang, g.color, '#1a120c');
      });

      // 繪製浮動微塵與微量蒸氣粒子
      ctx.fillStyle = '#c8a87d';
      this.particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < 0) {
          p.y = this.viewH;
          p.x = Math.random() * this.viewW;
        }
        if (p.x < 0) p.x = this.viewW;
        if (p.x > this.viewW) p.x = 0;

        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1.0;
    }

    /**
     * 繪製地圖實心磚、木板平台與尖刺
     */
    drawMapTiles(ctx, world) {
      const ts = world.tileSize;
      const startC = Math.max(0, Math.floor(this.camX / ts));
      const endC = Math.min(world.cols - 1, Math.ceil((this.camX + this.viewW) / ts));
      const startR = Math.max(0, Math.floor(this.camY / ts));
      const endR = Math.min(world.rows - 1, Math.ceil((this.camY + this.viewH) / ts));

      for (let r = startR; r <= endR; r++) {
        for (let c = startC; c <= endC; c++) {
          if (world.solidGrid[r][c]) {
            const x = c * ts;
            const y = r * ts;
            // 黃銅磚身
            ctx.fillStyle = '#4a351e';
            ctx.fillRect(x, y, ts, ts);

            // 內框邊線與立體高光
            ctx.strokeStyle = '#6e512e';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x + 1, y + 1, ts - 2, ts - 2);

            ctx.fillStyle = '#2f2012';
            ctx.fillRect(x + 3, y + 3, ts - 6, ts - 6);

            // 四角黃銅鉚釘
            ctx.fillStyle = '#c6923b';
            const rivets = [[x + 4, y + 4], [x + ts - 5, y + 4], [x + 4, y + ts - 5], [x + ts - 5, y + ts - 5]];
            rivets.forEach(([rx, ry]) => {
              ctx.fillRect(rx, ry, 2, 2);
            });
          }
        }
      }

      // 單向木板平台
      world.oneWays.forEach((ow) => {
        ctx.fillStyle = '#784e27';
        ctx.fillRect(ow.x, ow.y, ow.w, ow.h);
        ctx.fillStyle = '#c6923b';
        ctx.fillRect(ow.x, ow.y, ow.w, 2); // 頂部銅條裝飾
        ctx.fillStyle = '#422812';
        ctx.fillRect(ow.x, ow.y + ow.h - 2, ow.w, 2);
      });

      // 尖刺
      world.spikes.forEach((sp) => {
        const teeth = 3;
        const toothW = sp.w / teeth;
        ctx.fillStyle = '#9c3826';
        ctx.strokeStyle = '#e07050';
        ctx.lineWidth = 1;

        for (let i = 0; i < teeth; i++) {
          ctx.beginPath();
          ctx.moveTo(sp.x + i * toothW, sp.y + sp.h);
          ctx.lineTo(sp.x + (i + 0.5) * toothW, sp.y);
          ctx.lineTo(sp.x + (i + 1) * toothW, sp.y + sp.h);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      });
    }

    /**
     * 繪製壓力板、計時開關與閘門
     */
    drawTriggersAndDoors(ctx, world) {
      const chColors = {
        a: '#ffbe3b', // 琥珀金
        b: '#38d38e', // 翡翠綠
        c: '#38b7e6', // 寶石藍
        d: '#ca58f5', // 紫水晶
      };

      // 1. 壓力板
      world.plates.forEach((p) => {
        const color = chColors[p.ch] || '#ffbe3b';
        const pressOffsetY = p.pressed ? 3 : 0;

        // 底座
        ctx.fillStyle = '#221a14';
        ctx.fillRect(p.x - 2, p.y + 2, p.w + 4, p.h);

        // 踏板
        ctx.fillStyle = p.pressed ? color : '#7a5a32';
        ctx.fillRect(p.x, p.y + pressOffsetY, p.w, p.h - pressOffsetY);

        // 發光符號
        ctx.fillStyle = p.pressed ? '#ffffff' : color;
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.ch.toUpperCase(), p.x + p.w / 2, p.y + pressOffsetY + 5);
      });

      // 2. 計時開關
      world.timerSwitches.forEach((sw) => {
        const color = chColors[sw.ch] || '#ffbe3b';
        const active = (world.channelTimers[sw.ch] || 0) > 0;

        // 外座鐘殼
        ctx.fillStyle = '#2d2219';
        ctx.fillRect(sw.x, sw.y, sw.w, sw.h);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sw.x, sw.y, sw.w, sw.h);

        // 內部刻度盤
        const cx = sw.x + sw.w / 2;
        const cy = sw.y + sw.h / 2;
        ctx.fillStyle = active ? color : '#1a140f';
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fill();

        // 開關頻道標籤
        ctx.fillStyle = active ? '#ffffff' : color;
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sw.ch.toUpperCase(), cx, cy);
      });

      // 3. 閘門 (Doors)
      world.doors.forEach((door) => {
        const mainCh = door.chs[0] || 'a';
        const color = door.invert ? '#d858cf' : (chColors[mainCh] || '#ffbe3b');

        // 門框軌道
        ctx.fillStyle = '#1c1510';
        ctx.fillRect(door.x, door.y, door.w, door.h);

        // 滑動門板高度（隨 openRatio 向上收縮）
        const visibleH = door.h * (1 - door.openRatio);
        if (visibleH > 1) {
          ctx.fillStyle = '#543d25';
          ctx.fillRect(door.x + 2, door.y, door.w - 4, visibleH);

          // 鐵柵欄金屬條
          ctx.strokeStyle = '#85623b';
          ctx.lineWidth = 2;
          for (let gx = door.x + 6; gx < door.x + door.w - 4; gx += 6) {
            ctx.beginPath();
            ctx.moveTo(gx, door.y);
            ctx.lineTo(gx, door.y + visibleH);
            ctx.stroke();
          }
        }

        // 頂部狀態指示寶石燈
        const lampX = door.x + door.w / 2;
        const lampY = door.y + 5;
        ctx.beginPath();
        ctx.arc(lampX, lampY, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = door.isOpen ? '#50e680' : color;
        ctx.shadowColor = door.isOpen ? '#50e680' : color;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
      });
    }

    /**
     * 繪製各類動態平台 (移動平台、齒輪摩天輪、升降台、逆時齒輪)
     */
    drawPlatforms(ctx, world) {
      world.platforms.forEach((plat) => {
        if (plat.type === 'move' || plat.type === 'lift') {
          // 移動平台與升降梯
          ctx.fillStyle = plat.type === 'lift' ? '#8a5c28' : '#7a5416';
          ctx.fillRect(plat.currX, plat.currY, plat.width, plat.height);

          // 黃銅邊緣
          ctx.strokeStyle = '#e0aa48';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(plat.currX, plat.currY, plat.width, plat.height);

          // 嵌合小齒輪裝飾
          this.drawGear(ctx, plat.currX + 8, plat.currY + 7, 5, 6, this.animTime * 2, '#4a3316');
          this.drawGear(ctx, plat.currX + plat.width - 8, plat.currY + 7, 5, 6, -this.animTime * 2, '#4a3316');
        } else if (plat.type === 'rgear') {
          // 逆時齒輪：時空神秘晶石藍色風格
          ctx.fillStyle = '#1a3348';
          ctx.fillRect(plat.currX, plat.currY, plat.width, plat.height);
          ctx.strokeStyle = '#48b8e0';
          ctx.lineWidth = 2;
          ctx.strokeRect(plat.currX, plat.currY, plat.width, plat.height);

          // 晶石光芒
          ctx.fillStyle = '#6ce8ff';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('◄ REVERSE ►', plat.currX + plat.width / 2, plat.currY + plat.height / 2);
        } else if (plat.type === 'wheel') {
          // 摩天輪大齒輪
          const cx = plat.centerPx;
          const cy = plat.centerPy;
          const r = plat.radiusPx;

          // 繪製中心大齒輪輪體
          this.drawGear(ctx, cx, cy, r * 0.45, 16, plat.angle, '#42301c', '#291d11');

          // 繪製吊臂連桿與吊台
          const n = plat.n || 4;
          for (let i = 0; i < n; i++) {
            const th = plat.angle + (i * Math.PI * 2) / n;
            const cabX = cx + Math.cos(th) * r;
            const cabY = cy + Math.sin(th) * r;

            // 連桿
            ctx.strokeStyle = '#614828';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cabX, cabY);
            ctx.stroke();

            // 保持水平的吊台木板
            ctx.fillStyle = '#8f632d';
            ctx.fillRect(cabX - plat.cabWidth / 2, cabY, plat.cabWidth, plat.cabHeight);
            ctx.strokeStyle = '#e0aa48';
            ctx.lineWidth = 1;
            ctx.strokeRect(cabX - plat.cabWidth / 2, cabY, plat.cabWidth, plat.cabHeight);
          }
        }
      });
    }

    /**
     * 繪製出口時鐘門（旋轉指針、暖金發光波紋）
     */
    drawExitDoor(ctx, door) {
      if (!door) return;
      const cx = door.x + door.w / 2;
      const cy = door.y + door.h / 2;
      const r = Math.min(door.w, door.h) / 2;

      // 暖金色發光外環光暈
      const glowGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, r * 1.5);
      glowGrad.addColorStop(0, 'rgba(255, 220, 120, 0.6)');
      glowGrad.addColorStop(0.5, 'rgba(210, 140, 40, 0.25)');
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // 天文鐘外框
      ctx.fillStyle = '#261b12';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e8b856';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // 錶盤刻度
      for (let i = 0; i < 12; i++) {
        const rad = (i * Math.PI) / 6;
        const x1 = cx + Math.cos(rad) * (r - 2);
        const y1 = cy + Math.sin(rad) * (r - 2);
        const x2 = cx + Math.cos(rad) * (r - 5);
        const y2 = cy + Math.sin(rad) * (r - 5);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = '#f5d382';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // 旋轉的時鐘指針
      const hourAng = this.animTime * 0.8;
      const minAng = this.animTime * 3.2;

      // 分針
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(minAng) * (r - 5), cy + Math.sin(minAng) * (r - 5));
      ctx.stroke();

      // 時針
      ctx.strokeStyle = '#e8b856';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(hourAng) * (r - 9), cy + Math.sin(hourAng) * (r - 9));
      ctx.stroke();

      // 中心金屬軸心
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    /**
     * 繪製通用齒輪圖元
     */
    drawGear(ctx, x, y, radius, teeth, angle, fillColor, rimColor) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      ctx.fillStyle = fillColor;
      ctx.beginPath();
      const toothDepth = radius * 0.22;
      const numPoints = teeth * 2;
      for (let i = 0; i < numPoints; i++) {
        const a = (i * Math.PI) / teeth;
        const r = i % 2 === 0 ? radius : radius - toothDepth;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      // 齒輪邊框
      if (rimColor) {
        ctx.strokeStyle = rimColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // 中心齒輪孔
      ctx.fillStyle = '#140e0a';
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.32, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    /**
     * 繪製玩家本體（鐘錶匠學徒）
     */
    drawPlayer(ctx, player) {
      if (player.isDead) return;
      const x = Math.round(player.x);
      const y = Math.round(player.y);
      const w = player.w;
      const h = player.h;
      const facing = player.facing || 1; // 1: 右, -1: 左

      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(facing, 1);

      // 奔跑身體微晃
      const bounce = player.onGround && Math.abs(player.vx) > 0.2 ? Math.sin(this.animTime * 14) * 1.5 : 0;

      // 1. 雙腿
      ctx.fillStyle = '#2d2218';
      const legOffset = player.onGround && Math.abs(player.vx) > 0.2 ? Math.sin(this.animTime * 14) * 4 : 0;
      ctx.fillRect(-6 + legOffset, 5 + bounce, 4, 9);
      ctx.fillRect(2 - legOffset, 5 + bounce, 4, 9);

      // 2. 身體軀幹 (皮革背心)
      ctx.fillStyle = '#7a4e25';
      ctx.fillRect(-7, -4 + bounce, 14, 11);

      // 腰帶與腰間黃銅小懷錶
      ctx.fillStyle = '#3a2412';
      ctx.fillRect(-7, 3 + bounce, 14, 3);
      ctx.fillStyle = '#f3d078';
      ctx.beginPath();
      ctx.arc(2, 4 + bounce, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // 飄動的紅色蒸氣圍巾
      ctx.fillStyle = '#b83424';
      ctx.fillRect(-7, -6 + bounce, 14, 3);
      ctx.beginPath();
      ctx.moveTo(-7, -5 + bounce);
      ctx.lineTo(-12, -3 + bounce + Math.sin(this.animTime * 10) * 2);
      ctx.lineTo(-7, -2 + bounce);
      ctx.fill();

      // 3. 頭部與學徒工作帽
      ctx.fillStyle = '#e8be89'; // 臉
      ctx.fillRect(-5, -13 + bounce, 10, 8);

      // 棕色工作帽
      ctx.fillStyle = '#54361a';
      ctx.fillRect(-7, -15 + bounce, 14, 4);

      // 護目鏡 (蒸氣龐克標誌，圓形銅框玻璃)
      ctx.fillStyle = '#c6923b';
      ctx.fillRect(-1, -11 + bounce, 6, 4);
      ctx.fillStyle = '#68ddff';
      ctx.fillRect(0, -10 + bounce, 4, 2);

      ctx.restore();
    }

    /**
     * 繪製回聲分身 (半透明青金發光幽靈造型)
     */
    drawEchoActor(ctx, echo, index) {
      if (echo.isDead) return;
      const x = Math.round(echo.x);
      const y = Math.round(echo.y);
      const w = echo.w;
      const h = echo.h;
      const facing = echo.facing || 1;

      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(facing, 1);

      // 半透明發光光暈
      ctx.shadowColor = '#50e0f0';
      ctx.shadowBlur = 8;
      ctx.globalAlpha = 0.65;

      // 幽靈回聲青藍色調身體
      ctx.fillStyle = '#227788';
      ctx.fillRect(-6, 5, 4, 9);
      ctx.fillRect(2, 5, 4, 9);

      ctx.fillStyle = '#44b0c8';
      ctx.fillRect(-7, -4, 14, 11);

      // 圍巾與臉部
      ctx.fillStyle = '#7de8ff';
      ctx.fillRect(-7, -6, 14, 3);
      ctx.fillStyle = '#a6f2ff';
      ctx.fillRect(-5, -13, 10, 8);

      // 護目鏡發光
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, -11, 5, 3);

      // 頭頂時空編號標籤 (例如 E1, E2)
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#a4f3ff';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`E${index + 1}`, 0, -16);

      ctx.restore();
    }

    /**
     * 時間倒流全螢幕濾鏡（復古泛黃棕褐、掃描線、邊緣光暈與倒轉時鐘）
     */
    drawRewindOverlay(ctx, ratio) {
      ctx.save();

      // 1. 棕褐色懷舊濾鏡
      ctx.fillStyle = 'rgba(180, 110, 40, 0.18)';
      ctx.fillRect(0, 0, this.viewW, this.viewH);

      // 2. 青藍色時間微光覆蓋
      ctx.fillStyle = 'rgba(40, 160, 220, 0.12)';
      ctx.fillRect(0, 0, this.viewW, this.viewH);

      // 3. CRT 復古水平掃描線
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      for (let y = 0; y < this.viewH; y += 4) {
        ctx.fillRect(0, y, this.viewW, 1.5);
      }

      // 4. 畫面微抖動 (Rewind Glitch)
      if (Math.random() < 0.3) {
        const sliceY = Math.random() * (this.viewH - 20);
        const shiftX = (Math.random() - 0.5) * 8;
        ctx.drawImage(this.canvas, 0, sliceY, this.viewW, 18, shiftX, sliceY, this.viewW, 18);
      }

      // 5. 畫面中央大型半透明倒轉時鐘水印
      const cx = this.viewW / 2;
      const cy = this.viewH / 2;
      const clockR = 70;
      ctx.strokeStyle = 'rgba(255, 230, 160, 0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, clockR, 0, Math.PI * 2);
      ctx.stroke();

      // 快速逆時針旋轉的指針
      const revAng = -this.animTime * 12;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(revAng) * 55, cy + Math.sin(revAng) * 55);
      ctx.stroke();

      // 倒流文字提示
      ctx.fillStyle = '#ffdf80';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 6;
      ctx.fillText('◄◄ 時間倒流中...', cx, cy + clockR + 26);

      ctx.restore();
    }

    /**
     * 平時常態暗角光暈
     */
    drawAmbientVignette(ctx) {
      const grad = ctx.createRadialGradient(
        this.viewW / 2, this.viewH / 2, this.viewW * 0.35,
        this.viewW / 2, this.viewH / 2, this.viewW * 0.7
      );
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }
  }

  EC.GameRenderer = GameRenderer;
})(typeof globalThis !== 'undefined' ? (globalThis.EC = globalThis.EC || {}) : (window.EC = window.EC || {}));
