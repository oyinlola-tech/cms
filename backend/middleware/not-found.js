function apiNotFoundHandler(req, res) {
  res.status(404).json({ message: 'Not found' });
}

module.exports = { apiNotFoundHandler };
