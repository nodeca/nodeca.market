// Show item edit history
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


  // Fetch and return item edit history
  //
  N.wire.on(apiPath, async function get_item_history(env) {
    let history = await N.models.market.ItemWishHistory.find()
                            .where('item').equals(env.data.item._id)
                            .sort('_id')
                            .lean(true);

    env.res.history = [];

    let previous_user = env.data.item.user;
    let previous_ts   = env.data.item.ts;

    env.data.users = env.data.users || [];
    env.data.users.push(env.data.item.user);

    // unfold history, so each item would have user corresponding to its text
    for (let item of history) {
      env.res.history.push({
        section:     item.section,
        title:       item.title,
        md:          item.md,
        location:    item.location,
        user:        previous_user,
        ts:          previous_ts
      });

      previous_user = item.user;
      previous_ts   = item.ts;

      env.data.users.push(item.user);
    }

    // last item will have current item text and last editor
    env.res.history.push({
      section:     env.data.item.section,
      title:       env.data.item.title,
      md:          env.data.item.md,
      location:    env.data.item.location,
      user:        previous_user,
      ts:          previous_ts
    });
  });


  // Fetch sections
  //
  N.wire.after(apiPath, async function fetch_sections(env) {
    let sections = await N.models.market.Section.find()
                             .where('_id').in(_.uniq(env.res.history.map(h => String(h.section))))
                             .lean(true);

    env.res.sections = _.keyBy(await sanitize_section(N, sections, env.user_info), '_id');
  });


  // Fetch locations
  //
  N.wire.after(apiPath, async function fetch_locations(env) {
    let locations = env.res.history.map(i => i.location).filter(Boolean);

    let resolved = locations.length ?
                   await N.models.core.Location.info(locations, env.user_info.locale) :
                   [];

    env.res.location_names = {};

    for (let i = 0; i < locations.length; i++) {
      env.res.location_names[locations[i][0] + ':' + locations[i][1]] = resolved[i];
    }
  });
};
