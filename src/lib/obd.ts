/// <reference types="web-bluetooth" />

import type { ObdSnapshot } from "./types";

const NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_WRITE = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_NOTIFY = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
const FFE_SERVICE = "0000ffe0-0000-1000-8000-00805f9b34fb";
const FFE_CHARACTERISTIC = "0000ffe1-0000-1000-8000-00805f9b34fb";

type GattCharacteristic = BluetoothRemoteGATTCharacteristic;

interface PendingCommand {
  resolve: (response: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const EMPTY_SNAPSHOT: ObdSnapshot = {
  maf: null,
  fuel_rate: null,
  speed: null,
  rpm: null,
  supported: { maf: false, fuelRate: false, speed: false, rpm: false },
};

export class Elm327BluetoothClient {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private writeCharacteristic: GattCharacteristic | null = null;
  private notifyCharacteristic: GattCharacteristic | null = null;
  private buffer = "";
  private pending: PendingCommand[] = [];
  private connected = false;
  private readonly decoder = new TextDecoder();
  private readonly encoder = new TextEncoder();

  get isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    if (typeof navigator === "undefined" || !("bluetooth" in navigator)) {
      throw new Error(
        "Web Bluetooth is not supported in this browser. Use Chrome or Edge over HTTPS.",
      );
    }

    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [NUS_SERVICE, FFE_SERVICE],
    });

    const server = await device.gatt?.connect();
    if (!server) throw new Error("Could not connect to the adapter.");

    this.device = device;
    this.server = server;
    this.buffer = "";

    await this.findCharacteristics(server);

    if (!this.notifyCharacteristic || !this.writeCharacteristic) {
      throw new Error(
        "No compatible UART service found. Expected Nordic UART or FFE0.",
      );
    }

    this.notifyCharacteristic.addEventListener(
      "characteristicvaluechanged",
      this.handleValueChanged,
    );
    await this.notifyCharacteristic.startNotifications();
    device.addEventListener("gattserverdisconnected", this.handleDisconnected);
    this.connected = true;

    // Standard ELM327 BLE init sequence.
    await this.sendCommand("ATZ", 8000);
    await this.sendCommand("ATE0", 3000);
    await this.sendCommand("ATSP0", 10000);
  }

  private async findCharacteristics(server: BluetoothRemoteGATTServer) {
    try {
      const service = await server.getPrimaryService(NUS_SERVICE);
      this.writeCharacteristic = await service.getCharacteristic(NUS_WRITE);
      this.notifyCharacteristic = await service.getCharacteristic(NUS_NOTIFY);
      return;
    } catch {
      this.writeCharacteristic = null;
      this.notifyCharacteristic = null;
    }

    const ffeService = await server.getPrimaryService(FFE_SERVICE);
    const characteristic = await ffeService.getCharacteristic(
      FFE_CHARACTERISTIC,
    );
    this.writeCharacteristic = characteristic;
    this.notifyCharacteristic = characteristic;
  }

  private handleValueChanged = (event: Event) => {
    const characteristic = event.target as GattCharacteristic | null;
    const value = characteristic?.value;
    if (!value) return;

    const bytes = value.buffer.slice(
      value.byteOffset,
      value.byteOffset + value.byteLength,
    );
    this.buffer += this.decoder.decode(bytes);
    this.flushPrompt();
  };

  private flushPrompt() {
    const promptIndex = this.buffer.indexOf(">");
    if (promptIndex === -1 || this.pending.length === 0) return;

    const response = this.buffer.slice(0, promptIndex);
    this.buffer = this.buffer.slice(promptIndex + 1);
    const command = this.pending.shift();
    if (!command) return;

    clearTimeout(command.timer);
    command.resolve(response);
  }

  private handleDisconnected = () => {
    this.connected = false;
    this.buffer = "";
    for (const command of this.pending.splice(0)) {
      clearTimeout(command.timer);
      command.reject(new Error("OBD adapter disconnected."));
    }
  };

  async sendCommand(command: string, timeoutMs = 3500): Promise<string> {
    if (!this.writeCharacteristic || !this.connected) {
      throw new Error("OBD adapter is not connected.");
    }

    const response = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = this.pending.filter((item) => item.timer !== timer);
        reject(new Error(`Timed out waiting for ${command}.`));
      }, timeoutMs);
      this.pending.push({ resolve, reject, timer });
    });

    const bytes = this.encoder.encode(`${command}\r`);
    try {
      if (typeof this.writeCharacteristic.writeValueWithoutResponse === "function") {
        await this.writeCharacteristic.writeValueWithoutResponse(bytes);
      } else {
        await this.writeCharacteristic.writeValue(bytes);
      }
    } catch (error) {
      const commandPending = this.pending.pop();
      if (commandPending) clearTimeout(commandPending.timer);
      throw error;
    }

    return response;
  }

  private async readPid(
    pid: string,
    parse: (a: number, b: number) => number,
  ): Promise<number | null> {
    const response = await this.sendCommand(`01${pid}`);
    const upper = response.toUpperCase();

    if (
      /NO DATA|STOPPED|CAN ERROR|BUS INIT|ERROR|UNABLE/i.test(upper) ||
      !/41/.test(upper)
    ) {
      return null;
    }

    const compact = upper.replace(/\s+/g, " ");
    const match = compact.match(
      new RegExp(`41\\s*0?${pid}\\s*([0-9A-F]{2})\\s*([0-9A-F]{2})`),
    );
    if (!match) return null;

    const value = parse(
      Number.parseInt(match[1], 16),
      Number.parseInt(match[2], 16),
    );
    return Number.isFinite(value) ? value : null;
  }

  async readSnapshot(): Promise<ObdSnapshot> {
    if (!this.connected) return EMPTY_SNAPSHOT;

    const supported = { ...EMPTY_SNAPSHOT.supported };
    const snapshot: ObdSnapshot = {
      maf: null,
      fuel_rate: null,
      speed: null,
      rpm: null,
      supported,
    };

    const queries: Array<{
      key: keyof Omit<ObdSnapshot, "supported">;
      pid: string;
      parse: (a: number, b: number) => number;
    }> = [
      { key: "maf", pid: "10", parse: (a, b) => (a * 256 + b) / 100 },
      { key: "fuel_rate", pid: "5E", parse: (a, b) => (a * 256 + b) / 50 },
      { key: "speed", pid: "0D", parse: (a) => a },
      { key: "rpm", pid: "0C", parse: (a, b) => (a * 256 + b) / 4 },
    ];

    for (const query of queries) {
      try {
        const value = await this.readPid(query.pid, query.parse);
        snapshot[query.key] = value;
        if (value !== null) {
          supported[
            query.key === "fuel_rate" ? "fuelRate" : (query.key as keyof typeof supported)
          ] = true;
        }
      } catch {
        // Unsupported PIDs and timeouts are skipped, not fatal.
        snapshot[query.key] = null;
      }
    }

    return snapshot;
  }

  disconnect(): void {
    if (this.notifyCharacteristic) {
      this.notifyCharacteristic.removeEventListener(
        "characteristicvaluechanged",
        this.handleValueChanged,
      );
      try {
        void this.notifyCharacteristic.stopNotifications();
      } catch {
        // Characteristic may already be gone after a disconnect.
      }
    }
    if (this.device) {
      this.device.removeEventListener(
        "gattserverdisconnected",
        this.handleDisconnected,
      );
      if (this.device.gatt?.connected) this.device.gatt.disconnect();
    }
    this.handleDisconnected();
    this.device = null;
    this.server = null;
    this.writeCharacteristic = null;
    this.notifyCharacteristic = null;
  }
}
