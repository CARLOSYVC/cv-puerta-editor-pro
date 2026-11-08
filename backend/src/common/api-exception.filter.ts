import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

function getClientMessage(exception: HttpException): string | string[] {
  const body: unknown = exception.getResponse();
  if (typeof body === 'string') return body;
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = body.message;
    if (typeof message === 'string') return message;
    if (
      Array.isArray(message) &&
      message.every((item) => typeof item === 'string')
    ) {
      return message;
    }
  }
  return exception.message;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestId = request.header('x-request-id') ?? 'unavailable';

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          event: 'http.exception',
          requestId,
          statusCode,
          errorType:
            exception instanceof Error ? exception.name : 'UnknownError',
          stack: exception instanceof Error ? exception.stack : undefined,
        }),
      );
    }

    response.status(statusCode).json({
      statusCode,
      message:
        exception instanceof HttpException &&
        statusCode < HttpStatus.INTERNAL_SERVER_ERROR
          ? getClientMessage(exception)
          : 'Internal server error',
      path: request.path,
      timestamp: new Date().toISOString(),
      requestId,
    });
  }
}
