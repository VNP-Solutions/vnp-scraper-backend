import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IOtpStatusRepository } from './otp-status.interface';
import { OtpStatusService } from './otp-status.service';

describe('OtpStatusService', () => {
  let service: OtpStatusService;
  let mockRepository: jest.Mocked<IOtpStatusRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpStatusService,
        {
          provide: 'IOtpStatusRepository',
          useValue: mockRepository,
        },
        Logger,
      ],
    }).compile();

    service = module.get<OtpStatusService>(OtpStatusService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
