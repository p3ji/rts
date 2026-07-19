// Deterministic math for the lockstep simulation.
//
// JavaScript guarantees bit-identical results everywhere for + - * / % and
// Math.sqrt (IEEE-754 exact per spec), but NOT for the transcendentals —
// Math.sin/cos/atan2/hypot are "implementation-approximated" and genuinely
// differ across browsers and even browser versions. In a lockstep sim a
// single last-bit difference compounds over thousands of ticks into real
// positional drift and a desync. So every gameplay-affecting call site uses
// these implementations instead: they're built only from exact operations,
// which makes them bit-identical on every machine. Accuracy is ~1e-8 —
// far below anything gameplay (or the checksum's 1/16-unit grid) can see.
// Rendering/audio code keeps using native Math; only the sim result matters.

const PI = 3.141592653589793
const TAU = 6.283185307179586
const HALF_PI = 1.5707963267948966

// Truncated Taylor series for sin on [-PI/2, PI/2]; max error ~6e-8 at the edges.
function sinPoly(x) {
  const x2 = x * x
  return x * (1 + x2 * (-0.16666666666666666 + x2 * (0.008333333333333333
    + x2 * (-0.0001984126984126984 + x2 * (0.0000027557319223985893
    + x2 * -0.000000025052108385441718)))))
}

export function dsin(x) {
  x = x % TAU
  if (x > PI) x -= TAU
  else if (x < -PI) x += TAU
  if (x > HALF_PI) x = PI - x
  else if (x < -HALF_PI) x = -PI - x
  return sinPoly(x)
}

export function dcos(x) {
  return dsin(HALF_PI - x)
}

// Minimax polynomial for atan on [-1, 1] (Abramowitz & Stegun 4.4.49, ~2e-8).
function atanPoly(t) {
  const t2 = t * t
  return t * (0.9999993329 + t2 * (-0.3332985605 + t2 * (0.1994653599
    + t2 * (-0.1390853351 + t2 * (0.0964200441 + t2 * (-0.0559098861
    + t2 * (0.0218612288 + t2 * -0.004054058)))))))
}

export function datan2(y, x) {
  if (x === 0) {
    if (y === 0) return 0
    return y > 0 ? HALF_PI : -HALF_PI
  }
  const ax = x < 0 ? -x : x
  const ay = y < 0 ? -y : y
  let a = ax >= ay ? atanPoly(ay / ax) : HALF_PI - atanPoly(ax / ay)
  if (x < 0) a = PI - a
  return y < 0 ? -a : a
}

// Math.hypot replacement — hypot is also implementation-approximated, sqrt is
// not. Map coordinates are small, so overflow protection isn't needed.
export function dlen(dx, dz) {
  return Math.sqrt(dx * dx + dz * dz)
}
