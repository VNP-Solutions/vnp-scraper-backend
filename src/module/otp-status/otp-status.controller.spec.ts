import { Test, TestingModule } from '@nestjs/testing';
import { OtpStatusController } from './otp-status.controller';

describe('OtpStatusController', () => {
  let controller: OtpStatusController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OtpStatusController],
    }).compile();

    controller = module.get<OtpStatusController>(OtpStatusController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
