export function TopologyView() {
  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox="0 0 1200 720"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="mx-auto min-w-[900px]"
      >
        <defs>
          {/* Glow filter for active connections */}
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Subtle shadow */}
          <filter id="shadow" x="-5%" y="-5%" width="110%" height="115%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.5" />
          </filter>
          {/* Animated dash for data flow */}
          <pattern id="flow" width="12" height="1" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="6" y2="0" stroke="#34d399" strokeWidth="2" strokeLinecap="round">
              <animate attributeName="x1" values="0;12" dur="1s" repeatCount="indefinite" />
              <animate attributeName="x2" values="6;18" dur="1s" repeatCount="indefinite" />
            </line>
          </pattern>
        </defs>

        {/* Background grid */}
        <rect width="1200" height="720" fill="#09090b" rx="12" />
        {Array.from({ length: 60 }).map((_, i) => (
          <line key={`gv${i}`} x1={i * 20} y1="0" x2={i * 20} y2="720" stroke="#ffffff" strokeOpacity="0.02" />
        ))}
        {Array.from({ length: 36 }).map((_, i) => (
          <line key={`gh${i}`} x1="0" y1={i * 20} x2="1200" y2={i * 20} stroke="#ffffff" strokeOpacity="0.02" />
        ))}

        {/* ============================================================ */}
        {/* LAYER LABELS */}
        {/* ============================================================ */}
        <text x="20" y="30" fontSize="10" fill="#525252" fontFamily="system-ui" letterSpacing="2" style={{ textTransform: "uppercase" }}>CLIENT</text>
        <text x="250" y="30" fontSize="10" fill="#525252" fontFamily="system-ui" letterSpacing="2">MCU</text>
        <text x="530" y="30" fontSize="10" fill="#525252" fontFamily="system-ui" letterSpacing="2">I2C BUS</text>
        <text x="770" y="30" fontSize="10" fill="#525252" fontFamily="system-ui" letterSpacing="2">DRIVERS</text>
        <text x="1020" y="30" fontSize="10" fill="#525252" fontFamily="system-ui" letterSpacing="2">MOTORS</text>

        {/* ============================================================ */}
        {/* CLIENT DEVICE */}
        {/* ============================================================ */}
        <g filter="url(#shadow)">
          {/* Phone/laptop shape */}
          <rect x="30" y="220" width="120" height="180" rx="12" fill="#18181b" stroke="#3f3f46" strokeWidth="1.5" />
          <rect x="38" y="236" width="104" height="148" rx="4" fill="#27272a" />
          {/* Screen content hint */}
          <rect x="44" y="242" width="92" height="10" rx="2" fill="#09090b" />
          <text x="90" y="250" textAnchor="middle" fontSize="7" fill="#a1a1aa" fontFamily="system-ui">AS120 Panel</text>
          <rect x="44" y="258" width="40" height="6" rx="1" fill="#27272a" stroke="#3f3f46" strokeWidth="0.5" />
          <rect x="44" y="268" width="40" height="6" rx="1" fill="#27272a" stroke="#3f3f46" strokeWidth="0.5" />
          <rect x="44" y="278" width="40" height="6" rx="1" fill="#27272a" stroke="#3f3f46" strokeWidth="0.5" />
          <rect x="44" y="288" width="40" height="6" rx="1" fill="#27272a" stroke="#3f3f46" strokeWidth="0.5" />
          {/* Notch */}
          <rect x="70" y="224" width="40" height="4" rx="2" fill="#3f3f46" />
        </g>

        {/* Protocol labels — HTTP */}
        <g>
          <line x1="150" y1="280" x2="220" y2="280" stroke="#34d399" strokeWidth="1.5" strokeDasharray="4,3">
            <animate attributeName="stroke-dashoffset" values="0;-7" dur="1s" repeatCount="indefinite" />
          </line>
          <rect x="158" y="266" width="50" height="14" rx="3" fill="#09090b" stroke="#34d399" strokeWidth="0.8" strokeOpacity="0.5" />
          <text x="183" y="276" textAnchor="middle" fontSize="8" fill="#34d399" fontFamily="ui-monospace, monospace">HTTP</text>
        </g>
        {/* Protocol labels — BLE */}
        <g>
          <line x1="150" y1="340" x2="220" y2="340" stroke="#60a5fa" strokeWidth="1.5" strokeDasharray="4,3">
            <animate attributeName="stroke-dashoffset" values="0;-7" dur="1.2s" repeatCount="indefinite" />
          </line>
          <rect x="158" y="326" width="38" height="14" rx="3" fill="#09090b" stroke="#60a5fa" strokeWidth="0.8" strokeOpacity="0.5" />
          <text x="177" y="336" textAnchor="middle" fontSize="8" fill="#60a5fa" fontFamily="ui-monospace, monospace">BLE</text>
        </g>

        {/* WiFi waves between client and ESP */}
        <g opacity="0.4">
          <path d="M148 300 Q155 290 162 300" stroke="#34d399" strokeWidth="1" fill="none">
            <animate attributeName="opacity" values="0.2;0.8;0.2" dur="2s" repeatCount="indefinite" />
          </path>
          <path d="M145 300 Q155 286 165 300" stroke="#34d399" strokeWidth="1" fill="none">
            <animate attributeName="opacity" values="0.2;0.8;0.2" dur="2s" begin="0.3s" repeatCount="indefinite" />
          </path>
        </g>

        {/* ============================================================ */}
        {/* ESP32-S3 MCU */}
        {/* ============================================================ */}
        <g filter="url(#shadow)">
          <rect x="220" y="120" width="180" height="480" rx="10" fill="#18181b" stroke="#3f3f46" strokeWidth="1.5" />
          {/* Title bar */}
          <rect x="220" y="120" width="180" height="36" rx="10" fill="#1e1e22" />
          <rect x="220" y="146" width="180" height="10" fill="#1e1e22" />
          <text x="310" y="143" textAnchor="middle" fontSize="12" fill="#fafafa" fontFamily="system-ui" fontWeight="700">ESP32-S3</text>
          {/* Chip icon */}
          <rect x="234" y="130" width="20" height="20" rx="3" fill="none" stroke="#a1a1aa" strokeWidth="0.8" />
          <rect x="240" y="136" width="8" height="8" rx="1" fill="#525252" />

          {/* WiFi + BLE Radio */}
          <rect x="236" y="170" width="148" height="40" rx="6" fill="#09090b" stroke="#3f3f46" strokeWidth="0.8" />
          <text x="310" y="184" textAnchor="middle" fontSize="9" fill="#a1a1aa" fontFamily="system-ui">WiFi + BLE Radio</text>
          <text x="310" y="200" textAnchor="middle" fontSize="7.5" fill="#525252" fontFamily="ui-monospace, monospace">NimBLE GATT Server</text>

          {/* HTTP Server */}
          <rect x="236" y="220" width="148" height="34" rx="6" fill="#09090b" stroke="#3f3f46" strokeWidth="0.8" />
          <text x="310" y="234" textAnchor="middle" fontSize="9" fill="#a1a1aa" fontFamily="system-ui">HTTP Server</text>
          <text x="310" y="246" textAnchor="middle" fontSize="7.5" fill="#525252" fontFamily="ui-monospace, monospace">REST API + SPIFFS</text>

          {/* I2C Master */}
          <rect x="236" y="264" width="148" height="40" rx="6" fill="#09090b" stroke="#a78bfa" strokeWidth="0.8" strokeOpacity="0.5" />
          <text x="310" y="280" textAnchor="middle" fontSize="9" fill="#c4b5fd" fontFamily="system-ui">I2C Master</text>
          <text x="310" y="294" textAnchor="middle" fontSize="7.5" fill="#525252" fontFamily="ui-monospace, monospace">SDA=21 SCL=20 100kHz</text>

          {/* GPIO section header */}
          <text x="310" y="324" textAnchor="middle" fontSize="8" fill="#525252" fontFamily="system-ui" letterSpacing="1">DIRECT GPIO</text>
          <line x1="250" y1="328" x2="370" y2="328" stroke="#3f3f46" strokeWidth="0.5" />

          {/* Main board GPIOs (LR motor) */}
          <rect x="236" y="336" width="148" height="52" rx="6" fill="#09090b" stroke="#fb923c" strokeWidth="0.8" strokeOpacity="0.4" />
          <text x="310" y="350" textAnchor="middle" fontSize="8" fill="#fb923c" fontFamily="system-ui">Main Board</text>
          <text x="310" y="362" textAnchor="middle" fontSize="7" fill="#525252" fontFamily="ui-monospace, monospace">STEP=35 DIR=34 HOME=33</text>
          <text x="310" y="378" textAnchor="middle" fontSize="7" fill="#71717a" fontFamily="system-ui">→ Left/Right motor</text>

          {/* Expansion board GPIOs (FB/UD/PL motors) */}
          <rect x="236" y="396" width="148" height="52" rx="6" fill="#09090b" stroke="#fb923c" strokeWidth="0.8" strokeOpacity="0.4" />
          <text x="310" y="410" textAnchor="middle" fontSize="8" fill="#fb923c" fontFamily="system-ui">Expansion Board</text>
          <text x="310" y="422" textAnchor="middle" fontSize="7" fill="#525252" fontFamily="ui-monospace, monospace">STEP=38 DIR=36 HOME=37</text>
          <text x="310" y="438" textAnchor="middle" fontSize="7" fill="#71717a" fontFamily="system-ui">→ FB, UD, Plunger motors</text>

          {/* Timer */}
          <rect x="236" y="460" width="148" height="32" rx="6" fill="#09090b" stroke="#3f3f46" strokeWidth="0.8" />
          <text x="310" y="476" textAnchor="middle" fontSize="9" fill="#a1a1aa" fontFamily="system-ui">Step Timer</text>
          <text x="310" y="488" textAnchor="middle" fontSize="7.5" fill="#525252" fontFamily="ui-monospace, monospace">10µs interrupt</text>

          {/* Status LED */}
          <rect x="236" y="502" width="148" height="26" rx="6" fill="#09090b" stroke="#3f3f46" strokeWidth="0.8" />
          <text x="280" y="519" textAnchor="middle" fontSize="8" fill="#71717a" fontFamily="system-ui">Status LED</text>
          <text x="350" y="519" textAnchor="middle" fontSize="7.5" fill="#525252" fontFamily="ui-monospace, monospace">GPIO 48</text>
          <circle cx="258" cy="515" r="3" fill="#34d399">
            <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
          </circle>

          {/* UART (legacy) */}
          <rect x="236" y="536" width="148" height="26" rx="6" fill="#09090b" stroke="#3f3f46" strokeWidth="0.8" />
          <text x="280" y="553" textAnchor="middle" fontSize="8" fill="#71717a" fontFamily="system-ui">UART (legacy)</text>
          <text x="355" y="553" textAnchor="middle" fontSize="7.5" fill="#525252" fontFamily="ui-monospace, monospace">TX=43 RX=44</text>
        </g>

        {/* ============================================================ */}
        {/* I2C BUS BACKBONE */}
        {/* ============================================================ */}
        {/* Vertical I2C bus line */}
        <line x1="520" y1="100" x2="520" y2="620" stroke="#a78bfa" strokeWidth="2" strokeOpacity="0.3" />
        <line x1="524" y1="100" x2="524" y2="620" stroke="#a78bfa" strokeWidth="2" strokeOpacity="0.3" />
        {/* Bus label */}
        <rect x="505" y="60" width="40" height="18" rx="4" fill="#09090b" stroke="#a78bfa" strokeWidth="0.8" strokeOpacity="0.5" />
        <text x="525" y="73" textAnchor="middle" fontSize="8" fill="#c4b5fd" fontFamily="ui-monospace, monospace">I2C</text>
        {/* Animated data pulses on bus */}
        <circle r="3" fill="#a78bfa" opacity="0">
          <animate attributeName="cy" values="120;600" dur="3s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.6;0" dur="3s" repeatCount="indefinite" />
          <animateTransform attributeName="transform" type="translate" values="522,0;522,0" dur="3s" repeatCount="indefinite" />
        </circle>

        {/* I2C connection from ESP to bus */}
        <line x1="384" y1="284" x2="518" y2="284" stroke="#a78bfa" strokeWidth="1.5" strokeDasharray="4,3" strokeOpacity="0.5">
          <animate attributeName="stroke-dashoffset" values="0;-7" dur="1s" repeatCount="indefinite" />
        </line>

        {/* ============================================================ */}
        {/* I2C DEVICES — MAIN BOARD */}
        {/* ============================================================ */}
        <text x="650" y="118" fontSize="9" fill="#525252" fontFamily="system-ui" letterSpacing="1">MAIN BOARD</text>
        <line x1="570" y1="122" x2="730" y2="122" stroke="#3f3f46" strokeWidth="0.5" />

        {/* TCA9535 @ 0x20 */}
        <g filter="url(#shadow)">
          <rect x="570" y="136" width="160" height="70" rx="8" fill="#18181b" stroke="#a78bfa" strokeWidth="1" strokeOpacity="0.4" />
          <text x="650" y="155" textAnchor="middle" fontSize="10" fill="#e2e8f0" fontFamily="system-ui" fontWeight="600">TCA9535</text>
          <text x="650" y="168" textAnchor="middle" fontSize="8" fill="#a78bfa" fontFamily="ui-monospace, monospace">addr 0x20</text>
          <text x="650" y="182" textAnchor="middle" fontSize="7" fill="#71717a" fontFamily="system-ui">16-bit GPIO Expander</text>
          <text x="650" y="196" textAnchor="middle" fontSize="7" fill="#525252" fontFamily="ui-monospace, monospace">EN M0 M1 NFLT DIS</text>
        </g>
        {/* Bus tap */}
        <line x1="526" y1="171" x2="570" y2="171" stroke="#a78bfa" strokeWidth="1" strokeOpacity="0.4" />
        <circle cx="522" cy="171" r="3" fill="#a78bfa" fillOpacity="0.6" />

        {/* DAC7574 @ 0x4C */}
        <g filter="url(#shadow)">
          <rect x="570" y="220" width="160" height="70" rx="8" fill="#18181b" stroke="#a78bfa" strokeWidth="1" strokeOpacity="0.4" />
          <text x="650" y="239" textAnchor="middle" fontSize="10" fill="#e2e8f0" fontFamily="system-ui" fontWeight="600">DAC7574</text>
          <text x="650" y="252" textAnchor="middle" fontSize="8" fill="#a78bfa" fontFamily="ui-monospace, monospace">addr 0x4C</text>
          <text x="650" y="266" textAnchor="middle" fontSize="7" fill="#71717a" fontFamily="system-ui">4-ch DAC → Current Limit</text>
          <text x="650" y="280" textAnchor="middle" fontSize="7" fill="#525252" fontFamily="ui-monospace, monospace">ch0 → LR motor</text>
        </g>
        {/* Bus tap */}
        <line x1="526" y1="255" x2="570" y2="255" stroke="#a78bfa" strokeWidth="1" strokeOpacity="0.4" />
        <circle cx="522" cy="255" r="3" fill="#a78bfa" fillOpacity="0.6" />

        {/* ============================================================ */}
        {/* I2C DEVICES — EXPANSION BOARD */}
        {/* ============================================================ */}
        <text x="650" y="330" fontSize="9" fill="#525252" fontFamily="system-ui" letterSpacing="1">EXPANSION BOARD</text>
        <line x1="570" y1="334" x2="730" y2="334" stroke="#3f3f46" strokeWidth="0.5" />

        {/* TCA9535 @ 0x25 */}
        <g filter="url(#shadow)">
          <rect x="570" y="348" width="160" height="70" rx="8" fill="#18181b" stroke="#a78bfa" strokeWidth="1" strokeOpacity="0.4" />
          <text x="650" y="367" textAnchor="middle" fontSize="10" fill="#e2e8f0" fontFamily="system-ui" fontWeight="600">TCA9535</text>
          <text x="650" y="380" textAnchor="middle" fontSize="8" fill="#a78bfa" fontFamily="ui-monospace, monospace">addr 0x25</text>
          <text x="650" y="394" textAnchor="middle" fontSize="7" fill="#71717a" fontFamily="system-ui">16-bit GPIO Expander</text>
          <text x="650" y="408" textAnchor="middle" fontSize="7" fill="#525252" fontFamily="ui-monospace, monospace">EN M0 M1 NFLT DIS ×3</text>
        </g>
        {/* Bus tap */}
        <line x1="526" y1="383" x2="570" y2="383" stroke="#a78bfa" strokeWidth="1" strokeOpacity="0.4" />
        <circle cx="522" cy="383" r="3" fill="#a78bfa" fillOpacity="0.6" />

        {/* DAC7574 @ 0x4D */}
        <g filter="url(#shadow)">
          <rect x="570" y="432" width="160" height="70" rx="8" fill="#18181b" stroke="#a78bfa" strokeWidth="1" strokeOpacity="0.4" />
          <text x="650" y="451" textAnchor="middle" fontSize="10" fill="#e2e8f0" fontFamily="system-ui" fontWeight="600">DAC7574</text>
          <text x="650" y="464" textAnchor="middle" fontSize="8" fill="#a78bfa" fontFamily="ui-monospace, monospace">addr 0x4D</text>
          <text x="650" y="478" textAnchor="middle" fontSize="7" fill="#71717a" fontFamily="system-ui">4-ch DAC → Current Limit</text>
          <text x="650" y="492" textAnchor="middle" fontSize="7" fill="#525252" fontFamily="ui-monospace, monospace">ch0=FB ch1=UD ch2=PL</text>
        </g>
        {/* Bus tap */}
        <line x1="526" y1="467" x2="570" y2="467" stroke="#a78bfa" strokeWidth="1" strokeOpacity="0.4" />
        <circle cx="522" cy="467" r="3" fill="#a78bfa" fillOpacity="0.6" />

        {/* ============================================================ */}
        {/* STEPPER DRIVERS (DRV8886AT) */}
        {/* ============================================================ */}

        {/* LR Driver */}
        <g filter="url(#shadow)">
          <rect x="800" y="160" width="140" height="80" rx="8" fill="#18181b" stroke="#fb923c" strokeWidth="1" strokeOpacity="0.4" />
          <text x="870" y="180" textAnchor="middle" fontSize="10" fill="#e2e8f0" fontFamily="system-ui" fontWeight="600">DRV8886AT</text>
          <text x="870" y="194" textAnchor="middle" fontSize="7.5" fill="#fb923c" fontFamily="system-ui">Left/Right Driver</text>
          <text x="870" y="210" textAnchor="middle" fontSize="7" fill="#525252" fontFamily="ui-monospace, monospace">Rref=15k Vref=1.232V</text>
          <text x="870" y="224" textAnchor="middle" fontSize="7" fill="#525252" fontFamily="ui-monospace, monospace">0.3A run / 0.05A idle</text>
        </g>
        {/* Connections to LR driver from GPIO expander and DAC */}
        <line x1="730" y1="171" x2="800" y2="185" stroke="#a78bfa" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="3,2" />
        <line x1="730" y1="255" x2="800" y2="210" stroke="#a78bfa" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="3,2" />
        {/* Step/Dir from ESP GPIO (main board) */}
        <path d="M384 362 Q450 362 450 200 Q450 190 800 190" stroke="#fb923c" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="3,2" />

        {/* FB Driver */}
        <g filter="url(#shadow)">
          <rect x="800" y="320" width="140" height="68" rx="8" fill="#18181b" stroke="#fb923c" strokeWidth="1" strokeOpacity="0.4" />
          <text x="870" y="340" textAnchor="middle" fontSize="10" fill="#e2e8f0" fontFamily="system-ui" fontWeight="600">DRV8886AT</text>
          <text x="870" y="354" textAnchor="middle" fontSize="7.5" fill="#fb923c" fontFamily="system-ui">Fwd/Back Driver</text>
          <text x="870" y="370" textAnchor="middle" fontSize="7" fill="#525252" fontFamily="ui-monospace, monospace">0.3A run / 0.05A idle</text>
        </g>

        {/* UD Driver */}
        <g filter="url(#shadow)">
          <rect x="800" y="400" width="140" height="68" rx="8" fill="#18181b" stroke="#fb923c" strokeWidth="1" strokeOpacity="0.4" />
          <text x="870" y="420" textAnchor="middle" fontSize="10" fill="#e2e8f0" fontFamily="system-ui" fontWeight="600">DRV8886AT</text>
          <text x="870" y="434" textAnchor="middle" fontSize="7.5" fill="#fb923c" fontFamily="system-ui">Up/Down Driver</text>
          <text x="870" y="450" textAnchor="middle" fontSize="7" fill="#525252" fontFamily="ui-monospace, monospace">0.3A run / 0.05A idle</text>
        </g>

        {/* PL Driver */}
        <g filter="url(#shadow)">
          <rect x="800" y="480" width="140" height="68" rx="8" fill="#18181b" stroke="#fb923c" strokeWidth="1" strokeOpacity="0.4" />
          <text x="870" y="500" textAnchor="middle" fontSize="10" fill="#e2e8f0" fontFamily="system-ui" fontWeight="600">DRV8886AT</text>
          <text x="870" y="514" textAnchor="middle" fontSize="7.5" fill="#fb923c" fontFamily="system-ui">Plunger Driver</text>
          <text x="870" y="530" textAnchor="middle" fontSize="7" fill="#525252" fontFamily="ui-monospace, monospace">0.3A / max 400 sps</text>
        </g>

        {/* Connections from expander/DAC to expansion drivers */}
        <line x1="730" y1="383" x2="800" y2="370" stroke="#a78bfa" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="3,2" />
        <line x1="730" y1="383" x2="800" y2="430" stroke="#a78bfa" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="3,2" />
        <line x1="730" y1="383" x2="800" y2="510" stroke="#a78bfa" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="3,2" />
        <line x1="730" y1="467" x2="800" y2="354" stroke="#a78bfa" strokeWidth="1" strokeOpacity="0.2" strokeDasharray="3,2" />
        <line x1="730" y1="467" x2="800" y2="434" stroke="#a78bfa" strokeWidth="1" strokeOpacity="0.2" strokeDasharray="3,2" />
        <line x1="730" y1="467" x2="800" y2="514" stroke="#a78bfa" strokeWidth="1" strokeOpacity="0.2" strokeDasharray="3,2" />

        {/* Step/Dir from ESP GPIO (expansion board) */}
        <path d="M384 422 Q470 422 470 354 L800 354" stroke="#fb923c" strokeWidth="1" strokeOpacity="0.25" strokeDasharray="3,2" />
        <path d="M384 422 Q470 422 470 434 L800 434" stroke="#fb923c" strokeWidth="1" strokeOpacity="0.25" strokeDasharray="3,2" />
        <path d="M384 422 Q470 422 470 514 L800 514" stroke="#fb923c" strokeWidth="1" strokeOpacity="0.25" strokeDasharray="3,2" />

        {/* ============================================================ */}
        {/* STEPPER MOTORS */}
        {/* ============================================================ */}

        {/* LR Motor */}
        <g filter="url(#shadow)">
          <rect x="1010" y="162" width="140" height="76" rx="8" fill="#18181b" stroke="#34d399" strokeWidth="1" strokeOpacity="0.4" />
          <circle cx="1042" cy="200" r="16" fill="none" stroke="#34d399" strokeWidth="1.5" strokeOpacity="0.5">
            <animateTransform attributeName="transform" type="rotate" values="0 1042 200;360 1042 200" dur="4s" repeatCount="indefinite" />
          </circle>
          <circle cx="1042" cy="200" r="3" fill="#34d399" fillOpacity="0.6" />
          <line x1="1042" y1="200" x2="1042" y2="186" stroke="#34d399" strokeWidth="1.5" strokeOpacity="0.6">
            <animateTransform attributeName="transform" type="rotate" values="0 1042 200;360 1042 200" dur="4s" repeatCount="indefinite" />
          </line>
          <text x="1100" y="188" textAnchor="middle" fontSize="11" fill="#fafafa" fontFamily="system-ui" fontWeight="600">LR</text>
          <text x="1100" y="202" textAnchor="middle" fontSize="8" fill="#71717a" fontFamily="system-ui">Left / Right</text>
          <text x="1100" y="216" textAnchor="middle" fontSize="7" fill="#525252" fontFamily="ui-monospace, monospace">¼ step, inv dir</text>
          <text x="1100" y="228" textAnchor="middle" fontSize="7" fill="#525252" fontFamily="ui-monospace, monospace">100-2000 sps</text>
        </g>
        <line x1="940" y1="200" x2="1010" y2="200" stroke="#34d399" strokeWidth="1.5" strokeOpacity="0.3" />

        {/* FB Motor */}
        <g filter="url(#shadow)">
          <rect x="1010" y="322" width="140" height="64" rx="8" fill="#18181b" stroke="#34d399" strokeWidth="1" strokeOpacity="0.4" />
          <circle cx="1042" cy="354" r="14" fill="none" stroke="#34d399" strokeWidth="1.5" strokeOpacity="0.5">
            <animateTransform attributeName="transform" type="rotate" values="0 1042 354;360 1042 354" dur="3s" repeatCount="indefinite" />
          </circle>
          <circle cx="1042" cy="354" r="3" fill="#34d399" fillOpacity="0.6" />
          <line x1="1042" y1="354" x2="1042" y2="342" stroke="#34d399" strokeWidth="1.5" strokeOpacity="0.6">
            <animateTransform attributeName="transform" type="rotate" values="0 1042 354;360 1042 354" dur="3s" repeatCount="indefinite" />
          </line>
          <text x="1100" y="349" textAnchor="middle" fontSize="11" fill="#fafafa" fontFamily="system-ui" fontWeight="600">FB</text>
          <text x="1100" y="363" textAnchor="middle" fontSize="8" fill="#71717a" fontFamily="system-ui">Fwd / Back</text>
          <text x="1100" y="377" textAnchor="middle" fontSize="7" fill="#525252" fontFamily="ui-monospace, monospace">¼ step, inv dir</text>
        </g>
        <line x1="940" y1="354" x2="1010" y2="354" stroke="#34d399" strokeWidth="1.5" strokeOpacity="0.3" />

        {/* UD Motor */}
        <g filter="url(#shadow)">
          <rect x="1010" y="400" width="140" height="64" rx="8" fill="#18181b" stroke="#34d399" strokeWidth="1" strokeOpacity="0.4" />
          <circle cx="1042" cy="432" r="14" fill="none" stroke="#34d399" strokeWidth="1.5" strokeOpacity="0.5">
            <animateTransform attributeName="transform" type="rotate" values="0 1042 432;360 1042 432" dur="5s" repeatCount="indefinite" />
          </circle>
          <circle cx="1042" cy="432" r="3" fill="#34d399" fillOpacity="0.6" />
          <line x1="1042" y1="432" x2="1042" y2="420" stroke="#34d399" strokeWidth="1.5" strokeOpacity="0.6">
            <animateTransform attributeName="transform" type="rotate" values="0 1042 432;360 1042 432" dur="5s" repeatCount="indefinite" />
          </line>
          <text x="1100" y="427" textAnchor="middle" fontSize="11" fill="#fafafa" fontFamily="system-ui" fontWeight="600">UD</text>
          <text x="1100" y="441" textAnchor="middle" fontSize="8" fill="#71717a" fontFamily="system-ui">Up / Down</text>
          <text x="1100" y="455" textAnchor="middle" fontSize="7" fill="#525252" fontFamily="ui-monospace, monospace">¼ step</text>
        </g>
        <line x1="940" y1="434" x2="1010" y2="434" stroke="#34d399" strokeWidth="1.5" strokeOpacity="0.3" />

        {/* PL Motor */}
        <g filter="url(#shadow)">
          <rect x="1010" y="480" width="140" height="64" rx="8" fill="#18181b" stroke="#34d399" strokeWidth="1" strokeOpacity="0.4" />
          <circle cx="1042" cy="512" r="14" fill="none" stroke="#34d399" strokeWidth="1.5" strokeOpacity="0.5">
            <animateTransform attributeName="transform" type="rotate" values="0 1042 512;360 1042 512" dur="6s" repeatCount="indefinite" />
          </circle>
          <circle cx="1042" cy="512" r="3" fill="#34d399" fillOpacity="0.6" />
          <line x1="1042" y1="512" x2="1042" y2="500" stroke="#34d399" strokeWidth="1.5" strokeOpacity="0.6">
            <animateTransform attributeName="transform" type="rotate" values="0 1042 512;360 1042 512" dur="6s" repeatCount="indefinite" />
          </line>
          <text x="1100" y="507" textAnchor="middle" fontSize="11" fill="#fafafa" fontFamily="system-ui" fontWeight="600">PL</text>
          <text x="1100" y="521" textAnchor="middle" fontSize="8" fill="#71717a" fontFamily="system-ui">Plunger</text>
          <text x="1100" y="535" textAnchor="middle" fontSize="7" fill="#525252" fontFamily="ui-monospace, monospace">¼ step, max 400 sps</text>
        </g>
        <line x1="940" y1="514" x2="1010" y2="514" stroke="#34d399" strokeWidth="1.5" strokeOpacity="0.3" />

        {/* ============================================================ */}
        {/* LEGEND */}
        {/* ============================================================ */}
        <g transform="translate(30, 620)">
          <rect width="340" height="80" rx="8" fill="#18181b" stroke="#3f3f46" strokeWidth="0.8" />
          <text x="16" y="20" fontSize="9" fill="#71717a" fontFamily="system-ui" fontWeight="600">Signal Types</text>

          <line x1="16" y1="38" x2="40" y2="38" stroke="#34d399" strokeWidth="1.5" strokeDasharray="4,3" />
          <text x="48" y="42" fontSize="8" fill="#71717a" fontFamily="system-ui">WiFi / HTTP</text>

          <line x1="120" y1="38" x2="144" y2="38" stroke="#60a5fa" strokeWidth="1.5" strokeDasharray="4,3" />
          <text x="152" y="42" fontSize="8" fill="#71717a" fontFamily="system-ui">BLE (setup only)</text>

          <line x1="16" y1="58" x2="40" y2="58" stroke="#a78bfa" strokeWidth="1.5" strokeDasharray="4,3" />
          <text x="48" y="62" fontSize="8" fill="#71717a" fontFamily="system-ui">I2C (config/current)</text>

          <line x1="160" y1="58" x2="184" y2="58" stroke="#fb923c" strokeWidth="1.5" strokeDasharray="3,2" />
          <text x="192" y="62" fontSize="8" fill="#71717a" fontFamily="system-ui">GPIO (step/dir/home)</text>
        </g>
      </svg>
    </div>
  );
}
