import { Body, Controller, Inject, Logger, Post, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ValidateBody } from 'src/common/decorators/validate.decorator';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { CreateOnboardingDto } from './onboarding.dto';
import { IOnboardingService } from './onboarding.interface';
import { createOnboardingSchema } from './onboarding.validation';

@ApiTags('Onboarding')
@Controller('/onboarding')
export class OnboardingController {
  constructor(
    @Inject('IOnboardingService')
    private readonly onboardingService: IOnboardingService,
    private readonly logger: Logger,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Submit onboarding',
    description:
      'Creates an onboarding record and emails all addresses in ONBOARDING_EMAIL (comma- or semicolon-separated). Uses existing SMTP_* settings.',
  })
  @ApiResponse({ status: 201, description: 'Onboarding created successfully' })
  @ApiResponse({
    status: 502,
    description: 'Saved but failed to send notification email',
  })
  @ValidateBody(createOnboardingSchema)
  @ApiBody({ type: CreateOnboardingDto })
  async create(
    @Body() body: CreateOnboardingDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const data = await this.onboardingService.create(body);
        return {
          statusCode: 201,
          message: 'Onboarding submitted successfully',
          data,
        };
      },
      this.logger,
    );
  }
}
