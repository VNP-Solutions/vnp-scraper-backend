import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.getHttpAdapter().getInstance().set('trust proxy', true);
  const configService = app.get(ConfigService);

  const config = new DocumentBuilder()
    .setTitle('VNP Scraper API')
    .setDescription('The VNP Scraper API documentation')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth', // This name here is important for @ApiBearerAuth() decorator
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = configService.get('PORT') || 3000;
  const server = await app.listen(port);

  // // Set server timeout to 15 minutes (900000ms) to prevent 504 Gateway Timeout errors
  // server.timeout = 900000;
  // server.keepAliveTimeout = 900000;
  // server.headersTimeout = 900000;
}
bootstrap();
