// Add a widget displaying market rebuild progress
//
'use strict';


module.exports = function (N) {
  N.wire.after('server:admin.core.rebuild', { priority: 60 }, async function rebuild_market_items_widget(env) {
    let task = await N.queue.getTask('market_items_rebuild');
    let task_info = {};

    if (task && task.state !== 'finished') {
      task_info = {
        current: task.progress,
        total:   task.total
      };
    }

    env.res.blocks.push({ name: 'market_items', task_info });
  });
};
