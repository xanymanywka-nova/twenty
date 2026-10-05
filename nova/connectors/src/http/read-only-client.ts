export type HttpTransport = typeof fetch;

export class ReadOnlyHttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly headers: Record<string, string> = {},
    private readonly transport: HttpTransport = fetch,
  ) {}

  async request<TData>(path: string, method = 'GET'): Promise<TData> {
    if (method !== 'GET') {
      throw new Error(`Read-only source client rejected ${method}`);
    }
    const response = await this.transport(new URL(path, this.baseUrl), {
      method: 'GET',
      headers: this.headers,
    });
    if (!response.ok) {
      throw new Error(
        `GET ${path} failed with ${response.status}: ${(await response.text()).slice(0, 500)}`,
      );
    }
    return (await response.json()) as TData;
  }

  get<TData>(path: string): Promise<TData> {
    return this.request<TData>(path);
  }
}
