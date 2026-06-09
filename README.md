# Heart × Hex — shader prototype

Animated heart curves tiled across a hexagonal grid, ported from
[Shadertoy #3tKSWV](https://www.shadertoy.com/view/3tKSWV) (itself a mix of
[WdK3Dz](https://www.shadertoy.com/view/WdK3Dz) and
[wtdSzX](https://www.shadertoy.com/view/wtdSzX)).

## Running the prototype

Because `index.html` fetches `shader.frag` via `fetch()`, you need a local HTTP
server (browsers block `fetch` on `file://`). Any of these work:

```bash
# Python 3
python3 -m http.server 8080

# Node (npx, no install)
npx serve .

# VS Code — "Live Server" extension → "Open with Live Server"
```

Then open <http://localhost:8080>.

---

## Variation knobs

All user-facing parameters live at the top of [`shader.frag`](./shader.frag)
under **"Variation knobs"**. Edit → save → reload the page; no build step needed.

| Constant         | Default     | What it does                              |
| ---------------- | ----------- | ----------------------------------------- |
| `SPEED`          | `-0.5`      | Trace speed; negative = clockwise         |
| `POINT_LEN`      | `0.25`      | Arc spacing between bezier control points |
| `HEART_SCALE`    | `0.017`     | Heart size relative to each hex cell      |
| `GLOW_RADIUS`    | `0.03`      | Bloom halo size                           |
| `GLOW_INTENSITY` | `0.8`       | Bloom falloff (higher = tighter)          |
| `HEX_ZOOM_BASE`  | `45.0`      | Base grid zoom level                      |
| `HEX_ZOOM_AMP`   | `40.0`      | How much the zoom oscillates              |
| `HEX_ZOOM_SPEED` | `5.0`       | Zoom oscillation period (seconds / 2π)    |
| `HEX_DRIFT_X/Y`  | `2.0 / 3.0` | Grid pan speed divisors                   |
| `HEX_BORDER`     | `0.12`      | Hex cell border thickness                 |
| `COL_A`          | pink        | Colour of the first heart segment         |
| `COL_B`          | blue        | Colour of the second heart segment        |

Switch from **flat-top** to **pointy-top** hexagons by changing the `S` constant
near the top of the shader (swap the two commented-out lines).

---

## File structure

```
├── index.html          — dev prototype entry point
├── shader.frag         — GLSL fragment shader (edit this)
└── src/
    └── renderer.js     — framework-agnostic WebGL1 runner
```

---

## Astro + Preact migration path

When you're ready to integrate into the Astro + `@astrojs/preact` project:

1. **Copy `shader.frag` and `src/renderer.js`** into the Astro project
   (e.g. `src/shaders/heartHex.frag` and `src/lib/renderer.js`).

2. **Create a Preact component** — the renderer is already framework-agnostic,
   so wrapping it is straightforward:

   ```tsx
   // src/components/HeartHexShader.tsx
   import { useEffect, useRef } from "preact/hooks";
   import { createRenderer } from "../lib/renderer.js";
   import fragSrc from "../shaders/heartHex.frag?raw"; // Vite raw import

   export default function HeartHexShader() {
     const canvasRef = useRef<HTMLCanvasElement>(null);

     useEffect(() => {
       const renderer = createRenderer(canvasRef.current!, fragSrc);
       renderer.start();
       return () => renderer.destroy();
     }, []);

     return (
       <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />
     );
   }
   ```

3. **Use it in any `.astro` file:**

   ```astro
   ---
   import HeartHexShader from '../components/HeartHexShader';
   ---
   <div style="width: 100vw; height: 100vh;">
     <HeartHexShader client:only="preact" />
   </div>
   ```

   The `client:only="preact"` directive ensures the canvas is never SSR'd
   (WebGL requires a real browser environment).

4. **Vite `?raw` imports** work out of the box in Astro — no extra config needed
   for `.frag` files when using the `?raw` suffix.

   ## TO DO
   - ~~Add chromatic aberration effect~~ ✓
   - Explore different colour combinations
   - Try a CRT effect
   - **Interactivity** (needs `iMouse` uniform wired in `renderer.js` + `index.html`):
     - Mouse lens — distort UV around cursor to magnify hex cells beneath it
     - Comet gravity — bend the comet trail toward/away from the cursor on proximity
     - Mouse controls CA — `iMouse.x` rotates CA offset angle, `iMouse.y` controls intensity
     - Click ripple — clicking spawns an expanding bright ring that fades through the hex grid (~1–2 s)
