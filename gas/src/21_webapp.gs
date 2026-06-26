EvenUp.WebApp = {
  handlePost: function (event) {
    var request = null;
    try {
      request = JSON.parse(event.postData.contents);
      EvenUp.Validation.requireObject(request, "request");
      request.payload = request.payload || {};
      return EvenUp.Response.success(EvenUp.Router.dispatch(request), request.request_id);
    } catch (error) {
      console.error(JSON.stringify({
        code: error.code || "INTERNAL_ERROR",
        request_id: request && request.request_id || null,
        action: request && request.action || null
      }));
      return EvenUp.Response.failure(error, request && request.request_id);
    }
  }
};

function doPost(e) {
  return EvenUp.WebApp.handlePost(e);
}
