// Fetch bookmark data for market items
//
// In:
//
// - params.bookmarks - Array of N.models.users.Bookmark objects
// - params.user_info
//
// Out:
//
// - results - array of results corresponding to input bookmarks
// - users - array of user ids needed to fetch
//

'use strict';


const _                  = require('lodash');
const sanitize_item_wish = require('nodeca.market/lib/sanitizers/item_wish');
const sanitize_section   = require('nodeca.market/lib/sanitizers/section');


module.exports = function (N, apiPath) {

  // Find items
  //
  N.wire.on(apiPath, async function find_items(locals) {
    locals.sandbox = {};

    let items_active = await N.models.market.ItemWish.find()
                                 .where('_id').in(_.map(locals.params.bookmarks, 'src'))
                                 .lean(true);

    let items_archived = await N.models.market.ItemWishArchived.find()
                                   .where('_id').in(_.map(locals.params.bookmarks, 'src'))
                                   .lean(true);

    locals.sandbox.items = [].concat(items_active).concat(items_archived);

    locals.sandbox.sections = await N.models.market.Section.find()
                                        .where('_id')
                                        .in(_.uniq(locals.sandbox.items.map(item => String(item.section))))
                                        .lean(true);
  });


  // Check permissions for each item
  //
  N.wire.on(apiPath, async function check_permissions(locals) {
    if (!locals.sandbox.items.length) return;

    let sections_by_id = _.keyBy(locals.sandbox.sections, '_id');

    let is_item_public = {};

    let sections_used = {};

    let access_env = { params: {
      items: locals.sandbox.items,
      user_info: '000000000000000000000000', // guest
      preload: locals.sandbox.sections
    } };

    await N.wire.emit('internal:market.access.item_wish', access_env);

    locals.sandbox.items = locals.sandbox.items.filter((item, idx) => {
      let section = sections_by_id[item.section];
      if (!section) return;

      if (access_env.data.access_read[idx]) {
        sections_used[section._id] = section;
        is_item_public[item._id] = true;
        return true;
      }

      return false;
    });

    locals.sandbox.sections = _.values(sections_used);

    // Refresh "public" field in bookmarks
    //
    let bulk = N.models.users.Bookmark.collection.initializeUnorderedBulkOp();

    locals.params.bookmarks.forEach(bookmark => {
      if (bookmark.public === !!is_item_public[bookmark.src]) return;

      bulk.find({
        _id: bookmark._id
      }).update({
        $set: {
          'public': !!is_item_public[bookmark.src]
        }
      });
    });

    if (bulk.length > 0) await bulk.execute();
  });


  // Sanitize results
  //
  N.wire.on(apiPath, async function sanitize(locals) {
    if (!locals.sandbox.items.length) return;

    locals.sandbox.items    = await sanitize_item_wish(N, locals.sandbox.items, locals.params.user_info);
    locals.sandbox.sections = await sanitize_section(N, locals.sandbox.sections, locals.params.user_info);
  });


  // Fill results
  //
  N.wire.on(apiPath, function fill_results(locals) {
    locals.results = [];

    let items_by_id    = _.keyBy(locals.sandbox.items, '_id');
    let sections_by_id = _.keyBy(locals.sandbox.sections, '_id');

    locals.params.bookmarks.forEach(bookmark => {
      let item = items_by_id[bookmark.src];
      if (!item) return;

      let section = sections_by_id[item.section];
      if (!section) return;

      locals.results.push({
        _id: bookmark._id,
        type: 'market_item_wish',
        title: item.title,
        url: N.router.linkTo('market.item.wish', {
          section_hid: section.hid,
          item_hid:    item.hid
        }),
        item,
        section
      });
    });
  });


  // Fill users
  //
  N.wire.on(apiPath, function fill_users(locals) {
    let users = {};

    locals.results.forEach(result => {
      let item = result.item;

      if (item.user) users[item.user] = true;
      if (item.del_by) users[item.del_by] = true;
      if (item.import_users) item.import_users.forEach(id => { users[id] = true; });
    });

    locals.users = Object.keys(users);
  });
};
