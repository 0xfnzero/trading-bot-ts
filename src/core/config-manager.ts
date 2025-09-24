import * as fs from 'fs';
import * as path from 'path';
import { BotConfig } from './bot';

export class ConfigManager {
  private configPath: string;
  private config: BotConfig;

  constructor(configPath: string = './bot-config.json') {
    this.configPath = configPath;
    this.loadConfig();
  }

  /** 加载配置 */
  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf-8');
        this.config = JSON.parse(configData);
      } else {
        this.config = this.getDefaultConfig();
        this.saveConfig();
      }

      // 应用环境变量覆盖
      this.applyEnvOverrides();
    } catch (error) {
      console.error('Failed to load config:', error);
      this.config = this.getDefaultConfig();
    }
  }

  /** 应用环境变量覆盖 */
  private applyEnvOverrides(): void {
    if (process.env.HTTP_API_URL) {
      this.config.httpUrl = process.env.HTTP_API_URL;
    }

    if (process.env.WS_URL) {
      this.config.wsUrl = process.env.WS_URL;
    }

    if (process.env.DRY_RUN) {
      this.config.global.dryRun = process.env.DRY_RUN === 'true';
    }

    if (process.env.EMERGENCY_STOP) {
      this.config.global.emergencyStop = process.env.EMERGENCY_STOP === 'true';
    }

    if (process.env.MAX_TOTAL_POSITIONS) {
      this.config.global.maxTotalPositions = parseInt(process.env.MAX_TOTAL_POSITIONS);
    }

    if (process.env.MAX_TOTAL_INVESTMENT) {
      this.config.global.maxTotalInvestment = parseFloat(process.env.MAX_TOTAL_INVESTMENT);
    }
  }

  /** 获取默认配置 */
  private getDefaultConfig(): BotConfig {
    return {
      httpUrl: 'http://localhost:3000',
      wsUrl: 'ws://127.0.0.1:9001',
      global: {
        maxTotalPositions: 10,
        maxTotalInvestment: 1.0, // 1 SOL
        emergencyStop: false,
        dryRun: true, // 默认干运行模式
      },
      riskManagement: {
        maxDailyLoss: 0.1, // 10%
        maxConsecutiveLosses: 5,
        pauseAfterLoss: 300, // 5分钟
      },
    };
  }

  /** 保存配置 */
  saveConfig(): void {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  /** 获取配置 */
  getConfig(): BotConfig {
    return { ...this.config };
  }

  /** 更新配置 */
  updateConfig(updates: Partial<BotConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
  }

  /** 重置为默认配置 */
  resetToDefault(): void {
    this.config = this.getDefaultConfig();
    this.saveConfig();
  }

  /** 验证配置 */
  validateConfig(): string[] {
    const errors: string[] = [];

    if (!this.config.httpUrl) {
      errors.push('HTTP URL is required');
    }

    if (!this.config.wsUrl) {
      errors.push('WebSocket URL is required');
    }

    if (this.config.global.maxTotalPositions <= 0) {
      errors.push('Max total positions must be positive');
    }

    if (this.config.global.maxTotalInvestment <= 0) {
      errors.push('Max total investment must be positive');
    }

    if (this.config.riskManagement.maxDailyLoss <= 0 || this.config.riskManagement.maxDailyLoss > 1) {
      errors.push('Max daily loss must be between 0 and 1');
    }

    return errors;
  }

  /** 生成示例配置文件 */
  static generateExample(filePath: string = './bot-config.example.json'): void {
    const exampleConfig: BotConfig = {
      httpUrl: 'http://localhost:3000',
      wsUrl: 'ws://127.0.0.1:9001',
      global: {
        maxTotalPositions: 5,
        maxTotalInvestment: 0.5,
        emergencyStop: false,
        dryRun: true,
      },
      riskManagement: {
        maxDailyLoss: 0.05, // 5%
        maxConsecutiveLosses: 3,
        pauseAfterLoss: 600, // 10分钟
      },
    };

    try {
      fs.writeFileSync(filePath, JSON.stringify(exampleConfig, null, 2));
      console.log(`Example config generated at: ${filePath}`);
    } catch (error) {
      console.error('Failed to generate example config:', error);
    }
  }
}