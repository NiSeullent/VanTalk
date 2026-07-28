import { useEffect, useRef } from 'react';

/**
 * Full-viewport ambient backdrop.
 * Prefers WebGPU; falls back to a low-cost 2D canvas.
 * Replaces stacked CSS filter:blur() orbs that force huge offscreen layers.
 */
export function AmbientBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let frameHandle = 0;
    let resizeObserver: ResizeObserver | null = null;
    let destroyGpu: (() => void) | null = null;

    const coarse = window.matchMedia('(max-width: 800px), (pointer: coarse)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const schedule = (fn: () => void) => {
      // Mobile / reduced-motion: ~10fps; desktop ambient ~16fps.
      const delay = reduced ? 120 : coarse ? 90 : 60;
      frameHandle = window.setTimeout(() => {
        if (document.visibilityState === 'hidden') {
          schedule(fn);
          return;
        }
        frameHandle = requestAnimationFrame(fn);
      }, delay);
    };

    const onResize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1 : 1.5);
      const w = Math.max(1, parent.clientWidth);
      const h = Math.max(1, parent.clientHeight);
      const nextW = Math.floor(w * dpr);
      const nextH = Math.floor(h * dpr);
      if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width = nextW;
        canvas.height = nextH;
      }
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };

    onResize();
    resizeObserver = new ResizeObserver(onResize);
    if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);

    void (async () => {
      // WebGPU on mobile browsers is often costly; prefer cheap 2D there.
      if (!coarse && !reduced) {
        destroyGpu = await startWebGpu(canvas, () => disposed, schedule);
        if (disposed) {
          destroyGpu?.();
          return;
        }
      }
      if (!destroyGpu) startCanvas2d(canvas, () => disposed, schedule);
    })();

    return () => {
      disposed = true;
      window.clearTimeout(frameHandle);
      cancelAnimationFrame(frameHandle);
      resizeObserver?.disconnect();
      destroyGpu?.();
    };
  }, []);

  return <canvas ref={canvasRef} className="ambient-gpu" aria-hidden />;
}

type Schedule = (fn: () => void) => void;

async function startWebGpu(
  canvas: HTMLCanvasElement,
  isDisposed: () => boolean,
  schedule: Schedule,
): Promise<(() => void) | null> {
  const nav = navigator as Navigator & {
    gpu?: {
      requestAdapter(): Promise<{
        requestDevice(): Promise<{
          createShaderModule(desc: { code: string }): unknown;
          createRenderPipeline(desc: Record<string, unknown>): {
            getBindGroupLayout(i: number): unknown;
          };
          createBuffer(desc: Record<string, unknown>): unknown;
          createBindGroup(desc: Record<string, unknown>): unknown;
          createCommandEncoder(): {
            beginRenderPass(desc: Record<string, unknown>): {
              setPipeline(p: unknown): void;
              setBindGroup(i: number, g: unknown): void;
              draw(n: number): void;
              end(): void;
            };
            finish(): unknown;
          };
          queue: {
            writeBuffer(buffer: unknown, offset: number, data: BufferSource): void;
            submit(cmds: unknown[]): void;
          };
          destroy(): void;
        }>;
      } | null>;
      getPreferredCanvasFormat(): string;
    };
  };
  if (!nav.gpu) return null;

  try {
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter || isDisposed()) return null;
    const device = await adapter.requestDevice();
    if (isDisposed()) {
      device.destroy();
      return null;
    }
    const context = (canvas.getContext as (id: string) => unknown)('webgpu') as {
      configure(desc: Record<string, unknown>): void;
      getCurrentTexture(): { createView(): unknown };
    } | null;
    if (!context) {
      device.destroy();
      return null;
    }

    const format = nav.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'premultiplied' });

    const shader = device.createShaderModule({
      code: `
struct Uniforms { time: f32, aspect: f32, _p0: f32, _p1: f32, }
@group(0) @binding(0) var<uniform> u: Uniforms;
struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f, }
@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var p = array<vec2f,3>(vec2f(-1.,-1.), vec2f(3.,-1.), vec2f(-1.,3.));
  var o: VSOut; o.pos = vec4f(p[i], 0., 1.); o.uv = p[i] * 0.5 + vec2f(0.5); return o;
}
fn orb(uv: vec2f, c: vec2f, r: f32, col: vec3f) -> vec3f {
  let d = length((uv - c) * vec2f(u.aspect, 1.));
  let f = clamp(1. - d / r, 0., 1.);
  return col * (f * f);
}
@fragment fn fs(input: VSOut) -> @location(0) vec4f {
  let col = vec3f(0.94, 0.91, 0.84);
  col += orb(uv, vec2f(0.78 + 0.04*sin(t*0.21), 0.18 + 0.05*cos(t*0.17)), 0.55, vec3f(1.0, 0.95, 0.55));
  col += orb(uv, vec2f(0.22 + 0.05*cos(t*0.13), 0.82 + 0.04*sin(t*0.19)), 0.62, vec3f(0.99, 0.90, 0.2));
  return vec4f(col, 1.);
}`,
    });

    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: shader, entryPoint: 'vs' },
      fragment: { module: shader, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });

    const UNIFORM = 0x40;
    const COPY_DST = 0x08;
    const uniformBuffer = device.createBuffer({
      size: 16,
      usage: UNIFORM | COPY_DST,
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    const started = performance.now();
    const frame = () => {
      if (isDisposed()) return;
      const t = (performance.now() - started) / 1000;
      const aspect = canvas.width / Math.max(1, canvas.height);
      device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([t, aspect, 0, 0]));
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0.94, g: 0.91, b: 0.84, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
      device.queue.submit([encoder.finish()]);
      schedule(frame);
    };
    schedule(frame);
    return () => device.destroy();
  } catch {
    return null;
  }
}

function startCanvas2d(
  canvas: HTMLCanvasElement,
  isDisposed: () => boolean,
  schedule: Schedule,
) {
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!ctx) return;
  const started = performance.now();
  const frame = () => {
    if (isDisposed()) return;
    const w = canvas.width;
    const h = canvas.height;
    const t = (performance.now() - started) / 1000;
    ctx.fillStyle = '#efe9dc';
    ctx.fillRect(0, 0, w, h);

    const orb = (x: number, y: number, r: number, color: string) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    const span = Math.max(w, h);
    orb(
      w * (0.78 + 0.04 * Math.sin(t * 0.21)),
      h * (0.18 + 0.05 * Math.cos(t * 0.17)),
      span * 0.42,
      'rgba(255, 244, 170, 0.85)',
    );
    orb(
      w * (0.22 + 0.05 * Math.cos(t * 0.13)),
      h * (0.82 + 0.04 * Math.sin(t * 0.19)),
      span * 0.48,
      'rgba(254, 229, 0, 0.35)',
    );
    schedule(frame);
  };
  schedule(frame);
}
