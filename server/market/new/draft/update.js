// Update draft
//

'use strict';

const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    draft_id:       { format: 'mongo', required: true },
    type:           { type: 'string', 'enum': [ 'sell', 'buy' ] },
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


  // Find current draft
  //
  N.wire.before(apiPath, async function find_draft(env) {
    env.data.draft = await N.models.market.Draft.findOne()
                               .where('_id').equals(env.params.draft_id)
                               .where('user').equals(env.user_info.user_id);

    if (!env.data.draft) throw N.io.NOT_FOUND;
  });


  // Update draft
  //
  N.wire.on(apiPath, async function update_draft(env) {
    let data = _.omit(env.params, 'draft_id');
    let uploaded = _.keyBy(env.data.draft.files);

    // restrict files to only files that were uploaded for this draft
    data.files = data.files.filter(id => uploaded.hasOwnProperty(id));

    env.data.draft.data = data;
    env.data.draft.ts = new Date();

    await env.data.draft.save();
  });
};
