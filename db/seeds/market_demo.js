// Create demo market
//
'use strict';


const charlatan   = require('charlatan');
const glob        = require('glob').sync;
const ObjectId    = require('mongoose').Types.ObjectId;
const path        = require('path');
const pump        = require('pump');
const resize      = require('nodeca.users/models/users/_lib/resize');
const resizeParse = require('nodeca.users/server/_lib/resize_parse');


const CATEGORY_COUNT = 5;
const SECTION_COUNT  = 2;
const SUB_SECTION_DEEP = 1;
const MAX_ITEM_COUNT_IN_SECTION = 4;
const ITEM_COUNT_IN_BIG_SECTION = 60;
const CLOSED_ITEM_COUNT = 60;
const USER_COUNT = 10;
const MAX_SUB_SECTION_COUNT = 3;

let fixt_root = path.join(__dirname, 'fixtures', 'market_demo');

const PHOTOS = glob('**', {
  cwd: fixt_root
}).map(name => path.join(fixt_root, name));


let config;
let models;
let settings;
let parser;
let mediaConfig;

let display_order = 100;

function getNextDisplayOrder() {
  display_order++;
  return display_order;
}

let files = [];
let users = [];
let post_count = 0;


// resize all fixtures only once on start,
// then just copy files as is when creating items
async function createTmpPhotos() {
  for (let file of PHOTOS) {
    let format = path.extname(file).replace('.', '').toLowerCase();
    let typeConfig = mediaConfig.types[format];

    if (!typeConfig) continue;

    let data = await resize(
      file,
      {
        store:   models.core.FileTmp,
        ext:     format,
        maxSize: typeConfig.max_size || mediaConfig.max_size,
        resize:  typeConfig.resize
      }
    );

    files.push(data.id);
  }
}


async function removeTmpPhotos() {
  for (let file of files) await models.core.FileTmp.remove(file, true);
}


async function createRandomPhoto() {
  let uploadSizes = Object.keys(mediaConfig.resize);
  let new_id = new ObjectId();
  let file = files[charlatan.Helpers.rand(files.length)];

  for (let size of uploadSizes) {
    let info = await models.core.FileTmp.getInfo(file + (size === 'orig' ? '' : '_' + size));

    let params = { contentType: info.contentType };

    if (size === 'orig') {
      params._id = new_id;
    } else {
      params.filename = new_id + '_' + size;
    }

    await pump(
      models.core.FileTmp.createReadStream(file + (size === 'orig' ? '' : '_' + size)),
      models.core.File.createWriteStream(params)
    );
  }

  return new_id;
}


async function createItemOffer(section, user, isClosed = false) {
  let md = charlatan.Lorem.paragraphs(charlatan.Helpers.rand(5, 1)).join('\n\n');

  let options = await settings.getByCategory(
    'market_items_markup',
    { usergroup_ids: user.usergroups },
    { alias: true }
  );

  let result = await parser.md2html({
    text: md,
    attachments: [],
    options
  });

  let ts;

  if (isClosed) {
    // start from a week ago, each item adds one hour;
    // needs to be relatively recent to show up in "recently closed"
    ts = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + post_count++ * 60 * 60 * 1000);
  } else {
    // start from yesterday, each item adds one minute;
    // can't go too far back because items will get auto-closed in a month
    ts = new Date(Date.now() - 24 * 60 * 60 * 1000 + post_count++ * 60 * 1000);
  }

  let log10 = Math.log(10);

  // make price with logarithmic distribution
  let price = Math.exp(charlatan.Helpers.rand(Math.log(0.01) * 100000, Math.log(20000) * 100000) / 100000);

  // only keep 2 significant digits
  price -= price % Math.pow(10, Math.ceil(Math.log(price / 100) / log10));

  let currency = charlatan.Helpers.sample(Object.keys(config.market.currencies));
  let rate = await models.market.CurrencyRate.get(currency);

  let item = new (isClosed ? models.market.ItemOfferArchived : models.market.ItemOffer)({
    _id:         new ObjectId(Math.round(ts / 1000)),

    html:        result.html,
    md,

    title:       charlatan.Lorem.sentence().slice(0, -1),

    price:   {
      value:     price,
      currency:  charlatan.Helpers.sample(Object.keys(config.market.currencies))
    },
    base_currency_price: price * rate,

    barter_info: charlatan.Helpers.rand(3) ? null : charlatan.Lorem.sentence().slice(0, -1),
    delivery:    charlatan.Helpers.sample([ true, false, false ]),
    is_new:      charlatan.Helpers.sample([ true, true, false ]),

    st:          isClosed ? models.market.ItemOffer.statuses.CLOSED : models.market.ItemOffer.statuses.OPEN,
    section,
    user,

    files: [ await createRandomPhoto() ],

    // don't property randomize this to avoid needless requests
    // to geolocation services
    location:    charlatan.Helpers.sample([ [ 0, 51.5 ], [ -74, 40.7 ] ]),

    /*eslint-disable new-cap*/
    ip:          charlatan.Internet.IPv4(),

    ts
  });

  // params_ref will be generated automatically by the hook,
  // specifying params in constructor doesn't work 'cause params is not in the model
  item.params = options;

  await item.save();

  return item;
}


async function createItemWish(section, user, isClosed = false) {
  let md = charlatan.Lorem.paragraphs(charlatan.Helpers.rand(5, 1)).join('\n\n');

  let options = await settings.getByCategory(
    'market_items_markup',
    { usergroup_ids: user.usergroups },
    { alias: true }
  );

  let result = await parser.md2html({
    text: md,
    attachments: [],
    options
  });

  let ts;

  if (isClosed) {
    // start from a week ago, each item adds one hour;
    // needs to be relatively recent to show up in "recently closed"
    ts = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + post_count++ * 60 * 60 * 1000);
  } else {
    // start from yesterday, each item adds one minute;
    // can't go too far back because items will get auto-closed in a month
    ts = new Date(Date.now() - 24 * 60 * 60 * 1000 + post_count++ * 60 * 1000);
  }

  let item = new (isClosed ? models.market.ItemWishArchived : models.market.ItemWish)({
    _id:      new ObjectId(Math.round(ts / 1000)),

    html:     result.html,
    md,

    title:    charlatan.Lorem.sentence().slice(0, -1),

    st:       isClosed ? models.market.ItemWish.statuses.CLOSED : models.market.ItemWish.statuses.OPEN,
    section,
    user,

    // don't property randomize this to avoid needless requests
    // to geolocation services
    location: charlatan.Helpers.sample([ [ 50, 0 ], [ 40.7, -74 ], null ]),

    /*eslint-disable new-cap*/
    ip:       charlatan.Internet.IPv4(),

    ts
  });

  // params_ref will be generated automatically by the hook,
  // specifying params in constructor doesn't work 'cause params is not in the model
  item.params = options;

  await item.save();

  return item;
}


async function createSection(category, sub_section_deep) {
  let section = new models.market.Section({
    title: charlatan.Lorem.sentence(2, false, 4).slice(0, -1),
    parent: category._id,
    display_order: getNextDisplayOrder()
  });

  await section.save();

  // add sub-sections
  if (!sub_section_deep || charlatan.Helpers.rand(3) === 2) {
    return section;
  }

  for (let i = charlatan.Helpers.rand(MAX_SUB_SECTION_COUNT); i > 0; i--) {
    await createSection(section, sub_section_deep - 1);
  }

  return section;
}


async function fillSection(section, count) {
  for (let i = 0; i < count; i++) {
    await createItemOffer(section, users[charlatan.Helpers.rand(USER_COUNT)]);
    await createItemWish(section, users[charlatan.Helpers.rand(USER_COUNT)]);
  }
}


async function createUsers() {
  let userGroupsByName = {};
  let groups = await models.users.UserGroup.find().select('_id short_name');

  // collect usergroups
  groups.forEach(function (group) {
    userGroupsByName[group.short_name] = group;
  });

  for (let i = 0; i < USER_COUNT; i++) {
    let user = new models.users.User({
      first_name: charlatan.Name.firstName(),
      last_name:  charlatan.Name.lastName(),
      nick:       charlatan.Internet.userName(),
      email:      charlatan.Internet.email(),
      joined_ts:  new Date(),
      joined_ip:  charlatan.Internet.IPv4(),
      usergroups: userGroupsByName.members,
      active:     true
    });

    await user.save();

    // add user to store
    users.push(user);
  }
}


async function createSections() {
  for (let i = 0; i < CATEGORY_COUNT; i++) {
    let category = new models.market.Section({
      title: charlatan.Lorem.sentence(2, false, 2).slice(0, -1),
      description: charlatan.Lorem.sentence(),

      display_order: getNextDisplayOrder('display_order'),
      is_category: true
    });

    await category.save();

    // create sections
    for (let j = 0; j < SECTION_COUNT; j++) {
      await createSection(category, SUB_SECTION_DEEP);
    }
  }
}


async function createItems() {
  let sections = await models.market.Section.find({ is_category: false })
                             .select('_id cache')
                             .sort('hid')
                             .lean(true);

  // first section has a lot of items, others up to 3
  await fillSection(sections[0], ITEM_COUNT_IN_BIG_SECTION);

  for (let i = 1; i < sections.length; i++) {
    await fillSection(sections[i], charlatan.Helpers.rand(MAX_ITEM_COUNT_IN_SECTION));
  }
}


// Create closed items for a user
//
async function createClosedItems(user) {
  let sections = await models.market.Section.find({ is_category: false })
                             .select('_id cache')
                             .sort('hid')
                             .lean(true);

  createItemOffer(sections[0], user);
  createItemWish(sections[0], user);

  for (let i = 0; i < CLOSED_ITEM_COUNT; i++) {
    await createItemOffer(sections[charlatan.Helpers.rand(sections.length)], user, true);
    await createItemWish(sections[charlatan.Helpers.rand(sections.length)], user, true);
  }
}


module.exports = async function (N) {
  config      = N.config;
  models      = N.models;
  settings    = N.settings;
  parser      = N.parser;
  mediaConfig = resizeParse(N.config.market.uploads);

  await createTmpPhotos();
  await createUsers();

  // only create sections if none exist
  // (they can be created in migration or during re-runs)
  if (!await models.market.Section.findOne({ is_category: false }).lean(true)) {
    await createSections();
  }

  await createItems();
  await createClosedItems(users[0]);

  // update cache for all sections
  let sections = await models.market.Section.find({ is_category: false })
                             .select('_id')
                             .sort('-hid')
                             .lean(true);

  for (let section of sections) models.market.Section.updateCache(section._id);

  await removeTmpPhotos();
};
