// Create demo market
//
'use strict';


const charlatan = require('charlatan');
const ObjectId  = require('mongoose').Types.ObjectId;


const CATEGORY_COUNT = 5;
const SECTION_COUNT  = 2;
const SUB_SECTION_DEEP = 1;
const ITEM_COUNT_IN_BIG_SECTION = 60;
const USER_COUNT = 10;
const MAX_SUB_SECTION_COUNT = 3;


let config;
let models;
let settings;
let parser;

let display_order = 100;

function getNextDisplayOrder() {
  display_order++;
  return display_order;
}

let users = [];
let postDay = 0;


async function createItemOffer(section) {
  let md = charlatan.Lorem.paragraphs(charlatan.Helpers.rand(5, 1)).join('\n\n');
  let user = users[charlatan.Helpers.rand(USER_COUNT)];

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

  let ts = new Date(2010, 0, postDay++);

  let log10 = Math.log(10);

  // make price with logarithmic distribution
  let price = Math.exp(charlatan.Helpers.rand(Math.log(0.01) * 100000, Math.log(20000) * 100000) / 100000);

  // only keep 2 significant digits
  price -= price % Math.pow(10, Math.ceil(Math.log(price / 100) / log10));

  let currency = charlatan.Helpers.sample(Object.keys(config.market.currencies));
  let rate = await models.market.CurrencyRate.get(currency);

  let item = new models.market.ItemOffer({
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

    st:          models.market.ItemOffer.statuses.VISIBLE,
    section,
    user,

    // don't property randomize this to avoid needless requests
    // to geolocation services
    location:    charlatan.Helpers.sample([ [ 0, 51.5 ], [ -74, 40.7 ], null ]),

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


async function createItemWish(section) {
  let md = charlatan.Lorem.paragraphs(charlatan.Helpers.rand(5, 1)).join('\n\n');
  let user = users[charlatan.Helpers.rand(USER_COUNT)];

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

  let ts = new Date(2010, 0, postDay++);

  let item = new models.market.ItemWish({
    _id:      new ObjectId(Math.round(ts / 1000)),

    html:     result.html,
    md,

    title:    charlatan.Lorem.sentence().slice(0, -1),

    st:       models.market.ItemWish.statuses.VISIBLE,
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
    return;
  }

  for (let i = charlatan.Helpers.rand(MAX_SUB_SECTION_COUNT); i > 0; i--) {
    await createSection(section, sub_section_deep - 1);
  }

  return section;
}


async function updateSectionStat(section) {
  // Clear getSectionTree cache (used in both `updateCache` and `getChildren`
  // functions below).
  //
  models.market.Section.getChildren.clear();

  await models.market.Section.updateCache(section._id);
}


async function fillBigSection(section) {
  for (let i = 0; i < ITEM_COUNT_IN_BIG_SECTION; i++) {
    await createItemWish(section);
  }

  for (let i = 0; i < ITEM_COUNT_IN_BIG_SECTION; i++) {
    await createItemOffer(section);
  }

  await updateSectionStat(section);
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
  let haveBigSection = false;

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
      let s = await createSection(category, SUB_SECTION_DEEP);

      if (!haveBigSection) {
        fillBigSection(s);
        haveBigSection = true;
      }
    }
  }
}


async function createItems() {
  let sections = await models.market.Section.find({ is_category: false })
                             .select('_id cache')
                             .sort({ hid: -1 })
                             .skip(1);

  for (let i = 0; i < sections.length; i++) {
    let section = sections[i];

    // create item
    for (let i = charlatan.Helpers.rand(3); i > 0; i--) {
      await createItemWish(section);
    }

    for (let i = charlatan.Helpers.rand(3); i > 0; i--) {
      await createItemOffer(section);
    }

    await updateSectionStat(section);
  }
}


module.exports = async function (N) {
  config   = N.config;
  models   = N.models;
  settings = N.settings;
  parser   = N.parser;

  await createUsers();
  await createSections();
  await createItems();
};
