import { useEffect, useRef } from "react";
import * as THREE from "three";

const vertexShader = `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform float uTime, uAttenuation, uLineThickness;
uniform float uBaseRadius, uRadiusStep, uScaleRate;
uniform float uOpacity, uNoiseAmount, uRotation, uRingGap;
uniform float uFadeIn, uFadeOut;
uniform float uMouseInfluence, uHoverAmount, uHoverScale, uParallax, uBurst;
uniform float uCoverageAlpha;
uniform vec2 uResolution, uMouse;
uniform vec3 uColor, uColorTwo;
uniform int uRingCount;

const float HALF_PI = 1.5707963;
const float CYCLE = 3.45;

float fade(float time) {
  return time < uFadeIn
    ? smoothstep(0.0, uFadeIn, time)
    : 1.0 - smoothstep(uFadeOut, CYCLE - 0.2, time);
}

float ring(vec2 point, float radiusIndex, float cut, float timeOffset, float pixel) {
  float time = mod(uTime + timeOffset, CYCLE);
  float radius = radiusIndex + time / CYCLE * uScaleRate;
  float distanceToRing = abs(length(point) - radius);
  float angle = atan(abs(point.y), abs(point.x)) / HALF_PI;
  float thickness = max(1.0 - angle, 0.5) * pixel * uLineThickness;
  float highlight = (1.0 - smoothstep(thickness, thickness * 1.5, distanceToRing)) + 1.0;
  distanceToRing += pow(cut * angle, 3.0) * radius;
  return highlight * exp(-uAttenuation * distanceToRing) * fade(time);
}

void main() {
  float pixel = 1.0 / min(uResolution.x, uResolution.y);
  vec2 point = (gl_FragCoord.xy - 0.5 * uResolution.xy) * pixel;
  float cosine = cos(uRotation);
  float sine = sin(uRotation);
  point = mat2(cosine, -sine, sine, cosine) * point;
  point -= uMouse * uMouseInfluence;

  float scale = mix(1.0, uHoverScale, uHoverAmount) + uBurst * 0.3;
  point /= scale;

  vec3 color = vec3(0.0);
  float coverage = 0.0;
  float ringCountFactor = max(float(uRingCount) - 1.0, 1.0);

  for (int index = 0; index < 10; index++) {
    if (index >= uRingCount) break;
    float ringIndex = float(index);
    vec2 ringPoint = point - ringIndex * uParallax * uMouse;
    vec3 ringColor = mix(uColor, uColorTwo, ringIndex / ringCountFactor);
    float ringAmount = ring(
      ringPoint,
      uBaseRadius + ringIndex * uRadiusStep,
      pow(uRingGap, ringIndex),
      index == 0 ? 0.0 : 2.95 * ringIndex,
      pixel
    );
    color = mix(color, ringColor, vec3(ringAmount));
    coverage = max(coverage, ringAmount);
  }

  color *= 1.0 + uBurst * 2.0;
  float noise = fract(sin(dot(gl_FragCoord.xy + uTime * 100.0, vec2(12.9898, 78.233))) * 43758.5453);
  color += (noise - 0.5) * uNoiseAmount;

  float intensity = max(color.r, max(color.g, color.b));
  vec3 emissiveColor = intensity > 0.0001 ? clamp(color / intensity, 0.0, 1.0) : vec3(0.0);
  vec3 outputColor = mix(emissiveColor, clamp(color, 0.0, 1.0), uCoverageAlpha);
  float outputAlpha = mix(intensity, coverage, uCoverageAlpha);
  gl_FragColor = vec4(outputColor, clamp(outputAlpha * uOpacity, 0.0, 1.0));
}
`;

export default function MagicRings({
  color = "#fc42ff",
  colorTwo = "#42fcff",
  speed = 1,
  ringCount = 6,
  attenuation = 10,
  lineThickness = 2,
  maxRenderDuration = 0,
  baseRadius = 0.35,
  radiusStep = 0.1,
  scaleRate = 0.1,
  opacity = 1,
  blur = 0,
  noiseAmount = 0.1,
  rotation = 0,
  ringGap = 1.5,
  fadeIn = 0.7,
  fadeOut = 0.5,
  followMouse = false,
  mouseInfluence = 0.2,
  hoverScale = 1.2,
  parallax = 0.05,
  clickBurst = false,
  alphaMode = "luminance",
}) {
  const mountRef = useRef(null);
  const propsRef = useRef({
    alphaMode,
    attenuation,
    baseRadius,
    clickBurst,
    color,
    colorTwo,
    fadeIn,
    fadeOut,
    followMouse,
    hoverScale,
    lineThickness,
    maxRenderDuration,
    mouseInfluence,
    noiseAmount,
    opacity,
    parallax,
    radiusStep,
    ringCount,
    ringGap,
    rotation,
    scaleRate,
    speed,
  });
  const mouseRef = useRef([0, 0]);
  const smoothMouseRef = useRef([0, 0]);
  const hoverAmountRef = useRef(0);
  const isHoveredRef = useRef(false);
  const burstRef = useRef(0);

  useEffect(() => {
    propsRef.current = {
      alphaMode,
      attenuation,
      baseRadius,
      clickBurst,
      color,
      colorTwo,
      fadeIn,
      fadeOut,
      followMouse,
      hoverScale,
      lineThickness,
      maxRenderDuration,
      mouseInfluence,
      noiseAmount,
      opacity,
      parallax,
      radiusStep,
      ringCount,
      ringGap,
      rotation,
      scaleRate,
      speed,
    };
  }, [
    alphaMode,
    attenuation,
    baseRadius,
    clickBurst,
    color,
    colorTwo,
    fadeIn,
    fadeOut,
    followMouse,
    hoverScale,
    lineThickness,
    maxRenderDuration,
    mouseInfluence,
    noiseAmount,
    opacity,
    parallax,
    radiusStep,
    ringCount,
    ringGap,
    rotation,
    scaleRate,
    speed,
  ]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    mount.classList.remove("is-rendering");

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
    } catch {
      return undefined;
    }

    if (!renderer.capabilities.isWebGL2) {
      renderer.dispose();
      return undefined;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.style.display = "block";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.width = "100%";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
    camera.position.z = 1;

    const uniforms = {
      uTime: { value: 0 },
      uAttenuation: { value: 0 },
      uResolution: { value: new THREE.Vector2() },
      uColor: { value: new THREE.Color() },
      uColorTwo: { value: new THREE.Color() },
      uLineThickness: { value: 0 },
      uBaseRadius: { value: 0 },
      uRadiusStep: { value: 0 },
      uScaleRate: { value: 0 },
      uRingCount: { value: 0 },
      uOpacity: { value: 1 },
      uNoiseAmount: { value: 0 },
      uRotation: { value: 0 },
      uRingGap: { value: 1.6 },
      uFadeIn: { value: 0.5 },
      uFadeOut: { value: 0.75 },
      uMouse: { value: new THREE.Vector2() },
      uMouseInfluence: { value: 0 },
      uHoverAmount: { value: 0 },
      uHoverScale: { value: 1 },
      uParallax: { value: 0 },
      uBurst: { value: 0 },
      uCoverageAlpha: { value: 0 },
    };

    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.ShaderMaterial({
      fragmentShader,
      transparent: true,
      uniforms,
      vertexShader,
    });
    const quad = new THREE.Mesh(geometry, material);
    scene.add(quad);

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (width <= 0 || height <= 0) return;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
    };
    resize();
    window.addEventListener("resize", resize);

    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(resize);
    resizeObserver?.observe(mount);

    const onMouseMove = (event) => {
      const rect = mount.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      mouseRef.current[0] = (event.clientX - rect.left) / rect.width - 0.5;
      mouseRef.current[1] = -((event.clientY - rect.top) / rect.height - 0.5);
    };
    const onMouseEnter = () => {
      isHoveredRef.current = true;
    };
    const onMouseLeave = () => {
      isHoveredRef.current = false;
      mouseRef.current[0] = 0;
      mouseRef.current[1] = 0;
    };
    const onClick = () => {
      burstRef.current = 1;
    };

    mount.addEventListener("mousemove", onMouseMove);
    mount.addEventListener("mouseenter", onMouseEnter);
    mount.addEventListener("mouseleave", onMouseLeave);
    mount.addEventListener("click", onClick);

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    let frameId = 0;
    let renderTimeoutId = 0;
    let renderExpired = false;
    let isVisible = typeof IntersectionObserver === "undefined";
    let isPageVisible = !document.hidden;
    let elapsed = reducedMotion ? 0.72 : 0;
    let lastTime = 0;

    const renderFrame = () => {
      const current = propsRef.current;
      smoothMouseRef.current[0] += (mouseRef.current[0] - smoothMouseRef.current[0]) * 0.08;
      smoothMouseRef.current[1] += (mouseRef.current[1] - smoothMouseRef.current[1]) * 0.08;
      hoverAmountRef.current += ((isHoveredRef.current ? 1 : 0) - hoverAmountRef.current) * 0.08;
      burstRef.current *= 0.95;
      if (burstRef.current < 0.001) burstRef.current = 0;

      uniforms.uTime.value = elapsed;
      uniforms.uAttenuation.value = current.attenuation;
      uniforms.uColor.value.set(current.color);
      uniforms.uColorTwo.value.set(current.colorTwo);
      uniforms.uLineThickness.value = current.lineThickness;
      uniforms.uBaseRadius.value = current.baseRadius;
      uniforms.uRadiusStep.value = current.radiusStep;
      uniforms.uScaleRate.value = current.scaleRate;
      uniforms.uRingCount.value = Math.min(10, Math.max(1, Math.round(current.ringCount)));
      uniforms.uOpacity.value = current.opacity;
      uniforms.uNoiseAmount.value = current.noiseAmount;
      uniforms.uRotation.value = (current.rotation * Math.PI) / 180;
      uniforms.uRingGap.value = current.ringGap;
      uniforms.uFadeIn.value = current.fadeIn;
      uniforms.uFadeOut.value = current.fadeOut;
      uniforms.uMouse.value.set(smoothMouseRef.current[0], smoothMouseRef.current[1]);
      uniforms.uMouseInfluence.value = current.followMouse ? current.mouseInfluence : 0;
      uniforms.uHoverAmount.value = hoverAmountRef.current;
      uniforms.uHoverScale.value = current.hoverScale;
      uniforms.uParallax.value = current.parallax;
      uniforms.uBurst.value = current.clickBurst ? burstRef.current : 0;
      uniforms.uCoverageAlpha.value = current.alphaMode === "coverage" ? 1 : 0;

      renderer.render(scene, camera);
    };

    const animate = (time) => {
      const delta = lastTime === 0 ? 0 : Math.min(time - lastTime, 100);
      lastTime = time;
      elapsed += delta * 0.001 * propsRef.current.speed;
      renderFrame();
      frameId = window.requestAnimationFrame(animate);
    };

    const tryStart = () => {
      if (reducedMotion || renderExpired || !isVisible || !isPageVisible || frameId !== 0) return;
      lastTime = 0;
      frameId = window.requestAnimationFrame(animate);
    };
    const tryStop = () => {
      if (frameId === 0) return;
      window.cancelAnimationFrame(frameId);
      frameId = 0;
    };

    const intersectionObserver = typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(([entry]) => {
        isVisible = entry.isIntersecting;
        if (isVisible) tryStart();
        else tryStop();
      });
    intersectionObserver?.observe(mount);

    const onVisibilityChange = () => {
      isPageVisible = !document.hidden;
      if (isPageVisible) tryStart();
      else tryStop();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    renderFrame();
    mount.classList.add("is-rendering");

    if (!reducedMotion) {
      tryStart();
      const duration = Number(propsRef.current.maxRenderDuration);
      if (Number.isFinite(duration) && duration > 0) {
        renderTimeoutId = window.setTimeout(() => {
          renderExpired = true;
          tryStop();
        }, duration);
      }
    }

    return () => {
      tryStop();
      if (renderTimeoutId) window.clearTimeout(renderTimeoutId);
      intersectionObserver?.disconnect();
      resizeObserver?.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("resize", resize);
      mount.removeEventListener("mousemove", onMouseMove);
      mount.removeEventListener("mouseenter", onMouseEnter);
      mount.removeEventListener("mouseleave", onMouseLeave);
      mount.removeEventListener("click", onClick);
      scene.remove(quad);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      mount.classList.remove("is-rendering");
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      className="magic-rings"
      ref={mountRef}
      style={blur > 0 ? { filter: `blur(${blur}px)` } : undefined}
    >
      <span className="entry-splash-rings-fallback" />
    </div>
  );
}
