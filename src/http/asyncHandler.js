module.exports = function asyncHandler(handler) {
  return function handledRequest(req, res, next) {
    return Promise.resolve(handler(req, res, next)).catch(next);
  };
};
