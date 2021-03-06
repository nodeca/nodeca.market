// Create new draft
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    type:           { type: 'string', enum: [ 'sell', 'buy' ] },
    title:          { type: 'string' },
    price_value:    { type: 'number', minimum: 0 },
    price_currency: { type: 'string' },
    section:        { format: 'mongo' },
    description:    { type: 'string' },
    files:          {
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


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let can_create_items = await env.extras.settings.fetch('market_can_create_items');

    if (!can_create_items) throw N.io.FORBIDDEN;
  });


  N.wire.on(apiPath, async function create_draft(env) {
    // can't have any files when draft is created
    let data = env.params;
    data.files = [];

    let draft = await N.models.market.Draft.create({
      user: env.user_info.user_id,
      data
    });

    env.res.draft_id = draft._id;
  });
};
