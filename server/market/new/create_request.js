// Create new market offer
//

'use strict';


const charcount   = require('charcount');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    draft_id:       { format: 'mongo' },
    title:          { type: 'string',  required: true },
    section:        { format: 'mongo', required: true },
    description:    { type: 'string',  required: true }
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


  // Check title length
  //
  N.wire.before(apiPath, async function check_title_length(env) {
    let min_length = await env.extras.settings.fetch('market_title_min_length');

    if (charcount(env.params.title.trim()) < min_length) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_title_too_short', min_length)
      };
    }
  });


  // Fetch section info
  //
  N.wire.before(apiPath, async function fetch_section_info(env) {
    let section = await N.models.market.Section.findById(env.params.section).lean(true);

    if (!section) throw N.io.NOT_FOUND;

    env.data.section = section;

    // Should never happen, restricted on client
    if (section.is_category) throw N.io.BAD_REQUEST;
  });


  // Prepare parse options
  //
  N.wire.before(apiPath, async function prepare_options(env) {
    let settings = await N.settings.getByCategory(
      'market_items_markup',
      { usergroup_ids: env.user_info.usergroups },
      { alias: true });

    env.data.parse_options = settings;
  });


  // Parse user input to HTML
  //
  N.wire.before(apiPath, async function parse_text(env) {
    env.data.parse_result = await N.parser.md2html({
      text: env.params.description,
      attachments: [],
      options: env.data.parse_options,
      user_info: env.user_info
    });
  });


  // Check description length
  //
  N.wire.before(apiPath, async function check_desc_length(env) {
    let min_length = await env.extras.settings.fetch('market_desc_min_length');

    if (env.data.parse_result.text_length < min_length) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_desc_too_short', min_length)
      };
    }
  });


  // Create offer
  //
  N.wire.on(apiPath, async function create_offer(env) {
    let statuses = N.models.market.ItemRequest.statuses;
    let item = new N.models.market.ItemRequest();

    item.imports = env.data.parse_result.imports;
    item.import_users = env.data.parse_result.import_users;
    item.title = env.params.title;
    item.html = env.data.parse_result.html;
    item.md = env.params.description;
    item.ip = env.req.ip;
    item.params = env.data.parse_options;

    if (env.user_info.hb) {
      item.st  = statuses.HB;
      item.ste = statuses.VISIBLE;
    } else {
      item.st  = statuses.VISIBLE;
    }

    item.section = env.data.section._id;
    item.user    = env.user_info.user_id;

    item.location = ((await N.models.users.User.findById(env.user_info.user_id).lean(true)) || {}).location;

    await item.save();

    env.data.new_item = item;
  });


  // Remove draft
  //
  N.wire.after(apiPath, async function remove_draft(env) {
    let draft = await N.models.market.Draft.findOne({ _id: env.params.draft_id, user: env.user_info.user_id });

    if (draft) await draft.remove();
  });


  // Schedule image size fetch
  //
  N.wire.after(apiPath, function fill_image_info(env) {
    return N.queue.market_item_request_images_fetch(env.data.new_item._id).postpone();
  });


  // Update section counters
  //
  N.wire.after(apiPath, async function update_section(env) {
    await N.models.market.Section.updateCache(env.data.section._id);
  });


  // Add redirect info
  //
  N.wire.after(apiPath, function redirect_info(env) {
    env.res.redirect_url = N.router.linkTo('market.item.buy', {
      section_hid: env.data.section.hid,
      item_hid:    env.data.new_item.hid
    });
  });


  // Mark user as active
  //
  N.wire.after(apiPath, async function set_active_flag(env) {
    await N.wire.emit('internal:users.mark_user_active', env);
  });
};
