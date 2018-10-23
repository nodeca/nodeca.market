// Edit offer
//

'use strict';


const _                  = require('lodash');
const sanitize_section   = require('nodeca.market/lib/sanitizers/section');
const sanitize_item_wish = require('nodeca.market/lib/sanitizers/item_wish');


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
    let item = await N.models.market.ItemWish.findOne()
                         .where('hid').equals(env.params.item_hid)
                         .lean(true);

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
    let can_create_items = await env.extras.settings.fetch('market_can_create_items');

    if (!can_create_items) throw N.io.FORBIDDEN;

    if (String(env.user_info.user_id) !== String(env.data.item.user)) {
      throw N.io.FORBIDDEN;
    }
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


  // Fill response
  //
  N.wire.after(apiPath, async function fill_response(env) {
    env.res.head = env.res.head || {};
    env.res.head.title = env.t('title');
    env.res.item = await sanitize_item_wish(N, env.data.item, env.user_info);

    // add private fields that aren't exposed by sanitizer
    env.res.item.md = env.data.item.md;
  });


  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, async function fill_breadcrumbs(env) {
    await N.wire.emit('internal:market.breadcrumbs_fill', { env, wish: true });
  });
};