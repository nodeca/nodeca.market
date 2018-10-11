// Edit offer
//

'use strict';


const sanitize_section    = require('nodeca.market/lib/sanitizers/section');
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


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let can_create_items = await env.extras.settings.fetch('market_can_create_items');

    if (!can_create_items) throw N.io.FORBIDDEN;
  });


  // Fetch item
  //
  N.wire.before(apiPath, async function fetch_item(env) {
    let item = await N.models.market.ItemOffer.findOne()
                         .where('hid').equals(env.params.item_hid)
                         .lean(true);

    if (!item) throw N.io.NOT_FOUND;

    let access_env = { params: {
      items: item,
      user_info: env.user_info
    } };

    await N.wire.emit('internal:market.access.item_offer', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;

    env.data.item = item;
    env.res.item  = await sanitize_item_offer(N, env.data.item, env.user_info);
  });


  // Fetch section tree
  //
  N.wire.on(apiPath, async function fetch_sections(env) {
    let section_info = (await N.models.market.Section.getChildren()).filter(s => !s.is_linked);

    let _ids = section_info.map(s => s._id);

    let sections = await N.models.market.Section.find()
                             .where('_id').in(_ids)
                             .lean(true);

    let sections_by_id = _.keyBy(sections, '_id');

    // sort result in the same order as ids
    env.data.sections = section_info.map(info =>
      Object.assign({}, sections_by_id[info._id], { level: info.level })
    );

    env.res.sections = await sanitize_section(N, env.data.sections, env.user_info);

    env.res.defaults = {
      wish: Object.prototype.hasOwnProperty.call(env.params.$query || {}, 'wish')
    };

    if (env.params.$query && env.params.$query.section) {
      let selected_section = env.res.sections.filter(s => String(s._id) === env.params.$query.section)[0];

      if (selected_section && !selected_section.is_category) {
        env.res.defaults.section = selected_section._id;
      }
    }
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


  // Fill head meta
  //
  N.wire.after(apiPath, function fill_head(env) {
    env.res.head = env.res.head || {};
    env.res.head.title = env.t('title');
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
      'market_items_min_images',
      'market_items_max_images'
    ]));
  });
};
