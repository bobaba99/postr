/**
 * App-level feature flags — the manuscript pipelines (narrative router)
 * and the Presentation Checker (review router) are deactivated, not
 * deleted. Their routers stay fully unit-tested in their own files; this
 * file pins the ONE thing those tests cannot see: whether createApp()
 * mounts them at all.
 *
 *   FEATURE_MANUSCRIPT unset/off → /api/narrative/* is a 404
 *   FEATURE_REVIEW     unset/off → /api/review/*    is a 404
 *   either set to "1" / "true"   → mounted (auth middleware answers 401
 *                                  without a bearer, proving the route
 *                                  exists)
 *
 * Restore recipe: set the env var in Render, nothing else changes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { readFeatureFlags } from '../features.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('readFeatureFlags', () => {
  it('defaults every flag to off when the variables are unset', () => {
    expect(readFeatureFlags({})).toEqual({ manuscript: false, review: false });
  });

  it.each(['1', 'true', 'TRUE', ' true '])('treats %j as on', (value) => {
    expect(readFeatureFlags({ FEATURE_MANUSCRIPT: value, FEATURE_REVIEW: value })).toEqual({
      manuscript: true,
      review: true,
    });
  });

  it.each(['0', 'false', '', 'yes', 'on'])('treats %j as off (only 1/true switch a feature on)', (value) => {
    expect(readFeatureFlags({ FEATURE_MANUSCRIPT: value, FEATURE_REVIEW: value })).toEqual({
      manuscript: false,
      review: false,
    });
  });

  it('reads each flag independently', () => {
    expect(readFeatureFlags({ FEATURE_REVIEW: '1' })).toEqual({ manuscript: false, review: true });
    expect(readFeatureFlags({ FEATURE_MANUSCRIPT: '1' })).toEqual({ manuscript: true, review: false });
  });
});

describe('createApp — deactivated routers', () => {
  it('does not mount the narrative or review routers by default', async () => {
    vi.stubEnv('FEATURE_MANUSCRIPT', undefined);
    vi.stubEnv('FEATURE_REVIEW', undefined);
    const app = createApp();

    await request(app).post('/api/narrative/condense').send({}).expect(404);
    await request(app).post('/api/narrative/extract-findings').send({}).expect(404);
    await request(app).post('/api/review/critique').send({}).expect(404);
    await request(app).post('/api/review/render-pptx').send({}).expect(404);
  });

  it('keeps the core routers mounted regardless of the flags', async () => {
    vi.stubEnv('FEATURE_MANUSCRIPT', undefined);
    vi.stubEnv('FEATURE_REVIEW', undefined);
    const app = createApp();

    await request(app).get('/health').expect(200, { ok: true });
    // Auth answers first on the always-on routers — a 401 proves the
    // route is there without needing any provider configured.
    const checkout = await request(app).post('/billing/create-checkout').send({ sku: 'term' });
    expect(checkout.status).toBe(401);
    const importExtract = await request(app).post('/api/import/extract').send({});
    expect(importExtract.status).toBe(401);
    const accountDelete = await request(app).post('/account/delete').send({});
    expect(accountDelete.status).toBe(401);
  });

  it('mounts the narrative router when FEATURE_MANUSCRIPT is on', async () => {
    vi.stubEnv('FEATURE_MANUSCRIPT', '1');
    vi.stubEnv('FEATURE_REVIEW', undefined);
    const app = createApp();

    const condense = await request(app).post('/api/narrative/condense').send({});
    expect(condense.status).toBe(401);
    expect(condense.body).toEqual({ error: 'missing_bearer_token' });
    await request(app).post('/api/review/critique').send({}).expect(404);
  });

  it('mounts the review router when FEATURE_REVIEW is on', async () => {
    vi.stubEnv('FEATURE_MANUSCRIPT', undefined);
    vi.stubEnv('FEATURE_REVIEW', 'true');
    const app = createApp();

    const critique = await request(app).post('/api/review/critique').send({});
    expect(critique.status).toBe(401);
    expect(critique.body).toEqual({ error: 'missing_bearer_token' });
    await request(app).post('/api/narrative/condense').send({}).expect(404);
  });
});
