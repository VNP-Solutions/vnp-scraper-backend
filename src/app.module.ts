import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './module/user/user.module';
import { PortfolioModule } from './module/portfolio/portfolio.module';
import { PropertyCredentialsModule } from './module/property-credentials/property-credentials.module';
import { PropertyModule } from './module/property/property.module';
import { AuthModule } from './module/auth/auth.module';
import { SubPortfolioModule } from './module/sub-portfolio/sub-portfolio.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    UserModule,
    PortfolioModule,
    PropertyCredentialsModule,
    PropertyModule,
    SubPortfolioModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
