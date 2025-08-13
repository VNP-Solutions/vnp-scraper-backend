import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { runPrismaMigrations } from './prisma-migrate';

async function bootstrap() {
  // Run Prisma migrations before starting the application
  if (process.env.AUTO_MIGRATE !== 'false') {
    console.log('🚀 Running automatic database migrations...');
    try {
      await runPrismaMigrations();
      console.log('✅ Database is ready');
    } catch (error) {
      console.error('❌ Failed to run migrations:', error);
      // Decide whether to continue or exit based on your needs
      if (process.env.STRICT_MIGRATION === 'true') {
        console.error('Exiting due to migration failure (STRICT_MIGRATION=true)');
        process.exit(1);
      } else {
        console.warn('⚠️ Continuing despite migration failure (STRICT_MIGRATION!=true)');
      }
    }
  } else {
    console.log('ℹ️ Skipping automatic migrations (AUTO_MIGRATE=false)');
  }

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
  await app.listen(port);
}
bootstrap();
