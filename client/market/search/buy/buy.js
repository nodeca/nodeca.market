'use strict';


const _ = require('lodash');


// Page state
//
// - search:
//   - query:              search query (String)
//   - section:            only in this section and its subsections (ObjectId)
//   - is_new:             only new items (Boolean)
//   - barter:             only items with barter exchange terms (Boolean)
//   - delivery:           only items with delivery (Boolean)
//   - search_all:         ignore section, search everywhere (Boolean)
//   - price_min_value:    min price (Number)
//   - price_min_currency: min price currency (3-letter code, String)
//   - price_max_value:    max price (Number)
//   - price_max_currency: max price currency (3-letter code, String)
//   - range:              search within this many kms from user location
//                         (Number, rounded to either 100 or 200)
//   - sort:               sort type (`rel`, `date` or `price`)
//
// - first_offset:       offset of the first item in the DOM
// - current_offset:     offset of the current item (first in the viewport)
// - reached_end:        true if no more pages exist below last loaded one
// - next_loading_start: time when current xhr request for the next page is started
// - item_count:         total amount of items
// - per_page:           amount of items loaded on each request (for prefetch)
// - bottom_marker:      last item id (for prefetch)
// - first_page_loaded:  true if results block (section stats + first N results) has been loaded
//
let pageState = {};

let $window = $(window);

// height of a space between text content of a post and the next post header
const TOP_OFFSET = 48;

const navbarHeight = parseInt($('body').css('margin-top'), 10) + parseInt($('body').css('padding-top'), 10);


// Show/hide loading placeholders when new items are fetched,
// adjust scroll when adding/removing top placeholder
//
function reset_loading_placeholders() {
  let next = $('.market-search-buy__loading-next');

  // if last item is loaded, hide bottom placeholder
  if (pageState.reached_end) {
    next.addClass('d-none');
  } else {
    next.removeClass('d-none');
  }
}


/////////////////////////////////////////////////////////////////////
// init on page load
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup() {
  let pagination = N.runtime.page_data.pagination;

  pageState.search             = N.runtime.page_data.search;
  pageState.first_offset       = pagination.chunk_offset;
  pageState.current_offset     = -1;
  pageState.item_count         = pagination.total;
  pageState.per_page           = pagination.per_page;
  pageState.reached_end        = false;
  pageState.next_loading_start = 0;
  pageState.bottom_marker      = 0;
  pageState.first_page_loaded  = false;

  $window.scrollTop(0);
});


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


/////////////////////////////////////////////////////////////////////
// When user scrolls the page:
//
//  1. update progress bar
//  2. show/hide navbar
//
let progressScrollHandler = null;


N.wire.on('navigate.done:' + module.apiPath, function progress_updater_init() {
  progressScrollHandler = _.debounce(function update_progress_on_scroll() {
    // If we scroll below page head, show the secondary navbar
    //
    let head = document.getElementsByClassName('page-head');

    if (head.length && head[0].getBoundingClientRect().bottom > navbarHeight) {
      $('.navbar').removeClass('navbar__m-secondary');
    } else {
      $('.navbar').addClass('navbar__m-secondary');
    }

    // Update progress bar
    //
    let items         = document.getElementsByClassName('market-search-buy-item');
    let itemThreshold = navbarHeight + TOP_OFFSET;
    let offset;
    let currentIdx;

    // Get offset of the first item in the viewport
    //
    currentIdx = _.sortedIndexBy(items, null, e => {
      if (!e) { return itemThreshold; }
      return e.getBoundingClientRect().top;
    }) - 1;

    offset = currentIdx + pageState.first_offset;

    N.wire.emit('common.blocks.navbar.blocks.page_progress:update', {
      current: offset + 1 // `+1` because offset is zero based
    }).catch(err => N.wire.emit('error', err));
  }, 100, { maxWait: 100 });

  // avoid executing it on first tick because of initial scrollTop()
  setTimeout(() => {
    $window.on('scroll', progressScrollHandler);
  });

  // execute it once on page load
  progressScrollHandler();
});


N.wire.on('navigate.exit:' + module.apiPath, function progress_updater_teardown() {
  if (!progressScrollHandler) return;
  progressScrollHandler.cancel();
  $window.off('scroll', progressScrollHandler);
  progressScrollHandler = null;
});


// Init handlers
//
N.wire.once('navigate.done:' + module.apiPath, function market_section_init_handlers() {

  ///////////////////////////////////////////////////////////////////////////
  // Whenever we are close to beginning/end of item list, check if we can
  // load more pages from the server
  //

  // A delay after failed xhr request (delay between successful requests
  // is set with affix `throttle` argument)
  //
  // For example, suppose user continuously scrolls. If server is up, each
  // subsequent request will be sent each 100 ms. If server goes down, the
  // interval between request initiations goes up to 2000 ms.
  //
  const LOAD_AFTER_ERROR = 2000;

  N.wire.on(module.apiPath + ':load_next', function load_next_page() {
    if (pageState.reached_end) return;

    let now = Date.now();

    // `next_loading_start` is the last request start time, which is reset to 0 on success
    //
    // Thus, successful requests can restart immediately, but failed ones
    // will have to wait `LOAD_AFTER_ERROR` ms.
    //
    if (Math.abs(pageState.next_loading_start - now) < LOAD_AFTER_ERROR) return;

    pageState.next_loading_start = now;

    N.io.rpc('market.search.buy.results',
      Object.assign({}, pageState.search, { skip: pageState.bottom_marker, limit: pageState.per_page })
    ).then(res => {
      if (res.reached_end) {
        pageState.reached_end = true;
        reset_loading_placeholders();
      }

      pageState.bottom_marker += res.items.length;
      pageState.first_offset  = res.pagination.chunk_offset - $('.market-search-buy-item').length;
      pageState.item_count    = res.pagination.total;

      let navigate_update_params;

      if (pageState.first_page_loaded) {
        let $result = $(N.runtime.render('market.blocks.search_item_offer_list', res));

        navigate_update_params = {
          $:      $result,
          locals: res,
          $after: $('.market-search-buy__item-list > :last')
        };
      } else {
        let $result = $(N.runtime.render('market.search.buy.results', res));

        navigate_update_params = {
          $:        $result,
          locals:   res,
          $replace: $('.market-search-buy__results')
        };
        pageState.first_page_loaded = true;
      }

      return N.wire.emit('navigate.update', navigate_update_params).then(() => {
        // reset lock
        pageState.next_loading_start = 0;

        return N.wire.emit('common.blocks.navbar.blocks.page_progress:update', {
          max: pageState.item_count
        });
      });
    }).catch(err => {
      N.wire.emit('error', err);
    });
  });


  // When user clicks "create dialog" button in usercard popup,
  // add title & link to editor.
  //
  N.wire.before('users.dialog.create:begin', function dialog_create_extend_market_items(params) {
    if (!params || !params.ref) return; // no data to extend
    if (!/^market_search_buy_item:/.test(params.ref)) return; // not our data

    let [ , section_hid, item_hid ] = params.ref.split(':');
    let title = $(`#item${item_hid} .market-search-buy-item__title-text`).text();
    let href  = N.router.linkTo('market.item.buy', { section_hid, item_hid });

    if (title && href) {
      params.text = `Re: [${title}](${href})\n\n`;
    }
  });
});
