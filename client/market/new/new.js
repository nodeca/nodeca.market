'use strict';


// Knockout bindings root object.
let view = null;


N.wire.on('navigate.preload:' + module.apiPath, function load_deps(preload) {
  preload.push('vendor.knockout');
});


N.wire.on('navigate.done:' + module.apiPath, function page_setup() {
  const ko = require('knockout');

  view = {};

  view.offerTypes = [
    { title: t('offer_sell'), value: 'sell' },
    { title: t('offer_buy'),  value: 'buy' }
  ];

  view.currencyTypes = [
    { title: t('currency_rub'), value: 'RUB' },
    { title: t('currency_usd'), value: 'USD' },
    { title: t('currency_eur'), value: 'EUR' }
  ];

  view.offer = {
    type:           ko.observable(view.offerTypes[0].value),
    title:          ko.observable(''),
    price_value:    ko.observable(''),
    price_currency: ko.observable(view.currencyTypes[0].value),
    section:        ko.observable(''),
    description:    ko.observable(''),
    exchange:       ko.observable(''),
    delivery:       ko.observable(false),
    is_new:         ko.observable(false)
  };

  view.showPreview  = ko.observable(false);
  view.previewHtml  = '<em>TODO: render preview here</em>';
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

  view.preview = function preview() {
    view.showPreview(!view.showPreview());
  };

  view.submit = function submit() {
    let request = {};

    Promise.resolve()
      .then(() => N.io.rpc('admin.new.create', request))
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
