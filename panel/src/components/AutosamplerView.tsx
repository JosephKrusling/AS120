import type { MotorStatus } from "@/transport/types";

interface Props {
  motors: MotorStatus[];
}

// Step-to-world-unit mapping (tune to match real travel)
const RANGE = {
  LR: { max: 2000, travel: 150 },   // base axis: whole gantry left-right (world X)
  FB: { max: 2000, travel: 55 },    // on LR: tower shifts forward-back (world Y)
  UD: { max: 2000, travel: 110 },   // on FB: syringe up-down on tower (world Z)
  PL: { max: 400, travel: 25 },     // on UD: plunger extends down (world Z)
};

function scale(pos: number, axis: keyof typeof RANGE): number {
  const r = RANGE[axis];
  return (Math.max(0, Math.min(r.max, pos)) / r.max) * r.travel;
}

// Isometric projection (30° dimetric)
// World: +X = right, +Y = into screen, +Z = up
const A = Math.PI / 6;
const CA = Math.cos(A);
const SA = Math.sin(A);
function iso(x: number, y: number, z: number): [number, number] {
  return [(x - y) * CA, (x + y) * SA - z];
}

function darken(hex: string, f: number): string {
  return `rgb(${(parseInt(hex.slice(1, 3), 16) * f) | 0},${(parseInt(hex.slice(3, 5), 16) * f) | 0},${(parseInt(hex.slice(5, 7), 16) * f) | 0})`;
}

function pts(coords: [number, number][]): string {
  return coords.map((c) => c.join(",")).join(" ");
}

function Box({ x, y, z, w, d, h, fill, stroke = "#555", sw = 0.8 }: {
  x: number; y: number; z: number; w: number; d: number; h: number;
  fill: string; stroke?: string; sw?: number;
}) {
  return (
    <g>
      <polygon points={pts([iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)])}
        fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
      <polygon points={pts([iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x + w, y, z)])}
        fill={darken(fill, 0.78)} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
      <polygon points={pts([iso(x, y + d, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x, y + d, z)])}
        fill={darken(fill, 0.62)} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
    </g>
  );
}

function Stripe({ x, y, z, w, h, fill, stroke }: {
  x: number; y: number; z: number; w: number; h: number; fill: string; stroke: string;
}) {
  return <polygon points={pts([iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y, z), iso(x, y, z)])}
    fill={fill} stroke={stroke} strokeWidth={0.5} />;
}

function Vial({ x, y, z, h, r }: { x: number; y: number; z: number; h: number; r: number }) {
  const N = 6;
  const topPts: string[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const [px, py] = iso(x + Math.cos(a) * r, y + Math.sin(a) * r, z + h);
    topPts.push(`${px},${py}`);
  }
  return (
    <g>
      {[2, 3, 4].map((i) => {
        const ni = (i + 1) % N;
        const a1 = (i / N) * Math.PI * 2, a2 = (ni / N) * Math.PI * 2;
        return <polygon key={i} points={pts([
          iso(x + Math.cos(a1) * r, y + Math.sin(a1) * r, z + h),
          iso(x + Math.cos(a2) * r, y + Math.sin(a2) * r, z + h),
          iso(x + Math.cos(a2) * r, y + Math.sin(a2) * r, z),
          iso(x + Math.cos(a1) * r, y + Math.sin(a1) * r, z),
        ])} fill={i === 3 ? "#2563eb" : "#1d4ed8"} stroke="#1e40af" strokeWidth={0.3} />;
      })}
      <polygon points={topPts.join(" ")} fill="#60a5fa" stroke="#3b82f6" strokeWidth={0.3} />
    </g>
  );
}

export function AutosamplerView({ motors }: Props) {
  const fb = motors.find((m) => m.name === "FB");
  const ud = motors.find((m) => m.name === "UD");
  const pl = motors.find((m) => m.name === "PL");
  const lr = motors.find((m) => m.name === "LR");

  // Kinematic chain: LR (base) → FB → UD → PL
  const oLR = scale(lr?.position ?? 0, "LR");   // gantry slides right
  const oFB = scale(fb?.position ?? 0, "FB");    // tower shifts into screen
  const oUD = scale(ud?.position ?? 0, "UD");    // syringe drops down
  const oPL = scale(pl?.position ?? 0, "PL");    // plunger extends down

  // ===== FIXED GEOMETRY =====
  const BASE_Z = 80;

  // ===== LR RAIL (fixed on base) =====
  // Horizontal rail running left-right that the gantry rides on
  const RAIL_X = -140;
  const RAIL_Y = 5;
  const RAIL_W = 220;

  // ===== GANTRY (moves with LR) =====
  // Tower + arm assembly. LR shifts everything in X.
  const gantryX = RAIL_X + 10 + oLR;   // LR shifts gantry right

  // ===== TOWER (moves with LR + FB) =====
  const towerX = gantryX + 140;         // tower is at right end of arm
  const towerY = RAIL_Y + 4 + oFB;      // FB shifts tower into screen
  const towerW = 20;
  const towerD = 26;
  const towerH = 180;

  // ===== ARM (moves with LR + FB, extends left from tower) =====
  const armX = gantryX;
  const armY = towerY + 2;
  const armW = towerX - armX + towerW / 2;
  const armD = 15;
  const armH = 15;
  const armZ = BASE_Z + towerH - 20;    // arm near top of tower

  // ===== SYRINGE CARRIAGE (moves with LR + FB + UD) =====
  const carriageX = gantryX + 4;
  const carriageY = armY - 2;
  const carriageW = 16;
  const carriageD = 20;
  const carriageH = 14;
  const carriageZ = armZ - carriageH - oUD;  // UD drops carriage down

  // ===== SYRINGE (moves with LR + FB + UD) =====
  const syringeX = carriageX + 4;
  const syringeY = carriageY + 6;
  const barrelH = 42;
  const barrelZ = carriageZ - barrelH;
  const needleLen = 14;

  return (
    <svg viewBox="-240 -310 530 400" className="w-full" style={{ maxHeight: "420px" }}>

      {/* ===== GC INSTRUMENT (fixed, right) ===== */}
      <Box x={90} y={-20} z={0} w={120} d={100} h={90} fill="#d1d5db" stroke="#9ca3af" />
      <Box x={90} y={-20} z={90} w={120} d={100} h={4} fill="#4b5563" stroke="#374151" />
      {/* Injection port */}
      <Box x={110} y={20} z={94} w={8} d={8} h={14} fill="#1f2937" stroke="#111827" />
      <Box x={112} y={22} z={108} w={4} d={4} h={3} fill="#374151" stroke="#1f2937" />

      {/* ===== BASE PLATFORM (fixed) ===== */}
      <Box x={RAIL_X} y={-20} z={BASE_Z - 6} w={230} d={100} h={6} fill="#9ca3af" stroke="#6b7280" />

      {/* ===== LR RAIL (fixed on platform) ===== */}
      <Box x={RAIL_X + 5} y={RAIL_Y} z={BASE_Z} w={RAIL_W} d={5} h={3} fill="#78716c" stroke="#57534e" sw={0.5} />
      <Box x={RAIL_X + 5} y={RAIL_Y + 50} z={BASE_Z} w={RAIL_W} d={5} h={3} fill="#78716c" stroke="#57534e" sw={0.5} />

      {/* ===== SAMPLE TRAY (fixed) ===== */}
      <Box x={-130} y={-10} z={BASE_Z} w={95} d={65} h={4} fill="#e5e7eb" stroke="#9ca3af" />
      <Box x={-130} y={-10} z={BASE_Z} w={95} d={2} h={14} fill="#d1d5db" stroke="#9ca3af" />
      <Box x={-130} y={-10} z={BASE_Z} w={2} d={65} h={14} fill="#c4c8cd" stroke="#9ca3af" />
      {/* Vials */}
      {Array.from({ length: 8 }).map((_, c) =>
        Array.from({ length: 5 }).map((_, r) => (
          <Vial key={`${c}-${r}`} x={-122 + c * 11} y={-3 + r * 11} z={BASE_Z + 4} h={10} r={3.8} />
        ))
      )}

      {/* ===== TOWER (moves with LR + FB) ===== */}
      <Box x={towerX} y={towerY} z={BASE_Z} w={towerW} d={towerD} h={towerH}
        fill="#d1d5db" stroke="#9ca3af" />
      {/* Tower rail groove */}
      <Box x={towerX} y={towerY + 9} z={BASE_Z + 4} w={3} d={6} h={towerH - 12}
        fill="#6b7280" stroke="#4b5563" />
      {/* Vents at top */}
      {[0, 1, 2, 3].map((i) => (
        <Box key={i} x={towerX + 4 + i * 4} y={towerY} z={BASE_Z + towerH - 20 + i * 4}
          w={2} d={1} h={8} fill="#b0b5bc" stroke="#9ca3af" sw={0.3} />
      ))}

      {/* ===== HORIZONTAL ARM (moves with LR + FB) ===== */}
      <Box x={armX} y={armY} z={armZ} w={armW} d={armD} h={armH}
        fill="#d1d5db" stroke="#9ca3af" />

      {/* Orange accent stripe on front */}
      <Stripe x={armX} y={armY + armD} z={armZ + 5} w={armW} h={3}
        fill="#f97316" stroke="#ea580c" />

      {/* Blue accent near tower */}
      <Stripe x={armX + armW - 30} y={armY + armD} z={armZ + 9} w={28} h={3}
        fill="#2563eb" stroke="#1d4ed8" />

      {/* "AS120" text */}
      {(() => {
        const [px, py] = iso(armX + armW - 22, armY + armD, armZ + 10);
        return <text x={px} y={py} fontSize="5" fill="#f97316" fontFamily="system-ui" fontWeight="700"
          transform={`rotate(-15, ${px}, ${py})`}>AS120</text>;
      })()}

      {/* "EST" text on left side of arm */}
      {(() => {
        const [px, py] = iso(armX + 10, armY + armD, armZ + 10);
        return <text x={px} y={py} fontSize="6" fill="#2563eb" fontFamily="system-ui" fontWeight="800"
          transform={`rotate(-15, ${px}, ${py})`}>EST</text>;
      })()}

      {/* ===== SYRINGE CARRIAGE (moves with LR + FB + UD) ===== */}
      <Box x={carriageX} y={carriageY} z={carriageZ}
        w={carriageW} d={carriageD} h={carriageH}
        fill="#b0b5bc" stroke="#9ca3af" />

      {/* ===== SYRINGE BARREL ===== */}
      <Box x={syringeX} y={syringeY} z={barrelZ}
        w={4} d={4} h={barrelH} fill="#e5e7eb" stroke="#9ca3af" sw={0.5} />
      {/* Plunger handle */}
      <Box x={syringeX - 1} y={syringeY - 1} z={barrelZ + barrelH}
        w={6} d={6} h={3} fill="#6b7280" stroke="#4b5563" sw={0.5} />
      {/* Plunger rod */}
      <Box x={syringeX + 1} y={syringeY + 1} z={barrelZ - oPL}
        w={2} d={2} h={oPL + 4} fill="#9ca3af" stroke="#6b7280" sw={0.4} />
      {/* Needle */}
      {(() => {
        const [x1, y1] = iso(syringeX + 2, syringeY + 2, barrelZ - oPL);
        const [x2, y2] = iso(syringeX + 2, syringeY + 2, barrelZ - oPL - needleLen);
        return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#9ca3af" strokeWidth={1} />;
      })()}

      {/* ===== POSITION READOUT ===== */}
      <g fontSize="7.5" fontFamily="monospace" fill="#71717a">
        <text x={200} y={-20} textAnchor="end">LR {lr?.position ?? 0}</text>
        <text x={200} y={-9} textAnchor="end">FB {fb?.position ?? 0}</text>
        <text x={200} y={2} textAnchor="end">UD {ud?.position ?? 0}</text>
        <text x={200} y={13} textAnchor="end">PL {pl?.position ?? 0}</text>
      </g>
    </svg>
  );
}
