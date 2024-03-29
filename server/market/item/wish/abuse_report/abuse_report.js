// Send abuse report
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    properties: {
      item_id: { format: 'mongo', required: true },
      message: { type: 'string' },
      move_to: { type: 'integer', minimum: 1 }
    },

    additionalProperties: false,

    oneOf: [
      { required: [ 'message' ] },
      { required: [ 'move_to' ] }
    ]
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let can_report_abuse = await env.extras.settings.fetch('can_report_abuse');

    if (!can_report_abuse) throw N.io.FORBIDDEN;
  });


  // Fetch destination section, check that it's not a category
  //
  N.wire.before(apiPath, async function fetch_section(env) {
    if (!env.params.move_to) return;

    env.data.move_to_section = await N.models.market.Section.findOne({ hid: env.params.move_to }).lean(true);
    if (!env.data.move_to_section) throw N.io.NOT_FOUND;

    let type_allowed = await N.models.market.Section.checkIfAllowed(env.data.move_to_section._id, 'wishes');
    if (!type_allowed) throw N.io.NOT_FOUND;

    // Cannot move to a category. Should never happen - restricted on client
    if (env.data.move_to_section.is_category) throw N.io.BAD_REQUEST;
  });


  // Fetch item
  //
  N.wire.before(apiPath, async function fetch_item(env) {
    env.data.item = await N.models.market.ItemWish
                              .findById(env.params.item_id)
                              .lean(true);

    if (!env.data.item) {
      env.data.item = await N.models.market.ItemWishArchived
                                .findById(env.params.item_id)
                                .lean(true);
    }

    if (!env.data.item) throw N.io.NOT_FOUND;
  });


  // Check if user can see this item
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: {
      items:     env.data.item,
      user_info: env.user_info
    } };

    await N.wire.emit('internal:market.access.item_wish', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Send abuse report
  //
  N.wire.on(apiPath, async function send_report_subcall(env) {
    env.data.message = env.params.message;

    let params = await N.models.core.MessageParams.getParams(env.data.item.params_ref);

    // enable markup used in templates (even if it's disabled in forum)
    params.link  = true;
    params.quote = true;

    let report;

    if (env.data.move_to_section) {
      report = new N.models.core.AbuseReport({
        src: env.data.item._id,
        type: N.shared.content_type.MARKET_ITEM_WISH,
        data: { move_to: env.data.move_to_section._id },
        from: env.user_info.user_id,
        params_ref: await N.models.core.MessageParams.setParams(params)
      });
    } else {
      report = new N.models.core.AbuseReport({
        src: env.data.item._id,
        type: N.shared.content_type.MARKET_ITEM_WISH,
        text: env.params.message,
        from: env.user_info.user_id,
        params_ref: await N.models.core.MessageParams.setParams(params)
      });
    }

    await N.wire.emit('internal:common.abuse_report', { report });
  });


  // Mark user as active
  //
  N.wire.after(apiPath, function set_active_flag(env) {
    return N.wire.emit('internal:users.mark_user_active', env);
  });
};
