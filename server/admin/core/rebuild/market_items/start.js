// Start market rebuild
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});

  N.wire.on(apiPath, function market_items_rebuild_start() {
    return N.queue.market_items_rebuild().run();
  });
};
