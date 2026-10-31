export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

export const sendSuccess = (res, data, options = {}) =>
  res.status(options.status ?? 200).json({
    success: true,
    data,
    ...(options.message ? { message: options.message } : {}),
    ...(options.meta ? { meta: options.meta } : {}),
    ...(options.warnings?.length ? { warnings: options.warnings } : {}),
  });
