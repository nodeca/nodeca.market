// Register `price` helper
//
'use strict';


const price_format = require('nodeca.market/lib/app/price_format');


N.wire.once('init:assets', function price_helper_register() {
  N.runtime.render.helpers.price = price_format;
});
