// Search in market
//

'use strict';


const _                = require('lodash');
const sanitize_section = require('nodeca.market/lib/sanitizers/section');
const docid_sections   = require('nodeca.market/lib/search/docid_sections');
const sphinx_escape    = require('nodeca.search').escape;


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    $query: {
      type: 'object',
      required: false,
      properties: {
        query:              { type: 'string' },
        section:            { format: 'mongo' },
        is_new:             { type: 'string' },
        barter:             { type: 'string' },
        delivery:           { type: 'string' },
        search_all:         { type: 'string' },
        price_min_value:    { type: 'string' },
        price_min_currency: { type: 'string' },
        price_max_value:    { type: 'string' },
        price_max_currency: { type: 'string' },
        range:              { type: 'string' }
      },
      additionalProperties: true
    }
  });


  // Fetch section
  //
  N.wire.before(apiPath, async function fetch_section(env) {
    if (!env.params.$query || !env.params.$query.section) return;

    env.data.section = await N.models.market.Section.findById(env.params.$query.section)
                                 .lean(true);

    if (!env.data.section) return;

    env.res.section = await sanitize_section(N, env.data.section, env.user_info);
  });


  // Fetch current user
  //
  N.wire.before(apiPath, async function fetch_user(env) {
    env.data.user = await N.models.users.User.findOne({ _id: env.user_info.user_id });
  });


  // Normalize search params
  //
  N.wire.before(apiPath, async function normalize_params(env) {
    let $query = env.params.$query;

    env.data.search = {};

    if ($query.query)      env.data.search.query = $query.query;
    if ($query.is_new)     env.data.search.is_new = true;
    if ($query.barter)     env.data.search.barter = true;
    if ($query.delivery)   env.data.search.delivery = true;
    if ($query.search_all) env.data.search.search_all = true;

    if (Number($query.price_min_value) > 0) {
      env.data.search.price_min_value = Number($query.price_min_value);
    }

    if (Number($query.price_max_value) > 0) {
      env.data.search.price_max_value = Number($query.price_max_value);
    }

    if (N.config.market.currencies.hasOwnProperty($query.price_min_currency)) {
      env.data.search.price_min_currency = $query.price_min_currency;
    }

    if (N.config.market.currencies.hasOwnProperty($query.price_max_currency)) {
      env.data.search.price_max_currency = $query.price_max_currency;
    }

    if (Number($query.range) > 0 && env.data.user.location) {
      // get nearest available range
      env.data.search.range = Number($query.range) >= 150 ? 200 : 100;
    }

    if (env.data.section) env.data.search.section = env.data.section._id;

    env.res.search = env.data.search;

    // check query length because 1-character requests consume too much resources
    if ($query.query.trim().length < 2) {
      env.res.search_error = env.res.search_error || env.t('err_query_too_short');
    }
  });


  // Send sql query to sphinx, get a response
  //
  async function build_item_ids(env) {
    let query = 'SELECT object_id FROM market_item_offers WHERE MATCH(?) AND public=1';
    let params = [ sphinx_escape(env.data.search.query) ];

    if (env.data.section && !env.data.search.search_all) {
      // get hids of specified section and all its non-linked subsections
      let children = await N.models.market.Section.getChildren(env.data.section._id, Infinity);

      children = children.filter(s => !s.is_linked);

      let hids = [ env.data.section.hid ];

      if (children.length > 0) {
        let s = await N.models.market.Section.find()
                          .where('_id').in(_.map(children, '_id'))
                          .lean(true);

        hids = hids.concat(_.map(s, 'hid'));
      }

      if (hids.length > 0) {
        query += ' AND section_uid IN (' + '?,'.repeat(hids.length - 1) + '?)';
        params = params.concat(hids.map(hid => docid_sections(N, hid)));
      }
    }

    if (env.data.search.is_new)   query += ' AND is_new=1';
    if (env.data.search.barter)   query += ' AND barter=1';
    if (env.data.search.delivery) query += ' AND delivery=1';

    let price_min, price_max;

    if (env.data.search.price_min_value) {
      let rate = await N.models.market.CurrencyRate.get(env.data.search.price_min_currency);

      if (rate) {
        query += ' AND price>=?';
        price_min = env.data.search.price_min_value * rate;
        params.push(price_min);
      } else {
        // currency rate not available
        env.res.search_error = env.res.search_error || env.t('err_invalid_price_range');
      }
    }

    if (env.data.search.price_max_value) {
      let rate = await N.models.market.CurrencyRate.get(env.data.search.price_max_currency);

      if (rate) {
        query += ' AND price>0 AND price<=?';
        price_max = env.data.search.price_max_value * rate;
        params.push(price_max);
      } else {
        // currency rate not available
        env.res.search_error = env.res.search_error || env.t('err_invalid_price_range');
      }
    }

    if (price_min && price_max && price_min > price_max) {
      // if user select min and max in different currencies,
      // impossible range will not be immediately obvious to the user
      env.res.search_error = env.res.search_error || env.t('err_invalid_price_range');
    }

    if (env.data.search.range && env.data.user.location) {
      query += ' AND has_location=1 AND GEODIST(latitude, longitude, ?, ?, {in=deg, out=km})<=?';
      params.push(env.data.user.location[0]);
      params.push(env.data.user.location[1]);
      params.push(env.data.search.range);
    }

    // sort is either `date` or `rel`, sphinx searches by relevance by default
    if (env.data.search.sort === 'date') {
      query += ' ORDER BY ts DESC';
    }

    if (env.res.search_error) {
      env.data.item_ids = [];
    } else {
      let results = await N.search.execute(query, params);

      env.data.item_ids = results.map(result => result.object_id);
    }
  }


  // Subcall item list
  //
  N.wire.on(apiPath, async function subcall_item_list(env) {
    env.data.build_item_ids = build_item_ids;
    env.data.items_per_page = await env.extras.settings.fetch('market_items_per_page');

    await N.wire.emit('internal:market.search_item_offer_list', env);
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


  // Fill info needed to render search box
  //
  N.wire.after(apiPath, async function fill_search_options(env) {
    let user = await N.models.users.User.findOne({ _id: env.user_info.user_id });

    env.res.location_available = !!user.location;

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
};
