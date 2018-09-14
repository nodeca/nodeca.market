// Set displayed currency
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    currency: { type: 'string', required: true }
  });

  N.wire.on(apiPath, async function currency_select(env) {
    if (!N.config.market.currencies.hasOwnProperty(env.params.currency)) {
      throw N.io.BAD_REQUEST;
    }

    // TODO: for users store it in userstore, for guests in session
    env.session.currency = env.params.currency;
  });
};
