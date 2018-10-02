// RPC method used to fetch search results
//
'use strict';


const _                = require('lodash');
const memoize          = require('promise-memoize');
const sanitize_section = require('nodeca.market/lib/sanitizers/section');
const docid_sections   = require('nodeca.market/lib/search/docid_sections');
const sphinx_escape    = require('nodeca.search').escape;

// Maximum offset (should be the same as `max_matches` in sphinx),
// client MAY send higher skip, we just return zero results in that case.
//
const MAX_SKIP = 1000;

// Maximum size of one result chunk, it's just a safeguard because
// client never sends invalid limit value.
//
const MAX_LIMIT = 50;


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    query:              { type: 'string' },
    section:            { format: 'mongo' },
    search_all:         { type: 'boolean' },
    range:              { type: 'integer' },
    sort:               { type: 'string' },
    skip:               { type: 'integer', required: true, minimum: 0 },
    limit:              { type: 'integer', required: true, minimum: 0, maximum: MAX_LIMIT }
  });


  let fetchSections = memoize(() =>
    N.models.market.Section.find().select('title hid').lean(true).exec(),
    { maxAge: 60000 });


  // Fetch section
  //
  N.wire.before(apiPath, async function fetch_section(env) {
    let params = env.params || {};

    if (!params.section) return;

    env.data.section = await N.models.market.Section.findById(params.section)
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
    let params = env.params || {};

    env.data.search = {};
    env.data.search.query = params.query || '';

    if (params.search_all) env.data.search.search_all = true;

    if (Number(params.range) > 0 && env.data.user.location) {
      // get nearest available range
      env.data.search.range = Number(params.range) >= 150 ? 200 : 100;
    }

    if (env.data.section) env.data.search.section = env.data.section._id;

    env.res.search = env.data.search;

    env.data.search.sort = [ 'rel', 'date' ].indexOf(params.sort) ? params.sort : 'rel';

    // check query length because 1-character requests consume too much resources
    if (env.data.search.query.trim().length < 2) {
      env.res.search_error = env.res.search_error || env.t('err_query_too_short');
    }
  });


  // Build SphinxQL query based on user input
  //
  // In:
  //  - env.params.skip
  //  - env.params.limit
  //  - env.data.section
  //  - env.data.search
  //  - section_stats (Boolean) - returns count(*) group by section_uid
  //
  // Out:
  //  - returns [ query, params ]
  //  - populates env.res.search_error (String) on error
  //
  async function build_query(env, section_stats) {
    let query = 'WHERE MATCH(?) AND public=1';
    let need_dist = false;
    let params = [ sphinx_escape(env.data.search.query) ];

    if (env.data.section && !env.data.search.search_all && !section_stats) {
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

    if (env.data.search.range && env.data.user.location) {
      query += ' AND has_location=1 AND calc_dist<=?';
      params.push(env.data.search.range);
      need_dist = true;
    }

    if (section_stats) {
      if (need_dist) {
        query = 'SELECT section_uid, count(*) AS count, ' +
                'GEODIST(latitude, longitude, ?, ?, {in=deg, out=km}) AS calc_dist ' +
                'FROM market_item_wishes ' + query;

        params.unshift(env.data.user.location[0]);
        params.unshift(env.data.user.location[1]);
      } else {
        query = 'SELECT section_uid, count(*) AS count FROM market_item_wishes ' + query;
      }

      // limit is 20 by default, need to increase it to get stats for all sections
      query += ' GROUP BY section_uid LIMIT 1000';
    } else {
      if (need_dist) {
        query = 'SELECT object_id, GEODIST(latitude, longitude, ?, ?, {in=deg, out=km}) AS calc_dist ' +
              'FROM market_item_wishes ' + query;

        params.unshift(env.data.user.location[0]);
        params.unshift(env.data.user.location[1]);
      } else {
        query = 'SELECT object_id FROM market_item_wishes ' + query;
      }

      // sort is either `date` or `rel`, sphinx searches by relevance by default
      if (env.data.search.sort === 'date') {
        query += ' ORDER BY ts DESC';
      }

      query += ' LIMIT ?,?';
      params.push(env.params.skip);
      params.push(env.params.limit + 1); // +1 is here to detect last chunk
    }

    return [ query, params ];
  }


  // Fetch search result statistics for each section
  //
  N.wire.before(apiPath, async function get_section_stats(env) {
    let [ query, params ] = await build_query(env, true);
    let counts_by_uid = {};

    if (!env.res.search_error) {
      for (let { section_uid, count } of await N.search.execute(query, params)) {
        counts_by_uid[section_uid] = count;
      }
    }

    let section_tree = await N.models.market.Section.getChildren();

    // not sanitizing because fetchSections only returns _id, hid and title
    let all_sections = _.keyBy(await fetchSections(), '_id');

    let sections_sorted = [];
    let nodes = {};

    // sort result in the same order as ids
    section_tree.forEach(subsectionInfo => {
      // ignore linked categories
      if (subsectionInfo.is_linked) return;

      let foundSection = _.find(all_sections, s => s._id.equals(subsectionInfo._id));

      if (!foundSection) return; // continue

      foundSection = Object.assign({}, foundSection);
      foundSection.level = subsectionInfo.level;
      foundSection.parent = subsectionInfo.parent._id ? subsectionInfo.parent._id.toString() : null;
      foundSection.search_results = counts_by_uid[docid_sections(N, foundSection.hid)] || 0;
      sections_sorted.push(foundSection);
      nodes[foundSection._id] = foundSection;
    });

    let expand_sections = { 'null': true };

    if (env.data.section && !env.data.search.search_all) {
      expand_sections[env.data.section._id] = true;

      for (let id of await N.models.market.Section.getParentList(env.data.section._id)) {
        expand_sections[id] = true;
      }
    }

    // calculate the number of results, do it in reverse order assuming
    // that children are always below parents in the list
    for (let i = sections_sorted.length - 1; i >= 0; i--) {
      let node = sections_sorted[i];

      if (nodes[node.parent]) {
        nodes[node.parent].search_results += node.search_results;
      }
    }

    env.res.search_stats = sections_sorted.filter(node => {
      // always show active node and its parents
      if (expand_sections[node._id]) return true;

      // show siblings only if there are any results found for them
      if (expand_sections[node.parent] && node.search_results > 0) return true;

      return false;
    });
  });


  // Send sql query to sphinx, get a response
  //
  async function build_item_ids(env) {
    let [ query, params ] = await build_query(env, false);
    let count;

    if (!env.res.search_error && env.params.skip < MAX_SKIP) {
      let [ results, count_ ] = await N.search.execute([
        [ query, params ],
        "SHOW META LIKE 'total_found'"
      ]);

      count = Number(count_[0].Value);

      env.data.item_ids = results.map(result => result.object_id).slice(0, env.params.limit);
      env.res.reached_end = results.length <= env.params.limit;
    } else {
      count = 0;
      env.data.item_ids = [];
      env.res.reached_end = true;
    }

    env.res.pagination = {
      total:        count,
      per_page:     env.data.items_per_page,
      chunk_offset: env.params.skip
    };
  }


  // Subcall item list
  //
  N.wire.on(apiPath, async function subcall_item_list(env) {
    env.data.build_item_ids = build_item_ids;
    env.data.items_per_page = await env.extras.settings.fetch('market_items_per_page');

    await N.wire.emit('internal:market.search_item_wish_list', env);
  });
};
