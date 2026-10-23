// Attract-mode demos drawn on each cabinet screen. They are loose sketches of the real games,
// drawn in code. Each demo takes input from its cabinet's stick and A/B buttons.

const PIXEL_FONT = '"Asobo Dot", ui-monospace, monospace';
const TAU = Math.PI * 2;

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function pad(n, width) {
  return String(Math.max(0, Math.floor(n))).padStart(width, "0");
}

function text(g, str, x, y, size, color, align = "left") {
  g.font = `${Math.round(size)}px ${PIXEL_FONT}`;
  g.textAlign = align;
  g.textBaseline = "top";
  g.fillStyle = color;
  g.fillText(str, x, y);
}

// ---------- スターコア・ガーディアン: guard the core against waves ----------

function coopDemo() {
  const stars = Array.from({ length: 50 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() }));
  const s = {
    enemies: [],
    bullets: [],
    parts: [],
    rings: [],
    score: 0,
    hi: 12000,
    wave: 1,
    kills: 0,
    hp: 5,
    over: 0,
    banner: 1.4,
    shake: 0,
    spawn: 0.4,
    guards: [
      { a: -Math.PI / 2, cool: 0, color: "#3ef0ff" },
      { a: Math.PI / 2, cool: 0.14, color: "#ff4fa3" }
    ],
    stick: { x: 0, y: 0 },
    manual: 0
  };

  function reset() {
    s.enemies.length = 0;
    s.bullets.length = 0;
    s.score = 0;
    s.wave = 1;
    s.kills = 0;
    s.hp = 5;
    s.banner = 1.4;
  }

  function burst(x, y, color, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const v = rand(0.2, 0.9);
      s.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.7), color });
    }
  }

  function nearest(x, y) {
    let best = null;
    let bd = Infinity;
    for (const e of s.enemies) {
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  function fire(gd, angle, speed = 1.6) {
    const gx = Math.cos(gd.a) * 0.3;
    const gy = Math.sin(gd.a) * 0.3;
    s.bullets.push({ x: gx, y: gy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1.1 });
  }

  return {
    input(kind, value) {
      if (kind === "stick") {
        s.stick = value;
        s.manual = 3;
      } else if (kind === "a") {
        const p1 = s.guards[0];
        for (let i = -3; i <= 3; i++) {
          fire(p1, p1.a + i * 0.16, 1.9);
        }
        s.manual = 3;
        return "shot";
      } else if (kind === "b") {
        s.rings.push({ r: 0.08, life: 0.6 });
        return "pop";
      }
      return null;
    },

    step(dt) {
      if (s.over > 0) {
        s.over -= dt;
        if (s.over <= 0) {
          reset();
        }
      }
      s.banner = Math.max(0, s.banner - dt);
      s.shake = Math.max(0, s.shake - dt);
      s.manual = Math.max(0, s.manual - dt);

      s.spawn -= dt;
      if (s.spawn <= 0 && s.over <= 0) {
        s.spawn = Math.max(0.28, 0.95 - s.wave * 0.08);
        const a = rand(0, TAU);
        s.enemies.push({
          x: Math.cos(a) * 1.25,
          y: Math.sin(a) * 1.25,
          speed: rand(0.16, 0.26) + s.wave * 0.02,
          spin: rand(-3, 3),
          rot: 0,
          kind: Math.random() < 0.25 ? 1 : 0
        });
      }

      s.guards.forEach((gd, i) => {
        let target = null;
        if (i === 0 && s.manual > 0 && Math.hypot(s.stick.x, s.stick.y) > 0.3) {
          target = Math.atan2(s.stick.y, s.stick.x);
        } else {
          const e = nearest(Math.cos(gd.a) * 0.3, Math.sin(gd.a) * 0.3);
          if (e) {
            target = Math.atan2(e.y, e.x) + (i === 1 ? 0.3 : -0.3);
          }
        }
        if (target !== null) {
          const diff = Math.atan2(Math.sin(target - gd.a), Math.cos(target - gd.a));
          gd.a += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
        }
        gd.cool -= dt;
        if (gd.cool <= 0 && s.enemies.length && s.over <= 0) {
          gd.cool = 0.3;
          const gx = Math.cos(gd.a) * 0.3;
          const gy = Math.sin(gd.a) * 0.3;
          const e = nearest(gx, gy);
          fire(gd, Math.atan2(e.y - gy, e.x - gx));
        }
      });

      for (const r of s.rings) {
        r.r += dt * 1.6;
        r.life -= dt;
        for (const e of s.enemies) {
          const d = Math.hypot(e.x, e.y);
          if (Math.abs(d - r.r) < 0.08) {
            e.x *= 1.06;
            e.y *= 1.06;
          }
        }
      }
      s.rings = s.rings.filter((r) => r.life > 0);

      for (const b of s.bullets) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        for (const e of s.enemies) {
          if (!e.dead && Math.hypot(e.x - b.x, e.y - b.y) < 0.07) {
            e.dead = true;
            b.life = 0;
            s.score += e.kind ? 300 : 100;
            s.kills += 1;
            burst(e.x, e.y, e.kind ? "#ff4fa3" : "#ff7a3d");
          }
        }
      }
      s.bullets = s.bullets.filter((b) => b.life > 0);

      for (const e of s.enemies) {
        const d = Math.hypot(e.x, e.y);
        e.x -= (e.x / d) * e.speed * dt;
        e.y -= (e.y / d) * e.speed * dt;
        e.rot += e.spin * dt;
        if (d < 0.1 && !e.dead) {
          e.dead = true;
          s.hp -= 1;
          s.shake = 0.3;
          burst(0, 0, "#d8ff4f", 16);
          if (s.hp <= 0) {
            s.over = 2.4;
            s.hi = Math.max(s.hi, s.score);
            s.enemies.forEach((x) => {
              x.dead = true;
            });
          }
        }
      }
      s.enemies = s.enemies.filter((e) => !e.dead);

      if (s.kills >= s.wave * 9) {
        s.wave += 1;
        s.kills = 0;
        s.banner = 1.4;
        s.hp = Math.min(5, s.hp + 1);
      }

      for (const p of s.parts) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.96;
        p.vy *= 0.96;
        p.life -= dt;
      }
      s.parts = s.parts.filter((p) => p.life > 0);
    },

    draw(g, w, h, t) {
      g.fillStyle = "#050414";
      g.fillRect(0, 0, w, h);
      const u = Math.min(w, h) * 0.42;
      const sx = s.shake > 0 ? rand(-1, 1) * u * 0.02 : 0;
      const cx = w / 2 + sx;
      const cy = h / 2 + 4;

      for (const st of stars) {
        g.fillStyle = `rgba(220, 230, 255, ${0.25 + 0.5 * Math.abs(Math.sin(t * 1.5 + st.r * 9))})`;
        g.fillRect(st.x * w, st.y * h, 1.5, 1.5);
      }
      g.strokeStyle = "rgba(216, 255, 79, 0.14)";
      g.lineWidth = 1;
      for (let i = 1; i <= 3; i++) {
        g.beginPath();
        g.arc(cx, cy, u * 0.33 * i, 0, TAU);
        g.stroke();
      }
      g.strokeStyle = "rgba(216, 255, 79, 0.3)";
      g.setLineDash([4, 6]);
      g.beginPath();
      g.arc(cx, cy, u * 0.3, 0, TAU);
      g.stroke();
      g.setLineDash([]);

      for (const r of s.rings) {
        g.strokeStyle = `rgba(62, 240, 255, ${r.life * 1.4})`;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(cx, cy, r.r * u, 0, TAU);
        g.stroke();
      }

      // Core
      g.save();
      g.translate(cx, cy);
      g.rotate(Math.PI / 4 + Math.sin(t * 2) * 0.06);
      g.shadowColor = "#d8ff4f";
      g.shadowBlur = u * 0.25;
      g.fillStyle = s.over > 0 ? "#3b4a12" : "#d8ff4f";
      const k = u * 0.09 * (1 + 0.05 * Math.sin(t * 5));
      g.fillRect(-k, -k, k * 2, k * 2);
      g.restore();

      for (const e of s.enemies) {
        g.save();
        g.translate(cx + e.x * u, cy + e.y * u);
        g.rotate(e.rot);
        g.fillStyle = e.kind ? "#ff4fa3" : "#ff7a3d";
        const r = u * (e.kind ? 0.055 : 0.045);
        if (e.kind) {
          g.beginPath();
          g.moveTo(0, -r);
          g.lineTo(r, r);
          g.lineTo(-r, r);
          g.closePath();
          g.fill();
        } else {
          g.fillRect(-r, -r, r * 2, r * 2);
        }
        g.restore();
      }

      g.fillStyle = "#d8ff4f";
      for (const b of s.bullets) {
        g.fillRect(cx + b.x * u - 1.5, cy + b.y * u - 1.5, 3, 3);
      }

      for (const gd of s.guards) {
        const gx = cx + Math.cos(gd.a) * 0.3 * u;
        const gy = cy + Math.sin(gd.a) * 0.3 * u;
        g.save();
        g.translate(gx, gy);
        g.rotate(gd.a + Math.PI / 2);
        g.shadowColor = gd.color;
        g.shadowBlur = 10;
        g.fillStyle = gd.color;
        const r = u * 0.06;
        g.beginPath();
        g.moveTo(0, -r);
        g.lineTo(r * 0.8, r * 0.7);
        g.lineTo(-r * 0.8, r * 0.7);
        g.closePath();
        g.fill();
        g.restore();
      }

      for (const p of s.parts) {
        g.globalAlpha = Math.min(1, p.life * 2);
        g.fillStyle = p.color;
        g.fillRect(cx + p.x * u - 2, cy + p.y * u - 2, 4, 4);
      }
      g.globalAlpha = 1;

      const fs = Math.max(10, Math.round(w / 26));
      text(g, `1P ${pad(s.score, 6)}`, 8, 8, fs, "#3ef0ff");
      text(g, `HI ${pad(s.hi, 6)}`, w / 2, 8, fs, "#ffd166", "center");
      text(g, `WAVE ${pad(s.wave, 2)}`, w - 8, 8, fs, "#d8ff4f", "right");
      for (let i = 0; i < 5; i++) {
        g.fillStyle = i < s.hp ? "#d8ff4f" : "#2a2f14";
        g.fillRect(8 + i * (fs * 0.9), 10 + fs * 1.4, fs * 0.6, fs * 0.35);
      }
      if (s.over > 0) {
        text(g, "GAME OVER", w / 2, h / 2 - fs, fs * 2, "#ff4fa3", "center");
      } else if (s.banner > 0) {
        text(g, `WAVE ${s.wave}`, w / 2, h * 0.26, fs * 1.6, "#ffffff", "center");
      }
    }
  };
}

// ---------- 星くずボックス: open a box, meet a little critter ----------

const CRITTER_COLORS = ["#ff9ec4", "#7ec8ff", "#ffd166", "#b9f6a0", "#c7a8ff", "#ffb38a"];

function makeCritter(no) {
  return {
    no,
    color: CRITTER_COLORS[Math.floor(Math.random() * CRITTER_COLORS.length)],
    shape: Math.floor(Math.random() * 3),
    ears: Math.floor(Math.random() * 4),
    stars: 1 + Math.floor(Math.random() ** 2 * 3)
  };
}

function drawCritter(g, c, x, y, size, squash = 0, blink = false) {
  const w = size * (1 + squash * 0.25);
  const h = size * (1 - squash * 0.25);
  g.save();
  g.translate(x, y);
  g.lineWidth = Math.max(1.5, size * 0.08);
  g.strokeStyle = "#2a2433";
  g.fillStyle = c.color;
  // ears
  if (c.ears === 1) {
    for (const sgn of [-1, 1]) {
      g.beginPath();
      g.moveTo(sgn * w * 0.18, -h * 0.4);
      g.lineTo(sgn * w * 0.42, -h * 0.78);
      g.lineTo(sgn * w * 0.46, -h * 0.28);
      g.closePath();
      g.fill();
      g.stroke();
    }
  } else if (c.ears === 2) {
    for (const sgn of [-1, 1]) {
      g.beginPath();
      g.ellipse(sgn * w * 0.2, -h * 0.72, w * 0.1, h * 0.3, sgn * 0.2, 0, TAU);
      g.fill();
      g.stroke();
    }
  } else if (c.ears === 3) {
    g.beginPath();
    g.moveTo(0, -h * 0.45);
    g.lineTo(0, -h * 0.8);
    g.stroke();
    g.fillStyle = "#ffd166";
    g.beginPath();
    g.arc(0, -h * 0.84, size * 0.08, 0, TAU);
    g.fill();
    g.stroke();
    g.fillStyle = c.color;
  }
  // body
  g.beginPath();
  if (c.shape === 0) {
    g.ellipse(0, 0, w * 0.5, h * 0.48, 0, 0, TAU);
  } else if (c.shape === 1) {
    g.ellipse(0, h * 0.04, w * 0.42, h * 0.52, 0, 0, TAU);
  } else {
    g.roundRect(-w * 0.46, -h * 0.44, w * 0.92, h * 0.88, size * 0.24);
  }
  g.fill();
  g.stroke();
  // face
  g.fillStyle = "#2a2433";
  if (blink) {
    g.fillRect(-w * 0.2, -h * 0.02, w * 0.12, size * 0.04);
    g.fillRect(w * 0.08, -h * 0.02, w * 0.12, size * 0.04);
  } else {
    g.beginPath();
    g.arc(-w * 0.14, 0, size * 0.06, 0, TAU);
    g.arc(w * 0.14, 0, size * 0.06, 0, TAU);
    g.fill();
  }
  g.fillStyle = "rgba(255, 90, 140, 0.45)";
  g.beginPath();
  g.arc(-w * 0.28, h * 0.12, size * 0.07, 0, TAU);
  g.arc(w * 0.28, h * 0.12, size * 0.07, 0, TAU);
  g.fill();
  g.restore();
}

function boxDemo() {
  const s = {
    phase: "drop",
    time: 0,
    boxY: -1,
    lid: 0,
    critter: null,
    critterY: 0,
    shelf: [],
    count: 6,
    sparks: [],
    tilt: 0,
    stick: { x: 0, y: 0 },
    hop: 0
  };

  function setPhase(p) {
    s.phase = p;
    s.time = 0;
  }

  return {
    input(kind, value) {
      if (kind === "stick") {
        s.stick = value;
      } else if (kind === "a" && (s.phase === "idle" || s.phase === "drop")) {
        setPhase("shake");
        return "blip";
      } else if (kind === "b") {
        s.hop = 0.5;
        return "pop";
      }
      return null;
    },

    step(dt) {
      s.time += dt;
      s.hop = Math.max(0, s.hop - dt);
      s.tilt += (s.stick.x * 0.35 - s.tilt) * Math.min(1, dt * 8);
      if (s.phase === "drop") {
        s.boxY = Math.min(0, -1 + s.time * 2.6);
        if (s.time > 0.7) {
          setPhase("idle");
        }
      } else if (s.phase === "idle" && s.time > 1.6) {
        setPhase("shake");
      } else if (s.phase === "shake" && s.time > 0.9) {
        setPhase("pop");
        s.count = (s.count % 24) + 1;
        s.critter = makeCritter(s.count);
        for (let i = 0; i < 18; i++) {
          const a = rand(-Math.PI, 0);
          const v = rand(0.4, 1.1);
          s.sparks.push({
            x: 0,
            y: -0.2,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            life: rand(0.5, 1),
            color: CRITTER_COLORS[i % CRITTER_COLORS.length]
          });
        }
      } else if (s.phase === "pop") {
        s.lid = Math.min(1, s.time * 4);
        if (s.time > 1.8) {
          setPhase("shelve");
        }
      } else if (s.phase === "shelve" && s.time > 0.4) {
        s.shelf.push(s.critter);
        if (s.shelf.length > 5) {
          s.shelf.shift();
        }
        s.critter = null;
        s.lid = 0;
        s.boxY = -1;
        setPhase("drop");
      }
      for (const p of s.sparks) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 1.4 * dt;
        p.life -= dt;
      }
      s.sparks = s.sparks.filter((p) => p.life > 0);
    },

    draw(g, w, h, t) {
      const grd = g.createLinearGradient(0, 0, w, h);
      grd.addColorStop(0, "#ffd7e8");
      grd.addColorStop(0.5, "#d9e9ff");
      grd.addColorStop(1, "#fff0b9");
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      const u = Math.min(w, h);

      g.fillStyle = "rgba(255, 255, 255, 0.6)";
      for (let i = 0; i < 12; i++) {
        const x = ((i * 97 + t * 8) % (w + 20)) - 10;
        const y = (i * 53) % (h * 0.6);
        g.fillRect(x, y, 2, 2);
      }

      // Turntable
      const cx = w / 2;
      const baseY = h * 0.66;
      const ringColors = ["#ffd166", "#ff9ec4", "#7ec8ff", "#b9f6a0"];
      for (let i = 0; i < 4; i++) {
        g.fillStyle = ringColors[(i + Math.floor(t * 2)) % 4];
        g.beginPath();
        g.ellipse(cx, baseY, u * (0.36 - i * 0.04), u * (0.09 - i * 0.01), 0, 0, TAU);
        g.fill();
      }

      // Box
      const size = u * 0.3;
      const shake = s.phase === "shake" ? Math.sin(t * 50) * u * 0.012 * Math.min(1, s.time * 2) : 0;
      const bx = cx + shake;
      const by = baseY - size * 0.55 + s.boxY * h * 0.8;
      g.save();
      g.translate(bx, by);
      g.rotate(s.tilt);
      g.lineWidth = Math.max(2, u * 0.012);
      g.strokeStyle = "#2a2433";
      g.fillStyle = "#7ec8ff";
      g.beginPath();
      g.roundRect(-size / 2, -size / 2, size, size, size * 0.14);
      g.fill();
      g.stroke();
      g.fillStyle = "#fff7d1";
      g.font = `${Math.round(size * 0.42)}px sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("★", 0, -size * 0.06);
      g.fillStyle = "#2a2433";
      g.beginPath();
      g.arc(-size * 0.16, size * 0.22, size * 0.035, 0, TAU);
      g.arc(size * 0.16, size * 0.22, size * 0.035, 0, TAU);
      g.fill();
      g.save();
      g.translate(-size * 0.6, -size / 2);
      g.rotate(-s.lid * 1.35);
      g.fillStyle = "#ffd166";
      g.beginPath();
      g.roundRect(0, -size * 0.13, size * 1.2, size * 0.24, size * 0.08);
      g.fill();
      g.stroke();
      g.restore();
      g.restore();

      if (s.critter) {
        const k = Math.min(1, s.time * 2.2);
        const jump = Math.sin(k * Math.PI) * size * 0.9;
        const cy = by - size * 0.55 - jump * (s.phase === "pop" ? 1 : 0) - (k >= 1 ? size * 0.3 : 0);
        const squash = s.phase === "pop" && k >= 1 ? Math.max(0, Math.sin(s.time * 12) * 0.3) : 0;
        drawCritter(g, s.critter, bx, cy, size * 0.62, squash, Math.sin(t * 3) > 0.96);
        if (s.phase === "pop" && s.time > 0.5) {
          const fs = Math.max(10, Math.round(w / 24));
          text(g, "NEW!", bx + size * 0.42, cy - size * 0.55, fs, "#ff4fa3");
          text(g, "★".repeat(s.critter.stars) + "☆".repeat(3 - s.critter.stars),
            bx, cy + size * 0.38, fs, "#d4a017", "center");
        }
      }

      for (const p of s.sparks) {
        g.globalAlpha = Math.min(1, p.life * 2);
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(bx + p.x * u * 0.5, by + p.y * u * 0.5, u * 0.012, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;

      // Shelf
      const shelfY = h * 0.9;
      g.fillStyle = "rgba(42, 36, 51, 0.15)";
      g.fillRect(0, shelfY + u * 0.04, w, h);
      s.shelf.forEach((c, i) => {
        const x = w * (0.14 + i * 0.18);
        const hop = s.hop > 0 ? Math.abs(Math.sin((s.hop + i * 0.1) * 12)) * u * 0.05 : 0;
        drawCritter(g, c, x, shelfY - hop, u * 0.1);
      });

      const fs = Math.max(10, Math.round(w / 26));
      text(g, `COLLECTION ${pad(s.count, 2)}/24`, 8, 8, fs, "#2a2433");
      text(g, "SERIES 01", w - 8, 8, fs, "#d44f8f", "right");
    }
  };
}

// ---------- the covered cabinet: a dark screen with a silhouette ----------

function soonDemo() {
  return {
    input() {
      return null;
    },
    step() {},
    draw(g, w, h, t) {
      g.fillStyle = "#050414";
      g.fillRect(0, 0, w, h);
      const fs = Math.max(12, Math.round(w / 14));
      const a = 0.35 + 0.25 * Math.sin(t * 2);
      text(g, "? ? ?", w / 2, h * 0.14, fs * 1.6, `rgba(168, 161, 203, ${a})`, "center");
      const dots = ".".repeat(Math.floor(t * 3) % 4).padEnd(3, " ");
      text(g, `NOW LOADING${dots}`, w / 2, h * 0.24, fs * 0.6, "rgba(168, 161, 203, 0.6)", "center");
    }
  };
}

const DEMOS = { coop: coopDemo, box: boxDemo, soon: soonDemo };

export function createDemo(kind) {
  return (DEMOS[kind] ?? soonDemo)();
}
