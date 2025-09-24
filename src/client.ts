import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import {
  BuyRequest,
  SellRequest,
  TradeResponse,
  ErrorResponse,
  HealthResponse,
  DexParams,
} from './types';

export interface ClientConfig {
  baseURL?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export class TradingProxyClient {
  private readonly client: AxiosInstance;
  private readonly config: Required<ClientConfig>;

  constructor(config: ClientConfig = {}) {
    this.config = {
      baseURL: config.baseURL ?? 'http://localhost:3000',
      timeout: config.timeout ?? 30000,
      retries: config.retries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
    };

    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'trading-proxy-client/1.0.0',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const config = error.config as AxiosRequestConfig & { _retry?: number };

        if (!config || config._retry === undefined) {
          config._retry = 0;
        }

        if (config._retry < this.config.retries && this.shouldRetry(error)) {
          config._retry++;
          await this.delay(this.config.retryDelay * config._retry);
          return this.client(config);
        }

        return Promise.reject(error);
      }
    );
  }

  private shouldRetry(error: AxiosError): boolean {
    return (
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      (error.response?.status !== undefined && error.response.status >= 500)
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async health(): Promise<HealthResponse> {
    try {
      const response = await this.client.get<HealthResponse>('/health');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async buy(dexParams: DexParams, request: BuyRequest): Promise<TradeResponse> {
    return this.executeTrade('/api/buy', { ...dexParams, ...request });
  }

  async sell(dexParams: DexParams, request: SellRequest): Promise<TradeResponse> {
    return this.executeTrade('/api/sell', { ...dexParams, ...request });
  }

  private async executeTrade(endpoint: string, payload: any): Promise<TradeResponse> {
    try {
      const response = await this.client.post<TradeResponse>(endpoint, payload);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private handleError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<ErrorResponse>;

      if (axiosError.response?.data?.error) {
        return new Error(`Trading error: ${axiosError.response.data.error}`);
      }

      if (axiosError.code === 'ECONNREFUSED') {
        return new Error('Cannot connect to trading proxy server. Please check if the server is running.');
      }

      if (axiosError.code === 'ETIMEDOUT') {
        return new Error('Request timed out. The trading server may be overloaded.');
      }

      return new Error(`Network error: ${axiosError.message}`);
    }

    return error instanceof Error ? error : new Error('Unknown error occurred');
  }

  get isHealthy(): Promise<boolean> {
    return this.health()
      .then(() => true)
      .catch(() => false);
  }

  destroy(): void {
    // Clean up any pending requests
    this.client.interceptors.request.clear();
    this.client.interceptors.response.clear();
  }
}

export default TradingProxyClient;