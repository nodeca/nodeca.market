// Create new market offer
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    type:           { type: 'string', 'enum': [ 'sell', 'buy' ], required: true },
    title:          { type: 'string', required: true },
    price_value:    { type: 'number', required: true },
    price_currency: { type: 'string', required: true },
    section:        { format: 'mongo', required: true },
    description:    { type: 'string', required: true },
    barter_info:    { type: 'string', required: true },
    delivery:       { type: 'boolean', required: true },
    is_new:         { type: 'boolean', required: true }
  });


  N.wire.on(apiPath, function create_offer() {
    // TODO
  });
};
