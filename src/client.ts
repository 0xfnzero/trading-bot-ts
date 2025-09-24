import axios, { AxiosInstance } from 'axios';
import { HealthResponse, TradeResponse, BuyRequest, SellRequest, DexParams } from './types';

export class TradingProxyClient {
  private client: AxiosInstance;

  constructor(baseURL?: string) {
    const url = baseURL || process.env.HTTP_API_URL || 'http://localhost:3000';
    const timeout = parseInt(process.env.REQUEST_TIMEOUT || '30000');

    this.client = axios.create({
      baseURL: url,
      timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async health(): Promise<HealthResponse> {
    const response = await this.client.get<HealthResponse>('/health');
    return response.data;
  }

  async buy(dexParams: DexParams, request: BuyRequest): Promise<TradeResponse> {
    const response = await this.client.post<TradeResponse>('/api/buy', {
      ...dexParams,
      ...request,
    });
    return response.data;
  }

  async sell(dexParams: DexParams, request: SellRequest): Promise<TradeResponse> {
    const response = await this.client.post<TradeResponse>('/api/sell', {
      ...dexParams,
      ...request,
    });
    return response.data;
  }
}
