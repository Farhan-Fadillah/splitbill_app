export class AppError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
export const bad = (code, message, extra) => new AppError(400, code, message, extra);
export const notFound = (message = 'Data tidak ditemukan atau sudah kedaluwarsa') => new AppError(404, 'not_found', message);
