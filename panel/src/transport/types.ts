export interface MotorStatus {
  name: string;
  index: number;
  position: number;
  target: number;
  is_home: boolean;
  speed_min: number;
  speed_max: number;
  max_acceleration: number;
  step_size: number;
}

export interface WifiStatus {
  connected: boolean;
  ap_mode: boolean;
  ssid: string;
  ip: string;
}

export interface QueuedAction {
  motor: string;
  motor_idx: number;
  type: "absolute" | "increment" | "decrement";
  target: number;
  position?: number; // only present on active action
  active: boolean;
}

export interface SerialLogEntry {
  t: number;     // timestamp ms since boot
  dir: "rx" | "tx";
  hex: string;
  len: number;
}

export interface SerialLog {
  seq: number;
  entries: SerialLogEntry[];
}

export interface FwLogEntry {
  t: number;     // timestamp ms since boot
  msg: string;   // formatted log message
}

export interface FwLog {
  seq: number;
  entries: FwLogEntry[];
}

export interface CompletedAction {
  motor: string;
  motor_idx: number;
  type: "absolute" | "increment" | "decrement";
  target: number;
}

export interface AS120Status {
  version: string;
  fault_code: number;
  fault_message?: string;
  motors: MotorStatus[];
  wifi?: WifiStatus;
  history?: CompletedAction[];
  queue?: QueuedAction[];
  serial?: SerialLog;
  logs?: FwLog;
}

export interface MotorConfig {
  speed_min: number;
  speed_max: number;
  max_acceleration: number;
  step_size: number;
}

export interface WifiNetwork {
  ssid: string;
  rssi: number;
}

export interface CommPacket {
  id: number;
  timestamp: number;
  direction: "out" | "in";
  method: string;
  endpoint: string;
  body?: string;
  status?: number;
  error?: string;
}

export interface Transport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): Promise<AS120Status>;
  moveMotor(index: number, position: number): Promise<void>;
  jogMotor(index: number, steps: number): Promise<void>;
  homeMotor(index: number): Promise<void>;
  homeAll(): Promise<void>;
  clearQueue(): Promise<void>;
  setMotorConfig(index: number, config: Partial<MotorConfig>): Promise<void>;
  wifiScan(): Promise<WifiNetwork[]>;
  wifiConnect(ssid: string, password: string): Promise<void>;
  wifiReset(): Promise<void>;
  onStatusUpdate(callback: (status: AS120Status) => void): () => void;
  readonly connected: boolean;
  readonly type: "http" | "ble";
}
