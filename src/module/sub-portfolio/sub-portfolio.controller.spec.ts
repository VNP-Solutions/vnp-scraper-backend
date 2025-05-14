import { Test, TestingModule } from '@nestjs/testing';
import { SubPortfolioController } from './sub-portfolio.controller';

describe('SubPortfolioController', () => {
  let controller: SubPortfolioController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubPortfolioController],
    }).compile();

    controller = module.get<SubPortfolioController>(SubPortfolioController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
