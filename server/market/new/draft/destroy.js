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


  N.wire.on(apiPath, async function remove_draft(env) {
    await N.models.market.Draft.remove(
      { _id: env.params.draft_id, user: env.user_info.user_id }
    );
  });
};
