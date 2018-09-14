// Combined task for rebuilding market items
//
'use strict';

const Queue = require('idoit');


module.exports = function (N) {
  N.wire.on('init:jobs', function register_market_items_rebuild() {

    N.queue.registerTask({
      name: 'market_items_rebuild',
      pool: 'hard',
      baseClass: Queue.ChainTemplate,

      // static id to make sure it will never be executed twice at the same time
      taskID: () => 'market_items_rebuild',

      init() {
        return [
          N.queue.market_item_offers_rebuild(),
          N.queue.market_item_wishes_rebuild()
        ];
      }
    });


    N.queue.on('task:progress:market_items_rebuild', function (task_info) {
      N.live.debounce('admin.core.rebuild.market_items', {
        uid:     task_info.uid,
        current: task_info.progress,
        total:   task_info.total
      });
    });


    N.queue.on('task:end:market_items_rebuild', function (task_info) {
      N.live.emit('admin.core.rebuild.market_items', {
        uid:      task_info.uid,
        finished: true
      });
    });
  });
};
