function apiErrorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  console.error('Unhandled error:', error);
  const status = error && Number.isInteger(error.statusCode)
    ? error.statusCode
    : (error?.name === 'MulterError' || error?.message === 'Invalid file type' ? 400 : 500);
  res.status(status).json({ message: error?.message || 'Bad request' });
}

module.exports = { apiErrorHandler };
