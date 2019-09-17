// Edit offer
//

'use strict';


const sanitize_item_offer = require('nodeca.market/lib/sanitizers/item_offer');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid: { type: 'integer', required: true },
    item_hid:    { type: 'integer', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_user_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Fetch item
  //
  N.wire.before(apiPath, async function fetch_item(env) {
    let item = await N.models.market.ItemOffer.findOne()
                         .where('hid').equals(env.params.item_hid)
                         .lean(true);

    if (!item) {
      item = await N.models.market.ItemOfferArchived.findOne()
                       .where('hid').equals(env.params.item_hid)
                       .lean(true);
    }

    if (!item) throw N.io.NOT_FOUND;

    let access_env = { params: {
      items: item,
      user_info: env.user_info
    } };

    await N.wire.emit('internal:market.access.item_offer', access_env);

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
    if (settings.market_mod_can_edit_items) return;

    // Permit editing as item owner
    if (!settings.market_can_create_items) throw N.io.FORBIDDEN;

    if (env.user_info.user_id !== String(env.data.item.user)) {
      throw N.io.FORBIDDEN;
    }
  });


  // Fill sections tree by subcall
  //
  N.wire.on(apiPath, async function fill_sections_tree(env) {
    env.data.section_item_type = 'offers';
    await N.wire.emit('internal:market.sections_tree', env);
  });


  // Fill parse options for description editor
  //
  N.wire.after(apiPath, async function fill_parse_options(env) {
    env.res.parse_options = await N.settings.getByCategory(
      'market_items_markup',
      { usergroup_ids: env.user_info.usergroups },
      { alias: true }
    );
  });


  // Fill available currencies
  //
  N.wire.after(apiPath, async function fill_options(env) {
    let c = N.config.market.currencies || {};

    env.res.currency_types = Object.keys(c)
                               .sort((a, b) => ((c[a] || {}).priority || 100) - ((c[b] || {}).priority || 100));
  });


  // Fill response
  //
  N.wire.after(apiPath, async function fill_response(env) {
    env.res.head = env.res.head || {};
    env.res.head.title = env.t('title');
    env.res.item = await sanitize_item_offer(N, env.data.item, env.user_info);

    // add private fields that aren't exposed by sanitizer
    env.res.item.md = env.data.item.md;
    env.res.item.all_files = env.data.item.all_files;
  });


  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, async function fill_breadcrumbs(env) {
    await N.wire.emit('internal:market.breadcrumbs_fill', { env });
  });


  // Fetch settings needed on the client-side
  //
  N.wire.after(apiPath, async function fetch_settings(env) {
    env.res.settings = Object.assign({}, env.res.settings, await env.extras.settings.fetch([
      'market_can_create_items',
      'market_items_min_images',
      'market_items_max_images'
    ]));
  });
};
