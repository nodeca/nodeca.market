'use strict';

// Init search form
//
N.wire.on('navigate.done:' + module.apiPath, function search_form_init() {
  return N.wire.emit('market.blocks.search_form_buy:init');
});


// Inject sort argument into the query
//
N.wire.before('market.blocks.search_form_buy:search', function inject_sort(data) {
  data.fields.sort = $('.market-search-buy__select-order').val();
});
