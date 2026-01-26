declare module "osc" {
  interface UDPPortOptions {
    localAddress?: string;
    localPort?: number;
    remoteAddress?: string;
    remotePort?: number;
    metadata?: boolean;
  }

  interface OSCMessage {
    address: string;
    args: Array<{ type: string; value: any }>;
  }

  class UDPPort {
    constructor(options: UDPPortOptions);
    open(): void;
    close(): void;
    send(message: { address: string; args?: any[] }): void;
    on(event: "ready", callback: () => void): void;
    on(event: "error", callback: (error: Error) => void): void;
    on(event: "message", callback: (message: OSCMessage) => void): void;
  }

  export default {
    UDPPort
  };
}
