import { emberFragment, emberVertex, skyFragment, skyVertex } from './scenery-shaders';

export type SceneryStatus = 'loading' | 'animated' | 'paused' | 'still' | 'unavailable';
type Pass = {
  program: WebGLProgram;
  buffer: WebGLBuffer;
  attribute: number;
  size: number;
  time: WebGLUniformLocation | null;
  viewport: WebGLUniformLocation | null;
  pointer: WebGLUniformLocation | null;
  scale: WebGLUniformLocation | null;
};

export function createScenery(
  canvas: HTMLCanvasElement,
  artwork: HTMLImageElement,
  onStatus: (status: SceneryStatus) => void
): () => void {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
    failIfMajorPerformanceCaveat: true
  });
  if (!gl) {
    onStatus('unavailable');
    return () => {};
  }

  let passes: Pass[] = [];
  let texture: WebGLTexture | null = null;
  let frame = 0;
  let resizeFrame = 0;
  let time = 0;
  let lastFrame = 0;
  let lastDraw = 0;
  let slowFrames = 0;
  let observedFrames = 0;
  let disposed = false;
  let lost = false;
  let settled = false;
  let width = 1;
  let height = 1;
  let scale = 1;
  let pointerX = 0;
  let pointerY = 0;
  let targetX = 0;
  let targetY = 0;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  let economy = false;
  let downgraded = false;

  function makePass(vertex: string, fragment: string, data: Float32Array, size: number): Pass {
    const context = gl!;
    const program = context.createProgram();
    const buffer = context.createBuffer();
    if (!program || !buffer) {
      context.deleteProgram(program);
      context.deleteBuffer(buffer);
      throw new Error('Scenery resources unavailable');
    }
    for (const [type, source] of [
      [context.VERTEX_SHADER, vertex],
      [context.FRAGMENT_SHADER, fragment]
    ] as const) {
      const shader = context.createShader(type);
      if (!shader) {
        context.deleteProgram(program);
        context.deleteBuffer(buffer);
        throw new Error('Scenery shader unavailable');
      }
      context.shaderSource(shader, source);
      context.compileShader(shader);
      context.attachShader(program, shader);
      context.deleteShader(shader);
    }
    context.bindAttribLocation(program, 0, size === 2 ? 'aPosition' : 'aSeed');
    context.linkProgram(program);
    if (!context.getProgramParameter(program, context.LINK_STATUS)) {
      context.deleteProgram(program);
      context.deleteBuffer(buffer);
      throw new Error('Scenery shader unsupported');
    }
    context.bindBuffer(context.ARRAY_BUFFER, buffer);
    context.bufferData(context.ARRAY_BUFFER, data, context.STATIC_DRAW);
    return {
      program,
      buffer,
      attribute: 0,
      size,
      time: context.getUniformLocation(program, 'uTime'),
      viewport: context.getUniformLocation(program, 'uViewport'),
      pointer: context.getUniformLocation(program, 'uPointer'),
      scale: context.getUniformLocation(program, 'uScale')
    };
  }

  function clearPasses(): void {
    for (const pass of passes) {
      gl!.deleteBuffer(pass.buffer);
      gl!.deleteProgram(pass.program);
    }
    passes = [];
    gl!.deleteTexture(texture);
    texture = null;
  }

  function initialize(): boolean {
    try {
      texture = gl!.createTexture();
      if (!texture) throw new Error('Scenery artwork unavailable');
      gl!.bindTexture(gl!.TEXTURE_2D, texture);
      gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, true);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, artwork);
      if (gl!.getError() !== gl!.NO_ERROR) throw new Error('Scenery artwork unsupported');
      passes.push(makePass(skyVertex, skyFragment, new Float32Array([-1, -1, 3, -1, -1, 3]), 2));
      const seeds = new Float32Array(96 * 4);
      let seed = 47;
      for (let i = 0; i < seeds.length; i += 1) {
        seed = (seed * 16807) % 2147483647;
        seeds[i] = seed / 2147483647;
      }
      passes.push(makePass(emberVertex, emberFragment, seeds, 4));
      gl!.enable(gl!.BLEND);
      gl!.blendFunc(gl!.ONE, gl!.ONE_MINUS_SRC_ALPHA);
      return true;
    } catch {
      clearPasses();
      onStatus('unavailable');
      return false;
    }
  }

  function resize(): void {
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    economy = downgraded || width < 1200 || navigator.hardwareConcurrency <= 4;
    const budget = economy ? 320_000 : 900_000;
    scale = Math.min(
      1,
      devicePixelRatio || 1,
      Math.sqrt(budget / (width * height)),
      2048 / width,
      2048 / height
    );
    const bufferWidth = Math.max(1, Math.floor(width * scale));
    const bufferHeight = Math.max(1, Math.floor(height * scale));
    if (canvas.width !== bufferWidth) canvas.width = bufferWidth;
    if (canvas.height !== bufferHeight) canvas.height = bufferHeight;
    gl!.viewport(0, 0, canvas.width, canvas.height);
    if (settled && !lost && passes.length === 2) draw();
  }

  function draw(): void {
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    for (const pass of passes) {
      gl!.useProgram(pass.program);
      gl!.bindBuffer(gl!.ARRAY_BUFFER, pass.buffer);
      gl!.enableVertexAttribArray(pass.attribute);
      gl!.vertexAttribPointer(pass.attribute, pass.size, gl!.FLOAT, false, 0, 0);
      gl!.uniform1f(pass.time, time);
      gl!.uniform2f(pass.viewport, width, height);
      gl!.uniform2f(pass.pointer, pointerX, pointerY);
      gl!.uniform1f(pass.scale, scale);
      gl!.drawArrays(
        pass.size === 2 ? gl!.TRIANGLES : gl!.POINTS,
        0,
        pass.size === 2 ? 3 : economy ? 40 : 96
      );
    }
  }

  function tick(now: number): void {
    frame = 0;
    if (disposed || lost || settled || document.hidden) return;
    const elapsed = lastFrame === 0 ? 16 : now - lastFrame;
    lastFrame = now;
    time += Math.min(elapsed, 80) / 1000;
    observedFrames += 1;
    if (elapsed > 48) slowFrames += 1;
    if (observedFrames >= 120) {
      if (slowFrames > 42) {
        if (economy) {
          settled = true;
          onStatus('still');
          return;
        }
        downgraded = true;
        resize();
      }
      observedFrames = 0;
      slowFrames = 0;
    }
    if (now - lastDraw >= (economy ? 1000 / 24 : 1000 / 30) - 1) {
      const smoothing = 1 - Math.exp(-(now - lastDraw) / 700);
      pointerX += (targetX - pointerX) * smoothing;
      pointerY += (targetY - pointerY) * smoothing;
      lastDraw = now;
      draw();
      onStatus('animated');
    }
    frame = requestAnimationFrame(tick);
  }

  function pause(): void {
    cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
    lastDraw = 0;
  }

  function visibility(): void {
    pause();
    if (disposed || lost || settled) return;
    if (document.hidden) onStatus('paused');
    else frame = requestAnimationFrame(tick);
  }

  function move(event: PointerEvent): void {
    if (!finePointer.matches || event.pointerType !== 'mouse') return;
    targetX = event.clientX / width - 0.5;
    targetY = 0.5 - event.clientY / height;
  }

  function resetPointer(): void {
    targetX = 0;
    targetY = 0;
  }

  function contextLost(event: Event): void {
    event.preventDefault();
    lost = true;
    pause();
    passes = [];
    texture = null;
    onStatus('unavailable');
  }

  function contextRestored(): void {
    if (disposed) return;
    lost = false;
    settled = false;
    if (!initialize()) return;
    resize();
    visibility();
  }

  if (!initialize()) {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return () => {};
  }
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      resize();
    });
  });
  resize();
  observer.observe(canvas);
  canvas.addEventListener('webglcontextlost', contextLost);
  canvas.addEventListener('webglcontextrestored', contextRestored);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('blur', resetPointer);
  document.documentElement.addEventListener('pointerleave', resetPointer);
  visibility();

  return () => {
    disposed = true;
    pause();
    cancelAnimationFrame(resizeFrame);
    observer.disconnect();
    canvas.removeEventListener('webglcontextlost', contextLost);
    canvas.removeEventListener('webglcontextrestored', contextRestored);
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('blur', resetPointer);
    document.documentElement.removeEventListener('pointerleave', resetPointer);
    clearPasses();
    if (!lost) gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
}
