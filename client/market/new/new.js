'use strict';


// Knockout bindings root object.
let view = null;


N.wire.on('navigate.preload:' + module.apiPath, function load_deps(preload) {
  preload.push('vendor.knockout');

  // editor itself is not used, only markdown parser and mdedit cache
  preload.push('mdedit');
});


N.wire.on('navigate.done:' + module.apiPath, function page_setup() {
  const RpcCache = require('nodeca.core/client/mdedit/_lib/rpc_cache')(N);
  const ko = require('knockout');

  let rpc_cache = new RpcCache();

  view = {};

  view.offerTypes = [
    { title: t('offer_sell'), value: 'sell' },
    { title: t('offer_buy'),  value: 'buy' }
  ];

  view.currencyTypes = N.runtime.page_data.currency_types;

  view.offer = {
    type:           ko.observable(view.offerTypes[0].value),
    title:          ko.observable(''),
    price_value:    ko.observable(''),
    price_currency: ko.observable(view.currencyTypes[0].value),
    section:        ko.observable(''),
    description:    ko.observable(''),
    barter_info:    ko.observable(''),
    delivery:       ko.observable(false),
    is_new:         ko.observable(false)
  };

  // force price to be numeric (better to do with extenders, but subscription is easier to do)
  view.offer.price_value.subscribe(v => { view.offer.price_value(Number(v)); });

  view.showPreview  = ko.observable(false);
  view.previewHtml  = ko.observable('');
  view.isSubmitting = ko.observable(false);

  let initialState = ko.observable({});

  view.isDirty = ko.computed({
    read() {
      return initialState() !== ko.toJSON(view.offer);
    },
    write(value) {
      initialState(value ? null : ko.toJSON(view.offer));
    }
  });

  view.isDirty(false);

  function updatePreview() {
    N.parser.md2html({
      text: view.offer.description(),
      attachments: [],
      options: N.runtime.page_data.parse_options,
      rpc_cache
    })
      .then(result => {
        view.previewHtml(result.html);
      })
      // It should never happen
      .catch(err => N.wire.emit('notify', err.message));
  }

  view.preview = function preview() {
    // true - switch to preview mode
    // false - switch back to editing
    let showPreview = !view.showPreview();

    view.showPreview(showPreview);

    if (showPreview) updatePreview();
  };

  rpc_cache.on('update', updatePreview);

  view.submit = function submit() {
    Promise.resolve()
      .then(() => N.io.rpc('market.new.create', ko.toJS(view.offer)))
      .then(() => N.wire.emit('market.index'))
      .catch(err => N.wire.emit('error', err));
  };

  ko.applyBindings(view, $('#market-new-form').get(0));
});


N.wire.on('navigate.exit:' + module.apiPath, function page_exit() {
  const ko = require('knockout');

  ko.cleanNode($('#market-new-form').get(0));
  view = null;
});
