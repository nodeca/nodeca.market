// Implementation for `price` helper
//
'use strict';


// Pretty-prints a price
//
module.exports = function format_price(price = 0, currency_sym = '', approximate = false) {
  if (approximate && price !== 0) {
    // only keep 3 significant digits
    // beware of floating-point arithmetics here, 45.3 % 0.1 == 0.09999999999999465
    // price shouldn't be 0, since X % 0 == NaN
    price -= price % Math.pow(10, Math.ceil(Math.log(price / 1000) / Math.log(10)));
  }

  // rounding, since toFixed just truncates it
  price = Math.round(price * 100) / 100;

  // 12300 -> "12 300"
  // 12300.1 -> "12 300.10"
  /* eslint-disable no-bitwise */
  let value_str = price.toFixed(price === ~~price ? 0 : 2).replace(/\d(?=(\d{3})+(\.|$))/g, '$& ');

  return /*(approximate ? '~ ' : '')*/ '' +
         value_str +
         (currency_sym ? ' ' + currency_sym : '');
};
