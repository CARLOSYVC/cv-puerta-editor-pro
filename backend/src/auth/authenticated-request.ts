import type { Request } from 'express';
import type { UserRole } from '../generated/prisma/enums.js';

export interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
    email: string;
    role: UserRole;
  };
}
