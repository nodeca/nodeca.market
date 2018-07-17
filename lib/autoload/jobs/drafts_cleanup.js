// Remove old drafts from database
//
'use strict';


const DRAFT_EXPIRE_TIMEOUT = 7 * 24 * 60 * 60 * 1000; // 7 days


module.exports = function (N) {

  N.wire.on('init:jobs', function register_drafts_cleanup() {
    const task_name = 'drafts_cleanup';

    if (!N.config.cron || !N.config.cron[task_name]) {
      return new Error(`No config defined for cron task "${task_name}"`);
    }

    N.queue.registerTask({
      name: task_name,
      pool: 'hard',
      cron: N.config.cron[task_name],
      async process() {

        // Find all expired drafts
        let docs = await N.models.market.Draft.find()
                             .where('ts').lt(Date.now() - DRAFT_EXPIRE_TIMEOUT);

        // Remove one by one to use mongoose pre remove hooks
        await Promise.all(docs.map(doc => doc.remove()));
      }
    });
  });
};
