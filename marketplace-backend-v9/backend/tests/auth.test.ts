import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { RefreshToken } from '../src/models/RefreshToken';
import { markEmailVerified, registerAndLogin, uniqueEmail } from './helpers';
import { User } from '../src/models/User';

describe('auth: register + login', () => {
  it('registers a new account without auto-logging in', async () => {
    const email = uniqueEmail();
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'New User', email, password: 'CorrectHorse123' })
      .expect(201);

    expect(res.body.data.user.email).toBe(email);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('rejects a duplicate email once the first account is verified', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/v1/auth/register').send({ name: 'A', email, password: 'CorrectHorse123' }).expect(201);
    await markEmailVerified(email);

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'B', email, password: 'AnotherPass123' })
      .expect(409);
    expect(res.body.code).toBe('EMAIL_IN_USE');
  });

  it('re-registering an unverified email updates the placeholder and resends a code instead of 409', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/v1/auth/register').send({ name: 'First Try', email, password: 'CorrectHorse123' }).expect(201);

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Second Try', email, password: 'AnotherPass123' })
      .expect(200);
    expect(res.body.data.verificationRequired).toBe(true);

    const user = await User.findOne({ email }).select('+password');
    expect(user?.name).toBe('Second Try');
    expect(await user!.comparePassword('AnotherPass123')).toBe(true);
    expect(await user!.comparePassword('CorrectHorse123')).toBe(false);
    expect(await User.countDocuments({ email })).toBe(1);
  });

  it('refuses to log in an unverified password account with EMAIL_NOT_VERIFIED', async () => {
    const email = uniqueEmail();
    const password = 'CorrectHorse123';
    await request(app).post('/api/v1/auth/register').send({ name: 'A', email, password }).expect(201);

    const res = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('logs in with correct credentials and rejects wrong ones', async () => {
    const email = uniqueEmail();
    const password = 'CorrectHorse123';
    await request(app).post('/api/v1/auth/register').send({ name: 'A', email, password }).expect(201);
    await markEmailVerified(email);

    await request(app).post('/api/v1/auth/login').send({ email, password: 'WrongPassword1' }).expect(401);

    const res = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
    expect(res.headers['set-cookie']?.some((c: string) => c.startsWith('access_token='))).toBe(true);
    expect(res.headers['set-cookie']?.some((c: string) => c.startsWith('refresh_token='))).toBe(true);
  });

  it('rejects checking /me without a session', async () => {
    await request(app).get('/api/v1/auth/me').expect(401);
  });

  it('returns the current user for an authenticated session', async () => {
    const { agent } = await registerAndLogin();
    const res = await agent.get('/api/v1/auth/me').expect(200);
    expect(res.body.data.user.role).toBe('buyer');
  });
});

describe('auth: refresh rotation + reuse detection', () => {
  it('rotates the refresh token on every /refresh call', async () => {
    const { agent, userId } = await registerAndLogin();

    const before = await RefreshToken.find({ user: userId });
    expect(before).toHaveLength(1);

    await agent.post('/api/v1/auth/refresh').expect(200);

    const after = await RefreshToken.find({ user: userId });
    // The old token is revoked (not deleted, for audit/reuse-detection) and one new one exists.
    expect(after).toHaveLength(2);
    expect(after.filter((t) => !t.revokedAt)).toHaveLength(1);
    expect(after.find((t) => t.revokedAt)?.replacedByHash).toBeTruthy();
  });

  it('rejects a request with no refresh cookie at all', async () => {
    await request(app).post('/api/v1/auth/refresh').expect(401);
  });

  it('detects reuse of a rotated-out refresh token and revokes every session for that user', async () => {
    const email = uniqueEmail();
    const password = 'CorrectHorse123';
    await request(app).post('/api/v1/auth/register').send({ name: 'A', email, password }).expect(201);
    await markEmailVerified(email);
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);

    const userId = loginRes.body.data.user.id as string;
    const cookieHeader = (loginRes.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
    const originalRefreshCookie = (loginRes.headers['set-cookie'] as unknown as string[])
      .map((c) => c.split(';')[0])
      .find((c) => c.startsWith('refresh_token='))!;

    // Legitimate rotation: this consumes and replaces the original refresh token.
    const refreshRes = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookieHeader).expect(200);
    const rotatedRefreshCookie = (refreshRes.headers['set-cookie'] as unknown as string[])
      .map((c) => c.split(';')[0])
      .find((c) => c.startsWith('refresh_token='))!;

    // Replay the now-stale original refresh token — this must be treated as theft.
    await request(app).post('/api/v1/auth/refresh').set('Cookie', originalRefreshCookie).expect(401);

    // Every token for this user — including the one issued by the legitimate rotation above —
    // must now be revoked, forcing a clean re-login.
    const tokens = await RefreshToken.find({ user: userId });
    expect(tokens.every((t) => t.revokedAt)).toBe(true);

    // So the legitimately-rotated cookie no longer works either.
    await request(app).post('/api/v1/auth/refresh').set('Cookie', rotatedRefreshCookie).expect(401);
  });

  it('logout revokes the current refresh token', async () => {
    const { agent, userId } = await registerAndLogin();
    await agent.post('/api/v1/auth/logout').expect(200);

    const tokens = await RefreshToken.find({ user: userId });
    expect(tokens.every((t) => t.revokedAt)).toBe(true);
  });
});
