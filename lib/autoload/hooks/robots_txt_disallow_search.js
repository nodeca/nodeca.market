// Disallow bots from accessing search methods
//

'use strict';


module.exports = function (N) {
  N.wire.after('server:common.robots', function robots_add_market_search(env) {
    env.body += 'Disallow: /market/search\n';
    env.body += 'Disallow: /market/wish/search\n';
  });
};
