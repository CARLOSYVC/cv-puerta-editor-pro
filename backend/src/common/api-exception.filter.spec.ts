import { BadRequestException } from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter.js';

describe('ApiExceptionFilter', () => {
  const filter = new ApiExceptionFilter();
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
  const request = {
    header: vi.fn().mockReturnValue('request-id'),
    path: '/clients',
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a consistent validation error response with the request ID', () => {
    filter.catch(
      new BadRequestException({ message: ['name should not be empty'] }),
      host as never,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: ['name should not be empty'],
        path: '/clients',
        requestId: 'request-id',
      }),
    );
  });

  it('does not expose internal exception messages to callers', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    filter.catch(new Error('database connection secret'), host as never);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal server error',
        requestId: 'request-id',
      }),
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"event":"http.exception"'));
    expect(response.json).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: 'database connection secret' }),
    );
    log.mockRestore();
  });

  it('uses the HTTP exception response message when available', () => {
    filter.catch(new BadRequestException('Invalid input'), host as never);

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid input' }),
    );
  });
});
