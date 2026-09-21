/**
 * Resolves the clean URLs of the exported panel to the files that hold them.
 *
 * `next build` with `output: 'export'` writes `eventos/editar.html`, and the
 * browser asks for `/eventos/editar`. S3 read through an origin access control
 * is a plain object store — it does not add `.html` and it does not serve
 * `index.html` for a folder, the way S3 website hosting used to. Without this,
 * every page of the panel except the home page is a 404.
 *
 * Runs on the viewer request of the panel behaviour only, so nothing that
 * reaches the API or the public event page goes through it. The first two
 * million invocations a month are free.
 */
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var last = uri.substring(uri.lastIndexOf('/') + 1);

  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  } else if (last.indexOf('.') === -1) {
    request.uri = uri + '.html';
  }

  return request;
}
