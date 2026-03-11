import { useRef, useCallback, useState, useEffect } from "react";
import { useAS120 } from "@/hooks/useAS120";
import type { MotorStatus } from "@/transport/types";

interface Props {
  motors: MotorStatus[];
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

export function AutosamplerView({ motors }: Props) {
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
  const [dragPos, setDragPos] = useState<{ lr: number; fb: number } | null>(null);
  const lastSend = useRef(0);

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

  // Convert client pointer position → motor step values
  function clientToSteps(clientX: number, clientY: number) {
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
      lr: Math.round(Math.max(0, Math.min(lrRange, ((baseX + headTravel - wx) / headTravel) * lrRange))),
      fb: Math.round(Math.max(0, Math.min(fbRange, ((wy - baseY) / fbTravel) * fbRange))),
    };
  }

  function handlePointerDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragging.current = true;
    const steps = clientToSteps(e.clientX, e.clientY);
    if (steps) setDragPos(steps);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const steps = clientToSteps(e.clientX, e.clientY);
    if (!steps) return;
    setDragPos(steps);
    // Throttle motor commands to ~10/s, using replace to retarget mid-flight
    const now = Date.now();
    if (now - lastSend.current >= 100) {
      lastSend.current = now;
      if (lr) moveMotor(lr.index, steps.lr, true);
      if (fb) moveMotor(fb.index, steps.fb, true);
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!dragging.current) return;
    dragging.current = false;
    // Always send final position with replace
    const steps = clientToSteps(e.clientX, e.clientY);
    if (steps) {
      if (lr) moveMotor(lr.index, steps.lr, true);
      if (fb) moveMotor(fb.index, steps.fb, true);
    }
    setDragPos(null);
  }

  return (
    <svg ref={svgRef} viewBox="-180 -260 340 340" className="w-full"
      style={{ maxHeight: "400px", touchAction: "none", WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" } as React.CSSProperties}
      onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
      {/* Feet and legs (drawn first, behind base) */}
      {(() => {
        const fill = "#b5bcc3";
        const sk = "#9ca3af";
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
              fill={fill} stroke={sk} />
            <Box x={leftLegX} y={legYCenter} z={footH} w={legW} d={legD} h={legH}
              fill={fill} stroke={sk} />
            <Foot x={rightFootX} y={footYCenter} z={0} w={footW} d={footD} h={footH}
              fill={fill} stroke={sk} />
            <Box x={rightLegX} y={legYCenter} z={footH} w={legW} d={legD} h={legH}
              fill={fill} stroke={sk} />
          </>
        );
      })()}

      {/* Base with notch cut from back-top: 3" deep, 1.5" tall */}
      {(() => {
        const fill = "#b5bcc3";
        const sk = "#9ca3af";
        const sw = 0.8;
        const notchD = 3 * INCH; // depth of notch from back edge
        const notchH = 1.5 * INCH; // height of notch from top
        const stepZ = baseZ + baseH - notchH; // floor of the notch
        const stepY = baseY + notchD; // where the step wall is
        const x = baseX, y = baseY, z = baseZ, w = baseW, d = baseD, h = baseH;
        return (
          <g>
            {/* Back top face (notch floor) */}
            <polygon points={pts([iso(x, y, stepZ), iso(x + w, y, stepZ), iso(x + w, stepY, stepZ), iso(x, stepY, stepZ)])}
              fill={fill} stroke={sk} strokeWidth={sw} strokeLinejoin="round" />
            {/* Inner step wall (vertical face at stepY, facing back) */}
            <polygon points={pts([iso(x, stepY, z + h), iso(x + w, stepY, z + h), iso(x + w, stepY, stepZ), iso(x, stepY, stepZ)])}
              fill={darken(fill, 0.7)} stroke={sk} strokeWidth={sw} strokeLinejoin="round" />
            {/* Front top face */}
            <polygon points={pts([iso(x, stepY, z + h), iso(x + w, stepY, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)])}
              fill={fill} stroke={sk} strokeWidth={sw} strokeLinejoin="round" />
            {/* Right face (L-shaped) */}
            <polygon points={pts([
              iso(x + w, y, stepZ),
              iso(x + w, stepY, stepZ),
              iso(x + w, stepY, z + h),
              iso(x + w, y + d, z + h),
              iso(x + w, y + d, z),
              iso(x + w, y, z),
            ])}
              fill="#266eba" stroke={sk} strokeWidth={sw} strokeLinejoin="round" />
            {/* Front face */}
            <polygon points={pts([iso(x, y + d, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x, y + d, z)])}
              fill={darken(fill, 0.62)} stroke={sk} strokeWidth={sw} strokeLinejoin="round" />
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

        // Plunger tip below cylinder
        const tipW = 1 * INCH;
        const tipD = 0.75 * INCH;
        const tipH = 0.6 * INCH;
        const tipX = cylCX - tipW / 2; // centered on cylinder
        const tipY = udY + udD; // back face coplanar with slider front
        const tipZ = cylZ - tipH; // top edge = bottom of cylinder

        return (
          <g>
            <Box x={udX} y={udY} z={udZ} w={udW} d={udD} h={udH}
              fill="#8a9199" stroke="#6b7280" />
            <Box x={tipX} y={tipY} z={tipZ} w={tipW} d={tipD} h={tipH}
              fill="#1a1a1a" stroke="#333" />
            {cylH > 0 && (() => {
              const cylFill = "#c0c0c0";
              // Cylinder surface strips (front half visible)
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
              // Top ellipse
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
        const sk = "#9ca3af";
        const sw = 0.8;
        const x = headX, y = headY, w = headW, d = headD, z = headZ, h = headH;
        const towerD = 4.5 * INCH;
        const towerH = 8 * INCH;
        const towerY = y + d - towerD; // back edge of tower (front-aligned)
        const towerTopZ = z + h + towerH; // top of tower
        return (
          <g>
            {/* Back top face (top of lower part, exposed) */}
            <polygon points={pts([iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, towerY, z + h), iso(x, towerY, z + h)])}
              fill={fill} stroke={sk} strokeWidth={sw} strokeLinejoin="round" />
            {/* Inner step wall */}
            <polygon points={pts([iso(x, towerY, towerTopZ), iso(x + w, towerY, towerTopZ), iso(x + w, towerY, z + h), iso(x, towerY, z + h)])}
              fill={darken(fill, 0.7)} stroke={sk} strokeWidth={sw} strokeLinejoin="round" />
            {/* Upper top face */}
            <polygon points={pts([iso(x, towerY, towerTopZ), iso(x + w, towerY, towerTopZ), iso(x + w, y + d, towerTopZ), iso(x, y + d, towerTopZ)])}
              fill={fill} stroke={sk} strokeWidth={sw} strokeLinejoin="round" />
            {/* Windows: 1.5" wide, 3.25" tall, 1" above head bottom, flush right + front */}
            {(() => {
              const winW = 1.5 * INCH;
              const winH = 3.25 * INCH;
              const winZ = z + 1 * INCH;
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
                  {/* Right face with cutout */}
                  <path d={pathD(rightOuter) + " " + pathD(rightHole)}
                    fillRule="evenodd" fill={darken(fill, 0.78)}
                    stroke={sk} strokeWidth={sw} strokeLinejoin="round" />
                  {/* Front face with cutout */}
                  <path d={pathD(frontOuter) + " " + pathD(frontHole)}
                    fillRule="evenodd" fill={darken(fill, 0.62)}
                    stroke={sk} strokeWidth={sw} strokeLinejoin="round" />
                  {/* Glass overlays */}
                  <polygon points={pts(frontHole)}
                    fill="#1a3a5c" fillOpacity={0.3}
                    stroke="#4a7a9c" strokeWidth={0.6} strokeLinejoin="round" />
                  <polygon points={pts(rightHole)}
                    fill="#1a3a5c" fillOpacity={0.2}
                    stroke="#4a7a9c" strokeWidth={0.6} strokeLinejoin="round" />
                </>
              );
            })()}
          </g>
        );
      })()}
      </g>{/* end draggable head assembly */}
    </svg>
  );
}
