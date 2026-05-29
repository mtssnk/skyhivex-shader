#version 300 es
precision highp float;

uniform vec2  iResolution;
uniform float iTime;

// ═══════════════════════════════════════════════════════════════════════════════
// COMET VARIANT — two comets sharing one closed path
// ═══════════════════════════════════════════════════════════════════════════════

// ── Curve tracing ─────────────────────────────────────────────────────────────
const float SPEED         = 0.17;    // trace speed (negative = clockwise)
const float EASE_STRENGTH = 0.45;    // speed variation; 0 = linear, <1 = never stops
const float SNAKE_LEN     = 3.1;    // total comet length in path-parameter radians
const float CURVE_SCALE   = 0.5;    // shape size relative to hex cell
const float PHASE_OFFSET  = 3.14159; // angular separation between the two comets
// const float PHASE_OFFSET  = 3.14159; // angular separation between the two comets

#define POINT_COUNT 18

// ── Colour helper — paste any 6-digit hex code directly from a colour picker ──
#define HEX(c) (vec3(float((c) >> 16 & 0xFF), float((c) >> 8 & 0xFF), float((c) & 0xFF)) / 255.0)

// ── Glow & comet shape ────────────────────────────────────────────────────────
const float GLOW_RADIUS    = 0.013; // nucleus halo radius (tightest point at head)
const float GLOW_INTENSITY = 1.3;     // glow falloff exponent (higher = tighter halo)
const float TAIL_FALLOFF   = 2.1;   // brightness decay exponent (1=linear, 2=quad, 3=steep)
const float TAIL_SPREAD    = 4.0;   // glow radius at tail tip ÷ head radius

// ── Hex grid ──────────────────────────────────────────────────────────────────
const float HEX_ZOOM_BASE  = 37.0;
const float HEX_BORDER     = 0.2;

// ── Grain ─────────────────────────────────────────────────────────────────────
const float GRAIN_AMOUNT = 1.5;   // intensity (scaled by luma — only affects lit areas)
const float GRAIN_SPEED  = 30.0;  // flicker rate in Hz

// ── Comet colours ─────────────────────────────────────────────────────────────
const vec3 COL_A_HEAD = HEX(0xB50021);  // Comet A head glow
const vec3 COL_A_TAIL = HEX(0x3E00E9);  // Comet A tail
const vec3 COL_B_HEAD = HEX(0xC70003);  // Comet B head glow
const vec3 COL_B_TAIL = HEX(0x00FF33);  // Comet B tail

// ─────────────────────────────────────────────────────────────────────────────
// Cubic bezier position
// ─────────────────────────────────────────────────────────────────────────────
vec2 cbez(vec2 p0, vec2 cp1, vec2 cp2, vec2 p1, float t) {
    float u = 1.0 - t;
    return u*u*u*p0 + 3.0*u*u*t*cp1 + 3.0*u*t*t*cp2 + t*t*t*p1;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATH  (SVG viewBox 0 0 504 328, normalised: x=(svgX−252)/252, y=(svgY−164)/252)
//
// Segment map (10 segments, 4 cubic + 6 linear):
//   1  cubic  (503.2,  0.0) → (252.2,140.5)   arc ≈ 1.143
//   2  line   (252.2,140.5) → (188.0, 77.2)   arc ≈ 0.358
//   3  line   (188.0, 77.2) → ( 77.3, 77.2)   arc ≈ 0.439
//   4  line   ( 77.3, 77.2) → (188.3,188.3)   arc ≈ 0.623
//   5  cubic  (188.3,188.3) → (  0.0,327.3)   arc ≈ 0.931
//   6  cubic  (  0.0,327.3) → (227.5,227.6)   arc ≈ 0.994
//   7  line   (227.5,227.6) → (292.8,292.9)   arc ≈ 0.366
//   8  line   (292.8,292.9) → (406.9,292.9)   arc ≈ 0.453
//   9  line   (406.9,292.9) → (290.1,177.9)   arc ≈ 0.650
//  10  cubic  (290.1,177.9) → (503.2,  0.0)   arc ≈ 1.102
// ═══════════════════════════════════════════════════════════════════════════════
vec2 curvePath(float t) {
    float l1=1.143, l2=0.358, l3=0.439, l4=0.623,
          l5=0.931, l6=0.994, l7=0.366, l8=0.453,
          l9=0.650, l10=1.102;
    float total = l1+l2+l3+l4+l5+l6+l7+l8+l9+l10;
    float arc = fract(t / 6.28318) * total;

    vec2 p0 = vec2( 0.9968,-0.6508);  // (503.2,  0.0)
    vec2 p1 = vec2( 0.0008,-0.0933);  // (252.2,140.5)
    vec2 p2 = vec2(-0.2540,-0.3444);  // (188.0, 77.2)
    vec2 p3 = vec2(-0.6933,-0.3444);  // ( 77.3, 77.2)
    vec2 p4 = vec2(-0.2528, 0.0964);  // (188.3,188.3)
    vec2 p5 = vec2(-1.0000, 0.6480);  // (  0.0,327.3)
    vec2 p6 = vec2(-0.0972, 0.2524);  // (227.5,227.6)
    vec2 p7 = vec2( 0.1619, 0.5115);  // (292.8,292.9)
    vec2 p8 = vec2( 0.6147, 0.5115);  // (406.9,292.9)
    vec2 p9 = vec2( 0.1512, 0.0552);  // (290.1,177.9)

    if (arc < l1)  { return cbez(p0, vec2( 0.6944,-0.5393), vec2( 0.2750,-0.2829), p1, arc/l1); } arc -= l1;
    if (arc < l2)  { return mix(p1, p2, arc/l2); } arc -= l2;
    if (arc < l3)  { return mix(p2, p3, arc/l3); } arc -= l3;
    if (arc < l4)  { return mix(p3, p4, arc/l4); } arc -= l4;
    if (arc < l5)  { return cbez(p4, vec2(-0.4937, 0.2929), vec2(-0.7948, 0.5690), p5, arc/l5); } arc -= l5;
    if (arc < l6)  { return cbez(p5, vec2(-0.6365, 0.6012), vec2(-0.3032, 0.3988), p6, arc/l6); } arc -= l6;
    if (arc < l7)  { return mix(p6, p7, arc/l7); } arc -= l7;
    if (arc < l8)  { return mix(p7, p8, arc/l8); } arc -= l8;
    if (arc < l9)  { return mix(p8, p9, arc/l9); } arc -= l9;
    return cbez(p9, vec2(0.3952,-0.1579), vec2(0.8060,-0.5389), p0, clamp(arc/l10, 0.0, 1.0));
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

const vec2 S = vec2(1.7320508, 1.0); // flat-top hex basis

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
// ─────────────────────────────────────────────────────────────────────────────

vec2 pts[POINT_COUNT];

void cometTrail(float t, float phaseOff, vec3 colHead, vec3 colTail, vec2 pos, inout vec3 col) {
    float raw   = SPEED * t * 6.28318;
    float phase = raw + EASE_STRENGTH * sin(raw) + phaseOff;
    float step  = SNAKE_LEN / float(POINT_COUNT);
    for (int i = 0; i < POINT_COUNT; i++)
        pts[i] = curvePath(phase + float(i) * step);

    for (int i = 0; i < POINT_COUNT - 1; i++) {
        float tf    = float(i) / float(POINT_COUNT - 2);
        float brt   = pow(tf, TAIL_FALLOFF);
        float rad   = GLOW_RADIUS * mix(TAIL_SPREAD, 1.0, tf);
        vec3  glowC = mix(colTail, colHead, tf);

        float d = sdSegment(pos, CURVE_SCALE * pts[i], CURVE_SCALE * pts[i+1]);
        col += brt * glowFn(d, rad, GLOW_INTENSITY) * glowC;
    }
}

// ─────────────────────────────────────────────────────────────────────────────

out vec4 fragColor;

void mainImage(out vec4 fc, in vec2 fragCoord) {
    vec2 u = (fragCoord - iResolution.xy * 0.5) / iResolution.y;

    vec4  h     = hexCell(u * HEX_ZOOM_BASE);

    float eDist  = hexDist(h.xy);
    vec3  border = mix(vec3(1.0), vec3(0.0),
                       smoothstep(0.0, 0.06, eDist - 0.5 + HEX_BORDER));

    vec2 pos = vec2(1.0, -1.0) * h.zw * S / HEX_ZOOM_BASE;

    vec3 col = vec3(0.0);
    cometTrail(iTime, 0.0,          COL_A_HEAD, COL_A_TAIL, pos, col);
    cometTrail(iTime, PHASE_OFFSET, COL_B_HEAD, COL_B_TAIL, pos, col);

    // Hue-preserving tone mapping.
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
