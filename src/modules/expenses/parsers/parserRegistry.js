const parsers={TECHCOMBANK:require('./techcombankPdfParser'),TPBANK:require('./tpBankPdfParser'),VPBANK:require('./vpBankPdfParser'),VIB:require('./vibXlsxParser')};
function getParser(bankCode){const parser=parsers[String(bankCode||'').toUpperCase()];if(!parser)throw Object.assign(new Error('Ngân hàng chưa được hỗ trợ.'),{code:'STATEMENT_BANK_UNSUPPORTED'});return parser;}
module.exports={getParser,parsers};
