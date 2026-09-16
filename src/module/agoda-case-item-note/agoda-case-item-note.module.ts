import { Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AgodaCaseItemNoteController } from './agoda-case-item-note.controller';
import { AgodaCaseItemNoteRepository } from './agoda-case-item-note.repository';
import { AgodaCaseItemNoteService } from './agoda-case-item-note.service';

@Module({
  imports: [],
  controllers: [AgodaCaseItemNoteController],
  providers: [
    {
      provide: 'IAgodaCaseItemNoteService',
      useClass: AgodaCaseItemNoteService,
    },
    {
      provide: 'IAgodaCaseItemNoteRepository',
      useClass: AgodaCaseItemNoteRepository,
    },
    DatabaseService,
  ],
  exports: ['IAgodaCaseItemNoteService', 'IAgodaCaseItemNoteRepository'],
})
export class AgodaCaseItemNoteModule {}
