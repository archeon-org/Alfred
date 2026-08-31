import 'reflect-metadata';

process.env.API_CORS_ORIGINS ??= 'http://localhost:5173';
process.env.API_HOST ??= '127.0.0.1';
process.env.API_PORT ??= '3000';
process.env.API_PREFIX ??= 'api';
process.env.DATABASE_URL ??=
  'postgresql://alfred:test-password@localhost:5432/alfred_test?schema=public';
process.env.NODE_ENV ??= 'test';
