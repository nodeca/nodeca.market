// Create new market offer
//

'use strict';


const charcount   = require('charcount');
const check_title = require('nodeca.users/lib/check_title');


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


  // Check title
  //
  //  - return an error if title is too short (< 10)
  //  - return an error if title is too long (> 100)
  //  - return an error if title has unicode emoji
  //  - normalize title
  //    - trim spaces on both ends
  //    - replace multiple ending punctuations with one (???, !!!)
  //    - convert title to lowercase if title has too many (5+ consecutive) uppercase letters
  //
  N.wire.before(apiPath, async function check_and_normalize_title(env) {
    let title = check_title.normalize_title(env.params.title);
    let min_length = await env.extras.settings.fetch('market_title_min_length');
    let max_length = await env.extras.settings.fetch('market_title_max_length');
    let title_length = charcount(title);
    let error = null;

    if (title_length < min_length)    error = env.t('err_title_too_short', min_length);
    if (title_length > max_length)    error = env.t('err_title_too_long', max_length);
    if (check_title.has_emoji(title)) error = env.t('err_title_emojis');

    if (error) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: error
      };
    }

    env.data.title = title;
  });


  // Fetch section info
  //
  N.wire.before(apiPath, async function fetch_section_info(env) {
    let section = await N.models.market.Section.findById(env.params.section).lean(true);
    if (!section) throw N.io.NOT_FOUND;

    let type_allowed = await N.models.market.Section.checkIfAllowed(section._id, 'wishes');
    if (!type_allowed) throw N.io.NOT_FOUND;

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


  // Create wish
  //
  N.wire.on(apiPath, async function create_wish(env) {
    let market_items_expire = await env.extras.settings.fetch('market_items_expire');
    let statuses = N.models.market.ItemWish.statuses;
    let item = new N.models.market.ItemWish();

    item.imports = env.data.parse_result.imports;
    item.import_users = env.data.parse_result.import_users;
    item.title = env.data.title;
    item.html = env.data.parse_result.html;
    item.md = env.params.description;
    item.ip = env.req.ip;
    item.params = env.data.parse_options;

    if (market_items_expire > 0) {
      item.autoclose_at_ts = new Date(Date.now() + (market_items_expire * 24 * 60 * 60 * 1000));
    }

    if (env.user_info.hb) {
      item.st  = statuses.HB;
      item.ste = statuses.OPEN;
    } else {
      item.st  = statuses.OPEN;
    }

    item.section = env.data.section._id;
    item.user    = env.user_info.user_id;

    item.location = (await N.models.users.User.findById(env.user_info.user_id).lean(true))?.location;

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
    return N.queue.market_item_wish_images_fetch(env.data.new_item._id).postpone();
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    await N.queue.market_item_wishes_search_update_by_ids([ env.data.new_item._id ]).postpone();
  });


  // Update section counters
  //
  N.wire.after(apiPath, async function update_section(env) {
    await N.models.market.Section.updateCache(env.data.section._id);
  });


  // Update user counters
  //
  N.wire.after(apiPath, async function update_user(env) {
    await N.models.market.UserItemWishCount.inc(env.user_info.user_id, {
      is_hb: env.user_info.hb
    });
  });


  // Add redirect info
  //
  N.wire.after(apiPath, function redirect_info(env) {
    env.res.redirect_url = N.router.linkTo('market.item.wish', {
      section_hid: env.data.section.hid,
      item_hid:    env.data.new_item.hid
    });
  });


  // Add new item notification for subscribers
  //
  N.wire.after(apiPath, async function add_new_item_notification(env) {
    await N.wire.emit('internal:users.notify', {
      src: env.data.new_item._id,
      type: 'MARKET_NEW_WISH'
    });
  });


  // Mark user as active
  //
  N.wire.after(apiPath, async function set_active_flag(env) {
    await N.wire.emit('internal:users.mark_user_active', env);
  });
};
