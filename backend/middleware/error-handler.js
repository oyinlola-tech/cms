function apiErrorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  console.error('Unhandled error:', error);
  const status = error && Number.isInteger(error.statusCode) ? error.statusCode : 400;
  res.status(status).json({ message: error?.message || 'Bad request' });
}

module.exports = { apiErrorHandler };
