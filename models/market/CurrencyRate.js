
'use strict';


const _        = require('lodash');
const cheerio  = require('cheerio');
const needle   = require('needle');
const Mongoose = require('mongoose');
const memoize  = require('promise-memoize');
const Schema   = Mongoose.Schema;

const BASE_CURRENCY = 'EUR';


module.exports = function (N, collectionName) {

  let CurrencyRate = new Schema({
    // request date and time
    ts:    Date,

    // exchange rates date
    date:  Date,

    // rates in form of { RUB: Number, USD: Number }
    rates: Schema.Types.Mixed
  }, {
    versionKey : false
  });

  /////////////////////////////////////////////////////////////////////////////

  /*
   * Get exchange rate between two currencies
   *
   * Params:
   * - from (String) - currency code
   * - to   (String) - currency code (default 'EUR')
   *
   * Returns rate (Number) or 0 if rate is unknown
   */
  const get_rates = memoize(function _get_rates(id) {
    return N.models.market.CurrencyRate.findOne(id).sort('-ts').lean(true)
               .then(res => (res && res.rates || {}));
  }, { maxAge: 5 * 60 * 1000 });

  CurrencyRate.statics.get = async function getRate(from, to) {
    if (from && to && from === to) return 1;

    let rates = await get_rates();
    let result = 1;

    if (from && from !== BASE_CURRENCY) {
      result *= (1 / rates[from]) || 0;
    }

    if (to && to !== BASE_CURRENCY) {
      result *= rates[to] || 0;
    }

    return result;
  };


  /*
   * Update all exchange rates (method is called from cron task)
   */
  let rootUrl = _.get(N.config, 'bind.default.mount', 'http://localhost') + '/';
  let userAgent = `needle/${needle.version} (Nodeca; +${rootUrl})`;

  CurrencyRate.statics.fetch = async function fetch() {
    let response = await needle('get', 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml', {
      headers: { 'User-Agent': userAgent },
      open_timeout: 10000,
      response_timeout: 30000,
      read_timeout: 30000,
      parse_response: false
    });

    if (response.statusCode !== 200) {
      throw new Error(`Wrong HTTP response code: ${response.statusCode}`);
    }

    let tree = cheerio(response.body, { xmlMode: true });

    let date = new Date(tree.find('Cube[time]').attr('time'));
    let rates = {};

    if (!Number.isFinite(+date)) throw new Error('Unable to parse currency rates');

    for (let c of Object.keys(N.config.market.currencies)) {
      if (c === BASE_CURRENCY) continue;

      rates[c] = Number(tree.find(`Cube[currency="${c}"]`).attr('rate'));

      if (!Number.isFinite(rates[c])) throw new Error('Unable to parse currency rates');
    }

    await N.models.market.CurrencyRate.updateOne({}, { ts: new Date(), date, rates }, { upsert: true });
  };


  N.wire.on('init:models', function emit_init_CurrencyRate() {
    return N.wire.emit('init:models.' + collectionName, CurrencyRate);
  });

  N.wire.on('init:models.' + collectionName, function init_model_CurrencyRate(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
