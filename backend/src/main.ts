import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { JsonLogger } from './common/json-logger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useLogger(new JsonLogger());
  app.use((request: Request, response: Response, next: NextFunction) => {
    const suppliedId = request.header('x-request-id');
    const requestId =
      suppliedId && /^[\da-f]{8}-([\da-f]{4}-){3}[\da-f]{12}$/i.test(suppliedId)
        ? suppliedId
        : randomUUID();
    const startedAt = process.hrtime.bigint();
    response.setHeader('X-Request-ID', requestId);
    response.on('finish', () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: response.statusCode >= 500 ? 'error' : 'info',
          event: 'http.request',
          requestId,
          method: request.method,
          route: request.route?.path ?? 'unmatched',
          statusCode: response.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
        }),
      );
    });
    next();
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  const allowedOrigins = (
    process.env.FRONTEND_ORIGINS ??
    'http://localhost:5173,http://127.0.0.1:5173'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins,
    exposedHeaders: ['X-Request-ID'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const swaggerConfig = new DocumentBuilder()
    .setTitle('CV Puerta API')
    .setDescription('API for authentication, clients, and projects')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
