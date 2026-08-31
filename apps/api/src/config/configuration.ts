import { parseEnvironment } from './environment';

export { parseEnvironment as validateEnv } from './environment';

export function configuration() {
  const environment = parseEnvironment(process.env);

  return {
    api: {
      corsOrigins: environment.API_CORS_ORIGINS,
      host: environment.API_HOST,
      port: environment.API_PORT,
      prefix: environment.API_PREFIX,
    },
    database: {
      url: environment.DATABASE_URL,
    },
    nodeEnv: environment.NODE_ENV,
  };
}
