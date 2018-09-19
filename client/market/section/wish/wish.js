'use strict';


const _ = require('lodash');


// Page state
//
// - hid:                current section hid
// - first_offset:       offset of the first item in the DOM
// - current_offset:     offset of the current item (first in the viewport)
// - reached_start:      true if no more pages exist above first loaded one
// - reached_end:        true if no more pages exist below last loaded one
// - prev_loading_start: time when current xhr request for the previous page is started
// - next_loading_start: time when current xhr request for the next page is started
// - item_count:         total amount of items
// - top_marker:         first item id (for prefetch)
// - bottom_marker:      last item id (for prefetch)
//
let pageState = {};

let $window = $(window);

// whenever there are more than 600 items, cut off-screen items down to 400
const CUT_ITEMS_MAX = 600;
const CUT_ITEMS_MIN = 400;

// height of a space between text content of a post and the next post header
const TOP_OFFSET = 48;

const navbarHeight = parseInt($('body').css('margin-top'), 10) + parseInt($('body').css('padding-top'), 10);


/////////////////////////////////////////////////////////////////////
// init on page load
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup(data) {
  let pagination    = N.runtime.page_data.pagination,
      last_item_hid = $('.market-section-wish').data('last-item-hid');

  pageState.hid                = data.params.section_hid;
  pageState.first_offset       = pagination.chunk_offset;
  pageState.current_offset     = -1;
  pageState.item_count         = pagination.total;
  pageState.reached_start      = pageState.first_offset === 0;
  pageState.reached_end        = last_item_hid === $('.market-section-wish__item-list > :last').data('item-hid');
  pageState.prev_loading_start = 0;
  pageState.next_loading_start = 0;
  pageState.top_marker         = $('.market-section-wish').data('top-marker');
  pageState.bottom_marker      = $('.market-section-wish').data('bottom-marker');

  // disable automatic scroll to an anchor in the navigator
  data.no_scroll = true;

  if (data.state && typeof data.state.hid !== 'undefined' && typeof data.state.offset !== 'undefined') {
    let el = $('#item' + data.state.hid);

    if (el.length) {
      $window.scrollTop(el.offset().top - navbarHeight - TOP_OFFSET + data.state.offset);
      return;
    }
  } else if (data.params.$query && data.params.$query.from) {
    let el = $('#item' + Number(data.params.$query.from));

    if (el.length) {
      $window.scrollTop(el.offset().top - $('.navbar').height() - TOP_OFFSET);
      el.addClass('market-section-wish-item__m-highlight');
      return;
    }
  }

  // If we're on the first page, scroll to the top;
  // otherwise scroll to the first item
  //
  if (pagination.chunk_offset > 1 && $('.market-section-wish__item-list').length) {
    $window.scrollTop($('.market-section-wish__item-list').offset().top - $('.navbar').height());

  } else {
    $window.scrollTop(0);
  }
});

// Init search form
//
N.wire.on('navigate.done:' + module.apiPath, function search_form_init() {
  return N.wire.emit('market.blocks.search_form_wish:init');
});


/////////////////////////////////////////////////////////////////////
// Change URL when user scrolls the page
//
// Use a separate debouncer that only fires when user stops scrolling,
// so it's executed a lot less frequently.
//
// The reason is that `history.replaceState` is very slow in FF
// on large pages: https://bugzilla.mozilla.org/show_bug.cgi?id=1250972
//
let locationScrollHandler = null;

N.wire.on('navigate.done:' + module.apiPath, function location_updater_init() {
  if ($('.market-section-wish__item-list').length === 0) return;

  locationScrollHandler = _.debounce(function update_location_on_scroll() {
    let items         = document.getElementsByClassName('market-section-wish-item');
    let itemThreshold = navbarHeight + TOP_OFFSET;
    let offset;
    let currentIdx;

    // Get offset of the first item in the viewport;
    // "-1" means user sees navigation above all items
    //
    currentIdx = _.sortedIndexBy(items, null, item => {
      if (!item) { return itemThreshold; }
      return item.getBoundingClientRect().top;
    }) - 1;

    let href = null;
    let state = null;

    offset = currentIdx + pageState.first_offset;

    if (currentIdx >= 0 && items.length) {
      state = {
        hid:    $(items[currentIdx]).data('item-hid'),
        offset: itemThreshold - items[currentIdx].getBoundingClientRect().top
      };
    }

    // save current offset, and only update url if offset is different
    if (pageState.current_offset !== offset) {
      let $query = {};

      if (currentIdx >= 0) {
        $query.from = $(items[currentIdx]).data('item-hid');
      }

      href = N.router.linkTo('market.section.wish', {
        section_hid: pageState.hid,
        $query
      });

      if (pageState.current_offset < 0 && offset >= 0) {
        $('head').append($('<meta name="robots" content="noindex,follow">'));
      } else if (pageState.current_offset >= 0 && offset < 0) {
        $('meta[name="robots"]').remove();
      }

      pageState.current_offset = offset;
    }

    N.wire.emit('navigate.replace', { href, state });
  }, 500);

  // avoid executing it on first tick because of initial scrollTop()
  setTimeout(() => {
    $window.on('scroll', locationScrollHandler);
  }, 1);
});

N.wire.on('navigate.exit:' + module.apiPath, function location_updater_teardown() {
  if (!locationScrollHandler) return;
  locationScrollHandler.cancel();
  $window.off('scroll', locationScrollHandler);
  locationScrollHandler = null;
});


/////////////////////////////////////////////////////////////////////
// When user scrolls the page:
//
//  1. update progress bar
//  2. show/hide navbar
//
let progressScrollHandler = null;


N.wire.on('navigate.done:' + module.apiPath, function progress_updater_init() {
  if ($('.market-section-wish__item-list').length === 0) return;

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
    let items         = document.getElementsByClassName('market-section-wish-item');
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


// Show/hide loading placeholders when new items are fetched,
// adjust scroll when adding/removing top placeholder
//
function reset_loading_placeholders() {
  let prev = $('.market-section-wish__loading-prev');
  let next = $('.market-section-wish__loading-next');

  // if topmost item is loaded, hide top placeholder
  if (pageState.reached_start) {
    if (!prev.hasClass('d-none')) {
      $window.scrollTop($window.scrollTop() - prev.outerHeight(true));
      prev.addClass('d-none');
    }

  } else {
    /* eslint-disable no-lonely-if */
    if (prev.hasClass('d-none')) {
      prev.removeClass('d-none');
      $window.scrollTop($window.scrollTop() + prev.outerHeight(true));
    }
  }

  // if last item is loaded, hide bottom placeholder
  if (pageState.reached_end) {
    next.addClass('d-none');
  } else {
    next.removeClass('d-none');
  }
}


// Init handlers
//
N.wire.once('navigate.done:' + module.apiPath, function market_section_init_handlers() {

  ///////////////////////////////////////////////////////////////////////////
  // Whenever we are close to beginning/end of item list, check if we can
  // load more pages from the server
  //

  // an amount of items we try to load when user scrolls to the end of the page
  const LOAD_ITEMS_COUNT = N.runtime.page_data.pagination.per_page;

  // A delay after failed xhr request (delay between successful requests
  // is set with affix `throttle` argument)
  //
  // For example, suppose user continuously scrolls. If server is up, each
  // subsequent request will be sent each 100 ms. If server goes down, the
  // interval between request initiations goes up to 2000 ms.
  //
  const LOAD_AFTER_ERROR = 2000;

  N.wire.on(module.apiPath + ':load_prev', function load_prev_page() {
    if (pageState.reached_start) return;

    let last_item_id = pageState.top_marker;

    // No items on the page
    if (!last_item_id) return;

    let now = Date.now();

    // `prev_loading_start` is the last request start time, which is reset to 0 on success
    //
    // Thus, successful requests can restart immediately, but failed ones
    // will have to wait `LOAD_AFTER_ERROR` ms.
    //
    if (Math.abs(pageState.prev_loading_start - now) < LOAD_AFTER_ERROR) return;

    pageState.prev_loading_start = now;

    N.io.rpc('market.section.wish.list.by_range', {
      section_hid: pageState.hid,
      start:       last_item_id,
      before:      LOAD_ITEMS_COUNT,
      after:       0
    }).then(res => {
      if (!res.items) return;

      if (res.items.length !== LOAD_ITEMS_COUNT) {
        pageState.reached_start = true;
        reset_loading_placeholders();
      }

      if (res.items.length === 0) return;

      pageState.top_marker    = res.items[0]._id;
      pageState.first_offset  = res.pagination.chunk_offset;
      pageState.item_count   = res.pagination.total;

      // update prev/next metadata
      $('link[rel="prev"]').remove();

      if (res.head.prev) {
        let link = $('<link rel="prev">');

        link.attr('href', res.head.prev);
        $('head').append(link);
      }

      let old_height = $('.market-section-wish__item-list').height();

      // render & inject item list
      let $result = $(N.runtime.render('market.blocks.section_item_request_list', res));

      return N.wire.emit('navigate.update', {
        $:       $result,
        locals:  res,
        $before: $('.market-section-wish__item-list > :first')
      }).then(() => {
        // update scroll so it would point at the same spot as before
        $window.scrollTop($window.scrollTop() + $('.market-section-wish__item-list').height() - old_height);

        //
        // Limit total amount of posts in DOM
        //
        let items = document.getElementsByClassName('market-section-wish-item');
        let cut_count = items.length - CUT_ITEMS_MIN;

        if (cut_count > CUT_ITEMS_MAX - CUT_ITEMS_MIN) {
          let item = items[items.length - cut_count - 1];

          // This condition is a safeguard to prevent infinite loop,
          // which happens if we remove a post on the screen and trigger
          // prefetch in the opposite direction (test it with
          // CUT_ITEMS_MAX=10, CUT_ITEMS_MIN=0)
          if (item.getBoundingClientRect().top > $window.height() + 600) {
            $(item).nextAll().remove();

            // Update range for the next time we'll be doing prefetch
            pageState.bottom_marker = $('.market-section-wish-item:last').data('item-id');

            pageState.reached_end = false;
            reset_loading_placeholders();
          }
        }

        // reset lock
        pageState.prev_loading_start = 0;

        return N.wire.emit('common.blocks.navbar.blocks.page_progress:update', {
          max: pageState.item_count
        });
      });
    }).catch(err => {
      N.wire.emit('error', err);
    });
  });


  N.wire.on(module.apiPath + ':load_next', function load_next_page() {
    if (pageState.reached_end) return;

    let last_item_id = pageState.bottom_marker;

    // No items on the page
    if (!last_item_id) return;

    let now = Date.now();

    // `next_loading_start` is the last request start time, which is reset to 0 on success
    //
    // Thus, successful requests can restart immediately, but failed ones
    // will have to wait `LOAD_AFTER_ERROR` ms.
    //
    if (Math.abs(pageState.next_loading_start - now) < LOAD_AFTER_ERROR) return;

    pageState.next_loading_start = now;

    N.io.rpc('market.section.wish.list.by_range', {
      section_hid: pageState.hid,
      start:       last_item_id,
      before:      0,
      after:       LOAD_ITEMS_COUNT
    }).then(res => {
      if (!res.items) return;

      if (res.items.length !== LOAD_ITEMS_COUNT) {
        pageState.reached_end = true;
        reset_loading_placeholders();
      }

      if (res.items.length === 0) return;

      pageState.bottom_marker = res.items[res.items.length - 1]._id;
      pageState.first_offset  = res.pagination.chunk_offset - $('.market-section-wish-item').length;
      pageState.topic_count   = res.pagination.total;

      // update prev/next metadata
      $('link[rel="next"]').remove();

      if (res.head.next) {
        let link = $('<link rel="next">');

        link.attr('href', res.head.next);
        $('head').append(link);
      }

      // render & inject item list
      let $result = $(N.runtime.render('market.blocks.section_item_request_list', res));

      return N.wire.emit('navigate.update', {
        $:      $result,
        locals: res,
        $after: $('.market-section-wish__item-list > :last')
      }).then(() => {
        //
        // Limit total amount of posts in DOM
        //
        let items = document.getElementsByClassName('market-section-wish-item');
        let cut_count = items.length - CUT_ITEMS_MIN;

        if (cut_count > CUT_ITEMS_MAX - CUT_ITEMS_MIN) {
          let item = items[cut_count];

          // This condition is a safeguard to prevent infinite loop,
          // which happens if we remove a post on the screen and trigger
          // prefetch in the opposite direction (test it with
          // CUT_ITEMS_MAX=10, CUT_ITEMS_MIN=0)
          if (item.getBoundingClientRect().bottom < -600) {
            let old_height = $('.market-section-wish__item-list').height();
            let old_scroll = $window.scrollTop(); // might change on remove()
            let old_length = items.length;

            $(item).prevAll().remove();

            // Update range for the next time we'll be doing prefetch
            pageState.top_marker = $('.market-section-wish-item:first').data('item-id');

            // update scroll so it would point at the same spot as before
            $window.scrollTop(old_scroll + $('.market-section-wish__item-list').height() - old_height);
            pageState.first_offset += old_length - document.getElementsByClassName('market-section-wish-item').length;

            pageState.reached_start = false;
            reset_loading_placeholders();
          }
        }

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


  // User presses "home" button
  //
  N.wire.on(module.apiPath + ':nav_to_start', function navigate_to_start() {
    // if the first item is already loaded, scroll to the top
    if (pageState.reached_start) {
      $window.scrollTop(0);
      return;
    }

    return N.wire.emit('navigate.to', {
      apiPath: 'market.section.wish',
      params: {
        section_hid: pageState.hid
      }
    });
  });


  // User presses "end" button
  //
  N.wire.on(module.apiPath + ':nav_to_end', function navigate_to_end() {
    // if the last item is already loaded, scroll to the bottom
    if (pageState.reached_end) {
      $window.scrollTop($(document).height());
      return;
    }

    return N.wire.emit('navigate.to', {
      apiPath: 'market.section.wish',
      params: {
        section_hid: pageState.hid,
        $query: {
          from: String($('.market-section-wish').data('last-item-hid'))
        }
      }
    });
  });


  // When user clicks "create dialog" button in usercard popup,
  // add title & link to editor.
  //
  N.wire.before('users.dialog.create:begin', function dialog_create_extend_market_items(params) {
    if (!params || !params.ref) return; // no data to extend
    if (!/^market_section_wish_item:/.test(params.ref)) return; // not our data

    let [ , section_hid, item_hid ] = params.ref.split(':');
    let title = $(`#item${item_hid} .market-section-wish-item__title-text`).text();
    let href  = N.router.linkTo('market.item.wish', { section_hid, item_hid });

    if (title && href) {
      params.text = `Re: [${title}](${href})\n\n`;
    }
  });
});