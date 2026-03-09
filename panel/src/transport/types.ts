export interface MotorStatus {
  name: string;
  index: number;
  position: number;
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

export interface AS120Status {
  version: string;
  fault_code: number;
  fault_message?: string;
  motors: MotorStatus[];
  wifi?: WifiStatus;
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

export interface Transport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): Promise<AS120Status>;
  moveMotor(index: number, position: number): Promise<void>;
  jogMotor(index: number, steps: number): Promise<void>;
  homeMotor(index: number): Promise<void>;
  homeAll(): Promise<void>;
  setMotorConfig(index: number, config: Partial<MotorConfig>): Promise<void>;
  wifiScan(): Promise<WifiNetwork[]>;
  wifiConnect(ssid: string, password: string): Promise<void>;
  onStatusUpdate(callback: (status: AS120Status) => void): () => void;
  readonly connected: boolean;
  readonly type: "http" | "ble";
}
