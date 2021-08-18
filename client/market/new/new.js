'use strict';

const _ = require('lodash');
const bag = require('bagjs')({ prefix: 'nodeca' });


// Knockout bindings root object.
let view = null;
let last_used_currency = '';


N.wire.on('navigate.preload:' + module.apiPath, function load_deps(preload) {
  preload.push('vendor.knockout');

  // editor itself is not used, only markdown parser and mdedit cache
  preload.push('mdedit');
});


// Get last currency user selected previously
//
N.wire.before('navigate.done:' + module.apiPath, function load_settings() {
  return bag.get('market_new_item_currency')
    .then(currency => {
      last_used_currency = currency || '';
    })
    .catch(() => {}); // Suppress storage errors
});


N.wire.on('navigate.done:' + module.apiPath, function page_setup() {
  const RpcCache = require('nodeca.core/client/mdedit/_lib/rpc_cache')(N);
  const ko = require('knockout');

  let draft_id;

  let rpc_cache = new RpcCache();

  view = {};

  view.offerTypes = [
    { title: t('offer_sell'), value: 'sell' },
    { title: t('offer_buy'),  value: 'buy' }
  ];

  view.currencyTypes = N.runtime.page_data.currency_types.map(id => ({
    title: t.exists('@market.currencies.' + id + '.sign') ? t('@market.currencies.' + id + '.sign') : id,
    value: id
  }));

  view.router = N.router;

  view.offer = {
    type:           ko.observable(view.offerTypes[0].value),
    title:          ko.observable(''),
    price_value:    ko.observable(''),
    price_currency: ko.observable(last_used_currency),
    section:        ko.observable(''),
    description:    ko.observable(''),
    files:          ko.observableArray(),
    barter_info:    ko.observable(''),
    delivery:       ko.observable(false),
    is_new:         ko.observable(false)
  };

  if (N.runtime.page_data.defaults.section) {
    view.offer.section(N.runtime.page_data.defaults.section);
  }

  if (N.runtime.page_data.defaults.wish) {
    view.offer.type('buy');
  }

  let savedDraft = _.pickBy(ko.toJS(view.offer), v => v !== '');

  if (N.runtime.page_data.draft) {
    draft_id = N.runtime.page_data.draft_id;

    for (let k of Object.keys(N.runtime.page_data.draft)) {
      if (N.runtime.page_data.draft[k] && view.offer[k]) {
        view.offer[k](N.runtime.page_data.draft[k]);
      }
    }
  }

  view.offer.price_currency.subscribe(function (v) {
    bag.set('market_new_item_currency', v)
      .catch(() => {}); // suppress storage errors
  });

  // force price to be numeric (better to do with extenders, but subscription is easier to do)
  view.offer.price_value.subscribe(v => {
    if (v) view.offer.price_value(Number(v));
  });

  view.showPreview  = ko.observable(false);
  view.previewHtml  = ko.observable('');
  view.isSubmitting = ko.observable(false);
  view.showErrors   = ko.observable(false);

  function saveDraft(force) {
    // prevent debounced save when user quits the page
    if (!view) return Promise.resolve();

    let object = _.pickBy(ko.toJS(view.offer), v => v !== '');

    if (JSON.stringify(savedDraft) === JSON.stringify(object) && !force) return Promise.resolve();

    if (draft_id) {
      return N.io.rpc('market.new.draft.update', Object.assign({ draft_id }, object));
    }

    return N.io.rpc('market.new.draft.create', object)
        .then(res => {
          draft_id = res.draft_id;
          savedDraft = JSON.stringify(object);

          return N.wire.emit('navigate.replace', { href: N.router.linkTo('market.new', { draft_id }) });
        });
  }

  let saveDraftDebounced = _.debounce(() => {
    saveDraft().catch(() => { /* ignore */ });
  }, 2000, { leading: false, trailing: true, maxWait: 10000 });

  for (let k of Object.keys(view.offer)) {
    view.offer[k].subscribe(saveDraftDebounced);
  }

  function updatePreview() {
    N.parser.md2html({
      text: view.offer.description(),
      options: N.runtime.page_data.parse_options,
      rpc_cache
    })
      .then(result => {
        view.previewHtml(result.html);
      })
      // It should never happen
      .catch(err => N.wire.emit('notify', err.message));
  }

  function uploadFiles(files) {
    if (files.length === 0) return;

    let promise = Promise.resolve();

    if (!draft_id) {
      promise = promise.then(() => saveDraft(true));
    }

    promise = promise.then(() => {
      let params = {
        files,
        rpc: [ 'market.new.upload', { draft_id } ],
        config: 'users.uploader_config',
        uploaded: null
      };

      return N.wire.emit('users.uploader:add', params)
        .then(() => {
          params.uploaded.reverse().forEach(m => view.offer.files.push(m.media_id));
        });
    });

    promise.catch(err => N.wire.emit('error', err));
  }

  // true - switch to preview mode
  // false - switch back to editing
  // null - toggle mode
  view.togglePreview = function preview(mode) {
    let showPreview = typeof mode === 'boolean' ? mode : !view.showPreview();

    view.showPreview(showPreview);

    if (showPreview) updatePreview();
  };

  rpc_cache.on('update', updatePreview);

  view.attachSetMain = function attach_set_main(a) {
    view.offer.files.remove(a);
    view.offer.files.unshift(a);
  };

  view.attachDelete = function attach_delete(a) {
    view.offer.files.remove(a);
  };

  //
  // Support for re-ordering files using drag and drop,
  // and uploading files when dropping them on attachment div
  //
  let dd_attach_id = null;

  view.attachDragStart = function attach_drag_start(attach) {
    dd_attach_id = attach;
    return true;
  };

  view.attachDragOver = function attach_drag_over(attach, jqEvent) {
    if (jqEvent.originalEvent.dataTransfer.types?.[0] === 'Files') {
      jqEvent.originalEvent.dataTransfer.dropEffect = 'copy';
      return;
    }

    if (dd_attach_id) {
      jqEvent.originalEvent.dataTransfer.dropEffect = 'move';

      if (attach === dd_attach_id) return;

      let index_active = view.offer.files.indexOf(dd_attach_id);
      let index_target = view.offer.files.indexOf(attach);

      if (index_active === -1 || index_target === -1) return;

      if (index_active > index_target) {
        view.offer.files.remove(dd_attach_id);
        view.offer.files.splice(view.offer.files.indexOf(attach), 0, dd_attach_id);
      } else {
        view.offer.files.remove(dd_attach_id);
        view.offer.files.splice(view.offer.files.indexOf(attach) + 1, 0, dd_attach_id);
      }

      return;
    }
  };

  view.attachDrop = function attach_drop(__, jqEvent) {
    dd_attach_id = null;

    if (jqEvent.originalEvent.dataTransfer.files) {
      uploadFiles(jqEvent.originalEvent.dataTransfer.files);
    }
  };

  view.plusDragOver = function file_drag_over(__, jqEvent) {
    if (jqEvent.originalEvent.dataTransfer.types?.[0] === 'Files') {
      jqEvent.originalEvent.dataTransfer.dropEffect = 'copy';
    }
  };

  view.plusDrop = function file_drop(attach, jqEvent) {
    if (jqEvent.originalEvent.dataTransfer.files) {
      uploadFiles(jqEvent.originalEvent.dataTransfer.files);
    }
  };

  view.submitBuy = function submit(form) {
    if (form.checkValidity() === false) {
      view.showErrors(true);
      return;
    }

    view.showErrors(false);
    view.isSubmitting(true);

    let params = {
      draft_id,
      title:          view.offer.title(),
      section:        view.offer.section(),
      description:    view.offer.description()
    };

    Promise.resolve()
      .then(() => N.io.rpc('market.new.create_wish', params))
      .then(res => N.wire.emit('navigate.to', res.redirect_url))
      .catch(err => {
        view.isSubmitting(false);
        N.wire.emit('error', err);
      });
  };

  view.submitSell = function submit(form) {
    if (form.checkValidity() === false) {
      view.showErrors(true);
      return;
    }

    view.showErrors(false);
    view.isSubmitting(true);

    let params = {
      draft_id,
      title:          view.offer.title(),
      price_value:    view.offer.price_value(),
      price_currency: view.offer.price_currency(),
      section:        view.offer.section(),
      description:    view.offer.description(),
      files:          view.offer.files(),
      barter_info:    view.offer.barter_info(),
      delivery:       view.offer.delivery(),
      is_new:         view.offer.is_new()
    };

    Promise.resolve()
      .then(() => N.io.rpc('market.new.create_offer', params))
      .then(res => N.wire.emit('navigate.to', res.redirect_url))
      .catch(err => {
        view.isSubmitting(false);
        N.wire.emit('error', err);
      });
  };

  ko.applyBindings(view, $('#market-new-form').get(0));

  //
  // Set up file upload
  //
  $('#market-new-upload').on('change', function () {
    uploadFiles($(this).get(0).files);
  });
});


N.wire.on('navigate.exit:' + module.apiPath, function page_exit() {
  const ko = require('knockout');

  ko.cleanNode($('#market-new-form').get(0));
  view = null;
});
