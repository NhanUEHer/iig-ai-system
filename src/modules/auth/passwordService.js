const bcrypt = require('bcryptjs');

const COST = 12;

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Mật khẩu phải có ít nhất 8 ký tự.';
  }
  return null;
}

const hashPassword = password => bcrypt.hash(password, COST);
const verifyPassword = (password, hash) => bcrypt.compare(password, hash);
const isBcryptHash = value => /^\$2[aby]\$/.test(value || '');

module.exports = { hashPassword, verifyPassword, validatePassword, isBcryptHash };
