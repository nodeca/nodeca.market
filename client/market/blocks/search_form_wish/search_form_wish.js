
'use strict';


const bag = require('bagjs')({ prefix: 'nodeca' });


const OPTIONS_STORE_KEY = 'market_search_form_expanded';


// Expand search form on page load
//
N.wire.on(module.apiPath + ':init', function search_init() {
  return bag.get(OPTIONS_STORE_KEY).then(({ expanded }) => {
    if (expanded) $('#market_search_options').addClass('show');
  }).catch(() => {}); // suppress storage errors
});


function save_search_bar_options() {
  let expanded = $('#market_search_options').hasClass('show');

  return bag.set(OPTIONS_STORE_KEY, { expanded })
            .catch(() => {}); // suppress storage errors
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
