import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PropertyCredentialsModule } from '../property-credentials/property-credentials.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { AgodaCaseItemController } from './agoda-case-item.controller';
import { AgodaCaseItemRepository } from './agoda-case-item.repository';
import { AgodaCaseItemService } from './agoda-case-item.service';

@Module({
  imports: [DatabaseModule, PropertyCredentialsModule, RetrievalModule],
  controllers: [AgodaCaseItemController],
  providers: [
    {
      provide: 'IAgodaCaseItemService',
      useClass: AgodaCaseItemService,
    },
    {
      provide: 'IAgodaCaseItemRepository',
      useClass: AgodaCaseItemRepository,
    },
  ],
  exports: ['IAgodaCaseItemService', 'IAgodaCaseItemRepository'],
})
export class AgodaCaseItemModule {}
