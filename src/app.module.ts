import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './module/user/user.module';
import { SubPortfolioModule } from './module/sub-portfolio/sub-portfolio.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    UserModule,
    SubPortfolioModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
