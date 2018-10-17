// Popup dialog to show post history
//
'use strict';


const price_format = require('nodeca.market/lib/app/price_format');

let $dialog;


// Load dependencies
//
N.wire.before(module.apiPath, function load_deps() {
  return N.loader.loadAssets('vendor.diff');
});


// Concatenate post and attachment info into diffable string
//
function get_source(post) {
  let result = post.md;

  // make sure source ends with newline
  result = result.replace(/\n?$/, '\n');

  // add attachments
  if (post.files.length) {
    result += '\n';
    result += post.files.map(function (item) {
      return '![](' + N.router.linkTo('core.gridfs', { bucket: item }) + ')';
    }).join('\n');
    result += '\n';
  }

  return result;
}

function get_condition(post) {
  return post.is_new ? t('condition_new') : t('condition_used');
}

function get_delivery(post) {
  return post.delivery ? t('delivery_available') : t('delivery_not_available');
}

function get_price(post) {
  if (!post.price) return '';

  let { value, currency } = post.price;

  let symbol_real = N.runtime.t.exists('market.currencies.' + currency + '.sign') ?
                    N.runtime.t('market.currencies.' + currency + '.sign') :
                    currency;

  return price_format(value, symbol_real);
}


// Input: array of last post states (text, attachments, author, timestamp)
//
// Output: array of diff descriptions (user, timestamp, html diff)
//
function build_diff(history) {
  const { diff, diff_line } = require('nodeca.core/client/vendor/diff/diff');

  let result = [];

  let initial_src = get_source(history[0]);
  let text_diff = diff(initial_src, initial_src);
  let title_diff = diff_line(history[0].title, history[0].title);
  let attr_diffs = [];

  attr_diffs.push([ 'section', history[0].section ]);
  attr_diffs.push([ 'price', get_price(history[0]), get_price(history[0]) ]);
  attr_diffs.push([ 'location', history[0].location ]);
  attr_diffs.push([ 'delivery', get_delivery(history[0]), get_delivery(history[0]) ]);
  attr_diffs.push([ 'barter_info', diff_line(history[0].barter_info, history[0].barter_info) ]);
  attr_diffs.push([ 'condition', get_condition(history[0]), get_condition(history[0]) ]);

  // Get first version for this post (no actual diff)
  result.push({
    user:       history[0].user,
    ts:         history[0].ts,
    text_diff,
    title_diff,
    attr_diffs
  });

  for (let revision = 0; revision < history.length - 1; revision++) {
    let old_post = history[revision];
    let new_post = history[revision + 1];
    let title_diff;

    if (typeof old_post.title !== 'undefined' || typeof new_post.title !== 'undefined') {
      if (old_post.title !== new_post.title) {
        title_diff = diff_line(old_post.title, new_post.title);
      }
    }

    let old_src = get_source(old_post);
    let new_src = get_source(new_post);
    let text_diff;

    if (old_src !== new_src) {
      text_diff = diff(old_src, new_src);
    }

    let attr_diffs = [];

    if (old_post.section !== new_post.section) {
      // just display new value, no actual diff
      attr_diffs.push([ 'section', new_post.section ]);
    }

    let old_price = get_price(old_post);
    let new_price = get_price(new_post);

    if (old_price !== new_price) {
      attr_diffs.push([ 'price', old_price, new_price ]);
    }

    if (JSON.stringify(old_post.location) !== JSON.stringify(new_post.location)) {
      // just display new value, no actual diff
      attr_diffs.push([ 'location', new_post.location ]);
    }

    let old_delivery = get_delivery(old_post);
    let new_delivery = get_delivery(new_post);

    if (old_delivery !== new_delivery) {
      attr_diffs.push([ 'delivery', old_delivery, new_delivery ]);
    }

    if (old_post.barter_info !== new_post.barter_info) {
      attr_diffs.push([ 'barter_info', diff_line(old_post.barter_info, new_post.barter_info) ]);
    }

    let old_condition = get_condition(old_post);
    let new_condition = get_condition(new_post);

    if (old_condition !== new_condition) {
      attr_diffs.push([ 'condition', old_condition, new_condition ]);
    }

    result.push({
      user:       new_post.user,
      ts:         new_post.ts,
      text_diff,
      title_diff,
      attr_diffs
    });
  }

  return result;
}


// Init dialog
//
N.wire.on(module.apiPath, function show_post_history_dlg(params) {
  params.entries = build_diff(params.history);

  $dialog = $(N.runtime.render(module.apiPath, params));
  $('body').append($dialog);

  return new Promise(resolve => {
    $dialog
      .on('shown.bs.modal', function () {
        $dialog.find('.btn-secondary').focus();
      })
      .on('hidden.bs.modal', function () {
        // When dialog closes - remove it from body and free resources.
        $dialog.remove();
        $dialog = null;
        resolve();
      })
      .modal('show');
  });
});


// Close dialog on sudden page exit (if user click back button in browser)
//
N.wire.on('navigate.exit', function teardown_page() {
  if ($dialog) {
    $dialog.modal('hide');
  }
});
