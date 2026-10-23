// What each neon color is made of. Same-colored tiles share a material, so they also share a
// feel when thrown, a sound on impact, and they stick to each other.

export const MATERIALS = {
  pink: {
    id: "bouncy",
    mass: 0.8,
    restitution: 0.82,
    friction: 0.5,
    gravityScale: 1,
    linearDamping: 0.05,
    grabHz: 6,
    sound: "boing"
  },
  cyan: {
    id: "slippery",
    mass: 1,
    restitution: 0.08,
    friction: 0.03,
    gravityScale: 1,
    linearDamping: 0.02,
    grabHz: 6,
    sound: "clink"
  },
  acid: {
    id: "floaty",
    mass: 0.5,
    restitution: 0.4,
    friction: 0.4,
    gravityScale: 0.35,
    linearDamping: 0.9,
    grabHz: 7,
    sound: "puff"
  },
  orange: {
    id: "heavy",
    mass: 4,
    restitution: 0.02,
    friction: 0.9,
    gravityScale: 1.25,
    linearDamping: 0.05,
    grabHz: 3.2,
    sound: "thudHeavy"
  },
  gold: {
    id: "metal",
    mass: 2,
    restitution: 0.45,
    friction: 0.25,
    gravityScale: 1,
    linearDamping: 0.05,
    grabHz: 5,
    sound: "ding"
  }
};

export function applyMaterial(body, material) {
  body.restitution = material.restitution;
  body.friction = material.friction;
  body.gravityScale = material.gravityScale;
  body.linearDamping = material.linearDamping;
}
