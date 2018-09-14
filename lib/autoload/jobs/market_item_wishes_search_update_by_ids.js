// Add market items to search index
//
'use strict';


const _                 = require('lodash');
const docid_item_wishes = require('nodeca.market/lib/search/docid_item_wishes');
const docid_sections    = require('nodeca.market/lib/search/docid_sections');
const userInfo          = require('nodeca.users/lib/user_info');


module.exports = function (N) {

  N.wire.on('init:jobs', function register_market_item_wishes_search_update_by_ids() {

    N.queue.registerTask({
      name: 'market_item_wishes_search_update_by_ids',
      pool: 'hard',
      removeDelay: 3600,
      async process(ids, options = {}) {
        let items = await N.models.market.ItemWish.find()
                                .where('_id').in(ids)
                                .lean(true);

        let sections = await N.models.market.Section.find()
                                 .where('_id').in(_.uniq(items.map(item => String(item.section))))
                                 .lean(true);

        if (!items.length) return;

        let sections_by_id = _.keyBy(sections, '_id');

        let user_info = await userInfo(N, null);

        let access_env = { params: {
          items,
          user_info
        } };

        await N.wire.emit('internal:market.access.item_wish', access_env);

        let values = [];
        let args = [];

        for (let idx = 0; idx < items.length; idx++) {
          let item      = items[idx];
          let is_public = access_env.data.access_read[idx];

          let section = sections_by_id[item.section];

          if (!section) {
            N.logger.error(`Cannot find market section ${item.section} referred by item ${item._id}`);
            continue;
          }

          // only check `st` for posts assuming st=HB,ste=VISIBLE posts aren't public
          let visible = item.st === N.models.market.ItemWish.statuses.VISIBLE;

          values.push('(?,?,?,?,?,?,?,?,?,?,?)');

          args.push(
            // id
            docid_item_wishes(N, item.hid),
            // title
            item.title,
            // content
            item.html,
            // section_uid
            docid_sections(N, section.hid),
            // latitude
            item.location && item.location[1] || 0,
            // longitude
            item.location && item.location[0] || 0,
            // has_location (sphinx can't have NULLs, so we need to
            // distinguish between location not available and actual 0:0)
            item.location && item.location.length > 0 ? 1 : 0,
            // object_id
            String(item._id),
            // public
            (is_public && visible) ? 1 : 0,
            // visible
            visible ? 1 : 0,
            // ts
            Math.floor(item.ts / 1000)
          );
        }

        let query = `
          REPLACE INTO market_item_wishes
          (id, title, content, section_uid, latitude, longitude, has_location, object_id, public, visible, ts)
          VALUES ${values.join(', ')}
        `.replace(/\n\s*/mg, '');

        if (options.shadow) {
          await N.search.execute_shadow(query, args);
        } else {
          await N.search.execute(query, args);
        }
      }
    });
  });
};
