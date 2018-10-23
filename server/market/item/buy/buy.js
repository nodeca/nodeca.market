// Show a single market offer
//

'use strict';


const _                   = require('lodash');
const sanitize_section    = require('nodeca.market/lib/sanitizers/section');
const sanitize_item_offer = require('nodeca.market/lib/sanitizers/item_offer');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid: { type: 'integer', required: true },
    item_hid:    { type: 'integer', required: true }
  });


  // Fetch item
  //
  N.wire.before(apiPath, async function fetch_item(env) {
    let item = await N.models.market.ItemOffer.findOne()
                         .where('hid').equals(env.params.item_hid)
                         .lean(true);

    if (!item) {
      // maybe offer type is wrong, redirect in that case
      item = await N.models.market.ItemWish.findOne()
                       .where('hid').equals(env.params.item_hid)
                       .lean(true);

      if (!item) throw N.io.NOT_FOUND;

      let access_env = { params: {
        items: item,
        user_info: env.user_info
      } };

      await N.wire.emit('internal:market.access.item_wish', access_env);

      if (!access_env.data.access_read) throw N.io.NOT_FOUND;

      throw {
        code: N.io.REDIRECT,
        head: {
          Location: N.router.linkTo('market.item.wish', {
            section_hid: env.params.section_hid,
            item_hid:    env.params.item_hid
          })
        }
      };
    }

    let access_env = { params: {
      items: item,
      user_info: env.user_info
    } };

    await N.wire.emit('internal:market.access.item_offer', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;

    env.data.item = item;
  });


  // Fetch section
  //
  N.wire.before(apiPath, async function fetch_section(env) {
    let section = await N.models.market.Section.findById(env.data.item.section)
                            .lean(true);

    if (!section) throw N.io.NOT_FOUND;

    env.data.section = section;
  });


  // If section_hid in params is incorrect, redirect to a proper url
  //
  N.wire.before(apiPath, function redirect_to_correct_section(env) {
    if (env.data.section.hid !== env.params.section_hid) {
      throw {
        code: N.io.REDIRECT,
        head: {
          Location: N.router.linkTo('market.item.buy', {
            section_hid: env.data.section.hid,
            item_hid:    env.params.item_hid
          })
        }
      };
    }
  });


  // Fill response
  //
  N.wire.on(apiPath, async function market_item(env) {
    env.res.head.title = env.data.item.title;

    env.data.users = env.data.users || [];

    if (env.data.item.user) env.data.users.push(env.data.item.user);

    if (env.data.item.import_users) {
      env.data.users = env.data.users.concat(env.data.item.import_users);
    }

    if (env.data.item.location) {
      env.res.location_name = (await N.models.core.Location.info([ env.data.item.location ], env.user_info.locale))[0];
    }

    env.res.section = await sanitize_section(N, env.data.section, env.user_info);
    env.res.item    = await sanitize_item_offer(N, env.data.item, env.user_info);
  });


  // Fetch user drafts
  //
  N.wire.after(apiPath, async function fetch_drafts(env) {
    let can_create_items = await env.extras.settings.fetch('market_can_create_items');

    if (can_create_items) {
      env.res.drafts = await N.models.market.Draft.find()
                                 .where('user').equals(env.user_info.user_id)
                                 .sort('-ts')
                                 .lean(true);
    }
  });


  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, async function fill_breadcrumbs(env) {
    let parents = await N.models.market.Section.getParentList(env.data.section._id);

    // add current section
    parents.push(env.data.section._id);
    await N.wire.emit('internal:market.breadcrumbs_fill', { env, parents });
  });


  // Update view counter
  //
  // The handler is deliberately synchronous with all updates happening in the
  // background, so it won't affect response time
  //
  N.wire.after(apiPath, function update_view_counter(env) {
    // First-time visitor or a bot, don't count those
    if (!env.session_id) return;

    N.redis.time(function (err, time) {
      if (err) return;

      let score = Math.floor(time[0] * 1000 + time[1] / 1000);
      let key   = env.data.item._id + '-' + env.session_id;

      N.redis.zscore('views:market_item_offer:track_last', key, function (err, old_score) {
        if (err) return;

        // Check if user has loaded the same page in the last 10 minutes,
        // it prevents refreshes and inside-the-topic navigation from being
        // counted.
        //
        if (Math.abs(score - old_score) < 10 * 60 * 1000) { return; }

        N.redis.zadd('views:market_item_offer:track_last', score, key, function (err) {
          if (err) return;

          N.redis.hincrby('views:market_item_offer:count', String(env.data.item._id), 1, function () {});
        });
      });
    });
  });


  // Fetch and fill bookmarks
  //
  N.wire.after(apiPath, async function fetch_and_fill_bookmarks(env) {
    let bookmarks = await N.models.market.ItemOfferBookmark.find()
                              .where('user').equals(env.user_info.user_id)
                              .where('item').equals(env.data.item._id)
                              .lean(true);

    if (!bookmarks.length) return;

    env.res.own_bookmarks = _.map(bookmarks, 'item');
  });


  // Fetch infractions
  //
  N.wire.after(apiPath, async function fetch_infractions(env) {
    let settings = await env.extras.settings.fetch([
      'market_mod_can_add_infractions',
      'can_see_infractions'
    ]);

    if (!settings.can_see_infractions && !settings.market_mod_can_add_infractions) return;

    let infractions = await N.models.users.Infraction.find()
                                .where('src').equals(env.data.item._id)
                                .where('exists').equals(true)
                                .select('src points ts')
                                .lean(true);

    env.res.infractions = infractions.reduce((acc, infraction) => {
      acc[infraction.src] = infraction;
      return acc;
    }, {});
  });


  // Fetch settings needed on the client-side
  //
  N.wire.after(apiPath, async function fetch_settings(env) {
    env.res.settings = env.data.settings = Object.assign({}, env.res.settings, await env.extras.settings.fetch([
      'can_report_abuse',
      'can_see_ip',
      'can_see_history',
      'market_displayed_currency',
      'market_mod_can_add_infractions'
    ]));

    if (env.session.currency) {
      // patch for guests who don't have user store
      env.res.settings.market_displayed_currency = env.session.currency;
    }
  });


  // Add "similar items" block
  //
  N.wire.after(apiPath, async function fill_similar_items(env) {
    let data = { item_id: env.data.item._id };

    try {
      await N.wire.emit('internal:market.similar_item_offers', data);
    } catch (__) {
      // if similar items can't be fetched, just show empty result
      return;
    }

    if (data.results && data.results.length > 0) {
      let items = await N.models.market.ItemOffer.find()
                            .where('_id').in(_.map(data.results, 'item_id'))
                            .lean(true);

      let sections = await N.models.market.Section.find()
                               .where('_id').in(_.uniq(_.map(items, 'section').map(String)))
                               .lean(true);

      let access_env = { params: { items, user_info: env.user_info } };

      await N.wire.emit('internal:market.access.item_offer', access_env);

      items = items.filter((__, idx) => access_env.data.access_read[idx]);

      let items_by_id    = _.keyBy(await sanitize_item_offer(N, items, env.user_info), '_id');
      let sections_by_id = _.keyBy(sections, '_id'); // not sanitized because only hid is used

      env.res.similar_items = data.results.filter(result => items_by_id[result.item_id])
                                          .map(result => ({
                                            item:        items_by_id[result.item_id],
                                            section_hid: sections_by_id[items_by_id[result.item_id].section].hid,
                                            weight:      result.weight
                                          }));
    }
  });


  // Fetch currency rates
  //
  N.wire.after(apiPath, async function fetch_currency_rates(env) {
    let currencies = _.uniq(
      [ env.res.item ].concat((env.res.similar_items || []).map(s => s.item))
                      .map(i => i.price && i.price.currency)
                      .filter(Boolean)
    );

    env.res.currency_rates = {};

    for (let c of currencies) {
      env.res.currency_rates[c] = await N.models.market.CurrencyRate.get(
        c, env.data.settings.market_displayed_currency
      );
    }
  });
};
