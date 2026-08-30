import * as Joi from 'joi';

// Falla rápido al arrancar si falta o está mal formada alguna env var crítica,
// en vez de fallar en el primer uso dentro de un request.
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(3000),

  DATABASE_URL: Joi.string().uri().required(),
  DIRECT_URL: Joi.string().uri().required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_SELECTION_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  JWT_SELECTION_EXPIRES_IN: Joi.string().default('5m'),

  ENCRYPTION_KEY: Joi.string()
    .hex()
    .length(64) // 32 bytes en hex
    .required(),

  RESEND_API_KEY: Joi.string().allow('').optional(),
  RESEND_FROM_EMAIL: Joi.string().email().allow('').optional(),

  FRONTEND_URL: Joi.string().uri().required(),

  PASSWORD_RESET_TOKEN_EXPIRES_MIN: Joi.number().default(30),
  LOGIN_MAX_ATTEMPTS: Joi.number().default(5),
  LOGIN_LOCKOUT_MINUTES: Joi.number().default(15),
});
