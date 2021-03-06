// Show edit history
//

'use strict';


const _                   = require('lodash');
const sanitize_section    = require('nodeca.market/lib/sanitizers/section');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    item_id: { format: 'mongo', required: true }
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let can_see_history = await env.extras.settings.fetch('can_see_history');

    if (!can_see_history) throw N.io.FORBIDDEN;
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
      items: env.data.item,
      user_info: env.user_info
    } };

    await N.wire.emit('internal:market.access.item_wish', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Using different sanitizer here,
  // because we need to expose editable fields (md) and don't need
  // autogenerated ones (bookmarks, views, html)
  //
  function sanitize_item(item) {
    // we can always hide HB status, because it doesn't affect client diffs
    if (item.st === N.models.market.ItemWish.statuses.HB) {
      item = Object.assign({}, item);
      item.st = item.ste;
      delete item.ste;
    }

    if (item.prev_st && item.prev_st.st === N.models.market.ItemWish.statuses.HB) {
      item.prev_st = Object.assign({}, item.prev_st);
      item.prev_st.st = item.prev_st.ste;
      delete item.prev_st.ste;
    }

    return _.pick(item, [
      'section',
      'title',
      'md',
      'st',
      'ste',
      'del_reason',
      'del_by',
      'autoclose_at_ts',
      'prev_st',
      'location'
    ]);
  }


  // Fetch and return item edit history
  //
  N.wire.on(apiPath, async function get_item_history(env) {
    let history = await N.models.market.ItemWishHistory.find()
                            .where('item').equals(env.data.item._id)
                            .sort('_id')
                            .lean(true);

    let history_meta = [ {
      user: env.data.item.user,
      ts:   env.data.item.ts,
      role: N.models.market.ItemWishHistory.roles.USER
    } ].concat(
      history.map(i => ({ user: i.user, ts: i.ts, role: i.role }))
    );

    let history_items = history.map(x => x.item_data)
                         .concat([ env.data.item ])
                         .map(sanitize_item);

    env.res.history = [];

    for (let i = 0; i < history_items.length; i++) {
      env.res.history.push({
        meta: history_meta[i],
        item: history_items[i]
      });
    }

    env.data.users = (env.data.users || []).concat(env.res.history.map(x => x.meta.user));
  });


  // Fetch sections
  //
  N.wire.after(apiPath, async function fetch_sections(env) {
    let sections = [];
    let section_ids = _.uniq(env.res.history.map(x => x.item.section).filter(Boolean).map(String));

    if (section_ids) {
      sections = await N.models.market.Section.find()
                           .where('_id').in(section_ids)
                           .lean(true);
    }

    env.res.sections = _.keyBy(await sanitize_section(N, sections, env.user_info), '_id');
  });


  // Fetch locations
  //
  N.wire.after(apiPath, async function fetch_locations(env) {
    let locations = env.res.history.map(x => x.item?.location).filter(Boolean);

    let resolved = locations.length ?
                   await N.models.core.Location.info(locations, env.user_info.locale) :
                   [];

    env.res.location_names = {};

    for (let i = 0; i < locations.length; i++) {
      env.res.location_names[locations[i][0] + ':' + locations[i][1]] = resolved[i];
    }
  });
};
