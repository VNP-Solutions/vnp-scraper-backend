import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IPortfolioRepository } from './portfolio.interface';
import { PortfolioService } from './portfolio.service';

describe('PortfolioService', () => {
  let service: PortfolioService;
  let mockRepository: jest.Mocked<IPortfolioRepository>;

  beforeEach(async () => {
    // Create mock repository
    mockRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortfolioService,
        {
          provide: 'IPortfolioRepository',
          useValue: mockRepository,
        },
        Logger,
      ],
    }).compile();

    service = module.get<PortfolioService>(PortfolioService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
