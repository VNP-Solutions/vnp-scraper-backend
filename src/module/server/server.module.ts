import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ServerController } from './server.controller';
import { ServerService } from './server.service';
import { ServerRepository } from './server.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [ServerController],
  providers: [
    ServerRepository,
    {
      provide: 'IServerService',
      useClass: ServerService,
    },
    {
      provide: 'IServerRepository',
      useClass: ServerRepository,
    },
  ],
  exports: ['IServerService', 'IServerRepository'],
})
export class ServerModule {}
