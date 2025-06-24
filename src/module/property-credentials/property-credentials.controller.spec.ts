import { Test, TestingModule } from '@nestjs/testing';
import { PropertyCredentialsController } from './property-credentials.controller';

describe('PropertyCredentialsController', () => {
  let controller: PropertyCredentialsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PropertyCredentialsController],
    }).compile();

    controller = module.get<PropertyCredentialsController>(
      PropertyCredentialsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
