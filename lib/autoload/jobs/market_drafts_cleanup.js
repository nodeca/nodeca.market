// Remove old drafts from database
//
'use strict';


module.exports = function (N) {

  N.wire.on('init:jobs', function register_market_drafts_cleanup() {
    const task_name = 'market_drafts_cleanup';

    if (!N.config.cron || !N.config.cron[task_name]) {
      return new Error(`No config defined for cron task "${task_name}"`);
    }

    N.queue.registerTask({
      name: task_name,
      pool: 'hard',
      cron: N.config.cron[task_name],
      async process() {
        let market_drafts_expire = await N.settings.get('market_drafts_expire');

        if (market_drafts_expire <= 0) return;

        // Find all expired drafts
        let docs = await N.models.market.Draft.find()
                             .where('ts').lt(Date.now() - market_drafts_expire * 24 * 60 * 60 * 1000);

        // Remove one by one to use mongoose pre remove hooks
        await Promise.all(docs.map(doc => doc.remove()));
      }
    });
  });
};
