import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { triggerLambda } from '../../helpers/lambdaHelper';

@Injectable()
export class LambdaTriggerSchedulerService {
  private readonly logger = new Logger(LambdaTriggerSchedulerService.name);

  constructor(private readonly configService: ConfigService) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleLambdaTrigger() {
    this.logger.log('Lambda trigger cron fired – invoking Lambda...');

    try {
      const platform =
        this.configService.get<string>('LAMBDA_TRIGGER_PLATFORM') || 'expedia';

      await triggerLambda(platform);

      this.logger.log(
        `Lambda trigger cron completed successfully for platform: ${platform}`,
      );
    } catch (error) {
      this.logger.error(
        `Error during Lambda trigger cron: ${error.message}`,
        error.stack,
      );
    }
  }
}
