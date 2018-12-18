// Close and archive old items
//
'use strict';


const _        = require('lodash');
const ObjectId = require('mongoose').Types.ObjectId;


module.exports = function (N) {

  N.wire.on('init:jobs', function register_market_item_offers_archive() {
    const task_name = 'market_item_offers_archive';

    if (!N.config.cron || !N.config.cron[task_name]) {
      return new Error(`No config defined for cron task "${task_name}"`);
    }

    N.queue.registerTask({
      name: task_name,
      pool: 'hard',
      cron: N.config.cron[task_name],
      async process() {
        let market_items_expire = await N.settings.get('market_items_expire');

        if (market_items_expire <= 0) return;

        let cutoff = Date.now() - market_items_expire * 24 * 60 * 60 * 1000;

        let docs = await N.models.market.ItemOffer.find()
                             .where('_id').lt(new ObjectId(cutoff / 1000)).lean(true);

        if (!docs.length) return;

        // fetch user for history entries
        let bot = await N.models.users.User.findOne()
                            .where('hid').equals(N.config.bots.default_bot_hid)
                            .lean(true);

        let sections = new Set();
        let statuses = N.models.market.ItemOffer.statuses;
        let bulk = N.models.market.ItemOfferArchived.collection.initializeUnorderedBulkOp();

        let changed_items_old = [];
        let changed_items_new = [];

        for (let item of docs) {
          sections.add(item.section.toString());

          let new_item = Object.assign({}, item);

          changed_items_old.push(item);
          changed_items_new.push(new_item);

          if (item.st === statuses.HB && item.ste === statuses.OPEN) {
            new_item.ste = statuses.CLOSED;
          } else if (item.st === statuses.OPEN) {
            new_item.st = statuses.CLOSED;
          }

          // update+upsert to avoid race condition if item was already archived
          bulk.find({ _id: new_item._id })
              .upsert()
              .update({ $set: new_item });
        }

        await bulk.execute();
        await N.models.market.ItemOffer.remove({ _id: { $in: _.map(docs, '_id') } });

        // write history for these changes
        N.models.market.ItemOfferHistory.add(
          changed_items_old,
          changed_items_new,
          {
            user: bot && bot._id,
            role: N.models.market.ItemOfferHistory.roles.TASK
          }
        );

        for (let section_id of sections) {
          await N.models.market.Section.updateCache(section_id);
        }
      }
    });
  });
};
