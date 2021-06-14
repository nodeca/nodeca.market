// Register `price` helper
//
'use strict';


const price_format = require('nodeca.market/lib/app/price_format');


module.exports = function () {
  require('nodeca.core/lib/system/env').helpers.price = price_format;
};
