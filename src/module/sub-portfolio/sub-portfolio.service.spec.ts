import { Test, TestingModule } from '@nestjs/testing';
import { SubPortfolioService } from './sub-portfolio.service';

describe('SubPortfolioService', () => {
  let service: SubPortfolioService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SubPortfolioService],
    }).compile();

    service = module.get<SubPortfolioService>(SubPortfolioService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
