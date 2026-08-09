const bcrypt = require('bcryptjs');

const COST = 12;

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 10) {
    return 'Mật khẩu phải có ít nhất 10 ký tự.';
  }
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) {
    return 'Mật khẩu phải có cả chữ và số.';
  }
  return null;
}

const hashPassword = password => bcrypt.hash(password, COST);
const verifyPassword = (password, hash) => bcrypt.compare(password, hash);
const isBcryptHash = value => /^\$2[aby]\$/.test(value || '');

module.exports = { hashPassword, verifyPassword, validatePassword, isBcryptHash };
