import type { LoggerService } from '@nestjs/common';

type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'verbose' | 'fatal';

export class JsonLogger implements LoggerService {
  log(message: unknown, ...optionalParams: unknown[]) {
    this.write('info', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]) {
    this.write('warn', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]) {
    this.write('error', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]) {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]) {
    this.write('verbose', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]) {
    this.write('fatal', message, optionalParams);
  }

  private write(level: LogLevel, message: unknown, optionalParams: unknown[]) {
    const stringParams = optionalParams.filter(
      (parameter): parameter is string => typeof parameter === 'string',
    );
    const context = stringParams[stringParams.length - 1];
    const stack =
      level === 'error'
        ? stringParams.find((parameter) => parameter !== context)
        : undefined;
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      ...(context && { context }),
      message: message instanceof Error ? message.message : String(message),
      ...(message instanceof Error && { errorType: message.name }),
      ...(stack && { stack }),
    };
    const output = JSON.stringify(entry);
    if (level === 'error' || level === 'fatal') {
      console.error(output);
    } else if (level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }
}
