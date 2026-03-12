import { useRef, useCallback, useState, useEffect } from "react";
import { useAS120 } from "@/hooks/useAS120";
import type { MotorStatus } from "@/transport/types";

export interface TrayConfig {
  x: number;           // back-left corner X, inches
  y: number;           // back edge Y, inches
  width: number;       // X extent, inches
  depth: number;       // Y extent, inches
  height: number;      // Z extent, inches
  radius: number;      // corner fillet radius, inches
  rows: number;        // grid rows (Y direction)
  cols: number;        // grid columns (X direction)
  rowPitch: number;    // row center-to-center spacing, inches
  colPitch: number;    // column center-to-center spacing, inches
  slotDiameter: number; // vial bore diameter, inches
  z?: number;          // bottom face Z, inches (default 0)
  color?: string;      // body color (default "#e8e8e8")
}

interface Props {
  motors: MotorStatus[];
  fullscreen?: boolean;
  trays?: TrayConfig[];
  onTrayClick?: (index: number) => void;
}

function useSmoothValue(target: number, smoothing = 0.15): number {
  const current = useRef(target);
  const [value, setValue] = useState(target);
  const rafId = useRef(0);

  const animate = useCallback(() => {
    const diff = target - current.current;
    if (Math.abs(diff) < 0.5) {
      current.current = target;
      setValue(target);
      return;
    }
    current.current += diff * smoothing;
    setValue(current.current);
    rafId.current = requestAnimationFrame(animate);
  }, [target, smoothing]);

  useEffect(() => {
    rafId.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId.current);
  }, [animate]);

  return value;
}

// 1 inch = 10 world units
const INCH = 10;

// Isometric projection (30° dimetric)
// World: +X = right, +Y = into screen (depth), +Z = up
const A = Math.PI / 6;
const CA = Math.cos(A);
const SA = Math.sin(A);
function iso(x: number, y: number, z: number): [number, number] {
  return [(x - y) * CA, (x + y) * SA - z];
}

// Inverse isometric: screen coords + known z → world (x, y)
function isoInverse(sx: number, sy: number, z: number): [number, number] {
  const xMinusY = sx / CA;
  const xPlusY = (sy + z) / SA;
  return [(xMinusY + xPlusY) / 2, (xPlusY - xMinusY) / 2];
}

// Base physical travel per axis in full steps. Multiply by 2^(step_size-1) for microstepped range.
const FULL_STEP_RANGE: Record<string, number> = { LR: 2250, FB: 500, UD: 500, PL: 500 };
function axisRange(name: string, stepSize: number): number {
  return (FULL_STEP_RANGE[name] ?? 500) * (1 << (stepSize - 1));
}

function darken(hex: string, f: number): string {
  return `rgb(${(parseInt(hex.slice(1, 3), 16) * f) | 0},${(parseInt(hex.slice(3, 5), 16) * f) | 0},${(parseInt(hex.slice(5, 7), 16) * f) | 0})`;
}

function pts(coords: [number, number][]): string {
  return coords.map((c) => c.join(",")).join(" ");
}

function pathD(coords: [number, number][]): string {
  return coords.map((c, i) => `${i === 0 ? "M" : "L"}${c[0]},${c[1]}`).join(" ") + " Z";
}

function Foot({ x, y, z, w, d, h, fill, stroke = "#555", sw = 0.8 }: {
  x: number; y: number; z: number; w: number; d: number; h: number;
  fill: string; stroke?: string; sw?: number;
}) {
  // Half-cylinders on front/back ends (pill shape viewed from above)
  // Cylinder axis = Z (vertical), radius = w/2
  const r = w / 2;
  const N = 10;
  const cx = x + r;       // center X for both caps
  const fcY = y + d - r;  // front cap center Y
  const bcY = y + r;      // back cap center Y

  // Front arc point: θ=0 is right side, θ=π is left side
  const frontArc = (i: number) => {
    const θ = (Math.PI * i) / N;
    return { x: cx + r * Math.cos(θ), y: fcY + r * Math.sin(θ) };
  };

  // Top face: stadium outline at z+h
  const topPts: [number, number][] = [];
  topPts.push(iso(x + w, bcY, z + h));
  topPts.push(iso(x + w, fcY, z + h));
  for (let i = 1; i < N; i++) { const p = frontArc(i); topPts.push(iso(p.x, p.y, z + h)); }
  topPts.push(iso(x, fcY, z + h));
  topPts.push(iso(x, bcY, z + h));
  for (let i = 1; i < N; i++) {
    const θ = (Math.PI * i) / N;
    topPts.push(iso(cx - r * Math.cos(θ), bcY - r * Math.sin(θ), z + h));
  }

  // Front curved surface: vertical strips from θ=0 to θ=π
  const frontStrips = Array.from({ length: N }, (_, i) => {
    const p = frontArc(i);
    const q = frontArc(i + 1);
    const midθ = (Math.PI * (i + 0.5)) / N;
    // θ=0 (right-facing) ≈ 0.78, θ=π/2 (front-facing) ≈ 0.62
    const shade = 0.78 - 0.16 * Math.sin(midθ);
    return (
      <polygon key={`fc${i}`}
        points={pts([iso(p.x, p.y, z + h), iso(q.x, q.y, z + h), iso(q.x, q.y, z), iso(p.x, p.y, z)])}
        fill={darken(fill, shade)} stroke="none" />
    );
  });

  // Right face: flat rectangle (straight portion only)
  const rightPts: [number, number][] = [
    iso(x + w, bcY, z + h), iso(x + w, fcY, z + h),
    iso(x + w, fcY, z), iso(x + w, bcY, z),
  ];

  return (
    <g>
      {/* Top face (stadium) */}
      <polygon points={pts(topPts)}
        fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
      {/* Front curved surface */}
      {frontStrips}
      {/* Right face (straight portion) */}
      <polygon points={pts(rightPts)}
        fill={darken(fill, 0.78)} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
    </g>
  );
}

function Box({ x, y, z, w, d, h, fill, stroke = "#555", sw = 0.8 }: {
  x: number; y: number; z: number; w: number; d: number; h: number;
  fill: string; stroke?: string; sw?: number;
}) {
  return (
    <g>
      {/* Top face */}
      <polygon points={pts([iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)])}
        fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
      {/* Right face */}
      <polygon points={pts([iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x + w, y, z)])}
        fill={darken(fill, 0.78)} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
      {/* Front face */}
      <polygon points={pts([iso(x, y + d, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x, y + d, z)])}
        fill={darken(fill, 0.62)} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
    </g>
  );
}

const CORNER_SEGS = 8;
const SLOT_SEGS = 16;

function Tray({ config }: { config: TrayConfig }) {
  const color = config.color ?? "#e8e8e8";
  const sk = "#aaa";
  const sw = 0.5;
  const x = config.x * INCH, y = config.y * INCH, bz = (config.z ?? 0) * INCH;
  const w = config.width * INCH, d = config.depth * INCH, h = config.height * INCH;
  const zt = bz + h; // top z
  const r = config.radius * INCH;
  const rp = config.rowPitch * INCH, cp = config.colPitch * INCH;
  const sr = (config.slotDiameter / 2) * INCH;

  // Slot grid centers (centered in tray)
  const gridW = (config.cols - 1) * cp;
  const gridD = (config.rows - 1) * rp;
  const gx0 = x + (w - gridW) / 2;
  const gy0 = y + (d - gridD) / 2;
  const slots: { cx: number; cy: number }[] = [];
  for (let row = 0; row < config.rows; row++)
    for (let col = 0; col < config.cols; col++)
      slots.push({ cx: gx0 + col * cp, cy: gy0 + row * rp });

  // Rounded rectangle outline at given z
  function rrPts(z: number): [number, number][] {
    const p: [number, number][] = [];
    const N = CORNER_SEGS;
    // Back-left corner: center (x+r, y+r), angles π → 3π/2
    for (let i = 0; i <= N; i++) {
      const θ = Math.PI + (Math.PI / 2) * (i / N);
      p.push(iso(x + r + r * Math.cos(θ), y + r + r * Math.sin(θ), z));
    }
    p.push(iso(x + w - r, y, z));
    // Back-right corner: center (x+w-r, y+r), angles -π/2 → 0
    for (let i = 1; i <= N; i++) {
      const θ = -Math.PI / 2 + (Math.PI / 2) * (i / N);
      p.push(iso(x + w - r + r * Math.cos(θ), y + r + r * Math.sin(θ), z));
    }
    p.push(iso(x + w, y + d - r, z));
    // Front-right corner: center (x+w-r, y+d-r), angles 0 → π/2
    for (let i = 1; i <= N; i++) {
      const θ = (Math.PI / 2) * (i / N);
      p.push(iso(x + w - r + r * Math.cos(θ), y + d - r + r * Math.sin(θ), z));
    }
    p.push(iso(x + r, y + d, z));
    // Front-left corner: center (x+r, y+d-r), angles π/2 → π
    for (let i = 1; i <= N; i++) {
      const θ = Math.PI / 2 + (Math.PI / 2) * (i / N);
      p.push(iso(x + r + r * Math.cos(θ), y + d - r + r * Math.sin(θ), z));
    }
    p.push(iso(x, y + r, z));
    return p;
  }

  function ptsPath(points: [number, number][]): string {
    return points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ") + " Z";
  }

  function slotEllipse(cx: number, cy: number, z: number): [number, number][] {
    return Array.from({ length: SLOT_SEGS }, (_, i) => {
      const θ = (2 * Math.PI * i) / SLOT_SEGS;
      return iso(cx + sr * Math.cos(θ), cy + sr * Math.sin(θ), z);
    });
  }

  // Quarter-cylinder corner strips
  function cornerStrips(
    cx: number, cy: number,
    startθ: number, endθ: number,
    shadeFn: (θ: number) => number,
  ) {
    const N = CORNER_SEGS;
    return Array.from({ length: N }, (_, i) => {
      const θ1 = startθ + ((endθ - startθ) * i) / N;
      const θ2 = startθ + ((endθ - startθ) * (i + 1)) / N;
      const x1 = cx + r * Math.cos(θ1), y1 = cy + r * Math.sin(θ1);
      const x2 = cx + r * Math.cos(θ2), y2 = cy + r * Math.sin(θ2);
      const shade = shadeFn((θ1 + θ2) / 2);
      return (
        <polygon key={`${cx}_${cy}_${i}`}
          points={pts([iso(x1, y1, zt), iso(x2, y2, zt), iso(x2, y2, bz), iso(x1, y1, bz)])}
          fill={darken(color, shade)} stroke="none" />
      );
    });
  }

  // Top face path with slot cutouts (evenodd)
  const topPath = ptsPath(rrPts(zt)) + " " +
    slots.map(s => ptsPath(slotEllipse(s.cx, s.cy, zt))).join(" ");

  return (
    <g>
      {/* Back-right corner: -π/2 → 0 (back→right) */}
      {cornerStrips(x + w - r, y + r, -Math.PI / 2, 0,
        θ => 0.62 + 0.16 * Math.cos(θ))}
      {/* Right face (flat portion) */}
      <polygon points={pts([iso(x + w, y + r, zt), iso(x + w, y + d - r, zt),
        iso(x + w, y + d - r, bz), iso(x + w, y + r, bz)])}
        fill={darken(color, 0.78)} stroke={sk} strokeWidth={sw} strokeLinejoin="round" />
      {/* Front-right corner: 0 → π/2 (right→front) */}
      {cornerStrips(x + w - r, y + d - r, 0, Math.PI / 2,
        θ => 0.78 - 0.16 * Math.sin(θ))}
      {/* Front-left corner: π/2 → π (front→left) */}
      {cornerStrips(x + r, y + d - r, Math.PI / 2, Math.PI,
        θ => 0.62 - 0.16 * Math.sin(θ - Math.PI / 2))}
      {/* Front face (flat portion) */}
      <polygon points={pts([iso(x + r, y + d, zt), iso(x + w - r, y + d, zt),
        iso(x + w - r, y + d, bz), iso(x + r, y + d, bz)])}
        fill={darken(color, 0.62)} stroke={sk} strokeWidth={sw} strokeLinejoin="round" />
      {/* Slot interiors (dark bores) */}
      {slots.map((s, i) => (
        <polygon key={`s${i}`} points={pts(slotEllipse(s.cx, s.cy, zt))}
          fill="#1a1a1a" stroke="#333" strokeWidth={0.3} />
      ))}
      {/* Top face with slot cutouts */}
      <path d={topPath} fillRule="evenodd"
        fill={color} stroke={sk} strokeWidth={sw} strokeLinejoin="round" />
    </g>
  );
}

function Arm({ x, w, thick, startY, startZ, endY, endZ }: {
  x: number; w: number; thick: number;
  startY: number; startZ: number; endY: number; endZ: number;
}) {
  const N = 16;
  const span = Math.hypot(endY - startY, endZ - startZ);
  const sag = span * 0.25;
  const fill = "#e8e8e8";
  const cy = (t: number) => startY + (endY - startY) * t;
  const cz = (t: number) => startZ + (endZ - startZ) * t - sag * Math.sin(Math.PI * t);

  const topL: [number, number][] = [];
  const topR: [number, number][] = [];
  const sideT: [number, number][] = [];
  const sideB: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const py = cy(t), pz = cz(t);
    topL.push(iso(x, py, pz + thick));
    topR.push(iso(x + w, py, pz + thick));
    sideT.push(iso(x + w, py, pz + thick));
    sideB.push(iso(x + w, py, pz));
  }

  return (
    <g>
      <polygon points={pts([...topL, ...[...topR].reverse()])}
        fill={fill} stroke="#777" strokeWidth={0.3} strokeLinejoin="round" />
      <polygon points={pts([...sideT, ...[...sideB].reverse()])}
        fill={darken(fill, 0.78)} stroke="#777" strokeWidth={0.3} strokeLinejoin="round" />
    </g>
  );
}

export function AutosamplerView({ motors, fullscreen, trays = [], onTrayClick }: Props) {
  const lr = motors.find((m) => m.name === "LR");
  const fb = motors.find((m) => m.name === "FB");
  const ud = motors.find((m) => m.name === "UD");
  const syringe = motors.find((m) => m.name === "PL");

  // Dynamic ranges based on current microstepping
  const lrRange = axisRange("LR", lr?.step_size ?? 3);
  const fbRange = axisRange("FB", fb?.step_size ?? 3);
  const udRange = axisRange("UD", ud?.step_size ?? 3);
  const plRange = axisRange("PL", syringe?.step_size ?? 3);

  const lrPos = useSmoothValue(Math.max(0, Math.min(lrRange, lr?.position ?? 0)));
  const fbPos = useSmoothValue(Math.max(0, Math.min(fbRange, fb?.position ?? 0)));
  const udPos = useSmoothValue(Math.max(0, Math.min(udRange, ud?.position ?? 0)));
  const syringePos = useSmoothValue(Math.max(0, Math.min(plRange, syringe?.position ?? 0)));

  // Drag-to-move state
  const { moveMotor, status } = useAS120();
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const dragStart = useRef<{ lr: number; fb: number; motorLR: number; motorFB: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ lr: number; fb: number } | null>(null);
  const lastSend = useRef(0);

  // Vertical slider drag state
  const draggingSlider = useRef<"ud" | "pl" | null>(null);
  const [sliderDrag, setSliderDrag] = useState<{ axis: "ud" | "pl"; target: number } | null>(null);

  // Slider layout constants (in SVG viewBox coords)
  const sliderTY = -210, sliderBY = 50;
  const sliderTH = sliderBY - sliderTY;
  const udSliderX = -190, plSliderX = 180;

  // Base: 21" wide, 6" deep, 4" high
  const baseW = 21 * INCH;
  const baseD = 6 * INCH;
  const baseH = 4 * INCH;

  // Legs: 0.5" wide, 1.75" deep, 9" tall
  const legW = 0.5 * INCH;
  const legD = 1.75 * INCH;
  const legH = 9 * INCH;

  // Feet: 2" wide, 20" deep, 0.5" tall (centered under each leg)
  const footW = 2 * INCH;
  const footD = 20 * INCH;
  const footH = 0.5 * INCH;

  // Center the base in the viewport, raised by foot + leg height
  const baseX = -baseW / 2;
  const baseY = -baseD / 2;
  const baseZ = footH + legH;

  // Head: 2.5" wide, 10.5" deep, 4.5" tall
  const headW = 2.5 * INCH;
  const headD = 10.5 * INCH;
  const headH = 4.5 * INCH;
  // LR=0: right edge of head = right edge of base
  // LR=2000: left edge of head = left edge of base
  // Travel = baseW - headW
  const headTravel = baseW - headW;
  const fbTravel = 4.25 * INCH;
  const headZ = baseZ + baseH;

  // Real head always tracks smoothed motor position
  const headX = baseX + headTravel - (lrPos / lrRange) * headTravel;
  const headY = baseY + (fbPos / fbRange) * fbTravel;

  // Needle collision detection: check if needle tip is at or below any surface
  const needleTipZ = headZ - (udPos / udRange) * (7.75 * INCH) + 0.5 * INCH - 0.75 * INCH;
  const needlePosX = headX + headW / 2;
  const needlePosY = headY + headD - 1.75 * INCH;
  const needleCollision = (() => {
    let surfZ = 0;
    for (const t of trays) {
      const tx = t.x * INCH, tw = t.width * INCH;
      const ty = t.y * INCH, td = t.depth * INCH;
      const tz = ((t.z ?? 0) + t.height) * INCH;
      if (needlePosX >= tx && needlePosX <= tx + tw && needlePosY >= ty && needlePosY <= ty + td)
        surfZ = Math.max(surfZ, tz);
    }
    const legYC = baseY + (baseD - legD) / 2;
    const llx = baseX + 5 * INCH, rlx = baseX + baseW - 5 * INCH - legW;
    for (const lx of [llx, rlx])
      if (needlePosX >= lx && needlePosX <= lx + legW && needlePosY >= legYC && needlePosY <= legYC + legD)
        surfZ = Math.max(surfZ, footH + legH);
    const lfx = llx + legW / 2 - footW / 2, rfx = rlx + legW / 2 - footW / 2;
    const fyc = legYC + legD / 2 - footD / 2;
    for (const fx of [lfx, rfx])
      if (needlePosX >= fx && needlePosX <= fx + footW && needlePosY >= fyc && needlePosY <= fyc + footD)
        surfZ = Math.max(surfZ, footH);
    return needleTipZ <= surfZ;
  })();

  // Ghost: drag target during drag, final queue target otherwise
  const queue = status?.queue ?? [];
  function finalQueueTarget(motorIdx: number, currentPos: number): number {
    let pos = currentPos;
    for (const a of queue) {
      if (a.motor_idx !== motorIdx) continue;
      if (a.type === "absolute") pos = a.target;
      else if (a.type === "increment") pos += a.target;
      else pos -= a.target;
    }
    return pos;
  }
  const ghostLR = dragPos !== null ? dragPos.lr : finalQueueTarget(lr?.index ?? -1, lr?.position ?? 0);
  const ghostFB = dragPos !== null ? dragPos.fb : finalQueueTarget(fb?.index ?? -1, fb?.position ?? 0);
  const ghostX = baseX + headTravel - (ghostLR / lrRange) * headTravel;
  const ghostY = baseY + (ghostFB / fbRange) * fbTravel;
  const showGhost = Math.abs(ghostLR - lrPos) > 5 || Math.abs(ghostFB - fbPos) > 5;

  // Convert client pointer position → unclamped step values (for delta computation)
  function clientToRawSteps(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const svgPt = pt.matrixTransform(ctm.inverse());
    const [wx, wy] = isoInverse(svgPt.x, svgPt.y, headZ + headH / 2);
    return {
      lr: ((baseX + headTravel - wx) / headTravel) * lrRange,
      fb: ((wy - baseY) / fbTravel) * fbRange,
    };
  }

  // Convert client Y → SVG Y → step value for a slider
  function clientToSliderSteps(clientX: number, clientY: number, range: number): number | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const svgY = pt.matrixTransform(ctm.inverse()).y;
    return Math.round(Math.max(0, Math.min(range, ((svgY - sliderTY) / sliderTH) * range)));
  }

  function handleSliderDown(axis: "ud" | "pl", e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    draggingSlider.current = axis;
    const range = axis === "ud" ? udRange : plRange;
    const steps = clientToSliderSteps(e.clientX, e.clientY, range);
    if (steps != null) {
      setSliderDrag({ axis, target: steps });
      const motor = axis === "ud" ? ud : syringe;
      if (motor) moveMotor(motor.index, steps, true);
      lastSend.current = Date.now();
    }
  }

  function handlePointerDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragging.current = true;
    const raw = clientToRawSteps(e.clientX, e.clientY);
    if (raw) {
      dragStart.current = {
        lr: raw.lr,
        fb: raw.fb,
        motorLR: lr?.position ?? 0,
        motorFB: fb?.position ?? 0,
      };
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (draggingSlider.current) {
      const axis = draggingSlider.current;
      const range = axis === "ud" ? udRange : plRange;
      const steps = clientToSliderSteps(e.clientX, e.clientY, range);
      if (steps != null) {
        setSliderDrag({ axis, target: steps });
        const now = Date.now();
        if (now - lastSend.current >= 100) {
          lastSend.current = now;
          const motor = axis === "ud" ? ud : syringe;
          if (motor) moveMotor(motor.index, steps, true);
        }
      }
      return;
    }
    if (!dragging.current || !dragStart.current) return;
    const raw = clientToRawSteps(e.clientX, e.clientY);
    if (!raw) return;
    const newLR = Math.round(Math.max(0, Math.min(lrRange, dragStart.current.motorLR + (raw.lr - dragStart.current.lr))));
    const newFB = Math.round(Math.max(0, Math.min(fbRange, dragStart.current.motorFB + (raw.fb - dragStart.current.fb))));
    setDragPos({ lr: newLR, fb: newFB });
    const now = Date.now();
    if (now - lastSend.current >= 100) {
      lastSend.current = now;
      if (lr) moveMotor(lr.index, newLR, true);
      if (fb) moveMotor(fb.index, newFB, true);
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (draggingSlider.current) {
      const axis = draggingSlider.current;
      const range = axis === "ud" ? udRange : plRange;
      const steps = clientToSliderSteps(e.clientX, e.clientY, range);
      if (steps != null) {
        const motor = axis === "ud" ? ud : syringe;
        if (motor) moveMotor(motor.index, steps, true);
      }
      draggingSlider.current = null;
      setSliderDrag(null);
      return;
    }
    if (!dragging.current) return;
    dragging.current = false;
    if (dragStart.current) {
      const raw = clientToRawSteps(e.clientX, e.clientY);
      if (raw) {
        const newLR = Math.round(Math.max(0, Math.min(lrRange, dragStart.current.motorLR + (raw.lr - dragStart.current.lr))));
        const newFB = Math.round(Math.max(0, Math.min(fbRange, dragStart.current.motorFB + (raw.fb - dragStart.current.fb))));
        if (lr) moveMotor(lr.index, newLR, true);
        if (fb) moveMotor(fb.index, newFB, true);
      }
    }
    dragStart.current = null;
    setDragPos(null);
  }

  return (
    <svg ref={svgRef} viewBox="-210 -260 410 340" className={fullscreen ? "h-full w-full" : "w-full"}
      style={{ maxHeight: fullscreen ? undefined : "400px", touchAction: "none", WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" } as React.CSSProperties}
      onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
      {/* Feet and legs (drawn first, behind base) */}
      {(() => {
        const fill = "#b5bcc3";
        const legYCenter = baseY + (baseD - legD) / 2;
        const leftLegX = baseX + 5 * INCH;
        const rightLegX = baseX + baseW - 5 * INCH - legW;
        // Feet centered under each leg in both X and Y
        const leftFootX = leftLegX + legW / 2 - footW / 2;
        const rightFootX = rightLegX + legW / 2 - footW / 2;
        const footYCenter = legYCenter + legD / 2 - footD / 2;
        return (
          <>
            <Foot x={leftFootX} y={footYCenter} z={0} w={footW} d={footD} h={footH}
              fill={fill} stroke="none" />
            <Box x={leftLegX} y={legYCenter} z={footH} w={legW} d={legD} h={legH}
              fill={fill} stroke="none" />
            <Foot x={rightFootX} y={footYCenter} z={0} w={footW} d={footD} h={footH}
              fill={fill} stroke="none" />
            <Box x={rightLegX} y={legYCenter} z={footH} w={legW} d={legD} h={legH}
              fill={fill} stroke="none" />
          </>
        );
      })()}

      {/* Base with notch cut from back-top: 3" deep, 1.5" tall */}
      {(() => {
        const fill = "#b5bcc3";
        const notchD = 3 * INCH; // depth of notch from back edge
        const notchH = 1.5 * INCH; // height of notch from top
        const stepZ = baseZ + baseH - notchH; // floor of the notch
        const stepY = baseY + notchD; // where the step wall is
        const x = baseX, y = baseY, z = baseZ, w = baseW, d = baseD, h = baseH;
        return (
          <g>
            {/* Back top face (notch floor — slightly darker since recessed) */}
            <polygon points={pts([iso(x, y, stepZ), iso(x + w, y, stepZ), iso(x + w, stepY, stepZ), iso(x, stepY, stepZ)])}
              fill={darken(fill, 0.9)} />
            {/* Inner step wall (vertical face at stepY, facing back) */}
            <polygon points={pts([iso(x, stepY, z + h), iso(x + w, stepY, z + h), iso(x + w, stepY, stepZ), iso(x, stepY, stepZ)])}
              fill={darken(fill, 0.7)} />
            {/* Front top face */}
            <polygon points={pts([iso(x, stepY, z + h), iso(x + w, stepY, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)])}
              fill={fill} />
            {/* Right face (L-shaped) */}
            <polygon points={pts([
              iso(x + w, y, stepZ),
              iso(x + w, stepY, stepZ),
              iso(x + w, stepY, z + h),
              iso(x + w, y + d, z + h),
              iso(x + w, y + d, z),
              iso(x + w, y, z),
            ])}
              fill="#266eba" />
            {/* Front face */}
            <polygon points={pts([iso(x, y + d, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x, y + d, z)])}
              fill={darken(fill, 0.62)} />
          </g>
        );
      })()}

      {/* Horizontal stripe on front face: 0.5" thick, 0.5" from bottom */}
      {(() => {
        const fy = baseY + baseD; // front face Y
        const sz = baseZ + 0.5 * INCH; // 0.5" from bottom
        const sh = 0.5 * INCH; // 0.5" thick
        return (
          <polygon
            points={pts([
              iso(baseX, fy, sz + sh),
              iso(baseX + baseW, fy, sz + sh),
              iso(baseX + baseW, fy, sz),
              iso(baseX, fy, sz),
            ])}
            fill="#fe8403"
            stroke="#d97006"
            strokeWidth={0.5}
          />
        );
      })()}

      {/* "AS120" text on front face, right side, just above orange line */}
      {(() => {
        const fy = baseY + baseD;
        const tz = baseZ + 1.25 * INCH; // just above the orange stripe top
        const tx = baseX + baseW - 5 * INCH; // right side
        const [p1x, p1y] = iso(tx, fy, tz);
        const [p2x, p2y] = iso(tx + 4 * INCH, fy, tz);
        const angle = Math.atan2(p2y - p1y, p2x - p1x) * (180 / Math.PI);
        return (
          <text
            x={p1x} y={p1y}
            fontSize="8"
            fill="#0671b5"
            fontFamily="system-ui, sans-serif"
            fontWeight="700"
            transform={`rotate(${angle}, ${p1x}, ${p1y})`}
          >
            AS120
          </text>
        );
      })()}

      {/* Trays + laser beam (interleaved for correct isometric occlusion) */}
      {(() => {
        const indexed = trays.map((t, i) => ({ t, origIdx: i }));
        indexed.sort((a, b) => (a.t.x + a.t.y) - (b.t.x + b.t.y));
        const sorted = indexed.map(e => e.t);
        const armW = 0.3 * INCH, armThick = 0.15 * INCH, armInset = 0.5 * INCH;
        const baseFrontY = baseY + baseD;

        // Find what the laser hits: trays, legs, or feet
        const activeLR = dragPos ? dragPos.lr : lrPos;
        const activeFB = dragPos ? dragPos.fb : fbPos;
        // Match syringe needle center: cylCX = headX + headW/2, cylCY = headY + headD - 1.75"
        const needleX = baseX + headW / 2 + headTravel * (1 - activeLR / lrRange);
        const needleY = baseY + headD + (activeFB / fbRange) * fbTravel - 1.75 * INCH;
        let hitZ = 0, hitIdx = -1;
        // Check trays
        for (let i = 0; i < sorted.length; i++) {
          const t = sorted[i];
          const tx = t.x * INCH, tw = t.width * INCH;
          const ty = t.y * INCH, td = t.depth * INCH;
          const tz = ((t.z ?? 0) + t.height) * INCH;
          if (needleX >= tx && needleX <= tx + tw && needleY >= ty && needleY <= ty + td) {
            if (tz > hitZ) { hitZ = tz; hitIdx = i; }
          }
        }
        // Check legs (boxes on top of feet)
        const legYC = baseY + (baseD - legD) / 2;
        const llx = baseX + 5 * INCH, rlx = baseX + baseW - 5 * INCH - legW;
        for (const lx of [llx, rlx]) {
          if (needleX >= lx && needleX <= lx + legW && needleY >= legYC && needleY <= legYC + legD) {
            const topZ = footH + legH;
            if (topZ > hitZ) { hitZ = topZ; hitIdx = -2; }
          }
        }
        // Check feet (centered under each leg)
        const lfx = llx + legW / 2 - footW / 2, rfx = rlx + legW / 2 - footW / 2;
        const fyc = legYC + legD / 2 - footD / 2;
        for (const fx of [lfx, rfx]) {
          if (needleX >= fx && needleX <= fx + footW && needleY >= fyc && needleY <= fyc + footD) {
            if (footH > hitZ) { hitZ = footH; hitIdx = -2; }
          }
        }

        const laserEl = needleCollision ? null : (
          <g pointerEvents="none">
            {(() => {
              const [, topSY] = iso(needleX, needleY, needleTipZ);
              const [hx, hy] = iso(needleX, needleY, hitZ);
              return (
                <>
                  <line x1={hx} y1={topSY} x2={hx} y2={hy}
                    stroke="#ef4444" strokeWidth={10} strokeOpacity={0.08} />
                  <line x1={hx} y1={topSY} x2={hx} y2={hy}
                    stroke="#ef4444" strokeWidth={4} strokeOpacity={0.15} />
                  <line x1={hx} y1={topSY} x2={hx} y2={hy}
                    stroke="#f87171" strokeWidth={1.5} strokeOpacity={0.8} />
                  <circle cx={hx} cy={hy} r={4} fill="#ef4444" fillOpacity={0.15} />
                  <circle cx={hx} cy={hy} r={2} fill="#f87171" fillOpacity={0.4} />
                  <circle cx={hx} cy={hy} r={0.8} fill="#fecaca" />
                </>
              );
            })()}
          </g>
        );

        // Insert laser at correct depth position
        // If hit, insert after the hit tray. If no hit, insert based on isometric depth.
        let insertAfter: number;
        if (hitIdx >= 0) {
          insertAfter = hitIdx;
        } else if (dragPos) {
          const laserDepth = (needleX + needleY) / INCH;
          insertAfter = -1;
          for (let i = 0; i < sorted.length; i++) {
            if ((sorted[i].x + sorted[i].y) <= laserDepth) insertAfter = i;
          }
        } else {
          insertAfter = -1;
        }

        function renderTray(t: TrayConfig, i: number) {
          const tx = t.x * INCH, tw = t.width * INCH;
          const tBackY = t.y * INCH;
          const tTopZ = ((t.z ?? 0) + t.height) * INCH;
          const origIdx = indexed[i].origIdx;
          return (
            <g key={i} onClick={onTrayClick ? () => onTrayClick(origIdx) : undefined}
              style={onTrayClick ? { cursor: "pointer" } : undefined}>
              <Arm x={tx + armInset} w={armW} thick={armThick}
                startY={baseFrontY} startZ={baseZ - armThick} endY={tBackY} endZ={tTopZ - armThick} />
              <Arm x={tx + tw - armInset - armW} w={armW} thick={armThick}
                startY={baseFrontY} startZ={baseZ - armThick} endY={tBackY} endZ={tTopZ - armThick} />
              <Tray config={t} />
            </g>
          );
        }

        return (
          <>
            {insertAfter === -1 && laserEl}
            {sorted.map((t, i) => (
              <>{renderTray(t, i)}{i === insertAfter && laserEl}</>
            ))}
          </>
        );
      })()}

      {/* Ghost head at target position (seamless L-shape) */}
      {showGhost && (() => {
        const gf = "#93c5fd", gs = "#3b82f6", gsw = 1;
        const x = ghostX, y = ghostY, z = headZ, w = headW, d = headD, h = headH;
        const tD = 4.5 * INCH, tH = 8 * INCH;
        const tY = y + d - tD, tZ = z + h + tH;
        return (
          <g opacity={0.5}>
            {/* Back top face (lower exposed) */}
            <polygon points={pts([iso(x, y, z+h), iso(x+w, y, z+h), iso(x+w, tY, z+h), iso(x, tY, z+h)])}
              fill={gf} stroke={gs} strokeWidth={gsw} strokeLinejoin="round" />
            {/* Inner step wall */}
            <polygon points={pts([iso(x, tY, tZ), iso(x+w, tY, tZ), iso(x+w, tY, z+h), iso(x, tY, z+h)])}
              fill={darken(gf, 0.7)} stroke={gs} strokeWidth={gsw} strokeLinejoin="round" />
            {/* Upper top face */}
            <polygon points={pts([iso(x, tY, tZ), iso(x+w, tY, tZ), iso(x+w, y+d, tZ), iso(x, y+d, tZ)])}
              fill={gf} stroke={gs} strokeWidth={gsw} strokeLinejoin="round" />
            {/* Right face (L-shaped) */}
            <polygon points={pts([iso(x+w, y, z+h), iso(x+w, tY, z+h), iso(x+w, tY, tZ), iso(x+w, y+d, tZ), iso(x+w, y+d, z), iso(x+w, y, z)])}
              fill={darken(gf, 0.78)} stroke={gs} strokeWidth={gsw} strokeLinejoin="round" />
            {/* Front face */}
            <polygon points={pts([iso(x, y+d, tZ), iso(x+w, y+d, tZ), iso(x+w, y+d, z), iso(x, y+d, z)])}
              fill={darken(gf, 0.62)} stroke={gs} strokeWidth={gsw} strokeLinejoin="round" />
          </g>
        );
      })()}

      {/* Draggable head assembly (LR + FB via pointer drag) */}
      <g style={{ cursor: "grab", userSelect: "none", WebkitUserSelect: "none" } as React.CSSProperties}
        onPointerDown={handlePointerDown}>
      {/* Left interior wall (rendered before UD slider so slider draws on top) */}
      {(() => {
        const fill = "#b5bcc3";
        const x = headX, y = headY, z = headZ;
        const fy = y + headD;
        const winH = 3.75 * INCH, winZ = z + 0.5 * INCH;
        return (
          <polygon points={pts([iso(x, y, winZ + winH), iso(x, fy, winZ + winH), iso(x, fy, z), iso(x, y, z)])}
            fill={darken(fill, 0.9)} />
        );
      })()}
      {/* UD slider (drawn before head so head renders on top where they overlap) */}
      {(() => {
        const udW = 1.5 * INCH;
        const udH = 12.5 * INCH;
        const udD = 0.125 * INCH; // 1/8"
        const udTravel = 7.75 * INCH;
        const udX = headX + (headW - udW) / 2; // centered in head width
        const udY = headY + headD - 2 * INCH - udD; // front face 2" behind head front
        const udZ = headZ - (udPos / udRange) * udTravel; // slides down as UD increases
        // Stepper motor on front of slider
        const mtrW = 1.4 * INCH;
        const mtrD = 1.4 * INCH;
        const mtrH = 2.75 * INCH;
        const mtrX = udX + (udW - mtrW) / 2; // centered on slider
        const mtrY = udY + udD; // back edge coplanar with slider front face
        const mtrZ = udZ + 6.75 * INCH; // 6.75" above slider bottom
        // Syringe cylinder below stepper motor
        const cylR = 0.125 * INCH; // 1/4" diameter = 1/8" radius
        const cylMaxH = 2.75 * INCH;
        const cylH = (syringePos / plRange) * cylMaxH;
        const cylCX = udX + udW / 2; // centered on slider width
        const cylCY = udY + udD + 0.125 * INCH + cylR; // 1/8" from slider front + radius
        const cylZ = mtrZ - cylH; // extends downward from motor bottom
        const cylN = 10;

        // Plunger holder block below cylinder
        const tipW = 1 * INCH;
        const tipD = 0.75 * INCH;
        const tipH = 0.6 * INCH;
        const tipX = cylCX - tipW / 2; // centered on cylinder
        const tipY = udY + udD; // back face coplanar with slider front
        const tipZ = cylZ - tipH; // top edge = bottom of cylinder

        // Syringe barrel (fixed to UD slider)
        // Top = bottom of plunger holder block at max extension, bottom = UD slider bottom + 0.5"
        const barrelR = 0.3 * INCH; // 0.6" diameter
        const barrelTopZ = mtrZ - cylMaxH - tipH; // plunger holder block bottom at max extension
        const barrelZ = udZ + 0.5 * INCH; // 1/2" above UD slider bottom
        const barrelH = barrelTopZ - barrelZ;
        const barrelN = 12;
        // Needle below barrel
        const needleR = 0.03 * INCH;
        const needleH = 0.75 * INCH;
        const needleZ = barrelZ - needleH;
        const needleN = 6;

        return (
          <g>
            <Box x={udX} y={udY} z={udZ} w={udW} d={udD} h={udH}
              fill={needleCollision ? "#c98a8a" : "#8a9199"} stroke={needleCollision ? "#b06060" : "#6b7280"} />
            {/* Plunger (stem + gasket inside barrel) */}
            {(() => {
              const gasketH = 0.15 * INCH;
              const gasketR = barrelR - 0.02 * INCH;
              const stemR = 0.06 * INCH;
              const gasketBottomZ = barrelZ + (1 - syringePos / plRange) * (barrelH - gasketH);
              const gasketTopZ = gasketBottomZ + gasketH;
              const stemTopZ = tipZ;
              const stemBottomZ = gasketTopZ;
              const stemN = 8;
              const gasketN = 12;
              const stemStrips = stemTopZ > stemBottomZ ? Array.from({ length: stemN }, (_, i) => {
                const θ1 = (Math.PI * i) / stemN;
                const θ2 = (Math.PI * (i + 1)) / stemN;
                const x1 = cylCX + stemR * Math.cos(θ1), y1 = cylCY + stemR * Math.sin(θ1);
                const x2 = cylCX + stemR * Math.cos(θ2), y2 = cylCY + stemR * Math.sin(θ2);
                const shade = 0.85 - 0.25 * Math.sin((θ1 + θ2) / 2);
                return (
                  <polygon key={`pstem${i}`}
                    points={pts([iso(x1, y1, stemTopZ), iso(x2, y2, stemTopZ), iso(x2, y2, stemBottomZ), iso(x1, y1, stemBottomZ)])}
                    fill={darken("#a0a0a0", shade)} stroke="none" />
                );
              }) : [];
              const gFill = "#222222";
              const gStrips = Array.from({ length: gasketN }, (_, i) => {
                const θ1 = (Math.PI * i) / gasketN;
                const θ2 = (Math.PI * (i + 1)) / gasketN;
                const x1 = cylCX + gasketR * Math.cos(θ1), y1 = cylCY + gasketR * Math.sin(θ1);
                const x2 = cylCX + gasketR * Math.cos(θ2), y2 = cylCY + gasketR * Math.sin(θ2);
                const shade = 0.9 - 0.2 * Math.sin((θ1 + θ2) / 2);
                return (
                  <polygon key={`pgask${i}`}
                    points={pts([iso(x1, y1, gasketTopZ), iso(x2, y2, gasketTopZ), iso(x2, y2, gasketBottomZ), iso(x1, y1, gasketBottomZ)])}
                    fill={darken(gFill, shade)} stroke="none" />
                );
              });
              const gTopPts: [number, number][] = [];
              const gBotPts: [number, number][] = [];
              for (let i = 0; i <= gasketN * 2; i++) {
                const θ = (Math.PI * 2 * i) / (gasketN * 2);
                const bx = cylCX + gasketR * Math.cos(θ), by = cylCY + gasketR * Math.sin(θ);
                gTopPts.push(iso(bx, by, gasketTopZ));
                gBotPts.push(iso(bx, by, gasketBottomZ));
              }
              return (
                <g>
                  <polygon points={pts(gBotPts)} fill={darken(gFill, 0.7)} stroke="none" />
                  {gStrips}
                  <polygon points={pts(gTopPts)} fill={darken(gFill, 1.1)} stroke="none" />
                  {stemStrips}
                </g>
              );
            })()}
            {/* Syringe barrel (glass cylinder) */}
            {(() => {
              const bFill = "#d4dce6";
              const strips = Array.from({ length: barrelN }, (_, i) => {
                const θ1 = (Math.PI * i) / barrelN;
                const θ2 = (Math.PI * (i + 1)) / barrelN;
                const x1 = cylCX + barrelR * Math.cos(θ1);
                const y1 = cylCY + barrelR * Math.sin(θ1);
                const x2 = cylCX + barrelR * Math.cos(θ2);
                const y2 = cylCY + barrelR * Math.sin(θ2);
                const midθ = (θ1 + θ2) / 2;
                const shade = 0.9 - 0.2 * Math.sin(midθ);
                return (
                  <polygon key={`bar${i}`}
                    points={pts([iso(x1, y1, barrelZ + barrelH), iso(x2, y2, barrelZ + barrelH), iso(x2, y2, barrelZ), iso(x1, y1, barrelZ)])}
                    fill={darken(bFill, shade)} fillOpacity={0.7} stroke="none" />
                );
              });
              const topPts: [number, number][] = [];
              const botPts: [number, number][] = [];
              for (let i = 0; i <= barrelN * 2; i++) {
                const θ = (Math.PI * 2 * i) / (barrelN * 2);
                const bx = cylCX + barrelR * Math.cos(θ), by = cylCY + barrelR * Math.sin(θ);
                topPts.push(iso(bx, by, barrelZ + barrelH));
                botPts.push(iso(bx, by, barrelZ));
              }
              return (
                <g>
                  <polygon points={pts(botPts)} fill={darken(bFill, 0.7)} fillOpacity={0.5} stroke="none" />
                  {strips}
                  <polygon points={pts(topPts)} fill={bFill} fillOpacity={0.5} stroke="none" />
                </g>
              );
            })()}
            <Box x={tipX} y={tipY} z={tipZ} w={tipW} d={tipD} h={tipH}
              fill="#1a1a1a" stroke="#333" />
            {/* Needle */}
            {(() => {
              const nFill = "#b0b8c0";
              const strips = Array.from({ length: needleN }, (_, i) => {
                const θ1 = (Math.PI * i) / needleN;
                const θ2 = (Math.PI * (i + 1)) / needleN;
                const x1 = cylCX + needleR * Math.cos(θ1);
                const y1 = cylCY + needleR * Math.sin(θ1);
                const x2 = cylCX + needleR * Math.cos(θ2);
                const y2 = cylCY + needleR * Math.sin(θ2);
                const midθ = (θ1 + θ2) / 2;
                const shade = 0.9 - 0.3 * Math.sin(midθ);
                return (
                  <polygon key={`ndl${i}`}
                    points={pts([iso(x1, y1, barrelZ), iso(x2, y2, barrelZ), iso(x2, y2, needleZ), iso(x1, y1, needleZ)])}
                    fill={darken(nFill, shade)} stroke="none" />
                );
              });
              return <g>{strips}</g>;
            })()}
            {/* Plunger threaded axle */}
            {cylH > 0 && (() => {
              const cylFill = "#c0c0c0";
              const strips = Array.from({ length: cylN }, (_, i) => {
                const θ1 = (Math.PI * i) / cylN;
                const θ2 = (Math.PI * (i + 1)) / cylN;
                const x1 = cylCX + cylR * Math.cos(θ1);
                const y1 = cylCY + cylR * Math.sin(θ1);
                const x2 = cylCX + cylR * Math.cos(θ2);
                const y2 = cylCY + cylR * Math.sin(θ2);
                const midθ = (θ1 + θ2) / 2;
                const shade = 0.85 - 0.25 * Math.sin(midθ);
                return (
                  <polygon key={`cyl${i}`}
                    points={pts([iso(x1, y1, cylZ + cylH), iso(x2, y2, cylZ + cylH), iso(x2, y2, cylZ), iso(x1, y1, cylZ)])}
                    fill={darken(cylFill, shade)} stroke="none" />
                );
              });
              const topPts: [number, number][] = [];
              for (let i = 0; i <= cylN * 2; i++) {
                const θ = (Math.PI * 2 * i) / (cylN * 2);
                topPts.push(iso(cylCX + cylR * Math.cos(θ), cylCY + cylR * Math.sin(θ), cylZ + cylH));
              }
              return (
                <g>
                  {strips}
                  <polygon points={pts(topPts)} fill={cylFill} stroke="#999" strokeWidth={0.4} />
                </g>
              );
            })()}
            <Box x={mtrX} y={mtrY} z={mtrZ} w={mtrW} d={mtrD} h={mtrH}
              fill="#1a1a1a" stroke="#333" />
          </g>
        );
      })()}

      {/* Head: lower box + upper tower, front-aligned */}
      {(() => {
        const fill = "#b5bcc3";
        const x = headX, y = headY, w = headW, d = headD, z = headZ, h = headH;
        const towerD = 4.5 * INCH;
        const towerH = 8 * INCH;
        const towerY = y + d - towerD; // back edge of tower (front-aligned)
        const towerTopZ = z + h + towerH; // top of tower
        return (
          <g>
            {/* Back top face (top of lower part, exposed) */}
            <polygon points={pts([iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, towerY, z + h), iso(x, towerY, z + h)])}
              fill={fill} />
            {/* Inner step wall */}
            <polygon points={pts([iso(x, towerY, towerTopZ), iso(x + w, towerY, towerTopZ), iso(x + w, towerY, z + h), iso(x, towerY, z + h)])}
              fill={darken(fill, 0.7)} />
            {/* Upper top face */}
            <polygon points={pts([iso(x, towerY, towerTopZ), iso(x + w, towerY, towerTopZ), iso(x + w, y + d, towerTopZ), iso(x, y + d, towerTopZ)])}
              fill={fill} />
            {/* Windows: 1.5" wide, 3.25" tall, 1" above head bottom, flush right + front */}
            {(() => {
              const winW = 1.5 * INCH;
              const winH = 3.75 * INCH;
              const winZ = z + 0.5 * INCH;
              const winX = x + w - winW;
              const fy = y + d;
              const winD = 1.5 * INCH;
              const winY = fy - winD;

              // Right face (L-shaped with window cutout)
              const rightOuter = [
                iso(x + w, y, z + h), iso(x + w, towerY, z + h),
                iso(x + w, towerY, towerTopZ), iso(x + w, y + d, towerTopZ),
                iso(x + w, y + d, z), iso(x + w, y, z),
              ];
              const rightHole = [
                iso(x + w, winY, winZ + winH), iso(x + w, fy, winZ + winH),
                iso(x + w, fy, winZ), iso(x + w, winY, winZ),
              ];

              // Front face (full height with window cutout)
              const frontOuter = [
                iso(x, fy, towerTopZ), iso(x + w, fy, towerTopZ),
                iso(x + w, fy, z), iso(x, fy, z),
              ];
              const frontHole = [
                iso(winX, fy, winZ + winH), iso(winX + winW, fy, winZ + winH),
                iso(winX + winW, fy, winZ), iso(winX, fy, winZ),
              ];

              return (
                <>
                  {/* Right face with cutout (no stroke — front face covers shared edge) */}
                  <path d={pathD(rightOuter) + " " + pathD(rightHole)}
                    fillRule="evenodd" fill={darken(fill, 0.78)} />
                  {/* Front face with cutout (no stroke — glass border defines window edge) */}
                  <path d={pathD(frontOuter) + " " + pathD(frontHole)}
                    fillRule="evenodd" fill={darken(fill, 0.62)} />
                  {/* Glass — single continuous path wrapping the corner */}
                  <polygon points={pts([
                    iso(x + w, winY, winZ + winH),
                    iso(x + w, fy, winZ + winH),
                    iso(winX, fy, winZ + winH),
                    iso(winX, fy, winZ),
                    iso(x + w, fy, winZ),
                    iso(x + w, winY, winZ),
                  ])} fill="#1a3a5c" fillOpacity={0.25} stroke="#4a7a9c" strokeWidth={0.6} strokeLinejoin="round" />
                </>
              );
            })()}
          </g>
        );
      })()}
      </g>{/* end draggable head assembly */}

      {/* Vertical sliders for UD (left) and PL (right) */}
      {[
        { axis: "ud" as const, cx: udSliderX, pos: udPos, range: udRange, color: "#10b981", light: "#6ee7b7", label: "UD" },
        { axis: "pl" as const, cx: plSliderX, pos: syringePos, range: plRange, color: "#a855f7", light: "#c084fc", label: "PL" },
      ].map(({ axis, cx, pos, range, color, light, label }) => {
        const tw = 6, thW = 16, thH = 8;
        const thumbY = sliderTY + (pos / range) * sliderTH;
        const motor = axis === "ud" ? ud : syringe;
        const dragTarget = sliderDrag?.axis === axis ? sliderDrag.target : null;
        const queueTarget = motor ? finalQueueTarget(motor.index, motor.position) : null;
        const ghostVal = dragTarget ?? queueTarget;
        const showSliderGhost = ghostVal != null && Math.abs(ghostVal - pos) > 5;
        const ghostY = ghostVal != null ? sliderTY + (ghostVal / range) * sliderTH : null;
        return (
          <g key={axis}>
            {/* Track bg */}
            <rect x={cx - tw / 2} y={sliderTY} width={tw} height={sliderTH}
              rx={3} fill="#0b1120" stroke={color} strokeWidth={0.5} strokeOpacity={0.4} />
            {/* Fill */}
            <rect x={cx - tw / 2} y={sliderTY} width={tw} height={Math.max(0, thumbY - sliderTY)}
              rx={3} fill={color} fillOpacity={0.2} />
            {/* Tick marks */}
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <line key={f} x1={cx - tw / 2 - 2} y1={sliderTY + f * sliderTH} x2={cx - tw / 2} y2={sliderTY + f * sliderTH}
                stroke={color} strokeWidth={0.4} strokeOpacity={0.5} />
            ))}
            {/* Ghost thumb at target */}
            {showSliderGhost && ghostY != null && (
              <rect x={cx - thW / 2} y={ghostY - thH / 2} width={thW} height={thH}
                rx={4} fill={color} fillOpacity={0.3} stroke={light} strokeWidth={0.6} strokeOpacity={0.5} />
            )}
            {/* Hit area (wider for touch) */}
            <rect x={cx - thW / 2 - 6} y={sliderTY - 12} width={thW + 12} height={sliderTH + 24}
              fill="transparent" style={{ cursor: "ns-resize", touchAction: "none" } as React.CSSProperties}
              onPointerDown={(e) => handleSliderDown(axis, e)} />
            {/* Thumb */}
            <rect x={cx - thW / 2} y={thumbY - thH / 2} width={thW} height={thH}
              rx={4} fill={color} stroke={light} strokeWidth={0.8}
              style={{ pointerEvents: "none" }} />
            {/* Label */}
            <text x={cx} y={sliderTY - 18} textAnchor="middle"
              fontSize="11" fill={light} fontFamily="ui-monospace, monospace" fontWeight="700">{label}</text>
            {/* Value */}
            <text x={cx} y={sliderTY - 6} textAnchor="middle"
              fontSize="11" fill={light} fontFamily="ui-monospace, monospace" fontWeight="600">
              {dragTarget != null ? dragTarget : Math.round(pos)}
            </text>
            {/* Range labels */}
            <text x={cx + tw / 2 + 3} y={sliderTY + 2} textAnchor="start"
              fontSize="3.5" fill={color} fillOpacity={0.5} fontFamily="ui-monospace, monospace">0</text>
            <text x={cx + tw / 2 + 3} y={sliderBY} textAnchor="start"
              fontSize="3.5" fill={color} fillOpacity={0.5} fontFamily="ui-monospace, monospace">{range}</text>
          </g>
        );
      })}

    </svg>
  );
}
