// Register `price` helper
//
'use strict';


const price_format = require('nodeca.market/lib/app/price_format');


function price_helper(value, currency, approximate) {
  let symbol = this.t.exists('@market.currencies.' + currency + '.sign') ?
               this.t('@market.currencies.' + currency + '.sign') :
               currency;

  return price_format(value, symbol, approximate);
}


module.exports = function () {
  require('nodeca.core/lib/system/env').helpers.price = price_helper;
};
