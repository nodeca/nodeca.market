// Register `price` helper
//
'use strict';


const price_format = require('nodeca.market/lib/app/price_format');


function price_helper(value, currency, approximate) {
  let symbol = N.runtime.t.exists('market.currencies.' + currency + '.sign') ?
               N.runtime.t('market.currencies.' + currency + '.sign') :
               currency;

  return price_format(value, symbol, approximate);
}


N.wire.once('init:assets', function price_helper_register() {
  N.runtime.render.helpers.price = price_helper;
});
