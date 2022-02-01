'use strict';


const bkv = require('bkv').shared();


const OPTIONS_STORE_KEY = 'market_search_form_expanded';


// Expand search form on page load
//
N.wire.on(module.apiPath + ':init', async function search_init() {
  let { expanded, currency_min, currency_max } = await bkv.get(OPTIONS_STORE_KEY, {});
  if (expanded) $('#market_search_options').addClass('show');
  if (currency_min) $('.market-search-form-buy__price-currency[name="price_min_currency"]').val(currency_min);
  if (currency_max) $('.market-search-form-buy__price-currency[name="price_max_currency"]').val(currency_max);
});


function save_search_bar_options() {
  let expanded = $('#market_search_options').hasClass('show');
  let currency_min = $('.market-search-form-buy__price-currency[name="price_min_currency"]').val();
  let currency_max = $('.market-search-form-buy__price-currency[name="price_max_currency"]').val();

  return bkv.set(OPTIONS_STORE_KEY, { expanded, currency_min, currency_max });
}


// Toggle form options
//
N.wire.on(module.apiPath + ':search_options', function do_options() {
  let expanded = !$('#market_search_options').hasClass('show');

  if (expanded) $('#market_search_options').collapse('show');
  else $('#market_search_options').collapse('hide');

  save_search_bar_options();
});


// Store currency to localstorage when it changes
//
N.wire.on(module.apiPath + ':price_change', function price_change() {
  save_search_bar_options();
});


// Perform search after user clicks on "search" button
//
N.wire.on(module.apiPath + ':search', function do_search(data) {
  // Do nothing on empty field. Useful when user change
  // options with empty query
  if (!data.fields.query.length) return;

  return N.wire.emit('navigate.to', {
    apiPath: 'market.search.buy',
    params: { $query: data.fields }
  });
});
