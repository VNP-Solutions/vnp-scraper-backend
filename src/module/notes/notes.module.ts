import { Logger, Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { NotesController } from './notes.controller';
import { NotesRepository } from './notes.repository';
import { NotesService } from './notes.service';

@Module({
  imports: [DatabaseModule],
  controllers: [NotesController],
  providers: [
    { provide: 'INotesRepository', useClass: NotesRepository },
    { provide: 'INotesService', useClass: NotesService },
    Logger,
  ],
  exports: ['INotesService', 'INotesRepository'],
})
export class NotesModule {}
