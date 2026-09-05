// ============================================================
// Serial Adapter — Stub for future hardware controllers
// ============================================================

// This module is a placeholder for future Web Serial API integration
// with hardware controllers (Arduino/Raspberry Pi based game pads)

export class SerialAdapter {
  private port: any = null;
  private reader: any = null;
  private connected: boolean = false;

  async connect(): Promise<boolean> {
    if (!('serial' in navigator)) {
      console.log('Web Serial API not supported');
      return false;
    }

    try {
      // @ts-ignore — Web Serial API
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: 9600 });
      this.connected = true;
      console.log('🎮 Hardware controller connected');
      return true;
    } catch (err) {
      console.log('Serial connection failed:', err);
      return false;
    }
  }

  disconnect(): void {
    if (this.port) {
      this.port.close();
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}
