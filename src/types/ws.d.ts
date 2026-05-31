declare module 'ws' {
  import { Server as HttpServer } from 'http';
  import { Duplex } from 'stream';

  export class WebSocket extends Duplex {
    static CONNECTING: number;
    static OPEN: number;
    static CLOSING: number;
    static CLOSED: number;
    readyState: number;
    on(event: 'message', listener: (data: Buffer, isBinary: boolean) => void): this;
    on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'open', listener: () => void): this;
    on(event: string, listener: Function): this;
    send(data: string | Buffer | ArrayBuffer | Buffer[], cb?: (err?: Error) => void): void;
    close(code?: number, data?: string | Buffer): void;
    terminate(): void;
    ping(data?: any, mask?: boolean, cb?: (err: Error) => void): void;
  }

  export interface WebSocketServerOptions {
    host?: string;
    port?: number;
    backlog?: number;
    server?: HttpServer;
    path?: string;
    noServer?: boolean;
    clientTracking?: boolean;
    perMessageDeflate?: boolean;
    maxPayload?: number;
    skipUTF8Validation?: boolean;
  }

  export class WebSocketServer {
    constructor(options?: WebSocketServerOptions);
    on(event: 'connection', listener: (ws: WebSocket, req: any) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: string, listener: Function): this;
    clients: Set<WebSocket>;
    close(): void;
  }
}
