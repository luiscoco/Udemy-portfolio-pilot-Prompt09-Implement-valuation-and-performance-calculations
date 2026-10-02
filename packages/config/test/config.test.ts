import { describe, expect, it } from 'vitest';
import { parseBrowserConfig } from '../src/browser.js';
import { parseServerConfig } from '../src/server.js';

describe('configuration boundaries', () => {
  it('defaults empty public placeholders to mock mode', () => {
    expect(parseBrowserConfig({ VITE_APP_NAME: '', VITE_DATA_MODE: '' }).VITE_DATA_MODE).toBe('mock');
  });
  it('rejects secret keys in browser config', () => {
    expect(() => parseBrowserConfig({ DATABASE_URL: 'secret' })).toThrow();
  });
  it('accepts empty server placeholders in mock mode', () => {
    expect(parseServerConfig({ DATA_MODE: '', DATABASE_URL: '', REDIS_URL: '' }).DATA_MODE).toBe('mock');
  });
  it('requires live data connections', () => {
    expect(() => parseServerConfig({ DATA_MODE: 'live' })).toThrow();
  });
  it('validates service URL schemes even in mock mode', () => {
    expect(() => parseServerConfig({ DATABASE_URL: 'https://example.com', REDIS_URL: 'redis://localhost:6379' })).toThrow();
    expect(() => parseServerConfig({ DATABASE_URL: 'postgresql://localhost:5432/test', REDIS_URL: 'not a url' })).toThrow();
    expect(parseServerConfig({ DATABASE_URL: 'postgresql://localhost:5432/test', REDIS_URL: 'redis://localhost:6379' }).REDIS_URL).toBe('redis://localhost:6379');
  });
  it('requires a model and external workspace in Claude agent mode', () => {
    expect(() => parseServerConfig({ AGENT_MODE: 'claude' })).toThrow();
    expect(parseServerConfig({ AGENT_MODE: 'claude', AGENT_MODEL_ID: 'configured-model', AGENT_WORKSPACE_DIR: 'C:\\agent-runtime' }).DATA_MODE).toBe('mock');
  });
});
