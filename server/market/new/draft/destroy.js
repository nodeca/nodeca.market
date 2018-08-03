// Remove draft
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    draft_id: { format: 'mongo', required: true }
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


  N.wire.on(apiPath, async function remove_draft(env) {
    let draft = await N.models.market.Draft.findOne({ _id: env.params.draft_id, user: env.user_info.user_id });

    if (draft) await draft.remove();
  });
};
