import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcrypt';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('AuthService', () => {
  const prismaMock = {
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  };
  const jwtMock = {
    signAsync: vi.fn().mockResolvedValue('signed-token'),
  };
  let service: AuthService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('authenticates a user and returns a JWT', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-id',
      name: 'Alex Morgan',
      email: 'alex@example.com',
      passwordHash: await hash('secure-password', 4),
      role: 'ADMIN',
    });

    const result = await service.login({
      email: 'ALEX@example.com',
      password: 'secure-password',
    });

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'alex@example.com' },
    });
    expect(result).toEqual({
      access_token: 'signed-token',
      user: { id: 'user-id', name: 'Alex Morgan', email: 'alex@example.com', role: 'ADMIN' },
    });
  });
});
