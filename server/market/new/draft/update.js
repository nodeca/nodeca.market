// Update draft
//

'use strict';

const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    draft_id:       { format: 'mongo', required: true },
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
    barter_info:    { type: 'string' },
    delivery:       { type: 'boolean' },
    is_new:         { type: 'boolean' }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_user_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  N.wire.on(apiPath, async function update_draft(env) {
    await N.models.market.Draft.update(
      { _id: env.params.draft_id, user: env.user_info.user_id },
      { $set: { data: _.omit(env.params, 'draft_id'), ts: new Date() } }
    );
  });
};
