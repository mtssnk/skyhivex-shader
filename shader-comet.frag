#version 300 es
precision highp float;

uniform vec2  iResolution;
uniform float iTime;

// ═══════════════════════════════════════════════════════════════════════════════
// COMET VARIANT  –  variation knobs
// ═══════════════════════════════════════════════════════════════════════════════

// ── Curve tracing ─────────────────────────────────────────────────────────────
const float SPEED         = 0.2;   // trace speed (negative = clockwise)
const float EASE_STRENGTH = 0.5;   // speed variation; 0 = linear, <1 = never stops
const float SNAKE_LEN     = 4.5;   // total comet length in path-parameter radians
const float CURVE_SCALE   = 0.5;   // shape size relative to hex cell

// More points → smoother brightness gradient along the tail.
#define POINT_COUNT 18

// ── Colour helper — paste any 6-digit hex code directly from a colour picker ──
// Usage: HEX(0xRRGGBB)
// Bitwise unpacking is a GLSL ES 3.00 (WebGL2) feature; the result is a
// constant expression so it works with const globals.
#define HEX(c) (vec3(float((c) >> 16 & 0xFF), float((c) >> 8 & 0xFF), float((c) & 0xFF)) / 255.0)

// ── Glow & comet shape ────────────────────────────────────────────────────────
const float GLOW_RADIUS     = 0.013; // nucleus halo radius (tightest point at head)
const float GLOW_INTENSITY  = 2.0;   // glow falloff exponent (higher = tighter halo)
const float CORE_BRIGHTNESS = 0.3;   // nucleus peak brightness
// Tail parameters
const float TAIL_FALLOFF    = 3.0;   // brightness decay exponent (1=linear, 2=quad, 3=steep)
const float TAIL_SPREAD     = 6.0;   // glow radius at tail tip ÷ head radius

// ── Hex grid ──────────────────────────────────────────────────────────────────
const float HEX_ZOOM_BASE  = 50.0;
const float HEX_ZOOM_AMP   = 0.0;
const float HEX_ZOOM_SPEED = 5.0;
const float HEX_DRIFT_X    = 0.0;
const float HEX_DRIFT_Y    = 0.0;
const float HEX_BORDER     = 0.2;

// ── Grain ─────────────────────────────────────────────────────────────────────
const float GRAIN_AMOUNT = 1.5;   // intensity (scaled by luma — only affects lit areas)
const float GRAIN_SPEED  = 30.0;  // flicker rate in Hz

// ── Comet colours ─────────────────────────────────────────────────────────────
// Three independent colour controls per path:
//   CORE = innermost nucleus spike  (the hardest, brightest point)
//   HEAD = outer coma / head glow   (blends into the tail)
//   TAIL = dispersing vapour trail
const vec3 COL_A_CORE = HEX(0x0697FE);  // Path A nucleus spike — pure white
const vec3 COL_A_HEAD = HEX(0x3E00E9);  // Path A head glow     — blue
const vec3 COL_A_TAIL = HEX(0xB50021);  // Path A tail          — deep purple
const vec3 COL_B_CORE = HEX(0xC8FF00);  // Path B nucleus spike — pure white
const vec3 COL_B_HEAD = HEX(0x00FF33);  // Path B head glow     — green
const vec3 COL_B_TAIL = HEX(0xC70003);  // Path B tail          — deep red

// ─────────────────────────────────────────────────────────────────────────────
// Cubic bezier position — must be defined before curve shapes.
// ─────────────────────────────────────────────────────────────────────────────
vec2 cbez(vec2 p0, vec2 cp1, vec2 cp2, vec2 p1, float t) {
    float u = 1.0 - t;
    return u*u*u*p0 + 3.0*u*u*t*cp1 + 3.0*u*t*t*cp2 + t*t*t*p1;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CURVE SHAPES  (viewBox 0 0 504 328 — centre 252,164 — scale 252)
// Coordinates: x_norm = (svgX − 252) / 252,  y_norm = (svgY − 164) / 252
// ═══════════════════════════════════════════════════════════════════════════════

// ── PATH A — diagonal band (parallelogram, sharp corners) ──
//   M406.9,292.9 H292.8 L77.3,77.2 h110.7 Z  (viewBox 0 0 504 328)
vec2 curvePosA(float t) {
    vec2 pA = vec2( 0.6147,  0.5115);  // (406.9, 292.9)
    vec2 pB = vec2( 0.1619,  0.5115);  // (292.8, 292.9)
    vec2 pC = vec2(-0.6933, -0.3444);  // ( 77.3,  77.2)
    vec2 pD = vec2(-0.2540, -0.3444);  // (188.0,  77.2)

    float lAB = 0.453, lBC = 1.210, lCD = 0.439, lDA = 1.220;
    float total = lAB + lBC + lCD + lDA;
    float arc = fract(t / 6.28318) * total;

    if (arc < lAB) return mix(pA, pB, arc / lAB); arc -= lAB;
    if (arc < lBC) return mix(pB, pC, arc / lBC); arc -= lBC;
    if (arc < lCD) return mix(pC, pD, arc / lCD); arc -= lCD;
    return mix(pD, pA, clamp(arc / lDA, 0.0, 1.0));
}

// ── PATH B — curved swoosh ──
vec2 curvePosB(float t) {
    float u = fract(t / 6.28318) * 4.0;
    float seg = floor(u), lt = fract(u);
    if (seg < 1.0) return cbez(vec2( 0.997,-0.651), vec2( 0.762,-0.513), vec2( 0.194, 0.032), vec2( 0.014, 0.170), lt);
    if (seg < 2.0) return cbez(vec2( 0.014, 0.170), vec2(-0.167, 0.309), vec2(-0.561, 0.591), vec2(-1.000, 0.648), lt);
    if (seg < 3.0) return cbez(vec2(-1.000, 0.648), vec2(-0.758, 0.555), vec2(-0.383, 0.187), vec2(-0.130, 0.000), lt);
    return          cbez(vec2(-0.130, 0.000), vec2( 0.122,-0.187), vec2( 0.641,-0.519), vec2( 0.997,-0.651), lt);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

const vec2 S = vec2(1.7320508, 1.0); // flat-top hex basis

// Quadratic Bézier SDF (Iñigo Quilez)
float sdBezier(vec2 pos, vec2 A, vec2 B, vec2 C) {
    vec2 a = B - A, b = A - 2.0*B + C, c = a * 2.0, d = A - pos;
    float kk = 1.0 / dot(b, b);
    float kx = kk * dot(a, b);
    float ky = kk * (2.0*dot(a, a) + dot(d, b)) / 3.0;
    float kz = kk * dot(d, a);
    float p = ky - kx*kx, p3 = p*p*p;
    float q = kx*(2.0*kx*kx - 3.0*ky) + kz;
    float h = q*q + 4.0*p3;
    float res;
    if (h >= 0.0) {
        h = sqrt(h);
        vec2 x = (vec2(h,-h) - q) * 0.5;
        vec2 uv = sign(x) * pow(abs(x), vec2(1.0/3.0));
        float t = clamp(uv.x + uv.y - kx, 0.0, 1.0);
        vec2 qos = d + (c + b*t)*t;
        res = length(qos);
    } else {
        float z = sqrt(-p);
        float v = acos(clamp(q / (p*z*2.0), -1.0, 1.0)) / 3.0;
        float m = cos(v), n = sin(v) * 1.732050808;
        vec3 t = clamp(vec3(m+m, -n-m, n-m) * z - kx, 0.0, 1.0);
        vec2 qos = d + (c + b*t.x)*t.x; float dis = dot(qos,qos); res = dis;
             qos = d + (c + b*t.y)*t.y;      dis = dot(qos,qos); res = min(res,dis);
             qos = d + (c + b*t.z)*t.z;      dis = dot(qos,qos); res = min(res,dis);
        res = sqrt(res);
    }
    return res;
}

// Glow falloff — guarded against d=0.
float glowFn(float dist, float r, float intensity) {
    return pow(r / max(dist, 1e-5), intensity);
}

// Line-segment SDF.
float sdSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
    return length(pa - ba * t);
}

float hexDist(vec2 p) { p = abs(p); return max(dot(p, S * 0.5), p.y); }

vec4 hexCell(vec2 p) {
    vec4 hC = floor(vec4(p, p - vec2(1.0, 0.5)) / S.xyxy) + 0.5;
    vec4 h  = vec4(p - hC.xy*S, p - (hC.zw + 0.5)*S);
    return dot(h.xy, h.xy) < dot(h.zw, h.zw)
        ? vec4(h.xy, hC.xy)
        : vec4(h.zw, hC.zw + 0.5);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMET TRAIL RENDERING
//
// Sample points are ordered tail→head: pts[0] is the trailing end, pts[last]
// is the leading nucleus.  For each segment i:
//
//   tf     = float(i) / float(POINT_COUNT-2)   → 0 = tail end, 1 = head end
//   brt    = pow(tf, TAIL_FALLOFF)             → dim at tail, full at head
//   rad    = GLOW_RADIUS * mix(TAIL_SPREAD,1)  → wide+diffuse tail, tight nucleus
//   glowC  = mix(COL_TAIL, COL_HEAD, tf)       → glow gradient tail→head
//   coreC  = COL_CORE                          → nucleus spike, independent colour
// ─────────────────────────────────────────────────────────────────────────────

vec2 pts[POINT_COUNT];

void cometTrailA(float t, vec2 pos, inout vec3 col) {
    float raw   = SPEED * t * 6.28318;
    float phase = raw + EASE_STRENGTH * sin(raw);
    float step  = SNAKE_LEN / float(POINT_COUNT);
    for (int i = 0; i < POINT_COUNT; i++)
        pts[i] = curvePosA(phase + float(i) * step);

    for (int i = 0; i < POINT_COUNT - 1; i++) {
        float tf    = float(i) / float(POINT_COUNT - 2);
        float brt   = pow(tf, TAIL_FALLOFF);
        float rad   = GLOW_RADIUS * mix(TAIL_SPREAD, 1.0, tf);
        vec3  glowC = mix(COL_A_TAIL, COL_A_HEAD, tf);  // tail→head gradient

        float d = sdSegment(pos, CURVE_SCALE * pts[i], CURVE_SCALE * pts[i+1]);
        // Diffuse glow — colour shifts from TAIL to HEAD along the snake.
        col += brt * glowFn(d, rad, GLOW_INTENSITY) * glowC;
        // Nucleus spike — uses CORE colour independently; brt² keeps it at the head.
        col += CORE_BRIGHTNESS * brt * brt * COL_A_CORE * smoothstep(0.006, 0.003, d);
    }
}

void cometTrailB(float t, vec2 pos, inout vec3 col) {
    float raw   = SPEED * t * 6.28318;
    float phase = raw + EASE_STRENGTH * sin(raw);
    float step  = SNAKE_LEN / float(POINT_COUNT);
    for (int i = 0; i < POINT_COUNT; i++)
        pts[i] = curvePosB(phase + float(i) * step);

    vec2 c = (pts[0] + pts[1]) * 0.5, prev;
    for (int i = 0; i < POINT_COUNT - 1; i++) {
        float tf    = float(i) / float(POINT_COUNT - 2);
        float brt   = pow(tf, TAIL_FALLOFF);
        float rad   = GLOW_RADIUS * mix(TAIL_SPREAD, 1.0, tf);
        vec3  glowC = mix(COL_B_TAIL, COL_B_HEAD, tf);  // tail→head gradient

        prev = c; c = (pts[i] + pts[i+1]) * 0.5;
        float d = sdBezier(pos, CURVE_SCALE*prev, CURVE_SCALE*pts[i], CURVE_SCALE*c);
        col += brt * glowFn(d, rad, GLOW_INTENSITY) * glowC;
        col += CORE_BRIGHTNESS * brt * brt * COL_B_CORE * smoothstep(0.006, 0.003, d);
    }
}

// ─────────────────────────────────────────────────────────────────────────────

out vec4 fragColor;

void mainImage(out vec4 fc, in vec2 fragCoord) {
    vec2 u = (fragCoord - iResolution.xy * 0.5) / iResolution.y;

    float zoom  = sin(iTime / HEX_ZOOM_SPEED) * HEX_ZOOM_AMP + HEX_ZOOM_BASE;
    vec2  drift = vec2(HEX_DRIFT_X * sin(iTime), HEX_DRIFT_Y * sin(iTime * 1.2));
    vec4  h     = hexCell(u * zoom + drift);

    float eDist  = hexDist(h.xy);
    vec3  border = mix(vec3(1.0), vec3(0.0),
                       smoothstep(0.0, 0.06, eDist - 0.5 + HEX_BORDER));

    vec2 pos = vec2(1.0, -1.0) * (h.zw * S - drift) / zoom;

    vec3 col = vec3(0.0);
    cometTrailA(iTime, pos, col);
    cometTrailB(iTime, pos, col);

    // Hue-preserving tone mapping — compresses luminance so the colour ratio is
    // maintained at any CORE_BRIGHTNESS, preventing the core washing to white.
    float luma_raw = max(dot(col, vec3(0.299, 0.587, 0.114)), 1e-6);
    col = col * (1.0 - exp(-luma_raw)) / luma_raw;
    col *= border;

    // Grain — scaled by luminance so it only textures the lit areas.
    vec2  gp = fract(fragCoord * vec2(0.1031, 0.1030)
                   + floor(iTime * GRAIN_SPEED) * vec2(0.5453, 0.7373));
    gp += dot(gp, gp.yx + 33.33);
    float grain = fract((gp.x + gp.y) * gp.x);
    float luma  = dot(col, vec3(0.299, 0.587, 0.114));
    col += GRAIN_AMOUNT * (grain - 0.5) * luma;
    col  = max(col, vec3(0.0));

    // Alpha = 0 where nothing is drawn (transparent background shows through).
    fc = vec4(col, min(1.0, col.r + col.g + col.b));
}

void main() {
    mainImage(fragColor, gl_FragCoord.xy);
}
