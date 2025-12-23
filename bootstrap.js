// bootstrap.js: loads the actual app modules with cache-busting
try {
  await import("./firebase.js");
  await import("./ai.js");
  await import("./app.js");
} catch (e) {
  // rethrow so index.html handler shows it
  throw e;
}
