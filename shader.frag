precision highp float;

uniform vec2  iResolution;
uniform float iTime;

// ═══════════════════════════════════════════════════════════════════════════════
// VARIATION KNOBS — safe to edit freely
// ═══════════════════════════════════════════════════════════════════════════════

// ── Curve tracing ─────────────────────────────────────────────────────────────
const float SPEED         = 0.2;  // trace speed; negative = clockwise
// Speed variation depth. Adds a sine wobble to the phase so the snake
// breathes between slow and fast without ever stopping (unlike ease-in/out).
// 0.0 = perfectly linear | 0.3 = gentle pulse | 0.7 = noticeable surge
// Must stay below 1.0 or the snake momentarily reverses direction.
const float EASE_STRENGTH = 0.5;

// Visible arc length of each glowing snake, in radians (full loop = 2π ≈ 6.28).
//   0.5  → short dash (~8% of loop)
//   2.0  → default
//   3.14 → half loop
//   6.28 → full loop (snakes meet)
const float SNAKE_LEN  = 3.5;

// All shapes below are normalised to roughly ±1 coordinate space.
// CURVE_SCALE maps them to screen space. ~0.28 fills a hex cell nicely.
// Increase to push the curve wider; decrease to shrink it.
const float CURVE_SCALE = 0.5;

// ── Bezier count ──────────────────────────────────────────────────────────────
// Segments drawn = POINT_COUNT - 1.
//   4  →  3 segments  angular / chunky
//   8  →  7 segments  default
//  12  → 11 segments  noticeably smoother
//  16  → 15 segments  very smooth
#define POINT_COUNT 14

// ── Glow ──────────────────────────────────────────────────────────────────────
const float GLOW_RADIUS    = 0.04; // halo size  (was 0.03 — halved for crispness)
const float GLOW_INTENSITY = 1.2;   // falloff exponent (higher = tighter)
// Core line brightness multiplier. The value is fed into 1−exp(−x) tone mapping,
// so the curve colour saturates toward white above ~3. Keep below 2 for no white.
const float CORE_BRIGHTNESS = 0.5; // 1.5 = dim/coloured | 2.5 = default | 5+ = white-hot

// ── Hex grid ──────────────────────────────────────────────────────────────────
// ↓ HEXAGON RESOLUTION — increase for more/smaller hexagons, decrease for fewer/larger
const float HEX_ZOOM_BASE  = 42.0;  // e.g. 20 = coarse,  32 = default,  60 = fine
const float HEX_ZOOM_AMP   = 0.0;   // zoom pulse amplitude — 0 = static
const float HEX_ZOOM_SPEED = 5.0;   // zoom pulse period (seconds / 2π)
const float HEX_DRIFT_X    = 0.0;   // grid drift speed X — 0 = no movement, try 0.3
const float HEX_DRIFT_Y    = 0.0;   // grid drift speed Y — 0 = no movement, try 0.2
const float HEX_BORDER     = 0.2;  // border thickness (lower = thicker)

// ── Chromatic aberration ───────────────────────────────────────────────────
// 1 = on (samples R/G/B at offset positions; ~3× GPU cost), 0 = off
#define CA_ENABLED 1
const float CA_AMOUNT = 0.02;  // radial channel separation; 0.005 = subtle, 0.02 = vivid

// ── Grain ─────────────────────────────────────────────────────────────────────
const float GRAIN_AMOUNT = 1.2;  // noise intensity: 0 = off | 0.04 = subtle | 0.12 = heavy
const float GRAIN_SPEED  = 20.0;  // grain refresh rate in Hz  (12 = cinematic, 30 = video)

// ── Colours ───────────────────────────────────────────────────────────────────
const vec3 COL_A = vec3(0.0, 0.639, 0.118); // segment A 
const vec3 COL_B = vec3(0.0, 0.192, 0.612); // segment B 

// Cubic bezier position — must be defined before curvePos uses it.
vec2 cbez(vec2 p0, vec2 cp1, vec2 cp2, vec2 p1, float t) {
    float u = 1.0 - t;
    return u*u*u*p0 + 3.0*u*u*t*cp1 + 3.0*u*t*t*cp2 + t*t*t*p1;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CURVE SHAPES  (viewBox 0 0 504 328 — centre 252,164 — scale 252 — Y-flipped)
// ═══════════════════════════════════════════════════════════════════════════════

// ── PATH A — diagonal band with rounded corners (COL_A) ──
// SVG: M390,292.9 h-81.7 c… L89.1,89 c… h78.7 c… l195.9,193.2 C… Z
// viewBox 0 0 504 328 — centre (252,164) — scale 252
// Y normalised as (y_svg - 164) / 252  (no flip)
//
// 8 segments: 4 straight lines alternating with 4 cubic-bezier rounded corners.
// Arc-length parameterisation keeps the snake at constant speed around the loop.
vec2 curvePosA(float t) {
    // Knot points
    vec2 p0 = vec2( 0.5476,  0.5115);  // M390,292.9
    vec2 p1 = vec2( 0.2234,  0.5115);  // after h-81.7
    vec2 p2 = vec2( 0.1187,  0.4679);  // after c-9.9,0,-19.4,-3.9,-26.4,-11
    vec2 p3 = vec2(-0.6464, -0.2976);  // L89.1,89
    vec2 p4 = vec2(-0.6270, -0.3444);  // after c-4.3,-4.4,-1.3,-11.8,4.9,-11.8
    vec2 p5 = vec2(-0.3147, -0.3444);  // after h78.7
    vec2 p6 = vec2(-0.2107, -0.3016);  // after c9.8,0,19.2,3.9,26.2,10.8
    vec2 p7 = vec2( 0.5667,  0.4651);  // after l195.9,193.2 — closes via C to p0

    // Pre-computed arc-length estimates
    float l0 = 0.324;  // horizontal  p0→p1
    float l1 = 0.116;  // corner      p1→p2
    float l2 = 1.082;  // diagonal    p2→p3
    float l3 = 0.061;  // corner      p3→p4
    float l4 = 0.312;  // horizontal  p4→p5
    float l5 = 0.115;  // corner      p5→p6
    float l6 = 1.092;  // diagonal    p6→p7
    float l7 = 0.061;  // corner      p7→p0
    float total = l0+l1+l2+l3+l4+l5+l6+l7;  // ≈ 3.163

    float arc = fract(t / 6.28318) * total;

    if (arc < l0) return mix(p0, p1, arc / l0);
    arc -= l0;
    if (arc < l1) return cbez(p1, vec2( 0.1841, 0.5115), vec2( 0.1464, 0.4960), p2, arc/l1);
    arc -= l1;
    if (arc < l2) return mix(p2, p3, arc / l2);
    arc -= l2;
    if (arc < l3) return cbez(p3, vec2(-0.6635,-0.3151), vec2(-0.6516,-0.3444), p4, arc/l3);
    arc -= l3;
    if (arc < l4) return mix(p4, p5, arc / l4);
    arc -= l4;
    if (arc < l5) return cbez(p5, vec2(-0.2758,-0.3444), vec2(-0.2385,-0.3290), p6, arc/l5);
    arc -= l5;
    if (arc < l6) return mix(p6, p7, arc / l6);
    arc -= l6;
    return cbez(p7, vec2( 0.5845, 0.4817), vec2( 0.5722, 0.5115), p0, clamp(arc/l7, 0.0, 1.0));
}

// ── PATH B — curved swoosh (COL_B) ──
// SVG: M503.2,0 c… S… C… S… Z   — 4 cubic bezier segments
// Y normalised as (y_svg - 164) / 252  (no flip)
vec2 curvePosB(float t) {
    float u   = fract(t / 6.28318) * 4.0;
    float seg = floor(u);
    float lt  = fract(u);

    if (seg < 1.0) return cbez(vec2( 0.997,-0.651), vec2( 0.762,-0.513), vec2( 0.194, 0.032), vec2( 0.014, 0.170), lt);
    if (seg < 2.0) return cbez(vec2( 0.014, 0.170), vec2(-0.167, 0.309), vec2(-0.561, 0.591), vec2(-1.000, 0.648), lt);
    if (seg < 3.0) return cbez(vec2(-1.000, 0.648), vec2(-0.758, 0.555), vec2(-0.383, 0.187), vec2(-0.130, 0.000), lt);
    /*  seg 3 */   return cbez(vec2(-0.130, 0.000), vec2( 0.122,-0.187), vec2( 0.641,-0.519), vec2( 0.997,-0.651), lt);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

const vec2 S = vec2(1.7320508, 1.0); // flat-top hex basis (swap xy for pointy-top)

// Signed distance to a quadratic Bézier  (Iñigo Quilez)
float sdBezier(vec2 pos, vec2 A, vec2 B, vec2 C) {
    vec2 a = B - A;
    vec2 b = A - 2.0*B + C;
    vec2 c = a * 2.0;
    vec2 d = A - pos;

    float kk = 1.0 / dot(b, b);
    float kx = kk * dot(a, b);
    float ky = kk * (2.0*dot(a, a) + dot(d, b)) / 3.0;
    float kz = kk * dot(d, a);

    float p  = ky - kx*kx;
    float p3 = p*p*p;
    float q  = kx*(2.0*kx*kx - 3.0*ky) + kz;
    float h  = q*q + 4.0*p3;

    float res;
    if (h >= 0.0) {
        h = sqrt(h);
        vec2 x  = (vec2(h, -h) - q) / 2.0;
        vec2 uv = sign(x) * pow(abs(x), vec2(1.0/3.0));
        float t = clamp(uv.x + uv.y - kx, 0.0, 1.0);
        vec2 qos = d + (c + b*t)*t;
        res = length(qos);
    } else {
        float z = sqrt(-p);
        float v = acos(clamp(q / (p*z*2.0), -1.0, 1.0)) / 3.0;
        float m = cos(v);
        float n = sin(v) * 1.732050808;
        vec3 t  = clamp(vec3(m+m, -n-m, n-m) * z - kx, 0.0, 1.0);

        vec2 qos = d + (c + b*t.x)*t.x; float dis = dot(qos, qos); res = dis;
             qos = d + (c + b*t.y)*t.y;      dis = dot(qos, qos); res = min(res, dis);
             qos = d + (c + b*t.z)*t.z;      dis = dot(qos, qos); res = min(res, dis);
        res = sqrt(res);
    }
    return res;
}

float glowFn(float dist, float r, float intensity) {
    return pow(r / dist, intensity);
}

// Line-segment SDF — numerically stable for any two points.
// Used for Path A (piecewise linear) to avoid the near-zero denominator that
// sdBezier produces when three collinear points make its curvature term → 0.
float sdSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
    return length(pa - ba * t);
}

// Smooth minimum — blends two distance fields over radius k instead of a hard
// min(). Used to round the sharp corners where two segments meet, eliminating
// the brightness spike that occurs as the snake sweeps through a corner join.
float smin(float a, float b, float k) {
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * k * 0.25;
}

vec2 pts[POINT_COUNT]; // reused by both segment functions

// Path A uses sdSegment + smin — straight-line path with smoothed corners.
float curveSegmentA(float t, vec2 pos) {
    // Continuously advancing phase with sinusoidal speed modulation.
    // d(phase)/dt = SPEED·2π·(1 + EASE_STRENGTH·cos(raw)) — always > 0
    // so the snake never stops, unlike per-cycle ease-in/out which reaches
    // speed = 0 at the loop seam.
    float raw   = SPEED * t * 6.28318;
    float phase = raw + EASE_STRENGTH * sin(raw);
    float step  = SNAKE_LEN / float(POINT_COUNT);
    for (int i = 0; i < POINT_COUNT; i++) pts[i] = curvePosA(phase + float(i) * step);
    float dist = 1e5;
    for (int i = 0; i < POINT_COUNT - 1; i++) {
        float d = sdSegment(pos, CURVE_SCALE * pts[i], CURVE_SCALE * pts[i+1]);
        dist = smin(dist, d, GLOW_RADIUS);  // corner blend radius = glow halo size
    }
    return max(0.0, dist);
}

float curveSegmentB(float t, vec2 pos) {
    float raw   = SPEED * t * 6.28318;
    float phase = raw + EASE_STRENGTH * sin(raw);
    float step  = SNAKE_LEN / float(POINT_COUNT);
    for (int i = 0; i < POINT_COUNT; i++) pts[i] = curvePosB(phase + float(i) * step);
    vec2  c = (pts[0] + pts[1]) * 0.5, prev;
    float dist = 1e5;
    for (int i = 0; i < POINT_COUNT - 1; i++) {
        prev = c; c = (pts[i] + pts[i+1]) * 0.5;
        dist = min(dist, sdBezier(pos, CURVE_SCALE*prev, CURVE_SCALE*pts[i], CURVE_SCALE*c));
    }
    return max(0.0, dist);
}

float hexDist(vec2 p) {
    p = abs(p);
    return max(dot(p, S * 0.5), p.y);
}

vec4 hexCell(vec2 p) {
    vec4 hC = floor(vec4(p, p - vec2(1.0, 0.5)) / S.xyxy) + 0.5;
    vec4 h  = vec4(p - hC.xy*S, p - (hC.zw + 0.5)*S);
    return dot(h.xy, h.xy) < dot(h.zw, h.zw)
        ? vec4(h.xy, hC.xy)
        : vec4(h.zw, hC.zw + 0.5);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 u = (fragCoord - iResolution.xy * 0.5) / iResolution.y;

    float zoom  = sin(iTime / HEX_ZOOM_SPEED) * HEX_ZOOM_AMP + HEX_ZOOM_BASE;
    vec2  drift = vec2(HEX_DRIFT_X * sin(iTime), HEX_DRIFT_Y * sin(iTime * 1.2));
    vec4  h     = hexCell(u * zoom + drift);

    float eDist  = hexDist(h.xy);
    vec3  border = mix(vec3(1.0), vec3(0.0),
                       smoothstep(0.0, 0.06, eDist - 0.5 + HEX_BORDER));

    vec2 pos = vec2(1.0, -1.0) * (h.zw * S - drift) / zoom;

    float t   = iTime;
    vec3  col = vec3(0.0);

#if CA_ENABLED
    // Chromatic aberration: R and B channels are sampled at positions shifted
    // radially outward / inward from the hex-cell centre by CA_AMOUNT.
    // G stays at the true position. This creates coloured fringing around the
    // glowing curves — most visible at the edges of the glow halo.
    vec2 ca_axis = length(pos) > 1e-4 ? normalize(pos) : vec2(1.0, 0.0);
    vec2 pos_r = pos + ca_axis * CA_AMOUNT;  // R shifted outward
    vec2 pos_b = pos - ca_axis * CA_AMOUNT;  // B shifted inward

    float dA_r = curveSegmentA(t, pos_r);
    float dA_g = curveSegmentA(t, pos);
    float dA_b = curveSegmentA(t, pos_b);
    float dB_r = curveSegmentB(t, pos_r);
    float dB_g = curveSegmentB(t, pos);
    float dB_b = curveSegmentB(t, pos_b);

    // Hard core uses the centre (G) distance, tinted by the curve colour.
    // CORE_BRIGHTNESS controls how far toward white the centre saturates.
    col += CORE_BRIGHTNESS * COL_A * smoothstep(0.006, 0.003, dA_g);
    col += CORE_BRIGHTNESS * COL_B * smoothstep(0.006, 0.003, dB_g);

    // Glow — each channel from its own offset position
    col.r += glowFn(dA_r, GLOW_RADIUS, GLOW_INTENSITY) * COL_A.r
           + glowFn(dB_r, GLOW_RADIUS, GLOW_INTENSITY) * COL_B.r;
    col.g += glowFn(dA_g, GLOW_RADIUS, GLOW_INTENSITY) * COL_A.g
           + glowFn(dB_g, GLOW_RADIUS, GLOW_INTENSITY) * COL_B.g;
    col.b += glowFn(dA_b, GLOW_RADIUS, GLOW_INTENSITY) * COL_A.b
           + glowFn(dB_b, GLOW_RADIUS, GLOW_INTENSITY) * COL_B.b;
#else
    // Standard single-sample path (no CA, full performance)
    float d = curveSegmentA(t, pos);
    col += CORE_BRIGHTNESS * COL_A * smoothstep(0.006, 0.003, d);
    col += glowFn(d, GLOW_RADIUS, GLOW_INTENSITY) * COL_A;

    d = curveSegmentB(t, pos);
    col += CORE_BRIGHTNESS * COL_B * smoothstep(0.006, 0.003, d);
    col += glowFn(d, GLOW_RADIUS, GLOW_INTENSITY) * COL_B;
#endif

    col = 1.0 - exp(-col);
    col *= border;

    // Animated film grain — fract-based hash; avoids sin() precision loss
    // that occurs when fragCoord is in large pixel-space values (~57 000+).
    // The time offset shifts the hash each frame to animate the flicker.
    vec2  gp = fract(fragCoord * vec2(0.1031, 0.1030)
                   + floor(iTime * GRAIN_SPEED) * vec2(0.5453, 0.7373));
    gp += dot(gp, gp.yx + 33.33);
    float grain = fract((gp.x + gp.y) * gp.x);
    // Scale grain by perceptual luminance so it only appears in lit areas.
    // Dark/transparent pixels contribute 0; bright glow pixels get full grain.
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col += GRAIN_AMOUNT * (grain - 0.5) * luma;
    col  = max(col, vec3(0.0));  // clamp — keeps background pixels transparent

    // Alpha = saturated sum of channels — 0 where nothing is drawn (transparent
    // background shows through), 1 where curves / glow are present.
    fragColor = vec4(col, min(1.0, col.r + col.g + col.b));
}

void main() {
    vec4 color;
    mainImage(color, gl_FragCoord.xy);
    gl_FragColor = color;
}
