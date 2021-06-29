// Close and archive old items
//
'use strict';


const _ = require('lodash');


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
        let now = new Date();
        let docs = await N.models.market.ItemOffer.find()
                             .where('autoclose_at_ts').lt(now).lean(true);

        if (!docs.length) return;

        // fetch user for history entries
        let bot = await N.models.users.User.findOne()
                            .where('hid').equals(N.config.bots.default_bot_hid)
                            .lean(true);

        let sections = new Set();
        let statuses = N.models.market.ItemOffer.statuses;
        let bulk = N.models.market.ItemOfferArchived.collection.initializeUnorderedBulkOp();

        let changes = [];

        for (let item of docs) {
          sections.add(item.section.toString());

          let new_item = Object.assign({}, item);

          changes.push({
            old_item: item,
            new_item
          });

          new_item.closed_at_ts = now;

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
        await N.models.market.ItemOffer.deleteMany({ _id: { $in: docs.map(x => x._id) } });

        // write history for these changes
        await N.models.market.ItemOfferHistory.add(
          changes,
          {
            user: bot?._id,
            role: N.models.market.ItemOfferHistory.roles.TASK
          }
        );

        // update section cache
        for (let section_id of sections) {
          await N.models.market.Section.updateCache(section_id);
        }

        // update user cache
        let users = _.uniq(docs.map(x => x.user).map(String));

        await N.models.market.UserItemOfferCount.recount(users);
        await N.models.market.UserItemOfferArchivedCount.recount(users);
      }
    });
  });
};
