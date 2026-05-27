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

// ── Glow & comet shape ────────────────────────────────────────────────────────
const float GLOW_RADIUS     = 0.011; // nucleus halo radius (tightest point at head)
const float GLOW_INTENSITY  = 1.9;   // glow falloff exponent (higher = tighter halo)
const float CORE_BRIGHTNESS = 3.5;   // nucleus peak brightness
// Tail parameters
const float TAIL_FALLOFF    = 1.6;   // brightness decay exponent (1=linear, 2=quad, 3=steep)
const float TAIL_SPREAD     = 7.0;   // glow radius at tail tip ÷ head radius

// ── Hex grid ──────────────────────────────────────────────────────────────────
const float HEX_ZOOM_BASE  = 50.0;
const float HEX_ZOOM_AMP   = 0.0;
const float HEX_ZOOM_SPEED = 5.0;
const float HEX_DRIFT_X    = 0.0;
const float HEX_DRIFT_Y    = 0.0;
const float HEX_BORDER     = 0.2;

// ── Grain ─────────────────────────────────────────────────────────────────────
const float GRAIN_AMOUNT = 1.0;   // intensity (scaled by luma — only affects lit areas)
const float GRAIN_SPEED  = 20.0;  // flicker rate in Hz

// ── Comet colours ─────────────────────────────────────────────────────────────
// HEAD = bright nucleus / coma.  TAIL = dispersing vapour trail.
const vec3 COL_A_HEAD = vec3(0.88, 0.95, 1.00);  // Path A nucleus — blue-white
const vec3 COL_A_TAIL = vec3(0.04, 0.18, 0.72);  // Path A tail   — deep blue
const vec3 COL_B_HEAD = vec3(0.75, 1.00, 0.90);  // Path B nucleus — cyan-white
const vec3 COL_B_TAIL = vec3(0.00, 0.12, 0.45);  // Path B tail   — deep teal

// ─────────────────────────────────────────────────────────────────────────────
// Cubic bezier position — must be defined before curve shapes.
// ─────────────────────────────────────────────────────────────────────────────
vec2 cbez(vec2 p0, vec2 cp1, vec2 cp2, vec2 p1, float t) {
    float u = 1.0 - t;
    return u*u*u*p0 + 3.0*u*u*t*cp1 + 3.0*u*t*t*cp2 + t*t*t*p1;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CURVE SHAPES  (viewBox 0 0 504 328 — centre 252,164 — scale 252 — no Y-flip)
// ═══════════════════════════════════════════════════════════════════════════════

// ── PATH A — diagonal band with rounded corners ──
vec2 curvePosA(float t) {
    vec2 p0 = vec2( 0.5476,  0.5115);
    vec2 p1 = vec2( 0.2234,  0.5115);
    vec2 p2 = vec2( 0.1187,  0.4679);
    vec2 p3 = vec2(-0.6464, -0.2976);
    vec2 p4 = vec2(-0.6270, -0.3444);
    vec2 p5 = vec2(-0.3147, -0.3444);
    vec2 p6 = vec2(-0.2107, -0.3016);
    vec2 p7 = vec2( 0.5667,  0.4651);

    float l0=0.324, l1=0.116, l2=1.082, l3=0.061,
          l4=0.312, l5=0.115, l6=1.092, l7=0.061;
    float total = l0+l1+l2+l3+l4+l5+l6+l7;
    float arc = fract(t / 6.28318) * total;

    if (arc < l0) return mix(p0, p1, arc/l0); arc -= l0;
    if (arc < l1) return cbez(p1, vec2( 0.1841, 0.5115), vec2( 0.1464, 0.4960), p2, arc/l1); arc -= l1;
    if (arc < l2) return mix(p2, p3, arc/l2); arc -= l2;
    if (arc < l3) return cbez(p3, vec2(-0.6635,-0.3151), vec2(-0.6516,-0.3444), p4, arc/l3); arc -= l3;
    if (arc < l4) return mix(p4, p5, arc/l4); arc -= l4;
    if (arc < l5) return cbez(p5, vec2(-0.2758,-0.3444), vec2(-0.2385,-0.3290), p6, arc/l5); arc -= l5;
    if (arc < l6) return mix(p6, p7, arc/l6); arc -= l6;
    return cbez(p7, vec2( 0.5845, 0.4817), vec2( 0.5722, 0.5115), p0, clamp(arc/l7, 0.0, 1.0));
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
//   tf    = float(i) / float(POINT_COUNT-2)   → 0 = tail end, 1 = head end
//   brt   = pow(tf, TAIL_FALLOFF)             → dim at tail, full at head
//   rad   = GLOW_RADIUS * mix(TAIL_SPREAD,1)  → wide+diffuse tail, tight nucleus
//   segC  = mix(COL_TAIL, COL_HEAD, tf)       → colour shifts tail→nucleus
// ─────────────────────────────────────────────────────────────────────────────

vec2 pts[POINT_COUNT];

void cometTrailA(float t, vec2 pos, inout vec3 col) {
    float raw   = SPEED * t * 6.28318;
    float phase = raw + EASE_STRENGTH * sin(raw);
    float step  = SNAKE_LEN / float(POINT_COUNT);
    for (int i = 0; i < POINT_COUNT; i++)
        pts[i] = curvePosA(phase + float(i) * step);

    for (int i = 0; i < POINT_COUNT - 1; i++) {
        float tf   = float(i) / float(POINT_COUNT - 2);
        float brt  = pow(tf, TAIL_FALLOFF);
        float rad  = GLOW_RADIUS * mix(TAIL_SPREAD, 1.0, tf);
        vec3  segC = mix(COL_A_TAIL, COL_A_HEAD, tf);

        float d = sdSegment(pos, CURVE_SCALE * pts[i], CURVE_SCALE * pts[i+1]);
        // Diffuse glow — widens and fades toward the tail.
        col += brt * glowFn(d, rad, GLOW_INTENSITY) * segC;
        // Nucleus core — brt² keeps the bright spike only at the very head.
        col += CORE_BRIGHTNESS * brt * brt * segC * smoothstep(0.006, 0.003, d);
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
        float tf   = float(i) / float(POINT_COUNT - 2);
        float brt  = pow(tf, TAIL_FALLOFF);
        float rad  = GLOW_RADIUS * mix(TAIL_SPREAD, 1.0, tf);
        vec3  segC = mix(COL_B_TAIL, COL_B_HEAD, tf);

        prev = c; c = (pts[i] + pts[i+1]) * 0.5;
        float d = sdBezier(pos, CURVE_SCALE*prev, CURVE_SCALE*pts[i], CURVE_SCALE*c);
        col += brt * glowFn(d, rad, GLOW_INTENSITY) * segC;
        col += CORE_BRIGHTNESS * brt * brt * segC * smoothstep(0.006, 0.003, d);
    }
}

// ─────────────────────────────────────────────────────────────────────────────

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
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

    col = 1.0 - exp(-col);
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
    fragColor = vec4(col, min(1.0, col.r + col.g + col.b));
}

void main() {
    vec4 color;
    mainImage(color, gl_FragCoord.xy);
    gl_FragColor = color;
}
