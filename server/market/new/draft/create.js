// Create new draft
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
    barter_info:    { type: 'string' },
    delivery:       { type: 'boolean' },
    is_new:         { type: 'boolean' }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_user_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  N.wire.on(apiPath, async function create_draft(env) {
    // can't have any attachments when draft is created
    let data = env.params;
    data.attachments = [];

    let draft = await N.models.market.Draft.create({
      user: env.user_info.user_id,
      data
    });

    env.res.draft_id = draft._id;
  });
};
