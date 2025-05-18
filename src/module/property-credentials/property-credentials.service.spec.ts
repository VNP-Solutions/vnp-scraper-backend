import { Test, TestingModule } from '@nestjs/testing';
import { PropertyCredentialsService } from './property-credentials.service';

describe('PropertyCredentialsService', () => {
  let service: PropertyCredentialsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PropertyCredentialsService],
    }).compile();

    service = module.get<PropertyCredentialsService>(
      PropertyCredentialsService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
