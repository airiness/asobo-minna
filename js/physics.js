// A small 2D rigid-body solver for boxes, ported from Erin Catto's Box2D-Lite (MIT License, see
// THIRD_PARTY_NOTICES.md): box-box contacts from SAT plus edge clipping, sequential impulses with
// accumulated, warm-started impulses, a soft mouse joint for dragging and a weld joint. Added on
// top of Box2D-Lite: restitution, per-body gravity scale and damping. Units are meters and
// seconds, with +y pointing down the screen.

const EDGE1 = 1;
const EDGE2 = 2;
const EDGE3 = 3;
const EDGE4 = 4;

let nextId = 1;

export class Body {
  constructor(width, height, mass = Infinity) {
    this.id = nextId++;
    this.w = width;
    this.h = height;
    this.x = 0;
    this.y = 0;
    this.rot = 0;
    this.vx = 0;
    this.vy = 0;
    this.av = 0;
    this.pvx = 0;
    this.pvy = 0;
    this.pav = 0;
    this.friction = 0.5;
    this.restitution = 0;
    this.gravityScale = 1;
    this.linearDamping = 0.05;
    this.angularDamping = 0.4;
    if (Number.isFinite(mass)) {
      this.invMass = 1 / mass;
      this.invI = 12 / (mass * (width * width + height * height));
    } else {
      this.invMass = 0;
      this.invI = 0;
    }
    this.data = null;
  }

  contains(px, py) {
    const c = Math.cos(this.rot);
    const s = Math.sin(this.rot);
    const dx = px - this.x;
    const dy = py - this.y;
    const lx = c * dx + s * dy;
    const ly = -s * dx + c * dy;
    return Math.abs(lx) <= this.w / 2 && Math.abs(ly) <= this.h / 2;
  }
}

function clipSegment(out, a, b, nx, ny, offset, clipEdge) {
  let n = 0;
  const d0 = nx * a.x + ny * a.y - offset;
  const d1 = nx * b.x + ny * b.y - offset;
  if (d0 <= 0) {
    out[n++] = { ...a };
  }
  if (d1 <= 0) {
    out[n++] = { ...b };
  }
  if (d0 * d1 < 0) {
    const k = d0 / (d0 - d1);
    const v = { x: a.x + k * (b.x - a.x), y: a.y + k * (b.y - a.y) };
    if (d0 > 0) {
      Object.assign(v, { in1: clipEdge, out1: a.out1, in2: 0, out2: a.out2 });
    } else {
      Object.assign(v, { in1: b.in1, out1: clipEdge, in2: b.in2, out2: 0 });
    }
    out[n++] = v;
  }
  return n;
}

// Incident edge of box (h, pos, rot) against the reference normal (nx, ny), in world space.
function incidentEdge(hx, hy, px, py, rot, nx, ny) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  // Normal in the incident box frame, flipped to face the reference box.
  const lx = -(c * nx + s * ny);
  const ly = -(-s * nx + c * ny);
  let v0;
  let v1;
  if (Math.abs(lx) > Math.abs(ly)) {
    if (lx > 0) {
      v0 = { x: hx, y: -hy, in1: 0, out1: 0, in2: EDGE3, out2: EDGE4 };
      v1 = { x: hx, y: hy, in1: 0, out1: 0, in2: EDGE4, out2: EDGE1 };
    } else {
      v0 = { x: -hx, y: hy, in1: 0, out1: 0, in2: EDGE1, out2: EDGE2 };
      v1 = { x: -hx, y: -hy, in1: 0, out1: 0, in2: EDGE2, out2: EDGE3 };
    }
  } else if (ly > 0) {
    v0 = { x: hx, y: hy, in1: 0, out1: 0, in2: EDGE4, out2: EDGE1 };
    v1 = { x: -hx, y: hy, in1: 0, out1: 0, in2: EDGE1, out2: EDGE2 };
  } else {
    v0 = { x: -hx, y: -hy, in1: 0, out1: 0, in2: EDGE2, out2: EDGE3 };
    v1 = { x: hx, y: -hy, in1: 0, out1: 0, in2: EDGE3, out2: EDGE4 };
  }
  for (const v of [v0, v1]) {
    const x = v.x;
    const y = v.y;
    v.x = px + c * x - s * y;
    v.y = py + s * x + c * y;
  }
  return [v0, v1];
}

// Returns up to two contacts with normals pointing from a to b.
function collide(a, b) {
  const hAx = a.w / 2;
  const hAy = a.h / 2;
  const hBx = b.w / 2;
  const hBy = b.h / 2;
  const cA = Math.cos(a.rot);
  const sA = Math.sin(a.rot);
  const cB = Math.cos(b.rot);
  const sB = Math.sin(b.rot);

  const dpx = b.x - a.x;
  const dpy = b.y - a.y;
  const dAx = cA * dpx + sA * dpy;
  const dAy = -sA * dpx + cA * dpy;
  const dBx = cB * dpx + sB * dpy;
  const dBy = -sB * dpx + cB * dpy;

  // C = RotA^T * RotB
  const c11 = Math.abs(cA * cB + sA * sB);
  const c12 = Math.abs(-cA * sB + sA * cB);
  const c21 = Math.abs(-sA * cB + cA * sB);
  const c22 = Math.abs(sA * sB + cA * cB);

  const faceAx = Math.abs(dAx) - hAx - (c11 * hBx + c12 * hBy);
  const faceAy = Math.abs(dAy) - hAy - (c21 * hBx + c22 * hBy);
  if (faceAx > 0 || faceAy > 0) {
    return [];
  }
  const faceBx = Math.abs(dBx) - (c11 * hAx + c21 * hAy) - hBx;
  const faceBy = Math.abs(dBy) - (c12 * hAx + c22 * hAy) - hBy;
  if (faceBx > 0 || faceBy > 0) {
    return [];
  }

  const relTol = 0.95;
  const absTol = 0.01;
  let axis = 0;
  let sep = faceAx;
  let nx = dAx > 0 ? cA : -cA;
  let ny = dAx > 0 ? sA : -sA;
  if (faceAy > relTol * sep + absTol * hAy) {
    axis = 1;
    sep = faceAy;
    nx = dAy > 0 ? -sA : sA;
    ny = dAy > 0 ? cA : -cA;
  }
  if (faceBx > relTol * sep + absTol * hBx) {
    axis = 2;
    sep = faceBx;
    nx = dBx > 0 ? cB : -cB;
    ny = dBx > 0 ? sB : -sB;
  }
  if (faceBy > relTol * sep + absTol * hBy) {
    axis = 3;
    sep = faceBy;
    nx = dBy > 0 ? -sB : sB;
    ny = dBy > 0 ? cB : -cB;
  }

  let fnx;
  let fny;
  let front;
  let snx;
  let sny;
  let negSide;
  let posSide;
  let negEdge;
  let posEdge;
  let inc;
  if (axis === 0 || axis === 1) {
    fnx = nx;
    fny = ny;
    const hFront = axis === 0 ? hAx : hAy;
    const hSide = axis === 0 ? hAy : hAx;
    front = a.x * fnx + a.y * fny + hFront;
    snx = axis === 0 ? -sA : cA;
    sny = axis === 0 ? cA : sA;
    const side = a.x * snx + a.y * sny;
    negSide = -side + hSide;
    posSide = side + hSide;
    negEdge = axis === 0 ? EDGE3 : EDGE2;
    posEdge = axis === 0 ? EDGE1 : EDGE4;
    inc = incidentEdge(hBx, hBy, b.x, b.y, b.rot, fnx, fny);
  } else {
    fnx = -nx;
    fny = -ny;
    const hFront = axis === 2 ? hBx : hBy;
    const hSide = axis === 2 ? hBy : hBx;
    front = b.x * fnx + b.y * fny + hFront;
    snx = axis === 2 ? -sB : cB;
    sny = axis === 2 ? cB : sB;
    const side = b.x * snx + b.y * sny;
    negSide = -side + hSide;
    posSide = side + hSide;
    negEdge = axis === 2 ? EDGE3 : EDGE2;
    posEdge = axis === 2 ? EDGE1 : EDGE4;
    inc = incidentEdge(hAx, hAy, a.x, a.y, a.rot, fnx, fny);
  }

  const clip1 = [];
  if (clipSegment(clip1, inc[0], inc[1], -snx, -sny, negSide, negEdge) < 2) {
    return [];
  }
  const clip2 = [];
  if (clipSegment(clip2, clip1[0], clip1[1], snx, sny, posSide, posEdge) < 2) {
    return [];
  }

  const contacts = [];
  for (const v of clip2) {
    const s = fnx * v.x + fny * v.y - front;
    if (s <= 0) {
      let in1 = v.in1;
      let out1 = v.out1;
      let in2 = v.in2;
      let out2 = v.out2;
      if (axis >= 2) {
        [in1, in2] = [in2, in1];
        [out1, out2] = [out2, out1];
      }
      contacts.push({
        x: v.x - s * fnx,
        y: v.y - s * fny,
        nx,
        ny,
        sep: s,
        feature: in1 | (out1 << 4) | (in2 << 8) | (out2 << 12),
        pn: 0,
        pt: 0,
        massN: 0,
        massT: 0,
        bias: 0
      });
    }
  }
  return contacts;
}

class Arbiter {
  constructor(a, b, contacts) {
    this.a = a;
    this.b = b;
    this.contacts = contacts;
    this.friction = Math.sqrt(a.friction * b.friction);
    this.restitution = Math.max(a.restitution, b.restitution);
  }

  update(contacts) {
    for (const c of contacts) {
      const old = this.contacts.find((o) => o.feature === c.feature);
      if (old) {
        c.pn = old.pn;
        c.pt = old.pt;
      }
    }
    this.contacts = contacts;
  }

  preStep(invDt) {
    const { a, b } = this;
    for (const c of this.contacts) {
      const r1x = c.x - a.x;
      const r1y = c.y - a.y;
      const r2x = c.x - b.x;
      const r2y = c.y - b.y;
      const rn1 = r1x * c.nx + r1y * c.ny;
      const rn2 = r2x * c.nx + r2y * c.ny;
      let k = a.invMass + b.invMass;
      k += a.invI * (r1x * r1x + r1y * r1y - rn1 * rn1) + b.invI * (r2x * r2x + r2y * r2y - rn2 * rn2);
      c.massN = 1 / k;
      const tx = c.ny;
      const ty = -c.nx;
      const rt1 = r1x * tx + r1y * ty;
      const rt2 = r2x * tx + r2y * ty;
      let kt = a.invMass + b.invMass;
      kt += a.invI * (r1x * r1x + r1y * r1y - rt1 * rt1) + b.invI * (r2x * r2x + r2y * r2y - rt2 * rt2);
      c.massT = 1 / kt;
      c.bias = -0.2 * invDt * Math.min(0, c.sep + 0.01);

      // Restitution targets a separating velocity proportional to the approach speed. The speed
      // is taken before this step's gravity and warm starting; otherwise each bounce gains the
      // gravity added during the step and a resting bouncy body never settles.
      const dvx = b.pvx - b.pav * r2y - a.pvx + a.pav * r1y;
      const dvy = b.pvy + b.pav * r2x - a.pvy - a.pav * r1x;
      const vn = dvx * c.nx + dvy * c.ny;
      if (this.restitution > 0 && vn < -1) {
        c.bias = Math.max(c.bias, -this.restitution * vn);
      }
    }
  }

  // Applies last step's impulses; runs after every arbiter's preStep.
  warmStart() {
    const { a, b } = this;
    for (const c of this.contacts) {
      const r1x = c.x - a.x;
      const r1y = c.y - a.y;
      const r2x = c.x - b.x;
      const r2y = c.y - b.y;
      const tx = c.ny;
      const ty = -c.nx;
      const px = c.pn * c.nx + c.pt * tx;
      const py = c.pn * c.ny + c.pt * ty;
      a.vx -= a.invMass * px;
      a.vy -= a.invMass * py;
      a.av -= a.invI * (r1x * py - r1y * px);
      b.vx += b.invMass * px;
      b.vy += b.invMass * py;
      b.av += b.invI * (r2x * py - r2y * px);
    }
  }

  applyImpulse() {
    const { a, b } = this;
    for (const c of this.contacts) {
      const r1x = c.x - a.x;
      const r1y = c.y - a.y;
      const r2x = c.x - b.x;
      const r2y = c.y - b.y;

      let dvx = b.vx - b.av * r2y - a.vx + a.av * r1y;
      let dvy = b.vy + b.av * r2x - a.vy - a.av * r1x;
      const vn = dvx * c.nx + dvy * c.ny;
      let dPn = c.massN * (-vn + c.bias);
      const pn0 = c.pn;
      c.pn = Math.max(pn0 + dPn, 0);
      dPn = c.pn - pn0;
      let px = dPn * c.nx;
      let py = dPn * c.ny;
      a.vx -= a.invMass * px;
      a.vy -= a.invMass * py;
      a.av -= a.invI * (r1x * py - r1y * px);
      b.vx += b.invMass * px;
      b.vy += b.invMass * py;
      b.av += b.invI * (r2x * py - r2y * px);

      dvx = b.vx - b.av * r2y - a.vx + a.av * r1y;
      dvy = b.vy + b.av * r2x - a.vy - a.av * r1x;
      const tx = c.ny;
      const ty = -c.nx;
      const vt = dvx * tx + dvy * ty;
      let dPt = c.massT * -vt;
      const maxPt = this.friction * c.pn;
      const pt0 = c.pt;
      c.pt = Math.max(-maxPt, Math.min(maxPt, pt0 + dPt));
      dPt = c.pt - pt0;
      px = dPt * tx;
      py = dPt * ty;
      a.vx -= a.invMass * px;
      a.vy -= a.invMass * py;
      a.av -= a.invI * (r1x * py - r1y * px);
      b.vx += b.invMass * px;
      b.vy += b.invMass * py;
      b.av += b.invI * (r2x * py - r2y * px);
    }
  }
}

// Soft spring pulling a point of a body toward a target (Box2D's mouse joint).
export class MouseJoint {
  constructor(body, wx, wy, { hz = 5, damping = 0.7, maxForce = 900 } = {}) {
    this.body = body;
    const c = Math.cos(body.rot);
    const s = Math.sin(body.rot);
    const dx = wx - body.x;
    const dy = wy - body.y;
    this.lx = c * dx + s * dy;
    this.ly = -s * dx + c * dy;
    this.tx = wx;
    this.ty = wy;
    this.hz = hz;
    this.damping = damping;
    this.maxForce = maxForce / body.invMass;
    this.ix = 0;
    this.iy = 0;
  }

  involves(body) {
    return body === this.body;
  }

  setTarget(wx, wy) {
    this.tx = wx;
    this.ty = wy;
  }

  preStep(dt) {
    const b = this.body;
    const mass = 1 / b.invMass;
    const omega = 2 * Math.PI * this.hz;
    const d = 2 * mass * this.damping * omega;
    const k = mass * omega * omega;
    const g = dt * (d + dt * k);
    this.gamma = g > 0 ? 1 / g : 0;
    const beta = dt * k * this.gamma;

    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    this.rx = c * this.lx - s * this.ly;
    this.ry = s * this.lx + c * this.ly;
    const { rx, ry } = this;
    const k11 = b.invMass + b.invI * ry * ry + this.gamma;
    const k12 = -b.invI * rx * ry;
    const k22 = b.invMass + b.invI * rx * rx + this.gamma;
    const det = k11 * k22 - k12 * k12;
    const inv = det !== 0 ? 1 / det : 0;
    this.m11 = inv * k22;
    this.m12 = -inv * k12;
    this.m22 = inv * k11;
    this.cx = (b.x + rx - this.tx) * beta;
    this.cy = (b.y + ry - this.ty) * beta;

    b.av *= 0.98;
    b.vx += b.invMass * this.ix;
    b.vy += b.invMass * this.iy;
    b.av += b.invI * (rx * this.iy - ry * this.ix);
  }

  applyImpulse(dt) {
    const b = this.body;
    const { rx, ry } = this;
    const cdx = b.vx - b.av * ry;
    const cdy = b.vy + b.av * rx;
    const qx = -(cdx + this.cx + this.gamma * this.ix);
    const qy = -(cdy + this.cy + this.gamma * this.iy);
    let jx = this.m11 * qx + this.m12 * qy;
    let jy = this.m12 * qx + this.m22 * qy;
    const ox = this.ix;
    const oy = this.iy;
    this.ix += jx;
    this.iy += jy;
    const max = dt * this.maxForce;
    const len = Math.hypot(this.ix, this.iy);
    if (len > max) {
      this.ix *= max / len;
      this.iy *= max / len;
    }
    jx = this.ix - ox;
    jy = this.iy - oy;
    b.vx += b.invMass * jx;
    b.vy += b.invMass * jy;
    b.av += b.invI * (rx * jy - ry * jx);
  }
}

// Holds two bodies together at their current relative pose (point + angle constraints).
export class WeldJoint {
  constructor(a, b) {
    this.a = a;
    this.b = b;
    const wx = (a.x + b.x) / 2;
    const wy = (a.y + b.y) / 2;
    this.la = toLocal(a, wx, wy);
    this.lb = toLocal(b, wx, wy);
    this.ref = b.rot - a.rot;
    this.px = 0;
    this.py = 0;
    this.pa = 0;
  }

  involves(body) {
    return body === this.a || body === this.b;
  }

  other(body) {
    return body === this.a ? this.b : this.a;
  }

  preStep(dt) {
    const { a, b } = this;
    const invDt = dt > 0 ? 1 / dt : 0;
    const ra = toWorldOffset(a, this.la);
    const rb = toWorldOffset(b, this.lb);
    this.ra = ra;
    this.rb = rb;
    const k11 = a.invMass + b.invMass + a.invI * ra.y * ra.y + b.invI * rb.y * rb.y;
    const k12 = -a.invI * ra.x * ra.y - b.invI * rb.x * rb.y;
    const k22 = a.invMass + b.invMass + a.invI * ra.x * ra.x + b.invI * rb.x * rb.x;
    const det = k11 * k22 - k12 * k12;
    const inv = det !== 0 ? 1 / det : 0;
    this.m11 = inv * k22;
    this.m12 = -inv * k12;
    this.m22 = inv * k11;
    const iSum = a.invI + b.invI;
    this.angMass = iSum > 0 ? 1 / iSum : 0;
    this.bx = -0.2 * invDt * (b.x + rb.x - a.x - ra.x);
    this.by = -0.2 * invDt * (b.y + rb.y - a.y - ra.y);
    this.ba = -0.2 * invDt * (b.rot - a.rot - this.ref);

    a.vx -= a.invMass * this.px;
    a.vy -= a.invMass * this.py;
    a.av -= a.invI * (ra.x * this.py - ra.y * this.px + this.pa);
    b.vx += b.invMass * this.px;
    b.vy += b.invMass * this.py;
    b.av += b.invI * (rb.x * this.py - rb.y * this.px + this.pa);
  }

  applyImpulse() {
    const { a, b, ra, rb } = this;
    const la = this.angMass * (-(b.av - a.av) + this.ba);
    this.pa += la;
    a.av -= a.invI * la;
    b.av += b.invI * la;

    const cdx = b.vx - b.av * rb.y - a.vx + a.av * ra.y;
    const cdy = b.vy + b.av * rb.x - a.vy - a.av * ra.x;
    const qx = -cdx + this.bx;
    const qy = -cdy + this.by;
    const jx = this.m11 * qx + this.m12 * qy;
    const jy = this.m12 * qx + this.m22 * qy;
    this.px += jx;
    this.py += jy;
    a.vx -= a.invMass * jx;
    a.vy -= a.invMass * jy;
    a.av -= a.invI * (ra.x * jy - ra.y * jx);
    b.vx += b.invMass * jx;
    b.vy += b.invMass * jy;
    b.av += b.invI * (rb.x * jy - rb.y * jx);
  }
}

function toLocal(body, wx, wy) {
  const c = Math.cos(body.rot);
  const s = Math.sin(body.rot);
  const dx = wx - body.x;
  const dy = wy - body.y;
  return { x: c * dx + s * dy, y: -s * dx + c * dy };
}

function toWorldOffset(body, local) {
  const c = Math.cos(body.rot);
  const s = Math.sin(body.rot);
  return { x: c * local.x - s * local.y, y: s * local.x + c * local.y };
}

function pairKey(a, b) {
  return a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
}

export class World {
  constructor(gravity = 10) {
    this.gravity = gravity;
    this.bodies = [];
    this.arbiters = new Map();
    this.joints = new Set();
    this.noCollide = new Set();
    this.iterations = 10;
    this.onImpact = null;
  }

  // Welds two bodies and stops them colliding with each other.
  weld(a, b) {
    const joint = new WeldJoint(a, b);
    this.joints.add(joint);
    this.noCollide.add(pairKey(a, b));
    this.arbiters.delete(pairKey(a, b));
    return joint;
  }

  removeJoint(joint) {
    this.joints.delete(joint);
    if (joint instanceof WeldJoint) {
      this.noCollide.delete(pairKey(joint.a, joint.b));
    }
  }

  add(body) {
    this.bodies.push(body);
    return body;
  }

  remove(body) {
    this.bodies = this.bodies.filter((b) => b !== body);
    for (const [key, arb] of this.arbiters) {
      if (arb.a === body || arb.b === body) {
        this.arbiters.delete(key);
      }
    }
    for (const j of this.joints) {
      if (j.involves(body)) {
        this.removeJoint(j);
      }
    }
  }

  broadPhase() {
    const list = this.bodies;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        let a = list[i];
        let b = list[j];
        if (a.invMass === 0 && b.invMass === 0) {
          continue;
        }
        if (a.id > b.id) {
          [a, b] = [b, a];
        }
        const key = `${a.id}:${b.id}`;
        if (this.noCollide.has(key)) {
          continue;
        }
        const reach = (Math.hypot(a.w, a.h) + Math.hypot(b.w, b.h)) / 2;
        const contacts =
          Math.abs(a.x - b.x) > reach || Math.abs(a.y - b.y) > reach ? [] : collide(a, b);
        if (contacts.length === 0) {
          this.arbiters.delete(key);
          continue;
        }
        const arb = this.arbiters.get(key);
        if (arb) {
          arb.update(contacts);
        } else {
          this.arbiters.set(key, new Arbiter(a, b, contacts));
          if (this.onImpact) {
            const rvx = b.vx - a.vx;
            const rvy = b.vy - a.vy;
            const speed = Math.abs(rvx * contacts[0].nx + rvy * contacts[0].ny);
            this.onImpact(speed, a, b, contacts[0]);
          }
        }
      }
    }
  }

  step(dt) {
    const invDt = dt > 0 ? 1 / dt : 0;
    this.broadPhase();
    for (const b of this.bodies) {
      b.pvx = b.vx;
      b.pvy = b.vy;
      b.pav = b.av;
      if (b.invMass === 0) {
        continue;
      }
      b.vy += dt * this.gravity * b.gravityScale;
      const damp = 1 / (1 + dt * b.linearDamping);
      b.vx *= damp;
      b.vy *= damp;
      b.av *= 1 / (1 + dt * b.angularDamping);
    }
    for (const arb of this.arbiters.values()) {
      arb.preStep(invDt);
    }
    for (const arb of this.arbiters.values()) {
      arb.warmStart();
    }
    for (const j of this.joints) {
      j.preStep(dt);
    }
    for (let i = 0; i < this.iterations; i++) {
      for (const arb of this.arbiters.values()) {
        arb.applyImpulse();
      }
      for (const j of this.joints) {
        j.applyImpulse(dt);
      }
    }
    for (const b of this.bodies) {
      if (b.invMass === 0) {
        continue;
      }
      b.x += dt * b.vx;
      b.y += dt * b.vy;
      b.rot += dt * b.av;
    }
  }
}
