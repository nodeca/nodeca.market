// Register `price` helper
//
'use strict';


const price_format = require('nodeca.market/lib/app/price_format');


function price_helper(value, currency, user_currency, rate) {
  let symbol_real = this.t.exists('@market.currencies.' + currency + '.sign') ?
                    this.t('@market.currencies.' + currency + '.sign') :
                    currency;

  if (user_currency && user_currency !== currency && rate && rate > 0) {
    let symbol_base = this.t.exists('@market.currencies.' + user_currency + '.sign') ?
                      this.t('@market.currencies.' + user_currency + '.sign') :
                      user_currency;

    return price_format(value * rate, symbol_base, true) + ' (' + price_format(value, symbol_real) + ')';
  }

  return price_format(value, symbol_real);
}


module.exports = function () {
  require('nodeca.core/lib/system/env').helpers.price = price_helper;
};
