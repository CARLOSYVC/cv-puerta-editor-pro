import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/auth/register (POST) is disabled for public access', () => {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'Public User',
        email: 'public@example.com',
        password: 'some-long-password',
      })
      .expect(404);
  });

  it('/users (POST) requires an authenticated administrator', () => {
    return request(app.getHttpServer())
      .post('/users')
      .send({
        name: 'New User',
        email: 'new@example.com',
        password: 'some-long-password',
        role: 'VENTAS',
      })
      .expect(401);
  });

  afterEach(async () => {
    await app.close();
  });
});
