import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';

export function handlePrismaError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      throw new ConflictException('A record with this value already exists');
    }
    if (error.code === 'P2003') {
      throw new BadRequestException('The related record does not exist');
    }
    if (error.code === 'P2025') {
      throw new NotFoundException('Record not found');
    }
  }
  throw error;
}
