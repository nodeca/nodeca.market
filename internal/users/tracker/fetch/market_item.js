// Fetch items for tracker
//
// In:
//
//  - params.user_info
//  - params.subscriptions
//  - params.start (optional) - last last_ts from previous page
//  - params.limit - max number of items, 0 means return count only
//
// Out:
//  - count
//  - items - { type, last_ts, id }
//  - next  - last last_ts (contents of params.start for the next page),
//            null if last page
//  - users - merged with env.data.users
//  - res   - misc data (specific to template, merged with env.res)
//

'use strict';


const ObjectId            = require('mongoose').Types.ObjectId;
const _                   = require('lodash');
const sanitize_item_offer = require('nodeca.market/lib/sanitizers/item_offer');
const sanitize_item_wish  = require('nodeca.market/lib/sanitizers/item_offer');
const sanitize_section    = require('nodeca.market/lib/sanitizers/section');


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function tracker_fetch_items(locals) {
    locals.res = {};

    let offer_subs = locals.params.subscriptions.filter(s => s.to_type === N.shared.content_type.MARKET_SECTION_OFFER);
    let wish_subs  = locals.params.subscriptions.filter(s => s.to_type === N.shared.content_type.MARKET_SECTION_WISH);

    let item_offers = [];
    let item_wishes = [];

    if (offer_subs.length !== 0) {
      let cuts = await N.models.users.Marker.cuts(
        locals.params.user_info.user_id,
        offer_subs.map(s => s.to + '_offers'));

      let queryParts = [];

      for (let [ id, cutTs ] of Object.entries(cuts)) {
        id = id.replace('_offers', '');
        queryParts.push({ section: id, _id: { $gt: new ObjectId(Math.round(cutTs / 1000)) } });
      }

      item_offers = item_offers.concat(await N.models.market.ItemOffer.find({ $or: queryParts }).lean(true) || []);
    }

    if (wish_subs.length !== 0) {
      let cuts = await N.models.users.Marker.cuts(
        locals.params.user_info.user_id,
        offer_subs.map(s => s.to + '_wishes'));

      let queryParts = [];

      for (let [ id, cutTs ] of Object.entries(cuts)) {
        id = id.replace('_wishes', '');
        queryParts.push({ section: id, _id: { $gt: new ObjectId(Math.round(cutTs / 1000)) } });
      }

      item_wishes = item_wishes.concat(await N.models.market.ItemWish.find({ $or: queryParts }).lean(true) || []);
    }

    // Fetch read marks
    //
    let data;

    data = item_offers.map(item => ({
      categoryId: item.section + '_offers',
      contentId: item._id,
      lastPostNumber: 1,
      lastPostTs: item.ts
    }));

    let read_marks_offers = await N.models.users.Marker.info(locals.params.user_info.user_id, data);

    data = item_wishes.map(item => ({
      categoryId: item.section + '_wishes',
      contentId: item._id,
      lastPostNumber: 1,
      lastPostTs: item.ts
    }));

    let read_marks_wishes = await N.models.users.Marker.info(locals.params.user_info.user_id, data);


    // Filter new and unread items
    item_offers = item_offers
                    .filter(item => read_marks_offers[item._id].isNew || read_marks_offers[item._id].next !== -1);
    item_wishes = item_wishes
                    .filter(item => read_marks_wishes[item._id].isNew || read_marks_wishes[item._id].next !== -1);

    // Fetch sections
    let sections = await N.models.market.Section.find()
                             .where('_id').in(
                               [ ...item_offers.map(t => t.section), ...item_wishes.map(t => t.section) ]
                             )
                             .lean(true);


    // Check permissions subcall
    //
    let access_env;

    access_env = { params: {
      items: item_offers,
      user_info: locals.params.user_info,
      preload: sections
    } };

    await N.wire.emit('internal:market.access.item_offer', access_env);

    item_offers = item_offers.filter((__, idx) => access_env.data.access_read[idx]);

    access_env = { params: {
      items: item_wishes,
      user_info: locals.params.user_info,
      preload: sections
    } };

    await N.wire.emit('internal:market.access.item_wish', access_env);

    item_wishes = item_wishes.filter((__, idx) => access_env.data.access_read[idx]);


    // Remove items created by ignored users (except for subscribed ones)
    //
    let item_subs_by_id = { ..._.keyBy(offer_subs, 'to'), ..._.keyBy(wish_subs, 'to') };

    let first_users = Array.from(new Set(
      [ ...item_offers.map(x => x.user), ...item_wishes.map(x => x.user) ].filter(Boolean).map(String)
    ));

    let ignored = _.keyBy(
      await N.models.users.Ignore.find()
                .where('from').equals(locals.params.user_info.user_id)
                .where('to').in(first_users)
                .select('from to -_id')
                .lean(true),
      'to'
    );

    item_offers = item_offers.filter(item => {
      // Author is ignored, and item is not subscribed to
      if (ignored[item.user] &&
          !item_subs_by_id[item._id]) {

        return false;
      }

      return true;
    });

    item_wishes = item_wishes.filter(item => {
      // Author is ignored, and item is not subscribed to
      if (ignored[item.user] &&
          !item_subs_by_id[item._id]) {

        return false;
      }

      return true;
    });


    let items = [];

    item_offers.forEach(item => {
      items.push({
        type: 'market_item_offer',
        last_ts: item.ts,
        id: String(item._id)
      });
    });

    item_wishes.forEach(item => {
      items.push({
        type: 'market_item_wish',
        last_ts: item.ts,
        id: String(item._id)
      });
    });

    locals.count = items.length;

    if (locals.params.limit > 0) {
      if (locals.params.start) items = items.filter(item => item.last_ts.valueOf() < locals.params.start);

      let items_sorted  = items.sort((a, b) => b.last_ts - a.last_ts);
      let items_on_page = items_sorted.slice(0, locals.params.limit);

      locals.items = items_on_page;
      locals.next = items_sorted.length > items_on_page.length ?
                    items_on_page[items_on_page.length - 1].last_ts.valueOf() :
                    null;

      // Filter only items that are on this page
      //
      let item_ids = new Set();
      for (let { id } of items_on_page) item_ids.add(id);
      item_offers = item_offers.filter(x => item_ids.has(String(x._id)));
      item_wishes = item_wishes.filter(x => item_ids.has(String(x._id)));

      // Sanitize topics
      //
      item_offers = await sanitize_item_offer(N, item_offers, locals.params.user_info);
      item_wishes = await sanitize_item_wish(N, item_wishes, locals.params.user_info);
      locals.res.market_item_offers = _.keyBy(item_offers, '_id');
      locals.res.market_item_wishes = _.keyBy(item_wishes, '_id');

      // Filter only sections with topics on this page
      //
      let section_ids = new Set();
      for (let { section } of item_offers) section_ids.add(section.toString());
      for (let { section } of item_wishes) section_ids.add(section.toString());
      sections = sections.filter(section => section_ids.has(section._id.toString()));

      // Sanitize sections
      //
      sections = await sanitize_section(N, sections, locals.params.user_info);
      locals.res.market_sections = _.keyBy(sections, '_id');

      // Collect user ids
      //
      locals.users = locals.users || [];
      locals.users = locals.users.concat(item_offers.map(item => item.user).filter(Boolean));
      locals.users = locals.users.concat(item_wishes.map(item => item.user).filter(Boolean));

      locals.res.read_marks = {};
      for (let { _id } of item_offers) locals.res.read_marks[_id] = read_marks_offers[_id];
      for (let { _id } of item_wishes) locals.res.read_marks[_id] = read_marks_wishes[_id];
    }
  });
};
