// Create new market offer
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    type:           { type: 'string', 'enum': [ 'sell', 'buy' ] },
    title:          { type: 'string' },
    price_value:    { type: 'number' },
    price_currency: { type: 'string' },
    section:        { format: 'mongo' },
    description:    { type: 'string' },
    attachments:    {
      type: 'array',
      uniqueItems: true,
      items: { format: 'mongo' }
    },
    delivery:       { type: 'boolean' },
    is_new:         { type: 'boolean' }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_user_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  N.wire.on(apiPath, async function create_offer() {
    // TODO
    throw { code: N.io.CLIENT_ERROR, message: 'Creating market offers is not yet implemented' };
  });
};
