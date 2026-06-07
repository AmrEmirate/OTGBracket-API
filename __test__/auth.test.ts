import request from 'supertest';
import app from '../src/app';

// Mock database service
jest.mock('../src/service/authService', () => ({
  getAdminUser: jest.fn().mockResolvedValue({ id: 1, name: 'Admin', role: 'ADMIN' })
}));

describe('Auth API', () => {
  it('should login as admin when email contains admin', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('ADMIN');
    expect(res.body.token).toBe('mock-admin-token');
  });

  it('should login as participant for other emails', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('PARTICIPANT');
    expect(res.body.token).toBe('mock-user-token');
  });
});
