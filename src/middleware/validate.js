import { httpError } from '../utils/http.js';
export function validateBody(schema) {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return next(httpError(400, 'Les données envoyées sont invalides.', 'VALIDATION_ERROR'));
    }
    req.body = parsed.data;
    return next();
  };
}
