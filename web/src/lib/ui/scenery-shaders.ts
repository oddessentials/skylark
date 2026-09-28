export const skyVertex = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const skyFragment = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uViewport;
uniform vec2 uPointer;
uniform float uTime;
uniform sampler2D uArtwork;
varying vec2 vUv;

const vec2 sunAt = vec2(0.749, 0.167);
const vec2 pondAt = vec2(0.8125, 0.858);
const vec2 pondSpread = vec2(0.1875, 0.0733);

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),
    mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), f.x), f.y);
}

float drift(vec2 p) {
  float value = noise(p) * 0.58;
  p = p * 2.07 + vec2(5.3, 2.9);
  value += noise(p) * 0.27;
  return value + noise(p * 2.03) * 0.15;
}

float lamp(vec2 p, vec2 centre, vec2 spread) {
  vec2 delta = (p - centre) / spread;
  return exp(-dot(delta, delta));
}

void main() {
  vec2 imageSize = vec2(1600.0, 900.0);
  float cover = max(uViewport.x / imageSize.x, uViewport.y / imageSize.y);
  vec2 visible = uViewport / (imageSize * cover);
  vec2 imageUv = vUv * visible + (1.0 - visible) * vec2(0.5, 0.45);
  vec2 scene = vec2(imageUv.x, 1.0 - imageUv.y);
  vec2 p = scene + uPointer * vec2(0.004, 0.002);
  vec3 artwork = texture2D(uArtwork, imageUv).rgb;
  float t = uTime * 0.05;
  float gutter = smoothstep(360.0, 760.0, abs(vUv.x - 0.5) * uViewport.x);
  float focus = 0.34 + gutter * 0.66;

  vec2 toSun = p - sunAt;
  float reach = length(toSun / vec2(1.0, 0.62));
  float ang = atan(toSun.y, toSun.x * 1.6);
  float flutter = noise(vec2(ang * 2.2, t * 0.7)) * 3.2;
  float shaft = 0.5 + 0.5 * sin(ang * 9.0 + flutter + uTime * 0.07);
  shaft = pow(max(shaft, 0.0), 5.0) * (0.45 + 0.55 * noise(vec2(ang * 5.0, t * 0.4)));
  float fan = smoothstep(-0.05, 0.42, toSun.y) * smoothstep(0.62, 0.1, abs(toSun.x));
  float ceiling = 1.0 - smoothstep(0.42, 0.66, p.y);
  float rays = shaft * smoothstep(0.92, 0.1, reach) * fan * ceiling * focus * 0.07;
  vec3 colour = vec3(1.0, 0.91, 0.68) * rays;
  float alpha = rays * 0.45;

  float sky = 1.0 - smoothstep(0.5, 0.68, scene.y);
  float puff = drift(p * vec2(3.1, 7.4) + vec2(t * 0.62, t * 0.05));
  float bloom = smoothstep(0.52, 0.86, puff) * sky * focus;
  colour += vec3(0.92, 0.96, 1.0) * bloom * 0.1;
  alpha += bloom * 0.1;

  float haze = drift(p * vec2(5.2, 15.0) + vec2(-t * 0.42, t * 0.12));
  float band = exp(-pow((p.y - 0.63 - haze * 0.035) * 22.0, 2.0));
  float glow = band * smoothstep(0.34, 0.8, haze) * focus * 0.14;
  colour += vec3(0.86, 0.95, 1.0) * glow;
  alpha += glow * 0.62;

  vec2 pondDelta = (p - pondAt) / pondSpread;
  float pond = 1.0 - smoothstep(0.42, 1.0, length(pondDelta));
  float swell = sin(scene.y * 300.0 + sin(scene.x * 44.0 + t * 1.6) * 2.1 + uTime * 0.7);
  vec2 waterUv = imageUv + vec2(sin(scene.y * 150.0 + uTime * 0.5) * 0.0013, swell * 0.0008) * pond;
  vec3 water = texture2D(uArtwork, waterUv).rgb;
  colour += water * pond * 0.55;
  alpha += pond * 0.55;
  float glint = pow(max(0.0, swell), 9.0) * pond * smoothstep(0.3, 0.9, haze);
  colour += vec3(1.0, 0.98, 0.9) * glint * 0.1;
  alpha += glint * 0.06;

  float fall = lamp(scene, vec2(0.917, 0.794), vec2(0.012, 0.036));
  float spill = fall * (0.6 + 0.4 * sin(uTime * 2.3 + scene.y * 90.0));
  colour += vec3(0.93, 0.98, 1.0) * spill * 0.16;
  alpha += spill * 0.12;

  float flame = 0.84 + sin(uTime * 1.5) * 0.08 + sin(uTime * 2.9 + 1.0) * 0.05 + sin(uTime * 4.3) * 0.03;
  float lights = lamp(scene, vec2(0.042, 0.736), vec2(0.021, 0.038))
    + lamp(scene, vec2(0.120, 0.719), vec2(0.017, 0.031));
  float warmth = lights * flame * focus * 0.3;
  colour += vec3(1.0, 0.62, 0.18) * warmth;
  alpha += warmth * 0.3;

  float blades = smoothstep(0.86, 0.98, p.y);
  float sway = noise(vec2(p.x * 26.0 - uTime * 0.5, p.y * 12.0 + uTime * 0.2));
  float wind = blades * smoothstep(0.55, 0.95, sway) * focus * 0.035;
  colour += vec3(0.78, 0.94, 0.55) * wind;
  alpha += wind * 0.5;

  gl_FragColor = vec4(colour, min(alpha, 0.78));
}
`;

export const emberVertex = `
precision highp float;
attribute vec4 aSeed;
uniform vec2 uViewport;
uniform vec2 uPointer;
uniform float uTime;
uniform float uScale;
varying float vOpacity;
varying float vWarm;
void main() {
  float depth = 0.3 + aSeed.z * 0.7;
  float life = fract(aSeed.y + uTime * (0.006 + aSeed.z * 0.009));
  float x = aSeed.x + sin(life * 5.0 + aSeed.w * 26.0) * 0.03 * depth;
  x += sin(uTime * 0.13 + aSeed.w * 7.0) * 0.014 * depth;
  float y = life * 1.12 - 0.06 + sin(uTime * 0.2 + aSeed.w * 12.0) * 0.012;
  vec2 position = vec2(x, y) + uPointer * 0.018 * depth;
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = (2.4 + pow(aSeed.z, 4.0) * 11.0) * uScale;
  float gutter = smoothstep(470.0, 760.0, abs(x - 0.5) * uViewport.x);
  float breath = 0.7 + 0.3 * sin(uTime * 0.7 + aSeed.w * 19.0);
  vOpacity = pow(sin(life * 3.14159), 1.4) * (0.1 + gutter * 0.46) * breath;
  vWarm = step(0.62, aSeed.w);
}
`;

export const emberFragment = `
precision mediump float;
varying float vOpacity;
varying float vWarm;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float glow = exp(-d * d * 4.6) * (1.0 - smoothstep(0.72, 1.0, d));
  vec3 colour = mix(vec3(0.83, 0.94, 0.62), vec3(1.0, 0.92, 0.66), vWarm);
  colour = mix(colour, vec3(1.0, 1.0, 0.96), exp(-d * d * 34.0));
  float alpha = glow * vOpacity;
  gl_FragColor = vec4(colour * alpha, alpha);
}
`;
