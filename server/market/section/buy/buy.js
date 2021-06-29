// Market section
//

'use strict';


const _                = require('lodash');
const memoize          = require('promise-memoize');
const sanitize_section = require('nodeca.market/lib/sanitizers/section');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid: { type: 'integer', required: true },
    $query:      {
      type: 'object',
      properties: {
        from: { type: 'string' },
        prev: { const: '' },
        next: { const: '' }
      },
      additionalProperties: false
    }
  });


  let build_item_ids_by_range = require('./list/_build_item_ids_by_range')(N);


  let fetchSection = memoize(id =>
    N.models.market.Section.findById(id).lean(true).exec(), { maxAge: 60000 });


  // Build item ids based on page parameters (start and direction);
  // direction is only used for no-javascript users and bots
  //
  async function build_item_ids(env) {
    let prev = false, next = false, start = null;

    if (env.params.$query) {
      let query = env.params.$query;

      prev = typeof query.prev !== 'undefined';
      next = typeof query.next !== 'undefined';

      // get hid by id
      if (query.from && _.isInteger(+query.from)) {
        let item = await N.models.market.ItemOffer.findOne()
                              .where('section').in(env.data.section_ids)
                              .where('hid').equals(+query.from)
                              .where('st').in(env.data.items_visible_statuses)
                              .select('_id')
                              .lean(true);

        if (item) start = item._id;
      }
    }

    let limit_direction = prev || next;

    env.data.select_start  = start;

    env.data.select_before = (!limit_direction || prev) ? env.data.items_per_page : 0;
    env.data.select_after  = (!limit_direction || next) ? env.data.items_per_page : 0;

    return build_item_ids_by_range(env);
  }


  // Fetch section
  //
  N.wire.before(apiPath, async function fetch_section(env) {
    let section = await N.models.market.Section.findOne()
                            .where('hid').equals(env.params.section_hid)
                            .lean(true);

    if (!section) throw N.io.NOT_FOUND;

    let type_allowed = await N.models.market.Section.checkIfAllowed(section._id, 'offers');

    if (!type_allowed) throw N.io.NOT_FOUND;

    env.data.section = section;

    if (!env.data.section) return;

    env.res.section = await sanitize_section(N, env.data.section, env.user_info);
  });


  // Get all subsections to search items in
  //
  N.wire.before(apiPath, async function fetch_subsections(env) {
    let children = await N.models.market.Section.getChildren({
      section: env.data.section._id,
      offers: true
    });

    children = children.filter(s => !s.is_linked);

    let section_ids = [ env.data.section._id ];

    if (children.length > 0) section_ids = section_ids.concat(children.map(x => x._id));

    env.data.section_ids = section_ids;
  });


  // Subcall item list
  //
  N.wire.on(apiPath, async function subcall_item_list(env) {
    env.data.build_item_ids = build_item_ids;
    env.data.items_per_page = await env.extras.settings.fetch('market_items_per_page');

    await N.wire.emit('internal:market.item_offer_active_list', env);
  });


  // Fill sections via subcall
  //
  N.wire.after(apiPath, function subsections_fill_subcall(env) {
    env.data.section_item_type = 'offers';
    return N.wire.emit('internal:market.subsections_fill', env);
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


  // Fill pagination (progress)
  //
  N.wire.after(apiPath, async function fill_pagination(env) {
    //
    // Count total amount of visible items
    //
    let counters_by_status = await Promise.all(
      env.data.items_visible_statuses.map(st => Promise.all(
        env.data.section_ids.map(section_id =>
          N.models.market.ItemOffer
              .where('section').equals(section_id)
              .where('st').equals(st)
              .countDocuments()
        )
      ))
    );

    let total = _.sum(_.flatten(counters_by_status));

    //
    // Count an amount of visible items before the first displayed
    //
    let offset = 0;

    if (env.data.items.length) {
      let counters_by_status = await Promise.all(
        env.data.items_visible_statuses.map(st => Promise.all(
          env.data.section_ids.map(section_id =>
            N.models.market.ItemOffer
                .where('section').equals(section_id)
                .where('st').equals(st)
                .where('_id').gt(env.data.items[0]._id)
                .countDocuments()
          )
        ))
      );

      offset = _.sum(_.flatten(counters_by_status));
    }

    env.res.pagination = {
      total,
      per_page:     env.data.items_per_page,
      chunk_offset: offset
    };
  });


  // Fill info needed to render search box
  //
  N.wire.after(apiPath, async function fill_search_options(env) {
    if (env.user_info.is_member) {
      let user = await N.models.users.User.findOne({ _id: env.user_info.user_id });

      if (user) env.res.location_available = !!user.location;
    }

    let c = N.config.market.currencies || {};

    env.res.currency_types = Object.keys(c)
                               .sort((a, b) => (c[a]?.priority ?? 100) - (c[b]?.priority ?? 100));
  });


  // Fill head meta
  //
  N.wire.after(apiPath, function fill_head(env) {
    env.res.head = env.res.head || {};
    env.res.head.title = env.data.section.title;

    if (env.params.$query?.from) {
      env.res.head.robots = 'noindex,follow';
    }
  });


  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, async function fill_breadcrumbs(env) {
    let parents = await N.models.market.Section.getParentList(env.data.section._id);

    await N.wire.emit('internal:market.breadcrumbs_fill', { env, parents });
  });


  // Get parent section
  //
  N.wire.after(apiPath, async function fill_parent_hid(env) {
    let parents = await N.models.market.Section.getParentList(env.data.section._id);

    if (!parents.length) return;

    let section = await fetchSection(parents[parents.length - 1]);

    if (!section) return;

    env.res.section_level = parents.length;
    env.res.parent_hid = section.hid;
  });


  // Fill 'prev' and 'next' links and meta tags
  //
  N.wire.after(apiPath, async function fill_prev_next(env) {
    env.res.head = env.res.head || {};

    //
    // Fetch item after last one, turn it into a link to the next page
    //
    if (env.data.items.length > 0) {
      let last_item_id = env.data.items[0]._id;

      let item = await N.models.market.ItemOffer.findOne()
                           .where('section').in(env.data.section_ids)
                           .where('_id').lt(last_item_id)
                           .where('st').in(env.data.items_visible_statuses)
                           .select('_id')
                           .sort('-_id')
                           .lean(true);

      // `item` is only used to check if there is a post afterwards
      if (item) {
        env.res.head.next = N.router.linkTo('market.section.buy', {
          section_hid: env.data.section.hid,
          $query: {
            from: String(env.data.items[env.data.items.length - 1].hid),
            next: ''
          }
        });
      }
    }

    //
    // Fetch item before first one, turn it into a link to the previous page
    //
    if (env.data.items.length > 0) {
      let last_item_id = env.data.items[0]._id;

      let item = await N.models.market.ItemOffer.findOne()
                           .where('section').in(env.data.section_ids)
                           .where('_id').gt(last_item_id)
                           .where('st').in(env.data.items_visible_statuses)
                           .select('_id')
                           .sort('_id')
                           .lean(true);

      // `item` is only used to check if there is a post afterwards
      if (item) {
        env.res.head.prev = N.router.linkTo('market.section.buy', {
          section_hid: env.data.section.hid,
          $query: {
            from: String(env.data.items[0].hid),
            prev: ''
          }
        });
      }
    }

    //
    // Fetch last item for the "move to bottom" button
    //
    if (env.data.items.length > 0) {
      let item = await N.models.market.ItemOffer.findOne()
                           .where('section').in(env.data.section_ids)
                           .where('st').in(env.data.items_visible_statuses)
                           .select('hid -_id')
                           .sort('_id')
                           .lean(true);

      if (item) {
        env.res.last_item_hid = item.hid;
      }
    }
  });
};
