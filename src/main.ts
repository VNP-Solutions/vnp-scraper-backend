import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    exposedHeaders: ['Content-Disposition'],
  });

  // Raise the Express body-parser limits. The defaults (100 kb) are too
  // small for endpoints like `POST /reports/export-master`,
  // `/reports/export-consolidated`, `/reports/export-dashboard`, and
  // `/jobs/export-master`, which accept arrays of thousands of job_ids.
  //
  // NOTE: this only affects the size of the REQUEST body the server is
  // willing to parse. It does NOT change MongoDB's hard 16 MB BSON limit
  // (raised callers chunk their Mongo queries instead — see
  // `JobRepository.findManyForMasterExport`).
  const REQUEST_BODY_LIMIT = '50mb';
  app.use(json({ limit: REQUEST_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));

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

  app.getHttpAdapter().get('/api.json', (_req, res) => {
    res.json(document)
  })

  const port = configService.get('PORT') || 3000;
  const server = await app.listen(port);

  // Set server timeout to 15 minutes (900000ms) to prevent 504 Gateway Timeout errors
  server.timeout = 900000;
  server.keepAliveTimeout = 900000;
  server.headersTimeout = 900000;
}
bootstrap();
