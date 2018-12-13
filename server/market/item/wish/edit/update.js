// Update item
//

'use strict';


const charcount = require('charcount');

// If same user edits the same post within 5 minutes, all changes
// made within that period will be squashed into one diff.
const HISTORY_GRACE_PERIOD = 5 * 60 * 1000;


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    item_id:        { format: 'mongo', required: true },
    title:          { type: 'string',  required: true },
    section:        { format: 'mongo', required: true },
    description:    { type: 'string',  required: true },
    as_moderator:   { type: 'boolean', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_user_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
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


  // Fetch item
  //
  N.wire.before(apiPath, async function fetch_item(env) {
    let item = await N.models.market.ItemWish.findById(env.params.item_id).lean(true);

    if (!item) {
      item = await N.models.market.ItemWishArchived.findById(env.params.item_id).lean(true);
    }

    if (!item) throw N.io.NOT_FOUND;

    let access_env = { params: {
      items: item,
      user_info: env.user_info
    } };

    await N.wire.emit('internal:market.access.item_wish', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;

    env.data.item = item;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let settings = await env.extras.settings.fetch([
      'market_can_create_items',
      'market_mod_can_edit_items'
    ]);

    // Permit editing as moderator
    if (settings.market_mod_can_edit_items && env.params.as_moderator) return;

    // Permit editing as topic owner
    if (!settings.can_create_items) throw N.io.FORBIDDEN;

    if (env.user_info.user_id !== String(env.data.item.user)) {
      throw N.io.FORBIDDEN;
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


  // Update item
  //
  N.wire.on(apiPath, async function update_item(env) {
    // save it using model to trigger 'post' hooks (e.g. param_ref update)
    let item = await N.models.market.ItemWish.findById(env.data.item._id)
                         .lean(false);

    if (!item) {
      item = await N.models.market.ItemWishArchived.findById(env.data.item._id)
                       .lean(false);
    }

    if (!item) throw N.io.NOT_FOUND;

    item.imports = env.data.parse_result.imports;
    item.import_users = env.data.parse_result.import_users;
    item.title = env.params.title;
    item.html = env.data.parse_result.html;
    item.md = env.params.description;
    item.params = env.data.parse_options;
    item.section = env.data.section._id;

    // only update location if user edits his own item,
    // do not update it for moderator actions
    if (!env.params.as_moderator) {
      item.location = ((await N.models.users.User.findById(env.user_info.user_id).lean(true)) || {}).location;
    }

    env.data.new_item = await item.save();
  });


  // Save old version in history
  //
  N.wire.after(apiPath, async function save_history(env) {
    let orig_item = env.data.item;
    let new_item  = env.data.new_item;

    let last_record = await N.models.market.ItemWishHistory.findOne()
                                .where('item').equals(orig_item._id)
                                .sort('-_id')
                                .lean(true);

    let last_update_time = last_record ? last_record.ts   : orig_item.ts;
    let last_update_user = last_record ? last_record.user : orig_item.user;
    let now = new Date();

    // if the same user edits the same post within grace period, history won't be changed
    if (!(last_update_time > now - HISTORY_GRACE_PERIOD &&
          last_update_time < now &&
          String(last_update_user) === String(env.user_info.user_id))) {

      /* eslint-disable no-undefined */
      last_record = await new N.models.market.ItemWishHistory({
        item:        orig_item._id,
        user:        env.user_info.user_id,
        section:     orig_item.section,
        title:       orig_item.title,
        md:          orig_item.md,
        location:    orig_item.location,
        params_ref:  orig_item.params_ref,
        ip:          env.req.ip
      }).save();
    }

    // if the next history entry would be the same as the last one
    // (e.g. user saves post without changes or reverts change within 5 min),
    // remove redundant history entry
    if (last_record) {
      let last_item_str = JSON.stringify({
        item:        last_record.item,
        user:        last_record.user,
        section:     last_record.section,
        title:       last_record.title,
        md:          last_record.md,
        location:    last_record.location,
        params_ref:  last_record.params_ref
      });

      let next_item_str = JSON.stringify({
        item:        new_item._id,
        user:        env.user_info.user_id,
        section:     new_item.section,
        title:       new_item.title,
        md:          new_item.md,
        location:    new_item.location,
        params_ref:  new_item.params_ref
      });

      if (last_item_str === next_item_str) {
        await N.models.market.ItemWishHistory.remove({ _id: last_record._id });
      }
    }

    await N.models.market.ItemWish.update(
      { _id: orig_item._id },
      { $set: {
        last_edit_ts: new Date(),
        edit_count: await N.models.market.ItemWishHistory.count({ item: orig_item._id })
      } }
    );
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
    if (env.data.item.section.toString() !== env.params.section) {
      let old_section = await N.models.market.Section.findById(env.data.item.section).lean(true);

      if (old_section) {
        await N.models.market.Section.updateCache(old_section._id);
      }
    }

    await N.models.market.Section.updateCache(env.data.section._id);
  });


  // Add redirect info
  //
  N.wire.after(apiPath, function redirect_info(env) {
    env.res.redirect_url = N.router.linkTo('market.item.wish', {
      section_hid: env.data.section.hid,
      item_hid:    env.data.new_item.hid
    });
  });


  // Mark user as active
  //
  N.wire.after(apiPath, function set_active_flag(env) {
    return N.wire.emit('internal:users.mark_user_active', env);
  });
};
