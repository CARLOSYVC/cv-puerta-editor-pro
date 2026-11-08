import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Req } from '@nestjs/common';
import { AppService } from './app.service.js';
import { PrismaService } from './prisma/prisma.service.js';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health/live')
  getLiveness() {
    return { status: 'ok' };
  }

  @Get('health/ready')
  async getReadiness(@Req() request: Request) {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'ok' };
    } catch (error) {
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          event: 'health.database_check_failed',
          requestId: request.header('x-request-id') ?? 'unavailable',
          errorType: error instanceof Error ? error.name : 'UnknownError',
        }),
      );
      throw new ServiceUnavailableException('Database is not ready');
    }
  }

  @Get('health/metrics')
  getMetrics() {
    const memory = process.memoryUsage();
    return {
      uptimeSeconds: Math.floor(process.uptime()),
      memoryBytes: {
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
      },
    };
  }
}
