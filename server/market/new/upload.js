// Upload media handler for uploading files via POST request
//

'use strict';


const _           = require('lodash');
const mime        = require('mime-types').lookup;
const path        = require('path');

// TODO: move those into nodeca.users/lib ?
const resize      = require('nodeca.users/models/users/_lib/resize');
const resizeParse = require('nodeca.users/server/_lib/resize_parse');


module.exports = function (N, apiPath) {

  const mediaConfig = resizeParse(N.config.market.uploads);


  N.validate(apiPath, {
    draft_id: { format: 'mongo', required: true },
    file:     { type: 'string',  required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_user_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let can_create_items = await env.extras.settings.fetch('market_can_create_items');

    if (!can_create_items) throw N.io.FORBIDDEN;
  });


  // Find current draft
  //
  N.wire.before(apiPath, async function find_draft(env) {
    env.data.draft = await N.models.market.Draft.findOne()
                               .where('_id').equals(env.params.draft_id)
                               .where('user').equals(env.user_info.user_id);

    if (!env.data.draft) throw N.io.NOT_FOUND;
  });


  // Check file size and type
  //
  N.wire.before(apiPath, async function upload_media(env) {
    let fileInfo = env.req.files.file?.[0];

    if (!fileInfo) throw new Error('No file was uploaded');

    // Usually file size and type are checked on client side,
    // but we must check it on server side for security reasons
    let allowedTypes = _.map(mediaConfig.extensions, ext => mime(ext));

    if (allowedTypes.indexOf(fileInfo.headers['content-type']) === -1) {
      // Fallback attempt: FF can send strange mime,
      // `application/x-zip-compressed` instead of `application/zip`
      // Try to fix it.
      let mimeByExt = mime(path.extname(fileInfo.originalFilename || '').slice(1));

      if (allowedTypes.indexOf(mimeByExt) === -1) {
        throw {
          code: N.io.CLIENT_ERROR,
          message: env.t('err_invalid_ext', { file_name: fileInfo.originalFilename })
        };
      }

      fileInfo.headers['content-type'] = mimeByExt;
    }

    env.data.upload_file_info = fileInfo;
  });


  // Create image/binary (for images previews created automatically)
  //
  N.wire.on(apiPath, async function save_media(env) {
    let fileInfo = env.data.upload_file_info;

    let format = (fileInfo.headers['content-type'] || '').split('/').pop();

    if (!format) {
      format = path.extname(fileInfo.path).replace('.', '').toLowerCase();
    }

    // Check if config for this type exists
    if (!mediaConfig.types[format]) {
      throw new Error(`Can't save file: ${format} is not supported`);
    }

    let typeConfig = mediaConfig.types[format];
    let comment;
    let user = await N.models.users.User.findById(env.user_info.user_id);
    let date = new Date().toISOString().slice(0, 10);

    if (user) {
      let profile = N.router.linkTo('users.member', { user_hid: user.hid });

      comment = `Uploaded by ${user.nick}, ${profile}, ${date}`;
    }

    let data = await resize(
      fileInfo.path,
      {
        store:   N.models.core.FileTmp,
        ext:     format,
        maxSize: typeConfig.max_size || mediaConfig.max_size,
        resize:  typeConfig.resize,
        comment
      }
    );

    env.res.media = {
      image_sizes: data.images,
      media_id: data.id,
      file_size: data.size
    };
  });


  // Attach this file to draft
  //
  N.wire.after(apiPath, async function update_draft(env) {
    env.data.draft.ts = new Date();
    env.data.draft.all_files.push(env.res.media.media_id);
    await env.data.draft.save();
  });
};
