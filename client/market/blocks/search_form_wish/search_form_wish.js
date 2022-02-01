
'use strict';


const bkv = require('bkv').shared();


const OPTIONS_STORE_KEY = 'market_search_form_expanded';


// Expand search form on page load
//
N.wire.on(module.apiPath + ':init', async function search_init() {
  let { expanded } = await bkv.get(OPTIONS_STORE_KEY, {});
  if (expanded) $('#market_search_options').addClass('show');
});


function save_search_bar_options() {
  let expanded = $('#market_search_options').hasClass('show');

  return bkv.set(OPTIONS_STORE_KEY, { expanded });
}


// Toggle form options
//
N.wire.on(module.apiPath + ':search_options', function do_options() {
  let expanded = !$('#market_search_options').hasClass('show');

  if (expanded) $('#market_search_options').collapse('show');
  else $('#market_search_options').collapse('hide');

  save_search_bar_options();
});


// Perform search after user clicks on "search" button
//
N.wire.on(module.apiPath + ':search', function do_search(data) {
  // Do nothing on empty field. Useful when user change
  // options with empty query
  if (!data.fields.query.length) return;

  return N.wire.emit('navigate.to', {
    apiPath: 'market.search.wish',
    params: { $query: data.fields }
  });
});
