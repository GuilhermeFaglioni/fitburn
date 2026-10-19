import {
  createConnection,
  createServer,
  type AddressInfo,
  type Server,
  type Socket,
} from "node:net";

interface ProxyConnection {
  client: Socket;
  upstream: Socket;
  bufferedResponses: Buffer[];
}

export class PostgresTcpProxy {
  private readonly databaseUrl: URL;
  private readonly server: Server;
  private readonly connections = new Set<ProxyConnection>();
  private available = true;
  private responsesPaused = false;

  constructor(databaseUrl: string) {
    this.databaseUrl = new URL(databaseUrl);

    const databaseName = decodeURIComponent(this.databaseUrl.pathname.slice(1));
    if (
      !/^fitburn_test(?:_[a-zA-Z0-9-]+)?$/.test(databaseName) ||
      !["localhost", "127.0.0.1"].includes(this.databaseUrl.hostname)
    ) {
      throw new Error("Health tests require a local test database.");
    }

    this.server = createServer((client) => this.forwardConnection(client));
  }

  get connectionString(): string {
    const address = this.server.address();
    if (!address || typeof address === "string") {
      throw new Error("PostgreSQL test proxy is not listening.");
    }

    const proxyUrl = new URL(this.databaseUrl);
    proxyUrl.hostname = "127.0.0.1";
    proxyUrl.port = String((address as AddressInfo).port);
    return proxyUrl.toString();
  }

  async listen(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", resolve);
    });
  }

  setAvailable(available: boolean): void {
    this.available = available;

    if (!available) {
      for (const connection of this.connections) {
        connection.client.destroy();
        connection.upstream.destroy();
      }
    }
  }

  pauseResponses(): void {
    this.responsesPaused = true;
    for (const connection of this.connections) connection.upstream.pause();
  }

  resumeResponses(): void {
    this.responsesPaused = false;
    for (const connection of this.connections) {
      for (const response of connection.bufferedResponses) connection.client.write(response);
      connection.bufferedResponses = [];
      connection.upstream.resume();
    }
  }

  async close(): Promise<void> {
    this.setAvailable(false);
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  private forwardConnection(client: Socket): void {
    if (!this.available) {
      client.destroy();
      return;
    }

    const upstream = createConnection({
      host: this.databaseUrl.hostname,
      port: Number(this.databaseUrl.port || 5432),
    });
    const connection: ProxyConnection = { client, upstream, bufferedResponses: [] };
    this.connections.add(connection);
    client.pause();

    upstream.once("connect", () => {
      client.pipe(upstream);
      client.resume();
    });
    upstream.on("data", (response: Buffer) => {
      if (this.responsesPaused) {
        connection.bufferedResponses.push(response);
        upstream.pause();
        return;
      }

      client.write(response);
    });
    upstream.on("error", () => client.destroy());
    client.on("error", () => upstream.destroy());
    client.on("close", () => {
      this.connections.delete(connection);
      upstream.destroy();
    });
    upstream.on("close", () => {
      this.connections.delete(connection);
      client.destroy();
    });
  }
}
