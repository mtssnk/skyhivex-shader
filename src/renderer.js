/**
 * renderer.js
 * -----------
 * Minimal WebGL1 fullscreen-quad renderer.
 *
 * Usage:
 *   import { createRenderer } from './src/renderer.js';
 *   const renderer = createRenderer(canvasElement, fragmentShaderSource);
 *   renderer.start();
 *   // later:
 *   renderer.stop();
 *   renderer.destroy();
 *
 * This module is intentionally framework-agnostic so it can be wrapped
 * inside a Preact component (or any other component) without changes.
 */

const VERTEX_SHADER = `#version 300 es
  in vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

// Fullscreen quad — two triangles covering clip space.
const QUAD = new Float32Array([
  -1, -1,  1, -1, -1,  1,
  -1,  1,  1, -1,  1,  1,
]);

/**
 * Compile a GLSL shader. Returns the shader object or throws on error.
 * @param {WebGLRenderingContext} gl
 * @param {number} type  gl.VERTEX_SHADER | gl.FRAGMENT_SHADER
 * @param {string} src
 */
function compileShader(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error:\n${log}`);
  }
  return shader;
}

/**
 * Link a WebGL program from a vertex + fragment shader. Throws on error.
 * @param {WebGLRenderingContext} gl
 * @param {WebGLShader} vs
 * @param {WebGLShader} fs
 */
function linkProgram(gl, vs, fs) {
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error:\n${log}`);
  }
  return program;
}

/**
 * Create a fullscreen WebGL2 renderer for a Shadertoy-style fragment shader.
 *
 * The fragment shader must declare:
 *   uniform vec2  iResolution;
 *   uniform float iTime;
 * and use GLSL ES 3.00 (`#version 300 es`).
 *
 * @param {HTMLCanvasElement} canvas
 * @param {string} fragSrc  Full GLSL ES 3.00 fragment shader source.
 * @returns {{ start: () => void, stop: () => void, destroy: () => void }}
 */
export function createRenderer(canvas, fragSrc, { onStats, maxPixelRatio = 1.5 } = {}) {
  // premultipliedAlpha: false → straight alpha compositing, so the canvas blends
  // cleanly over whatever HTML background is behind it.
  const ctxOpts = { alpha: true, premultipliedAlpha: false };
  const gl = canvas.getContext('webgl2', ctxOpts);
  if (!gl) throw new Error('WebGL2 is not supported in this browser. Try Chrome, Firefox, or Safari 15+.');

  // ── Compile & link ─────────────────────────────────────────────────────────
  const vs      = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs      = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const program = linkProgram(gl, vs, fs);

  // ── Geometry ───────────────────────────────────────────────────────────────
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);

  const posLoc = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  // ── Uniforms ───────────────────────────────────────────────────────────────
  const uResolution = gl.getUniformLocation(program, 'iResolution');
  const uTime       = gl.getUniformLocation(program, 'iTime');

  // ── Resize handling ────────────────────────────────────────────────────────
  const dpr = Math.min(devicePixelRatio, maxPixelRatio);

  const ro = new ResizeObserver(() => {
    canvas.width  = canvas.clientWidth  * dpr;
    canvas.height = canvas.clientHeight * dpr;
    gl.viewport(0, 0, canvas.width, canvas.height);
  });
  ro.observe(canvas);
  // Trigger immediately
  canvas.width  = canvas.clientWidth  * dpr;
  canvas.height = canvas.clientHeight * dpr;
  gl.viewport(0, 0, canvas.width, canvas.height);

  // ── Animation loop ─────────────────────────────────────────────────────────
  let rafId      = null;
  let startMs    = null;
  let fpsFrames  = 0;
  let fpsMarkMs  = null;

  function frame(nowMs) {
    if (startMs === null) { startMs = nowMs; fpsMarkMs = nowMs; }
    const t = (nowMs - startMs) / 1000.0;

    fpsFrames++;
    const elapsed = nowMs - fpsMarkMs;
    if (elapsed >= 1000 && onStats) {
      onStats({ fps: Math.round(fpsFrames * 1000 / elapsed) });
      fpsFrames = 0;
      fpsMarkMs = nowMs;
    }

    gl.useProgram(program);
    gl.uniform2f(uResolution, canvas.width, canvas.height);
    gl.uniform1f(uTime, t);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    rafId = requestAnimationFrame(frame);
  }

  return {
    /** Begin or resume the render loop. */
    start() {
      if (rafId === null) rafId = requestAnimationFrame(frame);
    },

    /** Pause the render loop (keeps WebGL state intact). */
    stop() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },

    /** Tear down all WebGL resources and the ResizeObserver. */
    destroy() {
      this.stop();
      ro.disconnect();
      gl.deleteBuffer(quadBuf);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteProgram(program);
    },
  };
}
